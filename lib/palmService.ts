// palmService — client helpers for the Palm Reading paid feature.
//
// Two tiers, by design (see plan):
//   1. HINT (free, ZERO-cost): buildPalmHint() composes a genuine 2-3 sentence teaser
//      purely from the user's already-computed Kundli (Moon sign, Lagna, current
//      Mahadasha). NO network / AI call — so an upload that never converts costs us
//      nothing. It only entices; the real palm analysis is never run here.
//   2. FULL READING (paid ₹99): after a verified 'report'/'palm' purchase, uploadPalm()
//      stores the photo and generatePalm() calls the shared `report` Edge Function
//      (type 'palm'), which runs ONE Claude vision call and caches a 9-page report.
//
// Mirrors reportService (Vastu path) — palm is just a new report `type`.

import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Lang } from './i18n';
import type { MatchPerson, GenerateResult } from './reportService';
import type { Kundli, ProfileRow, DashaPeriod } from './kundliService';

// Build the MatchPerson chart snapshot the Edge Function cross-references (identical
// shape to the chart reports — the palm reading narrates from the same cached Kundli).
export function personFromProfile(p: ProfileRow): MatchPerson | null {
  const k = p.kundli_chart;
  if (!k) return null;
  return {
    name: p.name, gender: p.gender, dob: p.dob, tob: p.tob, birth_place: p.birth_place,
    lagna: k.lagna, moon_sign: k.moon_sign, sun_sign: k.sun_sign, nakshatra: k.nakshatra,
    placements: k.placements,
  };
}

// Upload a picked palm photo (base64 from expo-image-picker) into the user's own
// Storage folder in the `reports` bucket. Returns the storage path to generate from.
export async function uploadPalm(
  userId: string,
  base64: string,
  mimeType = 'image/jpeg',
): Promise<{ path?: string; error?: string }> {
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/palm-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('reports')
    .upload(path, decode(base64), { contentType: mimeType, upsert: true });
  if (error) return { error: error.message };
  return { path };
}

// ── Pre-payment palm-photo validation (cheap Haiku check) ─────────────────────

const PALM_CHECK_CAP = 15; // max validator calls per user per day (client-side cost guard)

// Bounded daily counter in AsyncStorage — a soft cap so an accidental burst of
// uploads can't rack up validator calls. Returns true if still under the cap.
async function underDailyCheckCap(): Promise<boolean> {
  try {
    const key = `ritham.palmChecks.${new Date().toISOString().slice(0, 10)}`;
    const n = parseInt((await AsyncStorage.getItem(key)) ?? '0', 10) || 0;
    if (n >= PALM_CHECK_CAP) return false;
    await AsyncStorage.setItem(key, String(n + 1));
    return true;
  } catch {
    return true; // storage error → don't block
  }
}

// Ask the cheap validator whether the picked photo is a clear human palm, BEFORE we
// show the hint / take payment. Fails OPEN ({ palm: true }) on any error or over the
// daily cap — the authoritative check is the paid `report` call, which refunds the
// credit if the image turns out unreadable.
export async function checkPalmImage(
  base64: string,
  mimeType = 'image/jpeg',
): Promise<{ palm: boolean; reason?: string }> {
  if (!(await underDailyCheckCap())) return { palm: true, reason: 'cap' };
  try {
    const { data, error } = await supabase.functions.invoke<{ palm?: boolean; reason?: string }>('palm-check', {
      body: { image: base64, mime: mimeType },
    });
    if (error || !data) return { palm: true }; // fail open
    return { palm: data.palm !== false, reason: data.reason };
  } catch {
    return { palm: true }; // fail open
  }
}

// Generate the palm reading (requires a paid, unconsumed 'report'/'palm' entitlement).
// The Edge Function claims the credit, runs the vision call and caches the report.
export async function generatePalm(
  self: MatchPerson,
  palmPath: string,
  focus: string,
  lang: Lang = 'en',
): Promise<GenerateResult> {
  const { data, error } = await supabase.functions.invoke<GenerateResult>('report', {
    body: { type: 'palm', self, palmPath, answers: { focus }, lang },
  });
  if (error) return { error: data?.error ?? error.message ?? 'request_failed' };
  return data ?? { error: 'request_failed' };
}

// ── ZERO-COST teaser hint (no network) ────────────────────────────────────────

export interface PalmHint {
  /** 2-3 sentence teaser shown before payment. */
  lead: string;
  /** The section titles the full reading unlocks (rendered as locked cards). */
  locked: string[];
}

