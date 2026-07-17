// Puja catalogue — the single client-side source of truth for the Puja Booking
// feature. All monetary values in paise (integer); display in ₹ = value / 100.
//
// SECURITY (rule #3): this file drives the UI only. The Edge Functions
// (create-order / verify-payment) keep their OWN mirror of every price + the
// add-on id→price map and recompute the order total server-side. Keep the two
// in sync — the server, not this file, owns the money.
//
// v1 ships ONE puja: the Pitra Dosha Puja performed at Agni Theertham,
// Rameswaram (the coastal shore beside Ramanathaswamy Temple where ancestral
// rites / Tarpanam / Thila Homam are traditionally done). The shapes below are
// generic so more pujas can be added later without new code.

import { paiseTo } from './pricing';

export { paiseTo };

// ── Bilingual copy helper ─────────────────────────────────────────────────────
export interface L { en: string; hi: string }
const L = (en: string, hi: string): L => ({ en, hi });

// ── Package tiers (how many devotees the sankalp covers) ──────────────────────
export interface PujaTier {
  id: string;
  label: L;
  subtitle: L;             // e.g. "Individual Package (1 Name • 1 Gotra)"
  tagline: L;              // one-line "best for …" guidance
  maxDevotees: number;     // number of sankalp name inputs
  perDevoteeGotra: boolean;// true → collect a gotra per name; false → one shared gotra
  price_paise: number;
  badge?: 'most_chosen' | 'best_value';
  features: L[];           // bullet list on the tier card
}

// Every package includes these (no prasad — Pitru rites do not send prasad home).
const TIER_FEATURES_BASE: L[] = [
  L('Rites performed at Agni Theertham, Rameswaram', 'अग्नि तीर्थम्, रामेश्वरम् पर कर्म'),
  L('Full puja video shared with you', 'पूरी पूजा का वीडियो आपके साथ साझा'),
  L('Live updates via WhatsApp', 'व्हाट्सएप पर लाइव अपडेट'),
];

export const PUJA_TIERS: PujaTier[] = [
  {
    id: 'pkg_individual_personal',
    label: L('Personal Shanti Puja', 'व्यक्तिगत शांति पूजा'),
    subtitle: L('Individual Package (1 Name • 1 Gotra)', 'व्यक्तिगत पैकेज (1 नाम • 1 गोत्र)'),
    tagline: L(
      'Best for resolving personal career blocks, health issues, or constant mental stress.',
      'व्यक्तिगत करियर बाधा, स्वास्थ्य समस्या या मानसिक तनाव के समाधान हेतु सर्वोत्तम।',
    ),
    maxDevotees: 1,
    perDevoteeGotra: false,
    price_paise: 299900,
    features: [L('Sankalp with your Name & Gotra', 'आपके नाम और गोत्र के साथ संकल्प'), ...TIER_FEATURES_BASE],
  },
  {
    id: 'pkg_couple_blessing',
    label: L('Couple’s Blessing Puja', 'दंपति आशीर्वाद पूजा'),
    subtitle: L('Husband & Wife Package (2 Names • 2 Gotras)', 'पति-पत्नी पैकेज (2 नाम • 2 गोत्र)'),
    tagline: L(
      'Recommended for marital harmony, household prosperity, and overcoming childbirth obstacles.',
      'वैवाहिक सामंजस्य, गृह समृद्धि और संतान बाधा निवारण हेतु अनुशंसित।',
    ),
    maxDevotees: 2,
    perDevoteeGotra: true,
    price_paise: 449900,
    badge: 'most_chosen',
    features: [L('Joint Sankalp for both Names & Gotras', 'दोनों नाम और गोत्र के लिए संयुक्त संकल्प'), ...TIER_FEATURES_BASE],
  },
  {
    id: 'pkg_family_protection',
    label: L('Family Protection Puja', 'पारिवारिक सुरक्षा पूजा'),
    subtitle: L('Nuclear Family Package (Parents + Kids • 1 Gotra)', 'एकल परिवार पैकेज (माता-पिता + बच्चे • 1 गोत्र)'),
    tagline: L(
      'A collective shield to protect your children’s health, education, and future growth.',
      'आपके बच्चों के स्वास्थ्य, शिक्षा और भविष्य की रक्षा हेतु सामूहिक कवच।',
    ),
    maxDevotees: 4,
    perDevoteeGotra: false,
    price_paise: 599900,
    badge: 'best_value',
    features: [L('Family Sankalp for up to 4 members', '4 सदस्यों तक के लिए पारिवारिक संकल्प'), ...TIER_FEATURES_BASE],
  },
  {
    id: 'pkg_joint_lineage',
    label: L('Full Lineage Maha Puja', 'पूर्ण वंश महा पूजा'),
    subtitle: L('Joint / Extended Family Package (Up to 6 Names)', 'संयुक्त / विस्तृत परिवार पैकेज (6 नाम तक)'),
    tagline: L(
      'The ultimate ritual to clear deep-seated generational debts for your entire extended family.',
      'आपके संपूर्ण विस्तृत परिवार के गहरे पैतृक ऋण मिटाने हेतु परम अनुष्ठान।',
    ),
    maxDevotees: 6,
    perDevoteeGotra: true,
    price_paise: 749900,
    features: [L('Full Sankalp for up to 6 members', '6 सदस्यों तक के लिए पूर्ण संकल्प'), ...TIER_FEATURES_BASE],
  },
];

