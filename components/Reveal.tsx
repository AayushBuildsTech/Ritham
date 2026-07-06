import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle } from 'react-native';
import { Motion } from '../constants/theme';

// Premium entrance: fade + slight upward slide, on a decelerated settle curve.
// Pass `index` to stagger successive items down a list/dashboard.
export function Reveal({
  children,
  index = 0,
  distance = 16,
  style,
}: {
  children: ReactNode;
  index?: number;
  distance?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    const easing = Easing.bezier(...Motion.easeOut);
    const delay = index * Motion.stagger;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: Motion.duration.base, delay, easing, useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration: Motion.duration.base, delay, easing, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
