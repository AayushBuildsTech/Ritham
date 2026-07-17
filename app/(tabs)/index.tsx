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
import { useLanguage } from '../../context/LanguageContext';
import { hiSign, hiNakshatra, hiGraha } from '../../lib/astroHindi';
import { useActiveProfile, RELATION_LABEL } from '../../context/ProfileContext';
import { Icon, IconName } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { SelectModal, Option } from '../../components/SelectModal';
import { FeatureCarousel, CarouselSlide } from '../../components/FeatureCarousel';
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

// English sign → rashi asset key (base word before the Sanskrit paren).
const RASHI_KEY: Record<string, string> = {
  Aries: 'mesha', Taurus: 'vrishabha', Gemini: 'mithuna', Cancer: 'karka',
  Leo: 'simha', Virgo: 'kanya', Libra: 'tula', Scorpio: 'vrishchika',
  Sagittarius: 'dhanu', Capricorn: 'makara', Aquarius: 'kumbha', Pisces: 'meena',
};
const rashiKey = (sign: string) => RASHI_KEY[sign.split(' (')[0].trim()] ?? '';

// Pictorial Vedic rashi symbols. Drop 512×512 transparent silhouettes into
// assets/rashi/<key>.png and uncomment the matching line — the reading-card
// watermark then shows the image (tinted + faded); until then it falls back to
// the Devanagari rashi name. Keys must match RASHI_KEY above.
const RASHI_IMAGE: Record<string, any> = {
  mesha: require('../../assets/rashi/mesha.png'),
  vrishabha: require('../../assets/rashi/vrishabha.png'),
  mithuna: require('../../assets/rashi/mithuna.png'),
  karka: require('../../assets/rashi/karka.png'),
  simha: require('../../assets/rashi/simha.png'),
  kanya: require('../../assets/rashi/kanya.png'),
  tula: require('../../assets/rashi/tula.png'),
  vrishchika: require('../../assets/rashi/vrishchika.png'),
  dhanu: require('../../assets/rashi/dhanu.png'),
  makara: require('../../assets/rashi/makara.png'),
  kumbha: require('../../assets/rashi/kumbha.png'),
  meena: require('../../assets/rashi/meena.png'),
};

