// numerology — FIXED, pre-written interpretation library.
//
// This is a static table, NOT AI output. The numerology feature computes a
// number (1–9, 11, 22, 33) in plain code (lib/numerology.ts) and serves the
// matching entry below. No Claude/OpenAI call is ever made for these meanings.
//
// One entry per possible number. `keyword` is a one-line essence; `life_path`
// and `expression` give the reading framed for each core number.

export interface NumerologyMeaning {
  title: string;    // e.g. 'The Leader'
  keyword: string;  // short essence
  life_path: string;
  expression: string;
}

export const NUMEROLOGY_MEANINGS: Record<number, NumerologyMeaning> = {
  1: {
    title: 'The Pioneer',
    keyword: 'Independence · initiative · leadership',
    life_path:
      'Your path is one of self-reliance and new beginnings. You are here to lead rather than follow — ' +
      'to start things others only talk about. Cultivate patience with those who move slower, and let ' +
      'confidence, not ego, guide your ambition.',
    expression:
      'You express yourself with originality and drive. People sense a natural authority in you and look ' +
      'to you to set direction. Your gift is turning ideas into action.',
  },
  2: {
    title: 'The Peacemaker',
    keyword: 'Harmony · sensitivity · partnership',
    life_path:
      'Your path flows through relationship, cooperation and quiet diplomacy. You sense what others feel ' +
      'and bring balance where there is tension. Guard against losing yourself in others’ needs — your ' +
      'gentleness is a strength, not a weakness.',
    expression:
      'You express yourself through tact, warmth and the ability to unite people. You are the trusted ' +
      'confidant and the steady hand behind harmonious teams.',
  },
  3: {
    title: 'The Communicator',
    keyword: 'Creativity · expression · joy',
    life_path:
      'Your path is lit by creativity and self-expression. Words, art and warmth flow through you, and ' +
      'you lift the spirits of those around you. Focus your many talents rather than scattering them, and ' +
      'your light becomes a beacon.',
    expression:
      'You express yourself with charm, humour and imagination. You are a natural storyteller who makes ' +
      'others feel seen and uplifted.',
  },
  4: {
    title: 'The Builder',
    keyword: 'Stability · discipline · foundation',
    life_path:
      'Your path is one of patient building — laying strong foundations others can rely on. Order, effort ' +
      'and integrity are your tools. Allow room for flexibility and rest; your steadiness is what makes ' +
      'lasting things possible.',
    expression:
      'You express yourself through diligence, structure and dependability. When you commit, it is built ' +
      'to last, and people trust you to see it through.',
  },
  5: {
    title: 'The Explorer',
    keyword: 'Freedom · change · adventure',
    life_path:
      'Your path is movement, curiosity and change. You are here to experience life fully and to adapt ' +
      'with grace. Channel your restlessness into meaningful discovery rather than distraction, and ' +
      'freedom becomes wisdom.',
    expression:
      'You express yourself with versatility, wit and a love of new experience. You bring energy and fresh ' +
      'perspective wherever you go.',
  },
  6: {
    title: 'The Nurturer',
    keyword: 'Responsibility · love · service',
    life_path:
      'Your path centres on care, family and responsibility. You are drawn to heal, protect and beautify ' +
      'the lives around you. Remember to receive as generously as you give, and your home becomes a source ' +
      'of strength for many.',
    expression:
      'You express yourself through compassion, loyalty and a natural sense of duty. People feel safe and ' +
      'cared for in your presence.',
  },
  7: {
    title: 'The Seeker',
    keyword: 'Wisdom · introspection · spirituality',
    life_path:
      'Your path turns inward — toward knowledge, reflection and the search for deeper truth. Solitude ' +
      'renews you and insight is your gift. Share what you learn rather than withdrawing, and you become ' +
      'a quiet teacher.',
    expression:
      'You express yourself through depth, analysis and a contemplative mind. You see beneath the surface ' +
      'and value substance over show.',
  },
  8: {
    title: 'The Achiever',
    keyword: 'Power · abundance · mastery',
    life_path:
      'Your path is one of ambition, material mastery and influence. You are here to achieve and to manage ' +
      'resources wisely. Balance drive with generosity and ethics, and success flows naturally and ' +
      'sustainably.',
    expression:
      'You express yourself through leadership, resilience and a talent for turning vision into results. ' +
      'You command respect and handle responsibility with confidence.',
  },
  9: {
    title: 'The Humanitarian',
    keyword: 'Compassion · idealism · completion',
    life_path:
      'Your path is broad and giving — service to humanity and the wisdom of letting go. You feel deeply ' +
      'and dream of a better world. Learn to release what has run its course, and your compassion touches ' +
      'many lives.',
    expression:
      'You express yourself through generosity, artistry and a wide, embracing heart. You inspire others ' +
      'toward their higher potential.',
  },
  11: {
    title: 'The Visionary (Master)',
    keyword: 'Intuition · inspiration · illumination',
    life_path:
      'As a master number, 11 carries the sensitivity of 2 raised to a spiritual octave. Your path is one ' +
      'of intuition, inspiration and inner light — you are here to uplift and illuminate. Ground your ' +
      'high sensitivity in daily practice, and you become a source of guidance for others.',
    expression:
      'You express yourself through intuition, idealism and an almost electric inspiration. People are ' +
      'moved and awakened by your presence.',
  },
  22: {
    title: 'The Master Builder (Master)',
    keyword: 'Vision · manifestation · legacy',
    life_path:
      'As a master number, 22 unites the dreamer and the builder. Your path is to turn great visions into ' +
      'concrete reality that serves many. The potential is vast — meet it with discipline and patience, ' +
      'and you can build something that outlasts you.',
    expression:
      'You express yourself through large-scale vision matched with practical mastery. You can architect ' +
      'lasting institutions and ideas.',
  },
  33: {
    title: 'The Master Teacher (Master)',
    keyword: 'Compassion · healing · devotion',
    life_path:
      'As the rarest master number, 33 is the number of selfless love and spiritual teaching. Your path ' +
      'is one of nurturing on a wide scale — healing, guiding and giving without seeking reward. Care for ' +
      'yourself as devotedly as you care for others.',
    expression:
      'You express yourself through profound compassion, wisdom and the gift of uplifting whole ' +
      'communities. You teach most powerfully by example.',
  },
};

export function meaningFor(n: number): NumerologyMeaning | null {
  return NUMEROLOGY_MEANINGS[n] ?? null;
}
