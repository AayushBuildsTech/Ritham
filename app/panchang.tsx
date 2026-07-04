import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getPanchang, Panchang } from '../lib/panchangService';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing } from '../constants/theme';

export default function PanchangScreen() {
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Panchang</Text>
        <View style={{ width: 48 }} />
      </View>

      {state === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>
      ) : state === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn’t load today’s Panchang right now.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.dateLine}>
            {data?.vaara}{data?.place ? `  ·  ${data.place}` : ''}
          </Text>
          <Text style={styles.dateSub}>{data?.date}</Text>

          {/* The five limbs (panch-anga) */}
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
            <TouchableOpacity style={styles.hookBtn} onPress={openChat}>
              <Text style={styles.hookBtnText}>Ask the astrologer →</Text>
            </TouchableOpacity>
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
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, good && styles.good, bad && styles.bad]}>{value ?? '—'}</Text>
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
  dateLine: { color: Colors.goldLight, fontSize: Fonts.size.lg, fontWeight: '700' },
  dateSub: { color: Colors.textMuted, fontSize: Fonts.size.sm, marginTop: 2, marginBottom: Spacing.md },

  sectionLabel: { color: Colors.textDim, fontSize: Fonts.size.xs, letterSpacing: 1, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.lg },
  group: {
    backgroundColor: Colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, gap: Spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLabel: { color: Colors.textMuted, fontSize: Fonts.size.md },
  rowValue: { color: Colors.text, fontSize: Fonts.size.md, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  good: { color: Colors.success },
  bad: { color: Colors.error },

  hookCard: {
    backgroundColor: Colors.bgMid, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginTop: Spacing.xl, alignItems: 'center', gap: Spacing.md,
  },
  hookText: { color: Colors.text, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  hookEm: { color: Colors.goldLight, fontWeight: '700' },
  hookBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl,
  },
  hookBtnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },

  footnote: { color: Colors.textDim, fontSize: Fonts.size.xs, lineHeight: 17, textAlign: 'center', marginTop: Spacing.lg },
});