export function getTier(id: string): PujaTier | undefined {
  return PUJA_TIERS.find((t) => t.id === id);
}

// ── Gotra (fixed, curated list — not free text) ───────────────────────────────
export const GOTRAS: string[] = [
  'Angirasa', 'Atri', 'Agastya', 'Alambayana', 'Bhardwaj', 'Bhrigu', 'Bilvala', 'Chandratre',
  'Chyavana', 'Dadhichi', 'Devala', 'Dhanvantari', 'Garg', 'Gautam', 'Gharat', 'Harita',
  'Jamadagni', 'Jandilya', 'Kalyan', 'Kanva', 'Kapila', 'Kashyap', 'Katyayan', 'Kaundinya',
  'Kaushik', 'Kuthsa', 'Laugakshi', 'Maitreya', 'Mandavya', 'Marichi', 'Markandeya', 'Maudgalya',
  'Mudgala', 'Narasimha', 'Nikhumbha', 'Parashar', 'Pippalada', 'Rathitara', 'Sankriti', 'Saraswat',
  'Savan', 'Shandilya', 'Shatatapa', 'Shaunaka', 'Shila', 'Shiva', 'Srivatsa', 'Upamanya',
  'Vardhulas', 'Vashishta', 'Vatsa', 'Vishnu', 'Vishvamitra', 'Vyasa',
];

// Shown behind the "help" icon next to the Gotra field when a user doesn't know theirs.
export const GOTRA_HELP: L = L(
  'No worries! If your family lineage is unknown, Vedic tradition permits using Kashyapa as a universal Gotra. Since Sage Kashyapa is regarded as the primordial father of all lineages, this is a widely accepted and spiritually valid default. Our priests will reverently chant this on your behalf during the Sankalpam.',
  'चिंता न करें! यदि आपकी वंश परंपरा अज्ञात है, तो वैदिक परंपरा कश्यप को एक सार्वभौमिक गोत्र के रूप में स्वीकार करती है। ऋषि कश्यप को समस्त वंशों का आदि पिता माना जाता है, इसलिए यह व्यापक रूप से मान्य और आध्यात्मिक रूप से वैध विकल्प है। हमारे पुजारी संकल्पम् के दौरान आपकी ओर से श्रद्धापूर्वक इसका उच्चारण करेंगे।',
);

// ── Add-on bhet / daan (optional offerings layered onto the puja) ─────────────
// These are Pitra-Dosha / Agni-Theertham specific (ancestral rites), NOT generic
// Lakshmi offerings. Prices are the owner's fixed rates.
export type AddOnTag =
  | 'highly_recommended' | 'most_offered' | 'karma_shuddhi'
  | 'dosha_nivaran' | 'auspicious' | 'purna_phala';

export interface PujaAddOn {
  id: string;
  name: L;
  description: L;
  benefit: L;          // one-line spiritual benefit
  tag: AddOnTag;
  tagLabel: L;
  price_paise: number;
  image: any;
}

