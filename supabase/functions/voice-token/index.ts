// Edge Function: voice-token
// Called by the app when the user taps "Call". It:
//   1. Authenticates the user from the JWT.
//   2. Verifies the chosen profile belongs to them AND has a computed Kundli
//      (a call must never start on an incomplete chart — mirrors chat §7).
//   3. Works out the allowance: paid call-seconds if any, else the free 60s
//      (scarce per-account AND per-device, anti-abuse), else → needs_purchase.
//   4. Creates a call_sessions row and mints a short-lived, HMAC-signed token
//      (uid, pid, csid, exp) that voice-llm verifies on every spoken turn.
//   5. Returns the Vapi start config (public key, assistant id, per-call overrides
//      with the token-bearing custom-LLM URL + maxDurationSeconds as a hard cap).
//
// Secrets: VOICE_TOKEN_SECRET, VOICE_LLM_URL, VAPI_PUBLIC_KEY, VAPI_ASSISTANT_ID
//          (+ standard SUPABASE_* auto-provided).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VOICE_TOKEN_SECRET = Deno.env.get('VOICE_TOKEN_SECRET') ?? '';
const VOICE_LLM_URL = Deno.env.get('VOICE_LLM_URL') ?? '';       // deployed voice-llm fn URL
const VAPI_PUBLIC_KEY = Deno.env.get('VAPI_PUBLIC_KEY') ?? '';
const VAPI_ASSISTANT_ID = Deno.env.get('VAPI_ASSISTANT_ID') ?? '';
// Speech-to-text language for the caller's OWN speech. Hindi-first ('hi') so the
// jyotishi actually understands Hindi (an English STT mis-hears Hindi → the astrologer
// answers the wrong thing → feels like a robot who doesn't know Hindi). Deepgram 'hi'
// transcribes into Devanagari, which also lets the LLM reply in matching Devanagari.
// Tunable without a redeploy: set VOICE_STT_LANGUAGE ('hi' | 'multi' | 'en') as a secret.
const VOICE_STT_LANGUAGE = Deno.env.get('VOICE_STT_LANGUAGE') ?? 'hi';
const VOICE_STT_MODEL = Deno.env.get('VOICE_STT_MODEL') ?? 'nova-2';

const FREE_SECONDS = 60;
const MAX_ALLOWANCE = 3600;   // safety ceiling on a single call (30-min pack is 1800)
const EXP_BUFFER = 300;       // token lives a little past the allowance

// Spoken opening greeting (TTS-friendly — no emoji). The astrologer speaks first
// so the call feels warm; set here so it's guaranteed regardless of Vapi UI.
// WRITTEN IN DEVANAGARI on purpose: the ElevenLabs voice pronounces from the SCRIPT,
// so Devanagari sounds like natural Hindi while romanized Latin Hindi comes out with a
// foreign English accent (the "robot who doesn't know Hindi" problem).
const FIRST_MESSAGE =
  'नमस्ते। मैं आपकी ज्योतिषी हूँ। आपकी कुंडली मेरे सामने है। बताइए, आज आप क्या जानना चाहते हैं?';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const bytesToB64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const strToB64url = (s: string): string =>
  bytesToB64url(new TextEncoder().encode(s));

