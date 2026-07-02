-- Phase 1 (addendum): auto-sync auth.users → public.users
-- Run this AFTER 001_phase1_users.sql in Supabase SQL Editor.

-- When Supabase creates a new auth user (after OTP verify),
-- automatically insert a matching row into public.users.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, phone, phone_verified)
  values (
    new.id,
    new.phone,
    new.phone_confirmed_at is not null
  )
  on conflict (id) do update
    set phone_verified = new.phone_confirmed_at is not null;
  return new;
end;
$$;

-- Drop trigger first so this script is re-runnable
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert or update on auth.users
  for each row
  execute function public.handle_new_auth_user();
