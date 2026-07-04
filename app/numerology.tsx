import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getNumerology } from '../lib/numerologyService';
import { Numerology, NumerologyNumber } from '../lib/numerology';
import { meaningFor } from '../constants/numerology';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing } from '../constants/theme';

export default function NumerologyScreen() {
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<Numerology | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    track('numerology_viewed');
    (async () => {
      if (!profileId) { setState('error'); return; }
      // Don't select `numerology` (added by migration 010) — a missing column would
      // fail the whole query. It's recomputed instantly and persisted best-effort.
      const { data: profile } = await supabase
        .from('profiles').select('id, name, dob')
        .eq('id', profileId).maybeSingle();
      if (!profile) { setState('error'); return; }
      setName(profile.name);
      const num = await getNumerology({ id: profile.id, name: profile.name, dob: profile.dob });
      setData(num);
      setState('ready');
    })();
  }, [profileId]);

  function openChat() {
    track('home_hook_clicked', { source: 'numerology' });
    router.push('/(tabs)/chat');
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Numerology</Text>
        <View style={{ width: 48 }} />
      </View>

      {state === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>
      ) : state === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn’t load your numerology right now.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            {name?.trim().split(/\s+/)[0]}, your core numbers are drawn from your name and date of birth.
          </Text>

          {data ? <NumberCard kind="Life Path" n={data.life_path} /> : null}
          {data ? <NumberCard kind="Expression" n={data.expression} /> : null}

          {/* Soft hook into Chat (gentle, optional) */}
          <View style={styles.hookCard}>
            <Text style={styles.hookText}>
              See how your <Text style={styles.hookEm}>birth chart</Text> shapes all of this.
            </Text>
            <TouchableOpacity style={styles.hookBtn} onPress={openChat}>
              <Text style={styles.hookBtnText}>Start a chat →</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footnote}>
            Numbers are computed from your name and birth date. For guidance and reflection,
            not professional advice.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function NumberCard({ kind, n }: { kind: 'Life Path' | 'Expression'; n: NumerologyNumber }) {
  const meaning = meaningFor(n.number);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.badge}>
          <Text style={styles.badgeNum}>{n.number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kind}>{kind}{n.is_master ? ' · Master Number' : ''}</Text>
          <Text style={styles.cardTitle}>{meaning?.title ?? '—'}</Text>
          {meaning ? <Text style={styles.keyword}>{meaning.keyword}</Text> : null}
        </View>
      </View>
      {meaning ? (
        <Text style={styles.body}>{kind === 'Life Path' ? meaning.life_path : meaning.expression}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  back: { color: Colors.goldLight, fontSize: Fonts.size.md, width: 48 },
  headerTitle: { color: Colors.text, fontSize: Fonts.size.lg, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { color: Colors.textMuted, fontSize: Fonts.size.md, textAlign: 'center' },

  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  intro: { color: Colors.textMuted, fontSize: Fonts.size.md, lineHeight: 22, marginBottom: Spacing.lg },

  card: {
    backgroundColor: Colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  badge: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.bgMid,
    borderWidth: 1.5, borderColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  badgeNum: { color: Colors.goldLight, fontSize: Fonts.size.xl, fontWeight: '800' },
  kind: { color: Colors.textDim, fontSize: Fonts.size.xs, letterSpacing: 1, fontWeight: '700', textTransform: 'uppercase' },
  cardTitle: { color: Colors.text, fontSize: Fonts.size.lg, fontWeight: '700', marginTop: 2 },
  keyword: { color: Colors.goldLight, fontSize: Fonts.size.sm, marginTop: 2 },
  body: { color: Colors.text, fontSize: Fonts.size.md, lineHeight: 24 },

  hookCard: {
    backgroundColor: Colors.bgMid, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginTop: Spacing.lg, alignItems: 'center', gap: Spacing.md,
  },
  hookText: { color: Colors.text, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  hookEm: { color: Colors.goldLight, fontWeight: '700' },
  hookBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl,
  },
  hookBtnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },

  footnote: { color: Colors.textDim, fontSize: Fonts.size.xs, lineHeight: 17, textAlign: 'center', marginTop: Spacing.lg },
});
