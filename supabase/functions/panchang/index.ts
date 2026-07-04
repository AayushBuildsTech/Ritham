// Edge Function: panchang
// Daily Hindu almanac (Panchang) for a city — tithi, vaara, nakshatra, yoga,
// karana, sunrise, sunset, Rahu Kaal and the day's auspicious/inauspicious
// windows. GENERIC, not personalised: the SAME for every user in the same city
// on the same day.
//
// ⚠️ ZERO AI / ZERO PROVIDER COST. Everything here is COMPUTED with astronomy
// formulas in pure TypeScript — there is NO Claude/OpenAI call and no external
// astrology-provider request. (The project's kundliService/provider is a mock
// with no Panchang endpoint, so we compute directly — see DECISIONS.md.)
//
// Margin protection (rule #4): computed ONCE per (place, date) and cached in
// public.panchang_cache, SHARED across all users in that city (place_key = lat/lng
// rounded to 1 decimal). Cache hit → instant; miss → compute, store, return. A
// daily cron could pre-warm cities later (none exists yet — on-demand covers it).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const IST_OFFSET = 5.5; // hours; all users are in India

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

    // Resolve the user's city from their own profile (birth place lat/lng).
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

    // Cache hit? (shared across the whole city — rule #4)
    const { data: cached } = await admin
      .from('panchang_cache').select('data')
      .eq('place_key', placeKey).eq('date_key', dateKey).maybeSingle();
    if (cached) return json({ ...cached.data, cached: true });

    // Miss → COMPUTE (pure astronomy, no AI), then store.
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
// PURE ASTRONOMY — no external calls. Computes Sun/Moon longitudes and derives
// the five limbs (panch-anga) of the almanac plus sunrise/sunset and the day's
// muhurta windows. Values are reported at local sunrise (the traditional anchor).
// ══════════════════════════════════════════════════════════════════════════════

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const norm360 = (x: number) => ((x % 360) + 360) % 360;
const sinD = (x: number) => Math.sin(x * D2R);
const cosD = (x: number) => Math.cos(x * D2R);
const tanD = (x: number) => Math.tan(x * D2R);

const VAARA = ['Sunday (Ravivara)', 'Monday (Somavara)', 'Tuesday (Mangalavara)',
  'Wednesday (Budhavara)', 'Thursday (Guruvara)', 'Friday (Shukravara)', 'Saturday (Shanivara)'];

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

const KARANA_MOVABLE = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];
const KARANA_FIXED = ['Shakuni', 'Chatushpada', 'Naga', 'Kimstughna'];

function istYMD(): { y: number; m: number; d: number; iso: string } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, iso };
}

// Julian Day for a UTC calendar instant.
function julianDay(y: number, m: number, d: number, hourUT: number): number {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1))
    + d + B - 1524.5 + hourUT_frac(hourUT);
}
const hourUT_frac = (h: number) => h / 24;

// Lahiri (Chitrapaksha) ayanamsa — linear approximation (deg). ~23.85° at J2000,
// precessing ~50.29"/yr. Good to a few arc-minutes for this decade.
function ayanamsa(jd: number): number {
  return 23.85 + ((jd - 2451545.0) / 365.25) * (50.2388475 / 3600);
}

// Apparent geocentric ecliptic longitude of the Sun (tropical, deg). Meeus low-precision.
function sunLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sinD(M)
    + (0.019993 - 0.000101 * T) * sinD(2 * M)
    + 0.000289 * sinD(3 * M);
  return norm360(L0 + C);
}

// Apparent geocentric ecliptic longitude of the Moon (tropical, deg). Meeus ch.47,
// truncated to the dominant periodic terms (accuracy ~a few arc-minutes).
function moonLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525;
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T * T * T / 538841 - T * T * T * T / 65194000);
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868 - T * T * T * T / 113065000);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T * T * T / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699 - T * T * T * T / 14712000);
  const F = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - T * T * T / 3526000 + T * T * T * T / 863310000);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;

  // term: [coeff(1e-6 deg), D, M, Mp, F, E-power]
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
    const arg = dd * D + mm * M + mp * Mp + ff * F;
    let coeff = c;
    if (ep === 1) coeff *= E;
    else if (ep === 2) coeff *= E * E;
    sum += coeff * sinD(arg);
  }
  return norm360(Lp + sum / 1_000_000);
}

