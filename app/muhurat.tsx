import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getMuhurats, MuhuratResult } from '../lib/muhuratService';
import { MUHURAT_ACTIVITIES, activityById, FunnelTarget } from '../config/muhuratRules';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { hiNakshatra } from '../lib/astroHindi';
import { Icon, IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { HeroBanner } from '../components/HeroBanner';
import { FEATURE_BANNER } from '../constants/appArt';
import { Reveal } from '../components/Reveal';

// activity id → thin-line icon (replaces the emoji in MUHURAT_ACTIVITIES)
const ACTIVITY_ICON: Record<string, IconName> = {
  griha_pravesh: 'home',
  marriage: 'heart',
  vehicle: 'car',
  business: 'briefcase',
  naming: 'star',
  property: 'compass',
  travel: 'plane',
};

export default function MuhuratScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { t, isHindi } = useLanguage();
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [activity, setActivity] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [result, setResult] = useState<MuhuratResult | null>(null);

  useEffect(() => { track('muhurat_opened'); }, []);

  async function pick(id: string) {
    track('muhurat_activity_selected', { activity: id });
    setActivity(id);
    setState('loading');
    setResult(null);
    if (!profileId) { setState('error'); return; }
    const res = await getMuhurats(profileId, id);
    if (res.error) { setState('error'); return; }
    setResult(res);
    setState('ready');
    track('muhurat_results_viewed', { activity: id });
  }

  function goFunnel(target: FunnelTarget) {
    track('muhurat_funnel_clicked', { target });
    if (target === 'vastu') router.push('/report-vastu');
    else if (target === 'matchmaking') router.push('/report-matchmaking');
    else router.push('/(tabs)/chat');
  }

  const current = activity ? activityById(activity) : null;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('muhurat.title')}
        onBack={() => (current ? (setActivity(null), setState('idle')) : router.back())}
      />

      {/* ── Activity picker ─────────────────────────────────────────────────── */}
      {!current ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <HeroBanner source={FEATURE_BANNER.muhurat} style={{ marginBottom: Spacing.lg }} />
          <Text style={styles.lead}>{isHindi ? 'शुभ तिथियां खोजें…' : 'Find auspicious dates for…'}</Text>
          {MUHURAT_ACTIVITIES.map((a, i) => (
            <Reveal key={a.id} index={i}>
              <Pressable style={styles.activityRow} android_ripple={{ color: th.goldFaint }} onPress={() => pick(a.id)}>
                <View style={styles.activityIcon}>
                  <Icon name={ACTIVITY_ICON[a.id] ?? 'calendar'} size={20} color={Accents.emerald.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityLabel}>{a.hindi} <Text style={styles.activityEn}>({a.label})</Text></Text>
                </View>
                <Icon name="chevron" size={20} color={th.textDim} />
              </Pressable>
            </Reveal>
          ))}
          <Text style={styles.disclaimer}>
            {isHindi
              ? 'मुहूर्त सुझाव केवल मार्गदर्शन के लिए पंचांग से गणना किए जाते हैं। महत्वपूर्ण अवसरों के लिए, कृपया समय की पुष्टि अपने परिवार के पंडित या ज्योतिषी से करें।'
              : 'Muhurat suggestions are computed from Panchang for guidance only. For important events, please confirm the timing with your family priest or astrologer.'}
          </Text>
        </ScrollView>
      ) : (
        /* ── Results ──────────────────────────────────────────────────────── */
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.resultTitleRow}>
            <Icon name={ACTIVITY_ICON[current.id] ?? 'calendar'} size={20} color={Accents.emerald.color} />
            <Text style={styles.resultTitle}>{current.hindi} <Text style={styles.activityEn}>({current.label})</Text></Text>
          </View>
          {result?.place ? <Text style={styles.resultSub}>{isHindi ? `${result.place} के पास · अगले ${result?.end && result?.start ? daysLabel(result.start, result.end, true) : '45 दिन'}` : `Near ${result.place} · next ${result?.end && result?.start ? daysLabel(result.start, result.end) : '45 days'}`}</Text> : null}

          {state === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={th.gold} size="large" />
              <Text style={styles.loadingText}>{isHindi ? 'पंचांग खोज रहे हैं…' : 'Scanning the Panchang…'}</Text>
            </View>
          ) : state === 'error' ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{isHindi ? 'अभी मुहूर्त लोड नहीं हो सके।' : 'Couldn’t load muhurats right now.'}</Text>
              <Pressable style={styles.retryBtn} onPress={() => pick(current.id)}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : result && result.results && result.results.length > 0 ? (
            <>
              {result.results.map((r, i) => (
                <Reveal key={r.date} index={i}>
                  <View style={styles.dayCard}>
                    <View style={styles.dayHead}>
                      <Text style={styles.dayDate}>{fmtDate(r.date)}</Text>
                      <Text style={styles.dayWeekday}>{r.weekday}</Text>
                    </View>
                    <View style={styles.windowPill}>
                      <Icon name="star" size={12} color={th.success} />
                      <Text style={styles.windowText}>{r.window}</Text>
                    </View>
                    <Text style={styles.factors}>
                      {isHindi ? `${hiNakshatra(r.nakshatra)} नक्षत्र · ${r.tithi} · ${r.yoga} योग` : `${r.nakshatra} nakshatra · ${r.tithi} · ${r.yoga} yoga`}
                    </Text>
                  </View>
                </Reveal>
              ))}

              {/* Soft funnel toward the matching paid product / chat */}
              <View style={styles.hookCard}>
                <Text style={styles.hookText}>{current.funnel.text}</Text>
                <Pressable style={styles.hookBtn} onPress={() => goFunnel(current.funnel.target)} android_ripple={{ color: th.goldDeep }}>
                  <Text style={styles.hookBtnText}>{funnelCta(current.funnel.target, isHindi)}</Text>
                  <Icon name="arrowRight" size={15} color={th.goldContrast} />
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.center}>
              <Text style={styles.errorText}>{isHindi ? 'इस अवधि में कोई विशेष शुभ तिथि नहीं मिली।' : 'No strongly auspicious dates found in this window.'}</Text>
              <Text style={styles.emptyHint}>{isHindi ? 'बाद में फिर कोशिश करें, या व्यक्तिगत मुहूर्त के लिए ज्योतिषी से पूछें।' : 'Try again later, or ask the astrologer for a personalised muhurat.'}</Text>
              <Pressable style={styles.retryBtn} onPress={() => goFunnel('chat')}>
                <Text style={styles.retryText}>{isHindi ? 'ज्योतिषी से पूछें' : 'Ask the astrologer'}</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.disclaimer}>
            {isHindi
              ? 'केवल मार्गदर्शन के लिए पंचांग से गणना। महत्वपूर्ण मुहूर्त की पुष्टि किसी पंडित या ज्योतिषी से करें।'
              : 'Computed from Panchang for guidance only. Please confirm important muhurats with a priest or astrologer.'}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function funnelCta(t: FunnelTarget, isHindi = false): string {
  if (isHindi) {
    return t === 'vastu' ? 'वास्तु रिपोर्ट लें' : t === 'matchmaking' ? 'मिलान रिपोर्ट लें' : 'ज्योतिषी से पूछें';
  }
  return t === 'vastu' ? 'Get a Vastu report' : t === 'matchmaking' ? 'Get a Matchmaking report' : 'Ask the astrologer';
}
function daysLabel(start: string, end: string, isHindi = false): string {
  const n = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
  return isHindi ? `${n} दिन` : `${n} days`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  lead: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, marginBottom: Spacing.md },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border, marginBottom: Spacing.sm,
  },
  activityIcon: {
    width: 44, height: 44, borderRadius: Radius.sm,
    backgroundColor: Accents.emerald.faint, borderWidth: 1, borderColor: Accents.emerald.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  activityLabel: { fontFamily: Fonts.bodySemibold, color: th.text, fontSize: Fonts.size.md },
  activityEn: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm },

  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  resultTitle: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.xl },
  resultSub: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, marginTop: 4, marginBottom: Spacing.md },

  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  loadingText: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm },
  errorText: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, textAlign: 'center' },
  emptyHint: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.sm, textAlign: 'center', paddingHorizontal: Spacing.lg },

  dayCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    padding: Spacing.md, marginBottom: Spacing.sm, ...Depth.card,
  },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  dayDate: { fontFamily: Fonts.displayBold, color: th.goldLight, fontSize: Fonts.size.lg },
  dayWeekday: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm },
  windowPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', backgroundColor: th.surfaceSunken, borderRadius: Radius.sm,
    paddingVertical: 4, paddingHorizontal: Spacing.sm, marginTop: Spacing.sm,
    borderWidth: 1, borderColor: th.border,
  },
  windowText: { fontFamily: Fonts.bodyMedium, color: th.success, fontSize: Fonts.size.sm },
  factors: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, marginTop: Spacing.sm },

  retryBtn: {
    marginTop: Spacing.sm, borderWidth: 1, borderColor: th.borderStrong, borderRadius: Radius.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
  },
  retryText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.sm },

  hookCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.lg, marginTop: Spacing.md, alignItems: 'center', gap: Spacing.md,
  },
  hookText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  hookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 12, paddingHorizontal: Spacing.xl,
  },
  hookBtnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md },

  disclaimer: {
    fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, lineHeight: 17,
    textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.sm,
  },
});
