// ─────────────────────────────────────────────────────────────────────────────
// Ritham design system — "Stellar Velocity" edition
// Cyber Magenta (#FF007F) + Electric Amethyst (#7B2CBF) on an off-white canvas,
// near-black (#0D0D1A) type. Mystical yet aggressively modern.
// NOTE: the original short keys (bg, bgCard, gold, text, …) are preserved and
// repointed to the new palette, so every existing screen recolors from this one
// file — `gold`/`goldLight`/… now carry the magenta brand tones. New tokens
// (canvas/surface/hairline/gHeader/…) are additive.
// ─────────────────────────────────────────────────────────────────────────────

// ── Two themes (dark = default look, light = new) ─────────────────────────────
// Screens build their StyleSheet per-render from the active palette via
// useColors()/makeStyles(c). Keep the SAME keys in both so `c.xxx` works either way.
// `goldContrast` = always-dark text/icon color used ON gold surfaces (buttons) so
// it stays legible whether the page is near-black or ivory.

type Tint = 'light' | 'dark';

export const darkColors = {
  canvas: '#0D0D1A', surface: '#17172B', surfaceRaised: '#20203A', surfaceSunken: '#090912',
  gold: '#FF007F', goldLight: '#FF57A8', goldDeep: '#C4006A', goldFaint: 'rgba(255,0,127,0.16)',
  goldSurface: '#FF007F', // magenta used as a BUTTON/badge fill (white text on top)
  goldContrast: '#FFFFFF', // white text on magenta
  text: '#F5F5FA', textMuted: '#A0A0B8', textDim: '#6B6B82',
  border: 'rgba(255,255,255,0.09)', borderStrong: 'rgba(255,0,127,0.42)', divider: 'rgba(255,255,255,0.07)',
  error: '#FF5A6E', success: '#2DD4A7',
  bg: '#0D0D1A', bgMid: '#131324', bgCard: '#17172B', tabActive: '#FF007F', tabInactive: '#6B6B82',
  scrimTabBar: 'rgba(13,13,26,0.42)', scrimSheet: 'rgba(23,23,43,0.96)', scrimBackdrop: 'rgba(6,6,14,0.68)',
  gHero: ['#241B3E', '#15132A'] as [string, string],
  gSplash: ['#7B2CBF', '#FF007F'] as [string, string],
  gHeader: ['#7B2CBF', '#FF007F'] as [string, string], // violet → magenta brand header
  blurTint: 'dark' as Tint,
  statusBar: 'light' as Tint,
  isDark: true,
};

export const lightColors: typeof darkColors = {
  canvas: '#F8F9FA', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSunken: '#EDEEF3',
  gold: '#FF007F', goldLight: '#FF3D9A', goldDeep: '#C4006A', goldFaint: 'rgba(255,0,127,0.08)',
  goldSurface: '#FF007F', // magenta button/badge fill (white text on top)
  goldContrast: '#FFFFFF', // white text on magenta
  text: '#0D0D1A', textMuted: '#5B5B6E', textDim: '#9C9CB0',
  border: 'rgba(13,13,26,0.08)', borderStrong: 'rgba(255,0,127,0.34)', divider: 'rgba(13,13,26,0.06)',
  error: '#E5484D', success: '#12A594',
  bg: '#F8F9FA', bgMid: '#F1F2F5', bgCard: '#FFFFFF', tabActive: '#FF007F', tabInactive: '#9C9CB0',
  scrimTabBar: 'rgba(248,249,250,0.72)', scrimSheet: 'rgba(255,255,255,0.98)', scrimBackdrop: 'rgba(13,13,26,0.4)',
  gHero: ['#FFFFFF', '#F8F9FA'],
  gSplash: ['#7B2CBF', '#FF007F'],
  gHeader: ['#7B2CBF', '#FF007F'], // violet → magenta brand header
  blurTint: 'light',
  statusBar: 'dark',
  isDark: false,
};

export type ThemeColors = typeof darkColors;

// Back-compat: `Colors` still points at the dark palette for any non-themed refs.
export const Colors = darkColors;

