import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Dimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getPanchang, Panchang } from '../../lib/panchangService';
import { getNumerology } from '../../lib/numerologyService';
import { getRetrograde, getSadeSati, RetrogradeStatus, SadeSatiStatus } from '../../lib/kundliService';
import { PLANET_LABEL } from '../../config/retrogradeMeanings';
import { Numerology } from '../../lib/numerology';
import { track } from '../../lib/analytics';
import { Fonts, Spacing, Radius, Depth, Accents, AccentName, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useActiveProfile, RELATION_LABEL } from '../../context/ProfileContext';
import { Icon, IconName } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { SelectModal, Option } from '../../components/SelectModal';
import { TAB_BAR_HEIGHT } from './_layout';

type Entry = 'loading' | 'need_kundli' | 'ready';
type Profile = {
  id: string; name: string; dob: string; birthPlace: string;
  lat: number; lng: number; moonSign?: string;
};

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = 12;
const CARD_W = (SCREEN_W - Spacing.lg * 2 - GRID_GAP) / 2;

// Deterministic "cosmic" percentage seeded by sign + date + metric, so the daily
// reading stats feel alive but stay stable across a whole day (never AI/random).
function seededPct(seed: string, min = 52, max = 96): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const r = (h >>> 0) / 4294967295;
  return Math.round(min + r * (max - min));
}

