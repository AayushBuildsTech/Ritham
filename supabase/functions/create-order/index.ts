// Edge Function: create-order
// Step 1 of the Razorpay flow. Creates a Razorpay order for a chat pack.
//
// SECURITY (non-negotiable rule #3): the client sends only { kind, planId }. The
// amount is ALWAYS recomputed here from the server-side pricing table below —
// the client-sent price is never trusted. A payment_orders row is written with
// status 'created'; it becomes 'paid' only after verify-payment checks the HMAC
// signature.
//
// Secrets required (Supabase → Edge Functions → Secrets):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET   (test keys for now)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto-provided)
//
// NOTE: pricing is duplicated from app-side config/pricing.ts on purpose — the
// server must own the source of truth for money. Keep the two in sync.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RZP_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
const RZP_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';

// ── server-side pricing (paise). Mirror of config/pricing.ts ──────────────────
const QUESTION_PACKS: Record<string, { price_paise: number; questions: number; first_purchase_only?: boolean }> = {
  bindu:     { price_paise: 900,   questions: 1 },
  panch:     { price_paise: 3500,  questions: 5 },
  darshan:   { price_paise: 7900,  questions: 15 },
  gyan:      { price_paise: 16900, questions: 40 },
  brahmanda: { price_paise: 34900, questions: 100 },
};
const SESSION_PLANS: Record<string, { price_paise: number; seconds: number }> = {
  jyoti:     { price_paise: 1500,  seconds: 60 },
  kiran:     { price_paise: 3900,  seconds: 300 },
  tara:      { price_paise: 6900,  seconds: 600 },
  nakshatra: { price_paise: 9900,  seconds: 900 },
  antariksh: { price_paise: 17900, seconds: 1800 },
};
// Voice-call packs (kind 'call'). Mirror of config/pricing.ts CALL_PACKS.
const CALL_PACKS: Record<string, { price_paise: number; seconds: number }> = {
  vaani:        { price_paise: 4900,  seconds: 120 },
  sanvaad:      { price_paise: 11900, seconds: 300 },
  samvaad_plus: { price_paise: 21900, seconds: 600 },
  vistaar:      { price_paise: 39900, seconds: 1200 },
  poorna:       { price_paise: 55900, seconds: 1800 },
};
const REPORT_PRICES: Record<string, { price_paise: number }> = {
  life:        { price_paise: 39900 },
  career:      { price_paise: 14900 },
  love:        { price_paise: 12900 },
  health:      { price_paise: 9900 },
  education:   { price_paise: 9900 },
  vastu:       { price_paise: 14900 },
  matchmaking: { price_paise: 19900 },
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!RZP_KEY_ID || !RZP_KEY_SECRET) return json({ error: 'razorpay_not_configured' }, 500);

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { kind, planId } = await req.json();
    if (kind !== 'questions' && kind !== 'time' && kind !== 'report' && kind !== 'call') return json({ error: 'bad_kind' }, 400);

    const plan =
      kind === 'questions' ? QUESTION_PACKS[planId] :
      kind === 'time'      ? SESSION_PLANS[planId] :
      kind === 'call'      ? CALL_PACKS[planId] :
                             REPORT_PRICES[planId];
    if (!plan) return json({ error: 'unknown_plan' }, 400);

    // first-purchase-only guard (e.g. Bindu ₹5): reject if already bought once.
    if (kind === 'questions' && (plan as any).first_purchase_only) {
      const { count } = await admin
        .from('payment_orders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('plan_id', planId).eq('status', 'paid');
      if ((count ?? 0) > 0) return json({ error: 'first_purchase_only_used' }, 409);
    }

    const amount = plan.price_paise; // paise — trusted server value

    // ── create the Razorpay order ────────────────────────────────────────────
    const receipt = `ritham_${user.id.slice(0, 8)}_${Date.now()}`;
    const auth = 'Basic ' + btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,               // paise
        currency: 'INR',
        receipt,
        notes: { user_id: user.id, kind, plan_id: planId },
      }),
    });
    if (!rzpRes.ok) {
      const detail = await rzpRes.text();
      return json({ error: 'razorpay_order_failed', detail }, 502);
    }
    const order = await rzpRes.json();

    // record it (status 'created' — becomes 'paid' after verify)
    const { error: insErr } = await admin.from('payment_orders').insert({
      user_id: user.id,
      kind,
      plan_id: planId,
      amount_paise: amount,
      currency: 'INR',
      razorpay_order_id: order.id,
      status: 'created',
    });
    if (insErr) return json({ error: 'order_record_failed', detail: insErr.message }, 500);

    return json({
      order_id: order.id,     // Razorpay order id → RazorpayCheckout.open({ order_id })
      amount,                 // paise
      currency: 'INR',
      key_id: RZP_KEY_ID,     // publishable key for the checkout sheet
    });
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});
