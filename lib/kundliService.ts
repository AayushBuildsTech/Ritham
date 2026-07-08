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
  dignity?: 'Exalted' | 'Debilitated' | 'Own sign' | 'Neutral';
}

export interface HouseLord {
  house: number;
  sign: string;
  lord: string;
  lord_house: number;
  lord_sign: string;
}
export interface Yoga { name: string; nature: 'benefic' | 'caution'; detail: string }
export interface DashaPeriod { lord: string; start: string; end: string }

// ── Rich VedAstro depth (chart_facts) — present when source === 'vedastro' (§1). ──
// Client-side mirror of the shape built in supabase/functions/_shared/vedastro.ts.
export interface GrahaFact {
  graha: string; sign: string; sign_degree: string; house: number;
  nakshatra: string; pada: number;
  retrograde: boolean; combust: boolean;
  dignity: 'Exalted' | 'Debilitated' | 'Own sign' | 'Neutral';
  vargottama: boolean; navamsa_sign: string; dashamsa_sign: string;
  shadbala: string; strong: boolean; longitude: number;
}
export interface DoshaFact { name: string; present: boolean; detail: string }
export interface ChartFacts {
  provider: 'vedastro'; ayanamsa: string;
  lagna: string; lagna_lord: { graha: string; sign: string; house: number };
  moon_sign: string; sun_sign: string; nakshatra: string; pada: number;
  grahas: GrahaFact[]; houses: HouseLord[]; yogas: Yoga[]; doshas: DoshaFact[];
  divisional: { d9: Record<string, string>; d10: Record<string, string> };
  dasha_timeline: DashaPeriod[]; moon_longitude: number; birth_iso: string;
  latitude: number; longitude: number;
}

export interface Kundli {
  lagna: string; // Ascendant sign
  moon_sign: string; // Rashi (Moon sign)
  sun_sign: string;
  nakshatra: string; // birth star
  placements: Placement[];
  summary: string;
  // 'vedastro' = VedAstro (Swiss Ephemeris) primary; 'lahiri' = local fallback engine.
  source: 'vedastro' | 'lahiri' | 'mock' | 'prokerala' | 'vedicastroapi';
  computed_at: string;
  // Rich fields (engine v2 = local rich; v3 = VedAstro). Optional so legacy thin charts
  // still type-check; getKundli() self-heals thin/mock charts on next load.
  engine_version?: 2 | 3;
  pada?: number;
  lagna_lord?: { graha: string; sign: string; house: number };
  house_lords?: HouseLord[];
  yogas?: Yoga[];
  dasha_timeline?: DashaPeriod[];
  birth_iso?: string;
  moon_longitude?: number;
  latitude?: number;
  longitude?: number;
  // Full VedAstro depth (§1) — present when source === 'vedastro' (engine_version 3).
  chart_facts?: ChartFacts;
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
      birth_place: p.birth_place,
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
 * it's a legacy mock chart, OR a "thin" chart from before the rich engine (no dasha
 * timeline). Either is transparently recomputed with the current engine and re-cached
 * (self-healing for profiles created before each engine upgrade).
 */
export async function getKundli(profile: ProfileRow): Promise<Kundli> {
  const k = profile.kundli_chart;
  // A chart is "rich enough" if it carries a dasha timeline (engine v2 local OR v3
  // VedAstro). Only thin/mock charts are recomputed — and a recompute always prefers
  // VedAstro (the `kundli` fn tries it first), so a thin chart heals straight to v3.
  // (v2 local-fallback charts are NOT force-refreshed here to avoid hammering VedAstro
  //  on every view; the Kundli screen offers an explicit refresh via refreshKundli.)
  const rich = !!k && (k.engine_version === 2 || k.engine_version === 3) && Array.isArray(k.dasha_timeline);
  if (k && profile.kundli_source && profile.kundli_source !== 'mock' && rich) {
    return k;
  }
  return computeAndStoreKundli(profile);
}

/** Alias for the §0 client surface — the rich Kundli for a profile. */
export const getRichKundli = getKundli;

/** Force a fresh VedAstro pull (used by the Kundli screen's refresh action). */
export const refreshKundli = computeAndStoreKundli;

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

// ── §0 single client surface ────────────────────────────────────────────────────
// kundliService is the app's single documented entry point for Vedic data. These thin
// delegators wrap the per-feature client services; ALL of them ultimately reach
// VedAstro through the ONE server module (supabase/functions/_shared/vedastro.ts), so
// swapping providers later touches only that file. (getRichKundli/refreshKundli above.)
export { getPanchang as getDailyPanchang } from './panchangService';
export { getMuhurats as getMuhuratWindows } from './muhuratService';
export { getNumerology } from './numerologyService';

/**
 * Compute a partner's chart for matchmaking (Guna Milan). The self chart comes from the
 * caller's profile; the Ashtakoot scoring itself runs server-side in the `report` fn
 * (rule #2). Routed through this service so all chart data has one entry point (rule #1).
 */
export async function getGunaMatch(partner: BirthProfile): Promise<Kundli> {
  return computeKundli(partner);
}
