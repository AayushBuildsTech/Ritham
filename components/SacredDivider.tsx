import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts, Spacing, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';

// #RRGGBB → rgba() so the rule fades to transparent gold (a clean dissolve, not
// a muddy fade through black).
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}

// A slender gold rule with a central diamond — the connective "sacred" motif.
// Pass `label` to show a small tracked-out caption flanked by two gold rules.
export function SacredDivider({ label, style }: { label?: string; style?: ViewStyle | ViewStyle[] }) {
  const th = useColors();
  const styles = makeStyles(th);
  const gold = th.gold;
  return (
    <View style={[styles.row, style]}>
      <LinearGradient
        colors={[rgba(gold, 0), rgba(gold, 0.7)]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.line}
      />
      {label ? (
        <View style={styles.center}>
          <View style={styles.diamond} />
          <Text style={styles.label}>{label}</Text>
          <View style={styles.diamond} />
        </View>
      ) : (
        <View style={styles.diamond} />
      )}
      <LinearGradient
        colors={[rgba(gold, 0.7), rgba(gold, 0)]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.line}
      />
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  line: { flex: 1, height: 1 },
  center: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  diamond: { width: 5, height: 5, backgroundColor: th.gold, transform: [{ rotate: '45deg' }] },
  label: {
    fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold,
    letterSpacing: 3, textTransform: 'uppercase',
  },
});