export const PUJA_ADDONS: PujaAddOn[] = [
  {
    id: 'kaka_bali_seva',
    name: L('Kaka Bali Seva (Crow Feeding)', 'काक बलि सेवा (कौआ भोजन)'),
    description: L(
      'Offer cooked rice & black sesame seeds to crows at Agni Theertham. Crows are believed to be the physical vehicles of our ancestors. Feeding them is the most vital step in satisfying hungry ancestral spirits.',
      'अग्नि तीर्थम् पर कौओं को पका चावल और काले तिल अर्पित करें। कौओं को पूर्वजों का वाहन माना जाता है। उन्हें भोजन कराना भूखे पितरों को तृप्त करने का सबसे महत्वपूर्ण चरण है।',
    ),
    benefit: L('Satisfies ancestral hunger and clears daily karmic blocks.', 'पितरों की भूख शांत करता है और दैनिक कर्म बाधाएं दूर करता है।'),
    tag: 'highly_recommended',
    tagLabel: L('Highly Recommended', 'अत्यधिक अनुशंसित'),
    price_paise: 10100,
    image: require('../assets/puja/kaka_bali_seva.webp'),
  },
  {
    id: 'gau_seva_pitru',
    name: L('Gau Seva (Cow Feeding for Ancestors)', 'गौ सेवा (पितरों हेतु गौ भोजन)'),
    description: L(
      'Sponsor green grass and bananas for sacred cows in Rameshwaram. According to the Garuda Purana, feeding a cow during ancestral rites satisfies all 33 crore deities residing within her.',
      'रामेश्वरम् में गायों के लिए हरी घास और केले प्रायोजित करें। गरुड़ पुराण के अनुसार, पितृ कर्म के समय गौ को भोजन कराने से उसमें निवास करने वाले 33 करोड़ देवता तृप्त होते हैं।',
    ),
    benefit: L('Neutralizes heavy lineage obstacles and clears path for progeny (children).', 'वंश की भारी बाधाओं को दूर करता है और संतान का मार्ग प्रशस्त करता है।'),
    tag: 'karma_shuddhi',
    tagLabel: L('Karma Shuddhi', 'कर्म शुद्धि'),
    price_paise: 35100,
    image: require('../assets/puja/gau_seva_pitru.webp'),
  },
  {
    id: 'tila_daan_homam',
    name: L('Tila Daan (Sesame Offering in Homam)', 'तिल दान (हवन में तिल अर्पण)'),
    description: L(
      'Offer high-quality black sesame seeds (Tila) into the sacred Thila Homam fire on your behalf. Black sesame is ruled by Saturn (Shani) and is the primary tool used to absorb and burn away Pitru Dosha.',
      'आपकी ओर से पवित्र थिला होमम् अग्नि में उत्तम काले तिल अर्पित करें। काले तिल शनि द्वारा शासित हैं और पितृ दोष को अवशोषित कर भस्म करने का प्रमुख साधन हैं।',
    ),
    benefit: L('Directly pacifies the ancestral energy causing delays in career and marriage.', 'करियर और विवाह में देरी करने वाली पितृ ऊर्जा को शांत करता है।'),
    tag: 'dosha_nivaran',
    tagLabel: L('Dosha Nivaran', 'दोष निवारण'),
    price_paise: 9100,
    image: require('../assets/puja/tila_daan_homam.webp'),
  },
  {
    id: 'vastra_daan_brahmin',
    name: L('Vastra Daan (Donation of Clothes)', 'वस्त्र दान'),
    description: L(
      'Donate a traditional white dhoti and towel to an on-ground Vedic Brahmin performing rites in Rameshwaram. Giving white clothing is a highly auspicious deed that brings peace to the lineage.',
      'रामेश्वरम् में कर्म कराने वाले वैदिक ब्राह्मण को पारंपरिक श्वेत धोती और अंगवस्त्र दान करें। श्वेत वस्त्र दान अत्यंत शुभ कर्म है जो वंश में शांति लाता है।',
    ),
    benefit: L('Brings peace, prosperity, and a calm atmosphere to your home.', 'आपके घर में शांति, समृद्धि और सौम्य वातावरण लाता है।'),
    tag: 'auspicious',
    tagLabel: L('Auspicious', 'शुभ'),
    price_paise: 40100,
    image: require('../assets/puja/vastra_daan_brahmin.webp'),
  },
  {
    id: 'brahman_bhojan',
    name: L('Brahman Bhojan', 'ब्राह्मण भोजन'),
    description: L(
      'Sponsor a complete, traditional Sattvik meal for a local learning priest or sadhu in Rameshwaram. No ancestral ceremony is considered complete until a Vedic Brahmin is satisfied with a meal.',
      'रामेश्वरम् में किसी विद्वान पुजारी या साधु के लिए पूर्ण पारंपरिक सात्विक भोजन प्रायोजित करें। जब तक वैदिक ब्राह्मण भोजन से तृप्त न हो, कोई भी पितृ कर्म पूर्ण नहीं माना जाता।',
    ),
    benefit: L('Seals the full spiritual fruits (Phala) of the completed Pitru rituals.', 'संपन्न पितृ कर्मों का पूर्ण आध्यात्मिक फल सुनिश्चित करता है।'),
    tag: 'purna_phala',
    tagLabel: L('Purna Phala', 'पूर्ण फल'),
    price_paise: 50100,
    image: require('../assets/puja/brahman_bhojan.webp'),
  },
];

