// Edge Function: horoscope
// Returns a daily/weekly/monthly horoscope anchored to the profile's Moon sign (Rashi)
// AND their current dasha + gochar transits (spec §2 — transit-aware, not a generic
// sign reading). The ONLY place the horoscope text is generated (AI narrates; the
// dasha/transit FACTS are computed from the stored rich chart — rule #2).
//
// Margin protection (rule #4): cached ONCE per (profile_id, period, period_key) in
// public.horoscopes — generated at most once per profile per period, not per view. On a
// cache hit we return instantly; on a miss we compute the dynamics, generate via Claude,
// store it, and return. Setting ANTHROPIC_API_KEY swaps the mock for real Claude.
// The chart data is READ from profiles.kundli_chart — this function never calls VedAstro.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-sonnet-5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Period = 'daily' | 'weekly' | 'monthly';
type Lang = 'en' | 'hi';

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

    // Rate limit (defense in depth): reads hit the per-profile/day cache cheaply,
    // but a cache miss generates via paid Claude. Cap requests per user per day so
    // spinning up many profiles can't be looped into unbounded generation.
    {
      const { data: allowed, error: rlErr } = await admin.rpc('rate_limit_hit', {
        p_bucket: `horoscope:${user.id}`, p_limit: 100, p_window_seconds: 86400,
      });
      if (!rlErr && allowed === false) return json({ error: 'rate_limited' }, 429);
    }

    const { profileId, period, lang: langRaw } = await req.json();
    if (period !== 'daily' && period !== 'weekly' && period !== 'monthly') {
      return json({ error: 'bad_period' }, 400);
    }
    if (!profileId) return json({ error: 'missing_profile' }, 400);
    // App language: 'hi' → Hindi (Devanagari) reading; anything else → English.
    const lang: Lang = langRaw === 'hi' ? 'hi' : 'en';

    // resolve the user's chart from their (own) profile
    const { data: profile } = await admin
      .from('profiles').select('kundli_chart, user_id, name')
      .eq('id', profileId).eq('user_id', user.id).maybeSingle();
    if (!profile) return json({ error: 'profile_not_found' }, 404);
    const chart = profile.kundli_chart;
    const sign: string | undefined = chart?.moon_sign;
    if (!sign) return json({ error: 'kundli_missing' }, 400);

    // Language is folded into the cache key so a Hindi and an English reading for the
    // same profile/period are cached as separate rows. English keeps the plain key
    // (back-compat with rows cached before bilingual support).
    const periodKey = periodKeyFor(period as Period, lang);

    // Cache hit? PER-PROFILE now (spec §2 — the horoscope references THIS person's dasha
    // + current transits, not a generic sign reading). Still generated at most once per
    // profile per period (rule #4 margins hold — it's a cache, not per-view).
    const { data: cached } = await admin
      .from('horoscopes').select('body')
      .eq('profile_id', profileId).eq('period', period).eq('period_key', periodKey).maybeSingle();
    if (cached) {
      return json({ sign, period, period_key: periodKey, body: cached.body, cached: true });
    }

    // Time-dependent context (dasha + gochar) — computed from the stored rich chart, so
    // the reading can say e.g. "Guru is transiting your 5th house this week". Degrades to
    // a sign-level reading if the chart is thin (no dasha timeline).
    let dyn: any = null;
    try { if (Array.isArray(chart?.dasha_timeline) && chart.dasha_timeline.length) dyn = currentDynamics(chart); } catch (_) { /* sign-level */ }

    // miss → generate, then store (ignore unique-violation from a concurrent writer)
    const body = await generateHoroscope(sign, period as Period, periodKey, dyn, lang);
    const { error: insErr } = await admin
      .from('horoscopes').insert({ profile_id: profileId, sign, period, period_key: periodKey, body });
    if (insErr && (insErr as any).code === '23505') {
      const { data: raced } = await admin
        .from('horoscopes').select('body')
        .eq('profile_id', profileId).eq('period', period).eq('period_key', periodKey).maybeSingle();
      return json({ sign, period, period_key: periodKey, body: raced?.body ?? body, cached: true });
    }

    return json({ sign, period, period_key: periodKey, body, cached: false });
  } catch (e) {
    console.error('horoscope error:', String((e as Error)?.message ?? e));
    return json({ error: 'server_error' }, 500);
  }
});

