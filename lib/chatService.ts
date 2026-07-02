// chatService — client wrapper around the `chat` Edge Function.
// The app NEVER calls Claude directly; everything goes through the function,
// which holds the API key and enforces entitlements server-side.

import { supabase } from './supabase';

// Supabase Edge Function slug. The dashboard "Via Editor" deploy auto-named the
// function `bright-processor`; keep this in sync with the deployed function name.
// (To rename: deploy a function literally named `chat` and set this to 'chat'.)
const CHAT_FUNCTION = 'bright-processor';

export interface ChatSessionInfo {
  id: string;
  expires_at: string | null;
}

export interface ChatResult {
  reply?: string;
  session?: ChatSessionInfo;
  expired?: boolean;
  error?: string; // 'free_used' | 'kundli_missing' | ...
}

export async function sendChat(
  profileId: string,
  message: string,
  sessionId?: string,
): Promise<ChatResult> {
  const { data, error } = await supabase.functions.invoke(CHAT_FUNCTION, {
    body: { profileId, message, sessionId },
  });
  if (error) {
    // Supabase wraps non-2xx as FunctionsHttpError; surface a usable shape
    return { error: error.message ?? 'request_failed' };
  }
  return data as ChatResult;
}