async function signToken(claims: Record<string, unknown>): Promise<string> {
  const payload = JSON.stringify(claims);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(VOICE_TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return `${strToB64url(payload)}.${bytesToB64url(sig)}`;
}

// HMAC-SHA256 hex of a string, keyed by VOICE_TOKEN_SECRET. Used to sign the call
// session id into the Vapi call metadata so the end-of-call webhook can verify the
// report is genuine (Vapi echoes the metadata back). See voice-webhook.
async function hmacHex(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(VOICE_TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Active paid call balance = Σ (seconds_total − seconds_used) over unconsumed 'call' rows.
async function callBalance(admin: any, userId: string): Promise<number> {
  const { data } = await admin
    .from('entitlements_ledger')
    .select('kind, seconds_total, seconds_used, consumed_at')
    .eq('user_id', userId).eq('kind', 'call').is('consumed_at', null);
  let secs = 0;
  for (const r of data ?? []) secs += Math.max(0, (r.seconds_total ?? 0) - (r.seconds_used ?? 0));
  return secs;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!VOICE_TOKEN_SECRET) return json({ error: 'voice_not_configured' }, 500);

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { profileId, deviceId, release } = await req.json();

    // Refund path: the client calls this when a call failed to start. End the
    // session and, if it was a free call that never connected, give the free
    // minute back (so a failed start never burns the user's free call).
    if (release) {
      const { data: cs } = await admin
        .from('call_sessions').select('*').eq('id', release).eq('user_id', user.id).maybeSingle();
      if (cs && cs.status !== 'ended') {
        await admin.from('call_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', cs.id);
        if (cs.kind === 'free_call' && (cs.seconds_used ?? 0) === 0) {
          await admin.from('users').update({ free_call_used_at: null }).eq('id', user.id);
          await admin.from('device_free_call_trials').delete().eq('user_id', user.id);
        }
      }
      return json({ ok: true, released: true });
    }

    if (!profileId) return json({ error: 'missing_profile' }, 400);

    // profile must belong to the user and carry a complete chart
    const { data: profile } = await admin
      .from('profiles').select('id, user_id, kundli_chart')
      .eq('id', profileId).eq('user_id', user.id).maybeSingle();
    if (!profile) return json({ error: 'profile_not_found' }, 404);
    const kc = profile.kundli_chart;
    if (!kc || !kc.lagna || !kc.moon_sign || !Array.isArray(kc.dasha_timeline) || kc.dasha_timeline.length === 0) {
      return json({ error: 'kundli_incomplete' }, 400); // client re-fetches via kundliService
    }

    // ── decide allowance: paid balance first, else the free minute ─────────────
    let allowance = 0;
    let kind: 'paid_call' | 'free_call' = 'paid_call';

    const paid = await callBalance(admin, user.id);
    if (paid > 0) {
      allowance = Math.min(paid, MAX_ALLOWANCE);
      kind = 'paid_call';
    } else {
      // atomically claim the free call — scarce per-account AND per-device
      const deviceHash = deviceId ? await sha256(String(deviceId)) : null;
      let deviceReserved = false;
      if (deviceHash) {
        const { error: devErr } = await admin
          .from('device_free_call_trials')
          .insert({ device_hash: deviceHash, user_id: user.id });
        deviceReserved = !devErr;
      }
      // M-4 anti-abuse: the free call REQUIRES a device id (per-device scarcity);
      // without one, deny the free tier (a purchase still works).
      const deviceOk = deviceHash ? deviceReserved : false;

      const { data: claimed } = deviceOk
        ? await admin.from('users')
            .update({ free_call_used_at: new Date().toISOString() })
            .eq('id', user.id).is('free_call_used_at', null)
            .select('id').maybeSingle()
        : { data: null };

      if (claimed) {
        allowance = FREE_SECONDS;
        kind = 'free_call';
      } else {
        // release a device reservation we couldn't use, so a genuinely new user isn't blocked
        if (deviceHash && deviceReserved) await admin.from('device_free_call_trials').delete().eq('device_hash', deviceHash);
        // If THIS device already used its free call under another account, this user
        // can never earn it here — stamp the per-account flag so the client stops
        // offering a "free call" it can't grant. Only on a real device block, not an
        // absent device id (a soft, retryable deny).
        if (deviceHash && !deviceReserved) {
          await admin.from('users').update({ free_call_used_at: new Date().toISOString() })
            .eq('id', user.id).is('free_call_used_at', null);
        }
        return json({ error: 'needs_purchase' }); // client opens the call paywall
      }
    }

    // ── create the call session ────────────────────────────────────────────────
    const { data: session, error: sErr } = await admin
      .from('call_sessions')
      .insert({ user_id: user.id, profile_id: profileId, kind, allowance_seconds: allowance, status: 'active' })
      .select().single();
    if (sErr || !session) {
      // roll back a free claim so a transient failure doesn't burn the free minute
      if (kind === 'free_call') {
        await admin.from('users').update({ free_call_used_at: null }).eq('id', user.id);
        const deviceHash = deviceId ? await sha256(String(deviceId)) : null;
        if (deviceHash) await admin.from('device_free_call_trials').delete().eq('device_hash', deviceHash);
      }
      console.error('voice-token session create failed:', sErr?.message);
      return json({ error: 'session_create_failed' }, 500);
    }

    // ── mint the signed token ──────────────────────────────────────────────────
    const exp = Math.floor(Date.now() / 1000) + allowance + EXP_BUFFER;
    const token = await signToken({ uid: user.id, pid: profileId, csid: session.id, exp });

    // Per-call overrides for vapi.start(): a token-scoped custom-LLM URL and a hard
    // duration cap so the call auto-ends at the user's allowance. The token is a PATH
    // segment (not a query param) because Vapi appends "/chat/completions" to the url —
    // which would corrupt a "?t=" query, but is harmless after a path segment.
    const modelUrl = VOICE_LLM_URL ? `${VOICE_LLM_URL}/${token}` : null;

    // Warm the voice-llm isolate NOW (fire-and-forget) so the caller's FIRST question,
    // ~10s later after the spoken greeting, isn't met with cold-start silence. Supabase
    // isolates go cold when idle; without this the first turn of a fresh call can time out.
    if (VOICE_LLM_URL) {
      fetch(VOICE_LLM_URL, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"warmup":true}',
      }).catch(() => {});
    }

    // Sign the session id so the end-of-call webhook can prove the report is genuine.
    const sessionSig = await hmacHex(session.id);

    return json({
      ok: true,
      callSessionId: session.id,
      kind,
      allowanceSeconds: allowance,
      token,
      vapi: {
        publicKey: VAPI_PUBLIC_KEY || null,
        assistantId: VAPI_ASSISTANT_ID || null,
        assistantOverrides: {
          maxDurationSeconds: allowance,
          firstMessage: FIRST_MESSAGE,
          firstMessageMode: 'assistant-speaks-first',
          // Native Indian Hindi voice — sounds authentically Indian, unlike the default
          // ElevenLabs voice. Overrides the assistant's voice per call. The voice-llm brain
          // replies in Devanagari on Hindi turns so this voice pronounces natural Hindi.
          //
          // Voice SETTINGS are pinned so the live call matches the ElevenLabs studio
          // preview. Left unset, Vapi's defaults (low stability + aggressive latency
          // optimization) make v2 voices wobble, add audible breaths and sound "exhausted".
          //   stability 0.6      → steady, professional read; kills the random breathiness
          //                        (lower = more emotional/erratic; higher = flatter/monotone)
          //   similarityBoost .85 → stays true to the original voice, so it sounds like the preview
          //   style 0            → no style exaggeration (adds artifacts + latency)
          //   useSpeakerBoost    → sharpens resemblance to the real voice
          //   optimizeStreamingLatency 0 → MAX audio quality (0–4; higher = faster but more artifacts)
          voice: {
            provider: '11labs',
            voiceId: 'dVTC43Yewy5fAIcmsISI',
            model: 'eleven_multilingual_v2',
            stability: 0.6,
            similarityBoost: 0.85,
            style: 0,
            useSpeakerBoost: true,
            optimizeStreamingLatency: 0,
          },
          // Hindi-first transcriber so the caller's own Hindi speech is understood (not
          // mangled by an English STT). Deepgram 'hi' returns Devanagari, matching the reply.
          transcriber: { provider: 'deepgram', model: VOICE_STT_MODEL, language: VOICE_STT_LANGUAGE },
          // Barge-in tuning — the #1 cause of the astrologer cutting off mid-sentence is
          // her OWN voice echoing back into the mic (speakerphone) and being transcribed as
          // if the caller spoke. numWords is the strongest guard: she only yields once the
          // caller has said this many TRANSCRIBED words, so echo/background noise can't stop
          // her. Maxed to 10 (Vapi's ceiling) because her sentences are long enough that a
          // lower bar let the echo through. voiceSeconds requires sustained real speech;
          // backoffSeconds keeps her quiet a moment after a genuine interruption.
          // NOTE: "stop", "no", "wait", "actually" still interrupt instantly regardless.
          // voiceSeconds MUST be ≤ 0.5 (Vapi's max) — a larger value makes Vapi reject the
          // whole call with a 400 ("call could not start").
          stopSpeakingPlan: { numWords: 10, voiceSeconds: 0.5, backoffSeconds: 2.0 },
          // How quickly she replies after the caller stops talking. She was "still
          // listening" for too long because Vapi's default no-punctuation wait is ~1.5s
          // and Deepgram rarely punctuates Hindi — so that wait applied every turn (on top
          // of waitSeconds), stalling her and burning the caller's seconds on silence.
          // Drop the waits so she picks up promptly, but keep enough that a mid-thought
          // pause doesn't make her jump in.
          startSpeakingPlan: {
            waitSeconds: 0.4,
            transcriptionEndpointingPlan: {
              onPunctuationSeconds: 0.3,
              onNoPunctuationSeconds: 1.0,
              onNumberSeconds: 0.4,
            },
          },
          metadata: { callSessionId: session.id, sig: sessionSig },
          // Vapi requires the FULL model object on an override (provider + model + url),
          // not just the url — otherwise POST /call/web returns 400.
          ...(modelUrl ? { model: { provider: 'custom-llm', model: 'ritham', url: modelUrl } } : {}),
        },
      },
    });
  } catch (e) {
    console.error('voice-token error:', String((e as Error)?.message ?? e));
    return json({ error: 'server_error' }, 500);
  }
});