// ── IST-based period bucket keys (all users are in India) ──────────────────────
function istYMD(): { y: number; m: number; d: number; iso: string } {
  // 'en-CA' formats as YYYY-MM-DD
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, iso };
}

function periodKeyFor(period: Period, lang: Lang = 'en'): string {
  const { y, m, d, iso } = istYMD();
  let key: string;
  if (period === 'daily') key = iso;                      // YYYY-MM-DD
  else if (period === 'monthly') key = iso.slice(0, 7);   // YYYY-MM
  else {
    const { year, week } = isoWeek(y, m, d);              // weekly → ISO week
    key = `${year}-W${String(week).padStart(2, '0')}`;
  }
  // Suffix the language so Hindi & English readings cache separately. English keeps
  // the bare key so rows cached before bilingual support still hit.
  return lang === 'hi' ? `${key}:hi` : key;
}

function isoWeek(y: number, m: number, d: number): { year: number; week: number } {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;          // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);    // Thursday of this ISO week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return { year: date.getUTCFullYear(), week };
}

// ── generation (mock until ANTHROPIC_API_KEY is set) ───────────────────────────
// `dyn` (currentDynamics) is optional: when present the horoscope is anchored to THIS
// person's running dasha + current gochar (transits) relative to their chart (§2).
function transitContext(dyn: any): string {
  if (!dyn) return '';
  const t = (x: any) => x ? `${x.sign?.split(' (')[0]} (${x.house_from_moon} from Moon)` : 'n/a';
  const parts = [
    dyn.mahadasha?.lord && dyn.mahadasha.lord !== 'not available' ? `running Mahadasha of ${dyn.mahadasha.lord}${dyn.antardasha?.lord ? `, Antardasha of ${dyn.antardasha.lord}` : ''}` : '',
    dyn.transits?.jupiter ? `Guru transiting ${t(dyn.transits.jupiter)}` : '',
    dyn.transits?.saturn ? `Shani transiting ${t(dyn.transits.saturn)}` : '',
    dyn.sade_sati?.active ? `Sade Sati active (${dyn.sade_sati.phase} phase)` : '',
  ].filter(Boolean);
  return parts.join('; ');
}

function buildPrompt(sign: string, period: Period, dyn: any, lang: Lang = 'en'): { system: string; user: string } {
  const span = period === 'daily' ? 'today' : period === 'weekly' ? 'this week' : 'this month';
  const ctx = transitContext(dyn);
  // When the app language is Hindi, the astrological framing stays (it encodes the
  // computed facts), but the OUTPUT must be entirely Devanagari Hindi.
  const hindiDirective = lang === 'hi'
    ? ' Write the ENTIRE horoscope in natural, warm HINDI in Devanagari script — the way a real family pandit speaks. Keep common Sanskrit/astrology terms (Rashi, Nakshatra, Guru, Shani, Rahu, Ketu, dasha, Sade Sati) in Devanagari too. Do NOT reply in English or romanised Hindi.'
    : '';
  const system = (ctx
    ? [
        `You are Ritham, a warm and wise Vedic astrologer (jyotishi) writing a ${period} horoscope`,
        `for a person whose Moon sign (Rashi) is ${sign}.`,
        `Anchor the reading to THIS person's current periods and transits: ${ctx}.`,
        `Reference these naturally (e.g. "with Guru moving through your house of..."), interpreting`,
        `what they mean for ${span} — but do NOT state exact dates/degrees or invent placements`,
        `beyond what is given. Cover briefly: overall energy, relationships, career/money, and one`,
        `simple non-commercial remedy or focus (a mantra, colour, charity, intention).`,
        `Tone: calm, encouraging, grounded — never fear-mongering, never kitschy.`,
        `Length: 2–3 short paragraphs. Address the reader as "you". Plain, warm English with the`,
        `occasional Sanskrit term.`,
      ].join(' ')
    : [
        `You are Ritham, a warm and wise Vedic astrologer (jyotishi) writing a ${period} horoscope`,
        `for readers whose Moon sign (Rashi) is ${sign}.`,
        `Write general Vedic guidance for this Rashi for ${span} — do NOT invent specific chart`,
        `placements, dates, scores, or precise predictions (you have only the sign).`,
        `Cover, briefly: overall mood/energy, relationships, career or money, and one simple`,
        `remedy or focus (a mantra, colour, charity, or intention).`,
        `Tone: calm, encouraging, grounded — never fear-mongering, never kitschy.`,
        `Length: 2–3 short paragraphs. Address the reader as "you". Plain, warm English with the`,
        `occasional Sanskrit term.`,
      ].join(' ')) + hindiDirective;
  const user = lang === 'hi'
    ? `${sign} राशि के लिए ${period === 'daily' ? 'आज का' : period === 'weekly' ? 'इस सप्ताह का' : 'इस महीने का'} राशिफल हिंदी (देवनागरी) में लिखें।`
    : `Write the ${period} horoscope for ${sign} (${span}).`;
  return { system, user };
}

