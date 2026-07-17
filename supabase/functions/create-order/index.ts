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
  life:        { price_paise: 29900 },
  career:      { price_paise: 9900 },
  love:        { price_paise: 7900 },
  health:      { price_paise: 6900 },
  education:   { price_paise: 6900 },
  vastu:       { price_paise: 12900 },
  matchmaking: { price_paise: 14900 },
  pastlife:    { price_paise: 9900 },
  palm:        { price_paise: 9900 },
};

// ── Puja booking pricing (kind 'puja'). Mirror of config/pujas.ts ─────────────
// A puja total = tier price + Σ selected add-on prices + clamped dakshina.
const PUJA_TIERS: Record<string, { price_paise: number }> = {
  pkg_individual_personal: { price_paise: 299900 },
  pkg_couple_blessing:     { price_paise: 449900 },
  pkg_family_protection:   { price_paise: 599900 },
  pkg_joint_lineage:       { price_paise: 749900 },
};
const PUJA_ADDONS: Record<string, { price_paise: number }> = {
  kaka_bali_seva:      { price_paise: 10100 },
  gau_seva_pitru:      { price_paise: 35100 },
  tila_daan_homam:     { price_paise: 9100 },
  vastra_daan_brahmin: { price_paise: 40100 },
  brahman_bhojan:      { price_paise: 50100 },
};
const PUJA_IDS = new Set(['pitra_dosha_rameswaram']);
const DAKSHINA_MAX_PAISE = 5100000; // ₹51,000 ceiling (reject abuse)
// Next puja slot — mirror of config/pujas.ts NEXT_SLOT. Bookings past the close
// instant are rejected server-side (the client also blocks). Update each cycle.
const PUJA_SLOT = { pujaDate: '2026-10-03', bookingCloseISO: '2026-10-01T00:00:00+05:30' };

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

    const body = await req.json();
    const { kind, planId } = body;
    if (kind !== 'questions' && kind !== 'time' && kind !== 'report' && kind !== 'call' && kind !== 'puja') {
      return json({ error: 'bad_kind' }, 400);
    }

    // ── Puja bookings compute their total from tier + add-ons + dakshina ──────
    // and store plan_id = the tier id (to fit the existing payment_orders shape).
    let amount = 0;
    let orderPlanId = planId as string;
    let pujaData: {
      pujaId: string; tierId: string; addOnIds: string[]; dakshinaPaise: number;
    } | null = null;
    let pujaSlotDate: string | null = null;

    if (kind === 'puja') {
      const p = body.puja ?? {};
      const pujaId = String(p.pujaId ?? '');
      const tierId = String(p.tierId ?? '');
      const addOnIds: string[] = Array.isArray(p.addOnIds) ? p.addOnIds.map(String) : [];
      if (!PUJA_IDS.has(pujaId)) return json({ error: 'unknown_puja' }, 400);
      // slot date/cutoff — prefer the owner-editable DB row, fall back to config
      let slotCloseMs = new Date(PUJA_SLOT.bookingCloseISO).getTime();
      pujaSlotDate = PUJA_SLOT.pujaDate;
      const { data: slotRow } = await admin.from('puja_slots')
        .select('puja_date, booking_close_at').eq('puja_id', pujaId).maybeSingle();
      if (slotRow?.puja_date && slotRow?.booking_close_at) {
        pujaSlotDate = String(slotRow.puja_date);
        slotCloseMs = new Date(slotRow.booking_close_at).getTime();
      }
      // reject bookings once the slot's cutoff has passed
      if (Date.now() >= slotCloseMs) return json({ error: 'slot_closed' }, 409);
      const tier = PUJA_TIERS[tierId];
      if (!tier) return json({ error: 'unknown_tier' }, 400);
      // reject any add-on id we don't recognise (rule #3 — validate everything)
      for (const id of addOnIds) if (!PUJA_ADDONS[id]) return json({ error: 'unknown_addon', detail: id }, 400);
      const addOnTotal = addOnIds.reduce((s, id) => s + PUJA_ADDONS[id].price_paise, 0);
      const dakshina = Math.max(0, Math.min(Math.floor(Number(p.dakshinaPaise) || 0), DAKSHINA_MAX_PAISE));
      amount = tier.price_paise + addOnTotal + dakshina;
      orderPlanId = tierId;
      pujaData = { pujaId, tierId, addOnIds, dakshinaPaise: dakshina };
    } else {
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
      amount = plan.price_paise; // paise — trusted server value
    }

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
        notes: { user_id: user.id, kind, plan_id: orderPlanId },
      }),
    });
    if (!rzpRes.ok) {
      const detail = await rzpRes.text();
      return json({ error: 'razorpay_order_failed', detail }, 502);
    }
    const order = await rzpRes.json();

    // record it (status 'created' — becomes 'paid' after verify)
    const { data: orderRow, error: insErr } = await admin.from('payment_orders').insert({
      user_id: user.id,
      kind,
      plan_id: orderPlanId,
      amount_paise: amount,
      currency: 'INR',
      razorpay_order_id: order.id,
      status: 'created',
    }).select('id').single();
    if (insErr || !orderRow) { console.error('create-order order insert failed:', insErr?.message); return json({ error: 'order_record_failed' }, 500); }

    // For a puja, write the fulfillment booking (status pending_payment). It flips
    // to 'paid' in verify-payment. Sankalp/delivery detail is captured client-side.
    if (kind === 'puja' && pujaData) {
      const s = body.puja.sankalp ?? {};
      const d = body.puja.delivery ?? {};
      const devoteeNames: string[] = Array.isArray(s.devoteeNames)
        ? s.devoteeNames.map((n: unknown) => String(n).trim()).filter(Boolean) : [];
      const gotras: string[] = Array.isArray(s.gotras)
        ? s.gotras.map((g: unknown) => String(g).trim()).filter(Boolean) : [];
      const { error: bookErr } = await admin.from('puja_bookings').insert({
        user_id: user.id,
        profile_id: body.puja.profileId ?? null,
        order_id: orderRow.id,
        puja_id: pujaData.pujaId,
        tier_id: pujaData.tierId,
        add_on_ids: pujaData.addOnIds,
        dakshina_paise: pujaData.dakshinaPaise,
        amount_paise: amount,
        currency: 'INR',
        devotee_names: devoteeNames,
        gotra: gotras[0] ?? (s.gotra ? String(s.gotra).trim() : null),
        gotras,
        puja_wish: s.wish ? String(s.wish).trim() : null,
        // Pitru rites deliver no prasad — only the contact number for the video & updates.
        want_prasad: false,
        contact_phone: d.phone ? String(d.phone).trim() : null,
        address: null,
        preferred_date: pujaSlotDate ?? PUJA_SLOT.pujaDate, // the slot this booking is for
        status: 'pending_payment',
      });
      if (bookErr) { console.error('create-order booking insert failed:', bookErr.message); return json({ error: 'booking_record_failed' }, 500); }
    }

    return json({
      order_id: order.id,     // Razorpay order id → RazorpayCheckout.open({ order_id })
      amount,                 // paise
      currency: 'INR',
      key_id: RZP_KEY_ID,     // publishable key for the checkout sheet
    });
  } catch (e) {
    console.error('create-order error:', String((e as Error)?.message ?? e));
    return json({ error: 'server_error' }, 500);
  }
});
