// astroHindi — translate the COMPUTED / VedAstro astrological tokens (which are
// stored in the chart as English strings) into Hindi (Devanagari) at render time.
//
// The stored kundli_chart is English + shared/cached across users, so we never
// mutate it — we translate the display tokens here. Everything is keyed by the
// English base word (the Sanskrit-in-parentheses suffix and any degree suffix are
// stripped before lookup), and unknown tokens fall through unchanged, so a value we
// don't have a mapping for is shown as-is rather than lost.

// ── Rashi (signs) ────────────────────────────────────────────────────────────
const SIGN_HI: Record<string, string> = {
  Aries: 'मेष', Taurus: 'वृषभ', Gemini: 'मिथुन', Cancer: 'कर्क',
  Leo: 'सिंह', Virgo: 'कन्या', Libra: 'तुला', Scorpio: 'वृश्चिक',
  Sagittarius: 'धनु', Capricorn: 'मकर', Aquarius: 'कुम्भ', Pisces: 'मीन',
  // Sanskrit forms (in case only the paren value is available)
  Mesha: 'मेष', Vrishabha: 'वृषभ', Mithuna: 'मिथुन', Karka: 'कर्क',
  Simha: 'सिंह', Kanya: 'कन्या', Tula: 'तुला', Vrishchika: 'वृश्चिक',
  Dhanu: 'धनु', Makara: 'मकर', Kumbha: 'कुम्भ', Meena: 'मीन',
};

// ── Graha (planets) ──────────────────────────────────────────────────────────
const GRAHA_HI: Record<string, string> = {
  Sun: 'सूर्य', Moon: 'चंद्र', Mars: 'मंगल', Mercury: 'बुध',
  Jupiter: 'गुरु', Venus: 'शुक्र', Saturn: 'शनि', Rahu: 'राहु', Ketu: 'केतु',
  // Sanskrit forms
  Surya: 'सूर्य', Chandra: 'चंद्र', Mangala: 'मंगल', Mangal: 'मंगल', Budha: 'बुध',
  Budh: 'बुध', Guru: 'गुरु', Shukra: 'शुक्र', Shani: 'शनि',
};

// ── Nakshatra ────────────────────────────────────────────────────────────────
const NAKSHATRA_HI: Record<string, string> = {
  Ashwini: 'अश्विनी', Bharani: 'भरणी', Krittika: 'कृत्तिका', Rohini: 'रोहिणी',
  Mrigashira: 'मृगशिरा', Ardra: 'आर्द्रा', Punarvasu: 'पुनर्वसु', Pushya: 'पुष्य',
  Ashlesha: 'आश्लेषा', Magha: 'मघा', 'Purva Phalguni': 'पूर्वा फाल्गुनी',
  'Uttara Phalguni': 'उत्तरा फाल्गुनी', Hasta: 'हस्त', Chitra: 'चित्रा', Swati: 'स्वाति',
  Vishakha: 'विशाखा', Anuradha: 'अनुराधा', Jyeshtha: 'ज्येष्ठा', Mula: 'मूल',
  'Purva Ashadha': 'पूर्वाषाढ़ा', 'Uttara Ashadha': 'उत्तराषाढ़ा', Shravana: 'श्रवण',
  Dhanishta: 'धनिष्ठा', Shatabhisha: 'शतभिषा', 'Purva Bhadrapada': 'पूर्वा भाद्रपद',
  'Uttara Bhadrapada': 'उत्तरा भाद्रपद', Revati: 'रेवती',
};

// ── Dignity ──────────────────────────────────────────────────────────────────
const DIGNITY_HI: Record<string, string> = {
  Exalted: 'उच्च', Debilitated: 'नीच', 'Own sign': 'स्वराशि', Neutral: 'सम',
};

// ── Condition flags shown in the "State" column ──────────────────────────────
const FLAG_HI: Record<string, string> = {
  Retro: 'वक्री', Retrograde: 'वक्री', Combust: 'अस्त', Vargottama: 'वर्गोत्तम',
};

// ── Weekday (Panchang vaara) ─────────────────────────────────────────────────
const VAARA_HI: Record<string, string> = {
  Sunday: 'रविवार', Monday: 'सोमवार', Tuesday: 'मंगलवार', Wednesday: 'बुधवार',
  Thursday: 'गुरुवार', Friday: 'शुक्रवार', Saturday: 'शनिवार',
  Ravivar: 'रविवार', Somvar: 'सोमवार', Mangalvar: 'मंगलवार', Budhvar: 'बुधवार',
  Guruvar: 'गुरुवार', Shukravar: 'शुक्रवार', Shanivar: 'शनिवार',
};

// Hindi ordinals for houses (bhaav) 1..12.
const HOUSE_ORD_HI = [
  '', 'पहला', 'दूसरा', 'तीसरा', 'चौथा', 'पाँचवाँ', 'छठा', 'सातवाँ', 'आठवाँ',
  'नौवाँ', 'दसवाँ', 'ग्यारहवाँ', 'बारहवाँ',
];

// strip a trailing " (Sanskrit)" and any degree/extra after it, return base word.
function base(s: string): string {
  return (s || '').split(' (')[0].trim();
}

/** Translate a sign string ("Aries (Mesha)" / "Aries" / "Aries 12°") to Hindi. */
export function hiSign(s: string): string {
  if (!s) return s;
  const b = base(s);
  return SIGN_HI[b] ?? s;
}

/** Translate a graha string ("Saturn (Shani)" / "Saturn") to Hindi. */
export function hiGraha(g: string): string {
  if (!g) return g;
  const b = base(g);
  return GRAHA_HI[b] ?? g;
}

/** Translate a nakshatra name to Hindi. */
export function hiNakshatra(n: string): string {
  if (!n) return n;
  const b = base(n);
  return NAKSHATRA_HI[b] ?? n;
}

/** Translate a dignity word to Hindi. */
export function hiDignity(d: string): string {
  if (!d) return d;
  return DIGNITY_HI[d] ?? d;
}

/** Translate a comma-separated "State" flag list (e.g. "Exalted, Retro"). */
export function hiFlags(flags: string): string {
  if (!flags || flags === '—') return flags;
  return flags
    .split(',')
    .map((f) => f.trim())
    .map((f) => DIGNITY_HI[f] ?? FLAG_HI[f] ?? f)
    .join(', ');
}

/** Hindi house ordinal, e.g. hiHouseOrd(5) → "पाँचवाँ". Falls back to "{n}वाँ". */
export function hiHouseOrd(n: number): string {
  return HOUSE_ORD_HI[n] ?? `${n}वाँ`;
}

/** Translate a weekday name to Hindi. */
export function hiVaara(v: string): string {
  if (!v) return v;
  return VAARA_HI[base(v)] ?? v;
}

/** Convenience: apply hiSign/hiGraha conditionally on `on`. */
export const maybe = (on: boolean, fn: (s: string) => string) => (s: string) => (on ? fn(s) : s);
