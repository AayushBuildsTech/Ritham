import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getNumerology } from '../lib/numerologyService';
import { Numerology, NumerologyNumber } from '../lib/numerology';
import { meaningFor } from '../constants/numerology';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing, Radius, Depth, Accents } from '../constants/theme';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Reveal } from '../components/Reveal';

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
      <ScreenHeader title="Numerology" onBack={() => router.back()} />

      {state === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>
      ) : state === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn’t load your numerology right now.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            {name?.trim().split(/\s+/)[0]}, your core numbers are drawn from your name and date of birth.
          </Text>

          {data ? <Reveal index={0}><NumberCard kind="Life Path" n={data.life_path} /></Reveal> : null}
          {data ? <Reveal index={1}><NumberCard kind="Expression" n={data.expression} /></Reveal> : null}

          {/* Soft hook into Chat (gentle, optional) */}
          <Reveal index={2}>
            <View style={styles.hookCard}>
              <Text style={styles.hookText}>
                See how your <Text style={styles.hookEm}>birth chart</Text> shapes all of this.
              </Text>
              <Pressable style={styles.hookBtn} onPress={openChat} android_ripple={{ color: Colors.goldDeep }}>
                <Text style={styles.hookBtnText}>Start a chat</Text>
                <Icon name="arrowRight" size={15} color={Colors.canvas} />
              </Pressable>
            </View>
          </Reveal>

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
  root: { flex: 1, backgroundColor: Colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { fontFamily: Fonts.body, color: Colors.textMuted, fontSize: Fonts.size.md, textAlign: 'center' },

  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  intro: { fontFamily: Fonts.body, color: Colors.textMuted, fontSize: Fonts.size.md, lineHeight: 22, marginBottom: Spacing.lg },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.md, ...Depth.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  badge: {
    width: 60, height: 60, borderRadius: Radius.pill, backgroundColor: Accents.amethyst.faint,
    borderWidth: 1, borderColor: Accents.amethyst.soft, alignItems: 'center', justifyContent: 'center',
  },
  badgeNum: { fontFamily: Fonts.displayBold, color: Accents.amethyst.color, fontSize: Fonts.size.xxl },
  kind: { fontFamily: Fonts.bodySemibold, color: Accents.amethyst.color, fontSize: Fonts.size.xs, letterSpacing: 1.5, textTransform: 'uppercase' },
  cardTitle: { fontFamily: Fonts.displayBold, color: Colors.text, fontSize: Fonts.size.xl, marginTop: 2 },
  keyword: { fontFamily: Fonts.bodyMedium, color: Colors.goldLight, fontSize: Fonts.size.sm, marginTop: 2 },
  body: { fontFamily: Fonts.body, color: Colors.text, fontSize: Fonts.size.md, lineHeight: 24 },

  hookCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong,
    padding: Spacing.lg, marginTop: Spacing.lg, alignItems: 'center', gap: Spacing.md,
  },
  hookText: { fontFamily: Fonts.body, color: Colors.text, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  hookEm: { fontFamily: Fonts.bodySemibold, color: Colors.goldLight },
  hookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.gold, borderRadius: Radius.sm, paddingVertical: 12, paddingHorizontal: Spacing.xl,
  },
  hookBtnText: { fontFamily: Fonts.bodySemibold, color: Colors.canvas, fontSize: Fonts.size.md },

  footnote: { fontFamily: Fonts.body, color: Colors.textDim, fontSize: Fonts.size.xs, lineHeight: 17, textAlign: 'center', marginTop: Spacing.lg },
});
