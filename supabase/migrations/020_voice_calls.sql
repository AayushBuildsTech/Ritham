-- Phase: AI Voice Calling ("Talk to your Jyotishi")
-- Run in Supabase SQL Editor AFTER 001–019. Re-runnable.
--
-- Adds the call layer alongside chat, reusing the payments/entitlements pipeline:
--   • call packs are a new entitlement kind 'call' (seconds, partially consumable)
--   • call_sessions / call_messages mirror chat_sessions / chat_messages
--   • the free 60-second call is scarce per-account (users.free_call_used_at) AND
--     per-device (device_free_call_trials), like the free chat minute.
-- Writes happen only via the service-role Edge Functions (voice-token/webhook);
-- clients read their own rows via RLS.

-- ─── widen the money-layer kind checks to include 'call' (and 'report') ────────
alter table public.payment_orders      drop constraint if exists payment_orders_kind_check;
alter table public.payment_orders      add  constraint payment_orders_kind_check
  check (kind in ('questions','time','report','call'));

alter table public.entitlements_ledger drop constraint if exists entitlements_ledger_kind_check;
alter table public.entitlements_ledger add  constraint entitlements_ledger_kind_check
  check (kind in ('questions','time','call'));

-- call packs are consumed partially (a 5-min pack can be used 30s at a time), so we
-- track cumulative seconds_used; the row is marked consumed_at once fully used.
alter table public.entitlements_ledger add column if not exists seconds_used integer not null default 0;

-- Active (not fully-used) call packs.
create index if not exists idx_entitlements_active_call on public.entitlements_ledger(user_id)
  where kind = 'call' and consumed_at is null;

-- ─── free call: one per account + one per device (anti-abuse) ──────────────────
alter table public.users add column if not exists free_call_used_at timestamptz;

create table if not exists public.device_free_call_trials (
  device_hash text primary key,               -- SHA-256 of the app-scoped device id
  user_id     uuid references public.users(id) on delete set null,
  claimed_at  timestamptz not null default now()
);
alter table public.device_free_call_trials enable row level security;  -- deny-all; service role bypasses

-- ─── call sessions ─────────────────────────────────────────────────────────────
create table if not exists public.call_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  kind              text not null default 'paid_call' check (kind in ('free_call','paid_call')),
  allowance_seconds integer not null default 0,     -- max duration granted for this call
  seconds_used      integer not null default 0,     -- actual duration (set by the webhook)
  vapi_call_id      text,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  status            text not null default 'active'  -- active | ended
);
create index if not exists idx_call_sessions_user on public.call_sessions(user_id);

-- ─── call transcript (mirrors chat_messages) ───────────────────────────────────
create table if not exists public.call_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.call_sessions(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_call_messages_session on public.call_messages(session_id, created_at);

-- ─── RLS: clients read their own call data; writes go via service role ─────────
alter table public.call_sessions enable row level security;
alter table public.call_messages enable row level security;

drop policy if exists "call_sessions: select own" on public.call_sessions;
create policy "call_sessions: select own" on public.call_sessions
  for select using (user_id = auth.uid());

drop policy if exists "call_messages: select own" on public.call_messages;
create policy "call_messages: select own" on public.call_messages
  for select using (
    session_id in (select id from public.call_sessions where user_id = auth.uid())
  );
