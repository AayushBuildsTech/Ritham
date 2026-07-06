import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors, Fonts, Spacing, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';

export function LoadingScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Ritham</Text>
      <View style={styles.rule} />
      <ActivityIndicator color={th.gold} size="small" style={styles.spinner} />
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: th.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.displayBold,
    fontSize: Fonts.size.hero,
    color: th.goldLight,
    letterSpacing: 1,
  },
  rule: {
    width: 90,
    height: 1,
    backgroundColor: th.gold,
    opacity: 0.7,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  spinner: { marginTop: Spacing.xs },
});
