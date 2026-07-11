// CallOrb — the living centerpiece of the voice-call screen. Layered violet→magenta
// gradients with a soft outer glow that BREATHE at rest, PULSE to the astrologer's
// speech (driven by the Vapi output volume), and bloom a LISTENING RING while the
// user speaks. Safe-motion: if the OS "reduce motion" setting is on, it renders a
// calm static orb (no loops). No emojis, no gimmicky waveforms — just depth + light.

import { useEffect, useState } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation, Easing,
} from 'react-native-reanimated';
import type { CallState } from '../lib/callService';

const VIOLET = '#7B2CBF';
const MAGENTA = '#FF007F';
const MAGENTA_SOFT = 'rgba(255,0,127,0.32)';

export function CallOrb({
  state,
  volume = 0,
  size = 220,
}: {
  state: CallState;
  volume?: number;   // 0..1, assistant output level
  size?: number;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; sub?.remove?.(); };
  }, []);

  const breathe = useSharedValue(0);   // 0..1 slow loop
  const listen = useSharedValue(0);    // 0..1 listening-ring pulse
  const level = useSharedValue(0);     // smoothed speech level

  const speaking = state === 'speaking';
  const listening = state === 'listening' || state === 'active';
  const connecting = state === 'connecting';

  // rest breathing loop (halted under reduce-motion)
  useEffect(() => {
    if (reduceMotion) { cancelAnimation(breathe); breathe.value = 0.5; return; }
    breathe.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [reduceMotion]);

  // listening-ring pulse (only while waiting for the user)
  useEffect(() => {
    if (reduceMotion || !listening || speaking) { cancelAnimation(listen); listen.value = 0; return; }
    listen.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(listen);
  }, [reduceMotion, listening, speaking]);

  // smooth the incoming speech level so the orb swells with the voice
  useEffect(() => {
    const target = speaking ? Math.min(1, Math.max(0, volume)) : 0;
    level.value = withTiming(target, { duration: 140, easing: Easing.out(Easing.quad) });
  }, [volume, speaking]);

  const coreStyle = useAnimatedStyle(() => {
    const breath = 1 + breathe.value * 0.05;
    const swell = 1 + level.value * 0.14;
    return { transform: [{ scale: breath * swell }] };
  });

  const glowStyle = useAnimatedStyle(() => {
    const base = connecting ? 0.28 : 0.42;
    const opacity = base + breathe.value * 0.12 + level.value * 0.35;
    const scale = 1 + breathe.value * 0.06 + level.value * 0.22;
    return { opacity: Math.min(1, opacity), transform: [{ scale }] };
  });

  const ringStyle = useAnimatedStyle(() => {
    // a ring that expands and fades outward while listening
    const p = listen.value;
    return { opacity: (1 - p) * 0.5, transform: [{ scale: 1 + p * 0.5 }] };
  });

  const S = size;
  return (
    <View style={[styles.wrap, { width: S * 1.9, height: S * 1.9 }]}>
      {/* soft outer glow */}
      <Animated.View style={[styles.center, glowStyle]}>
        <LinearGradient
          colors={[MAGENTA_SOFT, 'rgba(123,44,191,0.10)', 'transparent']}
          style={{ width: S * 1.7, height: S * 1.7, borderRadius: S * 0.85 }}
        />
      </Animated.View>

      {/* listening ring */}
      <Animated.View
        style={[styles.center, ringStyle, {
          width: S * 1.16, height: S * 1.16, borderRadius: S * 0.58,
          borderWidth: 2, borderColor: MAGENTA_SOFT,
        }]}
        pointerEvents="none"
      />

      {/* core orb */}
      <Animated.View style={[styles.center, coreStyle]}>
        <View style={[styles.orb, { width: S, height: S, borderRadius: S / 2 }]}>
          <LinearGradient
            colors={[VIOLET, MAGENTA]}
            start={{ x: 0.15, y: 0.1 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* top-left sheen for depth */}
          <LinearGradient
            colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.0)']}
            start={{ x: 0.1, y: 0.05 }}
            end={{ x: 0.7, y: 0.6 }}
            style={StyleSheet.absoluteFill}
          />
          {/* inner depth vignette */}
          <LinearGradient
            colors={['transparent', 'rgba(13,13,26,0.28)']}
            start={{ x: 0.5, y: 0.35 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  orb: {
    overflow: 'hidden',
    shadowColor: MAGENTA,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 34,
    elevation: 16,
  },
});
