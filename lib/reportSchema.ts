// Report content contract (Master Prompt §6.8: "Output structured JSON per page").
//
// This is the interface between the PRODUCER (the `report` Edge Function, which
// fills content natively in the chosen language via the Claude API) and the
// CONSUMER (lib/reportRenderer.ts, which owns ALL animation, SVG, and layout).
// The LLM never emits HTML — only this typed content. Accent colours and UI-chrome
// strings are layered on by the client (reportAccents.ts / reportChrome.ts), so the
// JSON stays pure content and one renderer serves every report type + language.
//
// The model is BLOCK-BASED: each of the 9 pages is a title + an ordered list of
// typed blocks. The renderer is a block dispatcher, so new page layouts across the
// 8 report types are just different block sequences — no renderer forks per report.

import type { Lang } from './i18n';
import type { ReportType } from './reportService';

// ── shared value objects ─────────────────────────────────────────────────────

/** A comparable, ratable sub-item (X/10). Master Prompt §3.10: only for content the
 *  user is implicitly comparing/deciding between (fields, subjects, zones, houses,
 *  life-areas) — never narrative or emotionally-sensitive content. */
export interface RatingItem {
  label: string;
  score: number;      // 0..10
  note?: string;
}

/** Knowledge Nugget (§3.9) — genuinely explains a concept, present ≥1× per page from p3. */
export interface Nugget {
  title?: string;     // defaults to localized "Did you know" / "In Vedic astrology"
  body: string;
}

/** Expandable Insight Card (§3.5) — collapsed teaser → full body (+ optional nugget). */
export interface InsightCard {
  title: string;
  teaser: string;
  body: string;
  nugget?: Nugget;
}

/** Timeline Rail window (§3.3) — `current: true` gets the "you are here" marker. */
export interface TimelineWindow {
  label: string;
  period: string;     // e.g. "2027 – early 2029"
  note: string;
  current?: boolean;
}

export type RemedyKind = 'mantra' | 'gem' | 'ritual' | 'direction' | 'color' | 'daan' | 'practice';

/** Remedy Chip (§3.6) — always concrete: named mantra / gem+finger+day / direction / colour-on-weekday. */
export interface Remedy {
  kind: RemedyKind;
  title: string;
  detail: string;
}

export interface RadarAxis {
  label: string;
  value: number;      // 0..10
}

/** Qualitative gradient bar (§5.4 Health) — replaces score rings where a number would
 *  read as a diagnosis. `level` 0..1 fills a soft gradient, never a "/10". */
export interface GradientBar {
  label: string;
  level: number;      // 0..1
  note?: string;
}

/** One planet in a Vedic chart — placed by its whole-sign house (real chart data). */
export interface ChartPlanet {
  name: string;       // canonical English graha name (Sun, Moon, …); renderer abbreviates
  house: number;      // 1..12 from the Lagna
}

/** A Vaastu zone rating (§5.6) — rooms/directions are comparable, so X/10 is apt. */
export interface ZoneRating {
  label: string;
  score: number;      // 0..10
  note: string;
}

/** One Ashtakoot kuta (§5.7 p5) — kept on its NATIVE max scale, never normalized to /10. */
export interface Kuta {
  label: string;
  got: number;
  max: number;        // native maximum (varies per kuta)
  note?: string;
}

// ── block union (the renderer switches on `type`) ────────────────────────────

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'rings'; items: RatingItem[] }               // score/rating rings row (Snapshot)
  | { type: 'ratings'; items: RatingItem[] }             // Rating Badge list (comparable sub-items)
  | { type: 'gradientBars'; items: GradientBar[] }       // Health only — qualitative, no scores
  | { type: 'radar'; axes: RadarAxis[]; caption?: string }
  | { type: 'insights'; cards: InsightCard[] }
  | { type: 'timeline'; windows: TimelineWindow[] }
  | { type: 'remedies'; items: Remedy[] }
  | { type: 'nugget'; nugget: Nugget }
  | { type: 'honest'; text: string }                     // §6.4 page-7 honest, non-flattering note
  | { type: 'strengthsChallenges'; strengths: string[]; challenges: string[] }
  // Traditional North-Indian Vedic birth chart (लग्न कुंडली) — diamond layout, sign
  // numbers derived from `lagnaSign`, planets placed by whole-sign house.
  | { type: 'vedicChart'; lagnaSign: number; planets: ChartPlanet[] }   // lagnaSign 0..11 (Aries..Pisces)
  | { type: 'zoneGrid'; zones: ZoneRating[] }            // Vaastu — room/direction ratings
  // Matchmaking-only blocks (§5.7):
  | { type: 'compareCharts'; a: { name: string; lagnaSign: number; planets: ChartPlanet[] }; b: { name: string; lagnaSign: number; planets: ChartPlanet[] }; scoreLabel: string; score: number }
  | { type: 'dualScore'; technicalLabel: string; technicalValue: number; technicalMax: number; outOf10: number; note?: string }
  | { type: 'kutaBars'; items: Kuta[] }                  // per-kuta native-scale bars (never /10)
  | { type: 'signature'; lines: string[] };              // Signature Card recap bullets

