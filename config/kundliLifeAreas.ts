// kundliLifeAreas — turns the computed chart into a few easy-to-read, life-area
// sections (Self, Wealth, Career, Relationships, Health, Current Phase) instead of one
// dense "chart summary" dump. Fully DETERMINISTIC from the stored chart (house lords +
// running dasha) with STATIC copy — NO AI, NO provider call, no runtime cost.

export interface HouseLordLite {
  house: number; sign: string; lord: string; lord_house: number; lord_sign: string;
}
export interface LifeArea { key: string; title: string; text: string }

const shortGraha = (g: string) => (g || '').split(' (')[0].trim() || g;
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// What each bhaav (house the lord sits in) broadly colours in life.
const HOUSE_THEME: Record<number, string> = {
  1: 'your health, confidence and sense of self',
  2: 'money, family and the way you speak',
  3: 'courage, effort and your own initiative',
  4: 'home, inner peace and comfort',
  5: 'creativity, learning and children',
  6: 'work, daily routine and overcoming obstacles',
  7: 'partnership, marriage and dealings with others',
  8: 'change, depth and unexpected turns',
  9: 'luck, values and higher learning',
  10: 'career, reputation and public life',
  11: 'income, gains and social circle',
  12: 'rest, travel, expenses and spirituality',
};

// The gentle flavour of the running mahadasha, by planet.
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

const line = (h: HouseLordLite): string => {
  const theme = HOUSE_THEME[h.lord_house] ?? 'important matters of life';
  const where = h.lord_house >= 1 ? ` sitting in your ${ord(h.lord_house)} bhaav —` : ' —';
  return `This area is guided by ${shortGraha(h.lord)},${where} bringing focus to ${theme}.`;
};

export function buildLifeAreas(input: {
  houses: HouseLordLite[]; manglik?: boolean; mahaLord?: string | null;
}): LifeArea[] {
  const { houses, manglik, mahaLord } = input;
  const at = (n: number) => houses.find((h) => h.house === n);
  const areas: LifeArea[] = [];
  const add = (key: string, title: string, n: number, extra = '') => {
    const h = at(n);
    if (h) areas.push({ key, title, text: line(h) + extra });
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
