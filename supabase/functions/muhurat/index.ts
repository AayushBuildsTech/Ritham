// Edge Function: muhurat  (Shubh Muhurat Finder)
// Upcoming auspicious dates/windows for a chosen activity (Griha Pravesh, Marriage,
// Vehicle, Business, Naming, Property, Travel) in the user's city.
//
// ⚠️ ZERO AI / ZERO PROVIDER COST. For each day in the range we COMPUTE the Panchang
// with the shared Vedic astronomy engine (`../_shared/astro.ts` — the SAME engine and
// Lahiri ayanamsa the Kundli and Panchang use) and match the activity's FIXED rule
// set. There is NO Claude/OpenAI call and no astrology-provider request. The whole
// result is cached per (activity, city, date-range) for the day.
//
// Rules mirror config/muhuratRules.ts (keep the two in sync, same as the pricing tables).
//
// v1 simplification (see DECISIONS.md): a day qualifies when its (sunrise) nakshatra
// and weekday are favourable and the tithi isn't Rikta/Amavasya; the auspicious time
// window reported is the universally-auspicious Abhijit Muhurta for that day.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeLongitudes, sunTimesUTC, NAKSHATRAS, rev } from '../_shared/astro.ts';

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

    const today = istToday();
    const start = isISO(startDate) ? startDate : today;
    let end = isISO(endDate) ? endDate : addDaysISO(start, DEFAULT_HORIZON);
    if (daysBetween(start, end) > MAX_HORIZON) end = addDaysISO(start, MAX_HORIZON);

    const placeKey = `${lat.toFixed(1)},${lng.toFixed(1)}`;
    const rangeKey = `${start}_${end}`;

    const { data: cached } = await admin
      .from('muhurat_cache').select('data')
      .eq('activity', activity).eq('place_key', placeKey).eq('range_key', rangeKey).maybeSingle();
    if (cached) return json({ ...cached.data, cached: true });

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
          window: p.abhijit,
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
      method: 'computed', // never AI-generated; shared Lahiri sidereal engine
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
    console.error('muhurat error:', String((e as Error)?.message ?? e));
    return json({ error: 'server_error' }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Date helpers (IST) + per-day Panchang from the shared astronomy engine.
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

const VAARA = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TITHI_NAMES = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi',
  'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];
const YOGAS = ['Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma',
  'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi',
  'Vyatipata', 'Variyana', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma',
  'Indra', 'Vaidhriti'];

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

// Lean per-day Panchang: the fields the Muhurat rules and display need.
function dayPanchang(y: number, m: number, d: number, lat: number, lng: number) {
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const { riseUTC, setUTC } = sunTimesUTC(y, m, d, lat, lng);
  const sunriseIST = riseUTC ? istHours(riseUTC) : null;
  const sunsetIST = setUTC ? istHours(setUTC) : null;

  const anchorUTC = riseUTC ?? new Date(Date.UTC(y, m - 1, d, 0, 30, 0)); // 06:00 IST
  const L = computeLongitudes(anchorUTC, lat, lng);
  const moonSid = L.sidereal.Moon;
  const sunSid = L.sidereal.Sun;
  const nakSpan = 360 / 27;

  const elong = rev(L.tropical.Moon - L.tropical.Sun);
  const tithiIdx = Math.floor(elong / 12); // 0..29
  const paksha = tithiIdx < 15 ? 'Shukla' : 'Krishna';
  const within = tithiIdx % 15;
  const tithiName = within === 14 && paksha === 'Shukla' ? 'Purnima'
    : within === 14 && paksha === 'Krishna' ? 'Amavasya' : TITHI_NAMES[within];

  const nakIdx = Math.floor(moonSid / nakSpan);
  const yogaIdx = Math.floor(rev(sunSid + moonSid) / nakSpan);

  let abhijit = '—';
  if (sunriseIST != null && sunsetIST != null) {
    const dayLen = ((sunsetIST - sunriseIST) + 24) % 24;
    const muh = dayLen / 15;
    abhijit = `${fmtTime((sunriseIST + 7 * muh) % 24)} – ${fmtTime((sunriseIST + 8 * muh) % 24)}`;
  }

  return { weekday, tithiIdx, tithiLabel: `${paksha} ${tithiName}`, nakIdx, yogaIdx, sunriseIST, sunsetIST, abhijit };
}
