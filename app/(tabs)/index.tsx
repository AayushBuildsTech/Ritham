import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getHoroscope, HoroscopePeriod } from '../../lib/horoscopeService';
import { getPanchang, Panchang } from '../../lib/panchangService';
import { getNumerology } from '../../lib/numerologyService';
import { Numerology } from '../../lib/numerology';
import { Colors, Fonts, Spacing, Radius, Type, Depth, Accents, AccentName, Gradients } from '../../constants/theme';
import { Icon, IconName } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { GradientCard } from '../../components/GradientCard';
import { TAB_BAR_HEIGHT } from './_layout';

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
  const insets = useSafeAreaInsets();

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
      const num = await getNumerology({ id: profile.id, name: profile.name, dob: profile.dob });
      if (!cancelled) setNumerology(num);
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
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {
        paddingTop: insets.top + Spacing.lg,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.md,
      }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Reveal index={0}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>NAMASTE</Text>
            <Text style={styles.name}>{firstName || 'Seeker'}</Text>
            {profile?.moonSign ? (
              <View style={styles.moonRow}>
                <Icon name="moon" size={14} color={Colors.gold} />
                <Text style={styles.rashi}>Moon in {profile.moonSign}</Text>
              </View>
            ) : (
              <Text style={styles.phone}>{user?.phone ?? ''}</Text>
            )}
          </View>
          <View style={styles.headerBtns}>
            <IconButton icon="profile" onPress={() => router.push('/profile')} />
            <IconButton icon="settings" onPress={() => router.push('/settings')} />
          </View>
        </View>
      </Reveal>

      {entry === 'need_kundli' ? (
        <Reveal index={1}>
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>ONE STEP LEFT</Text>
            <Text style={styles.heroTitle}>Finish your Kundli</Text>
            <Text style={styles.bodyMuted}>
              Your birth chart isn’t ready yet. Complete your Kundli to unlock your daily,
              weekly, and monthly horoscope.
            </Text>
            <Pressable style={styles.ctaBtn} onPress={() => router.push('/profile')}>
              <Text style={styles.ctaBtnText}>Complete your Kundli</Text>
              <Icon name="arrowRight" size={16} color={Colors.canvas} />
            </Pressable>
          </View>
        </Reveal>
      ) : (
        <>
          <Reveal index={1}>
            <Text style={styles.sectionEyebrow}>YOUR HOROSCOPE</Text>

            {/* underline segmented control (no fat pills) */}
            <View style={styles.segment}>
              {PERIODS.map((p) => {
                const active = period === p.id;
                return (
                  <Pressable key={p.id} style={styles.segmentBtn} onPress={() => setPeriod(p.id)}>
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {p.label}
                    </Text>
                    <View style={[styles.segmentRule, active && styles.segmentRuleActive]} />
                  </Pressable>
                );
              })}
            </View>

            {/* horoscope card */}
            <GradientCard colors={Gradients.heroSurface} style={styles.heroCardPad}>
              {loadingPeriod === period ? (
                <View style={styles.horoLoading}>
                  <ActivityIndicator color={Colors.gold} />
                  <Text style={styles.bodyMuted}>Reading the stars…</Text>
                </View>
              ) : errors[period] ? (
                <View style={styles.horoLoading}>
                  <Text style={styles.bodyMuted}>Couldn’t load your horoscope right now.</Text>
                  <Pressable style={styles.retryBtn} onPress={() => retry(period)}>
                    <Text style={styles.retryText}>Try again</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.quoteMark}>“</Text>
                  <Text style={styles.horoBody}>{texts[period]}</Text>
                </>
              )}
            </GradientCard>
          </Reveal>
        </>
      )}

      {/* ── Secondary free features ─────────────────────────────────────────────── */}
      {profile ? (
        <>
          <Reveal index={2}>
            <Text style={styles.sectionEyebrow}>MORE FOR YOU</Text>
          </Reveal>

          <FeatureRow
            index={3} icon="panchang" accent="saffron" title="Today’s Panchang"
            sub={panchang ? `${panchang.tithi} · ${panchang.nakshatra?.split(' (')[0]}` : 'Daily almanac & timings'}
            onPress={() => router.push({ pathname: '/panchang', params: { profileId: profile.id } })}
          />
          <FeatureRow
            index={4} icon="numerology" accent="amethyst" title="Your Numerology"
            sub={numerology ? `Life Path ${numerology.life_path.number} · Expression ${numerology.expression.number}` : 'Your core numbers from name & birth'}
            onPress={() => router.push({ pathname: '/numerology', params: { profileId: profile.id } })}
          />
          <FeatureRow
            index={5} icon="muhurat" accent="emerald" title="Shubh Muhurat Finder"
            sub="Auspicious dates for your plans"
            onPress={() => router.push({ pathname: '/muhurat', params: { profileId: profile.id } })}
          />
          <FeatureRow
            index={6} icon="temple" accent="ruby" title="Live Darshan"
            sub="Live aarti from major temples"
            onPress={() => router.push('/darshan')}
          />
        </>
      ) : null}

      {/* Astrology disclaimer */}
      <Reveal index={7}>
        <Text style={styles.disclaimer}>
          Horoscopes and readings are for guidance and reflection, not a substitute for
          professional advice.
        </Text>
      </Reveal>
      <View style={{ height: Spacing.xl }} />
    </ScrollView>
  );
}

