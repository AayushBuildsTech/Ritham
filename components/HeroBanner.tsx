// HeroBanner — a cinematic image used as a screen/section hero. The "Stellar
// Velocity" art is opaque and dark-edged, so rather than always framing it in a
// bordered card (which can read as a pasted-on photo tile), we can dissolve its
// edges into the page background so the art feels native. Three looks:
//   • framed  (default)     — rounded, bordered card; good over content with a scrim.
//   • blend                 — no border; bottom edge fades into the page so the art
//                             flows down into the text below (top-of-screen heroes).
//   • vignette              — no border; all four edges fade into the page, turning a
//                             square image into a soft glowing emblem (e.g. numerology).
// Layout is the plain ImageBackground pattern (image sizes the card via aspectRatio);
// the edge-fades are just gradient overlays on top, so sizing is never affected.
import { ReactNode } from 'react';
import { View, ImageBackground, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Depth, Spacing, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';

// #RRGGBB → rgba() so a fade runs from the page colour at alpha 0 → alpha 1 (a pure
// dissolve, not a muddy fade through black like the CSS 'transparent' keyword gives).
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

interface Props {
  source: any;
  aspectRatio?: number;   // width : height (default wide 16:9)
  radius?: number;
  scrim?: boolean;        // dark bottom gradient for overlaid children (framed look)
  blend?: boolean;        // fade the bottom edge into the page background
  vignette?: boolean;     // fade all four edges into the page background
  children?: ReactNode;   // overlaid at the bottom-left when provided
  style?: StyleProp<ViewStyle>;
}

export function HeroBanner({
  source, aspectRatio = 16 / 9, radius = Radius.lg,
  scrim = false, blend = false, vignette = false, children, style,
}: Props) {
  const th = useColors();
  const styles = makeStyles(th);
  const page = th.bg;                     // fade target = the actual screen colour
  const bare = blend || vignette;         // edge-fade looks drop the card chrome
  const r = vignette ? 0 : radius;

  return (
    <View style={[styles.wrap, bare ? styles.bare : styles.framed, { borderRadius: r }, style]}>
      <ImageBackground source={source} style={[styles.img, { aspectRatio }]} imageStyle={{ borderRadius: r }} resizeMode="cover">
        {/* Legibility scrim for overlaid children (framed heroes with text on top). */}
        {scrim && (
          <LinearGradient
            colors={[rgba(page, 0), rgba(page, 0.15), rgba(page, 0.9)]}
            locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none"
          />
        )}

        {/* Bottom dissolve into the page — used by blend and vignette alike. */}
        {bare && (
          <LinearGradient
            colors={[rgba(page, 0), rgba(page, 0), rgba(page, 1)]}
            locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} pointerEvents="none"
          />
        )}

        {/* Vignette also dissolves the top and both sides so the square has no seam. */}
        {vignette && (
          <>
            <LinearGradient
              colors={[rgba(page, 1), rgba(page, 0)]} locations={[0, 0.4]}
              style={StyleSheet.absoluteFill} pointerEvents="none"
            />
            <LinearGradient
              colors={[rgba(page, 1), rgba(page, 0), rgba(page, 0), rgba(page, 1)]}
              locations={[0, 0.22, 0.78, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill} pointerEvents="none"
            />
          </>
        )}

        {children ? <View style={styles.overlay}>{children}</View> : null}
      </ImageBackground>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  wrap: { overflow: 'hidden' },
  framed: { borderWidth: 1, borderColor: th.border, backgroundColor: th.surfaceSunken, ...Depth.card },
  bare: { backgroundColor: 'transparent' },
  img: { width: '100%', justifyContent: 'flex-end' },
  overlay: { padding: Spacing.md },
});
