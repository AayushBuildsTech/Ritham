-- Migration 016: VedAstro rich Kundli integration
-- Run in the Supabase SQL Editor AFTER 001–015. Re-runnable (idempotent).
--
-- VedAstro (api.vedastro.org, Swiss Ephemeris) becomes the source of truth for the
-- Kundli behind kundliService (spec §0). The rich chart is stored INSIDE the existing
-- profiles.kundli_chart JSONB (as `chart_facts`) + the dense render in kundli_summary
-- — so NO new kundli table and NO schema change to profiles is needed. This migration
-- only adds (a) a simple VedAstro call counter (§8) and (b) a per-profile column on the
-- horoscopes cache so horoscopes can be transit-aware (§2). kundli_source is free text
-- already, so 'vedastro' needs no constraint change.

-- ─────────────────────────────────────────────────────────────────────────────
-- (a) VedAstro usage counter (spec §8: a simple counter, not a quota system)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.vedastro_usage (
  date_key   text primary key,          -- 'YYYY-MM-DD' (server date)
  count      integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Race-safe increment used by the Edge Functions (service role) after each VedAstro call.
create or replace function public.bump_vedastro_usage(n integer default 1)
returns void language sql
set search_path = public
as $$
  insert into public.vedastro_usage(date_key, count, updated_at)
  values (to_char(now(), 'YYYY-MM-DD'), n, now())
  on conflict (date_key) do update
    set count = public.vedastro_usage.count + excluded.count,
        updated_at = now();
$$;

-- RLS: no client access at all — only the service role (Edge Functions) touches it.
alter table public.vedastro_usage enable row level security;
-- (no policies → authenticated clients cannot read/write; service role bypasses RLS)

-- ─────────────────────────────────────────────────────────────────────────────
-- (b) Per-profile, transit-aware horoscopes (spec §2)
-- ─────────────────────────────────────────────────────────────────────────────
-- Old model: one shared row per (sign, period, period_key). New model: one row per
-- (profile_id, period, period_key) so a horoscope can reference THIS person's dasha and
-- current gochar. `sign` stays populated for back-compat/analytics. Still generated at
-- most once per profile per period (rule #4 margins hold — it's a cache, not per-view).
alter table public.horoscopes
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade;

create unique index if not exists uq_horoscope_profile_period_key
  on public.horoscopes(profile_id, period, period_key)
  where profile_id is not null;
