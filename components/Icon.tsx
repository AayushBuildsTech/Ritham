import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';

// Central, semantic icon registry. Screens reference brand-level names
// ("panchang", "muhurat") not raw glyphs, so the whole visual language can be
// retuned from one file. Thin-line MaterialCommunityIcons for the spiritual
// domain glyphs; Feather where its line weight reads cleaner.
const MAP = {
  // ── tab bar ──
  home: ['mci', 'home-variant-outline'],
  chat: ['mci', 'chat-processing-outline'],
  store: ['mci', 'shopping-outline'],
  reports: ['mci', 'file-document-outline'],
  // ── home features ──
  moon: ['mci', 'moon-waning-crescent'],
  panchang: ['mci', 'om'],
  numerology: ['mci', 'numeric'],
  muhurat: ['mci', 'calendar-star'],
  temple: ['mci', 'temple-hindu'],
  // ── chrome / actions ──
  profile: ['mci', 'account-circle-outline'],
  settings: ['mci', 'cog-outline'],
  chevron: ['mci', 'chevron-right'],
  back: ['feather', 'chevron-left'],
  close: ['feather', 'x'],
  check: ['feather', 'check'],
  send: ['feather', 'send'],
  clock: ['mci', 'clock-time-four-outline'],
  question: ['feather', 'help-circle'],
  lock: ['feather', 'lock'],
  star: ['mci', 'star-four-points-outline'],
  sparkle: ['mci', 'shimmer'],
  edit: ['feather', 'edit-2'],
  logout: ['feather', 'log-out'],
  trash: ['feather', 'trash-2'],
  camera: ['feather', 'camera'],
  download: ['feather', 'download'],
  share: ['feather', 'share-2'],
  heart: ['mci', 'heart-outline'],
  briefcase: ['feather', 'briefcase'],
  book: ['feather', 'book-open'],
  activity: ['feather', 'activity'],
  external: ['feather', 'external-link'],
  play: ['mci', 'play-circle-outline'],
  info: ['feather', 'info'],
  phone: ['feather', 'phone'],
  arrowRight: ['feather', 'arrow-right'],
  chevronDown: ['feather', 'chevron-down'],
  chevronUp: ['feather', 'chevron-up'],
  plus: ['feather', 'plus'],
  family: ['feather', 'users'],
  // reports / store / features
  compass: ['feather', 'compass'],
  diamond: ['mci', 'diamond-stone'],
  eye: ['feather', 'eye'],
  beads: ['mci', 'circle-multiple-outline'],
  document: ['mci', 'file-document-outline'],
  graduation: ['mci', 'school-outline'],
  mapPin: ['feather', 'map-pin'],
  calendar: ['feather', 'calendar'],
  sun: ['feather', 'sun'],
  sunrise: ['feather', 'sunrise'],
  sunset: ['feather', 'sunset'],
  car: ['mci', 'car-outline'],
  plane: ['mci', 'airplane'],
  tag: ['feather', 'tag'],
} as const;

export type IconName = keyof typeof MAP;

export function Icon({
  name,
  size = 22,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: any;
}) {
  const th = useColors();
  const col = color ?? th.gold;
  const [set, glyph] = MAP[name];
  if (set === 'feather') {
    return <Feather name={glyph as any} size={size} color={col} style={style} />;
  }
  return <MaterialCommunityIcons name={glyph as any} size={size} color={col} style={style} />;
}
