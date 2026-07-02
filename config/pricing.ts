// All monetary values in paise (integer). Display in ₹ = value / 100.

export const SESSION_PLANS = [
  { id: 'jyoti',     label: 'Jyoti',     seconds: 60,   price_paise: 1500 },
  { id: 'kiran',     label: 'Kiran',     seconds: 300,  price_paise: 3900 },
  { id: 'tara',      label: 'Tara',      seconds: 600,  price_paise: 6900 },
  { id: 'nakshatra', label: 'Nakshatra', seconds: 900,  price_paise: 9900 },
  { id: 'antariksh', label: 'Antariksh', seconds: 1800, price_paise: 17900 },
] as const;

export const QUESTION_PACKS = [
  { id: 'bindu',     label: 'Bindu',     questions: 1,   price_paise: 500,  first_purchase_only: true },
  { id: 'panch',     label: 'Panch',     questions: 5,   price_paise: 1900, first_purchase_only: false },
  { id: 'darshan',   label: 'Darshan',   questions: 15,  price_paise: 4900, first_purchase_only: false, badge: 'most_popular' },
  { id: 'gyan',      label: 'Gyan',      questions: 40,  price_paise: 11900, first_purchase_only: false },
  { id: 'brahmanda', label: 'Brahmanda', questions: 100, price_paise: 27900, first_purchase_only: false },
] as const;

export const REPORT_PRICES = {
  vastu:       { price_paise: 14900 },
  matchmaking: { price_paise: 19900 },
} as const;

export type SessionPlanId = typeof SESSION_PLANS[number]['id'];
export type QuestionPackId = typeof QUESTION_PACKS[number]['id'];
export type ReportType = keyof typeof REPORT_PRICES;

export function paiseTo(paise: number): string {
  return `₹${(paise / 100).toFixed(0)}`;
}

export function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m === 1 ? '1 min' : `${m} min`;
}
