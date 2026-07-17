// AI-generated emblem art + Royal-Jewel accent per report type. Shared by the
// Reports tab and the My Reports history page. Art lives in assets/reports/<type>.webp.
import type { AccentName } from './theme';

export const REPORT_IMG: Record<string, any> = {
  life: require('../assets/reports/life.webp'),
  career: require('../assets/reports/career.webp'),
  love: require('../assets/reports/love.webp'),
  health: require('../assets/reports/health.webp'),
  education: require('../assets/reports/education.webp'),
  vastu: require('../assets/reports/vastu.webp'),
  matchmaking: require('../assets/reports/matchmaking.webp'),
  pastlife: require('../assets/reports/pastlife.webp'),
  palm: require('../assets/reports/palm.webp'),
};

export const REPORT_ACCENT: Record<string, AccentName> = {
  life: 'gold',
  career: 'sapphire',
  love: 'ruby',
  health: 'emerald',
  education: 'turquoise',
  vastu: 'saffron',
  matchmaking: 'ruby',
  pastlife: 'amethyst',
  palm: 'amber',
};
