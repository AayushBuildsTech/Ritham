import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors, Fonts, Spacing } from '../constants/theme';

export function LoadingScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Ritham</Text>
      <View style={styles.rule} />
      <ActivityIndicator color={Colors.gold} size="small" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.displayBold,
    fontSize: Fonts.size.hero,
    color: Colors.goldLight,
    letterSpacing: 1,
  },
  rule: {
    width: 90,
    height: 1,
    backgroundColor: Colors.gold,
    opacity: 0.7,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  spinner: { marginTop: Spacing.xs },
});