export function getAddOn(id: string): PujaAddOn | undefined {
  return PUJA_ADDONS.find((a) => a.id === id);
}

// ── Dakshina (voluntary offering to the performing priest) ────────────────────
export const DAKSHINA = {
  id: 'dakshina_puja',
  title: L('Add Dakshina for Panditji', 'पंडित जी के लिए दक्षिणा जोड़ें'),
  description: L(
    'Voluntary financial respect (Dakshina) offered directly to the priest conducting your physical rituals at the beach and temple.',
    'समुद्र तट और मंदिर में आपके भौतिक कर्मकांड कराने वाले पुजारी को सीधे अर्पित की जाने वाली स्वैच्छिक दक्षिणा।',
  ),
  benefit: L('Invokes the personal heartfelt blessings of the performing priest.', 'कर्म कराने वाले पुजारी का हार्दिक व्यक्तिगत आशीर्वाद प्रदान करता है।'),
  // preset amounts in RUPEES; multiply by 100 for paise.
  presets_rupees: [51, 101, 251, 501, 1001] as const,
  // server clamp — a custom "add your own" amount must fall in [min, max].
  min_paise: 0,
  max_paise: 5100000, // ₹51,000 ceiling to reject abuse
};

// ── The puja(s) ───────────────────────────────────────────────────────────────
export interface PujaBenefit { title: L; desc: L }
export interface Puja {
  id: string;
  title: L;
  subtitle: L;          // one-line "Puja for …"
  location: L;
  hero: any;
  about: L;
  whyPerform: PujaBenefit[];
  includes: PujaBenefit[];
}

export const PUJAS: Puja[] = [
  {
    id: 'pitra_dosha_rameswaram',
    title: L('Pitra Dosha Nivaran Puja', 'पितृ दोष निवारण पूजा'),
    subtitle: L('Ancestral rites to resolve Pitru Dosha', 'पितृ दोष निवारण हेतु पूर्वज कर्म'),
    location: L('Agni Theertham, Rameswaram', 'अग्नि तीर्थम्, रामेश्वरम्'),
    hero: require('../assets/puja/hero.webp'),
    about: L(
      'Performed at Agni Theertham — the sacred ocean shore beside the Ramanathaswamy Temple where Lord Rama himself performed ancestral rites (Shraddh) for his father King Dasharatha. This is the most spiritually charged place in India to resolve ancestral debts (Pitru Rin) through Tarpanam, Thila Homam and Pitru Puja. Experienced local Vedic priests perform the rituals in your name and gotra on your behalf.',
      'अग्नि तीर्थम् पर संपन्न — रामनाथस्वामी मंदिर के निकट वह पवित्र समुद्र तट जहाँ स्वयं भगवान राम ने अपने पिता राजा दशरथ के लिए श्राद्ध किया था। तर्पण, थिला होमम् और पितृ पूजा द्वारा पितृ ऋण चुकाने के लिए यह भारत का सर्वाधिक आध्यात्मिक स्थान है। अनुभवी स्थानीय वैदिक पुजारी आपके नाम और गोत्र में आपकी ओर से कर्म संपन्न करते हैं।',
    ),
    whyPerform: [
      { title: L('Ancestral Peace', 'पितृ शांति'), desc: L('Bring peace to departed ancestors and release the lineage from karmic debt.', 'दिवंगत पितरों को शांति और वंश को कर्म ऋण से मुक्ति।') },
      { title: L('Remove Obstacles', 'बाधा निवारण'), desc: L('Clears repeated delays in career, marriage and progeny linked to Pitru Dosha.', 'पितृ दोष से जुड़ी करियर, विवाह और संतान की बार-बार बाधाओं को दूर करता है।') },
      { title: L('Family Harmony', 'पारिवारिक सुख'), desc: L('Restores prosperity, health and a calm atmosphere at home.', 'घर में समृद्धि, स्वास्थ्य और शांत वातावरण बहाल करता है।') },
    ],
    includes: [
      { title: L('Rites at Agni Theertham', 'अग्नि तीर्थम् पर कर्म'), desc: L('Tarpanam & Pitru Puja performed by verified local priests following proper Vedic vidhi.', 'सत्यापित स्थानीय पुजारियों द्वारा उचित वैदिक विधि से तर्पण और पितृ पूजा।') },
      { title: L('Personalised Puja Video', 'व्यक्तिगत पूजा वीडियो'), desc: L('Full video of your puja with Naam-Gotra sankalp, shared on WhatsApp within 3–5 days.', 'नाम-गोत्र संकल्प सहित आपकी पूजा का पूरा वीडियो, 3–5 दिनों में व्हाट्सएप पर।') },
      { title: L('Live WhatsApp Updates', 'लाइव व्हाट्सएप अपडेट'), desc: L('Updates at every step of your puja.', 'आपकी पूजा के हर चरण पर अपडेट।') },
      { title: L('Sankalp in Your Name & Gotra', 'आपके नाम और गोत्र में संकल्प'), desc: L('The priest chants your name and gotra during the Sankalpam so the rites are offered on your behalf.', 'पुजारी संकल्पम् के दौरान आपका नाम और गोत्र उच्चारित करते हैं ताकि कर्म आपकी ओर से अर्पित हो।') },
    ],
  },
];

