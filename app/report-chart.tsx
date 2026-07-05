import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ProfileRow } from '../lib/kundliService';
import { generateChartReport, reportCredits, MatchPerson } from '../lib/reportService';
import { purchasePack } from '../lib/paymentService';
import { track } from '../lib/analytics';
import { REPORT_PRICES, REPORT_META, paiseTo, isChartReport, ChartReportType } from '../config/pricing';
import { Colors, Fonts, Spacing } from '../constants/theme';

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
  const router = useRouter();
  const { user } = useAuth();
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
      if (!user) return;
      const { data } = await supabase
        .from('profiles').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (data) setSelf(personFromProfile(data as ProfileRow));
      setLoadingSelf(false);
    })();
  }, [user]);

  async function generate() {
    if (!self || busy || generating) return;

    // fill-first, pay-at-end: only charge if there isn't already an unused credit
    setBusy(true);
    try {
      const credits = await reportCredits(type);
      if (credits < 1) {
        const pay = await purchasePack('report', type, { contact: user?.phone ?? '' });
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
      const res = await generateChartReport(type, self);
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
    return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;
  }

  if (!self) {
    return (
      <View style={styles.center}>
        <Text style={styles.needIcon}>✦</Text>
        <Text style={styles.needTitle}>Create your Kundli first</Text>
        <Text style={styles.needSub}>
          This reading is built from your birth chart. Please add your birth details, then come
          back to generate your report.
        </Text>
        <TouchableOpacity style={styles.needBtn} onPress={() => router.replace('/profile')}>
          <Text style={styles.needBtnText}>Add my birth details →</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.needBack}>Back</Text></TouchableOpacity>
      </View>
    );
  }

  if (generating) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.gold} size="large" />
        <Text style={styles.genTitle}>Casting your {meta.title}…</Text>
        <Text style={styles.genSub}>Reading your chart and computing your dasha timeline. This can take up to a minute.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.title}>{meta.icon} {meta.title}</Text>
        <View style={{ width: 48 }} />
      </View>

      <Text style={styles.lead}>{meta.desc}</Text>

      <View style={styles.selfCard}>
        <Text style={styles.selfLabel}>YOUR CHART</Text>
        <Text style={styles.selfName}>{self.name}</Text>
        <Text style={styles.selfMeta}>☀ {self.sun_sign} · 🌙 Moon in {self.moon_sign} · {self.nakshatra}</Text>
      </View>

      <Text style={styles.sectionLabel}>What’s inside your report</Text>
      <View style={styles.scopeCard}>
        {SCOPE[type].map((line) => (
          <View key={line} style={styles.scopeRow}>
            <Text style={styles.scopeTick}>✦</Text>
            <Text style={styles.scopeText}>{line}</Text>
          </View>
        ))}
      </View>

      {type === 'health' && (
        <Text style={styles.disclaimer}>
          🌿 A gentle wellbeing reading — not medical advice, diagnosis or treatment.
        </Text>
      )}

      <TouchableOpacity style={[styles.generateBtn, busy && styles.btnDisabled]} onPress={generate} disabled={busy}>
        {busy
          ? <ActivityIndicator color={Colors.bg} />
          : <Text style={styles.generateText}>Continue · {price}</Text>}
      </TouchableOpacity>
      <Text style={styles.note}>
        Generated from your own chart. You’ll pay only once — your report is saved for unlimited re-download.
      </Text>
      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingTop: 52, paddingBottom: Spacing.xxl },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },

  genTitle: { fontSize: Fonts.size.lg, color: Colors.text, fontWeight: '700', textAlign: 'center', marginTop: Spacing.md },
  genSub: { fontSize: Fonts.size.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  needIcon: { fontSize: 44, color: Colors.gold },
  needTitle: { fontSize: Fonts.size.xl, color: Colors.text, fontWeight: '700', textAlign: 'center' },
  needSub: { fontSize: Fonts.size.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  needBtn: { backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, marginTop: Spacing.sm },
  needBtnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
  needBack: { color: Colors.goldLight, fontSize: Fonts.size.sm, marginTop: Spacing.xs },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  back: { color: Colors.goldLight, fontSize: Fonts.size.md, width: 48 },
  title: { color: Colors.text, fontSize: Fonts.size.lg, fontWeight: '700', flex: 1, textAlign: 'center' },
  lead: { color: Colors.textMuted, fontSize: Fonts.size.sm, lineHeight: 20, marginBottom: Spacing.lg },

  selfCard: {
    backgroundColor: Colors.bgCard, borderRadius: 12, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg,
  },
  selfLabel: { color: Colors.textDim, fontSize: Fonts.size.xs, letterSpacing: 1, fontWeight: '700' },
  selfName: { color: Colors.goldLight, fontSize: Fonts.size.lg, fontWeight: '700', marginTop: 2 },
  selfMeta: { color: Colors.textMuted, fontSize: Fonts.size.sm, marginTop: 2 },

  sectionLabel: { color: Colors.text, fontSize: Fonts.size.md, fontWeight: '700', marginBottom: Spacing.sm },
  scopeCard: {
    backgroundColor: Colors.bgCard, borderRadius: 12, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  scopeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  scopeTick: { color: Colors.gold, fontSize: Fonts.size.sm, marginTop: 1 },
  scopeText: { color: Colors.text, fontSize: Fonts.size.sm, lineHeight: 20, flex: 1 },

  disclaimer: { color: Colors.textMuted, fontSize: Fonts.size.xs, marginTop: Spacing.md, lineHeight: 18 },

  generateBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: Spacing.md,
    alignItems: 'center', marginTop: Spacing.xl,
  },
  generateText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  note: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18 },
});
