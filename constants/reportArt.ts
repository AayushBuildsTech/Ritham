// AI-generated emblem art + Royal-Jewel accent per report type. Shared by the
// Reports tab and the My Reports history page. Art lives in assets/reports/<type>.png.
import type { AccentName } from './theme';

export const REPORT_IMG: Record<string, any> = {
  life: require('../assets/reports/life.png'),
  career: require('../assets/reports/career.png'),
  love: require('../assets/reports/love.png'),
  health: require('../assets/reports/health.png'),
  education: require('../assets/reports/education.png'),
  vastu: require('../assets/reports/vastu.png'),
  matchmaking: require('../assets/reports/matchmaking.png'),
  pastlife: require('../assets/reports/pastlife.png'),
  palm: require('../assets/reports/palm.png'),
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
