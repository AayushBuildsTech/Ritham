import { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { Icon } from './Icon';

// Shared detail-screen header: gold back chevron, centered serif title, optional
// right slot. Handles the status-bar inset for edge-to-edge.
export function ScreenHeader({
  title, onBack, right,
}: { title: string; onBack: () => void; right?: ReactNode }) {
  const th = useColors();
  const styles = makeStyles(th);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
      <Pressable
        onPress={onBack}
        hitSlop={10}
        style={styles.side}
        android_ripple={{ color: th.goldFaint, borderless: true, radius: 22 }}
      >
        <Icon name="back" size={22} color={th.gold} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: th.border, backgroundColor: th.canvas,
  },
  side: { minWidth: 44, height: 32, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: {
    flex: 1, textAlign: 'center', fontFamily: Fonts.displayBold,
    fontSize: Fonts.size.xl, color: th.text,
  },
});