// Strip a bracketed gloss, e.g. "Shani (Saturn)" → "Shani".
function cleanLord(s: string): string {
  return String(s ?? '').split('(')[0].trim();
}

// The current Mahadasha lord from the cached timeline (empty string if unavailable).
function currentDashaLord(k: Kundli | null): string {
  const tl: DashaPeriod[] = (k?.dasha_timeline ?? []) as DashaPeriod[];
  const now = Date.now();
  const cur = tl.find((d) => {
    const s = new Date(d.start).getTime();
    const e = new Date(d.end).getTime();
    return Number.isFinite(s) && Number.isFinite(e) && s <= now && now < e;
  });
  return cur ? cleanLord(cur.lord) : '';
}

const HINT_LOCKED_EN = [
  'Heart Line — your emotional nature',
  'Head Line — how you think & decide',
  'Life Line — vitality & resilience',
  'Fate Line — career & life direction',
  'The Mounts — planetary strengths in your hand',
  'Palm × Chart — where your lines meet your stars',
  'Life-area outlook — love, career, wealth, health',
  'Remedies & guidance',
];
const HINT_LOCKED_HI = [
  'हृदय रेखा — आपका भावनात्मक स्वभाव',
  'मस्तिष्क रेखा — आप कैसे सोचते व निर्णय लेते हैं',
  'जीवन रेखा — जीवनी-शक्ति व लचीलापन',
  'भाग्य रेखा — करियर व जीवन-दिशा',
  'पर्वत — आपके हाथ में ग्रह-बल',
  'हथेली × कुंडली — जहाँ रेखाएँ सितारों से मिलती हैं',
  'जीवन-क्षेत्र — प्रेम, करियर, धन, स्वास्थ्य',
  'उपाय एवं मार्गदर्शन',
];

// Compose the free hint from the cached chart. Degrades gracefully: full chart →
// Moon + Lagna + dasha; Moon only → Moon-led line; no chart → an honest generic line.
export function buildPalmHint(kundli: Kundli | null, lang: Lang): PalmHint {
  const hi = lang === 'hi';
  const moon = kundli?.moon_sign?.trim();
  const lagna = kundli?.lagna?.trim();
  const dl = currentDashaLord(kundli);

  let lead: string;
  if (moon && lagna) {
    lead = hi
      ? `आपकी हथेली मिल गई और मानचित्रित हो गई। ${lagna} लग्न और ${moon} में चंद्रमा के साथ, आपका हाथ एक गहरी, स्थिर भावनात्मक धारा रखता है।` +
        (dl ? ` ${dl} की महादशा सक्रिय होने से, आपकी भाग्य रेखा अपने सबसे निर्णायक अध्याय में प्रवेश कर रही है।` : '') +
        ` पूरी रीडिंग खोलें और देखें कि आपकी हृदय, मस्तिष्क, जीवन और भाग्य रेखाएँ आपकी कुंडली के सामने वास्तव में क्या कहती हैं।`
      : `Your palm has been received and mapped. With ${lagna} rising and the Moon in ${moon}, your hand carries a deep, steady emotional current.` +
        (dl ? ` With the ${dl} Mahadasha now active, your Fate Line is entering its most decisive chapter.` : '') +
        ` Unlock the full reading to see what your Heart, Head, Life & Fate lines actually reveal — read against your stars.`;
  } else if (moon) {
    lead = hi
      ? `आपकी हथेली मिल गई और मानचित्रित हो गई। ${moon} में आपका चंद्रमा आपके हाथ की भावनात्मक रेखाओं में झलकता है।` +
        ` पूरी रीडिंग खोलें और देखें कि आपकी प्रमुख रेखाएँ और पर्वत आपकी कुंडली के सामने क्या कहते हैं।`
      : `Your palm has been received and mapped. Your Moon in ${moon} echoes in the emotional lines of your hand.` +
        ` Unlock the full reading to see what your major lines and mounts reveal — read against your stars.`;
  } else {
    lead = hi
      ? `आपकी हथेली मिल गई और मानचित्रित हो गई। एक विशेषज्ञ हस्तरेखा × ज्योतिष पठन आपकी प्रमुख रेखाओं, पर्वतों और हाथ की आकृति को पढ़ने के लिए तैयार है।` +
        ` पूरी रीडिंग खोलें और देखें कि आपका हाथ वास्तव में क्या कहता है।`
      : `Your palm has been received and mapped. A detailed palmistry × astrology reading is ready to interpret your major lines, mounts and hand shape.` +
        ` Unlock the full reading to see what your hand truly reveals.`;
  }

  return { lead, locked: hi ? HINT_LOCKED_HI : HINT_LOCKED_EN };
}
