import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getPanchang, Panchang } from '../../lib/panchangService';
import { getNumerology } from '../../lib/numerologyService';
import { getRetrograde, getSadeSati, RetrogradeStatus, SadeSatiStatus } from '../../lib/kundliService';
import { PLANET_LABEL } from '../../config/retrogradeMeanings';
import { Numerology } from '../../lib/numerology';
import { track } from '../../lib/analytics';
import { Colors, Fonts, Spacing, Radius, Type, Depth, AccentName, ThemeColors } from '../../constants/theme';
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

  // ── load the ACTIVE person (birth details + Moon sign) ───────────────────────
  // Everything on Home follows the active family member: horoscope, panchang,
  // numerology and muhurat all receive this profile's id.
  useEffect(() => {
    if (profilesLoading) return;
    // No people at all → guided onboarding (create self).
    if (!activeId) { if (members.length === 0) router.replace('/profile'); return; }

    let cancelled = false;
    (async () => {
      setEntry('loading');
      // switching person: drop the previous person's cached content
      setPanchang(null); setNumerology(null); setRetro(null); setSade(null);

      // NOTE: do NOT select `numerology` here — that column only exists after
      // migration 010; selecting a missing column rejects the whole query.
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

  // person switcher options: each family member + a "Manage family" entry
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
      // transit trackers (deterministic, day-cached, no AI/provider call)
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

  const firstName = profile?.name?.trim().split(/\s+/)[0];

  return (
    <>
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
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setSwitcher(true)}
            disabled={members.length === 0}
            android_ripple={{ color: th.goldFaint }}
          >
            <Text style={styles.eyebrow}>NAMASTE</Text>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{firstName || 'Seeker'}</Text>
              {members.length > 0 && (
                <Icon name="chevronDown" size={22} color={th.gold} style={{ marginTop: 8 }} />
              )}
            </View>
            {profile?.moonSign ? (
              <View style={styles.moonChip}>
                <Icon name="moon" size={13} color={th.gold} />
                <Text style={styles.rashi} numberOfLines={1}>{profile.moonSign}</Text>
              </View>
            ) : (
              <Text style={styles.accountLine}>{user?.email ?? ''}</Text>
            )}
          </Pressable>
          <View style={styles.headerBtns}>
            {activeId && (
              <Pressable
                style={styles.kundliBtn}
                onPress={() => router.push({ pathname: '/profile', params: { id: activeId } })}
                android_ripple={{ color: th.goldFaint }}
              >
                <Icon name="moon" size={15} color={th.gold} />
                <Text style={styles.kundliBtnText}>My Kundli</Text>
              </Pressable>
            )}
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
              <Icon name="arrowRight" size={16} color={th.goldContrast} />
            </Pressable>
          </View>
        </Reveal>
      ) : (
        /* Ask-the-astrologer promo → chat (top of Home) */
        <Reveal index={1}>
          <Pressable style={styles.promoCard} onPress={goChat} android_ripple={{ color: 'rgba(255,255,255,0.08)' }}>
            <View style={styles.promoRibbon}><Text style={styles.promoRibbonText}>NEW</Text></View>
            <Image source={require('../../assets/android-icon-foreground.png')} style={styles.promoImg} />
            <View style={styles.promoContent}>
              <Text style={styles.promoH}>Got any questions?</Text>
              <Text style={styles.promoSubW}>Chat with Astrologer</Text>
              <View style={styles.promoPriceRow}>
                <Text style={styles.promoPrice}>@INR 5/min</Text>
                <View style={styles.promoBtn}><Text style={styles.promoBtnText}>Chat Now</Text></View>
              </View>
            </View>
          </Pressable>
        </Reveal>
      )}

      {/* ── Secondary free features ─────────────────────────────────────────────── */}
      {profile ? (
        <>
          <Reveal index={2}>
            <Text style={styles.sectionEyebrow}>MORE FOR YOU</Text>
          </Reveal>

          <FeatureRow
            index={3} icon="star" accent="gold" title="Your Horoscope"
            sub="Daily, weekly & monthly readings"
            onPress={() => router.push({ pathname: '/horoscope', params: { profileId: profile.id, moonSign: profile.moonSign ?? '' } })}
          />
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
          <FeatureRow
            index={7} icon="activity" accent="sapphire" title="Retrograde (Vakri) Tracker"
            sub={retro
              ? (retro.current.length
                  ? `${retro.current.map((c) => PLANET_LABEL[c.planet].split(' ')[0]).join(', ')} retrograde now`
                  : 'No planets retrograde right now')
              : 'Which planets are vakri now'}
            onPress={() => router.push({ pathname: '/retrograde', params: { profileId: profile.id } })}
          />
          <FeatureRow
            index={8} icon="clock" accent="turquoise" title="Sade Sati Tracker"
            sub={sade
              ? (sade.active ? `Phase ${sade.phase} of 3 · in progress` : 'You are not in Sade Sati')
              : 'Where you stand in Shani’s cycle'}
            onPress={() => router.push({ pathname: '/sadesati', params: { profileId: profile.id } })}
          />
        </>
      ) : null}

      {/* Astrology disclaimer */}
      <Reveal index={9}>
        <Text style={styles.disclaimer}>
          Horoscopes and readings are for guidance and reflection, not a substitute for
          professional advice.
        </Text>
      </Reveal>
      <View style={{ height: Spacing.xl }} />
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
function IconButton({ icon, onPress }: { icon: IconName; onPress: () => void }) {
  const th = useColors();
  const styles = makeStyles(th);
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: th.goldFaint, borderless: true, radius: 22 }}
      style={styles.iconBtn}
    >
      <Icon name={icon} size={20} color={th.gold} />
    </Pressable>
  );
}

