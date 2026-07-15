// appArt — central registry for the "Stellar Velocity" AI art used across screens
// (Live Darshan temples, per-sign horoscope banners, feature header vignettes).
// Report art lives separately in reportArt.ts. Keep keys in sync with the data
// sources (config/temples.ts ids; the RASHI sign map below).

// ── Live Darshan temple banners (keyed by Temple.id in config/temples.ts) ────────
export const TEMPLE_IMG: Record<string, any> = {
  tirupati: require('../assets/temples/tirupati.png'),
  vaishno_devi: require('../assets/temples/vaishno_devi.png'),
  shirdi: require('../assets/temples/shirdi.png'),
  kashi_vishwanath: require('../assets/temples/kashi_vishwanath.png'),
  mahakaleshwar: require('../assets/temples/mahakaleshwar.png'),
  somnath: require('../assets/temples/somnath.png'),
  siddhivinayak: require('../assets/temples/siddhivinayak.png'),
  golden_temple: require('../assets/temples/golden_temple.png'),
};

// ── Per-sign horoscope banners (constellation art, one shown per moon sign) ──────
const SIGN_BANNER: Record<string, any> = {
  mesha: require('../assets/horoscope/mesha.png'),
  vrishabha: require('../assets/horoscope/vrishabha.png'),
  mithuna: require('../assets/horoscope/mithuna.png'),
  karka: require('../assets/horoscope/karka.png'),
  simha: require('../assets/horoscope/simha.png'),
  kanya: require('../assets/horoscope/kanya.png'),
  tula: require('../assets/horoscope/tula.png'),
  vrishchika: require('../assets/horoscope/vrishchika.png'),
  dhanu: require('../assets/horoscope/dhanu.png'),
  makara: require('../assets/horoscope/makara.png'),
  kumbha: require('../assets/horoscope/kumbha.png'),
  meena: require('../assets/horoscope/meena.png'),
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
  panchang: require('../assets/banners/panchang.png'),
  muhurat: require('../assets/banners/muhurat.png'),
  sadesati: require('../assets/banners/sadesati.png'),
  vakri: require('../assets/banners/vakri.png'),
} as const;