// Sunrise/Sunset in IST decimal hours (Almanac-for-Computers algorithm).
// Returns null when the sun does not rise/set (not expected in India).
function sunEventIST(y: number, m: number, d: number, lat: number, lng: number, rise: boolean): number | null {
  const N = dayOfYear(y, m, d);
  const zenith = 90.833; // official, with refraction + solar radius
  const lngHour = lng / 15;
  const t = rise ? N + (6 - lngHour) / 24 : N + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = norm360(M + 1.916 * sinD(M) + 0.020 * sinD(2 * M) + 282.634);
  let RA = norm360(R2D * Math.atan(0.91764 * tanD(L)));
  RA += (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90); // same quadrant as L
  RA /= 15;
  const sinDec = 0.39782 * sinD(L);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (cosD(zenith) - sinDec * sinD(lat)) / (cosDec * cosD(lat));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rise ? 360 - R2D * Math.acos(cosH) : R2D * Math.acos(cosH)) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = ((T - lngHour) % 24 + 24) % 24;
  return (UT + IST_OFFSET) % 24; // IST decimal hours
}

function dayOfYear(y: number, m: number, d: number): number {
  const n1 = Math.floor(275 * m / 9);
  const n2 = Math.floor((m + 9) / 12);
  const n3 = 1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3);
  return n1 - n2 * n3 + d - 30;
}

// Decimal IST hours → "h:mm AM/PM".
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

  // Sunrise/sunset (IST hours).
  const sunriseIST = sunEventIST(y, m, d, lat, lng, true);
  const sunsetIST = sunEventIST(y, m, d, lat, lng, false);

  // Evaluate the luni-solar limbs at sunrise (fall back to 06:00 IST).
  const anchorIST = sunriseIST ?? 6;
  const jd = julianDay(y, m, d, anchorIST - IST_OFFSET); // convert IST → UT hours

  const sunLon = sunLongitude(jd);
  const moonLon = moonLongitude(jd);
  const ayan = ayanamsa(jd);
  const moonSid = norm360(moonLon - ayan);
  const sunSid = norm360(sunLon - ayan);

  // Tithi — 12° of elongation each; 30 per lunar month.
  const elong = norm360(moonLon - sunLon);
  const tithiIdx = Math.floor(elong / 12); // 0..29
  const paksha = tithiIdx < 15 ? 'Shukla' : 'Krishna';
  const within = tithiIdx % 15; // 0..14
  const tithiName = within === 14 && paksha === 'Shukla' ? 'Purnima'
    : within === 14 && paksha === 'Krishna' ? 'Amavasya'
    : TITHI_NAMES[within];

  // Nakshatra — 13°20' each (moon, sidereal).
  const nakSpan = 360 / 27;
  const nakIdx = Math.floor(moonSid / nakSpan); // 0..26
  const pada = Math.floor((moonSid % nakSpan) / (nakSpan / 4)) + 1; // 1..4

  // Yoga — (sidereal sun + sidereal moon) in 13°20' segments.
  const yogaIdx = Math.floor(norm360(sunSid + moonSid) / nakSpan);

  // Karana — half-tithis (6° each); 60 per month with the fixed/movable pattern.
  const halfIdx = Math.floor(elong / 6); // 0..59
  let karana: string;
  if (halfIdx === 0) karana = 'Kimstughna';
  else if (halfIdx >= 57) karana = KARANA_FIXED[halfIdx - 57];
  else karana = KARANA_MOVABLE[(halfIdx - 1) % 7];

  // Muhurta windows from the daytime span, split into 8 equal parts.
  const inauspicious: { name: string; start: string; end: string }[] = [];
  const auspicious: { name: string; start: string; end: string }[] = [];
  if (sunriseIST != null && sunsetIST != null) {
    const dayLen = ((sunsetIST - sunriseIST) + 24) % 24;
    const part = dayLen / 8;
    const seg = (n: number) => { // n = 1-based part
      const s = sunriseIST + (n - 1) * part;
      return { start: fmtTime(s % 24), end: fmtTime((s + part) % 24) };
    };
    // Standard weekday → part tables (index by 0=Sun … 6=Sat).
    const rahu = [8, 2, 7, 5, 6, 4, 3][weekdayIdx];
    const yama = [5, 4, 3, 2, 1, 7, 6][weekdayIdx];
    const gulika = [7, 6, 5, 4, 3, 2, 1][weekdayIdx];
    inauspicious.push({ name: 'Rahu Kaal', ...seg(rahu) });
    inauspicious.push({ name: 'Yamaganda', ...seg(yama) });
    inauspicious.push({ name: 'Gulika Kaal', ...seg(gulika) });

    // Abhijit Muhurta — the 8th of 15 day-muhurtas, straddling solar noon.
    const muh = dayLen / 15;
    auspicious.push({
      name: 'Abhijit Muhurta',
      start: fmtTime((sunriseIST + 7 * muh) % 24),
      end: fmtTime((sunriseIST + 8 * muh) % 24),
    });
  }

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
    rahu_kaal: inauspicious.find((x) => x.name === 'Rahu Kaal')
      ? `${inauspicious.find((x) => x.name === 'Rahu Kaal')!.start} – ${inauspicious.find((x) => x.name === 'Rahu Kaal')!.end}`
      : '—',
    auspicious,
    inauspicious,
    method: 'computed', // never AI-generated
  };
}
