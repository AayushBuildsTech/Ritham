// paymentService — client wrapper around the Razorpay Edge Functions.
//
// Flow (rule #3 — the client never sets prices or grants entitlements):
//   1. createOrder(kind, planId)  → create-order fn returns a Razorpay order_id
//   2. RazorpayCheckout.open(...)  → user pays; Razorpay returns a signed payload
//   3. verifyPayment(payload)      → verify-payment fn checks the HMAC + grants
//
// The two Edge Function slugs below must match what Supabase deployed them as.
// The dashboard "Via Editor" deploy can auto-rename a function (that's how the
// chat fn became `bright-processor`). If create-order / verify-payment get
// different slugs on deploy, update CREATE_ORDER_FN / VERIFY_PAYMENT_FN here.

import RazorpayCheckout from 'react-native-razorpay';
import { supabase } from './supabase';
import { track } from './analytics';

const CREATE_ORDER_FN = 'create-order';
const VERIFY_PAYMENT_FN = 'verify-payment';

export type PackKind = 'questions' | 'time' | 'report' | 'call' | 'puja';

export interface Balance {
  questions: number;    // remaining questions across active question packs
  seconds: number;      // remaining seconds across unused chat time packs
  callSeconds: number;  // remaining seconds across active voice-call packs
}

export interface PurchaseResult {
  ok: boolean;
  error?: string;      // machine code: 'cancelled' | 'first_purchase_only_used' | ...
  balance?: Balance;
}

interface CreateOrderResp {
  order_id: string;
  amount: number; // paise
  currency: string;
  key_id: string;
  error?: string;
}

// Full purchase flow for one pack. Returns the fresh balance on success.
export async function purchasePack(
  kind: PackKind,
  planId: string,
  prefill?: { contact?: string; email?: string; name?: string },
): Promise<PurchaseResult> {
  // 1. create the order server-side
  const { data, error } = await supabase.functions.invoke<CreateOrderResp>(CREATE_ORDER_FN, {
    body: { kind, planId },
  });
  if (error || !data || data.error || !data.order_id) {
    return { ok: false, error: data?.error ?? error?.message ?? 'order_failed' };
  }

  // 2. open the Razorpay checkout sheet (native)
  let checkout: any;
  try {
    checkout = await RazorpayCheckout.open({
      key: data.key_id,
      order_id: data.order_id,
      amount: data.amount,
      currency: data.currency,
      name: 'Ritham',
      description: 'Chat pack',
      theme: { color: '#d9a441' },
      prefill: {
        contact: prefill?.contact ?? '',
        email: prefill?.email ?? '',
        name: prefill?.name ?? '',
      },
    });
  } catch (e: any) {
    // user dismissed or payment failed — nothing was granted server-side
    const desc = e?.description ?? e?.error?.description ?? '';
    const cancelled = e?.code === 0 || /cancel/i.test(String(desc));
    return { ok: false, error: cancelled ? 'cancelled' : 'payment_failed' };
  }

  // 3. verify server-side → grant entitlement
  const { data: v, error: vErr } = await supabase.functions.invoke<{ ok?: boolean; error?: string; balance?: Balance }>(
    VERIFY_PAYMENT_FN,
    {
      body: {
        razorpay_order_id: checkout.razorpay_order_id,
        razorpay_payment_id: checkout.razorpay_payment_id,
        razorpay_signature: checkout.razorpay_signature,
      },
    },
  );
  if (vErr || !v?.ok) return { ok: false, error: v?.error ?? vErr?.message ?? 'verify_failed' };

  track('purchase', { kind, planId, amount_paise: data.amount });
  return { ok: true, balance: v.balance };
}

// ── Puja booking checkout ─────────────────────────────────────────────────────
// A puja is a fulfillment order (not an entitlement): create-order records a
// puja_bookings row + Razorpay order; verify-payment flips it to 'paid' and
// notifies the owner. The client sends the full sankalp/delivery detail; the
// server recomputes the price from tier + add-ons + clamped dakshina (rule #3).
export interface PujaBookingPayload {
  pujaId: string;
  tierId: string;
  addOnIds: string[];
  dakshinaPaise: number;
  profileId?: string | null;
  preferredDate?: string | null; // YYYY-MM-DD
  sankalp: { devoteeNames: string[]; gotra?: string; gotras?: string[]; wish?: string };
  delivery: { phone?: string };
}

export interface PujaPurchaseResult {
  ok: boolean;
  error?: string; // 'cancelled' | 'payment_failed' | server error code
}

export async function purchasePuja(
  payload: PujaBookingPayload,
  prefill?: { contact?: string; email?: string; name?: string },
): Promise<PujaPurchaseResult> {
  // 1. create the order + pending booking server-side
  const { data, error } = await supabase.functions.invoke<CreateOrderResp>(CREATE_ORDER_FN, {
    body: { kind: 'puja', puja: payload },
  });
  if (error || !data || data.error || !data.order_id) {
    return { ok: false, error: data?.error ?? error?.message ?? 'order_failed' };
  }

  // 2. open the Razorpay checkout sheet (native)
  let checkout: any;
  try {
    checkout = await RazorpayCheckout.open({
      key: data.key_id,
      order_id: data.order_id,
      amount: data.amount,
      currency: data.currency,
      name: 'Ritham',
      description: 'Puja booking',
      theme: { color: '#FF007F' },
      prefill: {
        contact: prefill?.contact ?? '',
        email: prefill?.email ?? '',
        name: prefill?.name ?? '',
      },
    });
  } catch (e: any) {
    const desc = e?.description ?? e?.error?.description ?? '';
    const cancelled = e?.code === 0 || /cancel/i.test(String(desc));
    return { ok: false, error: cancelled ? 'cancelled' : 'payment_failed' };
  }

  // 3. verify server-side → booking flips to 'paid'
  const { data: v, error: vErr } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    VERIFY_PAYMENT_FN,
    {
      body: {
        razorpay_order_id: checkout.razorpay_order_id,
        razorpay_payment_id: checkout.razorpay_payment_id,
        razorpay_signature: checkout.razorpay_signature,
      },
    },
  );
  if (vErr || !v?.ok) return { ok: false, error: v?.error ?? vErr?.message ?? 'verify_failed' };

  track('purchase', { kind: 'puja', planId: payload.tierId, amount_paise: data.amount });
  return { ok: true };
}

// Read the current entitlement balance directly (RLS: user sees only their own rows).
export async function getBalance(): Promise<Balance> {
  const { data } = await supabase
    .from('entitlements_ledger')
    .select('kind, questions_remaining, seconds_total, seconds_used, consumed_at')
    .is('consumed_at', null);
  let questions = 0, seconds = 0, callSeconds = 0;
  for (const r of data ?? []) {
    if (r.kind === 'questions') questions += r.questions_remaining ?? 0;
    if (r.kind === 'time') seconds += r.seconds_total ?? 0;
    if (r.kind === 'call') callSeconds += Math.max(0, (r.seconds_total ?? 0) - (r.seconds_used ?? 0));
  }
  return { questions, seconds, callSeconds };
}
