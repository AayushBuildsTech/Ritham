// Royal Jewel accent system for reports (Master Prompt §2 / §5).
//
// Each report type owns ONE jewel accent — the single source of truth for its
// hero colour, score rings, rating badges, page chrome tint, and knowledge
// nuggets. Matchmaking is the exception: it's the only two-person report, so it
// carries TWO accents (ruby partner + sapphire partner) that converge into gold
// at the compatibility centre — distinctiveness by combination, not a solo hue.
//
// The raw hues live in constants/theme.ts (`Accents`) so the whole app agrees on
// one palette; this module just binds report type → accent and layers the
// matchmaking dual case on top.

import { Accents, AccentName } from './theme';
import type { ReportType } from '../lib/reportService';

export interface ReportAccent {
  /** Primary accent name — the report's solo hue, or `gold` (convergence) for matchmaking. */
  name: AccentName;
  /** Vivid line/text tone. */
  color: string;
  /** Two-stop gradient (bright → deep) for hero chips and score rings. */
  gradient: [string, string];
  /** Low-alpha fill for washes / chips. */
  faint: string;
  /** Hairline/border tint. */
  soft: string;
  /** Only present for the two-person report (matchmaking): the converging partner accents. */
  dual?: { a: AccentName; b: AccentName };
}

// Canonical report → accent map (Master Prompt §2 table). This is the source of
// truth; screens should read it via `reportAccent()` rather than re-deriving.
const REPORT_ACCENT_NAME: Record<ReportType, AccentName> = {
  life: 'gold',          // Flagship owns the primary brand colour
  career: 'sapphire',
  love: 'ruby',
  health: 'emerald',
  education: 'turquoise',
  vastu: 'saffron',
  pastlife: 'amethyst',
  matchmaking: 'gold',   // convergence hue; partners are ruby + sapphire (see `dual`)
};

/** Resolve a report type to its full Royal Jewel accent (with the dual case for matchmaking). */
export function reportAccent(type: ReportType): ReportAccent {
  const name = REPORT_ACCENT_NAME[type];
  const a = Accents[name];
  const base: ReportAccent = {
    name,
    color: a.color,
    gradient: a.grad,
    faint: a.faint,
    soft: a.soft,
  };
  if (type === 'matchmaking') base.dual = { a: 'ruby', b: 'sapphire' };
  return base;
}

/** The two partner accents for the matchmaking Compare Panel (ruby vs sapphire). */
export function matchmakingPair(): { a: typeof Accents[AccentName]; b: typeof Accents[AccentName] } {
  return { a: Accents.ruby, b: Accents.sapphire };
}
