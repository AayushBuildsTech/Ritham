import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useActiveProfile } from '../context/ProfileContext';
import { supabase } from '../lib/supabase';
import { ProfileRow } from '../lib/kundliService';
import { generateChartReport, reportCredits, MatchPerson } from '../lib/reportService';
import { useLanguage } from '../context/LanguageContext';
import { purchasePack } from '../lib/paymentService';
import { track } from '../lib/analytics';
import { REPORT_PRICES, REPORT_META, paiseTo, isChartReport, ChartReportType } from '../config/pricing';
import { Colors, Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

// What each report covers — shown up front so the value is clear before paying.
const SCOPE: Record<ChartReportType, string[]> = {
  life: [
    'Full birth chart with all 12 houses & planetary positions',
    'Personality, mind & core self (Lagna · Moon · Sun)',
    'Career, wealth, marriage, health & family outlook',
    'Key yogas, strengths & challenges',
    'Complete Mahadasha / Antardasha timeline with interpretation',
    'Remedies and an overall life-path summary',
  ],
  career: [
    'Career direction & most suitable fields (10th house & lord)',
    'Job vs business inclination',
    'Wealth yogas & income potential (2nd / 11th)',
    'Financially strong & weak periods (dasha timing)',
    'Practical professional guidance & remedies',
  ],
  love: [
    'Your relationship nature & patterns (5th / 7th house)',
    'What you seek and need in a partner',
    'Timing of significant relationships & marriage',
    'Areas to nurture for lasting harmony',
    'Guidance & remedies for love',
  ],
  health: [
    'Constitutional tendencies from your chart',
    'Areas of wellbeing to care for',
    'Periods that ask for extra self-care',
    'Lifestyle, routine & diet guidance',
    'Gentle remedies — this is not medical advice',
  ],
  education: [
    'Academic strengths & learning style',
    'Favourable fields & streams of study',
    'Exam & competition timing (dasha)',
    'Guidance for the student and parents',
    'Remedies to strengthen focus & memory',
  ],
};

function personFromProfile(p: ProfileRow): MatchPerson | null {
  const k = p.kundli_chart;
  if (!k) return null;
  return {
    name: p.name, gender: p.gender, dob: p.dob, tob: p.tob, birth_place: p.birth_place,
    lagna: k.lagna, moon_sign: k.moon_sign, sun_sign: k.sun_sign, nakshatra: k.nakshatra,
    placements: k.placements,
  };
}

export default function ChartReportIntake() {
  const th = useColors();
  const { lang } = useLanguage();
  const styles = makeStyles(th);
  const router = useRouter();
  const { user } = useAuth();
  const { activeId } = useActiveProfile();
  const params = useLocalSearchParams<{ type: string }>();
  const type: ChartReportType = isChartReport(params.type ?? '') ? (params.type as ChartReportType) : 'life';

  const meta = REPORT_META.find((m) => m.type === type)!;
  const price = paiseTo((REPORT_PRICES as any)[type].price_paise);

  const [self, setSelf] = useState<MatchPerson | null>(null);
  const [loadingSelf, setLoadingSelf] = useState(true);
  const [busy, setBusy] = useState(false);        // validating / payment
  const [generating, setGenerating] = useState(false);

  useEffect(() => { track('report_started', { type }); }, [type]);

  useEffect(() => {
    (async () => {
      if (!user || !activeId) { if (user) setLoadingSelf(false); return; }
      const { data } = await supabase
        .from('profiles').select('*').eq('id', activeId).maybeSingle();
      if (data) setSelf(personFromProfile(data as ProfileRow));
      setLoadingSelf(false);
    })();
  }, [user, activeId]);

  async function generate() {
    if (!self || busy || generating) return;

    // fill-first, pay-at-end: only charge if there isn't already an unused credit
    setBusy(true);
    try {
      const credits = await reportCredits(type);
      if (credits < 1) {
        const pay = await purchasePack('report', type, { email: user?.email ?? '' });
        if (!pay.ok) {
          setBusy(false);
          if (pay.error !== 'cancelled') {
            Alert.alert('Payment not completed', 'Something went wrong. Please try again in a moment.');
          }
          return;
        }
        track('report_purchased', { type });
      }

      setBusy(false);
      setGenerating(true);
      const res = await generateChartReport(type, self, lang);
      setGenerating(false);

      if (res.report_id) {
        track('report_generated', { type });
        router.replace({ pathname: '/report-view', params: { id: res.report_id } });
        return;
      }
      if (res.error === 'needs_purchase') {
        Alert.alert('Purchase needed', 'Your report credit wasn’t found. Please try again from Reports.');
        return;
      }
      Alert.alert('Generation failed', 'We couldn’t generate your report just now. Please try again in a moment.');
    } catch {
      setBusy(false);
      setGenerating(false);
      Alert.alert('Something went wrong', 'Please try again in a moment.');
    }
  }

  if (loadingSelf) {
    return <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>;
  }

  if (!self) {
    return (
      <View style={styles.center}>
        <View style={styles.needCrest}><Icon name="moon" size={26} color={th.gold} /></View>
        <Text style={styles.needTitle}>Create your Kundli first</Text>
        <Text style={styles.needSub}>
          This reading is built from your birth chart. Please add your birth details, then come
          back to generate your report.
        </Text>
        <Pressable style={styles.needBtn} onPress={() => router.replace('/profile')} android_ripple={{ color: th.goldDeep }}>
          <Text style={styles.needBtnText}>Add my birth details</Text>
          <Icon name="arrowRight" size={15} color={th.goldContrast} />
        </Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.needBack}>Back</Text></Pressable>
      </View>
    );
  }

  if (generating) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={th.gold} size="large" />
        <Text style={styles.genTitle}>Casting your {meta.title}…</Text>
        <Text style={styles.genSub}>Reading your chart and computing your dasha timeline. This can take up to a minute.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={meta.title} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>{meta.desc}</Text>

        <View style={styles.selfCard}>
          <Text style={styles.selfLabel}>YOUR CHART</Text>
          <Text style={styles.selfName}>{self.name}</Text>
          <Text style={styles.selfMeta}>{self.sun_sign} Sun · Moon in {self.moon_sign} · {self.nakshatra}</Text>
        </View>

        <Text style={styles.sectionLabel}>What’s inside your report</Text>
        <View style={styles.scopeCard}>
          {SCOPE[type].map((line) => (
            <View key={line} style={styles.scopeRow}>
              <Icon name="star" size={13} color={th.gold} style={styles.scopeTick} />
              <Text style={styles.scopeText}>{line}</Text>
            </View>
          ))}
        </View>

        {type === 'health' && (
          <Text style={styles.disclaimer}>
            A gentle wellbeing reading — not medical advice, diagnosis or treatment.
          </Text>
        )}

        <Pressable style={[styles.generateBtn, busy && styles.btnDisabled]} onPress={generate} disabled={busy} android_ripple={{ color: th.goldDeep }}>
          {busy
            ? <ActivityIndicator color={th.goldContrast} />
            : <Text style={styles.generateText}>Continue · {price}</Text>}
        </Pressable>
        <Text style={styles.note}>
          Generated from your own chart. You’ll pay only once — your report is saved for unlimited re-download.
        </Text>
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  center: { flex: 1, backgroundColor: th.canvas, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },

  genTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, textAlign: 'center', marginTop: Spacing.md },
  genSub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, textAlign: 'center', lineHeight: 20 },

  needCrest: {
    width: 64, height: 64, borderRadius: Radius.pill, backgroundColor: th.goldFaint,
    borderWidth: 1, borderColor: th.border, alignItems: 'center', justifyContent: 'center',
  },
  needTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, textAlign: 'center' },
  needSub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, textAlign: 'center', lineHeight: 20 },
  needBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 13, paddingHorizontal: Spacing.xl, marginTop: Spacing.sm,
  },
  needBtnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md },
  needBack: { fontFamily: Fonts.bodyMedium, color: th.goldLight, fontSize: Fonts.size.sm, marginTop: Spacing.xs },

  lead: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, lineHeight: 20, marginTop: Spacing.xs, marginBottom: Spacing.lg },

  selfCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, padding: Spacing.lg,
    borderWidth: 1, borderColor: th.border, marginBottom: Spacing.lg, ...Depth.card,
  },
  selfLabel: { fontFamily: Fonts.bodySemibold, color: th.gold, fontSize: Fonts.size.xs, letterSpacing: 2 },
  selfName: { fontFamily: Fonts.displayBold, color: th.goldLight, fontSize: Fonts.size.xl, marginTop: 2 },
  selfMeta: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, marginTop: 2 },

  sectionLabel: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.lg, marginBottom: Spacing.sm },
  scopeCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, padding: Spacing.lg,
    borderWidth: 1, borderColor: th.border,
  },
  scopeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  scopeTick: { marginTop: 2 },
  scopeText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.sm, lineHeight: 20, flex: 1 },

  disclaimer: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.xs, marginTop: Spacing.md, lineHeight: 18, fontStyle: 'italic' },

  generateBtn: {
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 15,
    alignItems: 'center', marginTop: Spacing.xl,
  },
  generateText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.6 },
  note: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18 },
});