export function getPuja(id: string): Puja | undefined {
  return PUJAS.find((p) => p.id === id);
}

// ── Next puja slot (the owner updates this each cycle) ────────────────────────
// The puja is performed on `pujaDateISO`; bookings close at `bookingCloseISO`
// (3 days before — end of 30 Sep IST for the 3 Oct slot). Both instants are in
// IST (+05:30). `label`/`closeLabel` are the display strings (avoids any device
// timezone drift when formatting). To roll to the next slot, edit these five.
export const NEXT_SLOT = {
  pujaDateISO: '2026-10-03T06:00:00+05:30',
  bookingCloseISO: '2026-10-01T00:00:00+05:30', // bookings close end of 30 Sep 2026 IST
  label: L('Fri, 3 October 2026', 'शुक्र, 3 अक्टूबर 2026'),
  closeLabel: L('30 September 2026', '30 सितंबर 2026'),
};

export interface SlotStatus { open: boolean; msToClose: number; msToPuja: number }
export function getSlotStatus(nowMs: number = Date.now()): SlotStatus {
  const close = new Date(NEXT_SLOT.bookingCloseISO).getTime();
  const puja = new Date(NEXT_SLOT.pujaDateISO).getTime();
  return { open: nowMs < close, msToClose: close - nowMs, msToPuja: puja - nowMs };
}

// ms → { d, h, m, s } (clamped at 0) for a countdown display.
export function fmtCountdown(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

// ── Upcoming pujas (shown as locked "Coming Soon" cards in the listing) ───────
export interface ComingSoonPuja { id: string; title: L; location: L }
export const COMING_SOON_PUJAS: ComingSoonPuja[] = [
  { id: 'kaal_sarp',       title: L('Kaal Sarp Dosh Nivaran', 'काल सर्प दोष निवारण'), location: L('Trimbakeshwar, Nashik', 'त्र्यंबकेश्वर, नासिक') },
  { id: 'maha_mrityunjaya',title: L('Maha Mrityunjaya Jaap', 'महामृत्युंजय जाप'),      location: L('Mahakaleshwar, Ujjain', 'महाकालेश्वर, उज्जैन') },
  { id: 'navagraha',       title: L('Navagraha Shanti Puja', 'नवग्रह शांति पूजा'),     location: L('Suryanar Kovil, Tamil Nadu', 'सूर्यनार कोविल, तमिलनाडु') },
  { id: 'shani',           title: L('Shani Dosh Nivaran', 'शनि दोष निवारण'),           location: L('Shani Shingnapur', 'शनि शिंगणापुर') },
  { id: 'lakshmi_kubera',  title: L('Lakshmi-Kubera Puja', 'लक्ष्मी-कुबेर पूजा'),      location: L('Mahalakshmi, Kolhapur', 'महालक्ष्मी, कोल्हापुर') },
];

// ── Totals (mirror the server's computation for the live cart preview) ────────
export function computePujaTotalPaise(
  tierId: string,
  addOnIds: string[],
  dakshinaPaise: number,
): number {
  const tier = getTier(tierId);
  const base = tier?.price_paise ?? 0;
  const addOns = addOnIds.reduce((sum, id) => sum + (getAddOn(id)?.price_paise ?? 0), 0);
  const dakshina = Math.max(0, Math.min(dakshinaPaise || 0, DAKSHINA.max_paise));
  return base + addOns + dakshina;
}
