// Edge Function: kundli
// The ONLY place a real birth chart is computed. Replaces the old client-side mock
// (which just seeded a PRNG from the birth details). Uses the self-contained Vedic
// sidereal engine in ./astro.ts — Lahiri ayanamsa, whole-sign houses — so charts are
// astronomically correct with no external API, key, or per-chart cost.
//
// Pure compute: the client sends birth details and receives a chart; persistence
// (caching onto the profile row) stays on the client, exactly as before. Auth is
// required so the endpoint can't be hit anonymously.

import { computeLongitudes, SIGNS, NAKSHATRAS, signIndexOf, nakshatraOf, rev } from './astro.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Display names for the nine grahas, in the exact format the rest of the app expects.
const GRAHA_NAMES: Record<string, string> = {
  Sun: 'Sun (Surya)', Moon: 'Moon (Chandra)', Mars: 'Mars (Mangala)',
  Mercury: 'Mercury (Budha)', Jupiter: 'Jupiter (Guru)', Venus: 'Venus (Shukra)',
  Saturn: 'Saturn (Shani)', Rahu: 'Rahu', Ketu: 'Ketu',
};
const GRAHA_ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

// Convert a local wall-clock birth time in an IANA zone to the true UTC instant,
// honouring whatever offset (and historical DST, if any) applied on that date.
function zonedToUTC(dob: string, tob: string, tz: string): Date {
  const [y, mo, da] = dob.split('-').map(Number);
  const [h, mi, s] = tob.split(':').map((n) => Number(n) || 0);
  const asUTC = Date.UTC(y, mo - 1, da, h, mi, s);
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
  if (hour === 24) hour = 0; // some runtimes emit "24" for midnight
  const asIfUTC = Date.UTC(+map.year, +map.month - 1, +map.day, hour, +map.minute, +map.second);
  return asIfUTC - utcMs;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Require a valid Supabase JWT (any signed-in user) — no service role needed,
    // this endpoint only does math and returns it.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) return json({ error: 'unauthorized' }, 401);

    const body = await req.json();
    const { name, dob, tob, latitude, longitude, timezone } = body ?? {};
    if (!dob || !tob || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return json({ error: 'missing_birth_details' }, 400);
    }
    const tz = typeof timezone === 'string' && timezone ? timezone : 'Asia/Kolkata';

    const when = zonedToUTC(dob, tob, tz);
    if (isNaN(when.getTime())) return json({ error: 'bad_datetime' }, 400);

    const { sidereal } = computeLongitudes(when, latitude, longitude);

    const lagnaIdx = signIndexOf(sidereal.Ascendant);
    const placements = GRAHA_ORDER.map((key) => {
      const lon = sidereal[key];
      const idx = signIndexOf(lon);
      return {
        graha: GRAHA_NAMES[key],
        sign: SIGNS[idx],
        house: ((idx - lagnaIdx + 12) % 12) + 1,
      };
    });

    const lagna = SIGNS[lagnaIdx];
    const moon_sign = SIGNS[signIndexOf(sidereal.Moon)];
    const sun_sign = SIGNS[signIndexOf(sidereal.Sun)];
    const nakshatra = nakshatraOf(sidereal.Moon);

    const kundli = {
      lagna,
      moon_sign,
      sun_sign,
      nakshatra,
      placements,
      summary: buildSummary(name, lagna, moon_sign, sun_sign, nakshatra),
      source: 'lahiri' as const,
      computed_at: new Date().toISOString(),
    };

    return json({ kundli });
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});
