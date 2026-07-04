// panchangService — client wrapper around the `panchang` Edge Function.
//
// The Panchang is COMPUTED (pure astronomy) and cached per city per day in the
// function — no AI, no provider call. The client only asks for it by profile id
// (which resolves the city server-side) and renders the returned almanac.
//
// Slug note: like the other functions, the dashboard "Via Editor" deploy can
// auto-rename it. If it deploys under a different slug, update PANCHANG_FUNCTION.

import { supabase } from './supabase';

const PANCHANG_FUNCTION = 'panchang';

export interface PanchangWindow { name: string; start: string; end: string }

export interface Panchang {
  date?: string;
  place?: string | null;
  vaara?: string;
  tithi?: string;
  nakshatra?: string;
  yoga?: string;
  karana?: string;
  sunrise?: string;
  sunset?: string;
  rahu_kaal?: string;
  auspicious?: PanchangWindow[];
  inauspicious?: PanchangWindow[];
  method?: string;
  cached?: boolean;
  error?: string; // 'profile_not_found' | 'place_missing' | 'request_failed' | ...
}

export async function getPanchang(profileId: string): Promise<Panchang> {
  const { data, error } = await supabase.functions.invoke(PANCHANG_FUNCTION, {
    body: { profileId },
  });
  if (error) return { error: error.message ?? 'request_failed' };
  return data as Panchang;
}