function FeatureRow({
  index, icon, title, sub, onPress,
}: { index: number; icon: IconName; accent: AccentName; title: string; sub: string; onPress: () => void }) {
  const styles = makeStyles(useColors());
  return (
    <Reveal index={index}>
      <Pressable
        style={styles.featCard}
        android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
        onPress={onPress}
      >
        <View style={styles.featIconCircle}>
          <Icon name={icon} size={22} color="#111111" />
        </View>
        <View style={styles.featBody}>
          <Text style={styles.featTitle}>{title}</Text>
          <Text style={styles.featSub} numberOfLines={2}>{sub}</Text>
        </View>
        <View style={styles.featBtn}><Text style={styles.featBtnText}>View</Text></View>
      </Pressable>
    </Reveal>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  loading: { flex: 1, backgroundColor: th.canvas, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1, backgroundColor: th.canvas },
  content: { paddingHorizontal: Spacing.lg },

  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.xl },
  eyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2.5, textTransform: 'uppercase' as const, marginBottom: 6 },
  name: { fontFamily: Fonts.displayBold, fontSize: 32, color: th.text, lineHeight: 38, flexShrink: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moonChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: Spacing.sm, paddingVertical: 5, paddingHorizontal: Spacing.md,
    backgroundColor: th.goldFaint, borderRadius: Radius.pill,
    borderWidth: 1, borderColor: th.border, maxWidth: '100%',
  },
  rashi: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.goldLight, letterSpacing: 0.3, flexShrink: 1 },
  accountLine: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: 4 },
  headerBtns: { flexDirection: 'row', gap: Spacing.sm, marginLeft: Spacing.md, marginTop: 4 },
  iconBtn: {
    width: 42, height: 42, borderRadius: Radius.pill,
    backgroundColor: th.surface, borderWidth: 1, borderColor: th.border,
    alignItems: 'center', justifyContent: 'center',
  },
  kundliBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 42,
    paddingHorizontal: Spacing.md, borderRadius: Radius.pill,
    backgroundColor: th.surface, borderWidth: 1, borderColor: th.border,
  },
  kundliBtnText: { fontFamily: Fonts.bodySemibold, color: th.gold, fontSize: Fonts.size.sm },

  sectionEyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2.5, textTransform: 'uppercase' as const, marginTop: Spacing.xl, marginBottom: Spacing.md },

  // underline segmented control
  segment: { flexDirection: 'row', gap: Spacing.xl, marginBottom: Spacing.md },
  segmentBtn: { alignItems: 'center' },
  segmentText: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.md, color: th.textDim, paddingBottom: 6 },
  segmentTextActive: { color: th.text },
  segmentRule: { height: 1.5, width: 20, borderRadius: 2, backgroundColor: 'transparent' },
  segmentRuleActive: { backgroundColor: th.gold },

  heroCard: {
    backgroundColor: th.surface, borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 1, borderColor: th.border, ...Depth.card,
  },
  heroCardPad: { padding: Spacing.lg },
  heroTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, marginBottom: Spacing.sm },
  quoteMark: {
    fontFamily: Fonts.displayBold, fontSize: 44, color: th.gold,
    height: 34, marginBottom: -4, opacity: 0.9,
  },
  horoBody: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.text, lineHeight: 25 },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 6,
    marginTop: Spacing.md, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: th.borderStrong, borderRadius: Radius.pill,
  },
  shareText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.sm },

  // Ask-the-astrologer promo card — black banner w/ green NEW ribbon + yellow CTA
  promoCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: Radius.lg,
    marginTop: Spacing.lg,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 118,
    ...Depth.card,
  },
  promoRibbon: {
    position: 'absolute', top: 14, left: -30, width: 116, zIndex: 2,
    backgroundColor: '#33A63A',
    alignItems: 'center', paddingVertical: 3,
    transform: [{ rotate: '-45deg' }],
  },
  promoRibbonText: { fontFamily: Fonts.bodyBold, fontSize: 11, color: '#FFFFFF', letterSpacing: 1 },
  promoImg: { width: 116, height: 116, resizeMode: 'contain' },
  promoContent: { flex: 1, paddingVertical: Spacing.md, paddingRight: Spacing.md, paddingLeft: Spacing.xs },
  promoH: { fontFamily: Fonts.bodyBold, fontSize: 20, color: '#FFFFFF' },
  promoSubW: { fontFamily: Fonts.body, fontSize: 14, color: '#FFFFFF', marginTop: 3 },
  promoPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  promoPrice: { fontFamily: Fonts.bodyBold, fontSize: 18, color: '#FFFFFF' },
  promoBtn: { backgroundColor: '#F5C518', borderRadius: Radius.pill, paddingVertical: 9, paddingHorizontal: 16 },
  promoBtnText: { fontFamily: Fonts.bodyBold, fontSize: 14, color: '#111111' },
  bodyMuted: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 21 },
  horoLoading: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },

  retryBtn: {
    marginTop: Spacing.sm, borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
  },
  retryText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.sm },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 14,
    marginTop: Spacing.md,
  },
  ctaBtnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },

  // feature cards — black banner w/ yellow icon + CTA (matches the promo card)
  featCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: '#0A0A0A', borderRadius: Radius.lg, padding: Spacing.md,
    marginTop: Spacing.md,
    ...Depth.card,
  },
  featIconCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#F5C518', alignItems: 'center', justifyContent: 'center',
  },
  featBody: { flex: 1 },
  featTitle: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: '#FFFFFF' },
  featSub: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: 'rgba(255,255,255,0.65)', marginTop: 2, lineHeight: 16 },
  featBtn: { backgroundColor: '#F5C518', borderRadius: Radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  featBtnText: { fontFamily: Fonts.bodyBold, fontSize: 13, color: '#111111' },

  disclaimer: {
    fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, lineHeight: 17,
    textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.md,
  },
});
