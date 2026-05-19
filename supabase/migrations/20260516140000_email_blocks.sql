-- Block-based email builder. Replaces hand-rolled HTML strings (fan-ode,
-- coupon, etc.) and the campaign rich-text body with a structured array
-- of blocks (heading / paragraph / image / button / separator). One
-- global header + footer applies to every template; per-template blocks
-- carry the unique body.

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- Free-form. Used by the editor and by the cron/script callers to
  -- look up the template (e.g. renderTemplate("fan-ode", vars)).
  kind text not null default 'transactional',  -- 'transactional' or 'campaign'
  body_blocks jsonb not null default '[]'::jsonb,
  -- subject_template / preheader_template let transactional templates
  -- carry their own copy alongside the body. Variables work via
  -- {{ name }} substitution at render time.
  subject_template text not null default '',
  preheader_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
drop policy if exists "Admin all email_templates" on public.email_templates;
create policy "Admin all email_templates" on public.email_templates
  for all to authenticated using (true) with check (true);

grant all on public.email_templates to service_role;
grant select, insert, update, delete on public.email_templates to authenticated;

-- Singleton row for header/footer. Always id = 1 by convention; the
-- only_one_globals trigger keeps it that way.
create table if not exists public.email_globals (
  id int primary key default 1 check (id = 1),
  header_blocks jsonb not null default '[]'::jsonb,
  footer_blocks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.email_globals enable row level security;
drop policy if exists "Admin all email_globals" on public.email_globals;
create policy "Admin all email_globals" on public.email_globals
  for all to authenticated using (true) with check (true);

grant all on public.email_globals to service_role;
grant select, insert, update, delete on public.email_globals to authenticated;

-- Seed the singleton row + default header/footer. Footer holds the
-- support line + a {{ unsubscribe_url }}-driven block (block hides
-- itself if the variable is empty, so transactional sends stay clean).
insert into public.email_globals (id, header_blocks, footer_blocks)
values (
  1,
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'separator',
      'height', 32
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', 'Customer support: <a href="mailto:portal@chadlewine.com" style="color:#8b9cf7;">portal@chadlewine.com</a>',
      'size', 'small'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', '<a href="{{ unsubscribe_url }}" style="color:#8b9cf7;">Unsubscribe</a>',
      'size', 'small',
      'hidden_if_unset_var', 'unsubscribe_url'
    )
  )
)
on conflict (id) do nothing;

-- Seed the fan-ode template, matching the existing buildFanOdeEmailHtml
-- output (eyebrow + h1 + intro + button + footnote).
insert into public.email_templates (slug, name, kind, subject_template, preheader_template, body_blocks)
values (
  'fan-ode',
  'Fan-ode drip',
  'transactional',
  'An ode to the fan — a song for you',
  'A song made for you. Yours.',
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', 'A GIFT FOR YOU',
      'size', 'eyebrow'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'heading',
      'level', 1,
      'text', 'An ode to the fan'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', '{{ first_name_clause }}you bought something yesterday &mdash; a real thing from a real person. I made you a song. It''s yours.'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'separator',
      'height', 16
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'button',
      'label', 'Listen now',
      'url', 'https://chadlewine.com/fan-song?token={{ token }}'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'separator',
      'height', 24
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', 'This link is yours alone. Save it. The song lives at the link as long as it''s the current ode.',
      'size', 'small'
    )
  )
)
on conflict (slug) do nothing;

-- Add body_blocks to campaigns so the unified editor can drive sends.
-- body_html stays for backwards-compat with already-sent rows; new
-- sends prefer body_blocks if present.
alter table public.campaigns
  add column if not exists body_blocks jsonb;