export default function HomeScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { user } = useAuth();
  const { members, activeId, loading: profilesLoading, setActive } = useActiveProfile();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [entry, setEntry] = useState<Entry>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [switcher, setSwitcher] = useState(false);

  // secondary free features (computed + cached — never AI)
  const [panchang, setPanchang] = useState<Panchang | null>(null);
  const [numerology, setNumerology] = useState<Numerology | null>(null);
  const [retro, setRetro] = useState<RetrogradeStatus | null>(null);
  const [sade, setSade] = useState<SadeSatiStatus | null>(null);

  // The header is a dark violet→magenta gradient, so force light status-bar
  // content while Home is focused, then hand back to the theme default.
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle(th.statusBar);
  }, [th.statusBar]));

  // ── load the ACTIVE person (birth details + Moon sign) ───────────────────────
  useEffect(() => {
    if (profilesLoading) return;
    if (!activeId) { if (members.length === 0) router.replace('/profile'); return; }

    let cancelled = false;
    (async () => {
      setEntry('loading');
      setPanchang(null); setNumerology(null); setRetro(null); setSade(null);

      const { data } = await supabase
        .from('profiles').select('id, name, dob, birth_place, latitude, longitude, kundli_chart')
        .eq('id', activeId).maybeSingle();
      if (cancelled) return;
      if (!data) { router.replace('/profile'); return; }

      const moonSign: string | undefined = data.kundli_chart?.moon_sign;
      setProfile({
        id: data.id, name: data.name, dob: data.dob, birthPlace: data.birth_place,
        lat: data.latitude, lng: data.longitude, moonSign,
      });
      setEntry(moonSign ? 'ready' : 'need_kundli');
    })();
    return () => { cancelled = true; };
  }, [activeId, profilesLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const switcherOpts: Option[] = [
    ...members.map((m) => ({
      label: m.name,
      value: m.id,
      sublabel: (m.relation === 'self' ? 'You' : RELATION_LABEL[m.relation] ?? 'Family')
        + (m.moonSign ? ` · Moon in ${m.moonSign}` : ''),
    })),
    { label: 'Manage family', value: '__manage' },
  ];
  function onSwitch(value: string) {
    setSwitcher(false);
    if (value === '__manage') { router.push('/family'); return; }
    if (value !== activeId) { setActive(value); track('active_profile_switched'); }
  }

  // ── load Panchang (cached per city/day) + Numerology (computed once) ─────────
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const num = await getNumerology({ id: profile.id, name: profile.name, dob: profile.dob });
      if (!cancelled) setNumerology(num);
      const p = await getPanchang(profile.id);
      if (!cancelled && !p.error) setPanchang(p);
      const r = await getRetrograde();
      if (!cancelled) setRetro(r);
      if (profile.moonSign) {
        const ss = await getSadeSati(profile.moonSign);
        if (!cancelled) setSade(ss);
      }
    })();
    return () => { cancelled = true; };
  }, [profile]);

  function goChat() {
    track('home_hook_clicked', { source: 'promo_card' });
    router.push('/(tabs)/chat');
  }

  // ── renders ──────────────────────────────────────────────────────────────────
  if (entry === 'loading') {
    return <View style={styles.loading}><ActivityIndicator color={th.gold} size="large" /></View>;
  }

  const firstName = profile?.name?.trim().split(/\s+/)[0] || 'Seeker';
  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dayKey = today.toISOString().slice(0, 10);
  const sign = profile?.moonSign;

  const stats: { label: string; icon: IconName; pct: number }[] = sign ? [
    { label: 'LUCK', icon: 'star', pct: seededPct(`${sign}${dayKey}luck`) },
    { label: 'LOVE', icon: 'heart', pct: seededPct(`${sign}${dayKey}love`) },
    { label: 'FOCUS', icon: 'eye', pct: seededPct(`${sign}${dayKey}focus`) },
    { label: 'CAREER', icon: 'briefcase', pct: seededPct(`${sign}${dayKey}career`) },
  ] : [];

  const features: { icon: IconName; accent: AccentName; title: string; sub: string; onPress: () => void }[] = profile ? [
    {
      icon: 'panchang', accent: 'saffron', title: 'Panchang',
      sub: panchang ? `${panchang.tithi} · ${panchang.nakshatra?.split(' (')[0]}` : 'Today’s almanac & timings',
      onPress: () => router.push({ pathname: '/panchang', params: { profileId: profile.id } }),
    },
    {
      icon: 'numerology', accent: 'amethyst', title: 'Numerology',
      sub: numerology ? `Life Path ${numerology.life_path.number} · Expr ${numerology.expression.number}` : 'Your core birth numbers',
      onPress: () => router.push({ pathname: '/numerology', params: { profileId: profile.id } }),
    },
    {
      icon: 'muhurat', accent: 'emerald', title: 'Shubh Muhurat',
      sub: 'Auspicious dates for plans',
      onPress: () => router.push({ pathname: '/muhurat', params: { profileId: profile.id } }),
    },
    {
      icon: 'temple', accent: 'ruby', title: 'Live Darshan',
      sub: 'Live aarti from temples',
      onPress: () => router.push('/darshan'),
    },
    {
      icon: 'activity', accent: 'sapphire', title: 'Vakri',
      sub: retro
        ? (retro.current.length
            ? `${retro.current.map((c) => PLANET_LABEL[c.planet].split(' ')[0]).join(', ')} vakri now`
            : 'No planets vakri now')
        : 'Vakri planet tracker',
      onPress: () => router.push({ pathname: '/retrograde', params: { profileId: profile.id } }),
    },
    {
      icon: 'clock', accent: 'turquoise', title: 'Sade Sati',
      sub: sade
        ? (sade.active ? `Phase ${sade.phase} of 3 · active` : 'Not in Sade Sati')
        : 'Your Shani cycle status',
      onPress: () => router.push({ pathname: '/sadesati', params: { profileId: profile.id } }),
    },
  ] : [];

  return (
    <>
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.md }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Gradient brand header ─────────────────────────────────────────────── */}
      <LinearGradient
        colors={th.gHeader}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + Spacing.md }]}
      >
        {/* faint constellation flourish */}
        <Icon name="sparkle" size={150} color="rgba(255,255,255,0.06)" style={styles.headerGlyph} />

        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View style={styles.brandTile}>
              <Image source={require('../../assets/logo-transparent.png')} style={styles.brandMark} />
            </View>
            <Text style={styles.brandName}>Ritham</Text>
          </View>
          <View style={styles.headerActions}>
            {activeId && (
              <Pressable
                style={styles.kundliBtn}
                onPress={() => router.push({ pathname: '/profile', params: { id: activeId } })}
                android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
              >
                <Icon name="moon" size={14} color="#FFFFFF" />
                <Text style={styles.kundliBtnText}>Kundli</Text>
              </Pressable>
            )}
            <GlassIcon icon="settings" onPress={() => router.push('/settings')} />
          </View>
        </View>

        <Text style={styles.cosmicEyebrow}>TODAY’S COSMIC INSIGHT</Text>
        <Text style={styles.dateLine}>{dateLabel}</Text>
        <Pressable
          style={styles.helloRow}
          onPress={() => setSwitcher(true)}
          disabled={members.length === 0}
          android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
        >
          <Text style={styles.hello} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            Hello, {firstName}
          </Text>
          {members.length > 0 && <Icon name="chevronDown" size={22} color="#FFFFFF" style={{ marginTop: 4 }} />}
        </Pressable>
      </LinearGradient>

      <View style={styles.body}>
        {entry === 'need_kundli' ? (
          <Reveal index={0} style={styles.overlap}>
            <View style={styles.readingCard}>
              <Text style={styles.readingLabel}>ONE STEP LEFT</Text>
              <Text style={styles.kundliTitle}>Finish your Kundli</Text>
              <Text style={styles.kundliBody}>
                Your birth chart isn’t ready yet. Complete your Kundli to unlock your daily,
                weekly, and monthly horoscope.
              </Text>
              <Pressable style={styles.ctaBtn} onPress={() => router.push('/profile')}>
                <Text style={styles.ctaBtnText}>Complete your Kundli</Text>
                <Icon name="arrowRight" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          </Reveal>
        ) : (
          /* ── AI-predicted reading card (overlaps the header) ─────────────────── */
          <Reveal index={0} style={styles.overlap}>
            <View style={styles.readingCard}>
              <Text style={styles.readingLabel}>Your AI-Predicted Reading</Text>
              <Text style={styles.readingSign}>{sign ?? '—'}</Text>

              <View style={styles.statGrid}>
                {stats.map((s) => (
                  <View key={s.label} style={styles.statCell}>
                    <View style={styles.statChip}>
                      <Icon name={s.icon} size={15} color={th.gold} />
                    </View>
                    <View style={styles.statText}>
                      <View style={styles.statTopRow}>
                        <Text style={styles.statLabel}>{s.label}</Text>
                        <Text style={styles.statPct}>{s.pct}%</Text>
                      </View>
                      <View style={styles.statTrack}>
                        <LinearGradient
                          colors={th.gHeader}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={[styles.statFill, { width: `${s.pct}%` }]}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <Pressable
                style={styles.readFull}
                onPress={() => router.push({ pathname: '/horoscope', params: { profileId: profile!.id, moonSign: sign ?? '' } })}
                android_ripple={{ color: th.goldFaint }}
              >
                <Text style={styles.readFullText}>Read full horoscope</Text>
                <Icon name="arrowRight" size={15} color={th.gold} />
              </Pressable>
            </View>
          </Reveal>
        )}

        {/* ── Ask-the-astrologer gradient promo ──────────────────────────────────── */}
        {profile && (
          <Reveal index={1}>
            <Pressable onPress={goChat} android_ripple={{ color: 'rgba(255,255,255,0.12)' }} style={styles.promoWrap}>
              <LinearGradient
                colors={['#FF3D9A', '#7B2CBF']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.promo}
              >
                {/* astrologer — bottom-right, blended into the gradient */}
                <Image source={require('../../assets/promo-astrologer.png')} style={styles.promoAstro} />
                <LinearGradient
                  colors={['#C51E86', 'rgba(150,40,180,0.35)', 'transparent']}
                  locations={[0, 0.5, 1]}
                  start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0 }}
                  style={styles.promoAstroFade}
                  pointerEvents="none"
                />
                <View style={styles.promoTextCol}>
                  <View style={styles.promoBadge}><Text style={styles.promoBadgeText}>LIVE AI</Text></View>
                  <Text style={styles.promoH}>Got a question?</Text>
                  <Text style={styles.promoSub}>Chat with your AI Astrologer</Text>
                  <View style={styles.promoBtn}>
                    <Text style={styles.promoBtnText}>Chat Now</Text>
                    <Icon name="arrowRight" size={15} color="#7B2CBF" />
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
          </Reveal>
        )}

        {/* ── Starsights & predictions grid ──────────────────────────────────────── */}
        {profile && (
          <>
            <Reveal index={2}>
              <Text style={styles.sectionTitle}>Starsights & Predictions</Text>
            </Reveal>
            <View style={styles.grid}>
              {features.map((f, i) => (
                <FeatureCard key={f.title} index={3 + i} {...f} />
              ))}
            </View>
          </>
        )}

        <Reveal index={9}>
          <Text style={styles.disclaimer}>
            Horoscopes and readings are for guidance and reflection, not a substitute for
            professional advice.
          </Text>
        </Reveal>
        <View style={{ height: Spacing.xl }} />
      </View>
    </ScrollView>

    <SelectModal
      visible={switcher}
      title="Who is this for?"
      options={switcherOpts}
      selectedValue={activeId ?? undefined}
      onSelect={onSwitch}
      onClose={() => setSwitcher(false)}
    />
    </>
  );
}

