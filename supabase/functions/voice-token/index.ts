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

const FREE_SECONDS = 60;
const MAX_ALLOWANCE = 3600;   // safety ceiling on a single call (30-min pack is 1800)
const EXP_BUFFER = 300;       // token lives a little past the allowance

// Spoken opening greeting (TTS-friendly — no emoji). The astrologer speaks first
// so the call feels warm; set here so it's guaranteed regardless of Vapi UI.
const FIRST_MESSAGE =
  'Namaste. Main aapki jyotishi hoon. Aapki kundli mere saamne hai. Bataiye, aaj aap kya jaanna chahte hain?';

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
      const deviceOk = deviceHash ? deviceReserved : true;

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
      return json({ error: 'session_create_failed', detail: sErr?.message }, 500);
    }

    // ── mint the signed token ──────────────────────────────────────────────────
    const exp = Math.floor(Date.now() / 1000) + allowance + EXP_BUFFER;
    const token = await signToken({ uid: user.id, pid: profileId, csid: session.id, exp });

    // Per-call overrides for vapi.start(): a token-scoped custom-LLM URL and a hard
    // duration cap so the call auto-ends at the user's allowance. The token is a PATH
    // segment (not a query param) because Vapi appends "/chat/completions" to the url —
    // which would corrupt a "?t=" query, but is harmless after a path segment.
    const modelUrl = VOICE_LLM_URL ? `${VOICE_LLM_URL}/${token}` : null;

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
          // Native Indian Hindi voice (warm male pandit) — sounds authentically Indian,
          // unlike the default ElevenLabs voice. Overrides the assistant's voice per call.
          voice: { provider: '11labs', voiceId: 'zMndFmtlJvAIQjxXWZTU', model: 'eleven_multilingual_v2' },
          // Don't let brief echo/noise cut the astrologer off mid-answer — require a few
          // real words before yielding, and pause naturally before speaking.
          stopSpeakingPlan: { numWords: 3, voiceSeconds: 0.4, backoffSeconds: 1.2 },
          startSpeakingPlan: { waitSeconds: 0.6 },
          metadata: { callSessionId: session.id },
          // Vapi requires the FULL model object on an override (provider + model + url),
          // not just the url — otherwise POST /call/web returns 400.
          ...(modelUrl ? { model: { provider: 'custom-llm', model: 'ritham', url: modelUrl } } : {}),
        },
      },
    });
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});
