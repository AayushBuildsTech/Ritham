// Puja slot — read the scheduled date/cutoff from the DB (owner-editable), with
// the hardcoded config as a fallback. Also the owner-admin API wrappers.
import { supabase } from './supabase';
import { NEXT_SLOT } from '../config/pujas';

const PUJA_ID = 'pitra_dosha_rameswaram';

export interface PujaSlot { pujaDateISO: string; bookingCloseISO: string }
const DEFAULT: PujaSlot = { pujaDateISO: NEXT_SLOT.pujaDateISO, bookingCloseISO: NEXT_SLOT.bookingCloseISO };
let cache: PujaSlot | null = null;

export async function fetchPujaSlot(force = false): Promise<PujaSlot> {
  if (cache && !force) return cache;
  try {
    const { data } = await supabase
      .from('puja_slots').select('puja_date, booking_close_at')
      .eq('puja_id', PUJA_ID).maybeSingle();
    if (data?.puja_date && data?.booking_close_at) {
      cache = { pujaDateISO: `${data.puja_date}T06:00:00+05:30`, bookingCloseISO: new Date(data.booking_close_at).toISOString() };
      return cache;
    }
  } catch { /* offline / not migrated yet → fall back */ }
  return cache ?? DEFAULT;
}
export function clearSlotCache() { cache = null; }

// Timezone-safe display of a slot date (parsed from the YYYY-MM-DD portion).
const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON_HI = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_HI = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
export function formatSlotLabel(pujaDateISO: string, isHindi: boolean): string {
  const m = pujaDateISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return pujaDateISO;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return isHindi ? `${DOW_HI[dow]}, ${d} ${MON_HI[mo - 1]} ${y}` : `${DOW_EN[dow]}, ${d} ${MON_EN[mo - 1]} ${y}`;
}

// ── Owner admin API (every call is gated server-side to OWNER_EMAILS) ─────────
const ADMIN_FN = 'puja-admin';

export interface AdminBooking {
  id: string; tier_id: string; devotee_names: string[]; gotra: string | null; gotras: string[];
  add_on_ids: string[]; dakshina_paise: number; amount_paise: number; contact_phone: string | null;
  puja_wish: string | null; preferred_date: string | null; status: string; created_at: string;
}

export async function adminListBookings(status?: string): Promise<{ ok: boolean; bookings?: AdminBooking[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke(ADMIN_FN, { body: { action: 'list_bookings', status } });
  if (error || (data as any)?.error) return { ok: false, error: (data as any)?.error ?? error?.message ?? 'failed' };
  return { ok: true, bookings: (data as any).bookings ?? [] };
}
export async function adminUpdateStatus(bookingId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke(ADMIN_FN, { body: { action: 'update_booking_status', bookingId, status } });
  if (error || (data as any)?.error) return { ok: false, error: (data as any)?.error ?? error?.message ?? 'failed' };
  return { ok: true };
}
export async function adminSetSlot(pujaDate: string, cutoffDays: number): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke(ADMIN_FN, { body: { action: 'set_slot', pujaDate, cutoffDays } });
  if (error || (data as any)?.error) return { ok: false, error: (data as any)?.error ?? error?.message ?? 'failed' };
  clearSlotCache();
  return { ok: true };
}
