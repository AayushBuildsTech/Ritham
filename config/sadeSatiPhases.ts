// sadeSatiPhases — STATIC, pre-written, deliberately CALM and NON-ALARMIST copy for
// the Sade Sati Tracker. Written ONCE, never AI-generated. Sade Sati causes real
// anxiety, so every line here is constructive and matter-of-fact: "a period of change
// and growth," never "suffering." No remedies-for-purchase, no gemstones, no products.

export type SadePhase = 1 | 2 | 3; // 1 = rising (12th from Moon), 2 = peak (1st), 3 = setting (2nd)

export const PHASE_LABEL: Record<SadePhase, string> = {
  1: 'Rising phase',
  2: 'Peak phase',
  3: 'Setting phase',
};

// Which house-from-Moon each phase corresponds to (for the sub-line).
export const PHASE_HOUSE: Record<SadePhase, string> = {
  1: 'Shani in the 12th from your Chandra',
  2: 'Shani over your Chandra (1st)',
  3: 'Shani in the 2nd from your Chandra',
};

export const PHASE_MEANING: Record<SadePhase, string> = {
  1:
    'This is the opening phase, as Shani enters the sign before your Moon. Life often asks ' +
    'you to slow down, let go of what is no longer needed and become more self-reliant. It ' +
    'can feel like a quieter, more inward time — think of it as clearing space and building ' +
    'patience for the years ahead. Steady routines and honest reflection carry you through it well.',
  2:
    'This is the central phase, with Shani moving over your Moon sign itself. It tends to be ' +
    'the most significant stretch — a period of change, responsibility and real personal ' +
    'growth. Shani rewards discipline, sincerity and hard work, so effort you put in now tends ' +
    'to build lasting foundations. Be kind to yourself, keep your commitments simple, and lean ' +
    'on the people who support you.',
  3:
    'This is the closing phase, as Shani moves into the sign after your Moon. The intensity ' +
    'gradually eases and the lessons of the past years begin to settle into wisdom and ' +
    'stability. It is a time to consolidate, tie up loose ends and appreciate how much you ' +
    'have matured. Better rhythm and lighter energy return as this phase completes.',
};

// Shown when the user is NOT in Sade Sati.
export const NOT_IN_SADE_SATI =
  'You are not in Sade Sati right now. Shani is not transiting the signs around your ' +
  'Chandra (Moon), so this particular cycle is not active for you at present.';

// General one-liner shown under the title on the detail screen.
export const SADE_SATI_INTRO =
  'Sade Sati is the roughly seven-and-a-half year transit of Shani through the sign before ' +
  'your Moon, your Moon sign, and the sign after — traditionally a time of change, ' +
  'responsibility and steady growth. Here is exactly where you stand in the cycle.';
