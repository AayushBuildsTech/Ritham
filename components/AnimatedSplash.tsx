import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Dimensions } from 'react-native';
import { Fonts, Motion, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';

// Animated launch screen shown after the (static) native splash and before the
// app reveals — "The First Beat". The brand's meaning is ऋत / Ṛta, cosmic rhythm,
// so the sequence is a single cosmic heartbeat:
//
//   1. the nebula background settles in
//   2. the gold BINDU (the seed the rhythm turns around) appears and blooms
//   3. the neon ऋ MARK ignites over it
//   4. a single ripple pulses outward — the beat
//   5. the wordmark + tagline fade up; brief hold; the overlay fades → onFinish()
//
// Pure RN Animated — no reanimated, no native deps.
const { width: SCREEN_W } = Dimensions.get('window');
const MARK = Math.min(SCREEN_W * 0.66, 300);
const BINDU = MARK * 0.13;
const RING = MARK * 0.6;

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const th = useColors();
  const styles = makeStyles(th);

  const bgOpacity = useRef(new Animated.Value(0)).current;
  const bgScale = useRef(new Animated.Value(1.06)).current;
  const binduOpacity = useRef(new Animated.Value(0)).current;
  const binduScale = useRef(new Animated.Value(0.2)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(1.08)).current;
  const beat = useRef(new Animated.Value(0)).current;      // 0→1 drives the ripple
  const pulse = useRef(new Animated.Value(1)).current;     // tiny mark scale kick on the beat
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textShift = useRef(new Animated.Value(12)).current;
  const overlay = useRef(new Animated.Value(1)).current;

  const ease = Easing.bezier(...Motion.easeOut);

  useEffect(() => {
    // Background settles on its own timeline (slow, calm).
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 650, easing: ease, useNativeDriver: true }),
      Animated.timing(bgScale, { toValue: 1, duration: 1600, easing: ease, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(220),
      // 2. the gold seed appears and blooms
      Animated.parallel([
        Animated.timing(binduOpacity, { toValue: 1, duration: 300, easing: ease, useNativeDriver: true }),
        Animated.timing(binduScale, { toValue: 1, duration: 560, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }),
      ]),
      // 3. the ऋ ignites over it
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 1, duration: 520, easing: ease, useNativeDriver: true }),
        Animated.timing(markScale, { toValue: 1, duration: 720, easing: ease, useNativeDriver: true }),
      ]),
      // 4. the beat — one ripple + a small kick of the mark
      Animated.parallel([
        Animated.timing(beat, { toValue: 1, duration: 720, easing: ease, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.09, duration: 180, easing: ease, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 360, easing: ease, useNativeDriver: true }),
        ]),
      ]),
      // 5. the name rises up
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 440, easing: ease, useNativeDriver: true }),
        Animated.timing(textShift, { toValue: 0, duration: 440, easing: ease, useNativeDriver: true }),
      ]),
      Animated.delay(680),
      Animated.timing(overlay, { toValue: 0, duration: 440, easing: ease, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onFinish(); });
  }, []);

  // Two staggered rings make the beat read as a throb, not a faint line.
  const ring1Scale = beat.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.0] });
  const ring1Opacity = beat.interpolate({ inputRange: [0, 0.12, 0.55, 1], outputRange: [0, 0.9, 0.45, 0] });
  const ring2Scale = beat.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.7] });
  const ring2Opacity = beat.interpolate({ inputRange: [0, 0.16, 0.28, 0.7, 1], outputRange: [0, 0, 0.6, 0.3, 0] });

  return (
    <Animated.View style={[styles.root, { opacity: overlay }]} pointerEvents="none">
      <Animated.Image
        source={require('../assets/splash/bg.webp')}
        style={[StyleSheet.absoluteFill, { opacity: bgOpacity, transform: [{ scale: bgScale }] }]}
        resizeMode="cover"
      />

      <Animated.View style={styles.stage}>
        {/* the beat — two rings pulsing outward from the mark */}
        <Animated.View
          style={[styles.ring, styles.ring2, { opacity: ring2Opacity, transform: [{ scale: ring2Scale }] }]}
          pointerEvents="none"
        />
        <Animated.View
          style={[styles.ring, { opacity: ring1Opacity, transform: [{ scale: ring1Scale }] }]}
          pointerEvents="none"
        />

        {/* the neon ऋ mark */}
        <Animated.Image
          source={require('../assets/splash/mark.webp')}
          style={[styles.mark, { opacity: markOpacity, transform: [{ scale: markScale }, { scale: pulse }] }]}
          resizeMode="contain"
        />

        {/* the gold seed / bindu, resting just below the letter */}
        <Animated.Image
          source={require('../assets/splash/bindu.webp')}
          style={[styles.bindu, { opacity: binduOpacity, transform: [{ scale: binduScale }] }]}
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
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D0D1A',
  },
  stage: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute', width: MARK, height: MARK },
  bindu: {
    position: 'absolute', width: BINDU, height: BINDU,
    top: MARK * 0.72, left: (MARK - BINDU) / 2,
  },
  ring: {
    position: 'absolute', width: RING, height: RING, borderRadius: RING / 2,
    borderWidth: 4, borderColor: 'rgba(255,0,127,1)',
  },
  ring2: { borderWidth: 2.5, borderColor: 'rgba(150,70,220,0.95)' },
  wordmark: {
    fontFamily: Fonts.displayBold,
    fontSize: 46,
    color: '#F7EAD0',
    letterSpacing: 1,
    marginTop: 40,
    textShadowColor: 'rgba(233,180,76,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
  tagline: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 4,
    marginTop: 12,
  },
});
