import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { computeAndStoreKundli, ProfileRow, Kundli } from '../lib/kundliService';
import { track } from '../lib/analytics';
import { CITIES } from '../constants/cities';
import { searchPlaces, GeoPlace } from '../lib/geocoding';
import { SelectModal, Option } from '../components/SelectModal';
import { Colors, Fonts, Spacing } from '../constants/theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const CURRENT_YEAR = new Date().getFullYear();

type Mode = 'loading' | 'form' | 'view';
type Gender = 'male' | 'female' | 'other';
type ModalKind = 'day' | 'month' | 'year' | 'hour' | 'minute' | 'ampm' | 'city' | null;
interface SelectedPlace { name: string; lat: number; lon: number; tz: string }

const pad2 = (n: number | string) => String(n).padStart(2, '0');

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [mode, setMode] = useState<Mode>('loading');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalKind>(null);

  // form fields
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState(''); // '1'..'12'
  const [year, setYear] = useState('');
  const [hour, setHour] = useState(''); // '1'..'12'
  const [minute, setMinute] = useState(''); // '0'..'59'
  const [ampm, setAmpm] = useState(''); // 'AM' | 'PM'
  const [city, setCity] = useState(''); // display name
  const [place, setPlace] = useState<SelectedPlace | null>(null);

  // ── load existing profile ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data) {
        setProfile(data as ProfileRow);
        setMode(data.kundli_chart ? 'view' : 'form');
        if (!data.kundli_chart) prefill(data as ProfileRow);
      } else {
        setMode('form');
      }
    })();
  }, [user]);

  function prefill(p: ProfileRow) {
    setName(p.name);
    setGender(p.gender);
    const [y, m, d] = p.dob.split('-');
    setYear(y); setMonth(String(Number(m))); setDay(String(Number(d)));
    const [hhStr, mmStr] = p.tob.split(':');
    const hh = Number(hhStr);
    setAmpm(hh >= 12 ? 'PM' : 'AM');
    setHour(String(((hh + 11) % 12) + 1)); // 0→12, 13→1
    setMinute(String(Number(mmStr)));
    setCity(p.birth_place);
    setPlace({ name: p.birth_place, lat: p.latitude, lon: p.longitude, tz: p.timezone });
  }

  // ── options for the picker modal ───────────────────────────────────────────
  const dayOpts: Option[] = useMemo(
    () => Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) })), []);
  const monthOpts: Option[] = useMemo(
    () => MONTHS.map((m, i) => ({ label: m, value: String(i + 1) })), []);
  const yearOpts: Option[] = useMemo(
    () => Array.from({ length: CURRENT_YEAR - 1919 }, (_, i) => {
      const y = CURRENT_YEAR - i;
      return { label: String(y), value: String(y) };
    }), []);
  const hourOpts: Option[] = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) })), []);
  const minuteOpts: Option[] = useMemo(
    () => Array.from({ length: 60 }, (_, i) => ({ label: pad2(i), value: String(i) })), []);
  // bundled popular cities shown as instant defaults before the user types
  const cityOpts: Option[] = useMemo(
    () => CITIES.map((c) => ({
      label: c.name,
      value: `${c.name}|${c.lat}|${c.lon}`,
      sublabel: c.state,
      data: { name: c.name, lat: c.lat, lon: c.lon, tz: c.tz } as SelectedPlace,
    })), []);

  // live geocoding for any place worldwide (returns lat/lon + timezone)
  const cityRemoteSearch = async (q: string): Promise<Option[]> => {
    const places = await searchPlaces(q);
    return places.map((p: GeoPlace) => ({
      label: p.name,
      value: `${p.name}|${p.lat}|${p.lon}`,
      sublabel: p.region,
      data: { name: p.name, lat: p.lat, lon: p.lon, tz: p.tz } as SelectedPlace,
    }));
  };

  const onSelectCity = (_value: string, option?: Option) => {
    const p = option?.data as SelectedPlace | undefined;
    if (p) { setPlace(p); setCity(p.name); }
  };

  const monthLabel = month ? MONTHS[Number(month) - 1] : '';

  // ── save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setError('');
    if (!name.trim()) return setError('Please enter a name.');
    if (!gender) return setError('Please select a gender.');
    if (!day || !month || !year) return setError('Please select your full date of birth.');
    if (!hour || !minute || !ampm) return setError('Please select your time of birth.');
    if (!place) return setError('Please select your birth place.');
    const wasNew = !profile; // brand-new profile → onboarding: go to Home after creating

    // validate the calendar date is real (e.g. reject 30 February)
    const y = Number(year), m = Number(month), d = Number(day);
    const test = new Date(y, m - 1, d);
    if (test.getFullYear() !== y || test.getMonth() !== m - 1 || test.getDate() !== d) {
      return setError('That date does not exist. Please check the day and month.');
    }

    // 12h → 24h
    let hh = Number(hour) % 12;
    if (ampm === 'PM') hh += 12;

    const payload = {
      name: name.trim(),
      gender,
      dob: `${y}-${pad2(m)}-${pad2(d)}`,
      tob: `${pad2(hh)}:${pad2(Number(minute))}:00`,
      birth_place: place.name,
      latitude: place.lat,
      longitude: place.lon,
      timezone: place.tz,
      // reset cache — birth details changed, chart must be recomputed
      kundli_chart: null,
      kundli_summary: null,
      kundli_source: null,
      kundli_computed_at: null,
    };

    setSaving(true);
    try {
      let row: ProfileRow;
      if (profile) {
        const { data, error: e } = await supabase
          .from('profiles').update(payload).eq('id', profile.id).select().single();
        if (e) throw e;
        row = data as ProfileRow;
      } else {
        const { data, error: e } = await supabase
          .from('profiles').insert({ ...payload, user_id: user!.id }).select().single();
        if (e) throw e;
        row = data as ProfileRow;
      }

      // compute + cache the Kundli via the single service entry point
      const kundli = await computeAndStoreKundli(row);
      if (wasNew) {
        track('profile_created');
        // first-run onboarding: after creating the Kundli, go to Home
        router.replace('/(tabs)');
        return;
      }
      setProfile({ ...row, kundli_chart: kundli, kundli_summary: kundli.summary, kundli_source: kundli.source, kundli_computed_at: kundli.computed_at });
      setMode('view');
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── renders ──────────────────────────────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  if (mode === 'view' && profile?.kundli_chart) {
    return (
      <KundliView
        profile={profile}
        kundli={profile.kundli_chart}
        onEdit={() => { prefill(profile); setMode('form'); }}
        onBack={() => router.back()}
      />
    );
  }

  // form
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.h1}>{profile ? 'Edit Birth Details' : 'Create Your Kundli'}</Text>
        <Text style={styles.sub}>
          Your birth details power your chart, horoscopes, and AI consultations. Enter them as
          accurately as you can — especially the time of birth.
        </Text>

        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Aarav Sharma"
          placeholderTextColor={Colors.textDim}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Gender</Text>
        <View style={styles.pillRow}>
          {(['male', 'female', 'other'] as Gender[]).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.pill, gender === g && styles.pillActive]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.pillText, gender === g && styles.pillTextActive]}>
                {g[0].toUpperCase() + g.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Date of Birth</Text>
        <View style={styles.row3}>
          <Field flex={1} label={day || 'Day'} onPress={() => setModal('day')} />
          <Field flex={1.6} label={monthLabel || 'Month'} onPress={() => setModal('month')} />
          <Field flex={1.2} label={year || 'Year'} onPress={() => setModal('year')} />
        </View>

        <Text style={styles.label}>Time of Birth</Text>
        <View style={styles.row3}>
          <Field flex={1} label={hour || 'Hr'} onPress={() => setModal('hour')} />
          <Field flex={1} label={minute !== '' ? pad2(Number(minute)) : 'Min'} onPress={() => setModal('minute')} />
          <Field flex={1} label={ampm || 'AM/PM'} onPress={() => setModal('ampm')} />
        </View>

        <Text style={styles.label}>Birth Place</Text>
        <Field label={city || 'Select city'} onPress={() => setModal('city')} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={Colors.bg} />
            : <Text style={styles.saveText}>{profile ? 'Save & Recompute Kundli' : 'Generate My Kundli'}</Text>}
        </TouchableOpacity>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

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
    </KeyboardAvoidingView>
  );
}

