// All monetary values in paise (integer). Display in ₹ = value / 100.

export const SESSION_PLANS = [
  { id: 'jyoti',     label: 'Jyoti',     seconds: 60,   price_paise: 1500 },
  { id: 'kiran',     label: 'Kiran',     seconds: 300,  price_paise: 3900 },
  { id: 'tara',      label: 'Tara',      seconds: 600,  price_paise: 6900 },
  { id: 'nakshatra', label: 'Nakshatra', seconds: 900,  price_paise: 9900 },
  { id: 'antariksh', label: 'Antariksh', seconds: 1800, price_paise: 17900 },
] as const;

// Voice-call packs (AI phone-style call with the astrologer). Priced above the
// ~₹11–13/min pay-as-you-go cost so every minute nets profit; the first 60s is free
// (granted server-side, not a pack). Seconds are partially consumable across calls.
export const CALL_PACKS = [
  { id: 'vaani',        label: 'Vaani',    seconds: 120,  price_paise: 4900 },
  { id: 'sanvaad',      label: 'Sanvaad',  seconds: 300,  price_paise: 11900 },
  { id: 'samvaad_plus', label: 'Samvaad+', seconds: 600,  price_paise: 21900, badge: 'most_popular' },
  { id: 'vistaar',      label: 'Vistaar',  seconds: 1200, price_paise: 39900 },
  { id: 'poorna',       label: 'Poorna',   seconds: 1800, price_paise: 55900 },
] as const;

export const QUESTION_PACKS = [
  { id: 'bindu',     label: 'Bindu',     questions: 1,   price_paise: 900,  first_purchase_only: false },
  { id: 'panch',     label: 'Panch',     questions: 5,   price_paise: 3500, first_purchase_only: false },
  { id: 'darshan',   label: 'Darshan',   questions: 15,  price_paise: 7900, first_purchase_only: false, badge: 'most_popular' },
  { id: 'gyan',      label: 'Gyan',      questions: 40,  price_paise: 16900, first_purchase_only: false },
  { id: 'brahmanda', label: 'Brahmanda', questions: 100, price_paise: 34900, first_purchase_only: false },
] as const;

// All report prices in paise. Fixed & fair — do NOT overcharge (see BuildSpec §5).
// The five chart-based reports read the user's own cached Kundli; Vastu is
// property-based (floor plan) and Matchmaking is two-person (partner chart).
export const REPORT_PRICES = {
  // Flagship — the deepest, most comprehensive reading (premium anchor).
  life:        { price_paise: 29900 },
  // Focused single-person chart reports (impulse-friendly).
  career:      { price_paise: 9900 },
  love:        { price_paise: 7900 },
  health:      { price_paise: 6900 },
  education:   { price_paise: 6900 },
  // Home & compatibility (kept a touch higher — floor plan / two-person effort).
  vastu:       { price_paise: 12900 },
  matchmaking: { price_paise: 14900 },
  // Karmic & spiritual — reads the user's own Kundli.
  pastlife:    { price_paise: 9900 },
  // Palmistry × astrology — reads an uploaded palm photo (vision) cross-referenced
  // with the user's own Kundli. Impulse-friendly, in line with the focused readings.
  palm:        { price_paise: 9900 },
} as const;

export type SessionPlanId = typeof SESSION_PLANS[number]['id'];
export type CallPackId = typeof CALL_PACKS[number]['id'];
export type QuestionPackId = typeof QUESTION_PACKS[number]['id'];
export type ReportType = keyof typeof REPORT_PRICES;

// The five new reports are single-person chart readings driven only by the
// user's own Kundli — they share one intake screen (/report-chart).
export const CHART_REPORT_TYPES = ['life', 'career', 'love', 'health', 'education', 'pastlife'] as const;
export type ChartReportType = typeof CHART_REPORT_TYPES[number];
export function isChartReport(t: string): t is ChartReportType {
  return (CHART_REPORT_TYPES as readonly string[]).includes(t);
}

// UI metadata for the Reports section (single source of truth for cards).
export type ReportGroup = 'flagship' | 'personal' | 'home' | 'karmic' | 'divination';
export interface ReportMeta {
  type: ReportType;
  title: string;
  desc: string;   // one-line description
  icon: string;
  group: ReportGroup;
  route: string;  // where the card navigates
}

