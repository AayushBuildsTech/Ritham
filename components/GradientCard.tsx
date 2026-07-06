import { ReactNode } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Depth } from '../constants/theme';
import { useColors } from '../context/ThemeContext';

// A card whose surface is a subtle gradient (from theme gradients or
// `accentCardGradient(...)`). Border/radius/depth are baked in; pass padding and
// any overrides via `style`. Used for hero + flagship cards.
export function GradientCard({
  colors,
  style,
  borderColor,
  children,
}: {
  colors: readonly [string, string];
  style?: ViewStyle | ViewStyle[];
  borderColor?: string;
  children: ReactNode;
}) {
  const th = useColors();
  const bc = borderColor ?? th.border;
  return (
    <LinearGradient
      colors={colors as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: bc }, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    ...Depth.card,
  },
});
