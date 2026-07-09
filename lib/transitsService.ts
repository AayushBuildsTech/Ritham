// transitsService — deterministic, client-side transit computation for the Retrograde
// (Vakri) Tracker and Sade Sati Tracker. Pure astronomy (lib/ephemeris.ts), so there is
// NO network call, NO VedAstro call, and NO AI/LLM anywhere in either feature.
//
// The global transit picture (which planets are retrograde today, Saturn's sign runs) is
// the SAME for everyone on a given day, so we compute it ONCE per day and cache the
// result in AsyncStorage keyed by date (zero-cost rule). Sade Sati is then derived per
// user from their stored natal Moon sign against that shared Saturn timeline — no extra
// work, no provider call. Exposed to the app via kundliService (the single data surface).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { siderealLongitudes, signIndex, SIGNS, rev, Body } from './ephemeris';
import { RETRO_PLANETS, RetroPlanet } from '../config/retrogradeMeanings';
import { SadePhase } from '../config/sadeSatiPhases';

const DAY = 86400000;
const CACHE_PREFIX = 'transits_v1_';

// ── public shapes ───────────────────────────────────────────────────────────────
export interface RetroPeriod { planet: RetroPlanet; start: string; end: string; sign: string; signIndex: number }
export interface UpcomingRetro { planet: RetroPlanet; start: string }
export interface RetrogradeStatus {
  current: RetroPeriod[];
  upcoming: UpcomingRetro[];
  computedFor: string; // YYYY-MM-DD
}
export interface SaturnRun { signIndex: number; start: string; end: string }
interface TransitBlob { retrograde: RetrogradeStatus; saturnRuns: SaturnRun[]; saturnSignIndex: number }

export interface SadeSatiStatus {
  active: boolean;
  moonSign: string;
  saturnSign: string;
  phase?: SadePhase;             // 1 rising / 2 peak / 3 setting
  phaseStart?: string;
  phaseEnd?: string;
  fullStart?: string;           // start of the ~7.5y cycle
  fullEnd?: string;             // end of the ~7.5y cycle
  progress?: number;            // 0..1 across the full cycle
  nextStart?: string;           // when the next Sade Sati begins (when inactive)
}

// ── velocity / retrograde ────────────────────────────────────────────────────────
const lonAt = (b: Body, t: number) => siderealLongitudes(new Date(t))[b];
const signedDelta = (a: number) => { let x = rev(a); if (x > 180) x -= 360; return x; };
// Daily motion (deg/day); negative ⇒ retrograde (vakri).
const velocity = (b: Body, t: number) => signedDelta(lonAt(b, t + DAY / 2) - lonAt(b, t - DAY / 2));

// Widest retro window per planet (days each side) — bounds the station scan.
const RETRO_WINDOW: Record<RetroPlanet, number> = { Mercury: 30, Venus: 50, Mars: 90, Jupiter: 130, Saturn: 160 };
const iso = (t: number) => new Date(t).toISOString();
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function computeRetrograde(now: number): RetrogradeStatus {
  const current: RetroPeriod[] = [];
  for (const p of RETRO_PLANETS) {
    if (velocity(p, now) >= 0) continue;
    const w = RETRO_WINDOW[p] * DAY;
    // walk back to the station where it turned retrograde
    let start = now;
    for (let t = now; t >= now - w; t -= DAY) { if (velocity(p, t) >= 0) { start = t + DAY; break; } start = t; }
    // walk forward to the station where it turns direct again
    let end = now;
    for (let t = now; t <= now + w; t += DAY) { if (velocity(p, t) >= 0) { end = t; break; } end = t; }
    const si = signIndex(lonAt(p, now));
    current.push({ planet: p, start: iso(start), end: iso(end), sign: SIGNS[si], signIndex: si });
  }

  // next retrograde stations over the coming ~11 months (skip ones already ongoing)
  const upcoming: UpcomingRetro[] = [];
  const ongoing = new Set(current.map((c) => c.planet));
  const seen = new Set<RetroPlanet>();
  let prev: Record<string, number> = {};
  for (const p of RETRO_PLANETS) prev[p] = velocity(p, now);
  for (let t = now + DAY; t <= now + 330 * DAY; t += DAY) {
    for (const p of RETRO_PLANETS) {
      if (seen.has(p) || ongoing.has(p)) continue;
      const v = velocity(p, t);
      if (prev[p] >= 0 && v < 0) { upcoming.push({ planet: p, start: iso(t) }); seen.add(p); }
      prev[p] = v;
    }
    if (seen.size + ongoing.size >= RETRO_PLANETS.length) break;
  }
  upcoming.sort((a, b) => a.start.localeCompare(b.start));
  return { current, upcoming: upcoming.slice(0, 3), computedFor: ymd(new Date(now)) };
}

