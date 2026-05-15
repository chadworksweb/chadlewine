-- Keep audience.email in sync with auth.users.email.
-- Fires after Supabase confirms a secure-email-change (auth.users.email
-- updates only after the user clicks the confirmation link from their new
-- inbox). The audience.email column is unique, so a colliding rename will
-- raise; that surfaces to Supabase as a failed confirmation, which is the
-- intentionally-loud behavior. Admin can manually merge audience rows.

create or replace function public.handle_auth_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and old.email is distinct from new.email then
    update public.audience
      set email = lower(new.email), updated_at = now()
      where user_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_auth_email_change();
