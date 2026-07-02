import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts, Spacing } from '../../constants/theme';

export default function StoreScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.icon}>🛍️</Text>
      <Text style={styles.title}>Sacred Store</Text>
      <Text style={styles.subtitle}>
        Gemstones, rudraksha, yantras and more.{'\n'}Coming in Phase 8.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  icon: { fontSize: 64, marginBottom: Spacing.lg },
  title: { fontSize: Fonts.size.xxl, color: Colors.text, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { fontSize: Fonts.size.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 24 },
});
