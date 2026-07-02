import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Colors, Fonts, Spacing } from '../../constants/theme';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Namaste 🙏</Text>
          <Text style={styles.phone}>{user?.phone ?? ''}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/profile')} style={styles.avatarBtn}>
          <Text style={styles.avatarIcon}>◉</Text>
        </TouchableOpacity>
      </View>

      {/* Horoscope tabs — placeholder for Phase 5 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Horoscope</Text>
        <Text style={styles.sectionMuted}>Profile needed to unlock</Text>
      </View>

      {['Daily', 'Weekly', 'Monthly'].map((period) => (
        <View key={period} style={styles.horoCard}>
          <View style={styles.horoTop}>
            <Text style={styles.horoPeriod}>{period}</Text>
            <Text style={styles.horoBadge}>Coming soon</Text>
          </View>
          <Text style={styles.horoPlaceholder}>
            Create your Kundli profile to receive personalised {period.toLowerCase()} horoscope readings.
          </Text>
        </View>
      ))}

      {/* CTA to create profile */}
      <TouchableOpacity
        style={styles.ctaBtn}
        onPress={() => router.push('/profile')}
      >
        <Text style={styles.ctaBtnText}>Create Your Kundli Profile →</Text>
      </TouchableOpacity>

      {/* Dev sign-out */}
      <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  greeting: { fontSize: Fonts.size.xl, color: Colors.text, fontWeight: '700' },
  phone: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginTop: 2 },
  avatarBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarIcon: { fontSize: 20, color: Colors.gold },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: Fonts.size.lg, color: Colors.text, fontWeight: '700' },
  sectionMuted: { fontSize: Fonts.size.xs, color: Colors.textDim },
  horoCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  horoTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  horoPeriod: { fontSize: Fonts.size.md, color: Colors.goldLight, fontWeight: '600' },
  horoBadge: { fontSize: Fonts.size.xs, color: Colors.textDim },
  horoPlaceholder: { fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 20 },
  ctaBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  ctaBtnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
  signOutBtn: { padding: Spacing.lg, alignItems: 'center', marginTop: Spacing.md },
  signOutText: { color: Colors.textDim, fontSize: Fonts.size.sm },
});
