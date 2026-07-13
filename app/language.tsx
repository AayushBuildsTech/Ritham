import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Lang, LANGUAGES } from '../lib/i18n';
import { Reveal } from '../components/Reveal';
import { track } from '../lib/analytics';

// First-launch language chooser — shown BEFORE Google sign-in. Picking a language
// sets it app-wide (persisted) and marks the choice made, after which AuthGate lets
// the user proceed to sign-in. Also reachable from Settings to change later.
export default function LanguageScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const router = useRouter();
  const { lang, setLang } = useLanguage();
  const [sel, setSel] = useState<Lang>(lang);

  // Show both languages' native copy so a Hindi-first user reads it in Devanagari
  // even before the app switches. Labels here are intentionally bilingual.
  const title = sel === 'hi' ? 'अपनी भाषा चुनें' : 'Choose your language';
  const subtitle = sel === 'hi'
    ? 'आप इसे कभी भी सेटिंग्स में बदल सकते हैं।'
    : 'You can change this anytime in Settings.';
  const cta = sel === 'hi' ? 'आगे बढ़ें' : 'Continue';

  const onContinue = () => {
    setLang(sel);
    track('language_selected', { lang: sel });
    // AuthGate will now route to sign-in (or the app, if already signed in).
    router.replace('/(auth)');
  };

  return (
    <View style={styles.root}>
      <Reveal index={0}>
        <View style={styles.header}>
          <Text style={styles.logo}>Ritham</Text>
          <View style={styles.rule} />
          <Text style={styles.tagline}>वैदिक ज्ञान · VEDIC WISDOM</Text>
        </View>
      </Reveal>

      <Reveal index={1}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>

          <View style={styles.options}>
            {LANGUAGES.map((l) => {
              const active = sel === l.id;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => setSel(l.id)}
                  android_ripple={{ color: th.goldFaint }}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <View>
                    <Text style={[styles.optionNative, active && styles.optionTextActive]}>{l.native}</Text>
                    <Text style={[styles.optionLabel, active && styles.optionTextActive]}>{l.label}</Text>
                  </View>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={styles.btn}
            onPress={onContinue}
            android_ripple={{ color: th.goldDeep }}
          >
            <Text style={styles.btnText}>{cta}</Text>
          </Pressable>
        </View>
      </Reveal>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas, justifyContent: 'center', padding: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xxl },
  logo: { fontFamily: Fonts.displayBold, fontSize: 56, color: th.goldLight, letterSpacing: 1 },
  rule: { width: 88, height: 1, backgroundColor: th.gold, opacity: 0.7, marginVertical: Spacing.md },
  tagline: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: th.textMuted, letterSpacing: 3 },
  card: {
    backgroundColor: th.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: th.border,
    ...Depth.card,
  },
  cardTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, marginBottom: Spacing.xs },
  cardSubtitle: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginBottom: Spacing.lg, lineHeight: 20 },
  options: { gap: Spacing.sm, marginBottom: Spacing.lg },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: th.border,
    backgroundColor: th.canvas,
  },
  optionActive: { borderColor: th.gold, backgroundColor: th.goldFaint },
  optionNative: { fontFamily: Fonts.display, fontSize: Fonts.size.lg, color: th.text },
  optionLabel: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted, marginTop: 2 },
  optionTextActive: { color: th.text },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: th.textDim,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: th.gold },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: th.gold },
  btn: {
    backgroundColor: th.goldSurface,
    borderRadius: Radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.5 },
});
