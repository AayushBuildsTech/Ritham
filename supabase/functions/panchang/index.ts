// Edge Function: panchang
// Daily Hindu almanac (Panchang) for a city — tithi, vaara, nakshatra, yoga,
// karana, sunrise, sunset, Rahu Kaal and the day's auspicious/inauspicious
// windows. GENERIC, not personalised: the SAME for every user in the same city
// on the same day.
//
// ⚠️ ZERO AI / ZERO PROVIDER COST. Every value is COMPUTED with the shared Vedic
// astronomy engine (`../_shared/astro.ts`) — the SAME engine and Lahiri ayanamsa
// the Kundli uses, so a user's Panchang nakshatra agrees with their chart. There is
// NO Claude/OpenAI call and no external astrology-provider request.
//
// Margin protection (rule #4): computed ONCE per (place, date) and cached in
// public.panchang_cache, SHARED across all users in that city (place_key = lat/lng
// rounded to 1 decimal). Cache hit → instant; miss → compute, store, return.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';


const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const IST_OFFSET = 5.5; // hours; all users are in India (no DST)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { profileId } = await req.json().catch(() => ({}));
    if (!profileId) return json({ error: 'missing_profile' }, 400);

    const { data: profile } = await admin
      .from('profiles').select('latitude, longitude, birth_place, user_id')
      .eq('id', profileId).eq('user_id', user.id).maybeSingle();
    if (!profile) return json({ error: 'profile_not_found' }, 404);

    const lat = Number(profile.latitude);
    const lng = Number(profile.longitude);
    if (!isFinite(lat) || !isFinite(lng)) return json({ error: 'place_missing' }, 400);

    const { y, m, d, iso } = istYMD();
    const placeKey = `${lat.toFixed(1)},${lng.toFixed(1)}`; // ~11 km city grid
    const dateKey = iso;

    const { data: cached } = await admin
      .from('panchang_cache').select('data')
      .eq('place_key', placeKey).eq('date_key', dateKey).maybeSingle();
    if (cached) return json({ ...cached.data, cached: true });

    // VedAstro primary (spec §3) → local pure-compute fallback. Cached per city/day, so
    // this runs at most once per (place, date): the rate-limit exposure is minimal.
    let data: any;
    try {
      data = await buildPanchangVedastro(y, m, d, lat, lng, profile.birth_place ?? null);
      try { await Veda.bumpVedastroUsage(admin, 1); } catch (_) { /* best-effort */ }
    } catch (_) {
      data = computePanchang(y, m, d, lat, lng, profile.birth_place ?? null);
    }

    const { error: insErr } = await admin.from('panchang_cache').insert({
      place_key: placeKey, place_label: profile.birth_place ?? null, date_key: dateKey, data,
    });
    if (insErr && (insErr as any).code === '23505') {
      const { data: raced } = await admin
        .from('panchang_cache').select('data')
        .eq('place_key', placeKey).eq('date_key', dateKey).maybeSingle();
      return json({ ...(raced?.data ?? data), cached: true });
    }
    return json({ ...data, cached: false });
  } catch (e) {
    console.error('panchang error:', String((e as Error)?.message ?? e));
    return json({ error: 'server_error' }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Panchang derivation — Sun/Moon positions from the shared engine; the five limbs
// (panch-anga) are read at local sunrise, the traditional anchor.
// ══════════════════════════════════════════════════════════════════════════════

const VAARA = ['Sunday (Ravivara)', 'Monday (Somavara)', 'Tuesday (Mangalavara)',
  'Wednesday (Budhavara)', 'Thursday (Guruvara)', 'Friday (Shukravara)', 'Saturday (Shanivara)'];

const TITHI_NAMES = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi',
  'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];

const YOGAS = ['Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma',
  'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi',
  'Vyatipata', 'Variyana', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma',
  'Indra', 'Vaidhriti'];

const KARANA_MOVABLE = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];
const KARANA_FIXED = ['Shakuni', 'Chatushpada', 'Naga', 'Kimstughna'];

function istYMD(): { y: number; m: number; d: number; iso: string } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, iso };
}

// A UTC instant → IST clock decimal hours (India is a fixed +5:30, no DST).
const istHours = (dt: Date): number =>
  ((dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600) + IST_OFFSET) % 24;

