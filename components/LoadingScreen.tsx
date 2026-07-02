import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors, Fonts, Spacing } from '../constants/theme';

export function LoadingScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.logo}>✦</Text>
      <Text style={styles.title}>Ritham</Text>
      <ActivityIndicator color={Colors.gold} size="small" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { fontSize: 48, color: Colors.gold },
  title: {
    fontSize: Fonts.size.xxl,
    color: Colors.goldLight,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  spinner: { marginTop: Spacing.md },
});
