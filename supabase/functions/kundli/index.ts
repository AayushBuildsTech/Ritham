// Edge Function: kundli
// The ONLY place a birth chart is fetched/computed. VedAstro (api.vedastro.org,
// Swiss Ephemeris / NASA JPL) is the source of truth via the single integration
// module ../_shared/vedastro.ts (spec §0 / rule #1); if VedAstro is unavailable or
// rate-limited, it falls back to the self-contained local Vedic engine
// (../_shared/astro.ts + ../_shared/kundliSummary.ts, Lahiri sidereal) so onboarding
// NEVER completes with a blank/partial chart (spec §8).
//
// The returned chart is RICH: Lagna + its lord, Rashi, Nakshatra + pada, Sun sign,
// all 9 placements with dignity/retrograde/combust, the 12 house lords, D9/D10
// divisional signs, natal yogas/doshas, the full Vimshottari mahadasha timeline, and
// a `chart_facts` object + dense `summary`. Time-dependent facts (current dasha,
// gochar transits, Sade Sati) are derived fresh at chat time — never cached here.
//
// The client sends birth details and receives a chart; persistence (caching onto the
// profile row) stays on the client. Auth is required so the endpoint can't be hit
// anonymously. The VEDASTRO_API_KEY secret lives here (server-side), never in the app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';


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
    // Require a valid Supabase JWT (any signed-in user).
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) return json({ error: 'unauthorized' }, 401);

    const body = await req.json();
    const { name, gender, dob, tob, latitude, longitude, timezone, birth_place } = body ?? {};
    if (!dob || !tob || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return json({ error: 'missing_birth_details' }, 400);
    }
    const birth = {
      name: name ?? '', gender, dob, tob, latitude, longitude, birth_place,
      timezone: typeof timezone === 'string' && timezone ? timezone : 'Asia/Kolkata',
    };

    // VedAstro primary → local engine fallback (spec §8: never fail onboarding).
    let kundli: any;
    try {
      kundli = await Veda.fetchRichKundli(birth);
      // best-effort usage counter (§8) — never blocks the response
      try {
        const url = Deno.env.get('SUPABASE_URL'); const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (url && svc) await Veda.bumpVedastroUsage(createClient(url, svc), 2);
      } catch (_) { /* ignore */ }
    } catch (vedaErr) {
      console.warn('vedastro failed, falling back to local engine:', String((vedaErr as Error)?.message ?? vedaErr));
      kundli = computeRichKundli(birth);
    }

    return json({ kundli });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg === 'bad_datetime') return json({ error: 'bad_datetime' }, 400);
    return json({ error: 'server_error', detail: msg }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  INLINED ENGINE — canonical source: supabase/functions/_shared/*.ts.
//  Inlined here because the dashboard deploy ships a single index.ts per function
//  (new _shared files do not reach the bundler). Edit the _shared/*.ts originals,
//  then run: node scripts/inline-functions.mjs
// ═══════════════════════════════════════════════════════════════════════════

// astro.ts — self-contained Vedic (sidereal) astronomy engine. SHARED across the
// kundli, panchang, and muhurat Edge Functions so the whole app agrees on one set
// of positions and one ayanamsa.
//
// Open-source, dependency-free. Computes real geocentric ecliptic longitudes for
// the Sun, Moon, the five visible planets, and the lunar nodes (Rahu/Ketu) using
// the classical Schlyter orbital-element method with the main perturbation terms,
// then converts to the SIDEREAL zodiac using the Lahiri (Chitrapaksha) ayanamsa —
// the Indian government standard for Vedic astrology. The Ascendant (Lagna) is
// derived from local sidereal time + geographic latitude; houses are whole-sign.
// Sunrise/sunset are computed from the same Sun model (see sunTimesUTC).
//
// Accuracy is at the arc-minute level over 1900–2100 — far tighter than the 30°
// (sign) and 13°20' (nakshatra) bins we place bodies into. Runs unchanged in Deno
// (the Edge Functions) and Node (the test harness).

const DEG = Math.PI / 180;
const sind = (x: number) => Math.sin(x * DEG);
const cosd = (x: number) => Math.cos(x * DEG);
const tand = (x: number) => Math.tan(x * DEG);
const asind = (x: number) => Math.asin(x) / DEG;
const acosd = (x: number) => Math.acos(x) / DEG;
const atan2d = (y: number, x: number) => Math.atan2(y, x) / DEG;

/** Normalise an angle to [0, 360). */
export function rev(x: number): number {
  return ((x % 360) + 360) % 360;
}

/** Julian Day (UT) from a JS Date (which is a UTC instant). */
export function julianDay(dateUTC: Date): number {
  return dateUTC.getTime() / 86400000 + 2440587.5;
}
const jdToDate = (jd: number): Date => new Date((jd - 2440587.5) * 86400000);
const jdToYear = (jd: number): number => 2000 + (jd - 2451545.0) / 365.25;

/** ΔT (TT − UT) in seconds — Espenak & Meeus polynomial, good for the modern era. */
function deltaTseconds(year: number): number {
  const t = year - 2000;
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

// ── Kepler solver ──────────────────────────────────────────────────────────────
function eccentricAnomaly(Mdeg: number, e: number): number {
  const M = rev(Mdeg);
  let E = M + (180 / Math.PI) * e * sind(M) * (1 + e * cosd(M));
  for (let i = 0; i < 12; i++) {
    const dE = (E - (180 / Math.PI) * e * sind(E) - M) / (1 - e * cosd(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

interface Elements {
  N: number; i: number; w: number; a: number; e: number; M: number;
}

/** Heliocentric ecliptic rectangular coordinates + longitude/latitude/radius. */
function heliocentric(el: Elements) {
  const E = eccentricAnomaly(el.M, el.e);
  const xv = el.a * (cosd(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * sind(E);
  const v = atan2d(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const vw = v + el.w;
  const xh = r * (cosd(el.N) * cosd(vw) - sind(el.N) * sind(vw) * cosd(el.i));
  const yh = r * (sind(el.N) * cosd(vw) + cosd(el.N) * sind(vw) * cosd(el.i));
  const zh = r * (sind(vw) * sind(el.i));
  const lon = rev(atan2d(yh, xh));
  const lat = atan2d(zh, Math.sqrt(xh * xh + yh * yh));
  return { lon, lat, r };
}

// ── Ayanamsa (Lahiri / Chitrapaksha) ───────────────────────────────────────────
// Anchored to the Swiss Ephemeris Lahiri value at J2000 with the observed
// precession rate; matches Lahiri to arc-second level across the modern era.
export function lahiriAyanamsa(jd: number): number {
  return 23.853009 + ((jd - 2451545.0) / 365.25) * 0.0139721;
}

// ── Mean obliquity of the ecliptic (Meeus) ─────────────────────────────────────
function obliquity(T: number): number {
  return 23.439291 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
}

// ── Greenwich Mean Sidereal Time in degrees (Meeus), from JD(UT) ────────────────
function gmst(jdUT: number): number {
  const D = jdUT - 2451545.0;
  const T = D / 36525;
  return rev(280.46061837 + 360.98564736629 * D + 0.000387933 * T * T - (T * T * T) / 38710000);
}

// ── Sun's apparent ecliptic longitude + obliquity at a UT instant ───────────────
function sunEcliptic(jdUT: number): { lon: number; ecl: number } {
  const jdTT = jdUT + deltaTseconds(jdToYear(jdUT)) / 86400;
  const d = jdTT - 2451543.5;
  const T = (jdUT - 2451545.0) / 36525;
  const wSun = 282.9404 + 4.70935e-5 * d;
  const eSun = 0.016709 - 1.151e-9 * d;
  const MSun = rev(356.047 + 0.9856002585 * d);
  const E = eccentricAnomaly(MSun, eSun);
  const xv = cosd(E) - eSun;
  const yv = Math.sqrt(1 - eSun * eSun) * sind(E);
  const v = atan2d(yv, xv);
  return { lon: rev(v + wSun), ecl: obliquity(T) };
}

/**
 * Sunrise / sunset as UTC instants for a civil date at a location.
 * @param y,mo,d  the local (IST) calendar date — India has no DST, and for its
 *                longitudes both events fall on the same UTC date.
 * @param latDeg  latitude, north positive
 * @param lonEast longitude, EAST positive
 * Returns null for either event if the sun stays up/down (not the case in India).
 */
export function sunTimesUTC(
  y: number, mo: number, d: number, latDeg: number, lonEast: number,
): { riseUTC: Date | null; setUTC: Date | null } {
  const h0 = -0.833; // horizon altitude incl. refraction + solar semi-diameter
  // Start at local noon UTC and iterate to the meridian transit (Sun hour angle 0).
  let transitJD = Date.UTC(y, mo - 1, d, 12, 0, 0) / 86400000 + 2440587.5;
  let dec = 0;
  for (let i = 0; i < 3; i++) {
    const s = sunEcliptic(transitJD);
    const ra = rev(atan2d(cosd(s.ecl) * sind(s.lon), cosd(s.lon)));
    dec = asind(sind(s.ecl) * sind(s.lon));
    const lha = ((gmst(transitJD) + lonEast - ra + 540) % 360) - 180; // [-180,180)
    transitJD -= lha / 360; // Sun's hour angle advances 360°/solar-day
  }
  const cosH = (sind(h0) - sind(latDeg) * sind(dec)) / (cosd(latDeg) * cosd(dec));
  if (cosH > 1 || cosH < -1) return { riseUTC: null, setUTC: null };
  const H = acosd(cosH); // degrees of hour angle from transit to the horizon
  return { riseUTC: jdToDate(transitJD - H / 360), setUTC: jdToDate(transitJD + H / 360) };
}

export interface ChartLongitudes {
  ayanamsa: number;
  tropical: Record<string, number>;  // degrees
  sidereal: Record<string, number>;  // degrees (tropical − ayanamsa)
  ascSidereal: number;
}

/**
 * Compute sidereal ecliptic longitudes for all bodies + the Ascendant.
 * @param dateUTC the instant as a UTC Date
 * @param latDeg  geographic latitude, north positive
 * @param lonEast geographic longitude, EAST positive
 */
export function computeLongitudes(dateUTC: Date, latDeg: number, lonEast: number): ChartLongitudes {
  const jdUT = julianDay(dateUTC);
  const year = dateUTC.getUTCFullYear() + (dateUTC.getUTCMonth() + 0.5) / 12;
  const jdTT = jdUT + deltaTseconds(year) / 86400;
  const d = jdTT - 2451543.5; // Schlyter day number (epoch 2000 Jan 0.0)
  const T = (jdUT - 2451545.0) / 36525;
  const ecl = obliquity(T);

  // ── Sun ───────────────────────────────────────────────────────────────────────
  const wSun = 282.9404 + 4.70935e-5 * d;
  const eSun = 0.016709 - 1.151e-9 * d;
  const MSun = rev(356.047 + 0.9856002585 * d);
  const ESun = eccentricAnomaly(MSun, eSun);
  const xvS = cosd(ESun) - eSun;
  const yvS = Math.sqrt(1 - eSun * eSun) * sind(ESun);
  const vS = atan2d(yvS, xvS);
  const rS = Math.sqrt(xvS * xvS + yvS * yvS);
  const sunLon = rev(vS + wSun);
  const Ls = rev(wSun + MSun);
  const xs = rS * cosd(sunLon);
  const ys = rS * sind(sunLon);

  // ── Moon (with the main periodic perturbations) ───────────────────────────────
  const Nm = 125.1228 - 0.0529538083 * d;
  const im = 5.1454;
  const wm = 318.0634 + 0.1643573223 * d;
  const am = 60.2666;
  const em = 0.0549;
  const Mm = rev(115.3654 + 13.0649929509 * d);
  const moon = heliocentric({ N: Nm, i: im, w: wm, a: am, e: em, M: Mm });
  const Lm = rev(Nm + wm + Mm);
  const Dm = rev(Lm - Ls);
  const Fm = rev(Lm - Nm);
  const moonLonPert =
    -1.274 * sind(Mm - 2 * Dm) + 0.658 * sind(2 * Dm) - 0.186 * sind(MSun) -
    0.059 * sind(2 * Mm - 2 * Dm) - 0.057 * sind(Mm - 2 * Dm + MSun) +
    0.053 * sind(Mm + 2 * Dm) + 0.046 * sind(2 * Dm - MSun) +
    0.041 * sind(Mm - MSun) - 0.035 * sind(Dm) - 0.031 * sind(Mm + MSun) -
    0.015 * sind(2 * Fm - 2 * Dm) + 0.011 * sind(Mm - 4 * Dm);
  const moonLon = rev(moon.lon + moonLonPert);

  // ── Planets ──────────────────────────────────────────────────────────────────
  const merc = heliocentric({
    N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.0e-8 * d, w: 29.1241 + 1.01444e-5 * d,
    a: 0.387098, e: 0.20563 + 5.59e-10 * d, M: rev(168.6562 + 4.0923344368 * d),
  });
  const venus = heliocentric({
    N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d,
    a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: rev(48.0052 + 1.6021302244 * d),
  });
  const mars = heliocentric({
    N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d,
    a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: rev(18.6021 + 0.5240207766 * d),
  });

  const Mj = rev(19.895 + 0.0830853001 * d);
  const Msa = rev(316.967 + 0.0334442282 * d);
  const jup = heliocentric({
    N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d,
    a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: Mj,
  });
  jup.lon = rev(
    jup.lon - 0.332 * sind(2 * Mj - 5 * Msa - 67.6) - 0.056 * sind(2 * Mj - 2 * Msa + 21) +
      0.042 * sind(3 * Mj - 5 * Msa + 21) - 0.036 * sind(Mj - 2 * Msa) +
      0.022 * cosd(Mj - Msa) + 0.023 * sind(2 * Mj - 3 * Msa + 52) -
      0.016 * sind(Mj - 5 * Msa - 69),
  );
  const sat = heliocentric({
    N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d,
    a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: Msa,
  });
  sat.lon = rev(
    sat.lon + 0.812 * sind(2 * Mj - 5 * Msa - 67.6) - 0.229 * cosd(2 * Mj - 4 * Msa - 2) +
      0.119 * sind(Mj - 2 * Msa - 3) + 0.046 * sind(2 * Mj - 6 * Msa - 69) +
      0.014 * sind(Mj - 3 * Msa + 32),
  );

  const geoLon = (p: { lon: number; lat: number; r: number }): number => {
    const xh = p.r * cosd(p.lat) * cosd(p.lon);
    const yh = p.r * cosd(p.lat) * sind(p.lon);
    return rev(atan2d(yh + ys, xh + xs));
  };

  const rahu = rev(Nm);
  const ketu = rev(Nm + 180);

  const tropical: Record<string, number> = {
    Sun: sunLon, Moon: moonLon, Mars: geoLon(mars), Mercury: geoLon(merc),
    Jupiter: geoLon(jup), Venus: geoLon(venus), Saturn: geoLon(sat), Rahu: rahu, Ketu: ketu,
  };

  // ── Ascendant (Lagna) ─────────────────────────────────────────────────────────
  const ramc = rev(gmst(jdUT) + lonEast);
  let asc = rev(atan2d(cosd(ramc), -(sind(ramc) * cosd(ecl) + tand(latDeg) * sind(ecl))));
  if (rev(asc - ramc) > 180) asc = rev(asc + 180);
  tropical.Ascendant = asc;

  const ayan = lahiriAyanamsa(jdUT);
  const sidereal: Record<string, number> = {};
  for (const k of Object.keys(tropical)) sidereal[k] = rev(tropical[k] - ayan);

  return { ayanamsa: ayan, tropical, sidereal, ascSidereal: sidereal.Ascendant };
}

// ── Zodiac / nakshatra helpers ──────────────────────────────────────────────────
export const SIGNS = [
  'Aries (Mesha)', 'Taurus (Vrishabha)', 'Gemini (Mithuna)', 'Cancer (Karka)',
  'Leo (Simha)', 'Virgo (Kanya)', 'Libra (Tula)', 'Scorpio (Vrishchika)',
  'Sagittarius (Dhanu)', 'Capricorn (Makara)', 'Aquarius (Kumbha)', 'Pisces (Meena)',
];

export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
];

export const signIndexOf = (lonSidereal: number): number => Math.floor(rev(lonSidereal) / 30);
export const signOf = (lonSidereal: number): string => SIGNS[signIndexOf(lonSidereal)];
export const nakshatraOf = (moonSidereal: number): string =>
  NAKSHATRAS[Math.floor(rev(moonSidereal) / (360 / 27))];

// kundliSummary.ts — the rich Vedic chart engine shared by the `kundli` and `chat`
// Edge Functions. This is the "#1 accuracy lever" from the chat engine spec (§2):
// the more complete and correct the computed chart, the more a real-pandit reply
// the astrologer can give.
//
// Two responsibilities, split by whether the fact is time-dependent:
//
//   computeRichKundli(birth)  → the STATIC natal chart. Computed ONCE at profile
//     creation and cached on profiles.kundli_chart. Contains Lagna (+ its lord and
//     placement), Rashi, Nakshatra (+ pada), Sun sign, all 9 graha placements with
//     dignity, the 12 house lords and where they sit, the natal yogas/doshas, the
//     full Vimshottari mahadasha timeline (with dates), and the sidereal longitudes.
//
//   currentDynamics(chart, now) → the TIME-DEPENDENT reading, derived fresh at
//     prompt-build time so it never goes stale: the running Mahadasha + Antardasha,
//     the next upcoming periods, the current gochar (Shani/Guru/Rahu-Ketu transits by
//     house), and Sade Sati status. Transits are recomputed for `now`; nothing here
//     is cached.
//
// Rule #1/#2: everything here is COMPUTED deterministically from the astronomy engine
// in ./astro.ts. Claude only narrates these facts — it never invents placements or
// dates. All Vimshottari maths use the REAL elapsed fraction of the birth nakshatra
// (from the Moon's sidereal longitude), not an approximation.


// ── Birth input (a subset of the profiles row) ──────────────────────────────────
export interface BirthDetails {
  name: string;
  gender?: 'male' | 'female' | 'other';
  dob: string;       // YYYY-MM-DD (local wall-clock date)
  tob: string;       // HH:MM[:SS] (local wall-clock time, 24h)
  latitude: number;
  longitude: number;
  timezone: string;  // IANA zone, e.g. 'Asia/Kolkata'
}

// ── Static natal chart (cached on the profile) ──────────────────────────────────
export type Dignity = 'Exalted' | 'Debilitated' | 'Own sign' | 'Neutral';

export interface Placement {
  graha: string;   // display name, e.g. 'Saturn (Shani)'
  sign: string;    // full sign name, e.g. 'Capricorn (Makara)'
  house: number;   // 1..12 from the Lagna
  dignity: Dignity;
}
export interface HouseLord {
  house: number;        // 1..12
  sign: string;         // sign on that house (whole-sign)
  lord: string;         // ruling graha display name
  lord_house: number;   // which house the lord actually sits in
  lord_sign: string;    // and the sign it sits in
}
export interface Yoga { name: string; nature: 'benefic' | 'caution'; detail: string }
export interface DashaPeriod { lord: string; start: string; end: string } // ISO dates

export interface RichKundli {
  // — core (kept identical to the legacy thin chart for back-compat) —
  lagna: string;
  moon_sign: string;
  sun_sign: string;
  nakshatra: string;
  placements: Placement[];
  summary: string;
  // 'lahiri' = local fallback engine; 'vedastro' = VedAstro (Swiss Ephemeris) primary.
  source: 'lahiri' | 'vedastro';
  computed_at: string;
  // — rich additions (§2) —
  // 2 = local rich engine; 3 = VedAstro-sourced (carries chart_facts). Consumers
  // treat both as "rich" (has dasha_timeline); thin/mock (v1) charts self-heal.
  engine_version: 2 | 3;
  pada: number;              // 1..4, the nakshatra quarter of the Moon
  lagna_lord: { graha: string; sign: string; house: number };
  house_lords: HouseLord[];
  yogas: Yoga[];
  dasha_timeline: DashaPeriod[]; // full Vimshottari mahadasha sequence, with dates
  birth_iso: string;             // birth instant (UTC) — anchor for dynamics
  moon_longitude: number;        // sidereal, for Sade Sati / pada
  latitude: number;              // echoed so dynamics can recompute transits
  longitude: number;
  // Full VedAstro depth (§1) when source==='vedastro'; absent on the local fallback.
  chart_facts?: unknown;
}

// ── Time-dependent reading (never cached) ───────────────────────────────────────
export interface Transit {
  graha: string; sign: string;
  house_from_lagna: number;
  house_from_moon: number;
}
export interface SadeSati {
  active: boolean;
  phase: 'rising' | 'peak' | 'setting' | null; // 12th / 1st / 2nd from Moon
  also: string | null;                          // Ashtama/Kantaka Shani note, if any
  detail: string;
}
export interface Dynamics {
  mahadasha: DashaPeriod;
  antardasha: DashaPeriod;
  upcoming: DashaPeriod[];
  transits: { saturn: Transit; jupiter: Transit; rahu: Transit; ketu: Transit };
  sade_sati: SadeSati;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────
const GRAHA_NAMES: Record<string, string> = {
  Sun: 'Sun (Surya)', Moon: 'Moon (Chandra)', Mars: 'Mars (Mangala)',
  Mercury: 'Mercury (Budha)', Jupiter: 'Jupiter (Guru)', Venus: 'Venus (Shukra)',
  Saturn: 'Saturn (Shani)', Rahu: 'Rahu', Ketu: 'Ketu',
};
const GRAHA_ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

// sign lord by sign index (0 Aries .. 11 Pisces)
const LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury',
  'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const OWN: Record<string, number[]> = {
  Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10],
};
const EXALT: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const DEBIL: Record<string, number> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };
const BENEFIC = new Set(['Jupiter', 'Venus', 'Mercury', 'Moon']);
const MALEFIC = new Set(['Mars', 'Saturn', 'Rahu', 'Ketu', 'Sun']);

// Vimshottari: nakshatra lords in dasha order + each lord's period length (years).
const DASHA_SEQ: [string, number][] = [
  ['Ketu', 7], ['Venus', 20], ['Sun', 6], ['Moon', 10], ['Mars', 7],
  ['Rahu', 18], ['Jupiter', 16], ['Saturn', 19], ['Mercury', 17],
];
const NAK_LORD_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const DASHA_TOTAL = 120; // years in a full Vimshottari cycle
const YEAR_MS = 365.2425 * 86400000;

const ORDINAL = ['12th', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th'];
const dignityOf = (planet: string, si: number): Dignity =>
  EXALT[planet] === si ? 'Exalted'
    : DEBIL[planet] === si ? 'Debilitated'
      : OWN[planet]?.includes(si) ? 'Own sign' : 'Neutral';
const gname = (key: string) => GRAHA_NAMES[key] ?? key;

// ── Local wall-clock birth time → true UTC instant (honours the zone offset) ─────
function zonedToUTC(dob: string, tob: string, tz: string): Date {
  const [y, mo, da] = dob.split('-').map(Number);
  const [h, mi, s] = tob.split(':').map((n) => Number(n) || 0);
  const asUTC = Date.UTC(y, mo - 1, da, h, mi, s || 0);
  const off1 = tzOffsetMs(asUTC, tz);
  let utc = asUTC - off1;
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off1) utc = asUTC - off2; // second pass across a DST boundary
  return new Date(utc);
}
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const asIfUTC = Date.UTC(+map.year, +map.month - 1, +map.day, hour, +map.minute, +map.second);
  return asIfUTC - utcMs;
}

// ─────────────────────────────────────────────────────────────────────────────
//  computeRichKundli — the static natal chart
// ─────────────────────────────────────────────────────────────────────────────
export function computeRichKundli(birth: BirthDetails): RichKundli {
  const tz = birth.timezone || 'Asia/Kolkata';
  const when = zonedToUTC(birth.dob, birth.tob, tz);
  if (isNaN(when.getTime())) throw new Error('bad_datetime');

  const { sidereal } = computeLongitudes(when, birth.latitude, birth.longitude);
  const lagnaIdx = signIndexOf(sidereal.Ascendant);

  const placements: Placement[] = GRAHA_ORDER.map((key) => {
    const idx = signIndexOf(sidereal[key]);
    return {
      graha: gname(key),
      sign: SIGNS[idx],
      house: ((idx - lagnaIdx + 12) % 12) + 1,
      dignity: dignityOf(key, idx),
    };
  });
  // canonical key → its natal sign index & house, for lord look-ups
  const at: Record<string, { signIdx: number; house: number }> = {};
  GRAHA_ORDER.forEach((key) => {
    const idx = signIndexOf(sidereal[key]);
    at[key] = { signIdx: idx, house: ((idx - lagnaIdx + 12) % 12) + 1 };
  });

  const lagna = SIGNS[lagnaIdx];
  const moon_sign = SIGNS[signIndexOf(sidereal.Moon)];
  const sun_sign = SIGNS[signIndexOf(sidereal.Sun)];
  const nakshatra = nakshatraOf(sidereal.Moon);
  const moonLon = rev(sidereal.Moon);
  const pada = Math.floor((moonLon % (360 / 27)) / ((360 / 27) / 4)) + 1;

  // Lagna lord + its placement
  const lagnaLordKey = LORDS[lagnaIdx];
  const lagna_lord = {
    graha: gname(lagnaLordKey),
    sign: SIGNS[at[lagnaLordKey].signIdx],
    house: at[lagnaLordKey].house,
  };

  // 12 house lords (whole-sign from Lagna) and where each lord sits
  const house_lords: HouseLord[] = [];
  for (let h = 1; h <= 12; h++) {
    const si = (lagnaIdx + h - 1) % 12;
    const lordKey = LORDS[si];
    house_lords.push({
      house: h,
      sign: SIGNS[si],
      lord: gname(lordKey),
      lord_house: at[lordKey].house,
      lord_sign: SIGNS[at[lordKey].signIdx],
    });
  }

  const yogas = detectYogas(at, lagnaIdx);
  const dasha_timeline = computeDashaTimeline(when, moonLon);

  return {
    lagna, moon_sign, sun_sign, nakshatra, placements,
    summary: buildSummary(birth.name, lagna, moon_sign, sun_sign, nakshatra),
    source: 'lahiri',
    computed_at: new Date().toISOString(),
    engine_version: 2,
    pada,
    lagna_lord,
    house_lords,
    yogas,
    dasha_timeline,
    birth_iso: when.toISOString(),
    moon_longitude: moonLon,
    latitude: birth.latitude,
    longitude: birth.longitude,
  };
}

// ── Yogas & doshas (hopeful framing; cautions never fear-mongering) ─────────────
function detectYogas(at: Record<string, { signIdx: number; house: number }>, lagnaIdx: number): Yoga[] {
  const y: Yoga[] = [];
  const kendraFrom = (from: number, to: number) => [1, 4, 7, 10].includes(((to - from + 12) % 12) + 1);
  const isKendra = (h: number) => [1, 4, 7, 10].includes(h);

  // Gaja Kesari — Jupiter in a kendra from the Moon
  if (kendraFrom(at.Moon.house, at.Jupiter.house))
    y.push({ name: 'Gaja Kesari Yoga', nature: 'benefic', detail: 'Guru sits in a kendra from Chandra — a classic yoga for wisdom, good reputation, and rising fortune.' });
  // Budha-Aditya — Sun & Mercury together
  if (at.Sun.signIdx === at.Mercury.signIdx)
    y.push({ name: 'Budha-Aditya Yoga', nature: 'benefic', detail: 'Surya and Budha unite — sharp intellect, clear communication, and recognition through the mind.' });
  // Chandra-Mangala — Moon with Mars
  if (at.Moon.signIdx === at.Mars.signIdx)
    y.push({ name: 'Chandra-Mangala Yoga', nature: 'benefic', detail: 'Chandra with Mangala — drive and enterprise, a knack for turning effort into earnings.' });

  // Pancha Mahapurusha — a planet strong (own/exalted) in a kendra
  const mahapurusha: [string, string, string][] = [
    ['Mars', 'Ruchaka', 'courage, leadership and vitality'],
    ['Mercury', 'Bhadra', 'intellect, eloquence and business skill'],
    ['Jupiter', 'Hamsa', 'wisdom, virtue and grace'],
    ['Venus', 'Malavya', 'charm, comforts and artistic refinement'],
    ['Saturn', 'Shasha', 'discipline, endurance and authority'],
  ];
  for (const [key, nm, gift] of mahapurusha) {
    const dig = dignityOf(key, at[key].signIdx);
    if (isKendra(at[key].house) && (dig === 'Own sign' || dig === 'Exalted'))
      y.push({ name: `${nm} Yoga`, nature: 'benefic', detail: `${gname(key)} is powerful in a kendra — a Pancha-Mahapurusha yoga granting ${gift}.` });
  }

  // Exaltation / debilitation notes
  for (const key of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) {
    const dig = dignityOf(key, at[key].signIdx);
    if (dig === 'Exalted')
      y.push({ name: `Exalted ${gname(key)}`, nature: 'benefic', detail: `${gname(key)} is exalted in ${SIGNS[at[key].signIdx]}, lending its significations unusual strength.` });
    if (dig === 'Debilitated')
      y.push({ name: `Debilitated ${gname(key)}`, nature: 'caution', detail: `${gname(key)} is in its sign of debilitation (${SIGNS[at[key].signIdx]}) — an area that asks for conscious effort and often improves greatly with the right practice.` });
  }

  // Manglik (Mangal Dosha) — Mars in 1/4/7/8/12 from Lagna
  if ([1, 4, 7, 8, 12].includes(at.Mars.house))
    y.push({ name: 'Manglik (Mangal Dosha)', nature: 'caution', detail: `Mangal falls in the ${ORDINAL[at.Mars.house]} bhaav — a Manglik placement. Traditionally it asks for care and patience in relationships; it is common and well-managed with simple remedies and a compatible match.` });

  return y.slice(0, 12);
}

// ── Vimshottari mahadasha timeline (real balance from the Moon's longitude) ──────
function computeDashaTimeline(birth: Date, moonLon: number): DashaPeriod[] {
  const nakLen = 360 / 27;
  const nakIdx = Math.floor(moonLon / nakLen) % 27;
  const fracElapsed = (moonLon % nakLen) / nakLen; // portion of the birth nakshatra already traversed
  const startLord = NAK_LORD_ORDER[nakIdx % 9];
  const seq = seqFrom(startLord);

  const out: DashaPeriod[] = [];
  let cursor = birth.getTime();
  // enough periods to cover a full ~120y life plus the pre-birth remainder
  for (let i = 0; i < seq.length + 3; i++) {
    const [lord, yrs] = seq[i % seq.length];
    const dur = i === 0 ? yrs * (1 - fracElapsed) : yrs;
    const end = cursor + dur * YEAR_MS;
    out.push({ lord, start: new Date(cursor).toISOString(), end: new Date(end).toISOString() });
    cursor = end;
  }
  return out;
}
function seqFrom(lord: string): [string, number][] {
  const i = DASHA_SEQ.findIndex((x) => x[0] === lord);
  return [...DASHA_SEQ.slice(i), ...DASHA_SEQ.slice(0, i)];
}

function buildSummary(name: string, lagna: string, moon: string, sun: string, nak: string): string {
  const first = (name || '').trim().split(/\s+/)[0] || 'Your';
  return (
    `${first}'s birth chart shows the Ascendant (Lagna) rising in ${lagna}. ` +
    `The Moon — which in Vedic astrology governs the mind and emotions — is placed in ${moon}, ` +
    `making this the Rashi (Moon sign). The Sun is positioned in ${sun}. ` +
    `The birth star (Nakshatra) is ${nak}. ` +
    `These core placements form the foundation for personalised horoscope and consultation readings.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  currentDynamics — the time-dependent reading (recomputed fresh each session)
// ─────────────────────────────────────────────────────────────────────────────
export function currentDynamics(chart: RichKundli, now: Date = new Date()): Dynamics {
  const t = now.getTime();
  const timeline = chart.dasha_timeline ?? [];
  const NA: DashaPeriod = { lord: 'not available', start: '', end: '' };

  // running mahadasha + the next two upcoming (degrade gracefully on a thin chart)
  const mahadasha = timeline.find((p) => t >= Date.parse(p.start) && t < Date.parse(p.end)) ?? timeline[0] ?? NA;
  const upcoming = timeline.filter((p) => Date.parse(p.start) > t).slice(0, 2);

  // antardasha within the running mahadasha (proportional sub-periods)
  const antardasha = mahadasha.start ? currentAntardasha(mahadasha, now) : NA;

  // gochar: recompute planetary positions for NOW (location irrelevant to planet signs)
  const { sidereal } = computeLongitudes(now, chart.latitude || 0, chart.longitude || 0);
  const lagnaIdx = signIndexOf(siderealOf(chart.lagna));
  const moonIdx = signIndexOf(siderealOf(chart.moon_sign));
  const transit = (key: string): Transit => {
    const si = signIndexOf(sidereal[key]);
    return {
      graha: gname(key),
      sign: SIGNS[si],
      house_from_lagna: ((si - lagnaIdx + 12) % 12) + 1,
      house_from_moon: ((si - moonIdx + 12) % 12) + 1,
    };
  };
  const transits = { saturn: transit('Saturn'), jupiter: transit('Jupiter'), rahu: transit('Rahu'), ketu: transit('Ketu') };

  return { mahadasha, antardasha, upcoming, transits, sade_sati: sadeSati(transits.saturn) };
}

function currentAntardasha(maha: DashaPeriod, now: Date): DashaPeriod {
  const start = Date.parse(maha.start);
  const spanMs = Date.parse(maha.end) - start;
  const t = now.getTime();
  let cursor = start;
  const seq = seqFrom(maha.lord);
  for (const [lord, yrs] of seq) {
    const dur = spanMs * (yrs / DASHA_TOTAL); // antar length ∝ its lord's share of 120y
    const end = cursor + dur;
    if (t >= cursor && t < end) return { lord, start: new Date(cursor).toISOString(), end: new Date(end).toISOString() };
    cursor = end;
  }
  return { lord: seq[0][0], start: maha.start, end: maha.end };
}

// Sade Sati: Shani transiting the 12th, 1st, or 2nd house from the natal Moon.
function sadeSati(saturn: Transit): SadeSati {
  const h = saturn.house_from_moon; // 1..12 from Moon
  const also =
    h === 4 ? 'Kantaka Shani (Shani in the 4th from Chandra)'
      : h === 8 ? 'Ashtama Shani (Shani in the 8th from Chandra)'
        : null;
  if (h === 12 || h === 1 || h === 2) {
    const phase = h === 12 ? 'rising' : h === 1 ? 'peak' : 'setting';
    return {
      active: true, phase, also: null,
      detail: `Sade Sati is active — Shani transits the ${ORDINAL[h]} from the natal Chandra (${phase} phase). A period that rewards patience, discipline and steady effort; framed with hope, not fear.`,
    };
  }
  return {
    active: false, phase: null, also,
    detail: also
      ? `Sade Sati is not active, though ${also} is in effect — a lighter Shani influence that asks for balance in home/health matters.`
      : `Sade Sati is not currently active.`,
  };
}

// Map a stored full sign name back to a representative sidereal longitude (mid-sign),
// so we can reuse signIndexOf without re-parsing sign strings by hand.
function siderealOf(signName: string): number {
  const idx = SIGNS.findIndex((s) => s === signName);
  return (idx < 0 ? 0 : idx) * 30 + 15;
}

// vedastro.ts — the ONE and ONLY module that talks to VedAstro (api.vedastro.org).
// The single integration point for external Vedic data (rule #1 / spec §0): no other
// file — no Edge Function handler, no client, no chat engine — ever fetches VedAstro.
// It runs SERVER-SIDE only (it reads the VEDASTRO_API_KEY secret) and is inlined into
// the `kundli` and `panchang` Edge Functions by scripts/inline-functions.mjs (the
// dashboard deploy ships one index.ts per function, so shared files must be inlined).
//
// VedAstro is built on the Swiss Ephemeris (NASA JPL) and exposes 596 calculations.
// We use two calls to build a rich natal chart (AllPlanetData + AllHouseData) and one
// call for a day's Panchang (PanchangaTable). The Vimshottari dasha timeline is derived
// deterministically from VedAstro's exact Moon longitude (faithful standard maths, no
// extra call); gochar transits + Sade Sati stay time-dependent and are computed fresh
// at chat time by kundliSummary.currentDynamics — never cached here.
//
// This module is intentionally SELF-CONTAINED (it imports only SIGNS from astro.ts and
// keeps its own small copies of the sign-lord / dignity / dasha constant tables) so it
// can be inlined into the lean `panchang` function without dragging in the whole
// kundliSummary engine. If VedAstro fails, the caller falls back to the local engine.


// Wrapped in a namespace so that when this module is INLINED into the `kundli` and
// `panchang` functions (alongside astro.ts / kundliSummary.ts, which define their own
// top-level GRAHA_NAMES / LORDS / NAKSHATRAS / detectYogas / DashaPeriod / Dignity …),
// none of these identifiers collide. Same pattern as the report function's `namespace
// Chart`. Public entry points are Veda.fetchRichKundli / Veda.fetchPanchang /
// Veda.renderSummaryText / Veda.bumpVedastroUsage. Only `SIGNS` is referenced from the
// outer (astro) scope — a namespace can read module-scope bindings.
export namespace Veda {

const VEDASTRO_BASE = 'https://api.vedastro.org/api';
const AYANAMSA = 'LAHIRI'; // match the app's Lahiri/Chitrapaksha standard
const apiKey = () => Deno.env.get('VEDASTRO_API_KEY') || 'FreeAPIUser';

// ─────────────────────────────────────────────────────────────────────────────
//  Public shapes
// ─────────────────────────────────────────────────────────────────────────────
export type Dignity = 'Exalted' | 'Debilitated' | 'Own sign' | 'Neutral';

export interface GrahaFact {
  graha: string;            // display name, e.g. 'Saturn (Shani)'
  sign: string;             // full app sign name, e.g. 'Capricorn (Makara)'
  sign_degree: string;      // 'DD° MM\' SS' within the sign
  house: number;            // 1..12 (whole-sign, from Lagna)
  nakshatra: string;        // e.g. 'Ashlesha'
  pada: number;             // 1..4
  retrograde: boolean;
  combust: boolean;
  dignity: Dignity;
  vargottama: boolean;
  navamsa_sign: string;     // D9 sign
  dashamsa_sign: string;    // D10 sign
  shadbala: string;         // Shadbala Pinda (raw), or 'not available'
  strong: boolean;          // IsPlanetStrongInShadbala
  longitude: number;        // sidereal total degrees
}
export interface HouseFact {
  house: number;            // 1..12
  sign: string;             // sign on that bhava (whole-sign)
  lord: string;             // ruling graha display name
  lord_house: number;       // where that lord sits
  lord_sign: string;        // and in which sign
}
export interface DoshaFact { name: string; present: boolean; detail: string }
export interface YogaFact { name: string; nature: 'benefic' | 'caution'; detail: string }
export interface DashaPeriod { lord: string; start: string; end: string } // ISO dates

export interface ChartFacts {
  provider: 'vedastro';
  ayanamsa: string;
  lagna: string;
  lagna_lord: { graha: string; sign: string; house: number };
  moon_sign: string;
  sun_sign: string;
  nakshatra: string;
  pada: number;
  grahas: GrahaFact[];
  houses: HouseFact[];
  yogas: YogaFact[];
  doshas: DoshaFact[];
  divisional: { d9: Record<string, string>; d10: Record<string, string> }; // graha → sign
  dasha_timeline: DashaPeriod[];
  moon_longitude: number;   // sidereal, for Sade Sati / pada
  birth_iso: string;        // birth instant (UTC)
  latitude: number;
  longitude: number;
}

// A chart in the shape the rest of the app already consumes (flat back-compat fields
// mirroring kundliSummary.RichKundli) PLUS the full `chart_facts`. engine_version 3.
export interface VedaKundli {
  lagna: string;
  moon_sign: string;
  sun_sign: string;
  nakshatra: string;
  placements: { graha: string; sign: string; house: number; dignity: Dignity }[];
  summary: string;
  source: 'vedastro';
  computed_at: string;
  engine_version: 3;
  pada: number;
  lagna_lord: { graha: string; sign: string; house: number };
  house_lords: HouseFact[];
  yogas: { name: string; nature: 'benefic' | 'caution'; detail: string }[];
  dasha_timeline: DashaPeriod[];
  birth_iso: string;
  moon_longitude: number;
  latitude: number;
  longitude: number;
  chart_facts: ChartFacts;
}

export interface Birth {
  name: string;
  gender?: string;
  dob: string;      // YYYY-MM-DD
  tob: string;      // HH:MM[:SS]
  latitude: number;
  longitude: number;
  timezone: string; // IANA
  birth_place?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Self-contained astrology constants (kept local for module independence)
// ─────────────────────────────────────────────────────────────────────────────
const ENGLISH_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra',
  'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const GRAHA_NAMES: Record<string, string> = {
  Sun: 'Sun (Surya)', Moon: 'Moon (Chandra)', Mars: 'Mars (Mangala)',
  Mercury: 'Mercury (Budha)', Jupiter: 'Jupiter (Guru)', Venus: 'Venus (Shukra)',
  Saturn: 'Saturn (Shani)', Rahu: 'Rahu', Ketu: 'Ketu',
};
const GRAHA_ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
// sign lord by sign index (0 Aries .. 11 Pisces)
const LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury',
  'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const ORDINAL = ['12th', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th'];
// Vimshottari: nakshatra lords in dasha order + period lengths (years).
const DASHA_SEQ: [string, number][] = [
  ['Ketu', 7], ['Venus', 20], ['Sun', 6], ['Moon', 10], ['Mars', 7],
  ['Rahu', 18], ['Jupiter', 16], ['Saturn', 19], ['Mercury', 17],
];
const NAK_LORD_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const YEAR_MS = 365.2425 * 86400000;
const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
];

// VedAstro spells some nakshatras differently — normalise to our canonical list.
const VEDA_NAK_ALIAS: Record<string, string> = {
  Aswini: 'Ashwini', Aslesha: 'Ashlesha', Ashlesa: 'Ashlesha',
  Pubba: 'Purva Phalguni', Puppha: 'Purva Phalguni', PurvaPhalguni: 'Purva Phalguni',
  Uttara: 'Uttara Phalguni', UttaraPhalguni: 'Uttara Phalguni',
  Chitta: 'Chitra', Anusham: 'Anuradha', Kettai: 'Jyeshtha', Moola: 'Mula',
  Pooram: 'Purva Ashadha', PurvaShaada: 'Purva Ashadha', PurvaAshadha: 'Purva Ashadha',
  Uthiradam: 'Uttara Ashadha', UttaraShaada: 'Uttara Ashadha', UttaraAshadha: 'Uttara Ashadha',
  Thiruvonam: 'Shravana', Sravana: 'Shravana', Avittam: 'Dhanishta',
  Sadayam: 'Shatabhisha', Shathabisha: 'Shatabhisha',
  Poorvabhadra: 'Purva Bhadrapada', PurvaBhadra: 'Purva Bhadrapada', PurvaBhadrapada: 'Purva Bhadrapada',
  Uttarabhadra: 'Uttara Bhadrapada', UttaraBhadra: 'Uttara Bhadrapada', UttaraBhadrapada: 'Uttara Bhadrapada',
  Revathi: 'Revati',
};
const normNak = (n: string) => VEDA_NAK_ALIAS[n?.replace(/\s+/g, '')] ?? VEDA_NAK_ALIAS[n] ?? n;
const gname = (k: string) => GRAHA_NAMES[k] ?? k;
const ord = (n: number): string => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const boolOf = (v: unknown) => String(v).toLowerCase() === 'true';
const engSignIndex = (name?: string) => ENGLISH_SIGNS.indexOf(String(name ?? '').trim());
const appSign = (name?: string) => { const i = engSignIndex(name); return i < 0 ? String(name ?? 'not available') : SIGNS[i]; };
const houseNum = (s?: string) => { const m = String(s ?? '').match(/(\d+)/); return m ? Number(m[1]) : 0; };
const numOf = (o: any): number => { const v = o?.TotalDegrees ?? o; const n = Number(v); return isFinite(n) ? n : 0; };
const dms = (o: any): string => o?.DegreeMinuteSecond ?? o?.DegreesIn?.DegreeMinuteSecond ?? '';
// VedAstro constellation is like 'Aslesha - 4'; normalise the name to our spelling by nakshatra index.
function parseConstellation(s?: string): { nakshatra: string; pada: number } {
  const [rawName, rawPada] = String(s ?? '').split(' - ');
  const pada = Number(rawPada) || 1;
  const nm = rawName?.trim();
  return { nakshatra: nm ? normNak(nm) : 'not available', pada };
}

// ─────────────────────────────────────────────────────────────────────────────
//  HTTP — the single caller (retry + backoff), respecting the free-tier limit
// ─────────────────────────────────────────────────────────────────────────────
async function callVedAstro(path: string, tries = 3): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${VEDASTRO_BASE}${path}`, {
        headers: { 'x-api-key': apiKey(), 'accept': 'application/json' },
      });
      if (res.status === 429) { // rate-limited (free tier = ~5/min) → back off
        await sleep(1200 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`vedastro_http_${res.status}`);
      const data = await res.json();
      if (data?.Status !== 'Pass') throw new Error(`vedastro_status_${data?.Status ?? 'unknown'}`);
      return data.Payload;
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(600 * (i + 1)); // exponential-ish backoff
    }
  }
  throw new Error(`vedastro_failed: ${String((lastErr as Error)?.message ?? lastErr)}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Best-effort usage counter (spec §8: a simple counter is enough). Never throws.
export async function bumpVedastroUsage(admin: any, n = 1): Promise<void> {
  try { await admin.rpc('bump_vedastro_usage', { n }); } catch (_) { /* non-fatal */ }
}

// Build the VedAstro Location + Time URL segments from our stored birth details.
function locationSeg(lat: number, lng: number, place?: string): string {
  // Coordinates are exact (no geocoding drift); fall back to the place name if absent.
  if (isFinite(lat) && isFinite(lng)) return `Location/${lat},${lng}`;
  return `Location/${encodeURIComponent(place || 'New Delhi')}`;
}
function timeSeg(dob: string, tob: string, tz: string): string {
  const [Y, Mo, D] = dob.split('-').map(Number);
  const [h, mi] = tob.split(':').map((x) => Number(x) || 0);
  const off = tzOffsetString(Date.UTC(Y, Mo - 1, D, h, mi), tz);
  const hh = String(h).padStart(2, '0');
  const mm = String(mi).padStart(2, '0');
  const dd = String(D).padStart(2, '0');
  const mon = String(Mo).padStart(2, '0');
  return `Time/${hh}:${mm}/${dd}/${mon}/${Y}/${off}`;
}
// ±HH:MM offset for an IANA zone at a UTC instant.
function tzOffsetString(utcMs: number, tz: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'Asia/Kolkata', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) map[p.type] = p.value;
  let hour = Number(map.hour); if (hour === 24) hour = 0;
  const asIfUTC = Date.UTC(+map.year, +map.month - 1, +map.day, hour, +map.minute, +map.second);
  const offMin = Math.round((asIfUTC - utcMs) / 60000);
  const sign = offMin >= 0 ? '+' : '-';
  const a = Math.abs(offMin);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
// Local wall-clock birth → UTC instant (for dasha anchoring). Mirrors kundliSummary.
function birthUTC(dob: string, tob: string, tz: string): Date {
  const [Y, Mo, D] = dob.split('-').map(Number);
  const [h, mi, s] = tob.split(':').map((x) => Number(x) || 0);
  const asUTC = Date.UTC(Y, Mo - 1, D, h, mi, s || 0);
  const off1 = offMs(asUTC, tz);
  let utc = asUTC - off1;
  const off2 = offMs(utc, tz);
  if (off2 !== off1) utc = asUTC - off2;
  return new Date(utc);
}
function offMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'Asia/Kolkata', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) map[p.type] = p.value;
  let hour = Number(map.hour); if (hour === 24) hour = 0;
  return Date.UTC(+map.year, +map.month - 1, +map.day, hour, +map.minute, +map.second) - utcMs;
}

// ─────────────────────────────────────────────────────────────────────────────
//  fetchRichKundli — 2 calls → a full chart (rule #1 lives here)
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchRichKundli(b: Birth): Promise<VedaKundli> {
  const tz = b.timezone || 'Asia/Kolkata';
  const loc = locationSeg(b.latitude, b.longitude, b.birth_place);
  const time = timeSeg(b.dob, b.tob, tz);
  const suffix = `/${loc}/${time}/Ayanamsa/${AYANAMSA}`;

  const [planetsP, housesP] = await Promise.all([
    callVedAstro(`/Calculate/AllPlanetData/PlanetName/All${suffix}`),
    callVedAstro(`/Calculate/AllHouseData/HouseName/All${suffix}`),
  ]);

  // planets: [{Sun:{...}}, {Moon:{...}}, …]  → { Sun:{...}, … }
  const planets: Record<string, any> = {};
  for (const entry of (planetsP?.AllPlanetData ?? [])) {
    const k = Object.keys(entry)[0]; planets[k] = entry[k];
  }
  // houses: [{House1:{...}}, …] → { 1:{...}, … }
  const houses: Record<number, any> = {};
  for (const entry of (housesP?.AllHouseData ?? [])) {
    const k = Object.keys(entry)[0]; houses[houseNum(k)] = entry[k];
  }
  if (!planets.Moon || !houses[1]) throw new Error('vedastro_incomplete');

  const lagnaIdx = engSignIndex(houses[1].HouseSignName);
  const lagna = appSign(houses[1].HouseSignName);

  // per-graha facts
  const grahas: GrahaFact[] = [];
  const at: Record<string, { signIdx: number; house: number; dignity: Dignity; retro: boolean; combust: boolean; lon: number }> = {};
  const d9: Record<string, string> = {};
  const d10: Record<string, string> = {};
  for (const key of GRAHA_ORDER) {
    const p = planets[key];
    if (!p) continue;
    const signIdx = engSignIndex(p.PlanetRasiD1Sign?.Name);
    const { nakshatra, pada } = parseConstellation(p.PlanetConstellation);
    const dignity: Dignity = boolOf(p.IsPlanetExalted) ? 'Exalted'
      : boolOf(p.IsPlanetDebilitated) ? 'Debilitated'
        : boolOf(p.IsPlanetInOwnSign) ? 'Own sign' : 'Neutral';
    const house = houseNum(p.HousePlanetOccupiesBasedOnSign) || ((signIdx - lagnaIdx + 12) % 12) + 1;
    const g: GrahaFact = {
      graha: gname(key), sign: appSign(p.PlanetRasiD1Sign?.Name),
      sign_degree: dms(p.PlanetRasiD1Sign), house,
      nakshatra, pada,
      retrograde: boolOf(p.IsPlanetRetrograde), combust: boolOf(p.IsPlanetCombust),
      dignity, vargottama: boolOf(p.IsPlanetVargottama),
      navamsa_sign: appSign(p.PlanetNavamshaD9Sign?.Name),
      dashamsa_sign: appSign(p.PlanetDashamamshaD10Sign?.Name),
      shadbala: p.PlanetShadbalaPinda != null ? String(p.PlanetShadbalaPinda) : 'not available',
      strong: boolOf(p.IsPlanetStrongInShadbala),
      longitude: numOf(p.PlanetNirayanaLongitude),
    };
    grahas.push(g);
    at[key] = { signIdx, house, dignity, retro: g.retrograde, combust: g.combust, lon: g.longitude };
    d9[gname(key)] = g.navamsa_sign;
    d10[gname(key)] = g.dashamsa_sign;
  }

  // 12 house lords (whole-sign) and where each lord sits
  const houseFacts: HouseFact[] = [];
  for (let h = 1; h <= 12; h++) {
    const si = (lagnaIdx + h - 1) % 12;
    const lordKey = LORDS[si];
    houseFacts.push({
      house: h, sign: SIGNS[si], lord: gname(lordKey),
      lord_house: at[lordKey]?.house ?? 0, lord_sign: at[lordKey] ? SIGNS[at[lordKey].signIdx] : 'not available',
    });
  }

  const lagnaLordKey = LORDS[lagnaIdx];
  const lagna_lord = {
    graha: gname(lagnaLordKey),
    sign: at[lagnaLordKey] ? SIGNS[at[lagnaLordKey].signIdx] : 'not available',
    house: at[lagnaLordKey]?.house ?? 0,
  };

  const moonFact = grahas.find((g) => g.graha.startsWith('Moon'))!;
  const sunFact = grahas.find((g) => g.graha.startsWith('Sun'))!;
  const moonLon = at.Moon.lon;

  const yogas = detectYogas(at, lagnaIdx);
  const doshas = detectDoshas(at, moonFact);
  const when = birthUTC(b.dob, b.tob, tz);
  const dasha_timeline = dashaFromMoon(when, moonLon);

  const facts: ChartFacts = {
    provider: 'vedastro', ayanamsa: AYANAMSA,
    lagna, lagna_lord,
    moon_sign: moonFact.sign, sun_sign: sunFact.sign,
    nakshatra: moonFact.nakshatra, pada: moonFact.pada,
    grahas, houses: houseFacts, yogas, doshas,
    divisional: { d9, d10 },
    dasha_timeline, moon_longitude: moonLon,
    birth_iso: when.toISOString(), latitude: b.latitude, longitude: b.longitude,
  };

  return {
    lagna, moon_sign: moonFact.sign, sun_sign: sunFact.sign, nakshatra: moonFact.nakshatra,
    placements: grahas.map((g) => ({ graha: g.graha, sign: g.sign, house: g.house, dignity: g.dignity })),
    summary: renderSummaryText(b.name, facts),
    source: 'vedastro', computed_at: new Date().toISOString(), engine_version: 3,
    pada: moonFact.pada, lagna_lord, house_lords: houseFacts, yogas, dasha_timeline,
    birth_iso: when.toISOString(), moon_longitude: moonLon,
    latitude: b.latitude, longitude: b.longitude, chart_facts: facts,
  };
}

// ── Yogas (hopeful framing; cautions never fear-mongering) ──────────────────────
function detectYogas(at: Record<string, any>, lagnaIdx: number): YogaFact[] {
  const y: YogaFact[] = [];
  const isKendra = (h: number) => [1, 4, 7, 10].includes(h);
  const kendraFrom = (from: number, to: number) => isKendra(((to - from + 12) % 12) + 1);
  const has = (k: string) => at[k] !== undefined;
  if (has('Moon') && has('Jupiter') && kendraFrom(at.Moon.house, at.Jupiter.house))
    y.push({ name: 'Gaja Kesari Yoga', nature: 'benefic', detail: 'Guru sits in a kendra from Chandra — a classic yoga for wisdom, good name and rising fortune.' });
  if (has('Sun') && has('Mercury') && at.Sun.signIdx === at.Mercury.signIdx)
    y.push({ name: 'Budha-Aditya Yoga', nature: 'benefic', detail: 'Surya and Budha unite — sharp intellect, clear expression and recognition through the mind.' });
  if (has('Moon') && has('Mars') && at.Moon.signIdx === at.Mars.signIdx)
    y.push({ name: 'Chandra-Mangala Yoga', nature: 'benefic', detail: 'Chandra with Mangala — drive and enterprise, a knack for turning effort into earnings.' });
  const mahapurusha: [string, string, string][] = [
    ['Mars', 'Ruchaka', 'courage, leadership and vitality'],
    ['Mercury', 'Bhadra', 'intellect, eloquence and business skill'],
    ['Jupiter', 'Hamsa', 'wisdom, virtue and grace'],
    ['Venus', 'Malavya', 'charm, comforts and artistic refinement'],
    ['Saturn', 'Shasha', 'discipline, endurance and authority'],
  ];
  for (const [key, nm, gift] of mahapurusha) {
    if (has(key) && isKendra(at[key].house) && (at[key].dignity === 'Own sign' || at[key].dignity === 'Exalted'))
      y.push({ name: `${nm} Yoga`, nature: 'benefic', detail: `${gname(key)} is powerful in a kendra — a Pancha-Mahapurusha yoga granting ${gift}.` });
  }
  for (const key of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) {
    if (!has(key)) continue;
    if (at[key].dignity === 'Exalted')
      y.push({ name: `Exalted ${gname(key)}`, nature: 'benefic', detail: `${gname(key)} is exalted — its significations gain unusual strength.` });
    if (at[key].dignity === 'Debilitated')
      y.push({ name: `Debilitated ${gname(key)}`, nature: 'caution', detail: `${gname(key)} is debilitated — an area that asks for conscious effort and often improves greatly with practice.` });
  }
  return y.slice(0, 12);
}

// ── Doshas (natal, single-chart) ────────────────────────────────────────────────
function detectDoshas(at: Record<string, any>, moon: GrahaFact): DoshaFact[] {
  const out: DoshaFact[] = [];
  // Manglik / Kuja dosha — Mars in 1/4/7/8/12 from Lagna, with a light cancellation note.
  const manglik = at.Mars && [1, 4, 7, 8, 12].includes(at.Mars.house);
  out.push({
    name: 'Manglik (Mangal Dosha)', present: !!manglik,
    detail: manglik
      ? `Mangal falls in the ${ORDINAL[at.Mars.house]} bhaav — a Manglik placement. It commonly softens with a compatible match and simple remedies; not a cause for worry.`
      : 'No Manglik (Mangal) dosha — Mangal is not in the 1st/4th/7th/8th/12th from the Lagna.',
  });
  // Kaal Sarp — all seven planets hemmed between Rahu and Ketu (by longitude).
  if (at.Rahu && at.Ketu) {
    const lo = Math.min(at.Rahu.lon, at.Ketu.lon), hi = Math.max(at.Rahu.lon, at.Ketu.lon);
    const others = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].filter((k) => at[k]);
    const inside = others.every((k) => at[k].lon > lo && at[k].lon < hi);
    const outside = others.every((k) => !(at[k].lon > lo && at[k].lon < hi));
    const present = inside || outside; // full hemming either side of the axis
    out.push({
      name: 'Kaal Sarp Dosha', present,
      detail: present
        ? 'All grahas fall to one side of the Rahu–Ketu axis (Kaal Sarp yoga). Traditionally a driver of intense effort and eventual rise; well managed with steady sadhana.'
        : 'No Kaal Sarp dosha — the planets are spread across both sides of the Rahu–Ketu axis.',
    });
  }
  // Nadi (the person's own Nadi group, from the birth nakshatra — used in matchmaking).
  const nadi = nadiOf(moon.nakshatra);
  out.push({ name: 'Nadi', present: false, detail: `Birth Nadi is ${nadi} (relevant for marriage compatibility / Nadi kuta).` });
  return out;
}
function nadiOf(nak: string): 'Aadi' | 'Madhya' | 'Antya' | 'not available' {
  const idx = NAKSHATRAS.indexOf(nak);
  if (idx < 0) return 'not available';
  // repeating Aadi/Madhya/Antya, Antya/Madhya/Aadi pattern across 27 nakshatras
  const table = ['Aadi', 'Madhya', 'Antya', 'Antya', 'Madhya', 'Aadi'];
  return table[idx % 6] as any;
}

// ── Vimshottari dasha from VedAstro's exact Moon longitude ───────────────────────
function dashaFromMoon(birth: Date, moonLon: number): DashaPeriod[] {
  const nakLen = 360 / 27;
  const m = ((moonLon % 360) + 360) % 360;
  const nakIdx = Math.floor(m / nakLen) % 27;
  const fracElapsed = (m % nakLen) / nakLen;
  const startLord = NAK_LORD_ORDER[nakIdx % 9];
  const i0 = DASHA_SEQ.findIndex((x) => x[0] === startLord);
  const seq = [...DASHA_SEQ.slice(i0), ...DASHA_SEQ.slice(0, i0)];
  const out: DashaPeriod[] = [];
  let cursor = birth.getTime();
  for (let i = 0; i < seq.length + 3; i++) {
    const [lord, yrs] = seq[i % seq.length];
    const dur = i === 0 ? yrs * (1 - fracElapsed) : yrs;
    const end = cursor + dur * YEAR_MS;
    out.push({ lord, start: new Date(cursor).toISOString(), end: new Date(end).toISOString() });
    cursor = end;
  }
  return out;
}

// ── Dense readable render for the profile row (summary_text) + chat static block ──
export function renderSummaryText(name: string, f: ChartFacts): string {
  const first = (name || '').trim().split(/\s+/)[0] || 'This chart';
  const plc = f.grahas.map((g) =>
    `${g.graha} in ${g.sign} (${ord(g.house)} house${g.dignity !== 'Neutral' ? `, ${g.dignity}` : ''}${g.retrograde ? ', retrograde' : ''}${g.combust ? ', combust' : ''})`).join('; ');
  const lords = f.houses.map((h) => `${ord(h.house)} ${h.sign}→${h.lord} in ${ord(h.lord_house)}`).join('; ');
  const yg = f.yogas.length ? f.yogas.map((y) => `${y.name} (${y.detail})`).join(' | ') : 'no classical named yogas stand out';
  const dsh = f.doshas.filter((d) => d.present).map((d) => d.name).join(', ') || 'no major doshas flagged';
  const maha = f.dasha_timeline.map((p) => `${p.lord} ${p.start.slice(0, 7)}→${p.end.slice(0, 7)}`).join(', ');
  return [
    `${first}'s Kundli (VedAstro / Lahiri, Swiss Ephemeris).`,
    `Lagna ${f.lagna}, lord ${f.lagna_lord.graha} in ${f.lagna_lord.sign} (${f.lagna_lord.house}th house).`,
    `Rashi (Moon) ${f.moon_sign}; Nakshatra ${f.nakshatra} pada ${f.pada}; Sun ${f.sun_sign}.`,
    `Placements: ${plc}.`,
    `House lords: ${lords}.`,
    `Yogas: ${yg}.`,
    `Doshas: ${dsh}.`,
    `Vimshottari mahadasha: ${maha}.`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  fetchPanchang — one call → the day's almanac limbs (used by the panchang fn)
// ─────────────────────────────────────────────────────────────────────────────
export interface PanchangCore {
  tithi: string; paksha: string; vaara: string; nakshatra: string; pada: number;
  yoga: string; karana: string;
  sunrise_iso: string | null; sunset_iso: string | null;
  source: 'vedastro';
}
// date: a Date at (roughly) local morning; we pass the IST calendar day at 06:00.
export async function fetchPanchang(lat: number, lng: number, y: number, mo: number, d: number): Promise<PanchangCore> {
  const loc = locationSeg(lat, lng);
  const dd = String(d).padStart(2, '0'), mm = String(mo).padStart(2, '0');
  const path = `/Calculate/PanchangaTable/${loc}/Time/06:00/${dd}/${mm}/${y}/+05:30/Ayanamsa/${AYANAMSA}`;
  const p = await callVedAstro(path);
  const t = p?.PanchangaTable;
  if (!t) throw new Error('vedastro_panchang_incomplete');
  const nk = parseConstellation(t.Nakshatra);
  return {
    tithi: t.Tithi?.Name ?? 'not available',
    paksha: t.Tithi?.Paksha ?? 'not available',
    vaara: t.Vara ?? 'not available',
    nakshatra: nk.nakshatra, pada: nk.pada,
    yoga: t.Yoga?.Name ?? 'not available',
    karana: t.Karana ?? 'not available',
    sunrise_iso: stdTimeToISO(t.Sunrise?.StdTime),
    sunset_iso: stdTimeToISO(t.Sunset?.StdTime),
    source: 'vedastro',
  };
}
// VedAstro StdTime is 'HH:MM DD/MM/YYYY +05:30' → ISO string (or null).
function stdTimeToISO(s?: string): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{2}):(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})\s+([+-]\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, hh, mi, dd, mo, yy, oh, om] = m;
  return `${yy}-${mo}-${dd}T${hh}:${mi}:00${oh}:${om}`;
}

} // namespace Veda