async function generateHoroscope(sign: string, period: Period, periodKey: string, dyn: any = null, lang: Lang = 'en'): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    const signName = sign.split(' (')[0];
    if (lang === 'hi') {
      const span = period === 'daily' ? 'आज' : period === 'weekly' ? 'इस सप्ताह' : 'इस महीने';
      return (
        `🌙 (झलक राशिफल — Claude API कुंजी सेट होते ही असली AI सक्रिय हो जाएगा।)\n\n` +
        `${span}, ${signName} राशि के लिए चंद्रमा एक स्थिर, सजग गति का साथ देते हैं। रिश्तों में धैर्य रखें ` +
        `और कोमलता से बोलें — एक छोटी-सी दया आपके पास लौटकर आती है। काम और धन में, कुछ नया शुरू करने के बजाय ` +
        `जो अधूरा है उसे पूरा करने पर ध्यान दें; निरंतरता अभी आपकी मित्र है।\n\n` +
        `${span} का एक सरल संकल्प: प्रतिक्रिया देने से पहले कुछ गहरी साँसें लें, और थोड़ा दान या एक शांत मंत्र ` +
        `अर्पित करें। तारे जल्दबाज़ी से अधिक शांत आत्मविश्वास को प्रोत्साहित करते हैं।`
      );
    }
    const span = period === 'daily' ? 'Today' : period === 'weekly' ? 'This week' : 'This month';
    const ctx = transitContext(dyn);
    const ctxLine = ctx ? ` With ${ctx.split(';')[0].trim()} in play, ` : ' ';
    return (
      `🌙 (Preview horoscope — real AI activates once the Claude API key is set.)\n\n` +
      `${span}, ${signName}, the Moon favours a steady, mindful pace.${ctxLine}tend to your relationships ` +
      `with patience and speak gently — a small act of kindness returns to you. In work and money, ` +
      `focus on what you can finish rather than starting something new; consistency is your ally now.\n\n` +
      `A simple focus for ${span.toLowerCase()}: pause for a few slow breaths before reacting, and ` +
      `offer a little charity or a quiet mantra. The stars encourage calm confidence over haste.`
    );
  }

  const { system, user } = buildPrompt(sign, period, dyn, lang);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      // Devanagari tokenises heavier than Latin — give Hindi more room so the
      // 2–3 paragraph reading isn't truncated mid-sentence.
      max_tokens: lang === 'hi' ? 1100 : 700,
      thinking: { type: 'disabled' },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: any) => b.type === 'text');
  const fallback = lang === 'hi'
    ? 'तारे इस समय शांत हैं — कृपया थोड़ी देर बाद फिर देखें।'
    : 'The stars are quiet just now — please check back shortly.';
  return textBlock?.text ?? fallback;
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