function fmtTime(hours: number | null): string {
  if (hours == null) return '—';
  let h = Math.floor(hours);
  let mins = Math.round((hours - h) * 60);
  if (mins === 60) { mins = 0; h += 1; }
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

function computePanchang(y: number, m: number, d: number, lat: number, lng: number, label: string | null) {
  const weekdayIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat

  const { riseUTC, setUTC } = sunTimesUTC(y, m, d, lat, lng);
  const sunriseIST = riseUTC ? istHours(riseUTC) : null;
  const sunsetIST = setUTC ? istHours(setUTC) : null;

  // Evaluate the luni-solar limbs at the sunrise instant (fall back to 06:00 IST).
  const anchorUTC = riseUTC ?? new Date(Date.UTC(y, m - 1, d, 0, 30, 0)); // 06:00 IST
  const L = computeLongitudes(anchorUTC, lat, lng);
  const sunLon = L.tropical.Sun;
  const moonLon = L.tropical.Moon;
  const moonSid = L.sidereal.Moon;
  const sunSid = L.sidereal.Sun;
  const nakSpan = 360 / 27;

  // Tithi — 12° of elongation each (ayanamsa-independent, uses tropical difference).
  const elong = rev(moonLon - sunLon);
  const tithiIdx = Math.floor(elong / 12); // 0..29
  const paksha = tithiIdx < 15 ? 'Shukla' : 'Krishna';
  const within = tithiIdx % 15;
  const tithiName = within === 14 && paksha === 'Shukla' ? 'Purnima'
    : within === 14 && paksha === 'Krishna' ? 'Amavasya' : TITHI_NAMES[within];

  // Nakshatra — 13°20' each (Moon, sidereal).
  const nakIdx = Math.floor(moonSid / nakSpan); // 0..26
  const pada = Math.floor((moonSid % nakSpan) / (nakSpan / 4)) + 1; // 1..4

  // Yoga — (sidereal sun + sidereal moon) in 13°20' segments.
  const yogaIdx = Math.floor(rev(sunSid + moonSid) / nakSpan);

  // Karana — half-tithis (6° each); 60 per month, fixed/movable pattern.
  const halfIdx = Math.floor(elong / 6); // 0..59
  let karana: string;
  if (halfIdx === 0) karana = 'Kimstughna';
  else if (halfIdx >= 57) karana = KARANA_FIXED[halfIdx - 57];
  else karana = KARANA_MOVABLE[(halfIdx - 1) % 7];

  const { auspicious, inauspicious, rahuKaal } = muhurtaWindows(weekdayIdx, sunriseIST, sunsetIST);

  return {
    date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    place: label,
    vaara: VAARA[weekdayIdx],
    tithi: `${paksha} ${tithiName}`,
    nakshatra: `${NAKSHATRAS[nakIdx]} (Pada ${pada})`,
    yoga: YOGAS[yogaIdx],
    karana,
    sunrise: fmtTime(sunriseIST),
    sunset: fmtTime(sunsetIST),
    rahu_kaal: rahuKaal ? `${rahuKaal.start} – ${rahuKaal.end}` : '—',
    auspicious,
    inauspicious,
    method: 'computed', // never AI-generated; shared Lahiri sidereal engine
  };
}

// Muhurta windows (Rahu Kaal / Yamaganda / Gulika + Abhijit) from the daytime span
// split into 8 equal parts. Shared by the local + VedAstro Panchang paths.
function muhurtaWindows(weekdayIdx: number, sunriseIST: number | null, sunsetIST: number | null) {
  const inauspicious: { name: string; start: string; end: string }[] = [];
  const auspicious: { name: string; start: string; end: string }[] = [];
  if (sunriseIST != null && sunsetIST != null) {
    const dayLen = ((sunsetIST - sunriseIST) + 24) % 24;
    const part = dayLen / 8;
    const seg = (n: number) => {
      const s = sunriseIST + (n - 1) * part;
      return { start: fmtTime(s % 24), end: fmtTime((s + part) % 24) };
    };
    const rahu = [8, 2, 7, 5, 6, 4, 3][weekdayIdx];
    const yama = [5, 4, 3, 2, 1, 7, 6][weekdayIdx];
    const gulika = [7, 6, 5, 4, 3, 2, 1][weekdayIdx];
    inauspicious.push({ name: 'Rahu Kaal', ...seg(rahu) });
    inauspicious.push({ name: 'Yamaganda', ...seg(yama) });
    inauspicious.push({ name: 'Gulika Kaal', ...seg(gulika) });
    const muh = dayLen / 15; // Abhijit Muhurta — 8th of 15 day-muhurtas.
    auspicious.push({
      name: 'Abhijit Muhurta',
      start: fmtTime((sunriseIST + 7 * muh) % 24),
      end: fmtTime((sunriseIST + 8 * muh) % 24),
    });
  }
  const rahuKaal = inauspicious.find((x) => x.name === 'Rahu Kaal');
  return { auspicious, inauspicious, rahuKaal };
}

// VedAstro-sourced Panchang (spec §3): the five limbs + sunrise/sunset come from
// VedAstro (Swiss Ephemeris); the muhurta windows are computed locally from that
// sunrise/sunset. Throws on any VedAstro failure so the caller falls back to the
// fully-local computePanchang. Same output shape as computePanchang.
async function buildPanchangVedastro(y: number, m: number, d: number, lat: number, lng: number, label: string | null) {
  const p = await Veda.fetchPanchang(lat, lng, y, m, d);
  const weekdayIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const sunriseIST = isoToIstHours(p.sunrise_iso);
  const sunsetIST = isoToIstHours(p.sunset_iso);
  const { auspicious, inauspicious, rahuKaal } = muhurtaWindows(weekdayIdx, sunriseIST, sunsetIST);
  return {
    date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    place: label,
    vaara: VAARA[weekdayIdx],
    tithi: `${p.paksha} ${p.tithi}`,
    nakshatra: `${p.nakshatra} (Pada ${p.pada})`,
    yoga: p.yoga,
    karana: p.karana,
    sunrise: fmtTime(sunriseIST),
    sunset: fmtTime(sunsetIST),
    rahu_kaal: rahuKaal ? `${rahuKaal.start} – ${rahuKaal.end}` : '—',
    auspicious,
    inauspicious,
    method: 'vedastro', // Swiss Ephemeris limbs; windows computed from its sun times
  };
}

// 'YYYY-MM-DDTHH:MM:SS+05:30' → IST decimal hours (India is fixed +5:30).
function isoToIstHours(iso: string | null): number | null {
  if (!iso) return null;
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

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
