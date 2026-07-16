import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getHoroscope, HoroscopePeriod } from '../lib/horoscopeService';
import { track } from '../lib/analytics';
import { Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { HeroBanner } from '../components/HeroBanner';
import { signBanner } from '../constants/appArt';

const PERIOD_IDS: HoroscopePeriod[] = ['daily', 'weekly', 'monthly'];

export default function HoroscopeScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { t, isHindi, lang } = useLanguage();
  const periodLabel = (id: HoroscopePeriod) => t('home.' + id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId, moonSign } = useLocalSearchParams<{ profileId: string; moonSign?: string }>();

  const [period, setPeriod] = useState<HoroscopePeriod>('daily');
  // per-period cache so switching tabs doesn't refetch
  const [texts, setTexts] = useState<Partial<Record<HoroscopePeriod, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<HoroscopePeriod, string>>>({});
  const [loadingPeriod, setLoadingPeriod] = useState<HoroscopePeriod | null>(null);

  useEffect(() => {
    if (!profileId) return;
    if (texts[period] !== undefined || loadingPeriod === period) return;
    let cancelled = false;
    (async () => {
      setLoadingPeriod(period);
      const res = await getHoroscope(profileId, period, lang);
      if (cancelled) return;
      if (res.body) setTexts((t) => ({ ...t, [period]: res.body! }));
      else setErrors((e) => ({ ...e, [period]: res.error ?? 'request_failed' }));
      setLoadingPeriod((lp) => (lp === period ? null : lp));
    })();
    return () => { cancelled = true; };
  }, [profileId, period]); // eslint-disable-line react-hooks/exhaustive-deps

  function retry(p: HoroscopePeriod) {
    setErrors((e) => ({ ...e, [p]: undefined }));
    setTexts((t) => { const c = { ...t }; delete c[p]; return c; }); // triggers refetch
  }

  async function shareHoroscope() {
    const body = texts[period];
    if (!body) return;
    const label = periodLabel(period);
    const who = moonSign ? ` (${moonSign})` : '';
    const msg = [
      isHindi ? `${label} राशिफल${who} — Ritham` : `${label} Horoscope${who} — Ritham`,
      '',
      body,
      '',
      isHindi ? 'Ritham पर अपना व्यक्तिगत वैदिक राशिफल पाएं:' : 'Get your personalised Vedic horoscope on Ritham:',
      'https://ritham.netlify.app',
    ].join('\n');
    try {
      await Share.share({ message: msg });
      track('horoscope_shared', { period });
    } catch { /* user dismissed the share sheet */ }
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          android_ripple={{ color: th.goldFaint, borderless: true, radius: 20 }}
        >
          <Icon name="back" size={20} color={th.gold} />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        <Text style={styles.eyebrow}>{isHindi ? 'आपका राशिफल' : 'YOUR HOROSCOPE'}</Text>
        <Text style={styles.h1}>{isHindi ? 'तारे, आपके लिए' : 'The stars, for you'}</Text>

        {signBanner(moonSign) && (
          <HeroBanner source={signBanner(moonSign)} blend style={{ marginBottom: Spacing.lg }} />
        )}

        {/* underline segmented control */}
        <View style={styles.segment}>
          {PERIOD_IDS.map((id) => {
            const active = period === id;
            return (
              <Pressable key={id} style={styles.segmentBtn} onPress={() => setPeriod(id)}>
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{periodLabel(id)}</Text>
                <View style={[styles.segmentRule, active && styles.segmentRuleActive]} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          {loadingPeriod === period ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={th.gold} />
              <Text style={styles.muted}>{isHindi ? 'तारे पढ़ रहे हैं…' : 'Reading the stars…'}</Text>
            </View>
          ) : errors[period] ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.muted}>{isHindi ? 'अभी आपका राशिफल लोड नहीं हो सका।' : 'Couldn’t load your horoscope right now.'}</Text>
              <Pressable style={styles.retryBtn} onPress={() => retry(period)}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.quoteMark}>“</Text>
              <Text style={styles.body}>{texts[period]}</Text>
              <Pressable style={styles.shareRow} onPress={shareHoroscope} android_ripple={{ color: th.goldFaint }}>
                <Icon name="share" size={15} color={th.goldLight} />
                <Text style={styles.shareText}>{isHindi ? 'साझा करें' : 'Share'}</Text>
              </Pressable>
            </>
          )}
        </View>

        <Text style={styles.disclaimer}>
          {isHindi ? 'राशिफल मार्गदर्शन और चिंतन के लिए हैं, यह पेशेवर सलाह का विकल्प नहीं हैं।' : 'Horoscopes are for guidance and reflection, not a substitute for professional advice.'}
        </Text>
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  scroll: { padding: Spacing.lg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  backText: { fontFamily: Fonts.bodyMedium, color: th.gold, fontSize: Fonts.size.md },

  eyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2.5, marginBottom: 6 },
  h1: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.hero, color: th.text, marginBottom: Spacing.lg },

  segment: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.md },
  segmentBtn: { alignItems: 'center' },
  segmentText: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.md, color: th.textDim, paddingBottom: 6 },
  segmentTextActive: { color: th.text },
  segmentRule: { height: 2, width: 22, borderRadius: 2, backgroundColor: 'transparent' },
  segmentRuleActive: { backgroundColor: th.gold },

  card: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.border,
    padding: Spacing.xl, minHeight: 160, ...Depth.card,
  },
  quoteMark: { fontFamily: Fonts.displayBold, fontSize: 44, color: th.goldFaint, height: 34, lineHeight: 52 },
  body: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.text, lineHeight: 25 },
  muted: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: Spacing.sm },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.lg },
  retryBtn: {
    marginTop: Spacing.md, borderWidth: 1, borderColor: th.borderStrong, borderRadius: Radius.sm,
    paddingVertical: 8, paddingHorizontal: 18,
  },
  retryText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.sm },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 6,
    marginTop: Spacing.lg, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: th.borderStrong, borderRadius: Radius.pill,
  },
  shareText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.sm },
  disclaimer: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, lineHeight: 16, marginTop: Spacing.lg, textAlign: 'center' },
});
