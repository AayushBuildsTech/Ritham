import { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { HeroBanner } from '../../components/HeroBanner';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SacredDivider } from '../../components/SacredDivider';
import { SlotCountdown } from '../../components/SlotCountdown';
import { PUJAS, PUJA_TIERS, COMING_SOON_PUJAS, L, paiseTo } from '../../config/pujas';
import { track } from '../../lib/analytics';

export default function PujaListingScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tr = (l: L) => (isHindi ? l.hi : l.en);

  useEffect(() => { track('puja_viewed'); }, []);

  const fromPaise = Math.min(...PUJA_TIERS.map((t) => t.price_paise));

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'पवित्र पूजा' : 'Sacred Pujas'} onBack={() => router.back()} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0}>
          <SacredDivider label={isHindi ? 'पवित्र तीर्थों पर' : 'At India’s Holiest Tirthas'} style={{ marginTop: Spacing.sm }} />
          <Text style={styles.intro}>
            {isHindi
              ? 'अनुभवी वैदिक पुजारियों द्वारा आपके नाम और गोत्र में संपन्न पूजा — पूरी वीडियो और लाइव अपडेट के साथ।'
              : 'Rituals performed in your name & gotra by verified Vedic priests — with a full video and live updates.'}
          </Text>
        </Reveal>

        {PUJAS.map((p, i) => (
          <Reveal key={p.id} index={1 + i}>
            <Pressable
              style={styles.liveCard}
              onPress={() => router.push(`/puja/${p.id}` as any)}
              android_ripple={{ color: th.goldFaint }}
            >
              <View style={styles.heroWrap}>
                <HeroBanner source={p.hero} aspectRatio={3 / 2} scrim radius={0}>
                  <Text style={styles.cardTitle}>{tr(p.title)}</Text>
                  <View style={styles.locRow}>
                    <Icon name="mapPin" size={13} color={th.goldLight} />
                    <Text style={styles.cardLoc}>{tr(p.location)}</Text>
                  </View>
                </HeroBanner>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePillText}>{isHindi ? 'उपलब्ध' : 'LIVE'}</Text>
                </View>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardSub}>{tr(p.subtitle)}</Text>
                <SlotCountdown compact style={{ marginTop: Spacing.sm }} />
                <SacredDivider style={{ marginVertical: Spacing.lg }} />
                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.fromLabel}>{isHindi ? 'शुरुआत' : 'Starting from'}</Text>
                    <Text style={styles.fromPrice}>{paiseTo(fromPaise)}</Text>
                  </View>
                  <LinearGradient
                    colors={Accents.gold.grad}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.cta}
                  >
                    <Text style={styles.ctaText}>{isHindi ? 'बुक करें' : 'Book Now'}</Text>
                    <Icon name="arrowRight" size={15} color="#FFFFFF" />
                  </LinearGradient>
                </View>
              </View>
            </Pressable>
          </Reveal>
        ))}

        {/* trust row */}
        <Reveal index={1 + PUJAS.length}>
          <View style={styles.trustRow}>
            {[
              { icon: 'check' as const, label: isHindi ? '100% रिफंड' : '100% Refund' },
              { icon: 'play' as const, label: isHindi ? 'पूजा वीडियो' : 'Puja Video' },
              { icon: 'temple' as const, label: isHindi ? 'वैदिक पुजारी' : 'Vedic Priests' },
            ].map((t2) => (
              <View key={t2.label} style={styles.trustChip}>
                <Icon name={t2.icon} size={13} color={th.gold} />
                <Text style={styles.trustText}>{t2.label}</Text>
              </View>
            ))}
          </View>
        </Reveal>

        {/* coming soon */}
        <Reveal index={2 + PUJAS.length}>
          <SacredDivider label={isHindi ? 'जल्द आ रहा है' : 'More Sacred Pujas Soon'} style={{ marginTop: Spacing.xl, marginBottom: Spacing.lg }} />
        </Reveal>
        {COMING_SOON_PUJAS.map((c, i) => (
          <Reveal key={c.id} index={3 + PUJAS.length + i}>
            <View style={styles.soonCard}>
              <View style={styles.soonEmblem}>
                <Icon name="temple" size={18} color={th.gold} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.soonTitle}>{tr(c.title)}</Text>
                <View style={styles.locRow}>
                  <Icon name="mapPin" size={11} color={th.textDim} />
                  <Text style={styles.soonLoc}>{tr(c.location)}</Text>
                </View>
              </View>
              <View style={styles.soonPill}>
                <Text style={styles.soonPillText}>{isHindi ? 'जल्द' : 'SOON'}</Text>
              </View>
            </View>
          </Reveal>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  flex1: { flex: 1 },
  intro: {
    fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted,
    lineHeight: 26, textAlign: 'center', marginTop: Spacing.lg, marginBottom: Spacing.xxl,
    paddingHorizontal: Spacing.md,
  },

  // live puja card
  liveCard: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.borderStrong,
    overflow: 'hidden', marginBottom: Spacing.xxl, ...Depth.glow,
  },
  heroWrap: { position: 'relative' },
  cardTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: '#FFFFFF', letterSpacing: 0.3 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  cardLoc: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.sm, color: 'rgba(255,255,255,0.92)' },
  livePill: {
    position: 'absolute', top: Spacing.md, right: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(13,13,26,0.55)', borderColor: th.borderStrong, borderWidth: 1,
    borderRadius: Radius.pill, paddingVertical: 5, paddingHorizontal: Spacing.sm,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: th.goldLight },
  livePillText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: '#FFFFFF', letterSpacing: 1.5 },
  cardBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.lg },
  cardSub: { fontFamily: Fonts.display, fontSize: Fonts.size.lg, color: th.goldLight, lineHeight: 26, textAlign: 'center', marginTop: Spacing.xs },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fromLabel: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, letterSpacing: 0.5 },
  fromPrice: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, marginTop: 1 },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 11, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill,
    ...Depth.glow,
  },
  ctaText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.sm, color: '#FFFFFF', letterSpacing: 0.3 },

  // trust
  trustRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
  trustChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: th.surface, borderWidth: 1, borderColor: th.border,
    borderRadius: Radius.pill, paddingVertical: 8, paddingHorizontal: Spacing.md,
  },
  trustText: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.xs, color: th.textMuted },

  // coming soon
  soonCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    paddingVertical: Spacing.md + 2, paddingHorizontal: Spacing.md, marginBottom: Spacing.md,
  },
  soonEmblem: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: th.goldFaint,
    borderWidth: 1, borderColor: th.borderStrong, alignItems: 'center', justifyContent: 'center',
  },
  soonTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.text, marginBottom: 3 },
  soonLoc: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim },
  soonPill: {
    borderWidth: 1, borderColor: th.borderStrong, backgroundColor: th.goldFaint, borderRadius: Radius.pill,
    paddingVertical: 4, paddingHorizontal: Spacing.sm,
  },
  soonPillText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: th.gold, letterSpacing: 1 },
});
