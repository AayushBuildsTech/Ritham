-- Phase 5: Home horoscopes (cached daily/weekly/monthly)
-- Run in Supabase SQL Editor AFTER 001–006. Re-runnable.
--
-- Margin protection (non-negotiable rule #4): a horoscope is cached ONCE per
-- (Rashi/Moon sign, period, period_key) and SHARED across every user with that
-- sign. So at most 12 signs × 3 periods are ever generated per period — not one
-- per user. The Edge Function (service role) is the only writer; it generates on
-- a cache miss and inserts here.
--
--   period      : 'daily' | 'weekly' | 'monthly'
--   period_key  : IST-based bucket — daily 'YYYY-MM-DD', weekly 'YYYY-Www',
--                 monthly 'YYYY-MM'. (Asia/Kolkata — all users are in India.)
--   sign        : the Moon sign string exactly as stored on the Kundli
--                 (e.g. 'Cancer (Karka)').

create table if not exists public.horoscopes (
  id          uuid primary key default gen_random_uuid(),
  sign        text not null,
  period      text not null check (period in ('daily','weekly','monthly')),
  period_key  text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- One cached horoscope per sign+period+bucket (also the upsert conflict target).
create unique index if not exists uq_horoscope_sign_period_key
  on public.horoscopes(sign, period, period_key);

-- ─── RLS: shared, non-sensitive content — any signed-in user may read; only the
--         service role (Edge Function) writes. ────────────────────────────────
alter table public.horoscopes enable row level security;

drop policy if exists "horoscopes: read for authenticated" on public.horoscopes;
create policy "horoscopes: read for authenticated" on public.horoscopes
  for select to authenticated using (true);
-- No client insert/update/delete: generation happens only in the Edge Function.
