// chatService — client wrapper around the `chat` Edge Function.
// The app NEVER calls Claude directly; everything goes through the function,
// which holds the API key and enforces entitlements server-side.

import { supabase } from './supabase';

// Supabase Edge Function slug. Deployed from supabase/functions/chat via the CLI,
// so the slug matches the folder. (The earlier dashboard deploy under the name
// `bright-processor` is now orphaned and can be deleted.)
const CHAT_FUNCTION = 'chat';

export type SessionKind = 'free_minute' | 'paid_time' | 'paid_questions';

export interface ChatSessionInfo {
  id: string;
  kind?: SessionKind;
  expires_at: string | null;
}

export interface ChatBalance {
  questions: number;
  seconds: number;
}

export interface ChatResult {
  reply?: string;
  session?: ChatSessionInfo;
  balance?: ChatBalance;
  expired?: boolean;
  // 'needs_purchase' | 'out_of_questions' | 'kundli_missing' | 'request_failed' | ...
  error?: string;
}

// The astrologer's opening greeting for a new chat. The text lives server-side
// (with the system prompt); this just retrieves it. Fail-soft: returns null if the
// function is unreachable, and the chat simply opens without the greeting bubble.
export async function fetchGreeting(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke(CHAT_FUNCTION, {
    body: { greetingOnly: true },
  });
  if (error) return null;
  return (data as { greeting?: string })?.greeting ?? null;
}

// ── Chat history (read-only) ───────────────────────────────────────────────────
// Past conversations. RLS (migration 005) scopes chat_sessions + chat_messages to
// the signed-in user, so these plain client reads only ever return their own data —
// no Edge Function needed.

export interface ChatHistoryItem {
  id: string;
  profileId: string;
  profileName: string;
  startedAt: string;   // ISO — session start
  preview: string;     // the first question asked in the session
  kind: SessionKind;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// List the user's past chat sessions, newest first. A session is only surfaced if
// it actually holds a question (≥ 1 user message); the preview is that first question.
export async function listChatHistory(): Promise<ChatHistoryItem[]> {
  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select('id, profile_id, kind, started_at, profiles(name)')
    .order('started_at', { ascending: false });
  if (error || !sessions?.length) return [];

  const ids = sessions.map((s: any) => s.id);
  // One query for the first user message of each session (ordered oldest-first so the
  // first row seen per session is the opening question).
  const { data: msgs } = await supabase
    .from('chat_messages')
    .select('session_id, content, created_at')
    .in('session_id', ids)
    .eq('role', 'user')
    .order('created_at', { ascending: true });

  const firstQ = new Map<string, string>();
  for (const m of msgs ?? []) {
    if (!firstQ.has(m.session_id)) firstQ.set(m.session_id, m.content);
  }

  return sessions
    .filter((s: any) => firstQ.has(s.id)) // hide empty/abandoned sessions
    .map((s: any) => ({
      id: s.id,
      profileId: s.profile_id,
      profileName: s.profiles?.name ?? '',
      startedAt: s.started_at,
      preview: firstQ.get(s.id) ?? '',
      kind: s.kind as SessionKind,
    }));
}

// Delete one or more past sessions (and their messages, via ON DELETE CASCADE).
// RLS (migration 015) scopes deletes to the caller's own rows. Returns an error
// string on failure so the UI can surface it and keep the rows on screen.
export async function deleteChatSessions(ids: string[]): Promise<{ error?: string }> {
  if (!ids.length) return {};
  const { error } = await supabase.from('chat_sessions').delete().in('id', ids);
  return error ? { error: error.message } : {};
}

// Full transcript of one past session, oldest-first. Read-only.
export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  return (data ?? []).map((m: any) => ({ role: m.role, content: m.content, createdAt: m.created_at }));
}

export async function sendChat(
  profileId: string,
  message: string,
  sessionId?: string,
  useKind?: 'questions' | 'time',
): Promise<ChatResult> {
  const { data, error } = await supabase.functions.invoke(CHAT_FUNCTION, {
    body: { profileId, message, sessionId, useKind },
  });
  if (error) {
    // Supabase wraps non-2xx as FunctionsHttpError; surface a usable shape
    return { error: error.message ?? 'request_failed' };
  }
  return data as ChatResult;
}
