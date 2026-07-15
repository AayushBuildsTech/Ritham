import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { listReports, reportCredits, ReportRow } from '../lib/reportService';
import { REPORT_META, paiseTo, REPORT_PRICES } from '../config/pricing';
import { Fonts, Spacing, Radius, Accents, AccentName, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { REPORT_IMG, REPORT_ACCENT } from '../constants/reportArt';

export default function MyReports() {
  const th = useColors();
  const styles = makeStyles(th);
  const { t, isHindi } = useLanguage();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [byType, setByType] = useState<Record<string, ReportRow[]>>({});
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rs = (await listReports()).filter((r) => r.status === 'ready');
    const grouped: Record<string, ReportRow[]> = {};
    for (const r of rs) (grouped[r.type] || (grouped[r.type] = [])).push(r);
    const creditEntries = await Promise.all(
      REPORT_META.map(async (m) => [m.type, await reportCredits(m.type)] as const),
    );
    const cm: Record<string, number> = {};
    for (const [type, n] of creditEntries) cm[type] = n;
    setByType(grouped);
    setCredits(cm);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const priceOf = (type: string) => {
    const p = (REPORT_PRICES as any)[type];
    return p ? paiseTo(p.price_paise) : '';
  };
  const create = (type: string, next: string) =>
    router.push({ pathname: '/report-language' as any, params: { type, next } });

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'आपकी रिपोर्ट' : 'Your Reports'} onBack={() => router.back()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sub}>{isHindi ? 'आपकी बनाई गई सभी रिपोर्ट — किसी को भी खोलकर दोबारा देखें या डाउनलोड करें।' : 'Every report you’ve created — open any one to re-view or download.'}</Text>

          {REPORT_META.map((m) => {
            const acc = Accents[(REPORT_ACCENT[m.type] ?? 'gold') as AccentName];
            const list = byType[m.type] || [];
            const isOpen = open === m.type;
            const owned = (credits[m.type] || 0) > 0;
            return (
              <View key={m.type} style={styles.group}>
                <Pressable
                  style={[styles.head, { borderColor: isOpen ? acc.soft : th.border }]}
                  onPress={() => setOpen((o) => (o === m.type ? null : m.type))}
                  android_ripple={{ color: th.goldFaint }}
                >
                  <Image source={REPORT_IMG[m.type]} style={styles.thumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.headTitle} numberOfLines={2}>{t('report.' + m.type + '.title')}</Text>
                    <Text style={styles.headMeta}>
                      {list.length > 0
                        ? `${list.length} ${isHindi ? 'रिपोर्ट' : list.length === 1 ? 'report' : 'reports'}`
                        : (owned ? (isHindi ? 'बनाने के लिए तैयार' : 'Ready to create') : (isHindi ? 'अभी तक कोई नहीं' : 'None yet'))}
                    </Text>
                  </View>
                  <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={18} color={th.textMuted} />
                </Pressable>

                {isOpen && (
                  <View style={styles.body}>
                    {list.length > 0 ? (
                      list.map((r) => (
                        <Pressable
                          key={r.id}
                          style={styles.row}
                          onPress={() => router.push({ pathname: '/report-view', params: { id: r.id } })}
                          android_ripple={{ color: th.goldFaint }}
                        >
                          <View style={[styles.dot, { backgroundColor: acc.color }]} />
                          <Text style={styles.rowText} numberOfLines={1}>
                            {r.score != null ? `${r.score}${m.type === 'matchmaking' ? '%' : '/100'} · ` : ''}
                            {new Date(r.created_at).toLocaleDateString(isHindi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Text>
                          <Icon name="arrowRight" size={15} color={th.textMuted} />
                        </Pressable>
                      ))
                    ) : (
                      <Pressable style={styles.createRow} onPress={() => create(m.type, m.route)} android_ripple={{ color: th.goldFaint }}>
                        <Text style={styles.createText}>{owned ? (isHindi ? 'अपनी रिपोर्ट बनाएं' : 'Create your report') : `${isHindi ? 'पाएं' : 'Get it'} · ${priceOf(m.type)}`}</Text>
                        <Icon name="arrowRight" size={15} color={acc.color} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  sub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginBottom: Spacing.lg, lineHeight: 20 },

  group: { marginBottom: Spacing.md },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border,
  },
  thumb: { width: 52, height: 52, borderRadius: Radius.sm, backgroundColor: th.surfaceSunken },
  headTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.lg, color: th.goldLight },
  headMeta: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: 2 },

  body: { paddingTop: Spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surfaceSunken, borderRadius: Radius.sm, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border, marginBottom: Spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowText: { flex: 1, fontFamily: Fonts.bodyMedium, color: th.text, fontSize: Fonts.size.md },

  createRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: th.surfaceSunken, borderRadius: Radius.sm, paddingVertical: 13,
    borderWidth: 1, borderColor: th.border, marginBottom: Spacing.sm,
  },
  createText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.md },
});
