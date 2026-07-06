import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, Radius, Depth, Accents, AccentName } from '../../constants/theme';
import { Icon, IconName } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { TAB_BAR_HEIGHT } from './_layout';

const CATEGORIES: { icon: IconName; accent: AccentName; title: string; desc: string }[] = [
  { icon: 'beads', accent: 'saffron', title: 'Rudraksha', desc: 'Certified, energised beads and malas for daily practice and protection.' },
  { icon: 'diamond', accent: 'sapphire', title: 'Gemstone Bracelets', desc: 'Genuine crystal bracelets, chosen to balance and strengthen your chart.' },
  { icon: 'eye', accent: 'amethyst', title: 'Evil Eye', desc: 'Nazar-suraksha charms and bracelets to guard against negative energy.' },
];

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {
        paddingTop: insets.top + Spacing.lg,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom,
      }]}
      showsVerticalScrollIndicator={false}
    >
      <Reveal index={0}>
        <View style={styles.hero}>
          <Text style={styles.brand}>RITHAM</Text>
          <Text style={styles.title}>The Sacred Store</Text>
          <View style={styles.pill}><Text style={styles.pillText}>COMING SOON</Text></View>
          <Text style={styles.subtitle}>
            A curated collection of rudraksha, gemstone bracelets and evil-eye charms —
            authentic, energised and matched to your chart. We’re putting the finishing touches on it.
          </Text>
        </View>
      </Reveal>

      <Reveal index={1}>
        <Text style={styles.previewLabel}>A GLIMPSE OF WHAT’S COMING</Text>
      </Reveal>

      {CATEGORIES.map((c, i) => (
        <Reveal key={c.title} index={2 + i}>
          <View style={styles.card}>
            <View style={[styles.cardIcon, { backgroundColor: Accents[c.accent].faint, borderWidth: 1, borderColor: Accents[c.accent].soft }]}>
              <Icon name={c.icon} size={22} color={Accents[c.accent].color} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{c.title}</Text>
              <Text style={styles.cardDesc}>{c.desc}</Text>
            </View>
          </View>
        </Reveal>
      ))}

      <Reveal index={5}>
        <Text style={styles.note}>
          Until then, explore your Kundli, daily horoscopes and consult our AI astrologer.
        </Text>
      </Reveal>
      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.canvas },
  content: { paddingHorizontal: Spacing.lg },

  hero: { alignItems: 'center', marginBottom: Spacing.xl },
  brand: { fontFamily: Fonts.bodySemibold, color: Colors.gold, fontSize: Fonts.size.xs, letterSpacing: 4, marginBottom: Spacing.sm },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.hero, color: Colors.text, textAlign: 'center' },
  pill: {
    backgroundColor: Colors.surface, borderColor: Colors.borderStrong, borderWidth: 1,
    borderRadius: Radius.pill, paddingVertical: 5, paddingHorizontal: Spacing.md, marginTop: Spacing.md,
  },
  pillText: { fontFamily: Fonts.bodySemibold, color: Colors.goldLight, fontSize: Fonts.size.xs, letterSpacing: 2 },
  subtitle: {
    fontFamily: Fonts.body, fontSize: Fonts.size.md, color: Colors.textMuted, textAlign: 'center',
    lineHeight: 24, marginTop: Spacing.md, paddingHorizontal: Spacing.sm,
  },

  previewLabel: {
    fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: Colors.textDim, textAlign: 'center',
    letterSpacing: 2, marginBottom: Spacing.md,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
    ...Depth.card,
  },
  cardIcon: {
    width: 48, height: 48, borderRadius: Radius.sm,
    backgroundColor: Colors.goldFaint, alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.lg, color: Colors.goldLight, marginBottom: 2 },
  cardDesc: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 19 },

  note: {
    fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: Colors.textDim, textAlign: 'center',
    lineHeight: 22, marginTop: Spacing.lg, paddingHorizontal: Spacing.sm,
  },
});
