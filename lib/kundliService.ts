// kundliService — the ONLY place the app obtains Kundli (birth chart) data.
// Non-negotiable rule #1: nothing else may compute or fetch a chart directly.
//
// Charts are computed by the `kundli` Supabase Edge Function, which runs a real
// Vedic sidereal astronomy engine (Lahiri ayanamsa, whole-sign houses) — no mock,
// no external API, no key, no per-chart cost. This client only sends birth details
// and caches the returned chart on the profile row (rule #4: never recompute).

import { supabase } from './supabase';

// Supabase Edge Function slug for chart computation.
const KUNDLI_FUNCTION = 'kundli';

export interface BirthProfile {
  name: string;
  gender: 'male' | 'female' | 'other';
  dob: string; // YYYY-MM-DD
  tob: string; // HH:MM:SS (24h)
  birth_place: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

// A row from public.profiles (birth details + any cached Kundli).
export interface ProfileRow extends BirthProfile {
  id: string;
  user_id: string;
  relation?: string; // 'self' | 'spouse' | 'son' | … (migration 013)
  kundli_chart: Kundli | null;
  kundli_summary: string | null;
  kundli_source: string | null;
  kundli_computed_at: string | null;
}

export interface Placement {
  graha: string; // planet (Sanskrit + English)
  sign: string; // Rashi it occupies
  house: number; // 1..12 relative to Lagna
}

export interface Kundli {
  lagna: string; // Ascendant sign
  moon_sign: string; // Rashi (Moon sign)
  sun_sign: string;
  nakshatra: string; // birth star
  placements: Placement[];
  summary: string;
  source: 'lahiri' | 'mock' | 'prokerala' | 'vedicastroapi';
  computed_at: string;
}

// ── THE SINGLE ENTRY POINT for chart data ───────────────────────────────────────
// Calls the `kundli` Edge Function, which holds the astronomy engine server-side.
async function fetchKundliFromProvider(p: BirthProfile): Promise<Kundli> {
  const { data, error } = await supabase.functions.invoke(KUNDLI_FUNCTION, {
    body: {
      name: p.name,
      gender: p.gender,
      dob: p.dob,
      tob: p.tob,
      latitude: p.latitude,
      longitude: p.longitude,
      timezone: p.timezone,
    },
  });
  if (error) throw new Error(`Kundli service failed: ${error.message ?? 'request_failed'}`);
  const kundli = (data as { kundli?: Kundli; error?: string })?.kundli;
  if (!kundli) {
    const detail = (data as { error?: string })?.error ?? 'no_chart_returned';
    throw new Error(`Kundli service error: ${detail}`);
  }
  return kundli;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a Kundli from raw birth details WITHOUT persisting it. Used for a
 * matchmaking partner, who has no profile row of their own. Still routed through
 * this service so rule #1 (one entry point for chart data) holds.
 */
export async function computeKundli(birth: BirthProfile): Promise<Kundli> {
  return fetchKundliFromProvider(birth);
}

/**
 * Returns the Kundli for a profile row. Uses the cached chart if present — UNLESS
 * it's a legacy mock chart, which is transparently recomputed with the real engine
 * and re-cached (self-healing for profiles created before the real engine landed).
 */
export async function getKundli(profile: ProfileRow): Promise<Kundli> {
  if (profile.kundli_chart && profile.kundli_source && profile.kundli_source !== 'mock') {
    return profile.kundli_chart;
  }
  return computeAndStoreKundli(profile);
}

/** Force (re)compute the Kundli and persist it to the profile row. */
export async function computeAndStoreKundli(profile: ProfileRow): Promise<Kundli> {
  const kundli = await fetchKundliFromProvider(profile);

  const { error } = await supabase
    .from('profiles')
    .update({
      kundli_chart: kundli,
      kundli_summary: kundli.summary,
      kundli_source: kundli.source,
      kundli_computed_at: kundli.computed_at,
    })
    .eq('id', profile.id);

  if (error) throw new Error(`Failed to cache Kundli: ${error.message}`);
  return kundli;
}
