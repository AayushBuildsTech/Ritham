import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { computeKundli, ProfileRow, BirthProfile } from '../lib/kundliService';
import { generateMatchmaking, reportCredits, MatchPerson, ChartStyle } from '../lib/reportService';
import { purchasePack } from '../lib/paymentService';
import { track } from '../lib/analytics';
import { REPORT_PRICES, paiseTo } from '../config/pricing';
import { CITIES } from '../constants/cities';
import { searchPlaces, GeoPlace } from '../lib/geocoding';
import { SelectModal, Option } from '../components/SelectModal';
import { Colors, Fonts, Spacing, Radius, Depth } from '../constants/theme';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const CURRENT_YEAR = new Date().getFullYear();
const pad2 = (n: number | string) => String(n).padStart(2, '0');

type Gender = 'male' | 'female' | 'other';
type ModalKind = 'day' | 'month' | 'year' | 'hour' | 'minute' | 'ampm' | 'city' | null;
interface SelectedPlace { name: string; lat: number; lon: number; tz: string }

// build the MatchPerson payload the Edge Function expects from a cached profile chart
function personFromProfile(p: ProfileRow): MatchPerson | null {
  const k = p.kundli_chart;
  if (!k) return null;
  return {
    name: p.name, gender: p.gender, dob: p.dob, tob: p.tob, birth_place: p.birth_place,
    lagna: k.lagna, moon_sign: k.moon_sign, sun_sign: k.sun_sign, nakshatra: k.nakshatra,
    placements: k.placements,
  };
}

