// kundliService — the ONLY place the app obtains Kundli (birth chart) data.
// Non-negotiable rule #1: nothing else may compute or fetch a chart directly.
//
// Today this returns a DETERMINISTIC MOCK chart (stable per birth details) so the
// full Phase 2 flow works without a paid API. When real credentials exist, replace
// ONLY `fetchKundliFromProvider` below with a call to a Supabase Edge Function
// (keys stay server-side) — nothing else in the app needs to change.
//
// Caching (rule #4): once computed, the chart is stored on the profile row and
// reused, so we never recompute / re-bill.

import { supabase } from './supabase';

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
  source: 'mock' | 'prokerala' | 'vedicastroapi';
  computed_at: string;
}

// 12 Rashis (English + Sanskrit)
const SIGNS = [
  'Aries (Mesha)', 'Taurus (Vrishabha)', 'Gemini (Mithuna)', 'Cancer (Karka)',
  'Leo (Simha)', 'Virgo (Kanya)', 'Libra (Tula)', 'Scorpio (Vrishchika)',
  'Sagittarius (Dhanu)', 'Capricorn (Makara)', 'Aquarius (Kumbha)', 'Pisces (Meena)',
];

// 27 Nakshatras
const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
];

// 9 Grahas
const GRAHAS = [
  'Sun (Surya)', 'Moon (Chandra)', 'Mars (Mangala)', 'Mercury (Budha)',
  'Jupiter (Guru)', 'Venus (Shukra)', 'Saturn (Shani)', 'Rahu', 'Ketu',
];

// ── Deterministic PRNG so the same birth details always yield the same chart ──
function hashString(s: string): number {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── THE SINGLE SWAP POINT ─────────────────────────────────────────────────────
// Replace this function body with an Edge Function call when a real Kundli API is
// available. Signature and return shape must stay identical.
async function fetchKundliFromProvider(p: BirthProfile): Promise<Kundli> {
  const seed = hashString(
    `${p.dob}|${p.tob}|${p.latitude.toFixed(4)}|${p.longitude.toFixed(4)}|${p.name.trim().toLowerCase()}`,
  );
  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const signIndex = (s: string) => SIGNS.indexOf(s);

  const lagna = pick(SIGNS);
  const lagnaIdx = signIndex(lagna);

  const placements: Placement[] = GRAHAS.map((graha) => {
    const sign = pick(SIGNS);
    const house = ((signIndex(sign) - lagnaIdx + 12) % 12) + 1;
    return { graha, sign, house };
  });

  const moon_sign = placements[1].sign; // Moon
  const sun_sign = placements[0].sign; // Sun
  const nakshatra = pick(NAKSHATRAS);

  const summary = buildSummary(p.name, lagna, moon_sign, sun_sign, nakshatra);

  return {
    lagna,
    moon_sign,
    sun_sign,
    nakshatra,
    placements,
    summary,
    source: 'mock',
    computed_at: new Date().toISOString(),
  };
}

// A factual, non-predictive summary. In Phase 3 the AI narrates from these facts;
// it must never compute placements itself (rule #2).
function buildSummary(
  name: string,
  lagna: string,
  moon: string,
  sun: string,
  nakshatra: string,
): string {
  const first = name.trim().split(/\s+/)[0] || 'Your';
  return (
    `${first}'s birth chart shows the Ascendant (Lagna) rising in ${lagna}. ` +
    `The Moon — which in Vedic astrology governs the mind and emotions — is placed in ${moon}, ` +
    `making this the Rashi (Moon sign). The Sun is positioned in ${sun}. ` +
    `The birth star (Nakshatra) is ${nakshatra}. ` +
    `These core placements form the foundation for personalised horoscope and consultation readings.`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a Kundli from raw birth details WITHOUT persisting it. Used for a
 * matchmaking partner, who has no profile row of their own. Still routed through
 * this service so rule #1 (one entry point for chart data) holds — when the real
 * provider is wired in, it swaps at `fetchKundliFromProvider` for this path too.
 */
export async function computeKundli(birth: BirthProfile): Promise<Kundli> {
  return fetchKundliFromProvider(birth);
}

/**
 * Returns the Kundli for a profile row. Uses the cached chart if present;
 * otherwise computes it, stores it on the row, and returns it.
 */
export async function getKundli(profile: ProfileRow): Promise<Kundli> {
  if (profile.kundli_chart && profile.kundli_source) {
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
