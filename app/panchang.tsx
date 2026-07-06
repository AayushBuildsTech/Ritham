import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getPanchang, Panchang } from '../lib/panchangService';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing, Radius, Accents, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

export default function PanchangScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<Panchang | null>(null);

  useEffect(() => {
    track('panchang_viewed');
    (async () => {
      if (!profileId) { setState('error'); return; }
      const res = await getPanchang(profileId);
      if (res.error) { setState('error'); return; }
      setData(res);
      setState('ready');
    })();
  }, [profileId]);

  function openChat() {
    track('home_hook_clicked', { source: 'panchang' });
    router.push('/(tabs)/chat');
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Panchang" onBack={() => router.back()} />

      {state === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>
      ) : state === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn’t load today’s Panchang right now.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.dateLine}>
            {data?.vaara}{data?.place ? `  ·  ${data.place}` : ''}
          </Text>
          <Text style={styles.dateSub}>{data?.date}</Text>

          {/* The five limbs (panch-anga) */}
          <Text style={styles.sectionLabel}>PANCHANGA</Text>
          <View style={styles.group}>
            <Row label="Tithi" value={data?.tithi} />
            <Row label="Nakshatra" value={data?.nakshatra} />
            <Row label="Yoga" value={data?.yoga} />
            <Row label="Karana" value={data?.karana} />
            <Row label="Vaara" value={data?.vaara} last />
          </View>

          <Text style={styles.sectionLabel}>SUN</Text>
          <View style={styles.group}>
            <Row label="Sunrise" value={data?.sunrise} />
            <Row label="Sunset" value={data?.sunset} last />
          </View>

          {data?.auspicious && data.auspicious.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>AUSPICIOUS</Text>
              <View style={styles.group}>
                {data.auspicious.map((w, i) => (
                  <Row key={w.name} label={w.name} value={`${w.start} – ${w.end}`}
                    last={i === data.auspicious!.length - 1} good />
                ))}
              </View>
            </>
          ) : null}

          {data?.inauspicious && data.inauspicious.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>INAUSPICIOUS</Text>
              <View style={styles.group}>
                {data.inauspicious.map((w, i) => (
                  <Row key={w.name} label={w.name} value={`${w.start} – ${w.end}`}
                    last={i === data.inauspicious!.length - 1} bad />
                ))}
              </View>
            </>
          ) : null}

          {/* Soft hook into Chat (gentle, optional) */}
          <View style={styles.hookCard}>
            <Text style={styles.hookText}>
              Curious what today holds for <Text style={styles.hookEm}>you</Text> specifically?
            </Text>
            <Pressable style={styles.hookBtn} onPress={openChat} android_ripple={{ color: th.goldDeep }}>
              <Text style={styles.hookBtnText}>Ask the astrologer</Text>
              <Icon name="arrowRight" size={15} color={th.goldContrast} />
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            The Panchang is computed from astronomical positions for your city and is the same for
            everyone nearby. For guidance and reflection, not professional advice.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, value, last, good, bad }: {
  label: string; value?: string; last?: boolean; good?: boolean; bad?: boolean;
}) {
  const th = useColors();
  const styles = makeStyles(th);
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, good && styles.good, bad && styles.bad]}>{value ?? '—'}</Text>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, textAlign: 'center' },

  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  dateLine: { fontFamily: Fonts.displayBold, color: th.goldLight, fontSize: Fonts.size.xxl },
  dateSub: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, marginTop: 2 },

  sectionLabel: { fontFamily: Fonts.bodySemibold, color: Accents.saffron.color, fontSize: Fonts.size.xs, letterSpacing: 2, marginBottom: Spacing.sm, marginTop: Spacing.lg },
  group: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    paddingHorizontal: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, gap: Spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: th.divider },
  rowLabel: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md },
  rowValue: { fontFamily: Fonts.bodySemibold, color: th.text, fontSize: Fonts.size.md, flexShrink: 1, textAlign: 'right' },
  good: { color: th.success },
  bad: { color: th.error },

  hookCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.lg, marginTop: Spacing.xl, alignItems: 'center', gap: Spacing.md,
  },
  hookText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  hookEm: { fontFamily: Fonts.bodySemibold, color: th.goldLight },
  hookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 12, paddingHorizontal: Spacing.xl,
  },
  hookBtnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md },

  footnote: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, lineHeight: 17, textAlign: 'center', marginTop: Spacing.lg },
});