// ── small building blocks ──────────────────────────────────────────────────────
function GlassIcon({ icon, onPress }: { icon: IconName; onPress: () => void }) {
  const styles = makeStyles(useColors());
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.18)', borderless: true, radius: 22 }}
      style={styles.glassIcon}
    >
      <Icon name={icon} size={19} color="#FFFFFF" />
    </Pressable>
  );
}

function FeatureCard({
  index, icon, accent, title, sub, onPress,
}: { index: number; icon: IconName; accent: AccentName; title: string; sub: string; onPress: () => void }) {
  const th = useColors();
  const styles = makeStyles(th);
  return (
    <Reveal index={index} style={styles.gridItem}>
      <Pressable style={styles.featCard} android_ripple={{ color: th.goldFaint }} onPress={onPress}>
        <View style={styles.featTop}>
          <LinearGradient
            colors={Accents[accent].grad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.featChip}
          >
            <Icon name={icon} size={22} color="#FFFFFF" />
          </LinearGradient>
          <View style={styles.featArrow}>
            <Icon name="arrowRight" size={14} color={th.gold} />
          </View>
        </View>
        <Text style={styles.featTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.9}>{title}</Text>
        <Text style={styles.featSub} numberOfLines={2}>{sub}</Text>
      </Pressable>
    </Reveal>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  loading: { flex: 1, backgroundColor: th.canvas, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1, backgroundColor: th.canvas },

  // ── header ──
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.lg,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  headerGlyph: { position: 'absolute', right: -24, top: 24 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTile: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
  brandMark: { width: 34, height: 34, resizeMode: 'contain' },
  brandName: { fontFamily: Fonts.displayBold, fontSize: 26, color: '#FFFFFF', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  kundliBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 38,
    paddingHorizontal: Spacing.md, borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  kundliBtnText: { fontFamily: Fonts.bodySemibold, color: '#FFFFFF', fontSize: Fonts.size.sm },
  glassIcon: {
    width: 38, height: 38, borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  cosmicEyebrow: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.xs, color: 'rgba(255,255,255,0.9)', letterSpacing: 2.5 },
  dateLine: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: 'rgba(255,255,255,0.72)', marginTop: 6 },
  helloRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.sm },
  hello: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.hero - 4, color: '#FFFFFF', letterSpacing: 0.3, flexShrink: 1 },

  // ── body ──
  body: { paddingHorizontal: Spacing.lg },
  overlap: { marginTop: -Spacing.xxl },

  // reading card (white, overlapping header)
  readingCard: {
    backgroundColor: th.surface, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: th.border, ...Depth.raised,
  },
  readingLabel: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.textMuted, letterSpacing: 0.3 },
  readingSign: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.gold, marginTop: 2, marginBottom: Spacing.md },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.md, rowGap: Spacing.md },
  statCell: { flexDirection: 'row', alignItems: 'center', gap: 8, width: (CARD_W - Spacing.lg) - 4 },
  statChip: {
    width: 30, height: 30, borderRadius: 9, backgroundColor: th.goldFaint,
    alignItems: 'center', justifyContent: 'center',
  },
  statText: { flex: 1 },
  statTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statLabel: { fontFamily: Fonts.bodySemibold, fontSize: 10.5, color: th.textMuted, letterSpacing: 0.8 },
  statPct: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.sm, color: th.text },
  statTrack: { height: 5, borderRadius: 3, backgroundColor: th.surfaceSunken, marginTop: 5, overflow: 'hidden' },
  statFill: { height: 5, borderRadius: 3 },

  readFull: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: Spacing.lg, paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: th.borderStrong,
  },
  readFullText: { fontFamily: Fonts.bodySemibold, color: th.gold, fontSize: Fonts.size.md, letterSpacing: 0.2 },

  // need-kundli variant
  kundliTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, marginTop: 4, marginBottom: Spacing.sm },
  kundliBody: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 21 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: th.goldSurface, borderRadius: Radius.md, paddingVertical: 14, marginTop: Spacing.md,
  },
  ctaBtnText: { fontFamily: Fonts.bodySemibold, color: '#FFFFFF', fontSize: Fonts.size.md, letterSpacing: 0.3 },

  // promo
  promoWrap: { marginTop: Spacing.lg, borderRadius: Radius.xl, overflow: 'hidden', ...Depth.card },
  promo: { flexDirection: 'row', alignItems: 'center', minHeight: 178, paddingLeft: Spacing.lg, position: 'relative' },
  promoTextCol: { flex: 1, paddingVertical: Spacing.md, paddingRight: 92, zIndex: 2 },
  promoAstro: { position: 'absolute', right: 0, bottom: 0, height: 182, width: 156, resizeMode: 'contain' },
  promoAstroFade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },
  promoBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: Radius.pill, paddingVertical: 3, paddingHorizontal: 10, marginBottom: 8,
  },
  promoBadgeText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: '#FFFFFF', letterSpacing: 1.2 },
  promoH: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: '#FFFFFF' },
  promoSub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  promoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF', borderRadius: Radius.pill, paddingVertical: 9, paddingHorizontal: 16, marginTop: Spacing.md,
  },
  promoBtnText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.sm, color: '#7B2CBF' },

  // grid
  sectionTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, marginTop: Spacing.xl, marginBottom: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridItem: { width: CARD_W, marginBottom: GRID_GAP },
  featCard: {
    backgroundColor: th.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border, minHeight: 150, ...Depth.card,
  },
  featTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.sm },
  featChip: {
    width: 48, height: 48, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  featArrow: {
    width: 28, height: 28, borderRadius: Radius.pill,
    backgroundColor: th.goldFaint, alignItems: 'center', justifyContent: 'center',
  },
  featTitle: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: th.text, lineHeight: 20, minHeight: 40 },
  featSub: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted, marginTop: 2, lineHeight: 16 },

  disclaimer: {
    fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, lineHeight: 17,
    textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.md,
  },
});