// ── Saturn sign runs (global timeline used for Sade Sati) ─────────────────────────
// Sample Saturn's sign over ~-11y..+12y, collapse into runs, drop retrograde-boundary
// transients (<150 days), then refine each boundary to the day.
function computeSaturnRuns(now: number): { runs: SaturnRun[]; currentIndex: number } {
  const from = now - 11 * 365 * DAY, to = now + 12 * 365 * DAY;
  const step = 10 * DAY;
  const samples: { t: number; si: number }[] = [];
  for (let t = from; t <= to; t += step) samples.push({ t, si: signIndex(lonAt('Saturn', t)) });

  // collapse equal consecutive signs into raw runs
  type Raw = { si: number; start: number; end: number };
  const raw: Raw[] = [];
  for (const s of samples) {
    const last = raw[raw.length - 1];
    if (last && last.si === s.si) last.end = s.t;
    else raw.push({ si: s.si, start: s.t, end: s.t });
  }
  // drop transients (retrograde wobble at a boundary) by merging short runs into the previous
  const merged: Raw[] = [];
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    if (prev && (r.end - r.start) < 150 * DAY && prev.si !== r.si) { prev.end = r.end; continue; }
    if (prev && prev.si === r.si) { prev.end = r.end; continue; }
    merged.push({ ...r });
  }
  // refine each boundary to the day (scan the 10-day gap before the sampled change)
  const refineStart = (approx: number, si: number): number => {
    for (let t = approx; t >= approx - step; t -= DAY) if (signIndex(lonAt('Saturn', t)) !== si) return t + DAY;
    return approx;
  };
  const runs: SaturnRun[] = merged.map((r, i) => ({
    signIndex: r.si,
    start: iso(i === 0 ? r.start : refineStart(r.start, r.si)),
    end: '', // filled below from the next run's start
  }));
  for (let i = 0; i < runs.length - 1; i++) runs[i].end = runs[i + 1].start;
  if (runs.length) runs[runs.length - 1].end = iso(to);
  const currentIndex = signIndex(lonAt('Saturn', now));
  return { runs, currentIndex };
}

// ── day-cached global blob ────────────────────────────────────────────────────────
async function getBlob(): Promise<TransitBlob> {
  const now = Date.now();
  const key = CACHE_PREFIX + ymd(new Date(now));
  try {
    const hit = await AsyncStorage.getItem(key);
    if (hit) return JSON.parse(hit) as TransitBlob;
  } catch { /* ignore cache read errors */ }

  const retrograde = computeRetrograde(now);
  const { runs, currentIndex } = computeSaturnRuns(now);
  const blob: TransitBlob = { retrograde, saturnRuns: runs, saturnSignIndex: currentIndex };
  try {
    await AsyncStorage.setItem(key, JSON.stringify(blob));
    // best-effort: clear any prior day's entry so storage doesn't grow
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== key);
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch { /* ignore cache write errors */ }
  return blob;
}

// ── public API (routed through kundliService) ─────────────────────────────────────
export async function getRetrograde(): Promise<RetrogradeStatus> {
  return (await getBlob()).retrograde;
}

// moonSignName: the user's stored natal Moon sign (e.g. 'Libra (Tula)').
export async function getSadeSati(moonSignName: string): Promise<SadeSatiStatus> {
  const blob = await getBlob();
  const moonIdx = SIGNS.indexOf(moonSignName);
  const satIdx = blob.saturnSignIndex;
  const base = { moonSign: SIGNS[moonIdx] ?? moonSignName, saturnSign: SIGNS[satIdx] };
  if (moonIdx < 0) return { active: false, ...base };

  // Sade Sati signs: 12th (moon-1), 1st (moon), 2nd (moon+1) — as sign indices.
  const s12 = (moonIdx + 11) % 12, s1 = moonIdx, s2 = (moonIdx + 1) % 12;
  const after = (moonIdx + 2) % 12;
  const phaseOf = (si: number): SadePhase | null => si === s12 ? 1 : si === s1 ? 2 : si === s2 ? 3 : null;
  const runs = blob.saturnRuns;
  const nowISO = new Date().toISOString();

  // find the run Saturn is in right now
  const idx = runs.findIndex((r) => nowISO >= r.start && nowISO < r.end);
  const cur = idx >= 0 ? runs[idx] : null;
  const phase = cur ? phaseOf(cur.signIndex) : null;

  if (cur && phase) {
    // walk back to the run that entered the 12th (start of the cycle)
    let startRun = idx;
    while (startRun > 0 && phaseOf(runs[startRun - 1].signIndex) && runs[startRun - 1].signIndex !== after) startRun--;
    // walk forward to the run that leaves into the sign after the 2nd (end of the cycle)
    let endRun = idx;
    while (endRun < runs.length - 1 && phaseOf(runs[endRun + 1].signIndex)) endRun++;
    const fullStart = runs[startRun].start;
    const fullEnd = runs[endRun].end;
    const span = Date.parse(fullEnd) - Date.parse(fullStart);
    const progress = Math.min(1, Math.max(0, (Date.now() - Date.parse(fullStart)) / span));
    return { active: true, ...base, phase, phaseStart: cur.start, phaseEnd: cur.end, fullStart, fullEnd, progress };
  }

  // not active → next time Saturn enters the 12th from Moon
  const next = runs.find((r) => r.signIndex === s12 && r.start > nowISO);
  return { active: false, ...base, nextStart: next?.start };
}
