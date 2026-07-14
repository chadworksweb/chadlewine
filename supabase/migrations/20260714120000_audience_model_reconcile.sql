-- Audience model reconcile
-- Four fixes to the status/score model, found 2026-07-14.
--
-- 1. compute_engagement_score ignored purchases entirely, so a
--    customer who bought 8 days ago scored 'inactive' for not
--    clicking a newsletter link. Buying is the outcome the emails
--    exist to produce and is stronger evidence than any click.
-- 2. refresh_audience_tags never deleted 'engaged:unknown', so the
--    tag accumulated forever. 48 of 50 rows carried it while only 2
--    actually scored unknown, most of them alongside 'engaged:high'.
-- 3. The audience_id foreign keys had no ON DELETE action, so
--    deleting any contact who had ever been emailed failed with
--    23503. The admin delete route's own comment claims it "sets
--    audience_id null on subscribers/orders/purchases/campaign_sends"
--    -- this is the schema finally doing what that comment says.
-- 4. subscriber_status was plain text with no CHECK, so a typo (or a
--    plausible-looking value like 'dormant') wrote silently and then
--    vanished from every admin tab.

-- ---------------------------------------------------------------
-- 1. Engagement score now recognises purchases.
-- ---------------------------------------------------------------
-- Ladder, best to worst:
--   high      bought or clicked within 90 days
--   medium    opened within 90 days (unreachable today: the Resend
--             webhook deliberately does not mirror opens, since
--             opens are Apple-MPP noise. Kept for when it does.)
--   low       opened at some point, OR ever bought, OR too early to
--             judge (1-2 sends, no click)
--   inactive  3+ sends, never clicked, never bought
--   unknown   never sent anything and never bought ("new")
--
-- Note what 'inactive' now means: never clicked AND never bought.
-- That is exactly the burn criterion, so the model states it
-- directly instead of callers hand-carving lifetime_orders out.
create or replace function public.compute_engagement_score(p_audience_id uuid)
returns text language plpgsql as $$
declare a record;
begin
  select * into a from public.audience where id = p_audience_id;
  if not found then return 'unknown'; end if;

  -- A purchase outranks everything, including "never emailed".
  if a.last_purchase_at is not null
     and a.last_purchase_at > now() - interval '90 days' then
    return 'high';
  end if;

  if a.emails_received = 0 and coalesce(a.lifetime_orders, 0) = 0 then
    return 'unknown';
  end if;

  if a.last_clicked_at is not null
     and a.last_clicked_at > now() - interval '90 days' then
    return 'high';
  end if;

  if a.last_opened_at is not null
     and a.last_opened_at > now() - interval '90 days' then
    return 'medium';
  end if;

  if a.emails_opened > 0 then
    return 'low';
  end if;

  -- Ever bought: past customer, never dead weight.
  if coalesce(a.lifetime_orders, 0) > 0 then
    return 'low';
  end if;

  if a.emails_received >= 3 then
    return 'inactive';
  end if;

  return 'low';
end $$;

-- ---------------------------------------------------------------
-- 2. Tag refresh: clean every engaged:* tag, not just some.
-- ---------------------------------------------------------------
-- The old delete list covered engaged:high/medium/low/inactive but
-- omitted engaged:unknown, which is why rows ended up holding two
-- contradictory engagement tags at once.
create or replace function public.refresh_audience_tags(p_audience_id uuid)
returns void language plpgsql as $$
declare
  a record;
  v_score text;
begin
  select * into a from public.audience where id = p_audience_id;
  if not found then return; end if;

  v_score := public.compute_engagement_score(p_audience_id);
  update public.audience set engagement_score = v_score, updated_at = now()
    where id = p_audience_id;

  delete from public.audience_tags
    where audience_id = p_audience_id
      and (
        tag like 'engaged:%'
        or tag like 'customer%'
        or tag like 'buyer:%'
        or tag like 'subscriber:%'
      );

  if a.lifetime_orders > 0 then
    insert into public.audience_tags (audience_id, tag)
      values (p_audience_id, 'customer');
    if a.last_purchase_at is not null
       and a.last_purchase_at > now() - interval '90 days' then
      insert into public.audience_tags values (p_audience_id, 'customer:recent', now());
    else
      insert into public.audience_tags values (p_audience_id, 'customer:past', now());
    end if;
    if a.lifetime_orders >= 2 then
      insert into public.audience_tags values (p_audience_id, 'buyer:repeat', now());
    end if;
    if exists (
      select 1 from public.purchases p
      where p.audience_id = p_audience_id
        and p.item_type in ('song','album','ringtone','track')
    ) then
      insert into public.audience_tags values (p_audience_id, 'buyer:digital', now());
    end if;
    if exists (
      select 1 from public.purchases p
      where p.audience_id = p_audience_id
        and p.item_type in ('merch','art_original')
    ) then
      insert into public.audience_tags values (p_audience_id, 'buyer:physical', now());
    end if;
  end if;

  if a.subscriber_status = 'active' then
    insert into public.audience_tags values (p_audience_id, 'subscriber:active', now());
  elsif a.subscriber_status = 'unsubscribed' then
    insert into public.audience_tags values (p_audience_id, 'subscriber:past', now());
  end if;

  insert into public.audience_tags values (p_audience_id, 'engaged:' || v_score, now())
    on conflict do nothing;
end $$;

-- ---------------------------------------------------------------
-- 3. audience_id FKs: ON DELETE SET NULL.
-- ---------------------------------------------------------------
-- Deleting a contact must not destroy campaign history. The send
-- row keeps its own email column, so the record of who was mailed
-- and who clicked survives the person's removal.
alter table public.campaign_sends
  drop constraint if exists campaign_sends_audience_id_fkey;
alter table public.campaign_sends
  add constraint campaign_sends_audience_id_fkey
  foreign key (audience_id) references public.audience(id)
  on delete set null;

alter table public.subscribers
  drop constraint if exists subscribers_audience_id_fkey;
alter table public.subscribers
  add constraint subscribers_audience_id_fkey
  foreign key (audience_id) references public.audience(id)
  on delete set null;

alter table public.orders
  drop constraint if exists orders_audience_id_fkey;
alter table public.orders
  add constraint orders_audience_id_fkey
  foreign key (audience_id) references public.audience(id)
  on delete set null;

alter table public.purchases
  drop constraint if exists purchases_audience_id_fkey;
alter table public.purchases
  add constraint purchases_audience_id_fkey
  foreign key (audience_id) references public.audience(id)
  on delete set null;

-- ---------------------------------------------------------------
-- 4. subscriber_status: constrain to the real vocabulary.
-- ---------------------------------------------------------------
-- never        in the DB but never opted in (legacy backfill)
-- pending      opted in, not yet confirmed
-- active       mailable
-- unsubscribed opted out; the row IS the suppression record
--
-- 'dormant' is deliberately NOT here. It was proposed as an
-- archive-first hardening but never implemented, and nothing reads
-- it -- a row set to dormant would drop out of every admin tab.
-- If archive-first is revived, add it here and to the UI together.
alter table public.audience
  drop constraint if exists audience_subscriber_status_check;
alter table public.audience
  add constraint audience_subscriber_status_check
  check (subscriber_status in ('never','pending','active','unsubscribed'));

-- ---------------------------------------------------------------
-- 5. Backfill: recompute every row against the fixed functions.
-- ---------------------------------------------------------------
-- Rescores with purchases recognised and clears the accumulated
-- stale engaged:* tags. Safe to re-run.
do $$
declare r record;
begin
  for r in select id from public.audience loop
    perform public.refresh_audience_tags(r.id);
  end loop;
end $$;
