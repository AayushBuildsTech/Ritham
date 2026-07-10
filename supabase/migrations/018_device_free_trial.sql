-- Phase: Google login + anti-abuse for the free 1-minute chat.
-- Run in Supabase SQL Editor AFTER 001–017. Re-runnable.
--
-- With phone-OTP removed, "one free minute per verified phone" no longer holds
-- (a Google account is cheaper to create than a SIM). To keep the free minute
-- scarce we ALSO gate it on the device: a hashed device id may claim the free
-- minute exactly once, across ALL accounts. The chat Edge Function inserts a row
-- here as an atomic reservation (unique primary key) before granting the minute.
--
-- device_hash = SHA-256 of the app-scoped device id (expo-application). We never
-- store the raw identifier. Written only by the service-role Edge Function.

create table if not exists public.device_free_trials (
  device_hash text primary key,
  user_id     uuid references public.users(id) on delete set null,
  claimed_at  timestamptz not null default now()
);

-- Clients never touch this table directly; RLS on with no policies = deny-all to
-- anon/authenticated, service role bypasses. (Matches the app's own-data-only model.)
alter table public.device_free_trials enable row level security;