export interface ReportPage {
  /** Skeleton key (cover|snapshot|chart|deepdive1|deepdive2|timing|strengths|remedies|summary). */
  key: string;
  /** Localized page title (Edge Fn sets it, usually via reportChrome). */
  title: string;
  /** Page-1 marker → the renderer gives it the gradient cover treatment + hero. */
  hero?: boolean;
  /** One-line headline insight (cover) or short lead for other pages. */
  lead?: string;
  blocks: Block[];
}

/** The full report the Edge Function emits (content only — no colours). */
export interface ReportContent {
  type: ReportType;
  lang: Lang;
  person: { name: string; birthLine: string };
  headline: string;    // cover one-liner
  pages: ReportPage[]; // exactly 9 (Master Prompt §4)
}

// Reports that carry ZERO rating badges (Master Prompt §3.10, §5.4, §5.8). The
// renderer and QA both consult this — a stray rating in these is a hard failure.
export const NO_RATING_REPORTS: ReadonlySet<ReportType> = new Set(['health', 'pastlife']);

// ─────────────────────────────────────────────────────────────────────────────
//  DEV SAMPLE — a full Career report used to build/preview the renderer before the
//  Edge Function JSON path exists. Reachable in-app via /report-view?preview=career.
//  Career is the spec's recommended first build (§8.6): mid-complexity, exercises
//  most components incl. Rating Badge.
// ─────────────────────────────────────────────────────────────────────────────
export const SAMPLE_CAREER: ReportContent = {
  type: 'career',
  lang: 'en',
  person: { name: 'Aarav Sharma', birthLine: '14 Mar 1996 · 07:42 · Jaipur' },
  headline: 'A builder’s chart — your 10th lord in Capricorn rewards patience with lasting authority.',
  pages: [
    {
      key: 'cover', title: 'Career & Finance', hero: true,
      lead: 'A builder’s chart — your 10th lord in Capricorn rewards patience with lasting authority.',
      blocks: [],
    },
    {
      key: 'snapshot', title: 'Snapshot',
      lead: 'Where your professional life stands today, at a glance.',
      blocks: [
        { type: 'rings', items: [
          { label: 'Career Momentum', score: 7 },
          { label: 'Wealth Yoga', score: 8 },
          { label: 'Timing Now', score: 6 },
        ] },
        { type: 'paragraph', text: 'Saturn’s steady grip on your 10th house makes you a slow starter who finishes far ahead — recognition tends to arrive after 32, and it compounds.' },
      ],
    },
    {
      key: 'chart', title: 'Core Chart',
      lead: 'Your 10th house of career and its ruling planet.',
      blocks: [
        { type: 'vedicChart', lagnaSign: 9, planets: [
          { name: 'Jupiter', house: 1 },
          { name: 'Mars', house: 2 }, { name: 'Mercury', house: 2 },
          { name: 'Sun', house: 3 }, { name: 'Saturn', house: 3 }, { name: 'Ketu', house: 3 },
          { name: 'Venus', house: 4 },
          { name: 'Moon', house: 8 },
          { name: 'Rahu', house: 9 },
        ] },
        { type: 'nugget', nugget: { body: 'The 10th house (Karma Bhava) is the peak of the chart — it shows your public role and how the world receives your work. Its ruling planet’s placement colours the whole career.' } },
      ],
    },
    {
      key: 'deepdive1', title: 'Suitable Fields',
      lead: 'The fields your chart is built to reward — rated for fit.',
      blocks: [
        { type: 'ratings', items: [
          { label: 'Engineering / Systems', score: 9, note: 'Saturn + Mercury favour structured, technical mastery.' },
          { label: 'Finance / Analysis', score: 8, note: 'Strong 2nd/11th axis for wealth handling.' },
          { label: 'Law / Governance', score: 7, note: 'Capricorn Lagna lends authority and discipline.' },
          { label: 'Creative / Media', score: 5, note: 'Possible, but not where your chart concentrates power.' },
        ] },
        { type: 'nugget', nugget: { title: 'In Vedic astrology', body: 'Career fields are read from the 10th lord, planets in the 10th, and the Amatyakaraka — the "minister" planet that signifies profession in Jaimini astrology.' } },
      ],
    },
    {
      key: 'deepdive2', title: 'Job vs Business',
      lead: 'Which path your chart leans toward — a head-to-head, not a score.',
      blocks: [
        { type: 'radar', caption: 'Your professional temperament', axes: [
          { label: 'Structure', value: 9 },
          { label: 'Autonomy', value: 6 },
          { label: 'Risk appetite', value: 4 },
          { label: 'Leadership', value: 8 },
          { label: 'Consistency', value: 9 },
          { label: 'Networking', value: 5 },
        ] },
        { type: 'insights', cards: [
          { title: 'Job: your natural fit', teaser: 'Structure and seniority suit you.', body: 'With Saturn strong and risk appetite modest, a well-run organisation lets you climb steadily to a senior, respected position — your Capricorn discipline shines inside a system.' },
          { title: 'Business: viable after 35', teaser: 'Better once your Saturn dasha matures.', body: 'Independent ventures work best after your Saturn Mahadasha settles — start as a side-build while employed, and formalise once cash flow is proven. Avoid partnerships that dilute control.' },
        ] },
        { type: 'nugget', nugget: { body: 'A strong Saturn favours employment and long-arc mastery; a strong, well-placed Sun or Mars favours independent enterprise. Yours leans Saturn — build, don’t gamble.' } },
      ],
    },
    {
      key: 'timing', title: 'Timing',
      lead: 'Favourable windows for a job change or a business launch.',
      blocks: [
        { type: 'timeline', windows: [
          { label: 'Consolidate', period: '2024 – 2026', note: 'Deepen skills; avoid abrupt switches.', current: true },
          { label: 'Promotion window', period: '2027 – early 2029', note: 'Saturn’s support peaks — push for seniority.' },
          { label: 'Venture launch', period: '2030 onward', note: 'Best window to formalise an independent build.' },
        ] },
        { type: 'nugget', nugget: { body: 'Vimshottari Mahadasha divides life into planetary periods. Career booms cluster where the dasha lord rules or aspects the 10th, 2nd, or 11th house.' } },
      ],
    },
    {
      key: 'strengths', title: 'Strengths & Challenges',
      lead: 'An honest, balanced read — not just the flattering half.',
      blocks: [
        { type: 'strengthsChallenges',
          strengths: ['Rare persistence — you outlast faster starters', 'Trusted with responsibility and money', 'Systematic, low-drama execution'],
          challenges: ['Slow to claim credit — you can be overlooked', 'Over-caution can delay well-timed risks', 'Discomfort with self-promotion and networking'],
        },
        { type: 'honest', text: 'Your chart shows a real tendency to wait to be noticed rather than to advocate for yourself. Left unchecked, this can hand your best opportunities to louder, less capable peers. The single highest-leverage change you can make is to name your contributions out loud.' },
        { type: 'nugget', nugget: { body: 'A "challenge" in a chart is rarely a wall — it’s a muscle the placement asks you to build. Saturn’s difficulties are the ones that, once worked, become your defining strength.' } },
      ],
    },
    {
      key: 'remedies', title: 'Remedies',
      lead: 'Specific, doable practices — prioritised by impact.',
      blocks: [
        { type: 'remedies', items: [
          { kind: 'mantra', title: 'Shani mantra', detail: 'Chant "Om Sham Shanicharaya Namah" 23× each Saturday evening to steady Saturn’s discipline into progress.' },
          { kind: 'daan', title: 'Saturday daan', detail: 'Offer black sesame or a simple meal to someone in need on Saturdays — traditionally eases Saturn’s heaviness.' },
          { kind: 'color', title: 'Deep blue on Saturdays', detail: 'Favour dark blue or black on Saturdays to align with your karmic planet.' },
          { kind: 'practice', title: 'Claim your work weekly', detail: 'Once a week, state one concrete result you delivered — to a manager, a peer, or in writing. This directly answers your chart’s blind spot.' },
        ] },
      ],
    },
    {
      key: 'summary', title: 'Summary',
      lead: 'Your career in three lines — made to share.',
      blocks: [
        { type: 'signature', lines: [
          'A builder’s chart: patience and structure compound into lasting authority.',
          'Engineering, finance, and governance are your strongest fields.',
          '2027–2029 is your promotion window — and learn to name your wins.',
        ] },
        { type: 'paragraph', text: 'For guidance and reflection — not a substitute for professional advice.' },
      ],
    },
  ],
};
