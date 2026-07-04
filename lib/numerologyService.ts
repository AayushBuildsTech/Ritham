// numerologyService — returns a profile's numerology, computing it ONCE and
// caching the result on the profile row (profiles.numerology jsonb).
//
// Fully client-side: the numbers are pure math (lib/numerology.ts) and the
// meanings are a static library (constants/numerology.ts). There is NO Edge
// Function, NO API and NO AI involved — and no runtime cost. Persisting the
// result just avoids recomputing on every view (spec: compute once per profile).

import { supabase } from './supabase';
import { computeNumerology, Numerology } from './numerology';

export interface NumerologyProfile {
  id: string;
  name: string;
  dob: string; // 'YYYY-MM-DD'
  numerology?: Numerology | null;
}

export async function getNumerology(profile: NumerologyProfile): Promise<Numerology> {
  // Cache hit — already stored on the row.
  if (profile.numerology && profile.numerology.life_path) {
    return profile.numerology;
  }

  const result = computeNumerology(profile.name, profile.dob);

  // Persist (best-effort — a failed write never blocks showing the reading).
  const { error } = await supabase
    .from('profiles').update({ numerology: result }).eq('id', profile.id);
  if (error) {
    // Non-fatal: the numbers are deterministic and will simply be recomputed next time.
    console.warn('numerology cache write failed:', error.message);
  }
  return result;
}
