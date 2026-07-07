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
import { computeLongitudes, sunTimesUTC, NAKSHATRAS, rev } from '../_shared/astro.ts';

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

    const data = computePanchang(y, m, d, lat, lng, profile.birth_place ?? null);

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
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
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

  // Muhurta windows from the daytime span split into 8 equal parts.
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