// Order here is the on-screen display order (the Reports tab & My Reports render this
// array top-to-bottom). The two most distinctive readings — Palm Reading and Past Life
// — lead the library, above even the flagship Kundli analysis, to showcase them.
export const REPORT_META: ReportMeta[] = [
  // ── Palmistry & divination (lead — most unique) ───────────────────────────────
  { type: 'palm', title: 'Palm Reading', icon: '✋', group: 'divination', route: '/palmreading',
    desc: 'Upload a photo of your palm for a line-by-line reading of your Heart, Head, Life & Fate lines and mounts — cross-referenced with your Vedic chart.' },
  // ── Karmic & spiritual ───────────────────────────────────────────────────────
  { type: 'pastlife', title: 'Past Life Predictions', icon: '☸', group: 'karmic', route: '/report-chart',
    desc: 'Karmic patterns, soul lessons & poorva-punya from previous lives — read through your 5th, 9th, 12th & 8th houses and the Rahu–Ketu axis.' },
  // ── Flagship ────────────────────────────────────────────────────────────────
  { type: 'life', title: 'Complete Kundli Analysis', icon: '✦', group: 'flagship', route: '/report-chart',
    desc: 'Your full life reading — all 12 houses, planets, yogas, Mahadasha timeline, life-area outlook & remedies.' },
  // ── Personal (focused, single-chart) ─────────────────────────────────────────
  { type: 'career', title: 'Career & Finance', icon: '💼', group: 'personal', route: '/report-chart',
    desc: '10th-house & wealth analysis, suitable fields, job-vs-business, favourable career periods.' },
  { type: 'love', title: 'Love & Relationship', icon: '💗', group: 'personal', route: '/report-chart',
    desc: '5th & 7th-house reading of your relationship patterns, timing, and what to seek in a partner.' },
  { type: 'health', title: 'Health & Wellbeing', icon: '🌿', group: 'personal', route: '/report-chart',
    desc: 'Constitutional tendencies, areas to care for, and gentle lifestyle guidance. Not medical advice.' },
  { type: 'education', title: 'Education & Career (Students)', icon: '📖', group: 'personal', route: '/report-chart',
    desc: 'Favourable fields of study, academic strengths, exam timing — guidance for students & parents.' },
  // ── Home & compatibility (existing) ──────────────────────────────────────────
  { type: 'vastu', title: 'Vaastu Report', icon: '🏠', group: 'home', route: '/report-vastu',
    desc: 'Upload your floor plan for a room-by-room Vaastu consultancy with score & remedies.' },
  { type: 'matchmaking', title: 'Matchmaking Report', icon: '💞', group: 'home', route: '/report-matchmaking',
    desc: 'Ashtakoot Guna Milan with your partner — 36-guna score, doshas, both charts, remedies.' },
];

// Group headers for the Reports tab, in display order.
export const REPORT_GROUPS: { key: ReportGroup; label: string }[] = [
  { key: 'flagship', label: 'Comprehensive' },
  { key: 'personal', label: 'Focused Readings' },
  { key: 'home', label: 'Home & Compatibility' },
  { key: 'karmic', label: 'Karmic & Spiritual' },
  { key: 'divination', label: 'Palmistry & Divination' },
];

export function paiseTo(paise: number): string {
  return `₹${(paise / 100).toFixed(0)}`;
}

export function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (rem === 0) return m === 1 ? '1 min' : `${m} min`;
  return `${m} min ${rem}s`;
}

// Effective per-minute price of a call pack (for the "from ₹X/min" value line).
export function paisePerMinute(paise: number, seconds: number): number {
  return Math.round(paise / (seconds / 60));
}

// The lowest per-minute call price across packs, e.g. "₹19/min" — surfaced up front.
export const CHEAPEST_CALL_PER_MIN: string = (() => {
  const min = Math.min(...CALL_PACKS.map((p) => paisePerMinute(p.price_paise, p.seconds)));
  return `₹${Math.round(min / 100)}/min`;
})();
