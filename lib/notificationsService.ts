// Daily reminder notifications — 100% local, zero backend (Option A).
//
// Two nudges a day (7 AM + 6 PM) that pull the user back into the app. Because
// they are LOCAL notifications there is no server, no push token, no Expo/APNs
// cost — the OS fires them on-device even offline.
//
// "Personalised, not vague": every reminder is anchored to the day's actual
// Vedic ruling planet (vaar) and its life-domain — Monday/Moon (emotion),
// Tuesday/Mars (drive), Friday/Venus (love)… — then filled with the user's first
// name and Moon sign (Rashi). So the copy reads as computed and specific to
// today rather than interchangeable mysticism. We pre-schedule a ROLLING 14-day
// window of individually dated notifications and reschedule on every app open,
// so the copy never goes stale. All copy is on-brand (no emojis, luxury tone).

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ENABLED_KEY = 'ritham.remindersEnabled';
const CHANNEL_ID = 'daily-guidance';
const MORNING_HOUR = 7;   // 07:00 local
const EVENING_HOUR = 18;  // 18:00 local
const WINDOW_DAYS = 14;   // how many days ahead we pre-schedule

// Show the reminder even if the app happens to be in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface ReminderContext {
  name?: string | null;      // active profile name; we use the first word
  moonSign?: string | null;  // Rashi — null until a Kundli exists
}

interface Filled { name: string; sign: string | null }
// `needs: 'sign'` lines reference the Moon sign, so they are skipped for users
// who have not built a Kundli yet (sign === null).
type Slot = { needs?: 'sign'; text: (c: Filled) => string };
interface DayTheme { morning: Slot[]; evening: Slot[] }

const MORNING_TITLES = ['Your morning reading', "Today's energy", 'The day ahead'];
const EVENING_TITLES = ['Your evening reflection', 'The day, in review', 'Before you rest'];

