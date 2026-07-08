import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useActiveProfile, FAMILY_RELATIONS, RELATION_LABEL } from '../context/ProfileContext';
import { supabase } from '../lib/supabase';
import { computeAndStoreKundli, ProfileRow, Kundli } from '../lib/kundliService';
import { track } from '../lib/analytics';
import { CITIES } from '../constants/cities';
import { searchPlaces, GeoPlace } from '../lib/geocoding';
import { SelectModal, Option } from '../components/SelectModal';
import { Colors, Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { Icon } from '../components/Icon';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const CURRENT_YEAR = new Date().getFullYear();

type Mode = 'loading' | 'form' | 'view';
type Gender = 'male' | 'female' | 'other';
type ModalKind = 'day' | 'month' | 'year' | 'hour' | 'minute' | 'ampm' | 'city' | 'relation' | null;
interface SelectedPlace { name: string; lat: number; lon: number; tz: string }

const pad2 = (n: number | string) => String(n).padStart(2, '0');
const PLACEHOLDERS = ['Day', 'Month', 'Year', 'Hr', 'Min', 'AM/PM', 'Select city'];

function BackHeader({ onBack }: { onBack: () => void }) {
  const th = useColors();
  const styles = makeStyles(th);
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      style={[styles.back, { marginTop: insets.top }]}
      onPress={onBack}
      android_ripple={{ color: th.goldFaint, borderless: true, radius: 20 }}
    >
      <Icon name="back" size={20} color={th.gold} />
      <Text style={styles.backText}>Back</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string; new?: string; relation?: string }>();
  const { refresh } = useActiveProfile();
  const isAdding = params.new === '1'; // adding a new family member

  const [mode, setMode] = useState<Mode>('loading');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalKind>(null);

  // form fields
  const [relation, setRelation] = useState<string>('self');
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

  // adding a family member, or editing an existing non-self member
  const isFamily = isAdding || relation !== 'self';

  // ── load: add new / edit by id / self (legacy oldest) ────────────────────────
  useEffect(() => {
    (async () => {
      if (!user) return;

      if (isAdding) { // brand-new family member — empty form
        setProfile(null);
        setRelation(params.relation ?? 'other');
        setMode('form');
        return;
      }

      const base = supabase.from('profiles').select('*').eq('user_id', user.id);
      const { data } = params.id
        ? await base.eq('id', params.id).maybeSingle()
        : await base.order('created_at', { ascending: true }).limit(1).maybeSingle();

      if (data) {
        setProfile(data as ProfileRow);
        setRelation((data as ProfileRow).relation ?? 'self');
        setMode(data.kundli_chart ? 'view' : 'form');
        if (!data.kundli_chart) prefill(data as ProfileRow);
      } else {
        setRelation('self'); // no profile yet → self onboarding
        setMode('form');
      }
    })();
  }, [user, params.id, params.new]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const payload: Record<string, unknown> = {
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
    // Only family rows carry a relation; self relies on the column default ('self')
    // so onboarding still works even before migration 013 is applied.
    if (isFamily) payload.relation = relation;

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
      await refresh(); // keep the family list / active person in sync

      if (isAdding) {
        track('family_member_added');
        router.back(); // return to the Family screen
        return;
      }
      if (wasNew) {
        track('profile_created');
        // first-run onboarding: after creating the Kundli, offer to add family
        // (skippable) so the feature is discoverable, then Home.
        router.replace('/onboarding-family');
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
        <ActivityIndicator color={th.gold} size="large" />
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
        onRefresh={async () => {
          const fresh = await computeAndStoreKundli(profile);
          setProfile({ ...profile, kundli_chart: fresh, kundli_summary: fresh.summary, kundli_source: fresh.source, kundli_computed_at: fresh.computed_at });
        }}
      />
    );
  }

  // form
  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <BackHeader onBack={() => router.back()} />

        <Text style={styles.eyebrow}>{isAdding ? 'ADD FAMILY MEMBER' : profile ? 'EDIT BIRTH DETAILS' : 'YOUR KUNDLI'}</Text>
        <Text style={styles.h1}>{isAdding ? 'Add Family Member' : profile ? 'Edit Birth Details' : 'Create Your Kundli'}</Text>
        <Text style={styles.sub}>
          {isFamily
            ? 'Enter this person’s birth details to generate their Kundli, horoscope and reports. The time of birth matters most.'
            : 'Your birth details power your chart, horoscopes, and AI consultations. Enter them as accurately as you can — especially the time of birth.'}
        </Text>

        {isFamily && (
          <>
            <Text style={styles.label}>RELATIONSHIP</Text>
            <Field label={RELATION_LABEL[relation] ?? 'Select'} onPress={() => setModal('relation')} />
          </>
        )}

        <Text style={styles.label}>FULL NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Aarav Sharma"
          placeholderTextColor={th.textDim}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>GENDER</Text>
        <View style={styles.pillRow}>
          {(['male', 'female', 'other'] as Gender[]).map((g) => (
            <Pressable
              key={g}
              style={[styles.pill, gender === g && styles.pillActive]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.pillText, gender === g && styles.pillTextActive]}>
                {g[0].toUpperCase() + g.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>DATE OF BIRTH</Text>
        <View style={styles.row3}>
          <Field flex={1} label={day || 'Day'} onPress={() => setModal('day')} />
          <Field flex={1.6} label={monthLabel || 'Month'} onPress={() => setModal('month')} />
          <Field flex={1.2} label={year || 'Year'} onPress={() => setModal('year')} />
        </View>

        <Text style={styles.label}>TIME OF BIRTH</Text>
        <View style={styles.row3}>
          <Field flex={1} label={hour || 'Hr'} onPress={() => setModal('hour')} />
          <Field flex={1} label={minute !== '' ? pad2(Number(minute)) : 'Min'} onPress={() => setModal('minute')} />
          <Field flex={1} label={ampm || 'AM/PM'} onPress={() => setModal('ampm')} />
        </View>

        <Text style={styles.label}>BIRTH PLACE</Text>
        <Field label={city || 'Select city'} onPress={() => setModal('city')} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          android_ripple={{ color: th.goldDeep }}
        >
          {saving
            ? <ActivityIndicator color={th.goldContrast} />
            : <Text style={styles.saveText}>{profile ? 'Save & Recompute Kundli' : 'Generate My Kundli'}</Text>}
        </Pressable>

        <View style={{ height: Spacing.xxl }} />
      </KeyboardAwareScrollView>

      {/* pickers */}
      <SelectModal visible={modal === 'relation'} title="Relationship"
        options={FAMILY_RELATIONS.map((r) => ({ label: RELATION_LABEL[r], value: r }))}
        selectedValue={relation} onSelect={setRelation} onClose={() => setModal(null)} />
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

function Field({ label, onPress, flex }: { label: string; onPress: () => void; flex?: number }) {
  const th = useColors();
  const styles = makeStyles(th);
  const dim = PLACEHOLDERS.includes(label);
  return (
    <Pressable style={[styles.field, flex ? { flex } : { alignSelf: 'stretch' }]} onPress={onPress} android_ripple={{ color: th.goldFaint }}>
      <Text style={[styles.fieldText, dim && styles.fieldPlaceholder]}>{label}</Text>
      <Icon name="chevronDown" size={16} color={th.textDim} />
    </Pressable>
  );
}

// ── Kundli view ────────────────────────────────────────────────────────────────
// ── client-side dasha helpers (from the stored Vimshottari timeline; no server call) ──
const DASHA_YEARS: Record<string, number> = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };
const DASHA_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const monthYear = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
function currentMaha(timeline?: { lord: string; start: string; end: string }[]) {
  if (!Array.isArray(timeline) || !timeline.length) return null;
  const now = Date.now();
  return timeline.find((p) => now >= Date.parse(p.start) && now < Date.parse(p.end)) ?? timeline[0];
}
function currentAntar(maha?: { lord: string; start: string; end: string } | null) {
  if (!maha) return null;
  const start = Date.parse(maha.start), span = Date.parse(maha.end) - start, now = Date.now();
  const i0 = DASHA_ORDER.indexOf(maha.lord);
  if (i0 < 0) return null;
  const seq = [...DASHA_ORDER.slice(i0), ...DASHA_ORDER.slice(0, i0)];
  let cursor = start;
  for (const lord of seq) {
    const end = cursor + span * (DASHA_YEARS[lord] / 120);
    if (now >= cursor && now < end) return { lord, start: new Date(cursor).toISOString(), end: new Date(end).toISOString() };
    cursor = end;
  }
  return null;
}

function KundliView({ profile, kundli, onEdit, onBack, onRefresh }: {
  profile: ProfileRow; kundli: Kundli; onEdit: () => void; onBack: () => void; onRefresh: () => void;
}) {
  const th = useColors();
  const styles = makeStyles(th);
  const [refreshing, setRefreshing] = useState(false);
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

  const cf = kundli.chart_facts;                       // rich VedAstro depth (may be undefined on legacy v2)
  const grahas = cf?.grahas ?? null;
  const houses = cf?.houses ?? kundli.house_lords ?? [];
  const yogas = cf?.yogas ?? kundli.yogas ?? [];
  const doshas = cf?.doshas ?? [];
  const timeline = kundli.dasha_timeline ?? [];
  const maha = currentMaha(timeline);
  const antar = currentAntar(maha);
  const upcoming = timeline.filter((p) => Date.parse(p.start) > Date.now()).slice(0, 3);
  const d9 = cf?.divisional?.d9 ?? null;
  const d10 = cf?.divisional?.d10 ?? null;
  const provider = kundli.source === 'vedastro' ? 'VedAstro · Swiss Ephemeris'
    : kundli.source === 'lahiri' ? 'Lahiri sidereal engine' : null;

  const doRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <BackHeader onBack={onBack} />

      <View style={styles.viewHead}>
        <View style={styles.viewCrest}><Icon name="moon" size={26} color={th.gold} /></View>
        <Text style={styles.viewName}>{profile.name}</Text>
        <Text style={styles.viewMeta}>{dobLabel} · {tobLabel}</Text>
        <Text style={styles.viewMeta}>{profile.birth_place}</Text>
        {provider && <Text style={styles.provider}>Computed by {provider}</Text>}
      </View>

      {/* Chart overview */}
      <View style={styles.keyGrid}>
        <KeyCard label="Lagna (Ascendant)" value={kundli.lagna} />
        <KeyCard label="Moon Sign (Rashi)" value={kundli.moon_sign} />
        <KeyCard label="Sun Sign" value={kundli.sun_sign} />
        <KeyCard label="Nakshatra" value={`${kundli.nakshatra}${kundli.pada ? ` · Pada ${kundli.pada}` : ''}`} />
      </View>
      {kundli.lagna_lord && (
        <Text style={styles.overviewLine}>
          Lagna lord {kundli.lagna_lord.graha} in {kundli.lagna_lord.sign} (house {kundli.lagna_lord.house})
        </Text>
      )}

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Chart Summary</Text>
        <Text style={styles.summaryText}>{kundli.summary}</Text>
      </View>

      {/* Planetary positions (rich when chart_facts present) */}
      <Text style={styles.tableHeading}>Planetary Positions</Text>
      <View style={styles.table}>
        <View style={[styles.trow, styles.thead]}>
          <Text style={[styles.th, { flex: 2 }]}>Graha</Text>
          <Text style={[styles.th, { flex: 2.4 }]}>Sign</Text>
          <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Ho.</Text>
          <Text style={[styles.th, { flex: 1.6, textAlign: 'right' }]}>State</Text>
        </View>
        {(grahas ?? kundli.placements).map((p: any) => {
          const flags = [
            p.dignity && p.dignity !== 'Neutral' ? p.dignity : null,
            p.retrograde ? 'Retro' : null,
            p.combust ? 'Combust' : null,
            p.vargottama ? 'Vargottama' : null,
          ].filter(Boolean).join(', ');
          return (
            <View key={p.graha} style={styles.trow}>
              <Text style={[styles.td, { flex: 2 }]}>{p.graha}</Text>
              <Text style={[styles.td, { flex: 2.4 }]}>{(p.sign || '').split(' (')[0]}{p.sign_degree ? ` ${p.sign_degree.split("'")[0]}'` : ''}</Text>
              <Text style={[styles.td, { flex: 0.7, textAlign: 'center' }]}>{p.house}</Text>
              <Text style={[styles.tdDim, { flex: 1.6, textAlign: 'right' }]}>{flags || '—'}</Text>
            </View>
          );
        })}
      </View>

      {/* House lords */}
      {houses.length > 0 && (
        <>
          <Text style={styles.tableHeading}>House Lords (Bhava)</Text>
          <View style={styles.table}>
            <View style={[styles.trow, styles.thead]}>
              <Text style={[styles.th, { flex: 0.7 }]}>Ho.</Text>
              <Text style={[styles.th, { flex: 2 }]}>Sign</Text>
              <Text style={[styles.th, { flex: 2.6, textAlign: 'right' }]}>Lord (sits in)</Text>
            </View>
            {houses.map((h: any) => (
              <View key={h.house} style={styles.trow}>
                <Text style={[styles.td, { flex: 0.7 }]}>{h.house}</Text>
                <Text style={[styles.td, { flex: 2 }]}>{(h.sign || '').split(' (')[0]}</Text>
                <Text style={[styles.tdDim, { flex: 2.6, textAlign: 'right' }]}>{(h.lord || '').split(' (')[0]} · H{h.lord_house}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Dasha timeline (current + upcoming; computed from the stored timeline) */}
      {maha && (
        <>
          <Text style={styles.tableHeading}>Vimshottari Dasha</Text>
          <View style={styles.dashaNow}>
            <Text style={styles.dashaNowLabel}>Running now</Text>
            <Text style={styles.dashaNowValue}>
              {maha.lord} Mahadasha{antar ? ` — ${antar.lord} Antardasha` : ''}
            </Text>
            <Text style={styles.dashaNowDates}>
              Maha until {monthYear(maha.end)}{antar ? ` · Antar until ${monthYear(antar.end)}` : ''}
            </Text>
          </View>
          {upcoming.map((p) => (
            <View key={p.start} style={styles.dashaRow}>
              <Text style={styles.dashaLord}>{p.lord}</Text>
              <Text style={styles.dashaDates}>{monthYear(p.start)} – {monthYear(p.end)}</Text>
            </View>
          ))}
        </>
      )}

      {/* Divisional charts D9 / D10 */}
      {(d9 || d10) && (
        <>
          <Text style={styles.tableHeading}>Divisional Charts</Text>
          <View style={styles.table}>
            <View style={[styles.trow, styles.thead]}>
              <Text style={[styles.th, { flex: 2 }]}>Graha</Text>
              <Text style={[styles.th, { flex: 2, textAlign: 'center' }]}>D9 (Navamsa)</Text>
              <Text style={[styles.th, { flex: 2, textAlign: 'right' }]}>D10 (Dashamsa)</Text>
            </View>
            {Object.keys(d9 ?? d10 ?? {}).map((g) => (
              <View key={g} style={styles.trow}>
                <Text style={[styles.td, { flex: 2 }]}>{g.split(' (')[0]}</Text>
                <Text style={[styles.tdDim, { flex: 2, textAlign: 'center' }]}>{(d9?.[g] || '—').split(' (')[0]}</Text>
                <Text style={[styles.tdDim, { flex: 2, textAlign: 'right' }]}>{(d10?.[g] || '—').split(' (')[0]}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Yogas & Doshas */}
      {(yogas.length > 0 || doshas.length > 0) && (
        <>
          <Text style={styles.tableHeading}>Yogas & Doshas</Text>
          <View style={styles.yogaWrap}>
            {yogas.map((y: any, i: number) => (
              <View key={`y${i}`} style={styles.yogaRow}>
                <View style={[styles.yogaDot, { backgroundColor: y.nature === 'caution' ? th.textDim : th.gold }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.yogaName}>{y.name}</Text>
                  <Text style={styles.yogaDetail}>{y.detail}</Text>
                </View>
              </View>
            ))}
            {doshas.map((d: any, i: number) => (
              <View key={`d${i}`} style={styles.yogaRow}>
                <View style={[styles.yogaDot, { backgroundColor: d.present ? th.textDim : th.borderStrong }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.yogaName}>{d.name} — {d.present ? 'present' : 'absent'}</Text>
                  <Text style={styles.yogaDetail}>{d.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {kundli.source === 'mock' && (
        <Text style={styles.note}>
          Note: this chart uses placeholder calculations for development. Real astronomical
          computation will be enabled before launch.
        </Text>
      )}
      {kundli.source === 'lahiri' && (
        <Pressable style={styles.refreshBtn} onPress={doRefresh} disabled={refreshing} android_ripple={{ color: th.goldFaint }}>
          {refreshing ? <ActivityIndicator color={th.goldLight} size="small" />
            : <><Icon name="moon" size={15} color={th.goldLight} /><Text style={styles.refreshText}>Refresh with VedAstro</Text></>}
        </Pressable>
      )}

      <Pressable style={styles.editBtn} onPress={onEdit} android_ripple={{ color: th.goldFaint }}>
        <Icon name="edit" size={16} color={th.goldLight} />
        <Text style={styles.editText}>Edit Birth Details</Text>
      </Pressable>
      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

function KeyCard({ label, value }: { label: string; value: string }) {
  const th = useColors();
  const styles = makeStyles(th);
  return (
    <View style={styles.keyCard}>
      <Text style={styles.keyLabel}>{label}</Text>
      <Text style={styles.keyValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, backgroundColor: th.canvas, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.lg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  backText: { fontFamily: Fonts.bodyMedium, color: th.gold, fontSize: Fonts.size.md },

  eyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2.5, marginBottom: 6 },
  h1: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.hero, color: th.text, marginBottom: Spacing.xs },
  sub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 20, marginBottom: Spacing.lg },

  label: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.textMuted, letterSpacing: 1.5, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: {
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm, padding: Spacing.md,
    fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.text, backgroundColor: th.surfaceSunken,
  },

  pillRow: { flexDirection: 'row', gap: Spacing.sm },
  pill: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.sm, borderWidth: 1,
    borderColor: th.border, backgroundColor: th.surfaceSunken, alignItems: 'center',
  },
  pillActive: { borderColor: th.borderStrong, backgroundColor: th.goldFaint },
  pillText: { fontFamily: Fonts.bodyMedium, color: th.textMuted, fontSize: Fonts.size.md },
  pillTextActive: { fontFamily: Fonts.bodySemibold, color: th.goldLight },

  row3: { flexDirection: 'row', gap: Spacing.sm },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm, padding: Spacing.md,
    backgroundColor: th.surfaceSunken,
  },
  fieldText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md },
  fieldPlaceholder: { color: th.textDim },

  error: { fontFamily: Fonts.body, color: th.error, fontSize: Fonts.size.sm, marginTop: Spacing.md },
  saveBtn: {
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 15,
    alignItems: 'center', marginTop: Spacing.lg,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },

  // view mode
  viewHead: { alignItems: 'center', marginTop: Spacing.sm },
  viewCrest: {
    width: 64, height: 64, borderRadius: Radius.pill, backgroundColor: th.goldFaint,
    borderWidth: 1, borderColor: th.border, alignItems: 'center', justifyContent: 'center',
  },
  viewName: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, textAlign: 'center', marginTop: Spacing.md },
  viewMeta: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, textAlign: 'center', marginTop: 2 },

  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  keyCard: {
    width: '47%', flexGrow: 1, backgroundColor: th.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: th.border, ...Depth.card,
  },
  keyLabel: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, letterSpacing: 0.5 },
  keyValue: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.goldLight, marginTop: 4 },

  summaryCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, padding: Spacing.lg,
    borderWidth: 1, borderColor: th.border, marginTop: Spacing.md,
  },
  summaryTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.lg, color: th.text, marginBottom: Spacing.xs },
  summaryText: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 22 },

  tableHeading: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  table: { borderWidth: 1, borderColor: th.border, borderRadius: Radius.md, overflow: 'hidden' },
  trow: { flexDirection: 'row', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: th.divider },
  thead: { backgroundColor: th.surfaceSunken },
  th: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.textDim, letterSpacing: 0.5 },
  td: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.text },
  tdDim: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted },
  note: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, fontStyle: 'italic', marginTop: Spacing.md, lineHeight: 16 },

  provider: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 0.4, marginTop: 6 },
  overviewLine: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: Spacing.sm, textAlign: 'center' },

  dashaNow: {
    backgroundColor: th.goldFaint, borderWidth: 1, borderColor: th.border,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  dashaNowLabel: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 1.5, marginBottom: 4 },
  dashaNowValue: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.text },
  dashaNowDates: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted, marginTop: 3 },
  dashaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm, marginBottom: 6,
  },
  dashaLord: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.sm, color: th.text },
  dashaDates: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim },

  yogaWrap: { borderWidth: 1, borderColor: th.border, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.md },
  yogaRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  yogaDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  yogaName: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.text },
  yogaDetail: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted, lineHeight: 17, marginTop: 2 },

  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm, paddingVertical: 12, marginTop: Spacing.lg,
  },
  refreshText: { fontFamily: Fonts.bodyMedium, color: th.goldLight, fontSize: Fonts.size.sm },

  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: th.borderStrong, borderRadius: Radius.sm, paddingVertical: 14,
    marginTop: Spacing.md,
  },
  editText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.md },
});
