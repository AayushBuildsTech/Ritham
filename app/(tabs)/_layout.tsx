import { Tabs } from 'expo-router';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { BlurView } from 'expo-blur';
import { Icon, IconName } from '../../components/Icon';
import { Colors, Fonts } from '../../constants/theme';

// Height of the bar content ABOVE the safe-area inset. Tab screens add
// `TAB_BAR_HEIGHT + insets.bottom` of bottom padding so nothing hides behind the
// glass bar (which is absolutely positioned so content scrolls under it).
export const TAB_BAR_HEIGHT = 58;

const TABS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Home' },
  chat: { icon: 'chat', label: 'Ask' },
  store: { icon: 'store', label: 'Store' },
  reports: { icon: 'reports', label: 'Reports' },
};

// Glass bar: a real expo-blur BlurView (frosted dark) under a faint scrim for
// contrast, a thin gold top hairline, a short sharp gold indicator over the
// active tab (not a fat pill), thin-line icons, tracked-out labels.
function LuxTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  // Hide the (absolute) glass bar while a keyboard is open so it never overlaps
  // an input (e.g. the chat composer).
  const kbVisible = useKeyboardState((s) => s.isVisible);
  if (kbVisible) return null;
  return (
    <View style={[styles.bar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
      <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <View style={styles.hairline} />
      <View style={styles.row}>
        {state.routes.map((route: any, index: number) => {
          const cfg = TABS[route.name];
          if (!cfg) return null;
          const focused = state.index === index;
          const color = focused ? Colors.gold : Colors.textDim;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress', target: route.key, canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              android_ripple={{ color: Colors.goldFaint, borderless: true, radius: 44 }}
              style={styles.item}
            >
              <View style={[styles.indicator, focused && styles.indicatorActive]} />
              <Icon name={cfg.icon} size={23} color={color} />
              <Text style={[styles.label, { color }]}>{cfg.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <LuxTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="store" />
      <Tabs.Screen name="reports" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingTop: 10, overflow: 'hidden',
  },
  // light enough to let the blur read as glass, dark enough for icon contrast
  scrim: { backgroundColor: 'rgba(9,9,11,0.34)' },
  hairline: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: Colors.border,
  },
  row: { flexDirection: 'row', flex: 1 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 5 },
  indicator: {
    position: 'absolute', top: -10, width: 22, height: 2, borderRadius: 2,
    backgroundColor: 'transparent',
  },
  indicatorActive: { backgroundColor: Colors.gold },
  label: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 10.5,
    letterSpacing: 1,
  },
});
