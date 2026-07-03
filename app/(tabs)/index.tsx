import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getHoroscope, HoroscopePeriod } from '../../lib/horoscopeService';
import { Colors, Fonts, Spacing } from '../../constants/theme';

type Entry = 'loading' | 'need_kundli' | 'ready';
const PERIODS: { id: HoroscopePeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [entry, setEntry] = useState<Entry>('loading');
  const [profile, setProfile] = useState<{ id: string; name: string; moonSign: string } | null>(null);

  const [period, setPeriod] = useState<HoroscopePeriod>('daily');
  // per-period cache so switching tabs doesn't refetch
  const [texts, setTexts] = useState<Partial<Record<HoroscopePeriod, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<HoroscopePeriod, string>>>({});
  const [loadingPeriod, setLoadingPeriod] = useState<HoroscopePeriod | null>(null);

  // ── load profile + Moon sign ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles').select('id, name, kundli_chart')
        .eq('user_id', user.id).order('created_at', { ascending: true })
        .limit(1).maybeSingle();

      // Guided onboarding: no profile yet → straight to Kundli creation.
      if (!data) { router.replace('/profile'); return; }
      const moonSign: string | undefined = data.kundli_chart?.moon_sign;
      if (!moonSign) { setEntry('need_kundli'); return; }

      setProfile({ id: data.id, name: data.name, moonSign });
      setEntry('ready');
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
          {profile ? (
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
  disclaimer: {
    color: Colors.textDim, fontSize: Fonts.size.xs, lineHeight: 17,
    textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.md,
  },
});
