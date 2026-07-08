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

import { computeLongitudes, SIGNS, signIndexOf, nakshatraOf, rev } from './astro.ts';

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
  source: 'lahiri';
  computed_at: string;
  // — rich additions (§2) —
  engine_version: 2;         // marker so consumers can detect/self-heal thin v1 charts
  pada: number;              // 1..4, the nakshatra quarter of the Moon
  lagna_lord: { graha: string; sign: string; house: number };
  house_lords: HouseLord[];
  yogas: Yoga[];
  dasha_timeline: DashaPeriod[]; // full Vimshottari mahadasha sequence, with dates
  birth_iso: string;             // birth instant (UTC) — anchor for dynamics
  moon_longitude: number;        // sidereal, for Sade Sati / pada
  latitude: number;              // echoed so dynamics can recompute transits
  longitude: number;
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
