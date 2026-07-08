-- Chat History: let a user DELETE their own past chat sessions.
-- Run in Supabase SQL Editor. Re-runnable.
--
-- Migration 005 gave chat_sessions/chat_messages a SELECT-own policy only, so the
-- client can read history but not remove it. This adds a DELETE-own policy on
-- chat_sessions. Messages are removed automatically: chat_messages.session_id
-- references chat_sessions(id) ON DELETE CASCADE, and FK cascades run at the engine
-- level (they are NOT gated by chat_messages' own RLS), so one session delete takes
-- its whole transcript with it. Writes still only ever happen for the caller's own
-- rows (user_id = auth.uid()).

alter table public.chat_sessions enable row level security;

drop policy if exists "chat_sessions: delete own" on public.chat_sessions;
create policy "chat_sessions: delete own" on public.chat_sessions
  for delete using (user_id = auth.uid());
