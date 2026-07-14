// Report UI chrome — localized navigation, page titles, and button text.
//
// Master Prompt §1: this table is maintained SEPARATELY from the AI-generated
// prose so navigation reads as intentionally localized, not machine-translated.
// The Claude API fills page CONTENT (insights, remedies, nuggets) natively in the
// chosen language; everything here is the fixed frame around that content.
//
// Numerals stay Arabic (1,2,3) even in Hindi — more broadly legible for scores,
// dates, and ratings (Master Prompt §1). Core Vedic/Sanskrit terms
// (Mahadasha, guna, dosha, nakshatra…) are intentionally NOT translated.

import type { Lang } from '../lib/i18n';

type ChromeTable = Record<string, string>;

const EN: ChromeTable = {
  // ── the 9-page skeleton (Master Prompt §4) ──
  'page.cover': 'Cover',
  'page.snapshot': 'Snapshot',
  'page.chart': 'Core Chart',
  'page.deepdive1': 'Deep Dive',
  'page.deepdive2': 'Deep Dive II',
  'page.timing': 'Timing',
  'page.timing.vastu': 'Action Priority',       // §5.6 — Vaastu has no astrological timing
  'page.timing.pastlife': 'Across Life Stages',  // §5.8 — reframed life-stage view
  'page.strengths': 'Strengths & Challenges',
  'page.remedies': 'Remedies',
  'page.summary': 'Summary',

  // ── navigation ──
  'nav.next': 'Next',
  'nav.back': 'Back',
  'nav.share': 'Share',
  'nav.done': 'Done',
  'nav.page': 'Page',
  'nav.of': 'of',

  // ── recurring component labels ──
  'nugget.title': 'Did you know',
  'nugget.vedic': 'In Vedic astrology',
  'remedy.title': 'Remedy',
  'rating.outOf': '/ 10',
  'honest.title': 'An honest note',

  // ── language gate (§1) ──
  'gate.title': 'Choose your report language',
  'gate.subtitle': 'Your report will be written natively in this language.',
  'gate.confirm': 'Generate',
  'gate.change': 'Change',
  'gate.english': 'English',
  'gate.hindi': 'हिंदी',

  // ── disclaimer (strengthened for Health §5.4) ──
  'disclaimer.default': 'For guidance and reflection — not a substitute for professional advice.',
  'disclaimer.health': 'A gentle wellbeing reading — not medical advice, diagnosis, or treatment.',
};

const HI: ChromeTable = {
  'page.cover': 'आवरण',
  'page.snapshot': 'एक नज़र में',
  'page.chart': 'मुख्य कुंडली',
  'page.deepdive1': 'गहराई से',
  'page.deepdive2': 'और गहराई से',
  'page.timing': 'समय',
  'page.timing.vastu': 'प्राथमिकता क्रम',
  'page.timing.pastlife': 'जीवन के चरणों में',
  'page.strengths': 'शक्तियाँ और चुनौतियाँ',
  'page.remedies': 'उपाय',
  'page.summary': 'सारांश',

  'nav.next': 'आगे',
  'nav.back': 'पीछे',
  'nav.share': 'साझा करें',
  'nav.done': 'पूर्ण',
  'nav.page': 'पृष्ठ',
  'nav.of': '/',

  'nugget.title': 'क्या आप जानते हैं',
  'nugget.vedic': 'वैदिक ज्योतिष में',
  'remedy.title': 'उपाय',
  'rating.outOf': '/ 10',
  'honest.title': 'एक सच्ची बात',

  'gate.title': 'अपनी रिपोर्ट की भाषा चुनें',
  'gate.subtitle': 'आपकी रिपोर्ट इसी भाषा में मूल रूप से लिखी जाएगी।',
  'gate.confirm': 'रिपोर्ट बनाएं',
  'gate.change': 'बदलें',
  'gate.english': 'English',
  'gate.hindi': 'हिंदी',

  'disclaimer.default': 'मार्गदर्शन और चिंतन के लिए — पेशेवर सलाह का विकल्प नहीं।',
  'disclaimer.health': 'एक कोमल स्वास्थ्य पठन — यह चिकित्सा सलाह, निदान या उपचार नहीं है।',
};

const TABLES: Record<Lang, ChromeTable> = { en: EN, hi: HI };

/** Localized report chrome string. Falls back to English, then the raw key. */
export function chrome(lang: Lang, key: string): string {
  return TABLES[lang]?.[key] ?? EN[key] ?? key;
}
