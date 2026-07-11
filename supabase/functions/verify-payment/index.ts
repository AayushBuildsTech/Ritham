// Edge Function: verify-payment
// Step 2 of the Razorpay flow. The client sends the checkout success payload
// { razorpay_order_id, razorpay_payment_id, razorpay_signature }. We recompute
// the HMAC-SHA256 signature server-side and only grant the entitlement if it
// matches (non-negotiable rule #3). The grant is idempotent — a retried verify
// (double-tap, network retry) will NOT double-grant, thanks to the unique index
// on entitlements_ledger.order_id.
//
// Secrets: RAZORPAY_KEY_SECRET (+ standard SUPABASE_* auto-provided).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RZP_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';

// pack grant sizes (must mirror config/pricing.ts / create-order)
const QUESTION_PACKS: Record<string, number> = { bindu: 1, panch: 5, darshan: 15, gyan: 40, brahmanda: 100 };
const SESSION_PLANS: Record<string, number> = { jyoti: 60, kiran: 300, tara: 600, nakshatra: 900, antariksh: 1800 };
const CALL_PACKS: Record<string, number> = { vaani: 120, sanvaad: 300, samvaad_plus: 600, vistaar: 1200, poorna: 1800 };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// HMAC-SHA256(order_id|payment_id, key_secret) → lowercase hex
async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// constant-time compare (both hex strings of equal length)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!RZP_KEY_SECRET) return json({ error: 'razorpay_not_configured' }, 500);

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: 'missing_fields' }, 400);
    }

    // the order must exist and belong to this user
    const { data: order } = await admin
      .from('payment_orders').select('*')
      .eq('razorpay_order_id', razorpay_order_id).eq('user_id', user.id).maybeSingle();
    if (!order) return json({ error: 'order_not_found' }, 404);

    // verify the signature (rule #3)
    const expected = await hmacHex(RZP_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!timingSafeEqual(expected, String(razorpay_signature))) {
      await admin.from('payment_orders').update({ status: 'failed' }).eq('id', order.id);
      return json({ error: 'signature_mismatch' }, 400);
    }

    // mark paid + record payment id
    await admin.from('payment_orders')
      .update({ status: 'paid', razorpay_payment_id }).eq('id', order.id);

    // grant the entitlement — idempotent via unique(order_id)
    const questions = order.kind === 'questions' ? (QUESTION_PACKS[order.plan_id] ?? 0) : 0;
    const seconds =
      order.kind === 'time' ? (SESSION_PLANS[order.plan_id] ?? 0) :
      order.kind === 'call' ? (CALL_PACKS[order.plan_id] ?? 0) : 0;

    const { error: grantErr } = await admin.from('entitlements_ledger').insert({
      user_id: user.id,
      order_id: order.id,
      kind: order.kind,
      plan_id: order.plan_id,
      amount_paise: order.amount_paise,
      questions_total: questions,
      questions_remaining: questions,
      seconds_total: seconds,
    });
    // 23505 = unique_violation → already granted; treat as success (idempotent)
    if (grantErr && (grantErr as any).code !== '23505') {
      return json({ error: 'grant_failed', detail: grantErr.message }, 500);
    }

    // return the fresh balance
    const balance = await computeBalance(admin, user.id);
    return json({ ok: true, balance });
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});

async function computeBalance(admin: any, userId: string) {
  const { data } = await admin
    .from('entitlements_ledger')
    .select('kind, questions_remaining, seconds_total, seconds_used, consumed_at')
    .eq('user_id', userId);
  let questions = 0, seconds = 0, callSeconds = 0;
  for (const r of data ?? []) {
    if (r.consumed_at) continue;
    if (r.kind === 'questions') questions += r.questions_remaining;
    if (r.kind === 'time') seconds += r.seconds_total;
    if (r.kind === 'call') callSeconds += Math.max(0, (r.seconds_total ?? 0) - (r.seconds_used ?? 0));
  }
  return { questions, seconds, callSeconds };
}
