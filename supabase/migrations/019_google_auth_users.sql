-- Phase: Google login. Run in Supabase SQL Editor AFTER 018. Re-runnable.
--
-- The app now authenticates with Google (email) instead of phone OTP. Two changes:
--   1. public.users.phone was `not null unique` (phone-only assumption) — make it
--      nullable and add an email column, so a Google user (no phone) can be created.
--   2. Update the auth→public sync trigger to copy email (and phone if present).

alter table public.users alter column phone drop not null;
alter table public.users add column if not exists email text;

-- Unique email when present (multiple NULLs allowed; legacy phone-only rows are NULL).
create unique index if not exists users_email_unique on public.users (email) where email is not null;

-- Keep public.users in sync with auth.users for BOTH phone-OTP (legacy) and Google.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, phone, email, phone_verified)
  values (
    new.id,
    new.phone,
    new.email,
    new.phone_confirmed_at is not null
  )
  on conflict (id) do update
    set phone          = coalesce(new.phone, public.users.phone),
        email          = coalesce(new.email, public.users.email),
        phone_verified = new.phone_confirmed_at is not null;
  return new;
end;
$$;

-- Trigger already exists from 002 (on_auth_user_created); function replaced above.
