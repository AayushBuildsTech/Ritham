import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
import { SlotCountdown, useSlotTick } from '../../components/SlotCountdown';
import { getPuja, PUJA_TIERS, PujaTier, L, paiseTo } from '../../config/pujas';
import { track } from '../../lib/analytics';

export default function PujaDetailScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = (l: L) => (isHindi ? l.hi : l.en);

  const puja = getPuja(String(id));
  const [tierId, setTierId] = useState<string>(
    PUJA_TIERS.find((t) => t.badge === 'most_chosen')?.id ?? PUJA_TIERS[0].id,
  );
  const slot = useSlotTick();

  useEffect(() => { if (puja) track('puja_detail_viewed', { pujaId: puja.id }); }, [puja?.id]);

  if (!puja) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Puja" onBack={() => router.back()} />
        <Text style={styles.missing}>{isHindi ? 'पूजा नहीं मिली।' : 'Puja not found.'}</Text>
      </View>
    );
  }

  const selected = PUJA_TIERS.find((t) => t.id === tierId) ?? PUJA_TIERS[0];
  const badgeLabel = (b?: string) =>
    b === 'most_chosen' ? (isHindi ? 'सर्वाधिक चुना' : 'MOST CHOSEN')
    : b === 'best_value' ? (isHindi ? 'सर्वोत्तम मूल्य' : 'BEST VALUE') : '';

  return (
    <View style={styles.root}>
      <ScreenHeader title={tr(puja.title)} onBack={() => router.back()} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 128 }}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0}>
          <HeroBanner source={puja.hero} aspectRatio={4 / 3} scrim>
            <Text style={styles.heroEyebrow}>{isHindi ? 'पितृ दोष निवारण' : 'PITRU DOSHA REMEDY'}</Text>
            <Text style={styles.heroTitle}>{tr(puja.title)}</Text>
            <View style={styles.locRow}>
              <Icon name="mapPin" size={14} color={th.goldLight} />
              <Text style={styles.heroLoc}>{tr(puja.location)}</Text>
            </View>
          </HeroBanner>
        </Reveal>

        <View style={styles.body}>
          <Reveal index={1}>
            <Text style={styles.subtitle}>{tr(puja.subtitle)}</Text>
            <View style={styles.trustRow}>
              {[
                isHindi ? '100% रिफंड' : '100% Refund',
                isHindi ? 'वीडियो गारंटी' : 'Guaranteed Video',
              ].map((t2) => (
                <View key={t2} style={styles.trustChip}>
                  <Icon name="check" size={12} color={th.gold} />
                  <Text style={styles.trustText}>{t2}</Text>
                </View>
              ))}
            </View>
          </Reveal>

          {/* ── Next-slot countdown ───────────────────────────────────── */}
          <Reveal index={2}>
            <SlotCountdown style={styles.slot} />
          </Reveal>

          {/* ── Tier selector ─────────────────────────────────────────── */}
          <Reveal index={3}>
            <SacredDivider label={isHindi ? 'अपना पैकेज चुनें' : 'Choose Your Package'} style={styles.divider} />
          </Reveal>
          {PUJA_TIERS.map((t2, i) => (
            <Reveal key={t2.id} index={3 + i}>
              <TierCard th={th} styles={styles} tier={t2} selected={t2.id === tierId}
                onSelect={() => setTierId(t2.id)} tr={tr} badgeLabel={badgeLabel} />
            </Reveal>
          ))}

          {/* ── About ─────────────────────────────────────────────────── */}
          <Reveal index={3 + PUJA_TIERS.length}>
            <SacredDivider label={isHindi ? 'पूजा के बारे में' : 'About This Puja'} style={styles.divider} />
            <Text style={styles.aboutText}>{tr(puja.about)}</Text>
          </Reveal>

          {/* ── Why perform ───────────────────────────────────────────── */}
          <Reveal index={4 + PUJA_TIERS.length}>
            <SacredDivider label={isHindi ? 'यह पूजा क्यों करें' : 'Why Perform This Puja'} style={styles.divider} />
          </Reveal>
          {puja.whyPerform.map((w, i) => (
            <Reveal key={i} index={5 + PUJA_TIERS.length + i}>
              <View style={styles.reasonCard}>
                <View style={styles.reasonDot}>
                  <Icon name="sparkle" size={16} color={th.gold} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.reasonTitle}>{tr(w.title)}</Text>
                  <Text style={styles.reasonDesc}>{tr(w.desc)}</Text>
                </View>
              </View>
            </Reveal>
          ))}

          {/* ── Includes ──────────────────────────────────────────────── */}
          <Reveal index={9 + PUJA_TIERS.length}>
            <SacredDivider label={isHindi ? 'हर पैकेज में शामिल' : 'Every Package Includes'} style={styles.divider} />
            <View style={styles.includesCard}>
              {puja.includes.map((inc, i) => (
                <View key={i} style={[styles.includeRow, i > 0 && styles.includeDivider]}>
                  <View style={styles.includeCheck}>
                    <Icon name="check" size={13} color={th.goldContrast} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.includeTitle}>{tr(inc.title)}</Text>
                    <Text style={styles.includeDesc}>{tr(inc.desc)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Reveal>

          <Reveal index={10 + PUJA_TIERS.length}>
            <SacredDivider style={{ marginTop: Spacing.xl }} />
          </Reveal>
        </View>
      </ScrollView>

      {/* ── Sticky book bar ─────────────────────────────────────────── */}
      <View style={[styles.bookBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <View>
          {slot.open ? (
            <>
              <Text style={styles.bookBarLabel}>{tr(selected.label)}</Text>
              <Text style={styles.bookBarPrice}>{paiseTo(selected.price_paise)}</Text>
            </>
          ) : (
            <Text style={styles.bookBarClosedNote}>{isHindi ? 'नया स्लॉट जल्द' : 'Next slot opening soon'}</Text>
          )}
        </View>
        {slot.open ? (
          <Pressable
            onPress={() => router.push({ pathname: '/puja/book' as any, params: { pujaId: puja.id, tierId } })}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={styles.bookBtnWrap}
          >
            <LinearGradient colors={Accents.gold.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bookBtn}>
              <Text style={styles.bookBtnText}>{isHindi ? 'अभी बुक करें' : 'Book Now'}</Text>
              <Icon name="arrowRight" size={17} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        ) : (
          <View style={[styles.bookBtn, styles.bookBtnClosed]}>
            <Text style={styles.bookBtnClosedText}>{isHindi ? 'बुकिंग बंद' : 'Bookings Closed'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function TierCard({
  th, styles, tier, selected, onSelect, tr, badgeLabel,
}: {
  th: ThemeColors; styles: any; tier: PujaTier; selected: boolean; onSelect: () => void;
  tr: (l: L) => string; badgeLabel: (b?: string) => string;
}) {
  return (
    <Pressable
      style={[styles.tierCard, selected && styles.tierCardActive]}
      onPress={onSelect}
      android_ripple={{ color: th.goldFaint }}
    >
      {tier.badge ? (
        <View style={styles.tierBadge}><Text style={styles.tierBadgeText}>{badgeLabel(tier.badge)}</Text></View>
      ) : null}
      <View style={styles.tierHead}>
        <View style={[styles.tierRadio, selected && styles.tierRadioOn]}>
          {selected ? <Icon name="check" size={13} color={th.goldContrast} /> : null}
        </View>
        <View style={styles.flex1}>
          <Text style={styles.tierTitle}>{tr(tier.label)}</Text>
          <Text style={styles.tierSubtitle}>{tr(tier.subtitle)}</Text>
        </View>
        <Text style={styles.tierPrice}>{paiseTo(tier.price_paise)}</Text>
      </View>
      <Text style={styles.tierTagline}>{tr(tier.tagline)}</Text>
    </Pressable>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  scroll: { flex: 1 },
  missing: { fontFamily: Fonts.body, color: th.textMuted, textAlign: 'center', marginTop: Spacing.xxl },
  flex1: { flex: 1 },
  divider: { marginTop: Spacing.xl, marginBottom: Spacing.lg },

  heroEyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.goldLight, letterSpacing: 3, marginBottom: 6 },
  heroTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: '#FFFFFF', letterSpacing: 0.3 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  heroLoc: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.sm, color: 'rgba(255,255,255,0.92)' },

  body: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  slot: { marginTop: Spacing.lg },
  subtitle: { fontFamily: Fonts.display, fontSize: Fonts.size.lg, color: th.goldLight, textAlign: 'center' },
  trustRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, justifyContent: 'center' },
  trustChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: th.goldFaint, borderRadius: Radius.pill, borderWidth: 1, borderColor: th.borderStrong,
    paddingVertical: 6, paddingHorizontal: Spacing.md,
  },
  trustText: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.xs, color: th.text },

  // tier cards
  tierCard: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: th.border,
    padding: Spacing.md, paddingTop: Spacing.md, marginBottom: Spacing.md,
  },
  tierCardActive: { borderColor: th.gold, backgroundColor: th.goldFaint, ...Depth.glow },
  tierBadge: {
    position: 'absolute', top: -1, right: Spacing.md, backgroundColor: th.goldSurface,
    borderBottomLeftRadius: Radius.sm, borderBottomRightRadius: Radius.sm, paddingVertical: 3, paddingHorizontal: Spacing.sm,
  },
  tierBadgeText: { fontFamily: Fonts.bodyBold, fontSize: 9, color: th.goldContrast, letterSpacing: 1 },
  tierHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 6 },
  tierRadio: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: th.border,
    alignItems: 'center', justifyContent: 'center',
  },
  tierRadioOn: { backgroundColor: th.goldSurface, borderColor: th.goldSurface },
  tierTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.lg, color: th.text },
  tierSubtitle: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted, marginTop: 2 },
  tierPrice: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.goldLight },
  tierTagline: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, fontStyle: 'italic', marginTop: Spacing.sm, lineHeight: 18, paddingLeft: 24 + Spacing.md },

  aboutText: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted, lineHeight: 26, textAlign: 'center' },

  reasonCard: {
    flexDirection: 'row', gap: Spacing.md, alignItems: 'center', marginBottom: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border, padding: Spacing.md,
  },
  reasonDot: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: th.goldFaint, borderWidth: 1, borderColor: th.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  reasonTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.text },
  reasonDesc: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 20, marginTop: 2 },

  includesCard: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.md, ...Depth.card,
  },
  includeRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start', paddingVertical: Spacing.md },
  includeDivider: { borderTopWidth: 1, borderTopColor: th.divider },
  includeCheck: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: th.goldSurface,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  includeTitle: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.text },
  includeDesc: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 20, marginTop: 2 },

  bookBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
    backgroundColor: th.surface, borderTopWidth: 1, borderTopColor: th.borderStrong,
  },
  bookBarLabel: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim },
  bookBarPrice: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text },
  bookBarClosedNote: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.lg, color: th.textMuted },
  bookBtnClosed: { backgroundColor: th.surfaceSunken, borderWidth: 1, borderColor: th.border, borderRadius: Radius.pill },
  bookBtnClosedText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: th.textDim },
  bookBtnWrap: { borderRadius: Radius.pill, overflow: 'hidden' },
  bookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
  },
  bookBtnText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: '#FFFFFF', letterSpacing: 0.3 },
});
