// muhuratService — client wrapper around the `muhurat` Edge Function.
//
// The results are COMPUTED (Panchang + fixed rules) and cached per
// (activity, city, date-range) in the function — no AI, no provider call. The
// client sends the activity id (+ optional date range) and renders the returned
// list of auspicious dates/windows.
//
// Slug note: like the other functions, the dashboard "Via Editor" deploy can
// auto-rename it. If it deploys under a different slug, update MUHURAT_FUNCTION.

import { supabase } from './supabase';

const MUHURAT_FUNCTION = 'muhurat';

export interface MuhuratDay {
  date: string;      // 'YYYY-MM-DD'
  weekday: string;
  tithi: string;
  nakshatra: string;
  yoga: string;
  window: string;    // auspicious time window (Abhijit Muhurta)
  sunrise: string;
  sunset: string;
}

export interface MuhuratResult {
  activity?: string;
  place?: string | null;
  start?: string;
  end?: string;
  count?: number;
  results?: MuhuratDay[];
  method?: string;
  cached?: boolean;
  error?: string; // 'bad_activity' | 'profile_not_found' | 'place_missing' | ...
}

export async function getMuhurats(
  profileId: string,
  activity: string,
  opts?: { startDate?: string; endDate?: string },
): Promise<MuhuratResult> {
  const { data, error } = await supabase.functions.invoke(MUHURAT_FUNCTION, {
    body: { profileId, activity, startDate: opts?.startDate, endDate: opts?.endDate },
  });
  if (error) return { error: error.message ?? 'request_failed' };
  return data as MuhuratResult;
}
