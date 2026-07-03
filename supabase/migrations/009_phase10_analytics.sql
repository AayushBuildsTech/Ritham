-- Phase 10: lightweight product analytics.
-- Run in Supabase SQL Editor AFTER 001–008. Re-runnable.
--
-- One row per tracked action (login, profile_created, chat_message, purchase,
-- report_generated, …). Clients only INSERT their own events; analysis is done
-- with the service role (which bypasses RLS). No client SELECT policy on purpose.

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete set null,
  name       text not null,
  props      jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_name_created on public.events(name, created_at desc);
create index if not exists idx_events_user on public.events(user_id);

alter table public.events enable row level security;

-- authenticated users may record their own events; nobody reads via the client
drop policy if exists "events: insert own" on public.events;
create policy "events: insert own" on public.events
  for insert to authenticated
  with check (user_id = auth.uid());
