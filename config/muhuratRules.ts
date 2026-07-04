// muhuratRules — SINGLE SOURCE OF TRUTH for the Shubh Muhurat Finder.
//
// Each activity carries a FIXED rule set (favourable nakshatras + weekdays). The
// finder iterates over each day's computed Panchang and matches these rules in
// plain code — there is NO AI/LLM involved anywhere. Rikta tithis (4/9/14 of each
// paksha) and Amavasya are avoided for every activity (applied by the engine).
//
// ⚠️ The `muhurat` Edge Function keeps a MIRROR of these rules (Deno can't import
// this file through the dashboard deploy — same constraint as the pricing tables).
// If you change a rule here, update the copy in supabase/functions/muhurat/index.ts.
//
// Nakshatra names must match the 27-name list used by the Panchang engine.

export type FunnelTarget = 'vastu' | 'matchmaking' | 'chat';

export interface MuhuratRule {
  good_nakshatras: string[]; // favourable birth-stars for this activity
  good_weekdays: number[];   // favourable weekdays, 0=Sun … 6=Sat
}

export interface MuhuratActivity {
  id: string;
  label: string; // English
  hindi: string; // common Hindi/Sanskrit term
  emoji: string;
  funnel: { target: FunnelTarget; text: string };
  rule: MuhuratRule;
}

// Rikta tithis (the 4th, 9th, 14th of each paksha) — avoided for all activities.
export const AVOID_RIKTA_TITHIS = [4, 9, 14];

const FUNNEL_VASTU = {
  target: 'vastu' as const,
  text: 'Want a full Vastu analysis of your home? Get a Vastu report.',
};
const FUNNEL_MATCH = {
  target: 'matchmaking' as const,
  text: 'Check full compatibility before you decide — get a Matchmaking report.',
};
const FUNNEL_CHAT = {
  target: 'chat' as const,
  text: 'Want to know if this timing suits YOUR chart? Ask the astrologer.',
};

export const MUHURAT_ACTIVITIES: MuhuratActivity[] = [
  {
    id: 'griha_pravesh',
    label: 'Housewarming',
    hindi: 'Griha Pravesh',
    emoji: '🏠',
    funnel: FUNNEL_VASTU,
    rule: {
      good_nakshatras: ['Rohini', 'Mrigashira', 'Pushya', 'Uttara Phalguni', 'Hasta', 'Chitra',
        'Anuradha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Uttara Bhadrapada', 'Revati'],
      good_weekdays: [1, 3, 4, 5], // Mon, Wed, Thu, Fri
    },
  },
  {
    id: 'marriage',
    label: 'Marriage',
    hindi: 'Vivah',
    emoji: '💍',
    funnel: FUNNEL_MATCH,
    rule: {
      good_nakshatras: ['Rohini', 'Mrigashira', 'Magha', 'Uttara Phalguni', 'Hasta', 'Swati',
        'Anuradha', 'Mula', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
      good_weekdays: [1, 3, 4, 5],
    },
  },
  {
    id: 'vehicle',
    label: 'Vehicle Purchase',
    hindi: 'Vahan Kharidi',
    emoji: '🚗',
    funnel: FUNNEL_CHAT,
    rule: {
      good_nakshatras: ['Ashwini', 'Rohini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Chitra',
        'Swati', 'Anuradha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Revati'],
      good_weekdays: [1, 3, 4, 5],
    },
  },
  {
    id: 'business',
    label: 'Business / Shop Opening',
    hindi: 'Vyapar Aarambh',
    emoji: '🏪',
    funnel: FUNNEL_CHAT,
    rule: {
      good_nakshatras: ['Ashwini', 'Pushya', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Anuradha',
        'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Uttara Bhadrapada', 'Revati'],
      good_weekdays: [1, 3, 4, 5],
    },
  },
  {
    id: 'naming',
    label: 'Naming Ceremony',
    hindi: 'Namkaran',
    emoji: '👶',
    funnel: FUNNEL_CHAT,
    rule: {
      good_nakshatras: ['Ashwini', 'Rohini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Chitra',
        'Swati', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Revati'],
      good_weekdays: [1, 3, 4, 5],
    },
  },
  {
    id: 'property',
    label: 'Property Purchase',
    hindi: 'Bhoomi / Sampatti Kharidi',
    emoji: '📜',
    funnel: FUNNEL_VASTU,
    rule: {
      good_nakshatras: ['Rohini', 'Mrigashira', 'Pushya', 'Uttara Phalguni', 'Uttara Ashadha',
        'Uttara Bhadrapada', 'Chitra', 'Anuradha', 'Shravana', 'Dhanishta', 'Revati'],
      good_weekdays: [3, 4, 5], // Wed, Thu, Fri
    },
  },
  {
    id: 'travel',
    label: 'Travel Start',
    hindi: 'Yatra Aarambh',
    emoji: '🧭',
    funnel: FUNNEL_CHAT,
    rule: {
      good_nakshatras: ['Ashwini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Anuradha',
        'Shravana', 'Dhanishta', 'Shatabhisha', 'Revati'],
      good_weekdays: [1, 3, 4, 5],
    },
  },
];

export function activityById(id: string): MuhuratActivity | undefined {
  return MUHURAT_ACTIVITIES.find((a) => a.id === id);
}
