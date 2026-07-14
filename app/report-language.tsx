import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { getRememberedReportLang, rememberReportLang } from '../lib/reportLang';
import { chrome } from '../constants/reportChrome';
import { Fonts, Spacing, Radius } from '../constants/theme';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Reveal';
import type { Lang } from '../lib/i18n';

// Language gate (Master Prompt §1). A REAL pre-generation step: shown after report
// selection / payment, before the Claude API is called. Carries brand motion (the
// signature violet→magenta gradient + a subtle starfield) so it never reads as a
// bare system dialog. Remembers the last choice and pre-selects it, but always
// surfaces a one-tap confirm-or-change — never a forced reselect, never a silent skip.

const STAR_COUNT = 16;

interface Star { top: number; left: number; size: number; delay: number; dur: number }

export default function ReportLanguageGate() {
  const th = useColors();
  const styles = makeStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang: appLang } = useLanguage();
  const { type, next } = useLocalSearchParams<{ type: string; next: string }>();

  // Pre-select the remembered report language (falling back to the app language).
  const [picked, setPicked] = useState<Lang>(appLang);
  useEffect(() => {
    let alive = true;
    getRememberedReportLang(appLang).then((l) => { if (alive) setPicked(l); });
    return () => { alive = false; };
  }, [appLang]);

  // Starfield — positions fixed once, twinkle looping per star.
  const stars = useMemo<Star[]>(
    () => Array.from({ length: STAR_COUNT }, () => ({
      top: Math.random() * 100,
      left: Math.random() * 100,
      size: 1.5 + Math.random() * 2.5,
      delay: Math.random() * 1600,
      dur: 1200 + Math.random() * 1600,
    })),
    [],
  );
  const twinkles = useRef(stars.map(() => new Animated.Value(Math.random()))).current;
  useEffect(() => {
    const loops = twinkles.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 0.9, duration: stars[i].dur, delay: stars[i].delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.2, duration: stars[i].dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  function confirm() {
    rememberReportLang(picked); // remember for next time (fire-and-forget)
    if (next) {
      router.replace({ pathname: next as any, params: { type: type ?? '', lang: picked } });
    } else {
      router.back();
    }
  }

  const options: { key: Lang; label: string; sub: string }[] = [
    { key: 'en', label: chrome('en', 'gate.english'), sub: 'English' },
    { key: 'hi', label: chrome('hi', 'gate.hindi'), sub: 'Hindi' },
  ];

  // Gate copy is shown in the currently-picked language so the choice previews itself.
  const c = (k: string) => chrome(picked, k);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={th.gSplash}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* starfield */}
      {stars.map((s, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.star,
            { top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, borderRadius: s.size, opacity: twinkles[i] },
          ]}
        />
      ))}

      <View style={[styles.content, { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xl }]}>
        <Reveal index={0}>
          <View style={styles.crest}><Icon name="sparkle" size={26} color="#FFFFFF" /></View>
          <Text style={styles.title}>{c('gate.title')}</Text>
          <Text style={styles.subtitle}>{c('gate.subtitle')}</Text>
        </Reveal>

        <View style={styles.options}>
          {options.map((o, i) => {
            const selected = picked === o.key;
            return (
              <Reveal key={o.key} index={i + 1} style={{ width: '100%' }}>
                <Pressable
                  onPress={() => setPicked(o.key)}
                  style={[styles.card, selected && styles.cardSelected]}
                  android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardLabel}>{o.label}</Text>
                    <Text style={styles.cardSub}>{o.sub}</Text>
                  </View>
                  <View style={[styles.radio, selected && styles.radioOn]}>
                    {selected && <Icon name="check" size={15} color="#7B2CBF" />}
                  </View>
                </Pressable>
              </Reveal>
            );
          })}
        </View>

        <Reveal index={3} style={{ width: '100%' }}>
          <Pressable style={styles.confirmBtn} onPress={confirm} android_ripple={{ color: 'rgba(0,0,0,0.08)' }}>
            <Text style={styles.confirmText}>{c('gate.confirm')}</Text>
            <Icon name="arrowRight" size={16} color="#7B2CBF" />
          </Pressable>
        </Reveal>
      </View>
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D1A' },
  star: { position: 'absolute', backgroundColor: '#FFFFFF' },
  content: { flex: 1, paddingHorizontal: Spacing.xl, alignItems: 'center', justifyContent: 'center', gap: Spacing.xl },

  crest: {
    alignSelf: 'center', width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.3 },
  subtitle: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: 'rgba(255,255,255,0.82)', textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },

  options: { width: '100%', gap: Spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  cardSelected: { backgroundColor: 'rgba(255,255,255,0.20)', borderColor: '#FFFFFF' },
  cardLabel: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: '#FFFFFF' },
  cardSub: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: 'rgba(255,255,255,0.7)', marginTop: 2, letterSpacing: 1 },
  radio: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: Radius.pill, paddingVertical: 16, width: '100%',
  },
  confirmText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: '#7B2CBF', letterSpacing: 0.3 },
});
