import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSessionMessages, ChatMessage } from '../lib/chatService';
import { Fonts, Spacing, Radius, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

// Read-only view of one past conversation. No input row — history is immutable;
// starting a fresh chat is a deliberate tap back on the Chat tab.
export default function ChatConversationScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);

  useEffect(() => {
    if (!id) return;
    getSessionMessages(id).then(setMessages);
  }, [id]);

  return (
    <View style={styles.root}>
      <ScreenHeader title={name || (isHindi ? 'बातचीत' : 'Conversation')} onBack={() => router.back()} />

      {messages === null ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.readonlyChip}>
            <Icon name="history" size={13} color={th.textDim} />
            <Text style={styles.readonlyText}>{isHindi ? 'पिछली बातचीत · केवल पढ़ने के लिए' : 'Past conversation · read only'}</Text>
          </View>

          {messages.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.aiBubble]}>
              <Text style={m.role === 'user' ? styles.userText : styles.aiText}>{m.content}</Text>
            </View>
          ))}

          <Pressable
            style={styles.newChatBtn}
            onPress={() => router.replace('/(tabs)/chat')}
            android_ripple={{ color: th.goldFaint }}
          >
            <Icon name="chat" size={16} color={th.gold} />
            <Text style={styles.newChatText}>{isHindi ? 'नई बातचीत शुरू करें' : 'Start a new chat'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, gap: Spacing.sm },

  readonlyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  readonlyText: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, letterSpacing: 0.3 },

  bubble: { maxWidth: '85%', borderRadius: Radius.lg, padding: Spacing.md },
  userBubble: { alignSelf: 'flex-end', backgroundColor: th.goldSurface, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: th.surface, borderWidth: 1, borderColor: th.border, borderBottomLeftRadius: 4 },
  userText: { fontFamily: Fonts.bodyMedium, color: th.goldContrast, fontSize: Fonts.size.md, lineHeight: 21 },
  aiText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, lineHeight: 23 },

  newChatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: Spacing.lg, paddingVertical: 13, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: th.borderStrong, backgroundColor: th.surface,
  },
  newChatText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.md, letterSpacing: 0.3 },
});
