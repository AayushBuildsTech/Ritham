import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts, Motion, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';

// Animated start screen shown after the (static) native splash and before the
// app reveals. The Ritham mark's planet RING orbits continuously around the
// static central glyph (2-D rotation on its own axis), while the wordmark +
// tagline fade up. Pure RN Animated — no reanimated, no native deps.
//
// Sequence (~2.6s total):
//   1. ring begins an endless slow rotation immediately
//   2. glyph + ring fade in and settle from 1.06→1.0
//   3. the tracked-out wordmark + tagline fade in
//   4. brief hold, then the whole overlay fades away → onFinish()
const LOGO = 230;

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const th = useColors();
  const styles = makeStyles(th);

  const spin = useRef(new Animated.Value(0)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(1.06)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textShift = useRef(new Animated.Value(10)).current;
  const overlay = useRef(new Animated.Value(1)).current;

  const ease = Easing.bezier(...Motion.easeOut);

  useEffect(() => {
    // endless orbit of the planet ring
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true,
      }),
    ).start();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 1, duration: 460, easing: ease, useNativeDriver: true }),
        Animated.timing(markScale, { toValue: 1, duration: 620, easing: ease, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 380, easing: ease, useNativeDriver: true }),
        Animated.timing(textShift, { toValue: 0, duration: 380, easing: ease, useNativeDriver: true }),
      ]),
      Animated.delay(560),
      Animated.timing(overlay, { toValue: 0, duration: 360, easing: ease, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onFinish(); });
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[styles.root, { opacity: overlay }]} pointerEvents="none">
      <LinearGradient
        colors={['#2A1150', '#150A28', '#0D0D1A']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[styles.mark, { opacity: markOpacity, transform: [{ scale: markScale }] }]}
      >
        <Animated.Image
          source={require('../assets/logo-ring.png')}
          style={[styles.layer, { transform: [{ rotate }] }]}
          resizeMode="contain"
        />
        <Image
          source={require('../assets/logo-center.png')}
          style={styles.layer}
          resizeMode="contain"
        />
      </Animated.View>

      <Animated.Text
        style={[styles.wordmark, { opacity: textOpacity, transform: [{ translateY: textShift }] }]}
      >
        Ritham
      </Animated.Text>
      <Animated.Text style={[styles.tagline, { opacity: textOpacity }]}>
        VEDIC WISDOM · REIMAGINED
      </Animated.Text>
    </Animated.View>
  );
}

const makeStyles = (_th: ThemeColors) => StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  mark: { width: LOGO, height: LOGO, alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', width: LOGO, height: LOGO },
  wordmark: {
    fontFamily: Fonts.displayBold,
    fontSize: 46,
    color: '#FFFFFF',
    letterSpacing: 1,
    marginTop: 34,
    textShadowColor: 'rgba(255,0,127,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  tagline: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 4,
    marginTop: 12,
  },
});
