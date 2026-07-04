// Edge Function: muhurat  (Shubh Muhurat Finder)
// Upcoming auspicious dates/windows for a chosen activity (Griha Pravesh, Marriage,
// Vehicle, Business, Naming, Property, Travel) in the user's city.
//
// ⚠️ ZERO AI / ZERO PROVIDER COST. For each day in the range we COMPUTE the Panchang
// in pure TypeScript (same astronomy as functions/panchang/index.ts) and match the
// activity's FIXED rule set — there is NO Claude/OpenAI call and no astrology-provider
// request. The whole result is cached per (activity, city, date-range) for the day.
//
// Rules mirror config/muhuratRules.ts (Deno can't import that file through the
// dashboard deploy — keep the two in sync, same as the pricing tables).
//
// v1 simplification (see DECISIONS.md): a day qualifies when its (sunrise) nakshatra
// and weekday are favourable and the tithi isn't Rikta/Amavasya; the auspicious time
// window reported is the universally-auspicious Abhijit Muhurta for that day.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const IST_OFFSET = 5.5;
const DEFAULT_HORIZON = 45; // days
const MAX_HORIZON = 90;
const MAX_RESULTS = 20;

// ── server mirror of config/muhuratRules.ts (keep in sync) ─────────────────────
const AVOID_RIKTA = new Set([4, 9, 14]); // Rikta tithis within a paksha
const RULES: Record<string, { good_nakshatras: string[]; good_weekdays: number[] }> = {
  griha_pravesh: {
    good_nakshatras: ['Rohini', 'Mrigashira', 'Pushya', 'Uttara Phalguni', 'Hasta', 'Chitra',
      'Anuradha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Uttara Bhadrapada', 'Revati'],
    good_weekdays: [1, 3, 4, 5],
  },
  marriage: {
    good_nakshatras: ['Rohini', 'Mrigashira', 'Magha', 'Uttara Phalguni', 'Hasta', 'Swati',
      'Anuradha', 'Mula', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
    good_weekdays: [1, 3, 4, 5],
  },
  vehicle: {
    good_nakshatras: ['Ashwini', 'Rohini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Chitra',
      'Swati', 'Anuradha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Revati'],
    good_weekdays: [1, 3, 4, 5],
  },
  business: {
    good_nakshatras: ['Ashwini', 'Pushya', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Anuradha',
      'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Uttara Bhadrapada', 'Revati'],
    good_weekdays: [1, 3, 4, 5],
  },
  naming: {
    good_nakshatras: ['Ashwini', 'Rohini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Chitra',
      'Swati', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Revati'],
    good_weekdays: [1, 3, 4, 5],
  },
  property: {
    good_nakshatras: ['Rohini', 'Mrigashira', 'Pushya', 'Uttara Phalguni', 'Uttara Ashadha',
      'Uttara Bhadrapada', 'Chitra', 'Anuradha', 'Shravana', 'Dhanishta', 'Revati'],
    good_weekdays: [3, 4, 5],
  },
  travel: {
    good_nakshatras: ['Ashwini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Anuradha',
      'Shravana', 'Dhanishta', 'Shatabhisha', 'Revati'],
    good_weekdays: [1, 3, 4, 5],
  },
};

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

    const { profileId, activity, startDate, endDate } = await req.json().catch(() => ({}));
    if (!profileId) return json({ error: 'missing_profile' }, 400);
    const rule = RULES[activity];
    if (!rule) return json({ error: 'bad_activity' }, 400);

    const { data: profile } = await admin
      .from('profiles').select('latitude, longitude, birth_place, user_id')
      .eq('id', profileId).eq('user_id', user.id).maybeSingle();
    if (!profile) return json({ error: 'profile_not_found' }, 404);
    const lat = Number(profile.latitude);
    const lng = Number(profile.longitude);
    if (!isFinite(lat) || !isFinite(lng)) return json({ error: 'place_missing' }, 400);

    // Resolve the IST date range (default: today … today+45, capped at +90).
    const today = istToday();
    const start = isISO(startDate) ? startDate : today;
    let end = isISO(endDate) ? endDate : addDaysISO(start, DEFAULT_HORIZON);
    if (daysBetween(start, end) > MAX_HORIZON) end = addDaysISO(start, MAX_HORIZON);

    const placeKey = `${lat.toFixed(1)},${lng.toFixed(1)}`;
    const rangeKey = `${start}_${end}`;

    // Cache hit? (shared per activity/city/range for the day)
    const { data: cached } = await admin
      .from('muhurat_cache').select('data')
      .eq('activity', activity).eq('place_key', placeKey).eq('range_key', rangeKey).maybeSingle();
    if (cached) return json({ ...cached.data, cached: true });

    // Miss → COMPUTE each day's Panchang and match the rule (pure code, no AI).
    const results: any[] = [];
    for (const day of dateRange(start, end)) {
      if (results.length >= MAX_RESULTS) break;
      const p = dayPanchang(day.y, day.m, day.d, lat, lng);
      const nakName = NAKSHATRAS[p.nakIdx];
      const withinTithi = (p.tithiIdx % 15) + 1;
      const isAmavasya = p.tithiIdx === 29;

      const goodNak = rule.good_nakshatras.includes(nakName);
      const goodDay = rule.good_weekdays.includes(p.weekday);
      const badTithi = AVOID_RIKTA.has(withinTithi) || isAmavasya;
      if (goodNak && goodDay && !badTithi) {
        results.push({
          date: day.iso,
          weekday: VAARA[p.weekday],
          tithi: p.tithiLabel,
          nakshatra: nakName,
          yoga: YOGAS[p.yogaIdx],
          window: p.abhijit,      // auspicious time window (Abhijit Muhurta)
          sunrise: fmtTime(p.sunriseIST),
          sunset: fmtTime(p.sunsetIST),
        });
      }
    }

    const data = {
      activity,
      place: profile.birth_place ?? null,
      start, end,
      count: results.length,
      results,
      method: 'computed', // never AI-generated
    };

    const { error: insErr } = await admin.from('muhurat_cache').insert({
      activity, place_key: placeKey, range_key: rangeKey, data,
    });
    if (insErr && (insErr as any).code === '23505') {
      const { data: raced } = await admin
        .from('muhurat_cache').select('data')
        .eq('activity', activity).eq('place_key', placeKey).eq('range_key', rangeKey).maybeSingle();
      return json({ ...(raced?.data ?? data), cached: true });
    }
    return json({ ...data, cached: false });
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Date helpers (IST) + PURE ASTRONOMY (mirror of functions/panchang/index.ts).
// ══════════════════════════════════════════════════════════════════════════════
const isISO = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}
function* dateRange(startISO: string, endISO: string) {
  let d = new Date(startISO + 'T00:00:00Z');
  const end = new Date(endISO + 'T00:00:00Z');
  while (d.getTime() <= end.getTime()) {
    yield { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), iso: d.toISOString().slice(0, 10) };
    d = new Date(d.getTime() + 86400000);
  }
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const norm360 = (x: number) => ((x % 360) + 360) % 360;
const sinD = (x: number) => Math.sin(x * D2R);
const cosD = (x: number) => Math.cos(x * D2R);
const tanD = (x: number) => Math.tan(x * D2R);

const VAARA = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TITHI_NAMES = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi',
  'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];
const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati',
  'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana',
  'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
const YOGAS = ['Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma',
  'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi',
  'Vyatipata', 'Variyana', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma',
  'Indra', 'Vaidhriti'];

function julianDay(y: number, m: number, d: number, hourUT: number): number {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5 + hourUT / 24;
}
function ayanamsa(jd: number): number {
  return 23.85 + ((jd - 2451545.0) / 365.25) * (50.2388475 / 3600);
}
function sunLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sinD(M)
    + (0.019993 - 0.000101 * T) * sinD(2 * M) + 0.000289 * sinD(3 * M);
  return norm360(L0 + C);
}
function moonLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525;
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T * T * T / 538841 - T * T * T * T / 65194000);
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868 - T * T * T * T / 113065000);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T * T * T / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699 - T * T * T * T / 14712000);
  const F = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - T * T * T / 3526000 + T * T * T * T / 863310000);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const terms: [number, number, number, number, number, number][] = [
    [6288774, 0, 0, 1, 0, 0], [1274027, 2, 0, -1, 0, 0], [658314, 2, 0, 0, 0, 0],
    [213618, 0, 0, 2, 0, 0], [-185116, 0, 1, 0, 0, 1], [-114332, 0, 0, 0, 2, 0],
    [58793, 2, 0, -2, 0, 0], [57066, 2, -1, -1, 0, 1], [53322, 2, 0, 1, 0, 0],
    [45758, 2, -1, 0, 0, 1], [-40923, 0, 1, -1, 0, 1], [-34720, 1, 0, 0, 0, 0],
    [-30383, 0, 1, 1, 0, 1], [15327, 2, 0, 0, -2, 0], [-12528, 0, 0, 1, 2, 0],
    [10980, 0, 0, 1, -2, 0], [10675, 4, 0, -1, 0, 0], [10034, 0, 0, 3, 0, 0],
    [8548, 4, 0, -2, 0, 0], [-7888, 2, 1, -1, 0, 1], [-6766, 2, 1, 0, 0, 1],
    [-5163, 1, 0, -1, 0, 0], [4987, 1, 1, 0, 0, 1], [4036, 2, -1, 1, 0, 1],
    [3994, 2, 0, 2, 0, 0], [3861, 4, 0, 0, 0, 0], [3665, 2, 0, -3, 0, 0],
  ];
  let sum = 0;
  for (const [c, dd, mm, mp, ff, ep] of terms) {
    let coeff = c;
    if (ep === 1) coeff *= E; else if (ep === 2) coeff *= E * E;
    sum += coeff * sinD(dd * D + mm * M + mp * Mp + ff * F);
  }
  return norm360(Lp + sum / 1_000_000);
}
function sunEventIST(y: number, m: number, d: number, lat: number, lng: number, rise: boolean): number | null {
  const N = dayOfYear(y, m, d);
  const zenith = 90.833;
  const lngHour = lng / 15;
  const t = rise ? N + (6 - lngHour) / 24 : N + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  const L = norm360(M + 1.916 * sinD(M) + 0.020 * sinD(2 * M) + 282.634);
  let RA = norm360(R2D * Math.atan(0.91764 * tanD(L)));
  RA += (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90);
  RA /= 15;
  const sinDec = 0.39782 * sinD(L);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (cosD(zenith) - sinDec * sinD(lat)) / (cosDec * cosD(lat));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rise ? 360 - R2D * Math.acos(cosH) : R2D * Math.acos(cosH)) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = ((T - lngHour) % 24 + 24) % 24;
  return (UT + IST_OFFSET) % 24;
}
function dayOfYear(y: number, m: number, d: number): number {
  const n1 = Math.floor(275 * m / 9);
  const n2 = Math.floor((m + 9) / 12);
  const n3 = 1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3);
  return n1 - n2 * n3 + d - 30;
}
function fmtTime(hours: number | null): string {
  if (hours == null) return '—';
  let h = Math.floor(hours);
  let mins = Math.round((hours - h) * 60);
  if (mins === 60) { mins = 0; h += 1; }
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

// Lean per-day Panchang: the fields the Muhurat rules and display need.
function dayPanchang(y: number, m: number, d: number, lat: number, lng: number) {
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const sunriseIST = sunEventIST(y, m, d, lat, lng, true);
  const sunsetIST = sunEventIST(y, m, d, lat, lng, false);
  const jd = julianDay(y, m, d, (sunriseIST ?? 6) - IST_OFFSET);

  const sunLon = sunLongitude(jd);
  const moonLon = moonLongitude(jd);
  const ayan = ayanamsa(jd);
  const moonSid = norm360(moonLon - ayan);
  const sunSid = norm360(sunLon - ayan);
  const nakSpan = 360 / 27;

  const elong = norm360(moonLon - sunLon);
  const tithiIdx = Math.floor(elong / 12); // 0..29
  const paksha = tithiIdx < 15 ? 'Shukla' : 'Krishna';
  const within = tithiIdx % 15;
  const tithiName = within === 14 && paksha === 'Shukla' ? 'Purnima'
    : within === 14 && paksha === 'Krishna' ? 'Amavasya' : TITHI_NAMES[within];

  const nakIdx = Math.floor(moonSid / nakSpan);
  const yogaIdx = Math.floor(norm360(sunSid + moonSid) / nakSpan);

  // Abhijit Muhurta (8th of 15 day-muhurtas).
  let abhijit = '—';
  if (sunriseIST != null && sunsetIST != null) {
    const dayLen = ((sunsetIST - sunriseIST) + 24) % 24;
    const muh = dayLen / 15;
    abhijit = `${fmtTime((sunriseIST + 7 * muh) % 24)} – ${fmtTime((sunriseIST + 8 * muh) % 24)}`;
  }

  return { weekday, tithiIdx, tithiLabel: `${paksha} ${tithiName}`, nakIdx, yogaIdx, sunriseIST, sunsetIST, abhijit };
}
