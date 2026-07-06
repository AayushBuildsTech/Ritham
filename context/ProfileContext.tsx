import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// The "active person": Ritham can hold the account owner (self) plus family
// members (spouse, children, parents…), each a row in `profiles`. Home, Chat,
// horoscopes, numerology and reports all operate on the ACTIVE profile. The
// choice persists to AsyncStorage. The backend was already per-profile
// (every Edge Function takes a profileId) — this just picks which one.

const ACTIVE_KEY = 'ritham.activeProfileId';

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;      // 'self' | 'spouse' | 'son' | … (see migration 013)
  moonSign: string | null;
  hasKundli: boolean;
}

interface ProfileContextValue {
  members: FamilyMember[];
  activeId: string | null;
  active: FamilyMember | null;
  loading: boolean;      // true until the first load for the signed-in user finishes
  setActive: (id: string) => void;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setMembers([]); setActiveId(null); setLoading(false); return; }
    setLoading(true);

    // Prefer the `relation` column (migration 013). If it isn't there yet,
    // PostgREST rejects the whole query — fall back to inferring relation from
    // order (earliest row = self) so the app never bricks pre-migration.
    let rows: any[] = [];
    const withRel = await supabase
      .from('profiles').select('id, name, relation, kundli_chart')
      .eq('user_id', user.id).order('created_at', { ascending: true });
    if (withRel.error) {
      const noRel = await supabase
        .from('profiles').select('id, name, kundli_chart')
        .eq('user_id', user.id).order('created_at', { ascending: true });
      rows = (noRel.data ?? []).map((r: any, i: number) => ({ ...r, relation: i === 0 ? 'self' : 'other' }));
    } else {
      rows = withRel.data ?? [];
    }

    const list: FamilyMember[] = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      relation: r.relation ?? 'self',
      moonSign: r.kundli_chart?.moon_sign ?? null,
      hasKundli: !!r.kundli_chart,
    }));
    setMembers(list);

    // Resolve the active person: the persisted choice if it still exists,
    // else self, else the first member, else none.
    const stored = await AsyncStorage.getItem(ACTIVE_KEY);
    const resolved =
      (stored && list.some((m) => m.id === stored) && stored) ||
      list.find((m) => m.relation === 'self')?.id ||
      list[0]?.id || null;
    setActiveId(resolved);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const setActive = (id: string) => {
    setActiveId(id);
    AsyncStorage.setItem(ACTIVE_KEY, id).catch(() => {});
  };

  const active = members.find((m) => m.id === activeId) ?? null;

  return (
    <ProfileContext.Provider value={{ members, activeId, active, loading, setActive, refresh: load }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useActiveProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useActiveProfile must be used within a ProfileProvider');
  return ctx;
}

// Human labels for the relation vocabulary.
export const RELATION_LABEL: Record<string, string> = {
  self: 'You', spouse: 'Spouse', son: 'Son', daughter: 'Daughter',
  father: 'Father', mother: 'Mother', brother: 'Brother', sister: 'Sister',
  friend: 'Friend', other: 'Family',
};
// Relations offered when adding a family member (self is implicit for the owner).
export const FAMILY_RELATIONS = [
  'spouse', 'son', 'daughter', 'father', 'mother', 'brother', 'sister', 'friend', 'other',
] as const;
