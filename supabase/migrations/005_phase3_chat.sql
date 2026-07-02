-- Phase 3: Chat (free 1-min session + AI messages)
-- Run in Supabase SQL Editor AFTER 001–004. Re-runnable.
--
-- Free 1-minute chat is ONE per verified phone number (rule #5). Since a user row
-- is 1:1 with a verified phone, we track it on public.users.free_minute_used_at.
-- Sessions/messages are written by the Edge Function (service role); clients only
-- read their own via RLS.

alter table public.users add column if not exists free_minute_used_at timestamptz;

-- ─── chat sessions ────────────────────────────────────────────────────────────
create table if not exists public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'free_minute',  -- free_minute | paid_time | paid_questions (Phase 4)
  started_at  timestamptz not null default now(),
  expires_at  timestamptz,                           -- for time-based sessions
  status      text not null default 'active'         -- active | ended
);
create index if not exists idx_chat_sessions_user on public.chat_sessions(user_id);

-- ─── chat messages ────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.chat_sessions(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_chat_messages_session on public.chat_messages(session_id, created_at);

-- ─── RLS: clients read their own chat data; writes happen via service role ─────
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_sessions: select own" on public.chat_sessions;
create policy "chat_sessions: select own" on public.chat_sessions
  for select using (user_id = auth.uid());

drop policy if exists "chat_messages: select own" on public.chat_messages;
create policy "chat_messages: select own" on public.chat_messages
  for select using (
    session_id in (select id from public.chat_sessions where user_id = auth.uid())
  );
