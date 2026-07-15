// HeroBanner — a rounded, cinematic image used as a screen/section hero. All the
// "Stellar Velocity" AI art is opaque and dark-edged, so we render it as a framed
// card (optionally with a bottom scrim for overlaid text), matching the Reports
// tab's ImageBackground pattern so new art feels native, not pasted-on.
import { ReactNode } from 'react';
import { View, ImageBackground, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Depth, Spacing, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';

// Bottom-weighted dark scrim so overlaid text stays legible on the art.
const SCRIM = ['rgba(6,6,12,0)', 'rgba(6,6,12,0.15)', 'rgba(7,7,15,0.85)'] as const;

interface Props {
  source: any;
  aspectRatio?: number;   // width : height (default wide 16:9)
  radius?: number;
  scrim?: boolean;        // dark bottom gradient for overlaid children
  children?: ReactNode;   // overlaid at the bottom-left when provided
  style?: StyleProp<ViewStyle>;
}

export function HeroBanner({ source, aspectRatio = 16 / 9, radius = Radius.lg, scrim = false, children, style }: Props) {
  const th = useColors();
  const styles = makeStyles(th);
  return (
    <View style={[styles.wrap, { borderRadius: radius }, style]}>
      <ImageBackground source={source} style={[styles.img, { aspectRatio }]} imageStyle={{ borderRadius: radius }} resizeMode="cover">
        {scrim && <LinearGradient colors={SCRIM} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />}
        {children ? <View style={styles.overlay}>{children}</View> : null}
      </ImageBackground>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  wrap: { overflow: 'hidden', borderWidth: 1, borderColor: th.border, backgroundColor: th.surfaceSunken, ...Depth.card },
  img: { width: '100%', justifyContent: 'flex-end' },
  overlay: { padding: Spacing.md },
});