// getDay(): 0 = Sunday … 6 = Saturday. Each weekday's copy is built around its
// ruling planet and that planet's concrete domain, with 3 variants per slot so
// the same weekday reads differently week to week.
const WEEKDAY: DayTheme[] = [
  // 0 — Sunday · the Sun (Surya): confidence, vitality, recognition
  {
    morning: [
      { text: (c) => `Sunday is the Sun's day, ${c.name} — for confidence and being seen. Your reading shows where to step forward today.` },
      { text: (c) => `The Sun rules today, ${c.name}. Vitality and recognition favour the bold — see where yours lies.` },
      { needs: 'sign', text: (c) => `A Sun-ruled Sunday lifts your ${c.sign} spirit, ${c.name}. Your reading shows where to shine.` },
    ],
    evening: [
      { text: (c) => `The Sun ruled today, ${c.name}. Where did you stand tall? Tonight's reading reflects it back.` },
      { text: (c) => `A day of the Sun asks one thing, ${c.name}: were you seen as you wished? See what tomorrow offers.` },
      { needs: 'sign', text: (c) => `As the Sun sets on your ${c.sign} day, ${c.name}, see what it revealed — and what waits tomorrow.` },
    ],
  },
  // 1 — Monday · the Moon (Chandra): emotion, mind, home, comfort
  {
    morning: [
      { needs: 'sign', text: (c) => `Monday is the Moon's day — and the Moon rules your ${c.sign} nature closely, ${c.name}. Feelings run near the surface today. Your reading shows how to steady them.` },
      { text: (c) => `The Moon governs today, ${c.name}. Mood and intuition lead over logic — see what yours is pointing to.` },
      { text: (c) => `A Moon-ruled Monday, ${c.name}. Tend to home, rest and the people who comfort you. Your reading shows where.` },
    ],
    evening: [
      { needs: 'sign', text: (c) => `The Moon stirred your ${c.sign} heart today, ${c.name}. Before you rest, see what it's really telling you.` },
      { text: (c) => `A day ruled by the Moon leaves feelings unsettled, ${c.name}. Tonight's reflection helps you name them.` },
      { text: (c) => `The Moon closes the day softly, ${c.name}. See what tomorrow asks of your heart.` },
    ],
  },
  // 2 — Tuesday · Mars (Mangal): energy, courage, conflict, ambition
  {
    morning: [
      { text: (c) => `Tuesday runs on Mars, ${c.name} — bold energy, a short fuse. A day to act, a risky one to argue. Your reading shows which is which.` },
      { text: (c) => `Mars drives today, ${c.name}. Courage comes easily; so does conflict. See where to spend your fire.` },
      { needs: 'sign', text: (c) => `Mars sharpens your ${c.sign} drive today, ${c.name}. Your reading shows where to push and where to hold.` },
    ],
    evening: [
      { text: (c) => `Mars pushed hard today, ${c.name}. Did you channel the drive, or spend it fighting? Tonight's reading knows.` },
      { text: (c) => `A Mars day burns fast, ${c.name}. See what's worth carrying into tomorrow and what to let cool.` },
      { needs: 'sign', text: (c) => `Your ${c.sign} energy ran high under Mars today, ${c.name}. Tonight, see where it truly served you.` },
    ],
  },
  // 3 — Wednesday · Mercury (Budha): communication, intellect, business
  {
    morning: [
      { text: (c) => `Wednesday is Mercury's day, ${c.name} — sharp for conversations, deals and decisions. Your reading shows where your words carry weight.` },
      { text: (c) => `Mercury favours the quick mind today, ${c.name}. A good day to speak, sell or settle — see where to focus it.` },
      { needs: 'sign', text: (c) => `Mercury quickens your ${c.sign} thinking today, ${c.name}. Your reading shows which conversation matters most.` },
    ],
    evening: [
      { text: (c) => `Mercury favoured the clever today, ${c.name}. See which conversation still needs finishing before tomorrow.` },
      { text: (c) => `A Mercury day rewards clear words, ${c.name}. Tonight, see what was said — and what was left unsaid.` },
      { text: (c) => `Mercury closes the day, ${c.name}. A good moment to plan tomorrow's words — your reading helps.` },
    ],
  },
  // 4 — Thursday · Jupiter (Guru): fortune, growth, wisdom, finance
  {
    morning: [
      { text: (c) => `Thursday belongs to Jupiter, ${c.name} — the planet of fortune and growth. Doors open a little wider today; your reading shows which to walk through.` },
      { text: (c) => `Jupiter blesses today, ${c.name}. Luck, learning and generosity flow — see where to meet them.` },
      { needs: 'sign', text: (c) => `Jupiter expands your ${c.sign} path today, ${c.name}. Your reading shows where fortune is quietly moving.` },
    ],
    evening: [
      { text: (c) => `Jupiter offered opportunity today, ${c.name}. Did you notice it? Tonight's reading points to the one you may have missed.` },
      { text: (c) => `A day of Jupiter rewards the open-handed, ${c.name}. See what grew today, and what to nurture tomorrow.` },
      { needs: 'sign', text: (c) => `Jupiter favoured your ${c.sign} fortunes today, ${c.name}. Tonight, see where the door is still open.` },
    ],
  },
  // 5 — Friday · Venus (Shukra): love, beauty, comfort, relationships
  {
    morning: [
      { text: (c) => `Friday is Venus's day, ${c.name} — love, warmth and comfort come easily. A good day for the people who matter; your reading shows how.` },
      { text: (c) => `Venus softens today, ${c.name}. Beauty, pleasure and connection are favoured — see where to welcome them.` },
      { needs: 'sign', text: (c) => `Venus warms your ${c.sign} heart today, ${c.name}. Your reading shows where love and ease are waiting.` },
    ],
    evening: [
      { text: (c) => `Venus coloured the day, ${c.name}. See what your heart wants to say before the evening ends.` },
      { text: (c) => `A Venus day favours closeness, ${c.name}. Tonight, reach for the person who's been on your mind.` },
      { needs: 'sign', text: (c) => `Venus touched your ${c.sign} affections today, ${c.name}. Tonight's reading shows what to hold close.` },
    ],
  },
  // 6 — Saturday · Saturn (Shani): discipline, work, patience, karma
  {
    morning: [
      { text: (c) => `Saturday answers to Saturn, ${c.name} — the strict teacher. Effort pays, shortcuts cost. Your reading shows where patience wins today.` },
      { text: (c) => `Saturn rules today, ${c.name}. Slow, steady work beats haste — see where to put your discipline.` },
      { needs: 'sign', text: (c) => `Saturn tests your ${c.sign} resolve today, ${c.name}. Your reading shows where steady effort pays off.` },
    ],
    evening: [
      { text: (c) => `Saturn measured today's work, ${c.name}. What you built holds; what you rushed will ask again. Tonight's reading shows which.` },
      { text: (c) => `A Saturn day rewards patience, ${c.name}. See what you completed, and what tomorrow still owes you.` },
      { needs: 'sign', text: (c) => `Saturn weighed your ${c.sign} efforts today, ${c.name}. Tonight, see where discipline is quietly paying off.` },
    ],
  },
];

