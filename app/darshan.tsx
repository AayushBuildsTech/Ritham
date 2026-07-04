import { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { TEMPLES, Temple } from '../config/temples';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing } from '../constants/theme';

export default function DarshanScreen() {
  const router = useRouter();

  useEffect(() => { track('darshan_opened'); }, []);

  async function watch(t: Temple) {
    track('darshan_temple_clicked', { temple: t.id });
    // Deep-link OUT to the temple's official live-darshan page (external YouTube
    // app / browser). We never embed or host the stream in v1.
    try {
      await Linking.openURL(t.streamUrl);
    } catch {
      Alert.alert('Couldn’t open the stream', 'Please try again, or open the temple’s official channel/website directly.');
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Live Darshan</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          Watch live aarti & darshan from major temples, streamed on their official YouTube channels.
        </Text>

        {TEMPLES.map((t) => (
          <View key={t.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.icon}>{t.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{t.name}</Text>
                <Text style={styles.location}>{t.location}</Text>
              </View>
            </View>
            <Text style={styles.deity}>{t.deity}</Text>
            <Text style={styles.timings}>🕰️  {t.timings}</Text>

            <TouchableOpacity style={styles.watchBtn} onPress={() => watch(t)} activeOpacity={0.85}>
              <Text style={styles.watchText}>Watch Live Darshan ↗</Text>
            </TouchableOpacity>
            <Text style={styles.unverified}>
              Opens the {t.source === 'youtube' ? 'official YouTube channel' : 'official temple website'}
            </Text>
          </View>
        ))}

        {/* Legal / safety disclaimer */}
        <Text style={styles.disclaimer}>
          Live darshan streams are provided by the respective temples’ official YouTube channels or
          websites. Ritham does not own or host this content, and is not affiliated with or endorsed
          by any temple. Tapping “Watch Live Darshan” opens the official source.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  back: { color: Colors.goldLight, fontSize: Fonts.size.md, width: 48 },
  headerTitle: { color: Colors.text, fontSize: Fonts.size.lg, fontWeight: '700' },

  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  lead: { color: Colors.textMuted, fontSize: Fonts.size.md, lineHeight: 22, marginBottom: Spacing.md },

  card: {
    backgroundColor: Colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: {
    fontSize: 28, width: 52, height: 52, borderRadius: 26, textAlign: 'center', lineHeight: 50,
    backgroundColor: Colors.bgMid, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  name: { color: Colors.text, fontSize: Fonts.size.md, fontWeight: '700' },
  location: { color: Colors.textMuted, fontSize: Fonts.size.sm, marginTop: 2 },
  deity: { color: Colors.goldLight, fontSize: Fonts.size.sm, marginTop: Spacing.md },
  timings: { color: Colors.textMuted, fontSize: Fonts.size.sm, marginTop: 4 },

  watchBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: Spacing.sm,
    alignItems: 'center', marginTop: Spacing.md,
  },
  watchText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
  unverified: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm },

  disclaimer: {
    color: Colors.textDim, fontSize: Fonts.size.xs, lineHeight: 17,
    textAlign: 'center', marginTop: Spacing.lg, paddingHorizontal: Spacing.sm,
  },
});
