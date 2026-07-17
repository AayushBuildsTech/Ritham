// Edge Function: puja-admin
// Owner-only backend for the in-app Puja Admin. Every call is gated: the caller's
// JWT email must be in the OWNER_EMAILS secret (comma-separated). It then uses the
// service role to read ALL puja bookings, update a booking's status, or set the
// scheduled slot (date + cutoff) — none of which is exposed to normal users.
//
// Secrets: OWNER_EMAILS (e.g. "you@gmail.com,partner@gmail.com")
//          + standard SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ALLOWED_STATUS = new Set(['pending_payment', 'paid', 'in_progress', 'completed', 'cancelled', 'refunded']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const owners = (Deno.env.get('OWNER_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const email = (user.email ?? '').toLowerCase();
    if (!email || !owners.includes(email)) return json({ error: 'forbidden' }, 403);

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const action = String(body.action ?? '');

    // ── list all bookings (optionally filtered by status) ────────────────────
    if (action === 'list_bookings') {
      let q = admin.from('puja_bookings')
        .select('id, tier_id, devotee_names, gotra, gotras, add_on_ids, dakshina_paise, amount_paise, contact_phone, puja_wish, preferred_date, status, created_at')
        .order('created_at', { ascending: false });
      if (body.status && ALLOWED_STATUS.has(String(body.status))) q = q.eq('status', String(body.status));
      const { data, error } = await q;
      if (error) return json({ error: 'list_failed', detail: error.message }, 500);
      return json({ ok: true, bookings: data ?? [] });
    }

    // ── update a booking's status ────────────────────────────────────────────
    if (action === 'update_booking_status') {
      const bookingId = String(body.bookingId ?? '');
      const status = String(body.status ?? '');
      if (!bookingId || !ALLOWED_STATUS.has(status)) return json({ error: 'bad_input' }, 400);
      const { error } = await admin.from('puja_bookings').update({ status }).eq('id', bookingId);
      if (error) return json({ error: 'update_failed', detail: error.message }, 500);
      return json({ ok: true });
    }

    // ── set the scheduled slot (date + cutoff days) ──────────────────────────
    if (action === 'set_slot') {
      const pujaId = String(body.pujaId ?? 'pitra_dosha_rameswaram');
      const pujaDate = String(body.pujaDate ?? ''); // YYYY-MM-DD
      const cutoffDays = Math.max(0, Math.min(30, Math.floor(Number(body.cutoffDays) || 3)));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pujaDate)) return json({ error: 'bad_date' }, 400);
      // bookings close at 00:00 IST of the day after the last booking day
      // (= pujaDate − (cutoffDays − 1) days). All computed in IST.
      const pujaMidnightIST = new Date(`${pujaDate}T00:00:00+05:30`).getTime();
      if (Number.isNaN(pujaMidnightIST)) return json({ error: 'bad_date' }, 400);
      const closeMs = pujaMidnightIST - (cutoffDays - 1) * 86400000;
      if (closeMs <= Date.now()) return json({ error: 'date_in_past' }, 400);
      const bookingCloseAt = new Date(closeMs).toISOString();
      const { error } = await admin.from('puja_slots')
        .upsert({ puja_id: pujaId, puja_date: pujaDate, booking_close_at: bookingCloseAt }, { onConflict: 'puja_id' });
      if (error) return json({ error: 'set_slot_failed', detail: error.message }, 500);
      return json({ ok: true, puja_date: pujaDate, booking_close_at: bookingCloseAt });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});
