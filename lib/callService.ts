// callService — client wrapper around the AI voice-call flow.
//
// Flow:
//   1. authorize()  → voice-token fn checks entitlement (paid seconds or free 60s),
//                     creates a call_sessions row, and returns a signed token + the
//                     Vapi start config (public key, assistant id, per-call overrides
//                     with the token-scoped custom-LLM URL + a hard duration cap).
//   2. Vapi SDK starts an in-app WebRTC call; each spoken turn hits our voice-llm
//      (the same Ritham brain + Kundli as chat, in spoken mode).
//   3. On end, Vapi's webhook meters the real seconds server-side.
//
// The Vapi SDK is a native module (requires a development build, not Expo Go). We
// lazy-load it so the rest of the app still builds/runs without it; if it's absent
// the Call screen degrades to an "update the app" message.

import { supabase } from './supabase';
import { getDeviceId } from './device';
import { track } from './analytics';

const VOICE_TOKEN_FN = 'voice-token';

export type CallState =
  | 'idle' | 'connecting' | 'active' | 'listening' | 'speaking' | 'ended' | 'error';

export interface CallHandle {
  stop(): void;
  setMuted(muted: boolean): void;
}

export interface StartCallOptions {
  profileId: string;
  onState: (s: CallState) => void;
  onVolume?: (v: number) => void;                 // 0..1, assistant output level
  onTranscript?: (role: 'user' | 'assistant', text: string) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export interface StartCallResult {
  ok: boolean;
  error?: string;               // 'needs_purchase' | 'kundli_incomplete' | 'voice_unavailable' | ...
  handle?: CallHandle;
  allowanceSeconds?: number;
  kind?: 'free_call' | 'paid_call';
  callSessionId?: string;
}

// Lazy, crash-safe load of the native Vapi SDK.
function loadVapi(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@vapi-ai/react-native');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

interface VoiceTokenResp {
  ok?: boolean;
  error?: string;
  callSessionId?: string;
  kind?: 'free_call' | 'paid_call';
  allowanceSeconds?: number;
  token?: string;
  vapi?: {
    publicKey: string | null;
    assistantId: string | null;
    assistantOverrides: Record<string, unknown>;
  };
}

export async function startCall(opts: StartCallOptions): Promise<StartCallResult> {
  const { profileId, onState, onVolume, onTranscript, onEnd, onError } = opts;
  onState('connecting');

  // 1. authorize the call server-side
  const deviceId = await getDeviceId();
  const { data, error } = await supabase.functions.invoke<VoiceTokenResp>(VOICE_TOKEN_FN, {
    body: { profileId, deviceId },
  });
  // Never log the token or full payload — it contains the signed voice credential.
  console.log('[call] voice-token resp:', JSON.stringify({ error: error?.message, ok: data?.ok, kind: data?.kind, err: data?.error }));
  if (error || !data || data.error || !data.ok) {
    onState('idle');
    return { ok: false, error: data?.error ?? error?.message ?? 'authorize_failed' };
  }

  const publicKey = data.vapi?.publicKey;
  const assistantId = data.vapi?.assistantId;
  if (!publicKey || !assistantId) {
    onState('idle');
    return { ok: false, error: 'voice_not_configured' };
  }

  // 2. load + start the Vapi SDK
  const Vapi = loadVapi();
  if (!Vapi) {
    onState('idle');
    return { ok: false, error: 'voice_unavailable' };
  }

  let vapi: any;
  try {
    vapi = new Vapi(publicKey);

    // refund the free minute if the call never actually connects (any failure mode)
    let connected = false;
    const releaseIfUnconnected = () => {
      if (!connected && data.callSessionId) {
        supabase.functions.invoke(VOICE_TOKEN_FN, { body: { release: data.callSessionId } }).catch(() => {});
      }
    };

    vapi.on('call-start', () => { connected = true; console.log('[call] CONNECTED ✓'); onState('active'); });
    vapi.on('speech-start', () => onState('speaking'));   // assistant started speaking
    vapi.on('speech-end', () => onState('listening'));     // waiting for the user
    vapi.on('volume-level', (v: number) => onVolume?.(typeof v === 'number' ? v : 0));
    vapi.on('message', (m: any) => {
      if (m?.type === 'transcript' && m?.transcriptType === 'final' && m?.transcript) {
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        onTranscript?.(role, String(m.transcript));
      }
    });
    vapi.on('call-end', () => { releaseIfUnconnected(); onState('ended'); onEnd?.(); });
    vapi.on('error', (e: any) => {
      console.log('[call] vapi error event:', String(e?.message ?? e?.error?.message ?? e));
      releaseIfUnconnected();
      onState('error');
      onError?.(String(e?.message ?? e?.error?.message ?? 'call_error'));
    });

    console.log('[call] vapi.start with', JSON.stringify({ assistantId, overrides: data.vapi?.assistantOverrides }));
    await vapi.start(assistantId, data.vapi?.assistantOverrides ?? {});
  } catch (e: any) {
    console.log('[call] vapi.start ERROR:', e?.message, JSON.stringify(e?.response ?? e ?? {}));
    // refund a never-connected call (gives the free minute back)
    if (data.callSessionId) {
      supabase.functions.invoke(VOICE_TOKEN_FN, { body: { release: data.callSessionId } }).catch(() => {});
    }
    onState('error');
    return { ok: false, error: String(e?.message ?? 'start_failed') };
  }

  track('call_start', { kind: data.kind, allowance: data.allowanceSeconds });

  const handle: CallHandle = {
    stop: () => { try { vapi.stop(); } catch { /* ignore */ } },
    setMuted: (muted: boolean) => { try { vapi.setMuted(muted); } catch { /* ignore */ } },
  };

  return {
    ok: true,
    handle,
    allowanceSeconds: data.allowanceSeconds,
    kind: data.kind,
    callSessionId: data.callSessionId,
  };
}

// User-facing copy for the machine error codes above.
export function callErrorMessage(code?: string): string {
  switch (code) {
    case 'needs_purchase':    return 'Your free call is used. Buy call minutes to keep talking.';
    case 'kundli_incomplete': return 'Please open your Kundli once to finish setting it up, then call again.';
    case 'voice_unavailable': return 'Voice calling needs the latest app build. Please update Ritham to call.';
    case 'voice_not_configured': return 'Voice calling is not switched on yet. Please try again later.';
    case 'profile_not_found': return 'Please pick a person whose Kundli is ready, then call again.';
    default:                  return 'The call could not start. Please try again in a moment.';
  }
}
