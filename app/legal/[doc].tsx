import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LEGAL, LEGAL_UPDATED, LegalDoc } from '../../constants/legal';
import { Colors, Fonts, Spacing, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { ScreenHeader } from '../../components/ScreenHeader';

export default function LegalScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = LEGAL[doc as LegalDoc];

  return (
    <View style={styles.root}>
      <ScreenHeader title={content?.title ?? 'Legal'} onBack={() => router.back()} />

      {!content ? (
        <View style={styles.center}><Text style={styles.body}>This document isn’t available.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.brand}>RITHAM</Text>
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

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },

  content: { padding: Spacing.lg, paddingTop: Spacing.lg },
  brand: { fontFamily: Fonts.bodySemibold, color: th.gold, fontSize: Fonts.size.xs, letterSpacing: 4 },
  title: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.hero, marginTop: Spacing.sm },
  updated: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, marginTop: 4 },
  intro: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, lineHeight: 23, marginTop: Spacing.md },
  divider: { height: 1, backgroundColor: th.border, marginVertical: Spacing.lg },

  section: { marginBottom: Spacing.lg },
  heading: { fontFamily: Fonts.displayBold, color: th.goldLight, fontSize: Fonts.size.lg, marginBottom: Spacing.xs },
  body: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, lineHeight: 22 },

  footer: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, fontStyle: 'italic', lineHeight: 18, marginTop: Spacing.sm },
});