// ── small building blocks ──────────────────────────────────────────────────────
function IconButton({ icon, onPress }: { icon: IconName; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: Colors.goldFaint, borderless: true, radius: 22 }}
      style={styles.iconBtn}
    >
      <Icon name={icon} size={20} color={Colors.gold} />
    </Pressable>
  );
}

function FeatureRow({
  index, icon, accent, title, sub, onPress,
}: { index: number; icon: IconName; accent: AccentName; title: string; sub: string; onPress: () => void }) {
  const a = Accents[accent];
  return (
    <Reveal index={index}>
      <Pressable
        style={styles.featureRow}
        android_ripple={{ color: a.faint }}
        onPress={onPress}
      >
        <View style={[styles.featureIcon, { backgroundColor: a.faint, borderWidth: 1, borderColor: a.soft }]}>
          <Icon name={icon} size={20} color={a.color} />
        </View>
        <View style={styles.featureBody}>
          <Text style={styles.featureTitle}>{title}</Text>
          <Text style={styles.featureSub} numberOfLines={1}>{sub}</Text>
        </View>
        <Icon name="chevron" size={20} color={Colors.textDim} />
      </Pressable>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: Colors.canvas, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1, backgroundColor: Colors.canvas },
  content: { paddingHorizontal: Spacing.lg },

  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.xl },
  eyebrow: { ...Type.eyebrow, marginBottom: 6 },
  name: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.hero, color: Colors.text, lineHeight: Fonts.size.hero + 4 },
  moonRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  rashi: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.sm, color: Colors.goldLight, letterSpacing: 0.3 },
  phone: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: Colors.textMuted, marginTop: 4 },
  headerBtns: { flexDirection: 'row', gap: Spacing.sm, marginLeft: Spacing.md, marginTop: 4 },
  iconBtn: {
    width: 42, height: 42, borderRadius: Radius.pill,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  sectionEyebrow: { ...Type.eyebrow, marginTop: Spacing.xl, marginBottom: Spacing.md },

  // underline segmented control
  segment: { flexDirection: 'row', gap: Spacing.xl, marginBottom: Spacing.md },
  segmentBtn: { alignItems: 'center' },
  segmentText: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.md, color: Colors.textDim, paddingBottom: 6 },
  segmentTextActive: { color: Colors.text },
  segmentRule: { height: 1.5, width: 20, borderRadius: 2, backgroundColor: 'transparent' },
  segmentRuleActive: { backgroundColor: Colors.gold },

  heroCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, ...Depth.card,
  },
  heroCardPad: { padding: Spacing.lg },
  heroTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: Colors.text, marginBottom: Spacing.sm },
  quoteMark: {
    fontFamily: Fonts.displayBold, fontSize: 44, color: Colors.gold,
    height: 34, marginBottom: -4, opacity: 0.9,
  },
  horoBody: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: Colors.text, lineHeight: 25 },
  bodyMuted: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 21 },
  horoLoading: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },

  retryBtn: {
    marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
  },
  retryText: { fontFamily: Fonts.bodySemibold, color: Colors.goldLight, fontSize: Fonts.size.sm },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, borderRadius: Radius.sm, paddingVertical: 14,
    marginTop: Spacing.md,
  },
  ctaBtnText: { fontFamily: Fonts.bodySemibold, color: Colors.canvas, fontSize: Fonts.size.md, letterSpacing: 0.3 },

  // feature rows
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  featureIcon: {
    width: 44, height: 44, borderRadius: Radius.sm,
    backgroundColor: Colors.goldFaint, alignItems: 'center', justifyContent: 'center',
  },
  featureBody: { flex: 1 },
  featureTitle: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: Colors.text },
  featureSub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: Colors.textMuted, marginTop: 2 },

  disclaimer: {
    fontFamily: Fonts.body, color: Colors.textDim, fontSize: Fonts.size.xs, lineHeight: 17,
    textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.md,
  },
});
