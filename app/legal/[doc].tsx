import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LEGAL, LEGAL_UPDATED, LegalDoc } from '../../constants/legal';
import { Colors, Fonts, Spacing } from '../../constants/theme';

export default function LegalScreen() {
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = LEGAL[doc as LegalDoc];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{content?.title ?? 'Legal'}</Text>
        <View style={{ width: 48 }} />
      </View>

      {!content ? (
        <View style={styles.center}><Text style={styles.body}>This document isn’t available.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.brand}>✦ RITHAM</Text>
          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.updated}>Last updated · {LEGAL_UPDATED}</Text>
          <Text style={styles.intro}>{content.intro}</Text>
          <View style={styles.divider} />

          {content.sections.map((s) => (
            <View key={s.heading} style={styles.section}>
              <Text style={styles.heading}>{s.heading}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          ))}

          <Text style={styles.footer}>
            This is a good-faith summary of our policies and does not constitute legal advice.
          </Text>
          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },

  content: { padding: Spacing.lg, paddingTop: Spacing.xl },
  brand: { color: Colors.gold, fontSize: Fonts.size.xs, letterSpacing: 3, fontWeight: '700' },
  title: { color: Colors.text, fontSize: Fonts.size.xxl, fontWeight: '700', marginTop: Spacing.sm },
  updated: { color: Colors.textDim, fontSize: Fonts.size.xs, marginTop: 4 },
  intro: { color: Colors.textMuted, fontSize: Fonts.size.md, lineHeight: 23, marginTop: Spacing.md },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.lg },

  section: { marginBottom: Spacing.lg },
  heading: { color: Colors.goldLight, fontSize: Fonts.size.md, fontWeight: '700', marginBottom: Spacing.xs },
  body: { color: Colors.textMuted, fontSize: Fonts.size.sm, lineHeight: 22 },

  footer: { color: Colors.textDim, fontSize: Fonts.size.xs, fontStyle: 'italic', lineHeight: 18, marginTop: Spacing.sm },
});
