-- Fix: "insert or update on profiles violates foreign key constraint
-- profiles_user_id_fkey" when creating a Kundli.
--
-- Cause: profiles.user_id references public.users(id). That public.users row is
-- meant to be created automatically when an auth user signs up (migration 002's
-- trigger). If the referral-code trigger from 001 errors during that insert
-- (the old pgcrypto/search_path bug — same class as the 003 "signup 500"), or
-- the sync trigger isn't installed on the project, the public.users row is never
-- created and every profile insert fails the FK.
--
-- This re-asserts both triggers safely and backfills any auth user that is
-- currently missing its public.users row. Re-runnable.

-- (a) Referral-code generator that does NOT depend on pgcrypto's search_path
--     (uses core gen_random_uuid instead of extensions.gen_random_bytes).
create or replace function public.generate_referral_code()
returns trigger language plpgsql set search_path = public as $$
declare code text;
begin
  loop
    code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
    exit when not exists (select 1 from public.users where referral_code = code);
  end loop;
  new.referral_code := code;
  return new;
end $$;

-- (b) auth.users → public.users sync (re-assert migration 002 so new signups
--     always get a public.users row).
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, phone, phone_verified)
  values (new.id, new.phone, new.phone_confirmed_at is not null)
  on conflict (id) do update set phone_verified = new.phone_confirmed_at is not null;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_auth_user();

-- (c) Backfill: create a public.users row for every auth user that lacks one.
--     This is the immediate unblock for the FK error.
insert into public.users (id, phone, phone_verified)
select au.id, au.phone, (au.phone_confirmed_at is not null)
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null
on conflict (id) do nothing;