// ── "Royal Jewel" accents ─────────────────────────────────────────────────────
// Gold is the connective thread; each domain also carries a jewel accent used for
// its icon chip, eyebrow, and soft card wash. `color` = the vivid line/text tone,
// `faint` = low-alpha fill for chips/washes, `soft` = hairline/border tint.
// "Stellar Velocity" neon accents. Names are kept for back-compat, but every hue
// now lives in the vibrant magenta / violet / neon family so feature chips pop on
// off-white. `grad` = the two-stop gradient used for icon chips (bright → deep).
export const Accents = {
  gold: { color: '#FF007F', faint: 'rgba(255,0,127,0.10)', soft: 'rgba(255,0,127,0.32)', grad: ['#FF3D9A', '#FF007F'] as [string, string] },
  saffron: { color: '#FF4D6D', faint: 'rgba(255,77,109,0.10)', soft: 'rgba(255,77,109,0.32)', grad: ['#FF6B8A', '#E5004C'] as [string, string] },
  amethyst: { color: '#7B2CBF', faint: 'rgba(123,44,191,0.10)', soft: 'rgba(123,44,191,0.32)', grad: ['#9D4EDD', '#7B2CBF'] as [string, string] },
  emerald: { color: '#12A594', faint: 'rgba(18,165,148,0.10)', soft: 'rgba(18,165,148,0.32)', grad: ['#2DD4A7', '#0E8577'] as [string, string] },
  ruby: { color: '#E5004C', faint: 'rgba(229,0,76,0.10)', soft: 'rgba(229,0,76,0.32)', grad: ['#FF2D78', '#B4003C'] as [string, string] },
  sapphire: { color: '#6C5CE7', faint: 'rgba(108,92,231,0.10)', soft: 'rgba(108,92,231,0.32)', grad: ['#8B7BFF', '#5B4BD6'] as [string, string] },
  turquoise: { color: '#00B8D9', faint: 'rgba(0,184,217,0.10)', soft: 'rgba(0,184,217,0.32)', grad: ['#3AD0EA', '#0092AD'] as [string, string] },
} as const;
export type AccentName = keyof typeof Accents;

// A soft jewel wash for a card of the given accent: tinted top → theme surface.
export function accentCardGradient(c: ThemeColors, accent: AccentName): [string, string] {
  return [Accents[accent].faint, c.surface];
}

export const Fonts = {
  // Serif display (Fraunces) — titles, hero, editorial headings. Warmer and more
  // characterful than Cormorant; carries the "Royal Jewel" vibrancy.
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  displayMedium: 'Fraunces_500Medium',
  // Sans body (Inter) — body copy, data, buttons, labels.
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',

  regular: 'Inter_400Regular', // back-compat (was 'System')

  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
    hero: 40, // serif display wants more room than a sans
    display: 52,
  },
} as const;

// Ready-made text roles — spread into a Text style for consistent typography.
// Serif for display/eyebrow character; Inter for anything read at length.
export const Type = {
  hero: {
    fontFamily: Fonts.displayBold,
    fontSize: Fonts.size.display,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: Fonts.displayBold,
    fontSize: Fonts.size.xxl,
    color: Colors.text,
    letterSpacing: 0.3,
  },
  heading: {
    fontFamily: Fonts.display,
    fontSize: Fonts.size.xl,
    color: Colors.text,
    letterSpacing: 0.2,
  },
  // Section eyebrow — small, tracked-out, uppercase, gold. Very "editorial".
  eyebrow: {
    fontFamily: Fonts.bodySemibold,
    fontSize: Fonts.size.xs,
    color: Colors.gold,
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: Fonts.size.md,
    color: Colors.text,
    lineHeight: 24,
  },
  bodyMuted: {
    fontFamily: Fonts.body,
    fontSize: Fonts.size.sm,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  label: {
    fontFamily: Fonts.bodySemibold,
    fontSize: Fonts.size.md,
    color: Colors.text,
  },
  button: {
    fontFamily: Fonts.bodySemibold,
    fontSize: Fonts.size.md,
    letterSpacing: 0.3,
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

// Depth: soft, warm, low-spread ambient — never the default hard black Android
// drop shadow. Gold-tinted ambient reads "organic / expensive".
export const Depth = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 4,
  },
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 12,
  },
  glow: {
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 6,
  },
} as const;

// Motion — one premium easing + a stagger step so entrances feel authored.
export const Motion = {
  // cubic-bezier(0.22, 1, 0.36, 1) — decelerated "settle", luxury standard.
  easeOut: [0.22, 1, 0.36, 1] as const,
  easeInOut: [0.65, 0, 0.35, 1] as const,
  duration: { fast: 200, base: 420, slow: 640 },
  stagger: 70, // ms between successive list items
} as const;