export default function MatchmakingIntake() {
  const router = useRouter();
  const { user } = useAuth();

  const [self, setSelf] = useState<MatchPerson | null>(null);
  const [loadingSelf, setLoadingSelf] = useState(true);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);      // validating / payment step
  const [generating, setGenerating] = useState(false); // report generation

  // partner fields
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [ampm, setAmpm] = useState('');
  const [city, setCity] = useState('');
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [chartStyle, setChartStyle] = useState<ChartStyle>('north');

  useEffect(() => { track('report_started', { type: 'matchmaking' }); }, []);

  // ── load the user's own chart (needed for both sides of the match) ──────────
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

  // ── picker options ──────────────────────────────────────────────────────────
  const dayOpts: Option[] = useMemo(
    () => Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) })), []);
  const monthOpts: Option[] = useMemo(
    () => MONTHS.map((m, i) => ({ label: m, value: String(i + 1) })), []);
  const yearOpts: Option[] = useMemo(
    () => Array.from({ length: CURRENT_YEAR - 1919 }, (_, i) => {
      const y = CURRENT_YEAR - i; return { label: String(y), value: String(y) };
    }), []);
  const hourOpts: Option[] = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) })), []);
  const minuteOpts: Option[] = useMemo(
    () => Array.from({ length: 60 }, (_, i) => ({ label: pad2(i), value: String(i) })), []);
  const cityOpts: Option[] = useMemo(
    () => CITIES.map((c) => ({
      label: c.name, value: `${c.name}|${c.lat}|${c.lon}`, sublabel: c.state,
      data: { name: c.name, lat: c.lat, lon: c.lon, tz: c.tz } as SelectedPlace,
    })), []);

  const cityRemoteSearch = async (q: string): Promise<Option[]> => {
    const places = await searchPlaces(q);
    return places.map((p: GeoPlace) => ({
      label: p.name, value: `${p.name}|${p.lat}|${p.lon}`, sublabel: p.region,
      data: { name: p.name, lat: p.lat, lon: p.lon, tz: p.tz } as SelectedPlace,
    }));
  };
  const onSelectCity = (_v: string, option?: Option) => {
    const p = option?.data as SelectedPlace | undefined;
    if (p) { setPlace(p); setCity(p.name); }
  };
  const monthLabel = month ? MONTHS[Number(month) - 1] : '';

  // ── generate ────────────────────────────────────────────────────────────────
  async function generate() {
    if (!self || busy || generating) return;
    if (!name.trim()) { Alert.alert('Almost there', 'Please enter your partner’s name.'); return; }
    if (!gender) { Alert.alert('Almost there', 'Please select your partner’s gender.'); return; }
    if (!day || !month || !year) { Alert.alert('Almost there', 'Please select the full date of birth.'); return; }
    if (!hour || !minute || !ampm) { Alert.alert('Almost there', 'Please select the time of birth.'); return; }
    if (!place) { Alert.alert('Almost there', 'Please select the birth place.'); return; }

    const y = Number(year), m = Number(month), d = Number(day);
    const test = new Date(y, m - 1, d);
    if (test.getFullYear() !== y || test.getMonth() !== m - 1 || test.getDate() !== d) {
      Alert.alert('Check the date', 'That date does not exist. Please check the day and month.');
      return;
    }
    let hh = Number(hour) % 12;
    if (ampm === 'PM') hh += 12;

    const birth: BirthProfile = {
      name: name.trim(), gender: gender as Gender,
      dob: `${y}-${pad2(m)}-${pad2(d)}`, tob: `${pad2(hh)}:${pad2(Number(minute))}:00`,
      birth_place: place.name, latitude: place.lat, longitude: place.lon, timezone: place.tz,
    };

    // fill-first, pay-at-end: only charge if there isn't already an unused credit
    setBusy(true);
    try {
      const credits = await reportCredits('matchmaking');
      if (credits < 1) {
        const pay = await purchasePack('report', 'matchmaking', { contact: user?.phone ?? '' });
        if (!pay.ok) {
          setBusy(false);
          if (pay.error !== 'cancelled') {
            Alert.alert('Payment not completed', 'Something went wrong. Please try again in a moment.');
          }
          return;
        }
        track('report_purchased', { type: 'matchmaking' });
      }

      setBusy(false);
      setGenerating(true);
      const k = await computeKundli(birth); // partner chart via the single service (rule #1)
      const partner: MatchPerson = {
        name: birth.name, gender: birth.gender, dob: birth.dob, tob: birth.tob,
        birth_place: birth.birth_place,
        lagna: k.lagna, moon_sign: k.moon_sign, sun_sign: k.sun_sign, nakshatra: k.nakshatra,
        placements: k.placements,
      };
      const res = await generateMatchmaking(self, partner, chartStyle);
      setGenerating(false);

      if (res.report_id) {
        track('report_generated', { type: 'matchmaking' });
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

  // ── renders ──────────────────────────────────────────────────────────────────
  if (loadingSelf) {
    return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;
  }

  // needs the user's own chart first
  if (!self) {
    return (
      <View style={styles.center}>
        <View style={styles.needCrest}><Icon name="heart" size={26} color={Colors.gold} /></View>
        <Text style={styles.needTitle}>Create your Kundli first</Text>
        <Text style={styles.needSub}>
          A matchmaking report compares your chart with your partner’s. Please add your birth
          details, then come back to run the match.
        </Text>
        <Pressable style={styles.needBtn} onPress={() => router.replace('/profile')} android_ripple={{ color: Colors.goldDeep }}>
          <Text style={styles.needBtnText}>Add my birth details</Text>
          <Icon name="arrowRight" size={15} color={Colors.canvas} />
        </Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.needBack}>Back</Text></Pressable>
      </View>
    );
  }

  if (generating) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.gold} size="large" />
        <Text style={styles.genTitle}>Casting the compatibility chart…</Text>
        <Text style={styles.genSub}>Computing the Ashtakoot Guna Milan for both charts. This can take up to a minute.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Matchmaking" onBack={() => router.back()} />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          We’ll compare your chart with your partner’s using the Ashtakoot Guna Milan. Enter your
          partner’s birth details as accurately as you can.
        </Text>

        {/* You (from profile) */}
        <View style={styles.selfCard}>
          <Text style={styles.selfLabel}>YOU</Text>
          <Text style={styles.selfName}>{self.name}</Text>
          <Text style={styles.selfMeta}>Moon in {self.moon_sign} · {self.nakshatra}</Text>
        </View>

        <Text style={styles.sectionLabel}>Your partner</Text>

        <Text style={styles.label}>FULL NAME *</Text>
        <TextInput
          style={styles.input} placeholder="e.g. Priya Sharma" placeholderTextColor={Colors.textDim}
          value={name} onChangeText={setName}
        />

        <Text style={styles.label}>GENDER *</Text>
        <View style={styles.pillRow}>
          {(['male', 'female', 'other'] as Gender[]).map((g) => (
            <Pressable key={g} style={[styles.pill, gender === g && styles.pillActive]} onPress={() => setGender(g)}>
              <Text style={[styles.pillText, gender === g && styles.pillTextActive]}>{g[0].toUpperCase() + g.slice(1)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>DATE OF BIRTH *</Text>
        <View style={styles.row3}>
          <Field flex={1} label={day || 'Day'} placeholder onPress={() => setModal('day')} />
          <Field flex={1.6} label={monthLabel || 'Month'} placeholder={!month} onPress={() => setModal('month')} />
          <Field flex={1.2} label={year || 'Year'} placeholder={!year} onPress={() => setModal('year')} />
        </View>

        <Text style={styles.label}>TIME OF BIRTH *</Text>
        <View style={styles.row3}>
          <Field flex={1} label={hour || 'Hr'} placeholder={!hour} onPress={() => setModal('hour')} />
          <Field flex={1} label={minute !== '' ? pad2(Number(minute)) : 'Min'} placeholder={minute === ''} onPress={() => setModal('minute')} />
          <Field flex={1} label={ampm || 'AM/PM'} placeholder={!ampm} onPress={() => setModal('ampm')} />
        </View>

        <Text style={styles.label}>BIRTH PLACE *</Text>
        <Field label={city || 'Select city'} placeholder={!city} onPress={() => setModal('city')} />

        <Text style={styles.label}>CHART STYLE</Text>
        <View style={styles.pillRow}>
          {(['north', 'south'] as ChartStyle[]).map((s) => (
            <Pressable key={s} style={[styles.pill, chartStyle === s && styles.pillActive]} onPress={() => setChartStyle(s)}>
              <Text style={[styles.pillText, chartStyle === s && styles.pillTextActive]}>
                {s === 'north' ? 'North Indian' : 'South Indian'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[styles.generateBtn, busy && styles.btnDisabled]} onPress={generate} disabled={busy} android_ripple={{ color: Colors.goldDeep }}>
          {busy
            ? <ActivityIndicator color={Colors.canvas} />
            : <Text style={styles.generateText}>Continue · {paiseTo(REPORT_PRICES.matchmaking.price_paise)}</Text>}
        </Pressable>
        <Text style={styles.note}>You’ll pay only after your details are ready. One report per purchase.</Text>
        <View style={{ height: Spacing.xxl }} />
      </KeyboardAwareScrollView>

      {/* pickers */}
      <SelectModal visible={modal === 'day'} title="Day" options={dayOpts} selectedValue={day}
        onSelect={setDay} onClose={() => setModal(null)} />
      <SelectModal visible={modal === 'month'} title="Month" options={monthOpts} selectedValue={month}
        onSelect={setMonth} onClose={() => setModal(null)} />
      <SelectModal visible={modal === 'year'} title="Year" options={yearOpts} selectedValue={year}
        onSelect={setYear} onClose={() => setModal(null)} />
      <SelectModal visible={modal === 'hour'} title="Hour" options={hourOpts} selectedValue={hour}
        onSelect={setHour} onClose={() => setModal(null)} />
      <SelectModal visible={modal === 'minute'} title="Minute" options={minuteOpts} selectedValue={minute}
        onSelect={setMinute} onClose={() => setModal(null)} />
      <SelectModal visible={modal === 'ampm'} title="AM / PM"
        options={[{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }]} selectedValue={ampm}
        onSelect={setAmpm} onClose={() => setModal(null)} />
      <SelectModal visible={modal === 'city'} title="Birth Place" options={cityOpts}
        selectedValue={place ? `${place.name}|${place.lat}|${place.lon}` : undefined}
        remoteSearch={cityRemoteSearch} onSelect={onSelectCity} onClose={() => setModal(null)} />
    </View>
  );
}

function Field({ label, onPress, flex, placeholder }: {
  label: string; onPress: () => void; flex?: number; placeholder?: boolean;
}) {
  return (
    <Pressable style={[styles.field, flex ? { flex } : { alignSelf: 'stretch' }]} onPress={onPress} android_ripple={{ color: Colors.goldFaint }}>
      <Text style={[styles.fieldText, placeholder && styles.fieldPlaceholder]}>{label}</Text>
      <Icon name="chevronDown" size={16} color={Colors.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.canvas },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  center: { flex: 1, backgroundColor: Colors.canvas, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },

  genTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: Colors.text, textAlign: 'center', marginTop: Spacing.md },
  genSub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  needCrest: {
    width: 64, height: 64, borderRadius: Radius.pill, backgroundColor: Colors.goldFaint,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  needTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: Colors.text, textAlign: 'center' },
  needSub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  needBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.gold, borderRadius: Radius.sm, paddingVertical: 13, paddingHorizontal: Spacing.xl, marginTop: Spacing.sm,
  },
  needBtnText: { fontFamily: Fonts.bodySemibold, color: Colors.canvas, fontSize: Fonts.size.md },
  needBack: { fontFamily: Fonts.bodyMedium, color: Colors.goldLight, fontSize: Fonts.size.sm, marginTop: Spacing.xs },

  lead: { fontFamily: Fonts.body, color: Colors.textMuted, fontSize: Fonts.size.sm, lineHeight: 20, marginTop: Spacing.xs, marginBottom: Spacing.lg },

  selfCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, ...Depth.card,
  },
  selfLabel: { fontFamily: Fonts.bodySemibold, color: Colors.gold, fontSize: Fonts.size.xs, letterSpacing: 2 },
  selfName: { fontFamily: Fonts.displayBold, color: Colors.goldLight, fontSize: Fonts.size.xl, marginTop: 2 },
  selfMeta: { fontFamily: Fonts.body, color: Colors.textMuted, fontSize: Fonts.size.sm, marginTop: 2 },

  sectionLabel: { fontFamily: Fonts.displayBold, color: Colors.text, fontSize: Fonts.size.lg, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  label: { fontFamily: Fonts.bodySemibold, color: Colors.textMuted, fontSize: Fonts.size.xs, letterSpacing: 1.5, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.md,
    color: Colors.text, backgroundColor: Colors.surfaceSunken, fontFamily: Fonts.body, fontSize: Fonts.size.md,
  },

  pillRow: { flexDirection: 'row', gap: Spacing.sm },
  pill: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.sm, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.surfaceSunken, alignItems: 'center',
  },
  pillActive: { borderColor: Colors.borderStrong, backgroundColor: Colors.goldFaint },
  pillText: { fontFamily: Fonts.bodyMedium, color: Colors.textMuted, fontSize: Fonts.size.sm },
  pillTextActive: { fontFamily: Fonts.bodySemibold, color: Colors.goldLight },

  row3: { flexDirection: 'row', gap: Spacing.sm },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.md,
    backgroundColor: Colors.surfaceSunken,
  },
  fieldText: { fontFamily: Fonts.body, color: Colors.text, fontSize: Fonts.size.md },
  fieldPlaceholder: { color: Colors.textDim },

  generateBtn: {
    backgroundColor: Colors.gold, borderRadius: Radius.sm, paddingVertical: 15,
    alignItems: 'center', marginTop: Spacing.xl,
  },
  generateText: { fontFamily: Fonts.bodySemibold, color: Colors.canvas, fontSize: Fonts.size.md, letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.6 },
  note: { fontFamily: Fonts.body, color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm },
});
