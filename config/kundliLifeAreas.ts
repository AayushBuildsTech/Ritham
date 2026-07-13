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
import { hiGraha, hiSign, hiHouseOrd } from '../lib/astroHindi';

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

// ─────────────────────────────────────────────────────────────────────────────
//  Hindi (Devanagari) variant — same deterministic composition, in Hindi.
// ─────────────────────────────────────────────────────────────────────────────
const AREA_THEME_HI: Record<number, string> = {
  1: 'आपके व्यक्तित्व, ऊर्जा और आप दुनिया से कैसे मिलते हैं',
  2: 'धन, बचत, परिवार और वाणी',
  6: 'स्वास्थ्य, दैनिक आदतों और सहनशक्ति',
  7: 'साझेदारी, विवाह और घनिष्ठ संबंधों',
  10: 'करियर, प्रतिष्ठा और जीवन उद्देश्य',
};
const HOUSE_THEME_HI: Record<number, string> = {
  1: 'स्वयं, स्वास्थ्य और आत्मविश्वास', 2: 'धन, परिवार और वाणी', 3: 'साहस, प्रयास और पहल',
  4: 'घर, सुख और आंतरिक शांति', 5: 'रचनात्मकता, शिक्षा और संतान', 6: 'कार्य, दिनचर्या और बाधाओं पर विजय',
  7: 'साझेदारी और दूसरों के साथ व्यवहार', 8: 'परिवर्तन, गहराई और अप्रत्याशित मोड़', 9: 'भाग्य, मूल्य और उच्च शिक्षा',
  10: 'करियर, प्रतिष्ठा और सार्वजनिक जीवन', 11: 'आय, लाभ और सामाजिक दायरा', 12: 'यात्रा, व्यय और आध्यात्मिकता',
};
const DASHA_THEME_HI: Record<string, string> = {
  Sun: 'अधिकार, आत्मविश्वास और मान्यता', Moon: 'भावनाओं, घर और मन के विषयों',
  Mars: 'ऊर्जा, साहस और साहसिक कार्य', Mercury: 'शिक्षा, संवाद और व्यापार',
  Jupiter: 'विकास, ज्ञान और सौभाग्य', Venus: 'संबंध, सुख और रचनात्मकता',
  Saturn: 'अनुशासन, धैर्य और स्थिर, स्थायी प्रयास', Rahu: 'महत्वाकांक्षा, नई दिशाओं और सांसारिक लाभ',
  Ketu: 'आत्मचिंतन, त्याग और आंतरिक विकास',
};
const DIGNITY_CLAUSE_HI: Record<string, string> = {
  Exalted: ', जो यहाँ उच्च और बलवान है,', 'Own sign': ', अपनी राशि में सहज,',
  Debilitated: ', यद्यपि कमज़ोर स्थित और प्रयास मांगता,', Neutral: '',
};
const dignityWordHi: Record<string, string> = {
  Exalted: 'उच्च', 'Own sign': 'स्वराशि में', Debilitated: 'नीच', Neutral: 'ठीक स्थित',
};

export function buildLifeAreasHi(input: {
  houses: HouseLordLite[]; grahas?: GrahaLite[] | null; manglik?: boolean; mahaLord?: string | null;
}): LifeArea[] {
  const { houses, grahas, manglik, mahaLord } = input;
  const at = (n: number) => houses.find((h) => h.house === n);
  const areas: LifeArea[] = [];

  const rulerLineHi = (h: HouseLordLite, areaHouse: number): string => {
    const lord = shortName(h.lord);
    const dig = findGraha(grahas, lord)?.dignity;
    const digClause = (dig && DIGNITY_CLAUSE_HI[dig]) || '';
    const dest = HOUSE_THEME_HI[h.lord_house];
    const seat = h.lord_house >= 1
      ? ` आपके ${hiHouseOrd(h.lord_house)} भाव में स्थित है${dest ? `, इसे ${dest} से जोड़ता` : ''}`
      : '';
    return `आपका ${hiHouseOrd(areaHouse)} भाव — ${AREA_THEME_HI[areaHouse]} का — ${hiGraha(lord)}${digClause} के स्वामित्व में है, जो${seat}।`;
  };
  const karakaLineHi = (areaKey: string, rulerName: string): string => {
    const name = KARAKA[areaKey];
    if (name === rulerName) return '';
    const g = findGraha(grahas, name);
    if (!g) return '';
    const notes: string[] = [];
    if (g.dignity && g.dignity !== 'Neutral') notes.push(dignityWordHi[g.dignity]);
    if (g.retrograde) notes.push('वक्री');
    const tail = notes.length ? ` (${notes.join(', ')})` : '';
    return ` ${hiGraha(name)}, इसका नैसर्गिक कारक, आपके ${hiHouseOrd(g.house)} भाव में ${hiSign(shortName(g.sign))} में है${tail}।`;
  };
  const add = (key: string, title: string, n: number, extra = '') => {
    const h = at(n);
    if (!h) return;
    areas.push({ key, title, text: rulerLineHi(h, n) + karakaLineHi(key, shortName(h.lord)) + extra });
  };

  add('self', 'व्यक्तित्व और स्वयं', 1);
  add('wealth', 'धन और वित्त', 2);
  add('career', 'करियर और उद्देश्य', 10);
  add('love', 'संबंध और विवाह', 7,
    manglik ? ' मांगलिक (मंगल) स्थिति बस धैर्य और अनुकूल जोड़ीदार मांगती है — आमतौर पर सावधानी से संभाली जाती है।' : '');
  add('health', 'स्वास्थ्य और कल्याण', 6);

  if (mahaLord && DASHA_THEME_HI[mahaLord]) {
    areas.push({
      key: 'phase', title: 'आपका वर्तमान चरण',
      text: `आप अभी अपनी ${hiGraha(mahaLord)} महादशा में हैं — एक अवधि जो ${DASHA_THEME_HI[mahaLord]} को उजागर करती है।`,
    });
  }
  return areas;
}
