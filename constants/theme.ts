// ─────────────────────────────────────────────────────────────────────────────
// Ritham design system — "Behrouz" luxury edition
// Near-black canvas + matte gold, ivory type, gold hairlines.
// NOTE: the original short keys (bg, bgCard, gold, text, …) are preserved and
// repointed to the new palette, so every existing screen recolors from this one
// file. New tokens (canvas/surface/hairline/typography/radius/depth/motion) are
// additive — migrate screens onto them over time.
// ─────────────────────────────────────────────────────────────────────────────

// ── Two themes (dark = default look, light = new) ─────────────────────────────
// Screens build their StyleSheet per-render from the active palette via
// useColors()/makeStyles(c). Keep the SAME keys in both so `c.xxx` works either way.
// `goldContrast` = always-dark text/icon color used ON gold surfaces (buttons) so
// it stays legible whether the page is near-black or ivory.

type Tint = 'light' | 'dark';

export const darkColors = {
  canvas: '#0B0B0D', surface: '#171519', surfaceRaised: '#211E26', surfaceSunken: '#08080A',
  gold: '#C5A059', goldLight: '#E4C983', goldDeep: '#9A7B3C', goldFaint: 'rgba(197,160,89,0.14)',
  goldContrast: '#0B0B0D', // dark text on gold
  text: '#FDFBF7', textMuted: '#A29E95', textDim: '#6E6A62',
  border: 'rgba(197,160,89,0.16)', borderStrong: 'rgba(197,160,89,0.34)', divider: 'rgba(253,251,247,0.07)',
  error: '#C7524B', success: '#7FA36F',
  bg: '#0B0B0D', bgMid: '#111013', bgCard: '#171519', tabActive: '#C5A059', tabInactive: '#6E6A62',
  scrimTabBar: 'rgba(9,9,11,0.34)', scrimSheet: 'rgba(21,20,23,0.96)', scrimBackdrop: 'rgba(6,6,8,0.66)',
  gHero: ['#1D1A22', '#141217'] as [string, string],
  gSplash: ['#0C0A10', '#0B0B0D'] as [string, string],
  blurTint: 'dark' as Tint,
  statusBar: 'light' as Tint,
  isDark: true,
};

export const lightColors: typeof darkColors = {
  canvas: '#F4EFE4', surface: '#FCFAF4', surfaceRaised: '#FFFFFF', surfaceSunken: '#EBE4D6',
  gold: '#A07C2A', goldLight: '#856419', goldDeep: '#6E541A', goldFaint: 'rgba(160,124,42,0.12)',
  goldContrast: '#1A1508', // dark text on gold
  text: '#221D14', textMuted: '#6B6456', textDim: '#9A9284',
  border: 'rgba(160,124,42,0.26)', borderStrong: 'rgba(160,124,42,0.5)', divider: 'rgba(34,29,20,0.08)',
  error: '#B23A34', success: '#4E7A50',
  bg: '#F4EFE4', bgMid: '#EFE8DB', bgCard: '#FCFAF4', tabActive: '#A07C2A', tabInactive: '#9A9284',
  scrimTabBar: 'rgba(244,239,228,0.5)', scrimSheet: 'rgba(252,250,244,0.98)', scrimBackdrop: 'rgba(40,34,24,0.34)',
  gHero: ['#FFFDF8', '#F4EFE4'],
  gSplash: ['#F7F2E8', '#F4EFE4'],
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
export const Accents = {
  gold: { color: '#E4C983', faint: 'rgba(228,201,131,0.14)', soft: 'rgba(228,201,131,0.32)' },
  saffron: { color: '#E8973B', faint: 'rgba(232,151,59,0.15)', soft: 'rgba(232,151,59,0.34)' },
  amethyst: { color: '#A87AE0', faint: 'rgba(168,122,224,0.17)', soft: 'rgba(168,122,224,0.36)' },
  emerald: { color: '#46B587', faint: 'rgba(70,181,135,0.16)', soft: 'rgba(70,181,135,0.34)' },
  ruby: { color: '#E05561', faint: 'rgba(224,85,97,0.15)', soft: 'rgba(224,85,97,0.34)' },
  sapphire: { color: '#5A8BE6', faint: 'rgba(90,139,230,0.16)', soft: 'rgba(90,139,230,0.36)' },
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
