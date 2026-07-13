import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listReports, reportCredits, ReportRow, ReportType } from '../../lib/reportService';
import { REPORT_META, REPORT_GROUPS, paiseTo, REPORT_PRICES } from '../../config/pricing';
import { Colors, Fonts, Spacing, Radius, Depth, Accents, AccentName, accentCardGradient, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { Icon, IconName } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { GradientCard } from '../../components/GradientCard';
import { TAB_BAR_HEIGHT } from './_layout';

// Hindi one-line descriptions per report type (English lives in REPORT_META).
const REPORT_DESC_HI: Record<string, string> = {
  life: 'आपका पूरा जीवन विश्लेषण — सभी 12 भाव, ग्रह, योग, महादशा समयरेखा और उपाय।',
  career: '10वें भाव और धन का विश्लेषण, उपयुक्त क्षेत्र, नौकरी बनाम व्यवसाय, शुभ करियर अवधि।',
  love: 'आपके संबंधों की प्रवृत्ति, समय, और साथी में क्या तलाशें — 5वें और 7वें भाव से।',
  health: 'शारीरिक प्रवृत्तियां, ध्यान देने योग्य क्षेत्र, और कोमल जीवनशैली मार्गदर्शन। चिकित्सा सलाह नहीं।',
  education: 'शुभ अध्ययन क्षेत्र, शैक्षणिक शक्तियां, परीक्षा का समय — विद्यार्थियों और अभिभावकों के लिए।',
  vastu: 'कमरे-दर-कमरे वास्तु परामर्श के लिए अपना फ्लोर प्लान अपलोड करें — स्कोर और उपायों के साथ।',
  matchmaking: 'साथी के साथ अष्टकूट गुण मिलान — 36-गुण स्कोर, दोष, दोनों कुंडलियां, उपाय।',
};

// map report type → thin-line icon (replaces the emoji in REPORT_META)
const REPORT_ICON: Record<string, IconName> = {
  vastu: 'compass',
  matchmaking: 'heart',
  life: 'star',
  career: 'briefcase',
  love: 'heart',
  health: 'activity',
  education: 'graduation',
};

// map report type → jewel accent for its icon chip
const REPORT_ACCENT: Record<string, AccentName> = {
  life: 'gold',
  career: 'sapphire',
  love: 'ruby',
  health: 'emerald',
  education: 'amethyst',
  vastu: 'saffron',
  matchmaking: 'ruby',
};

export default function ReportsScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { t, isHindi } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<ReportType | null>(null);

  const load = useCallback(async () => {
    const [rs] = await Promise.all([listReports()]);
    const ready = rs.filter((r) => r.status === 'ready');

    const creditEntries = await Promise.all(
      REPORT_META.map(async (m) => [m.type, await reportCredits(m.type)] as const),
    );
    const creditMap: Record<string, number> = {};
    for (const [type, count] of creditEntries) creditMap[type] = count;

    setReports(ready);
    setCredits(creditMap);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>;
  }

  const pastByType = reports.reduce<Record<string, ReportRow[]>>((acc, r) => {
    const list = acc[r.type] || (acc[r.type] = []);
    list.push(r);
    return acc;
  }, {});

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

      {REPORT_GROUPS.map((group, gi) => {
        const items = REPORT_META.filter((m) => m.group === group.key);
        if (items.length === 0) return null;
        return (
          <View key={group.key} style={styles.groupSection}>
            <Reveal index={gi + 1}>
              <Text style={styles.groupLabel}>{t('reports.group.' + group.key)}</Text>
            </Reveal>
            {items.map((meta) => {
              const priceObj = (REPORT_PRICES as any)[meta.type];
              const price = priceObj ? paiseTo(priceObj.price_paise) : '';
              const hasCredits = (credits[meta.type] || 0) > 0;
              const pastReports = pastByType[meta.type] || [];
              const flagship = meta.group === 'flagship';
              const acc = Accents[REPORT_ACCENT[meta.type] ?? 'gold'];

              const inner = (
                <>
                  <View style={styles.cardHead}>
                    <View style={[styles.cardIcon, { backgroundColor: acc.faint, borderWidth: 1, borderColor: acc.soft }]}>
                      <Icon name={REPORT_ICON[meta.type] ?? 'document'} size={22} color={acc.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle}>{t('report.' + meta.type + '.title')}</Text>
                        {flagship && <Text style={styles.flagBadge}>{isHindi ? 'प्रमुख' : 'FLAGSHIP'}</Text>}
                      </View>
                      <Text style={styles.cardDesc}>{isHindi ? (REPORT_DESC_HI[meta.type] ?? meta.desc) : meta.desc}</Text>
                    </View>
                  </View>

                  {pastReports.length > 0 && (
                    <>
                      <Pressable
                        style={styles.myReportsBtn}
                        onPress={() => setOpen((o) => (o === meta.type ? null : meta.type as any))}
                        android_ripple={{ color: th.goldFaint }}
                      >
                        <View style={styles.rowGap}>
                          <Icon name="document" size={15} color={th.goldLight} />
                          <Text style={styles.myReportsText}>{t('reports.myReports')} ({pastReports.length})</Text>
                        </View>
                        <Icon name={open === meta.type ? 'chevronUp' : 'chevronDown'} size={16} color={th.textMuted} />
                      </Pressable>

                      {open === meta.type && pastReports.map((r) => (
                        <Pressable
                          key={r.id}
                          style={styles.reportRow}
                          onPress={() => router.push({ pathname: '/report-view', params: { id: r.id } })}
                          android_ripple={{ color: th.goldFaint }}
                        >
                          <Text style={styles.reportRowText} numberOfLines={1}>
                            {t('report.' + meta.type + '.title')}{r.score != null ? ` · ${r.score}${meta.type === 'matchmaking' ? '%' : '/100'}` : ''}
                          </Text>
                          <Text style={styles.reportRowDate}>{new Date(r.created_at).toLocaleDateString(isHindi ? 'hi-IN' : 'en-IN')}</Text>
                        </Pressable>
                      ))}
                    </>
                  )}

                  <Pressable
                    style={[styles.primaryBtn, flagship && styles.primaryBtnFlagship]}
                    onPress={() => router.push({ pathname: meta.route as any, params: { type: meta.type } })}
                    android_ripple={{ color: th.goldDeep }}
                  >
                    <Text style={styles.primaryBtnText}>
                      {hasCredits ? t('reports.generate') : `${t('reports.buy')} · ${price}`}
                    </Text>
                    <Icon name="arrowRight" size={15} color={th.goldContrast} />
                  </Pressable>
                </>
              );

              return (
                <Reveal key={meta.type} index={gi + 1}>
                  {flagship ? (
                    <GradientCard colors={accentCardGradient(th, 'gold')} borderColor={th.borderStrong} style={styles.cardPad}>
                      {inner}
                    </GradientCard>
                  ) : (
                    <View style={styles.card}>{inner}</View>
                  )}
                </Reveal>
              );
            })}
          </View>
        );
      })}

      <Reveal index={9}>
        <View style={styles.secureRow}>
          <Icon name="lock" size={13} color={th.textDim} />
          <Text style={styles.secureNote}>{isHindi ? 'रिपोर्ट निजी रूप से बनाई जाती हैं और असीमित पुनः-डाउनलोड के लिए सहेजी जाती हैं।' : 'Reports are generated privately and stored for unlimited re-download.'}</Text>
        </View>
      </Reveal>
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

  groupSection: { marginBottom: Spacing.lg },
  groupLabel: {
    fontFamily: Fonts.bodySemibold, color: th.textMuted, fontSize: Fonts.size.xs,
    letterSpacing: 2, marginBottom: Spacing.sm, textTransform: 'uppercase',
  },

  card: {
    backgroundColor: th.surface, borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 1, borderColor: th.border, marginBottom: Spacing.md, ...Depth.card,
  },
  cardPad: { padding: Spacing.lg, marginBottom: Spacing.md },
  cardFlagship: { borderColor: th.borderStrong },
  cardHead: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  cardIcon: {
    width: 46, height: 46, borderRadius: Radius.sm,
    backgroundColor: th.goldFaint, alignItems: 'center', justifyContent: 'center',
  },
  cardIconFlagship: { borderWidth: 1, borderColor: th.borderStrong },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4, flexWrap: 'wrap' },
  cardTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.goldLight },
  flagBadge: {
    fontFamily: Fonts.bodyBold, color: th.goldContrast, backgroundColor: th.goldSurface, fontSize: 9,
    letterSpacing: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden',
  },
  cardDesc: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 20 },

  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  myReportsBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: th.surfaceSunken, borderRadius: Radius.sm, paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: th.border, marginBottom: Spacing.sm,
  },
  myReportsText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.sm },

  reportRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: th.surfaceSunken, borderRadius: Radius.sm, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border, marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  reportRowText: { flex: 1, fontFamily: Fonts.bodyMedium, color: th.text, fontSize: Fonts.size.md },
  reportRowDate: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 14, marginTop: Spacing.xs,
  },
  primaryBtnFlagship: { paddingVertical: 16 },
  primaryBtnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },

  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.md },
  secureNote: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center' },
});
