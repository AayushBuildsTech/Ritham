// Edge Function: voice-webhook
// Vapi's end-of-call report lands here. We record the actual call duration on the
// call_sessions row and, for PAID calls, decrement that many seconds from the
// user's call entitlements (oldest pack first; a pack is marked consumed once fully
// used). Free calls need no decrement (the free minute was already claimed at start).
//
// This is the authoritative meter — the client timer is only a UX guard. Vapi's own
// maxDurationSeconds hard-caps the call, so we can never bill past the allowance.
//
// Secrets: VAPI_WEBHOOK_SECRET (set as the Vapi Server URL secret) + SUPABASE_*.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPI_WEBHOOK_SECRET = Deno.env.get('VAPI_WEBHOOK_SECRET') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-vapi-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Constant-time string compare (avoids leaking the secret via response timing).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Dig a value out of the (nested, provider-shaped) payload from several likely spots.
function pick<T>(obj: any, paths: string[]): T | undefined {
  for (const p of paths) {
    let cur = obj;
    for (const key of p.split('.')) cur = cur?.[key];
    if (cur !== undefined && cur !== null) return cur as T;
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    // Fail CLOSED: a mutating webhook (ends sessions, decrements paid entitlements)
    // must never be callable without the shared secret. If the secret isn't
    // configured, reject everything rather than silently trusting anonymous posts.
    if (!VAPI_WEBHOOK_SECRET) return json({ error: 'not_configured' }, 500);
    if (!timingSafeEqual(req.headers.get('x-vapi-secret') ?? '', VAPI_WEBHOOK_SECRET)) {
      return json({ error: 'forbidden' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const msg = body?.message ?? body;
    const type = pick<string>(msg, ['type']) ?? '';
    // ONLY the terminal end-of-call-report ends the session. Vapi also sends
    // 'status-update' events DURING the call — acting on those would mark the session
    // ended mid-call and make the next LLM turn 409 (call_ended), ejecting the call.
    if (type !== 'end-of-call-report') return json({ ok: true, ignored: type });

    const callSessionId =
      pick<string>(msg, [
        'call.metadata.callSessionId',
        'metadata.callSessionId',
        'call.assistantOverrides.metadata.callSessionId',
        'assistant.metadata.callSessionId',
      ]);
    if (!callSessionId) return json({ ok: true, ignored: 'no_session_id' });

    // duration in seconds — Vapi may send seconds, minutes, or start/end timestamps
    let durationSec = pick<number>(msg, ['durationSeconds', 'call.durationSeconds', 'artifact.durationSeconds']);
    if (durationSec === undefined) {
      const mins = pick<number>(msg, ['durationMinutes', 'call.durationMinutes']);
      if (mins !== undefined) durationSec = mins * 60;
    }
    if (durationSec === undefined) {
      const startedAt = pick<string>(msg, ['startedAt', 'call.startedAt']);
      const endedAt = pick<string>(msg, ['endedAt', 'call.endedAt']);
      if (startedAt && endedAt) durationSec = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000;
    }
    const used = Math.max(0, Math.round(durationSec ?? 0));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Load the session (idempotent: if it's already ended, don't double-decrement).
    const { data: session } = await admin
      .from('call_sessions').select('*').eq('id', callSessionId).maybeSingle();
    if (!session) return json({ ok: true, ignored: 'session_not_found' });
    if (session.status === 'ended') return json({ ok: true, already: true });

    // clamp to the allowance we granted (belt-and-suspenders with Vapi's cap)
    const billable = Math.min(used, session.allowance_seconds ?? used);

    await admin.from('call_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString(), seconds_used: billable })
      .eq('id', session.id);

    // decrement paid entitlements oldest-first
    if (session.kind === 'paid_call' && billable > 0) {
      let remaining = billable;
      const { data: rows } = await admin
        .from('entitlements_ledger').select('*')
        .eq('user_id', session.user_id).eq('kind', 'call').is('consumed_at', null)
        .order('created_at', { ascending: true });
      for (const r of rows ?? []) {
        if (remaining <= 0) break;
        const avail = Math.max(0, (r.seconds_total ?? 0) - (r.seconds_used ?? 0));
        if (avail <= 0) continue;
        const take = Math.min(remaining, avail);
        const newUsed = (r.seconds_used ?? 0) + take;
        await admin.from('entitlements_ledger')
          .update({ seconds_used: newUsed, consumed_at: newUsed >= (r.seconds_total ?? 0) ? new Date().toISOString() : null })
          .eq('id', r.id);
        remaining -= take;
      }
    }

    return json({ ok: true, seconds_used: billable });
  } catch (e) {
    console.error('voice-webhook error:', String((e as Error)?.message ?? e));
    return json({ error: 'server_error' }, 500);
  }
});
