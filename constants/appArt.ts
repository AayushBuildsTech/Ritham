// appArt — central registry for the "Stellar Velocity" AI art used across screens
// (Live Darshan temples, per-sign horoscope banners, feature header vignettes).
// Report art lives separately in reportArt.ts. Keep keys in sync with the data
// sources (config/temples.ts ids; the RASHI sign map below).

// ── Live Darshan temple banners (keyed by Temple.id in config/temples.ts) ────────
export const TEMPLE_IMG: Record<string, any> = {
  tirupati: require('../assets/temples/tirupati.webp'),
  vaishno_devi: require('../assets/temples/vaishno_devi.webp'),
  shirdi: require('../assets/temples/shirdi.webp'),
  kashi_vishwanath: require('../assets/temples/kashi_vishwanath.webp'),
  mahakaleshwar: require('../assets/temples/mahakaleshwar.webp'),
  somnath: require('../assets/temples/somnath.webp'),
  siddhivinayak: require('../assets/temples/siddhivinayak.webp'),
  golden_temple: require('../assets/temples/golden_temple.webp'),
};

// ── Per-sign horoscope banners (constellation art, one shown per moon sign) ──────
const SIGN_BANNER: Record<string, any> = {
  mesha: require('../assets/horoscope/mesha.webp'),
  vrishabha: require('../assets/horoscope/vrishabha.webp'),
  mithuna: require('../assets/horoscope/mithuna.webp'),
  karka: require('../assets/horoscope/karka.webp'),
  simha: require('../assets/horoscope/simha.webp'),
  kanya: require('../assets/horoscope/kanya.webp'),
  tula: require('../assets/horoscope/tula.webp'),
  vrishchika: require('../assets/horoscope/vrishchika.webp'),
  dhanu: require('../assets/horoscope/dhanu.webp'),
  makara: require('../assets/horoscope/makara.webp'),
  kumbha: require('../assets/horoscope/kumbha.webp'),
  meena: require('../assets/horoscope/meena.webp'),
};

// English sign (the base word before any Sanskrit paren) → rashi asset key.
const SIGN_KEY: Record<string, string> = {
  Aries: 'mesha', Taurus: 'vrishabha', Gemini: 'mithuna', Cancer: 'karka',
  Leo: 'simha', Virgo: 'kanya', Libra: 'tula', Scorpio: 'vrishchika',
  Sagittarius: 'dhanu', Capricorn: 'makara', Aquarius: 'kumbha', Pisces: 'meena',
};

// Resolve a moon-sign string (e.g. "Leo", "Leo (Simha)") to its banner, or undefined.
export function signBanner(sign?: string | null): any | undefined {
  if (!sign) return undefined;
  const key = SIGN_KEY[sign.split(' (')[0].trim()];
  return key ? SIGN_BANNER[key] : undefined;
}

// ── Feature header vignettes ─────────────────────────────────────────────────────
export const FEATURE_BANNER = {
  panchang: require('../assets/banners/panchang.webp'),
  muhurat: require('../assets/banners/muhurat.webp'),
  sadesati: require('../assets/banners/sadesati.webp'),
  vakri: require('../assets/banners/vakri.webp'),
  palmreading: require('../assets/banners/palmreading.webp'),
} as const;
