import { ReactNode } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Depth } from '../constants/theme';

// A card whose surface is a subtle gradient (from theme `Gradients` or
// `accentCardGradient(...)`). Border/radius/depth are baked in; pass padding and
// any overrides via `style`. Used for hero + flagship cards.
export function GradientCard({
  colors,
  style,
  borderColor = Colors.border,
  children,
}: {
  colors: readonly [string, string];
  style?: ViewStyle | ViewStyle[];
  borderColor?: string;
  children: ReactNode;
}) {
  return (
    <LinearGradient
      colors={colors as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor }, style]}
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
