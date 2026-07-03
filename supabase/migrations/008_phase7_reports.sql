-- Phase 7: Paid PDF reports (Vastu first; Matchmaking later)
-- Run in Supabase SQL Editor AFTER 001–007. Re-runnable.
--
-- A report is a one-time paid purchase (Vastu ₹149 / Matchmaking ₹199), gated
-- behind a verified Razorpay payment (Phase 4). Money flow reuses payment_orders
-- + entitlements_ledger — we just allow a new kind 'report'. The generated report
-- content is cached in public.reports (rule #4: one purchase = one stored report).
--
-- Vastu is property-based: the user uploads a floor plan (Storage) + answers a
-- questionnaire; an Edge Function sends the plan image + answers to Claude (vision)
-- and stores the branded HTML here.

-- ─── allow the 'report' kind on the money tables ──────────────────────────────
alter table public.payment_orders      drop constraint if exists payment_orders_kind_check;
alter table public.payment_orders      add  constraint payment_orders_kind_check
  check (kind in ('questions','time','report'));

alter table public.entitlements_ledger drop constraint if exists entitlements_ledger_kind_check;
alter table public.entitlements_ledger add  constraint entitlements_ledger_kind_check
  check (kind in ('questions','time','report'));

-- ─── reports (working data + cached generated HTML) ───────────────────────────
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  order_id       uuid references public.payment_orders(id) on delete set null,
  entitlement_id uuid references public.entitlements_ledger(id) on delete set null,
  type           text not null check (type in ('vastu','matchmaking')),
  status         text not null default 'draft' check (status in ('draft','generating','ready','failed')),
  answers        jsonb,                         -- questionnaire responses
  floorplan_path text,                          -- Storage path (vastu)
  partner        jsonb,                         -- partner birth details (matchmaking, later)
  chart_style    text not null default 'north', -- user-chosen: 'north' | 'south' (matchmaking)
  html           text,                          -- cached generated report (branded HTML)
  score          integer,                       -- vaastu health score / compatibility %
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_reports_user on public.reports(user_id);

drop trigger if exists trg_reports_updated_at on public.reports;
create trigger trg_reports_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

-- ─── RLS: a user only sees/edits their own reports; the Edge Function (service
--         role) writes the generated html/score/status. ───────────────────────
alter table public.reports enable row level security;

drop policy if exists "reports: select own" on public.reports;
create policy "reports: select own" on public.reports
  for select using (user_id = auth.uid());

drop policy if exists "reports: insert own" on public.reports;
create policy "reports: insert own" on public.reports
  for insert with check (user_id = auth.uid());

drop policy if exists "reports: update own" on public.reports;
create policy "reports: update own" on public.reports
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Storage bucket for floor plans (private, user-scoped by first folder) ─────
insert into storage.buckets (id, name, public)
  values ('reports', 'reports', false)
  on conflict (id) do nothing;

drop policy if exists "reports storage: read own"   on storage.objects;
drop policy if exists "reports storage: insert own" on storage.objects;
drop policy if exists "reports storage: update own" on storage.objects;
drop policy if exists "reports storage: delete own" on storage.objects;

create policy "reports storage: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "reports storage: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "reports storage: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "reports storage: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
