import { Tabs } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { Colors, Fonts } from '../../constants/theme';

type TabIconProps = { label: string; emoji: string; focused: boolean };

function TabIcon({ label, emoji, focused }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <Text style={[styles.emoji, focused && styles.emojiActive]}>{emoji}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.bgCard,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Home" emoji="🌙" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Chat" emoji="✨" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Store" emoji="🛍️" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Reports" emoji="📜" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  emoji: { fontSize: 22, opacity: 0.5 },
  emojiActive: { opacity: 1 },
  tabLabel: { fontSize: Fonts.size.xs, color: Colors.tabInactive, marginTop: 2 },
  tabLabelActive: { color: Colors.tabActive },
});
