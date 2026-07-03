import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors, Fonts, Spacing } from '../../constants/theme';

const CATEGORIES = [
  { icon: '📿', title: 'Rudraksha', desc: 'Certified, energised beads and malas for daily practice and protection.' },
  { icon: '💎', title: 'Gemstone Bracelets', desc: 'Genuine crystal bracelets, chosen to balance and strengthen your chart.' },
  { icon: '🧿', title: 'Evil Eye', desc: 'Nazar-suraksha charms and bracelets to guard against negative energy.' },
];

export default function StoreScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.brand}>✦ RITHAM</Text>

      <View style={styles.hero}>
        <Text style={styles.icon}>🛍️</Text>
        <Text style={styles.title}>Sacred Store</Text>
        <View style={styles.pill}><Text style={styles.pillText}>COMING SOON</Text></View>
        <Text style={styles.subtitle}>
          A curated collection of rudraksha, gemstone bracelets and evil-eye charms —
          authentic, energised and matched to your chart. We’re putting the finishing touches on it.
        </Text>
      </View>

      <Text style={styles.previewLabel}>A glimpse of what’s coming</Text>
      <View style={styles.list}>
        {CATEGORIES.map((c) => (
          <View key={c.title} style={styles.card}>
            <Text style={styles.cardIcon}>{c.icon}</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{c.title}</Text>
              <Text style={styles.cardDesc}>{c.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.note}>
        ✨ Until then, explore your Kundli, daily horoscopes and consult our AI astrologer.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingTop: 56, paddingBottom: Spacing.xxl },

  brand: { color: Colors.gold, fontSize: Fonts.size.sm, letterSpacing: 3, textAlign: 'center', fontWeight: '700' },

  hero: { alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.xl },
  icon: { fontSize: 60, marginBottom: Spacing.sm },
  title: { fontSize: Fonts.size.xxl, color: Colors.text, fontWeight: '700', textAlign: 'center' },
  pill: {
    backgroundColor: Colors.bgCard, borderColor: Colors.gold, borderWidth: 1,
    borderRadius: 20, paddingVertical: 5, paddingHorizontal: Spacing.md, marginTop: Spacing.sm,
  },
  pillText: { color: Colors.goldLight, fontSize: Fonts.size.xs, letterSpacing: 2, fontWeight: '700' },
  subtitle: {
    fontSize: Fonts.size.md, color: Colors.textMuted, textAlign: 'center',
    lineHeight: 24, marginTop: Spacing.md, paddingHorizontal: Spacing.sm,
  },

  previewLabel: {
    fontSize: Fonts.size.sm, color: Colors.textDim, textAlign: 'center',
    letterSpacing: 1, marginBottom: Spacing.md,
  },
  list: { gap: Spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: 14,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border,
  },
  cardIcon: { fontSize: 34 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: Fonts.size.md, color: Colors.goldLight, fontWeight: '700', marginBottom: 4 },
  cardDesc: { fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 19 },

  note: {
    fontSize: Fonts.size.sm, color: Colors.textDim, textAlign: 'center',
    lineHeight: 22, marginTop: Spacing.xl, paddingHorizontal: Spacing.sm,
  },
});