// Pick the day's planetary theme, then rotate the variant by week so the same
// weekday reads differently week to week. Sign-based lines are dropped for users
// without a Kundli yet.
function pickLine(theme: DayTheme, slot: 'morning' | 'evening', weekIndex: number, c: Filled): string {
  const pool = c.sign ? theme[slot] : theme[slot].filter((s) => s.needs !== 'sign');
  return pool[weekIndex % pool.length].text(c);
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.status === 'granted') return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted || req.status === 'granted';
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Daily guidance',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#C5A059',
  });
}

// Local day index (offset-adjusted so it flips at local midnight, not UTC).
function localDayNumber(d: Date): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

function firstName(name?: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'friend';
}

// Moon sign is stored as "Cancer (Karka)"; mid-sentence we want just "Cancer".
function shortSign(sign?: string | null): string | null {
  const s = (sign ?? '').replace(/\s*\(.*\)\s*$/, '').trim();
  return s || null;
}

/** (Re)build the rolling 14-day window of 7 AM + 6 PM reminders. */
export async function scheduleDailyReminders(ctx: ReminderContext): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!(await ensurePermission())) return false;
  await ensureAndroidChannel();
  // We own every scheduled local notification, so a clean rebuild is safe.
  await Notifications.cancelAllScheduledNotificationsAsync();

  const filled: Filled = { name: firstName(ctx.name), sign: shortSign(ctx.moonSign) };
  const now = new Date();
  const slots = [
    { hour: MORNING_HOUR, key: 'morning' as const, titles: MORNING_TITLES },
    { hour: EVENING_HOUR, key: 'evening' as const, titles: EVENING_TITLES },
  ];

  for (let day = 0; day < WINDOW_DAYS; day++) {
    for (const slot of slots) {
      const when = new Date(now);
      when.setDate(now.getDate() + day);
      when.setHours(slot.hour, 0, 0, 0);
      if (when.getTime() <= now.getTime() + 60_000) continue; // slot already passed

      const weekIndex = Math.floor(localDayNumber(when) / 7);
      const theme = WEEKDAY[when.getDay()];
      await Notifications.scheduleNotificationAsync({
        content: {
          title: slot.titles[weekIndex % slot.titles.length],
          body: pickLine(theme, slot.key, weekIndex, filled),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
          channelId: CHANNEL_ID,
        },
      });
    }
  }
  return true;
}

export async function cancelDailyReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function remindersEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(ENABLED_KEY);
  return v !== 'false'; // default ON
}

/** Settings toggle target: persist the choice and schedule/cancel accordingly. */
export async function setRemindersEnabled(on: boolean, ctx: ReminderContext): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, on ? 'true' : 'false');
  if (on) await scheduleDailyReminders(ctx);
  else await cancelDailyReminders();
}

/** Call on app open — refreshes the window if reminders are enabled. Best-effort. */
export async function syncDailyReminders(ctx: ReminderContext): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    if (!(await remindersEnabled())) return;
    await scheduleDailyReminders(ctx);
  } catch {
    // reminders are a nicety; never let them disrupt app start
  }
}
