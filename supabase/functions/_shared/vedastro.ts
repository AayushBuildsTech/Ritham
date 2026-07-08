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

import { SIGNS } from './astro.ts';

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
