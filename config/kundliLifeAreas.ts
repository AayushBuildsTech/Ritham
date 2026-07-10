// kundliLifeAreas — turns the computed chart into a few easy-to-read, life-area
// sections (Self, Wealth, Career, Relationships, Health, Current Phase) instead of one
// dense "chart summary" dump. Fully DETERMINISTIC from the stored chart — NO AI, NO
// provider call, no runtime cost.
//
// Each card is grounded in real data for THAT area: the ruler of the area's house
// (with its dignity + where it sits) AND the area's natural karaka (significator)
// planet pulled from the actual graha placements. Same short, friendly voice — just
// relevant to the card, never a generic template.

export interface HouseLordLite {
  house: number; sign: string; lord: string; lord_house: number; lord_sign: string;
}
// Minimal graha shape we read (mirrors GrahaFact / Placement).
export interface GrahaLite {
  graha: string; sign: string; house: number;
  dignity?: 'Exalted' | 'Debilitated' | 'Own sign' | 'Neutral';
  retrograde?: boolean; combust?: boolean;
}
export interface LifeArea { key: string; title: string; text: string }

const shortName = (s: string) => (s || '').split(' (')[0].trim() || s;
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// The area's OWN theme (used in its sentence so a card always speaks to its title).
const AREA_THEME: Record<number, string> = {
  1: 'your personality, vitality and how you meet the world',
  2: 'wealth, savings, family and speech',
  6: 'health, daily habits and resilience',
  7: 'partnership, marriage and close bonds',
  10: 'career, status and life purpose',
};

// What the house a planet SITS IN broadly colours — used to say where the ruler
// channels this area's energy.
const HOUSE_THEME: Record<number, string> = {
  1: 'self, health and confidence',
  2: 'money, family and speech',
  3: 'courage, effort and initiative',
  4: 'home, comfort and inner peace',
  5: 'creativity, learning and children',
  6: 'work, routine and overcoming obstacles',
  7: 'partnership and dealings with others',
  8: 'change, depth and unexpected turns',
  9: 'luck, values and higher learning',
  10: 'career, reputation and public life',
  11: 'income, gains and your social circle',
  12: 'travel, expenses and spirituality',
};

// Natural karaka (significator) planet for each area — the planet Vedic astrology
// reads first for that domain.
const KARAKA: Record<string, string> = {
  self: 'Sun', wealth: 'Jupiter', career: 'Saturn', love: 'Venus', health: 'Mars',
};

const DASHA_THEME: Record<string, string> = {
  Sun: 'authority, confidence and recognition',
  Moon: 'emotions, home and matters of the heart',
  Mars: 'energy, courage and bold action',
  Mercury: 'learning, communication and business',
  Jupiter: 'growth, wisdom and good fortune',
  Venus: 'relationships, comfort and creativity',
  Saturn: 'discipline, patience and steady, lasting effort',
  Rahu: 'ambition, new directions and worldly gains',
  Ketu: 'introspection, letting go and inner growth',
};

// How a planet's dignity reads in plain language (as a trailing clause).
const DIGNITY_CLAUSE: Record<string, string> = {
  Exalted: ', exalted and strong here,',
  'Own sign': ', comfortable in its own sign,',
  Debilitated: ', though weakly placed and asking for effort,',
  Neutral: '',
};
const dignityWord: Record<string, string> = {
  Exalted: 'exalted', 'Own sign': 'in its own sign', Debilitated: 'debilitated', Neutral: 'well-set',
};

const findGraha = (grahas: GrahaLite[] | null | undefined, english: string): GrahaLite | undefined =>
  grahas?.find((g) => shortName(g.graha) === english);

// Ruler sentence: names the area's house ruler, its dignity, where it sits, and how
// that connects THIS area to another part of life.
function rulerLine(h: HouseLordLite, areaHouse: number, grahas: GrahaLite[] | null | undefined): string {
  const lord = shortName(h.lord);
  const dig = findGraha(grahas, lord)?.dignity;
  const digClause = (dig && DIGNITY_CLAUSE[dig]) || '';
  const dest = HOUSE_THEME[h.lord_house];
  const seat = h.lord_house >= 1
    ? ` sits in your ${ord(h.lord_house)} bhaav${dest ? `, linking it with ${dest}` : ''}`
    : '';
  return `Your ${ord(areaHouse)} house of ${AREA_THEME[areaHouse]} is ruled by ${lord}${digClause} which${seat}.`;
}

// Karaka sentence: the area's significator planet, with its sign/house + condition.
// Skipped when the karaka is also this area's house ruler (avoids repeating a planet).
function karakaLine(areaKey: string, rulerName: string, grahas: GrahaLite[] | null | undefined): string {
  const name = KARAKA[areaKey];
  if (name === rulerName) return '';
  const g = findGraha(grahas, name);
  if (!g) return '';
  const sign = shortName(g.sign);
  const notes: string[] = [];
  if (g.dignity && g.dignity !== 'Neutral') notes.push(dignityWord[g.dignity]);
  if (g.retrograde) notes.push('retrograde');
  const tail = notes.length ? ` (${notes.join(', ')})` : '';
  return ` ${name}, its natural significator, is in ${sign} in your ${ord(g.house)} bhaav${tail}.`;
}

export function buildLifeAreas(input: {
  houses: HouseLordLite[]; grahas?: GrahaLite[] | null; manglik?: boolean; mahaLord?: string | null;
}): LifeArea[] {
  const { houses, grahas, manglik, mahaLord } = input;
  const at = (n: number) => houses.find((h) => h.house === n);
  const areas: LifeArea[] = [];
  const add = (key: string, title: string, n: number, extra = '') => {
    const h = at(n);
    if (!h) return;
    areas.push({ key, title, text: rulerLine(h, n, grahas) + karakaLine(key, shortName(h.lord), grahas) + extra });
  };

  add('self', 'Personality & Self', 1);
  add('wealth', 'Wealth & Finances', 2);
  add('career', 'Career & Purpose', 10);
  add('love', 'Relationships & Marriage', 7,
    manglik ? ' A Manglik (Mangal) placement simply asks for patience and a compatible match — commonly handled with care.' : '');
  add('health', 'Health & Wellbeing', 6);

  if (mahaLord && DASHA_THEME[mahaLord]) {
    areas.push({
      key: 'phase', title: 'Your Current Phase',
      text: `You are currently running your ${mahaLord} mahadasha — a period that highlights ${DASHA_THEME[mahaLord]}.`,
    });
  }
  return areas;
}
