import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Motion, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';

// A bespoke animated start screen shown after the (static) native splash and
// before the app reveals. Pure RN Animated — no reanimated, no native deps.
//
// Sequence (settle easing throughout):
//   1. wordmark "Ritham" fades up + eases from 1.04→1.0
//   2. a thin gold hairline draws outward from center (scaleX 0→1)
//   3. the tracked-out tagline fades in
//   4. brief hold, then the whole overlay fades away → onFinish()
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const th = useColors();
  const styles = makeStyles(th);
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordScale = useRef(new Animated.Value(1.04)).current;
  const wordShift = useRef(new Animated.Value(12)).current;
  const lineScale = useRef(new Animated.Value(0)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const overlay = useRef(new Animated.Value(1)).current;

  const ease = Easing.bezier(...Motion.easeOut);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(wordOpacity, {
          toValue: 1, duration: 700, easing: ease, useNativeDriver: true,
        }),
        Animated.timing(wordScale, {
          toValue: 1, duration: 900, easing: ease, useNativeDriver: true,
        }),
        Animated.timing(wordShift, {
          toValue: 0, duration: 900, easing: ease, useNativeDriver: true,
        }),
      ]),
      Animated.timing(lineScale, {
        toValue: 1, duration: 560, easing: ease, useNativeDriver: true,
      }),
      Animated.timing(tagOpacity, {
        toValue: 1, duration: 500, easing: ease, useNativeDriver: true,
      }),
      Animated.delay(650),
      Animated.timing(overlay, {
        toValue: 0, duration: 460, easing: ease, useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onFinish();
    });
  }, []);

  return (
    <Animated.View style={[styles.root, { opacity: overlay }]} pointerEvents="none">
      <LinearGradient
        colors={th.gSplash}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.Text
        style={[
          styles.wordmark,
          {
            opacity: wordOpacity,
            transform: [{ scale: wordScale }, { translateY: wordShift }],
          },
        ]}
      >
        Ritham
      </Animated.Text>

      <Animated.View style={[styles.rule, { transform: [{ scaleX: lineScale }] }]} />

      <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
        VEDIC WISDOM · REFINED
      </Animated.Text>
    </Animated.View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: th.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: Fonts.displayBold,
    fontSize: 64,
    color: th.goldLight,
    letterSpacing: 1,
    textShadowColor: 'rgba(197,160,89,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
  rule: {
    width: 120,
    height: 1,
    backgroundColor: th.gold,
    marginTop: 18,
    marginBottom: 16,
    opacity: 0.9,
  },
  tagline: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 4,
  },
});