export default function HomeScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { t, isHindi } = useLanguage();
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
      sublabel: (m.relation === 'self' ? (isHindi ? 'आप' : 'You') : RELATION_LABEL[m.relation] ?? (isHindi ? 'परिवार' : 'Family'))
        + (m.moonSign ? ` · ${isHindi ? 'चंद्र' : 'Moon in'} ${m.moonSign}` : ''),
    })),
    { label: isHindi ? 'परिवार प्रबंधित करें' : 'Manage family', value: '__manage' },
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

  const firstName = profile?.name?.trim().split(/\s+/)[0] || (isHindi ? 'जिज्ञासु' : 'Seeker');
  const today = new Date();
  const dateLabel = today.toLocaleDateString(isHindi ? 'hi-IN' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dayKey = today.toISOString().slice(0, 10);
  const sign = profile?.moonSign;

  const stats: { label: string; icon: IconName; pct: number }[] = sign ? [
    { label: isHindi ? 'भाग्य' : 'LUCK', icon: 'star', pct: seededPct(`${sign}${dayKey}luck`) },
    { label: isHindi ? 'प्रेम' : 'LOVE', icon: 'heart', pct: seededPct(`${sign}${dayKey}love`) },
    { label: isHindi ? 'एकाग्रता' : 'FOCUS', icon: 'eye', pct: seededPct(`${sign}${dayKey}focus`) },
    { label: isHindi ? 'करियर' : 'CAREER', icon: 'briefcase', pct: seededPct(`${sign}${dayKey}career`) },
  ] : [];

  const features: { icon: IconName; accent: AccentName; title: string; sub: string; onPress: () => void }[] = profile ? [
    {
      icon: 'puja', accent: 'ruby', title: isHindi ? 'पूजा बुक करें' : 'Book a Puja',
      sub: isHindi ? 'रामेश्वरम् में पितृ दोष निवारण पूजा' : 'Pitra Dosha Puja at Rameswaram',
      onPress: () => router.push('/puja' as any),
    },
    {
      icon: 'panchang', accent: 'saffron', title: isHindi ? 'पंचांग' : 'Panchang',
      sub: panchang ? `${panchang.tithi} · ${isHindi ? hiNakshatra(panchang.nakshatra?.split(' (')[0] ?? '') : panchang.nakshatra?.split(' (')[0]}` : (isHindi ? 'आज का पंचांग और समय' : 'Today’s almanac & timings'),
      onPress: () => router.push({ pathname: '/panchang', params: { profileId: profile.id } }),
    },
    {
      icon: 'numerology', accent: 'amethyst', title: isHindi ? 'अंक ज्योतिष' : 'Numerology',
      sub: numerology ? `${isHindi ? 'जीवन पथ' : 'Life Path'} ${numerology.life_path.number} · ${isHindi ? 'भाग्य' : 'Expr'} ${numerology.expression.number}` : (isHindi ? 'आपके मूल जन्मांक' : 'Your core birth numbers'),
      onPress: () => router.push({ pathname: '/numerology', params: { profileId: profile.id } }),
    },
    {
      icon: 'muhurat', accent: 'emerald', title: isHindi ? 'शुभ मुहूर्त' : 'Shubh Muhurat',
      sub: isHindi ? 'योजनाओं के लिए शुभ तिथियां' : 'Auspicious dates for plans',
      onPress: () => router.push({ pathname: '/muhurat', params: { profileId: profile.id } }),
    },
    {
      icon: 'temple', accent: 'ruby', title: isHindi ? 'लाइव दर्शन' : 'Live Darshan',
      sub: isHindi ? 'मंदिरों से लाइव आरती' : 'Live aarti from temples',
      onPress: () => router.push('/darshan'),
    },
    {
      icon: 'activity', accent: 'sapphire', title: isHindi ? 'वक्री' : 'Vakri',
      sub: retro
        ? (retro.current.length
            ? `${retro.current.map((c) => { const en = PLANET_LABEL[c.planet].split(' ')[0]; return isHindi ? hiGraha(en) : en; }).join(', ')} ${isHindi ? 'अभी वक्री' : 'vakri now'}`
            : (isHindi ? 'अभी कोई ग्रह वक्री नहीं' : 'No planets vakri now'))
        : (isHindi ? 'वक्री ग्रह ट्रैकर' : 'Vakri planet tracker'),
      onPress: () => router.push({ pathname: '/retrograde', params: { profileId: profile.id } }),
    },
    {
      icon: 'clock', accent: 'turquoise', title: isHindi ? 'साढ़े साती' : 'Sade Sati',
      sub: sade
        ? (sade.active ? `${isHindi ? 'चरण' : 'Phase'} ${sade.phase}/3 · ${isHindi ? 'सक्रिय' : 'active'}` : (isHindi ? 'साढ़े साती में नहीं' : 'Not in Sade Sati'))
        : (isHindi ? 'आपकी शनि दशा की स्थिति' : 'Your Shani cycle status'),
      onPress: () => router.push({ pathname: '/sadesati', params: { profileId: profile.id } }),
    },
    {
      icon: 'dream', accent: 'amethyst', title: isHindi ? 'स्वप्न फल' : 'Dream Oracle',
      sub: isHindi ? 'अपने सपने का अर्थ जानें' : 'Decode what your dream means',
      onPress: () => router.push({ pathname: '/dream', params: { profileId: profile.id } }),
    },
    {
      icon: 'palmreading', accent: 'amber', title: isHindi ? 'हस्तरेखा' : 'Palm Reading',
      sub: isHindi ? 'अपने हाथ की रेखाओं का अर्थ' : 'Read your palm, decode your path',
      onPress: () => router.push({ pathname: '/palmreading' as any, params: { profileId: profile.id } }),
    },
  ] : [];

  // ── auto-carousel: chat (unchanged) + every feature ─────────────────────────
  const B = { free: isHindi ? 'निःशुल्क' : 'FREE', live: isHindi ? 'लाइव' : 'LIVE' };
  const carouselSlides: CarouselSlide[] = profile ? [
    {
      key: 'chat', icon: 'chat', badge: isHindi ? 'लाइव' : 'LIVE', title: isHindi ? 'कोई सवाल है?' : 'Got a question?',
      sub: isHindi ? 'अपने AI ज्योतिषी से बात करें' : 'Chat with your AI Astrologer', cta: isHindi ? 'अभी पूछें' : 'Chat Now',
      image: require('../../assets/promo-astrologer.png'), imageBottom: true, still: true, onPress: goChat,
    },
    {
      key: 'call', icon: 'phoneCall', badge: isHindi ? 'कॉल' : 'CALL', title: isHindi ? 'ज्योतिषी को कॉल करें' : 'Call your Astrologer',
      sub: isHindi ? 'फ़ोन पर अपने AI ज्योतिषी से बात करें' : 'Talk to your AI Astrologer by voice', cta: isHindi ? 'कॉल करें' : 'Call Now',
      image: require('../../assets/carousel/call.png'),
      onPress: () => router.push('/(tabs)/call'),
    },
    {
      key: 'panchang', icon: 'panchang', badge: B.free, title: isHindi ? 'आज का पंचांग' : 'Today’s Panchang',
      sub: isHindi ? 'तिथि, नक्षत्र और दैनिक समय' : 'Tithi, nakshatra & daily timings', cta: isHindi ? 'देखें' : 'View',
      image: require('../../assets/carousel/panchang.png'),
      onPress: () => router.push({ pathname: '/panchang', params: { profileId: profile.id } }),
    },
    {
      key: 'numerology', icon: 'numerology', badge: B.free, title: isHindi ? 'आपका अंक ज्योतिष' : 'Your Numerology',
      sub: isHindi ? 'आपके जन्म से मूल अंक' : 'Core numbers from your birth', cta: isHindi ? 'देखें' : 'View',
      image: require('../../assets/carousel/numerology.png'),
      onPress: () => router.push({ pathname: '/numerology', params: { profileId: profile.id } }),
    },
    {
      key: 'muhurat', icon: 'muhurat', badge: B.free, title: isHindi ? 'शुभ मुहूर्त' : 'Shubh Muhurat',
      sub: isHindi ? 'आपकी योजनाओं के लिए शुभ तिथियां' : 'Auspicious dates for your plans', cta: isHindi ? 'खोजें' : 'Find',
      image: require('../../assets/carousel/muhurat.png'),
      onPress: () => router.push({ pathname: '/muhurat', params: { profileId: profile.id } }),
    },
    {
      key: 'darshan', icon: 'temple', badge: B.live, title: isHindi ? 'लाइव दर्शन' : 'Live Darshan',
      sub: isHindi ? 'प्रमुख मंदिरों से आरती' : 'Aarti from major temples', cta: isHindi ? 'देखें' : 'Watch',
      image: require('../../assets/carousel/darshan.png'),
      onPress: () => router.push('/darshan'),
    },
    {
      key: 'vakri', icon: 'activity', badge: B.free, title: isHindi ? 'वक्री ट्रैकर' : 'Vakri Tracker',
      sub: isHindi ? 'अभी कौन-से ग्रह वक्री हैं' : 'Which planets are retrograde now', cta: isHindi ? 'देखें' : 'View',
      image: require('../../assets/carousel/vakri.png'),
      onPress: () => router.push({ pathname: '/retrograde', params: { profileId: profile.id } }),
    },
    {
      key: 'sadesati', icon: 'clock', badge: B.free, title: isHindi ? 'साढ़े साती' : 'Sade Sati',
      sub: isHindi ? 'शनि की दशा में आप कहाँ हैं' : 'Where you stand in Shani’s cycle', cta: isHindi ? 'देखें' : 'View',
      image: require('../../assets/carousel/sadesati.png'),
      onPress: () => router.push({ pathname: '/sadesati', params: { profileId: profile.id } }),
    },
    {
      key: 'dream', icon: 'dream', badge: B.free, title: isHindi ? 'स्वप्न फल' : 'Dream Oracle',
      sub: isHindi ? 'अपने सपने का अर्थ जानें' : 'Decode what your dream means', cta: isHindi ? 'देखें' : 'Read',
      image: require('../../assets/carousel/dream.png'),
      onPress: () => router.push({ pathname: '/dream', params: { profileId: profile.id } }),
    },
    {
      key: 'palmreading', icon: 'palmreading', badge: isHindi ? 'प्रीमियम' : 'PREMIUM', title: isHindi ? 'हस्तरेखा पठन' : 'Palm Reading',
      sub: isHindi ? 'आपकी नियति आपके हाथ में' : 'Your destiny, in your hands', cta: isHindi ? 'खोलें' : 'Reveal',
      image: require('../../assets/carousel/palmreading.png'),
      onPress: () => router.push({ pathname: '/palmreading' as any, params: { profileId: profile.id } }),
    },
    {
      key: 'puja', icon: 'puja', badge: isHindi ? 'नया' : 'NEW', title: isHindi ? 'पितृ दोष पूजा' : 'Pitra Dosha Puja',
      sub: isHindi ? 'रामेश्वरम् में पूर्वजों के लिए पूजा' : 'Ancestral rites at Rameswaram', cta: isHindi ? 'बुक करें' : 'Book',
      image: require('../../assets/puja/carousel.webp'),
      onPress: () => router.push('/puja' as any),
    },
    {
      key: 'store', icon: 'store', badge: isHindi ? 'स्टोर' : 'SHOP', title: isHindi ? 'रिदम स्टोर' : 'Ritham Store',
      sub: isHindi ? 'रत्न, माला और उपाय' : 'Gemstones, malas & remedies', cta: isHindi ? 'खोलें' : 'Open',
      image: require('../../assets/carousel/store.png'),
      onPress: () => router.push('/(tabs)/store'),
    },
    {
      key: 'reports', icon: 'reports', badge: isHindi ? 'प्रीमियम' : 'PREMIUM', title: isHindi ? 'विस्तृत रिपोर्ट' : 'Detailed Reports',
      sub: isHindi ? 'कुंडली, मिलान और वास्तु' : 'Kundli, matchmaking & Vastu', cta: isHindi ? 'देखें' : 'Explore',
      image: require('../../assets/carousel/reports.png'),
      onPress: () => router.push('/(tabs)/reports'),
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
                <Text style={styles.kundliBtnText}>{isHindi ? 'कुंडली' : 'Kundli'}</Text>
              </Pressable>
            )}
            <GlassIcon icon="settings" onPress={() => router.push('/settings')} />
          </View>
        </View>

        <Text style={styles.cosmicEyebrow}>{isHindi ? 'आज की कॉस्मिक अंतर्दृष्टि' : 'TODAY’S COSMIC INSIGHT'}</Text>
        <Text style={styles.dateLine}>{dateLabel}</Text>
        <Pressable
          style={styles.helloRow}
          onPress={() => setSwitcher(true)}
          disabled={members.length === 0}
          android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
        >
          <Text style={styles.hello} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {isHindi ? `नमस्ते, ${firstName}` : `Hello, ${firstName}`}
          </Text>
          {members.length > 0 && <Icon name="chevronDown" size={22} color="#FFFFFF" style={{ marginTop: 4 }} />}
        </Pressable>
      </LinearGradient>

      <View style={styles.body}>
        {entry === 'need_kundli' ? (
          <Reveal index={0} style={styles.overlap}>
            <View style={styles.readingCard}>
              <Text style={styles.readingLabel}>{isHindi ? 'एक कदम शेष' : 'ONE STEP LEFT'}</Text>
              <Text style={styles.kundliTitle}>{isHindi ? 'अपनी कुंडली पूरी करें' : 'Finish your Kundli'}</Text>
              <Text style={styles.kundliBody}>
                {isHindi
                  ? 'आपकी जन्म कुंडली अभी तैयार नहीं है। दैनिक, साप्ताहिक और मासिक राशिफल पाने के लिए अपनी कुंडली पूरी करें।'
                  : 'Your birth chart isn’t ready yet. Complete your Kundli to unlock your daily, weekly, and monthly horoscope.'}
              </Text>
              <Pressable style={styles.ctaBtn} onPress={() => router.push('/profile')}>
                <Text style={styles.ctaBtnText}>{isHindi ? 'अपनी कुंडली पूरी करें' : 'Complete your Kundli'}</Text>
                <Icon name="arrowRight" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          </Reveal>
        ) : (
          /* ── AI-predicted reading card (overlaps the header) ─────────────────── */
          <Reveal index={0} style={styles.overlap}>
            <View style={styles.readingCard}>
              {sign && (
                <View style={styles.signWatermark} pointerEvents="none">
                  {RASHI_IMAGE[rashiKey(sign)] ? (
                    <Image source={RASHI_IMAGE[rashiKey(sign)]} style={styles.signWatermarkImg} />
                  ) : (
                    <Text style={styles.signWatermarkText} numberOfLines={1}>{hiSign(sign)}</Text>
                  )}
                </View>
              )}
              <Text style={styles.readingLabel}>{isHindi ? 'आपका राशिफल' : 'Your Reading'}</Text>
              <Text style={styles.readingSign}>{sign ? (isHindi ? hiSign(sign) : sign) : '—'}</Text>

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
                <Text style={styles.readFullText}>{isHindi ? 'पूरा राशिफल पढ़ें' : 'Read full horoscope'}</Text>
                <Icon name="arrowRight" size={15} color={th.gold} />
              </Pressable>
            </View>
          </Reveal>
        )}

        {/* ── Feature carousel (chat unchanged + every feature, auto-playing) ─────── */}
        {profile && (
          <Reveal index={1} style={styles.carouselWrap}>
            <FeatureCarousel slides={carouselSlides} />
          </Reveal>
        )}

        {/* ── Starsights & predictions grid ──────────────────────────────────────── */}
        {profile && (
          <>
            <Reveal index={2}>
              <Text style={styles.sectionTitle}>{isHindi ? 'ज्योतिष और भविष्यवाणियां' : 'Starsights & Predictions'}</Text>
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
            {isHindi
              ? 'राशिफल और रीडिंग केवल मार्गदर्शन और चिंतन के लिए हैं, यह पेशेवर सलाह का विकल्प नहीं हैं।'
              : 'Horoscopes and readings are for guidance and reflection, not a substitute for professional advice.'}
          </Text>
        </Reveal>
        <View style={{ height: Spacing.xl }} />
      </View>
    </ScrollView>

    <SelectModal
      visible={switcher}
      title={isHindi ? 'यह किसके लिए है?' : 'Who is this for?'}
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
  // Large, faint Devanagari rashi name bleeding off the right edge — the Vedic
  // counterpart of the earlier zodiac-glyph backdrop.
  signWatermark: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    borderRadius: Radius.xl, overflow: 'hidden',
    alignItems: 'flex-end', justifyContent: 'center',
    paddingRight: Spacing.md, opacity: th.isDark ? 0.22 : 0.14,
  },
  signWatermarkText: { fontFamily: Fonts.displayBold, fontSize: 132, color: th.goldLight, includeFontPadding: false, marginRight: -14 },
  signWatermarkImg: { width: 190, height: 190, resizeMode: 'contain' },

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

  // carousel — break out of the body's horizontal padding to sit full-width
  carouselWrap: { marginTop: Spacing.lg, marginHorizontal: -Spacing.lg },

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