function Field({ label, onPress, flex }: { label: string; onPress: () => void; flex?: number }) {
  const dim = label === 'Day' || label === 'Month' || label === 'Year'
    || label === 'Hr' || label === 'Min' || label === 'AM/PM' || label === 'Select city';
  return (
    <TouchableOpacity style={[styles.field, flex ? { flex } : { alignSelf: 'stretch' }]} onPress={onPress}>
      <Text style={[styles.fieldText, dim && styles.fieldPlaceholder]}>{label}</Text>
      <Text style={styles.chevron}>▾</Text>
    </TouchableOpacity>
  );
}

// ── Kundli view ────────────────────────────────────────────────────────────────
function KundliView({ profile, kundli, onEdit, onBack }: {
  profile: ProfileRow; kundli: Kundli; onEdit: () => void; onBack: () => void;
}) {
  const dobLabel = (() => {
    const [y, m, d] = profile.dob.split('-');
    return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  })();
  const tobLabel = (() => {
    const [hhS, mmS] = profile.tob.split(':');
    const hh = Number(hhS);
    const ap = hh >= 12 ? 'PM' : 'AM';
    const h12 = ((hh + 11) % 12) + 1;
    return `${pad2(h12)}:${mmS} ${ap}`;
  })();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <TouchableOpacity style={styles.back} onPress={onBack}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.icon}>✦</Text>
      <Text style={styles.viewName}>{profile.name}</Text>
      <Text style={styles.viewMeta}>{dobLabel} · {tobLabel}</Text>
      <Text style={styles.viewMeta}>{profile.birth_place}</Text>

      {/* Key placements */}
      <View style={styles.keyGrid}>
        <KeyCard label="Lagna (Ascendant)" value={kundli.lagna} />
        <KeyCard label="Moon Sign (Rashi)" value={kundli.moon_sign} />
        <KeyCard label="Sun Sign" value={kundli.sun_sign} />
        <KeyCard label="Nakshatra" value={kundli.nakshatra} />
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Chart Summary</Text>
        <Text style={styles.summaryText}>{kundli.summary}</Text>
      </View>

      {/* Placements table */}
      <Text style={styles.tableHeading}>Planetary Positions</Text>
      <View style={styles.table}>
        <View style={[styles.trow, styles.thead]}>
          <Text style={[styles.th, { flex: 2 }]}>Graha</Text>
          <Text style={[styles.th, { flex: 2.5 }]}>Sign</Text>
          <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>House</Text>
        </View>
        {kundli.placements.map((p) => (
          <View key={p.graha} style={styles.trow}>
            <Text style={[styles.td, { flex: 2 }]}>{p.graha}</Text>
            <Text style={[styles.td, { flex: 2.5 }]}>{p.sign}</Text>
            <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>{p.house}</Text>
          </View>
        ))}
      </View>

      {kundli.source === 'mock' && (
        <Text style={styles.note}>
          Note: this chart uses placeholder calculations for development. Real astronomical
          computation will be enabled before launch.
        </Text>
      )}

      <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
        <Text style={styles.editText}>Edit Birth Details</Text>
      </TouchableOpacity>
      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

function KeyCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.keyCard}>
      <Text style={styles.keyLabel}>{label}</Text>
      <Text style={styles.keyValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.lg, paddingTop: 56 },
  back: { marginBottom: Spacing.md },
  backText: { color: Colors.gold, fontSize: Fonts.size.md },

  h1: { fontSize: Fonts.size.xxl, color: Colors.text, fontWeight: '700', marginBottom: Spacing.xs },
  sub: { fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 20, marginBottom: Spacing.lg },

  label: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginBottom: Spacing.xs, marginTop: Spacing.md },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: Spacing.md,
    fontSize: Fonts.size.md, color: Colors.text, backgroundColor: Colors.bgMid,
  },

  pillRow: { flexDirection: 'row', gap: Spacing.sm },
  pill: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.bgMid, alignItems: 'center',
  },
  pillActive: { borderColor: Colors.gold, backgroundColor: Colors.bgCard },
  pillText: { color: Colors.textMuted, fontSize: Fonts.size.md },
  pillTextActive: { color: Colors.goldLight, fontWeight: '700' },

  row3: { flexDirection: 'row', gap: Spacing.sm },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: Spacing.md,
    backgroundColor: Colors.bgMid,
  },
  fieldText: { color: Colors.text, fontSize: Fonts.size.md },
  fieldPlaceholder: { color: Colors.textDim },
  chevron: { color: Colors.textDim, fontSize: Fonts.size.sm, marginLeft: Spacing.xs },

  error: { color: Colors.error, fontSize: Fonts.size.sm, marginTop: Spacing.md },
  saveBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, padding: Spacing.md,
    alignItems: 'center', marginTop: Spacing.lg,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },

  // view mode
  icon: { fontSize: 44, color: Colors.gold, textAlign: 'center' },
  viewName: { fontSize: Fonts.size.xxl, color: Colors.text, fontWeight: '700', textAlign: 'center', marginTop: Spacing.sm },
  viewMeta: { fontSize: Fonts.size.sm, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },

  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  keyCard: {
    width: '47%', flexGrow: 1, backgroundColor: Colors.bgCard, borderRadius: 12,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  keyLabel: { fontSize: Fonts.size.xs, color: Colors.textDim },
  keyValue: { fontSize: Fonts.size.md, color: Colors.goldLight, fontWeight: '700', marginTop: 4 },

  summaryCard: {
    backgroundColor: Colors.bgCard, borderRadius: 12, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.md,
  },
  summaryTitle: { fontSize: Fonts.size.md, color: Colors.text, fontWeight: '700', marginBottom: Spacing.xs },
  summaryText: { fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 21 },

  tableHeading: { fontSize: Fonts.size.lg, color: Colors.text, fontWeight: '700', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  table: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: 'hidden' },
  trow: { flexDirection: 'row', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  thead: { backgroundColor: Colors.bgMid },
  th: { fontSize: Fonts.size.xs, color: Colors.textDim, fontWeight: '700' },
  td: { fontSize: Fonts.size.sm, color: Colors.text },
  note: { fontSize: Fonts.size.xs, color: Colors.textDim, fontStyle: 'italic', marginTop: Spacing.md, lineHeight: 16 },

  editBtn: {
    borderWidth: 1, borderColor: Colors.gold, borderRadius: 12, padding: Spacing.md,
    alignItems: 'center', marginTop: Spacing.lg,
  },
  editText: { color: Colors.goldLight, fontSize: Fonts.size.md, fontWeight: '700' },
});
