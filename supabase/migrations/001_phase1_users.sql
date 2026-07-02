-- Phase 1: Users table + RLS
-- Run this in Supabase SQL editor (Dashboard → SQL Editor).

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── USERS ────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  phone           text unique not null,
  phone_verified  bool not null default false,
  referral_code   text unique,
  referred_by     uuid references public.users(id) on delete set null
);

-- Generate a unique 8-char referral code on insert
create or replace function public.generate_referral_code()
returns trigger language plpgsql as $$
declare
  code text;
begin
  loop
    code := upper(substring(encode(gen_random_bytes(6), 'base64') from 1 for 8));
    -- Remove chars that look alike (0/O, 1/I/l)
    code := replace(replace(replace(replace(code, '0', 'A'), 'O', 'B'), '1', 'C'), 'I', 'D');
    exit when not exists (select 1 from public.users where referral_code = code);
  end loop;
  new.referral_code := code;
  return new;
end;
$$;

create trigger trg_users_referral_code
  before insert on public.users
  for each row
  when (new.referral_code is null)
  execute function public.generate_referral_code();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.users enable row level security;

-- Users can read their own row
create policy "users: select own"
  on public.users for select
  using (id = auth.uid());

-- Users can update their own row (phone_verified, etc.)
-- But NOT referral_code or referred_by — those are service-role only
create policy "users: update own"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- New user row inserted by Edge Function (service role) after OTP verification
-- No client INSERT policy — the edge function uses the service role key

-- ─── EVENTS (analytics) ───────────────────────────────────────────────────────
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid references public.users(id) on delete set null,
  name       text not null,
  props      jsonb not null default '{}'
);

alter table public.events enable row level security;

-- Client can insert its own events
create policy "events: insert own"
  on public.events for insert
  with check (user_id = auth.uid() or user_id is null);

-- Client cannot read events (analytics only server-side)
-- (no select policy → no access)
