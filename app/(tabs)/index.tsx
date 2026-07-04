import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getHoroscope, HoroscopePeriod } from '../../lib/horoscopeService';
import { getPanchang, Panchang } from '../../lib/panchangService';
import { getNumerology } from '../../lib/numerologyService';
import { Numerology } from '../../lib/numerology';
import { Colors, Fonts, Spacing } from '../../constants/theme';

type Entry = 'loading' | 'need_kundli' | 'ready';
type Profile = {
  id: string; name: string; dob: string; birthPlace: string;
  lat: number; lng: number; moonSign?: string;
};
const PERIODS: { id: HoroscopePeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [entry, setEntry] = useState<Entry>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);

  const [period, setPeriod] = useState<HoroscopePeriod>('daily');
  // per-period cache so switching tabs doesn't refetch
  const [texts, setTexts] = useState<Partial<Record<HoroscopePeriod, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<HoroscopePeriod, string>>>({});
  const [loadingPeriod, setLoadingPeriod] = useState<HoroscopePeriod | null>(null);

  // secondary free features (computed + cached — never AI)
  const [panchang, setPanchang] = useState<Panchang | null>(null);
  const [numerology, setNumerology] = useState<Numerology | null>(null);

  // ── load profile (birth details + Moon sign) ─────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!user) return;
      // NOTE: do NOT select `numerology` here — that column only exists after
      // migration 010. Selecting a missing column makes PostgREST reject the whole
      // query, which would strand Home on its loading screen. Numerology is cheap to
      // recompute, so we just compute it on demand (getNumerology) instead.
      const { data } = await supabase
        .from('profiles').select('id, name, dob, birth_place, latitude, longitude, kundli_chart')
        .eq('user_id', user.id).order('created_at', { ascending: true })
        .limit(1).maybeSingle();

      // Guided onboarding: no profile yet → straight to Kundli creation.
      if (!data) { router.replace('/profile'); return; }

      const moonSign: string | undefined = data.kundli_chart?.moon_sign;
      setProfile({
        id: data.id, name: data.name, dob: data.dob, birthPlace: data.birth_place,
        lat: data.latitude, lng: data.longitude, moonSign,
      });
      setEntry(moonSign ? 'ready' : 'need_kundli');
    })();
  }, [user]);

  // ── fetch the horoscope for the selected period (once) ───────────────────────
  useEffect(() => {
    if (entry !== 'ready' || !profile) return;
    if (texts[period] !== undefined || loadingPeriod === period) return;

    let cancelled = false;
    (async () => {
      setLoadingPeriod(period);
      const res = await getHoroscope(profile.id, period);
      if (cancelled) return;
      if (res.body) {
        setTexts((t) => ({ ...t, [period]: res.body! }));
      } else {
        setErrors((e) => ({ ...e, [period]: res.error ?? 'request_failed' }));
      }
      setLoadingPeriod((lp) => (lp === period ? null : lp));
    })();
    return () => { cancelled = true; };
  }, [entry, profile, period]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── load Panchang (cached per city/day) + Numerology (computed once) ─────────
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      // Numerology is instant, pure client compute (persisted best-effort).
      const num = await getNumerology({ id: profile.id, name: profile.name, dob: profile.dob });
      if (!cancelled) setNumerology(num);
      // Panchang is served from the shared city/day cache (computed, not AI).
      const p = await getPanchang(profile.id);
      if (!cancelled && !p.error) setPanchang(p);
    })();
    return () => { cancelled = true; };
  }, [profile]);

  function retry(p: HoroscopePeriod) {
    setErrors((e) => ({ ...e, [p]: undefined }));
    setTexts((t) => { const c = { ...t }; delete c[p]; return c; }); // triggers refetch
  }

  // ── renders ──────────────────────────────────────────────────────────────────
  if (entry === 'loading') {
    return <View style={styles.loading}><ActivityIndicator color={Colors.gold} size="large" /></View>;
  }

  const firstName = profile?.name?.trim().split(/\s+/)[0];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Namaste{firstName ? `, ${firstName}` : ''} 🙏</Text>
          {profile?.moonSign ? (
            <Text style={styles.rashi}>🌙 Moon in {profile.moonSign}</Text>
          ) : (
            <Text style={styles.phone}>{user?.phone ?? ''}</Text>
          )}
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity onPress={() => router.push('/profile')} style={styles.avatarBtn}>
            <Text style={styles.avatarIcon}>◉</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.avatarBtn}>
            <Text style={styles.avatarIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {entry === 'need_kundli' ? (
        <View style={styles.horoCard}>
          <Text style={styles.horoPeriod}>Finish your Kundli</Text>
          <Text style={styles.horoPlaceholder}>
            Your birth chart isn’t ready yet. Complete your Kundli to unlock your daily,
            weekly, and monthly horoscope.
          </Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push('/profile')}>
            <Text style={styles.ctaBtnText}>Complete your Kundli →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Your Horoscope</Text>

          {/* period toggle */}
          <View style={styles.toggle}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.toggleBtn, period === p.id && styles.toggleActive]}
                onPress={() => setPeriod(p.id)}
              >
                <Text style={[styles.toggleText, period === p.id && styles.toggleTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* horoscope card */}
          <View style={styles.horoCard}>
            {loadingPeriod === period ? (
              <View style={styles.horoLoading}>
                <ActivityIndicator color={Colors.gold} />
                <Text style={styles.horoLoadingText}>Reading the stars…</Text>
              </View>
            ) : errors[period] ? (
              <View style={styles.horoLoading}>
                <Text style={styles.horoPlaceholder}>Couldn’t load your horoscope right now.</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => retry(period)}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.horoBody}>{texts[period]}</Text>
            )}
          </View>
        </>
      )}

      {/* ── Secondary free features (below the horoscope hero) ─────────────────── */}
      {profile ? (
        <>
          <Text style={styles.moreTitle}>More for you</Text>

          {/* Panchang card */}
          <TouchableOpacity
            style={styles.miniCard}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/panchang', params: { profileId: profile.id } })}
          >
            <Text style={styles.miniIcon}>🕉️</Text>
            <View style={styles.miniBody}>
              <Text style={styles.miniTitle}>Today’s Panchang</Text>
              {panchang ? (
                <Text style={styles.miniSub} numberOfLines={1}>
                  {panchang.tithi} · {panchang.nakshatra?.split(' (')[0]}
                </Text>
              ) : (
                <Text style={styles.miniSub}>Daily almanac & timings</Text>
              )}
            </View>
            <Text style={styles.miniChevron}>›</Text>
          </TouchableOpacity>

          {/* Numerology card */}
          <TouchableOpacity
            style={styles.miniCard}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/numerology', params: { profileId: profile.id } })}
          >
            <Text style={styles.miniIcon}>🔢</Text>
            <View style={styles.miniBody}>
              <Text style={styles.miniTitle}>Your Numerology</Text>
              {numerology ? (
                <Text style={styles.miniSub} numberOfLines={1}>
                  Life Path {numerology.life_path.number} · Expression {numerology.expression.number}
                </Text>
              ) : (
                <Text style={styles.miniSub}>Your core numbers from name & birth</Text>
              )}
            </View>
            <Text style={styles.miniChevron}>›</Text>
          </TouchableOpacity>

          {/* Shubh Muhurat Finder (tool) */}
          <TouchableOpacity
            style={styles.miniCard}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/muhurat', params: { profileId: profile.id } })}
          >
            <Text style={styles.miniIcon}>📅</Text>
            <View style={styles.miniBody}>
              <Text style={styles.miniTitle}>Shubh Muhurat Finder</Text>
              <Text style={styles.miniSub}>Auspicious dates for your plans</Text>
            </View>
            <Text style={styles.miniChevron}>›</Text>
          </TouchableOpacity>

          {/* Live Darshan (directory; links out to official temple streams) */}
          <TouchableOpacity
            style={styles.miniCard}
            activeOpacity={0.8}
            onPress={() => router.push('/darshan')}
          >
            <Text style={styles.miniIcon}>🛕</Text>
            <View style={styles.miniBody}>
              <Text style={styles.miniTitle}>Live Darshan</Text>
              <Text style={styles.miniSub}>Live aarti from major temples</Text>
            </View>
            <Text style={styles.miniChevron}>›</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {/* Astrology disclaimer */}
      <Text style={styles.disclaimer}>
        Horoscopes and readings are for guidance and reflection, not a substitute for
        professional advice.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  greeting: { fontSize: Fonts.size.xl, color: Colors.text, fontWeight: '700' },
  rashi: { fontSize: Fonts.size.sm, color: Colors.goldLight, marginTop: 4 },
  phone: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: Spacing.sm, marginLeft: Spacing.md },
  avatarBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarIcon: { fontSize: 20, color: Colors.gold },

  sectionTitle: { fontSize: Fonts.size.lg, color: Colors.text, fontWeight: '700', marginBottom: Spacing.md },

  toggle: {
    flexDirection: 'row', backgroundColor: Colors.bgMid, borderRadius: 12,
    padding: 4, marginBottom: Spacing.md,
  },
  toggleBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: 9, alignItems: 'center' },
  toggleActive: { backgroundColor: Colors.gold },
  toggleText: { color: Colors.textMuted, fontSize: Fonts.size.md, fontWeight: '700' },
  toggleTextActive: { color: Colors.bg },

  horoCard: {
    backgroundColor: Colors.bgCard, borderRadius: 14, padding: Spacing.lg,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  horoPeriod: { fontSize: Fonts.size.lg, color: Colors.goldLight, fontWeight: '700', marginBottom: Spacing.xs },
  horoBody: { fontSize: Fonts.size.md, color: Colors.text, lineHeight: 24 },
  horoPlaceholder: { fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 20 },
  horoLoading: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  horoLoadingText: { fontSize: Fonts.size.sm, color: Colors.textMuted },

  retryBtn: {
    marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.gold, borderRadius: 10,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
  },
  retryText: { color: Colors.goldLight, fontSize: Fonts.size.sm, fontWeight: '700' },

  ctaBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, padding: Spacing.md,
    alignItems: 'center', marginTop: Spacing.md,
  },
  ctaBtnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },

  // secondary feature cards
  moreTitle: {
    fontSize: Fonts.size.sm, color: Colors.textDim, fontWeight: '700', letterSpacing: 1,
    marginTop: Spacing.xl, marginBottom: Spacing.sm,
  },
  miniCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: 14, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  miniIcon: { fontSize: 24 },
  miniBody: { flex: 1 },
  miniTitle: { fontSize: Fonts.size.md, color: Colors.text, fontWeight: '700' },
  miniSub: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginTop: 2 },
  miniChevron: { fontSize: 22, color: Colors.gold },

  disclaimer: {
    color: Colors.textDim, fontSize: Fonts.size.xs, lineHeight: 17,
    textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.md,
  },
});
