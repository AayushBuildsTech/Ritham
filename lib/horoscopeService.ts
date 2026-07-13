// horoscopeService — client wrapper around the `horoscope` Edge Function.
// The app never generates horoscope text; the function holds the Claude key,
// enforces the per-sign shared cache, and returns cached-or-freshly-generated
// text for the user's Moon sign.
//
// Slug note: like the chat function, the dashboard "Via Editor" deploy can
// auto-rename the function. If it deploys under a different slug, update
// HOROSCOPE_FUNCTION to match.

import { supabase } from './supabase';
import type { Lang } from './i18n';

const HOROSCOPE_FUNCTION = 'horoscope';

export type HoroscopePeriod = 'daily' | 'weekly' | 'monthly';

export interface HoroscopeResult {
  sign?: string;
  period?: HoroscopePeriod;
  period_key?: string;
  body?: string;
  cached?: boolean;
  error?: string; // 'kundli_missing' | 'profile_not_found' | 'request_failed' | ...
}

export async function getHoroscope(
  profileId: string,
  period: HoroscopePeriod,
  lang: Lang = 'en',
): Promise<HoroscopeResult> {
  const { data, error } = await supabase.functions.invoke(HOROSCOPE_FUNCTION, {
    body: { profileId, period, lang },
  });
  if (error) return { error: error.message ?? 'request_failed' };
  return data as HoroscopeResult;
}
