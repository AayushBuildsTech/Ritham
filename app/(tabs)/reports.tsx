import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listReports, reportCredits } from '../../lib/reportService';
import { REPORT_META, paiseTo, REPORT_PRICES } from '../../config/pricing';
import { Fonts, Spacing, Radius, Depth, Accents, AccentName, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { REPORT_IMG, REPORT_ACCENT } from '../../constants/reportArt';
import { TAB_BAR_HEIGHT } from './_layout';

// Bottom-weighted dark scrim so the overlaid name + price stay legible on the art.
const SCRIM = ['rgba(6,6,12,0)', 'rgba(6,6,12,0.12)', 'rgba(7,7,15,0.78)', 'rgba(6,6,12,0.96)'] as const;

export default function ReportsScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { t, isHindi } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [reportCount, setReportCount] = useState(0);
  const [credits, setCredits] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const rs = await listReports();
    const ready = rs.filter((r) => r.status === 'ready');
    const creditEntries = await Promise.all(
      REPORT_META.map(async (m) => [m.type, await reportCredits(m.type)] as const),
    );
    const creditMap: Record<string, number> = {};
    for (const [type, count] of creditEntries) creditMap[type] = count;
    setReportCount(ready.length);
    setCredits(creditMap);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>;
  }

  const priceOf = (type: string) => {
    const p = (REPORT_PRICES as any)[type];
    return p ? paiseTo(p.price_paise) : '';
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {
        paddingTop: insets.top + Spacing.lg,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom,
      }]}
      showsVerticalScrollIndicator={false}
    >
      <Reveal index={0}>
        <Text style={styles.eyebrow}>{isHindi ? 'रिदम लाइब्रेरी' : 'THE RITHAM LIBRARY'}</Text>
        <Text style={styles.h1}>{t('reports.title')}</Text>
        <Text style={styles.sub}>{isHindi ? 'प्रीमियम, व्यक्तिगत रीडिंग — सुंदर ढंग से प्रस्तुत।' : 'Premium, personalised readings — beautifully presented.'}</Text>
      </Reveal>

      {REPORT_META.map((m, i) => {
        const acc = Accents[(REPORT_ACCENT[m.type] ?? 'gold') as AccentName];
        const owned = (credits[m.type] || 0) > 0;
        const flagship = m.type === 'life';
        return (
          <Reveal key={m.type} index={1 + i}>
            <Pressable
              style={[styles.card, { borderColor: acc.soft }]}
              onPress={() => router.push({ pathname: '/report-language' as any, params: { type: m.type, next: m.route } })}
              android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
            >
              <ImageBackground source={REPORT_IMG[m.type]} style={styles.cardImg} resizeMode="cover">
                <LinearGradient colors={SCRIM} locations={[0, 0.55, 0.85, 1]} style={StyleSheet.absoluteFill} />
                {flagship && (
                  <View style={[styles.flagChip, { backgroundColor: acc.faint, borderColor: acc.soft }]}>
                    <Text style={[styles.flagChipText, { color: acc.color }]}>{isHindi ? 'प्रमुख' : 'FLAGSHIP'}</Text>
                  </View>
                )}
                <View style={styles.cardOverlay}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{t('report.' + m.type + '.title')}</Text>
                  <View style={[styles.pricePill, { backgroundColor: acc.color }]}>
                    <Text style={styles.priceText}>{owned ? (isHindi ? 'बनाएं' : 'Create') : priceOf(m.type)}</Text>
                  </View>
                </View>
              </ImageBackground>
            </Pressable>
          </Reveal>
        );
      })}

      {/* Your Reports → dedicated history page */}
      <Reveal index={1 + REPORT_META.length}>
        <Pressable
          style={styles.yourReportsBtn}
          onPress={() => router.push('/my-reports' as any)}
          android_ripple={{ color: th.goldFaint }}
        >
          <Icon name="document" size={17} color={th.goldLight} />
          <Text style={styles.yourReportsText}>
            {isHindi ? 'आपकी रिपोर्ट' : 'Your Reports'}{reportCount > 0 ? ` (${reportCount})` : ''}
          </Text>
          <Icon name="arrowRight" size={16} color={th.textMuted} />
        </Pressable>
      </Reveal>

      <Reveal index={2 + REPORT_META.length}>
        <View style={styles.secureRow}>
          <Icon name="lock" size={13} color={th.textDim} />
          <Text style={styles.secureNote}>{isHindi ? 'रिपोर्ट निजी रूप से बनाई जाती हैं और असीमित पुनः-डाउनलोड के लिए सहेजी जाती हैं।' : 'Reports are generated privately and stored for unlimited re-download.'}</Text>
        </View>
      </Reveal>

      {__DEV__ && (
        <Pressable
          onPress={() => router.push('/report-view?preview=career' as any)}
          style={{ marginTop: Spacing.md, alignSelf: 'center', padding: Spacing.sm }}
        >
          <Text style={{ color: th.textDim, fontSize: 12, fontFamily: Fonts.body }}>Preview renderer · Career (dev)</Text>
        </Pressable>
      )}

      <View style={{ height: Spacing.xl }} />
    </ScrollView>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, backgroundColor: th.canvas, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.lg },
  eyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2.5, marginBottom: 6 },
  h1: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.hero, color: th.text },
  sub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: 4, marginBottom: Spacing.lg },

  card: { borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, marginBottom: Spacing.lg, ...Depth.card },
  cardImg: { width: '100%', aspectRatio: 1, justifyContent: 'flex-end' },
  flagChip: {
    position: 'absolute', top: Spacing.md, left: Spacing.md,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1,
  },
  flagChipText: { fontFamily: Fonts.bodyBold, fontSize: 10, letterSpacing: 1.5 },
  cardOverlay: { padding: Spacing.lg },
  cardTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: '#FFFFFF', letterSpacing: 0.2, lineHeight: 30, marginBottom: Spacing.sm },
  pricePill: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  priceText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: th.goldContrast, letterSpacing: 0.3 },

  yourReportsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, paddingVertical: 16, paddingHorizontal: Spacing.lg,
    borderWidth: 1, borderColor: th.border, marginTop: Spacing.xs,
  },
  yourReportsText: { flex: 1, fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.md },

  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.lg },
  secureNote: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center' },
});
