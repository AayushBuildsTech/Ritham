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
