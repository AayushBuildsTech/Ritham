import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Spacing } from '../../constants/theme';

export default function ChatScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <Text style={styles.icon}>✨</Text>
      <Text style={styles.title}>Chat with Ritham</Text>
      <Text style={styles.subtitle}>
        Ask your Vedic astrologer anything.{'\n'}Powered by your birth chart.
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.push('/profile')}>
        <Text style={styles.btnText}>Set up your Kundli first →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  icon: { fontSize: 64, marginBottom: Spacing.lg },
  title: { fontSize: Fonts.size.xxl, color: Colors.text, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { fontSize: Fonts.size.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  btn: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  btnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
});
