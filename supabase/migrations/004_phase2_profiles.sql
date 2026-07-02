-- Phase 2: profiles (birth details) + cached Kundli
-- Run in Supabase SQL Editor AFTER 001, 002, 003. Re-runnable.
--
-- One user can have multiple profiles (self + family later). The Kundli is cached
-- directly on the row (kundli_chart/summary) so we never recompute — protects
-- margins once a real paid Kundli API is wired in (non-negotiable rule #4).

create table if not exists public.profiles (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  name               text not null,
  gender             text not null check (gender in ('male','female','other')),
  dob                date not null,                 -- date of birth (YYYY-MM-DD)
  tob                time not null,                 -- time of birth (24h)
  birth_place        text not null,
  latitude           double precision not null,
  longitude          double precision not null,
  timezone           text not null default 'Asia/Kolkata',
  -- Cached Kundli (written by kundliService)
  kundli_chart       jsonb,
  kundli_summary     text,
  kundli_source      text,                          -- 'mock' | 'prokerala' | 'vedicastroapi'
  kundli_computed_at timestamptz
);

create index if not exists idx_profiles_user_id on public.profiles(user_id);

-- keep updated_at fresh on every update
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─── RLS: a user can only touch their own profiles ────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own" on public.profiles
  for select using (user_id = auth.uid());

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check (user_id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "profiles: delete own" on public.profiles;
create policy "profiles: delete own" on public.profiles
  for delete using (user_id = auth.uid());
