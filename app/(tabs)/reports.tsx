import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts, Spacing } from '../../constants/theme';

export default function ReportsScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.icon}>📜</Text>
      <Text style={styles.title}>Astrology Reports</Text>
      <Text style={styles.subtitle}>
        Vastu consultation and matchmaking reports.{'\n'}Coming in Phase 7.
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
