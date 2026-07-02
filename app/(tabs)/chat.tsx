import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { sendChat, ChatResult } from '../../lib/chatService';
import { Colors, Fonts, Spacing } from '../../constants/theme';

type Entry = 'loading' | 'need_profile' | 'ready';
interface Msg { role: 'user' | 'assistant'; content: string }

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ChatScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [entry, setEntry] = useState<Entry>('loading');
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const [freeUsed, setFreeUsed] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [banner, setBanner] = useState('');

  const scrollRef = useRef<ScrollView>(null);

  // ── load profile + free-minute status ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: p } = await supabase
        .from('profiles').select('id, name, kundli_chart')
        .eq('user_id', user.id).order('created_at', { ascending: true })
        .limit(1).maybeSingle();

      if (!p || !p.kundli_chart) { setEntry('need_profile'); return; }
      setProfile({ id: p.id, name: p.name });

      const { data: u } = await supabase
        .from('users').select('free_minute_used_at').eq('id', user.id).maybeSingle();
      setFreeUsed(!!u?.free_minute_used_at);
      setEntry('ready');
    })();
  }, [user]);

  // ── countdown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setEnded(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const scrollDown = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || ended || !profile) return;
    setInput('');
    setBanner('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    scrollDown();
    setSending(true);

    let res: ChatResult;
    try {
      res = await sendChat(profile.id, text, sessionId ?? undefined);
    } catch {
      res = { error: 'request_failed' };
    }
    setSending(false);

    if (res.expired) {
      setEnded(true);
      setBanner('Your free minute is over.');
      return;
    }
    if (res.error === 'free_used') {
      setFreeUsed(true);
      setBanner('You’ve already used your free minute.');
      return;
    }
    if (res.error) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Something went wrong. Please try again in a moment.' }]);
      scrollDown();
      return;
    }
    if (res.session) {
      setSessionId(res.session.id);
      if (res.session.expires_at) setExpiresAt(new Date(res.session.expires_at).getTime());
    }
    if (res.reply) {
      setMessages((m) => [...m, { role: 'assistant', content: res.reply! }]);
      scrollDown();
    }
  }

  // ── renders ──────────────────────────────────────────────────────────────────
  if (entry === 'loading') {
    return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;
  }

  if (entry === 'need_profile') {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>✨</Text>
        <Text style={styles.title}>Chat with Ritham</Text>
        <Text style={styles.subtitle}>Create your Kundli first so your astrologer can read your chart.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/profile')}>
          <Text style={styles.btnText}>Set up your Kundli →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const notStarted = messages.length === 0 && !sessionId;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      {/* header / timer */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>✨ Ritham</Text>
        {remaining !== null && !ended && (
          <View style={styles.timerPill}>
            <Text style={styles.timerText}>⏳ {mmss(remaining)}</Text>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={scrollDown}
        keyboardShouldPersistTaps="handled"
      >
        {notStarted && !freeUsed && (
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>Your first minute is free 🎁</Text>
            <Text style={styles.introText}>
              Ask your AI Vedic astrologer anything — career, relationships, timing, remedies.
              Send a message to begin your free 1-minute session.
            </Text>
          </View>
        )}

        {notStarted && freeUsed && (
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>Free minute used</Text>
            <Text style={styles.introText}>
              You’ve already had your free session. Chat packs to continue are coming soon.
            </Text>
          </View>
        )}

        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.aiBubble]}>
            <Text style={m.role === 'user' ? styles.userText : styles.aiText}>{m.content}</Text>
          </View>
        ))}

        {sending && (
          <View style={[styles.bubble, styles.aiBubble]}>
            <ActivityIndicator color={Colors.gold} />
          </View>
        )}
      </ScrollView>

      {(ended || banner) ? (
        <View style={styles.endedBanner}>
          <Text style={styles.endedText}>
            {ended ? 'Your free minute is over. ' : `${banner} `}Chat packs are coming soon.
          </Text>
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={ended || freeUsed ? 'Free session ended' : 'Ask about your chart…'}
          placeholderTextColor={Colors.textDim}
          value={input}
          onChangeText={setInput}
          editable={!ended && !(freeUsed && notStarted)}
          multiline
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (sending || ended || (freeUsed && notStarted)) && styles.sendDisabled]}
          onPress={handleSend}
          disabled={sending || ended || (freeUsed && notStarted)}
        >
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  icon: { fontSize: 64, marginBottom: Spacing.lg },
  title: { fontSize: Fonts.size.xxl, color: Colors.text, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { fontSize: Fonts.size.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  btn: { backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl },
  btnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  headerTitle: { fontSize: Fonts.size.lg, color: Colors.goldLight, fontWeight: '700' },
  timerPill: { backgroundColor: Colors.bgMid, borderRadius: 20, paddingVertical: 4, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.gold },
  timerText: { color: Colors.goldLight, fontSize: Fonts.size.sm, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.sm },

  introCard: { backgroundColor: Colors.bgCard, borderRadius: 14, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  introTitle: { fontSize: Fonts.size.lg, color: Colors.goldLight, fontWeight: '700', marginBottom: Spacing.xs },
  introText: { fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 21 },

  bubble: { maxWidth: '85%', borderRadius: 16, padding: Spacing.md },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.gold, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  userText: { color: Colors.bg, fontSize: Fonts.size.md, lineHeight: 21 },
  aiText: { color: Colors.text, fontSize: Fonts.size.md, lineHeight: 22 },

  endedBanner: { backgroundColor: Colors.bgMid, padding: Spacing.sm, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border },
  endedText: { color: Colors.textMuted, fontSize: Fonts.size.sm },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    padding: Spacing.sm, paddingBottom: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  input: {
    flex: 1, maxHeight: 120, borderWidth: 1, borderColor: Colors.border, borderRadius: 20,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, color: Colors.text,
    backgroundColor: Colors.bgMid, fontSize: Fonts.size.md,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: Colors.bg, fontSize: 20, fontWeight: '700' },
});
