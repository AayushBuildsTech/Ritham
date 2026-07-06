import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { sendChat, ChatResult, SessionKind, ChatBalance } from '../../lib/chatService';
import { getBalance } from '../../lib/paymentService';
import { track } from '../../lib/analytics';
import Paywall from '../../components/Paywall';
import { formatSeconds } from '../../config/pricing';
import { Colors, Fonts, Spacing, Radius, Accents } from '../../constants/theme';
import { Icon } from '../../components/Icon';
import { TAB_BAR_HEIGHT } from './_layout';

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
  const insets = useSafeAreaInsets();
  const kbVisible = useKeyboardState((s) => s.isVisible);

  const [entry, setEntry] = useState<Entry>('loading');
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const [freeUsed, setFreeUsed] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionKind, setSessionKind] = useState<SessionKind | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [banner, setBanner] = useState('');

  // Phase 4 — entitlements + paywall
  const [balance, setBalance] = useState<ChatBalance | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [pendingKind, setPendingKind] = useState<'questions' | 'time' | undefined>(undefined);

  const scrollRef = useRef<ScrollView>(null);

  const hasBalance = !!balance && (balance.questions > 0 || balance.seconds > 0);

  // ── load profile + free-minute status + entitlement balance ──────────────────
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
      setBalance(await getBalance());
      setEntry('ready');
    })();
  }, [user]);

  // ── countdown (time-based sessions only) ─────────────────────────────────────
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) { setEnded(true); setShowPaywall(true); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const scrollDown = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || ended || showPaywall || !profile) return;
    setInput('');
    setBanner('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    scrollDown();
    setSending(true);

    // brand-new session? hint which entitlement to use. Continuing? pass sessionId.
    const useKind = sessionId ? undefined : pendingKind;

    let res: ChatResult;
    try {
      res = await sendChat(profile.id, text, sessionId ?? undefined, useKind);
    } catch {
      res = { error: 'request_failed' };
    }
    setSending(false);

    // needs a purchase before this message can be sent → restore text, open paywall
    if (res.error === 'needs_purchase' || res.error === 'out_of_questions' || res.error === 'free_used') {
      setMessages((m) => m.slice(0, -1)); // remove the optimistic user bubble
      setInput(text);
      if (res.session?.kind) setSessionKind(res.session.kind);
      setShowPaywall(true);
      return;
    }

    if (res.expired) {
      setEnded(true);
      setShowPaywall(true);
      setBanner('Your session has ended.');
      return;
    }
    if (res.error) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Something went wrong. Please try again in a moment.' }]);
      scrollDown();
      return;
    }
    if (res.session) {
      setSessionId(res.session.id);
      if (res.session.kind) setSessionKind(res.session.kind);
      setExpiresAt(res.session.expires_at ? new Date(res.session.expires_at).getTime() : null);
      setPendingKind(undefined);
    }
    if (res.balance) setBalance(res.balance);
    if (res.reply) {
      track('chat_message', { kind: res.session?.kind ?? sessionKind ?? undefined });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply! }]);
      scrollDown();
    }
  }

  function handlePurchased(kind: 'questions' | 'time', newBalance?: ChatBalance) {
    if (newBalance) setBalance(newBalance);
    else getBalance().then(setBalance);
    setShowPaywall(false);
    setBanner('');
    setFreeUsed(true);

    // Continue the same question session if we simply topped up questions.
    const continueSame = sessionId && sessionKind === 'paid_questions' && kind === 'questions' && !ended;
    if (!continueSame) {
      setPendingKind(kind);
      setSessionId(null);
      setSessionKind(null);
      setExpiresAt(null);
      setRemaining(null);
      setEnded(false);
    }
  }

  // ── renders ──────────────────────────────────────────────────────────────────
  if (entry === 'loading') {
    return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;
  }

  if (entry === 'need_profile') {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}><Icon name="sparkle" size={30} color={Accents.sapphire.color} /></View>
        <Text style={styles.title}>Ask the astrologer</Text>
        <Text style={styles.subtitle}>Create your Kundli first so your astrologer can read your chart.</Text>
        <Pressable style={styles.btn} onPress={() => router.push('/profile')} android_ripple={{ color: Colors.goldDeep }}>
          <Text style={styles.btnText}>Set up your Kundli</Text>
          <Icon name="arrowRight" size={16} color={Colors.canvas} />
        </Pressable>
      </View>
    );
  }

  const notStarted = messages.length === 0 && !sessionId;
  const timed = sessionKind === 'free_minute' || sessionKind === 'paid_time';
  const inputLocked = ended || showPaywall;
  const inputVisible = !showPaywall && !(notStarted && freeUsed && !hasBalance);
  const canSend = !!input.trim() && !sending && !inputLocked;

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={0}>

      {/* header / status pill */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={styles.headerTitle}>Ritham</Text>
        {timed && remaining !== null && !ended && (
          <View style={styles.pill}>
            <Icon name="clock" size={14} color={Colors.goldLight} />
            <Text style={styles.pillText}>{mmss(remaining)}</Text>
          </View>
        )}
        {sessionKind === 'paid_questions' && !ended && balance && (
          <View style={styles.pill}>
            <Icon name="question" size={14} color={Colors.goldLight} />
            <Text style={styles.pillText}>{balance.questions} left</Text>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          !inputVisible && { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.lg },
        ]}
        onContentSizeChange={scrollDown}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {notStarted && !freeUsed && !showPaywall && (
          <View style={styles.introCard}>
            <Text style={styles.introEyebrow}>YOUR FIRST MINUTE IS FREE</Text>
            <Text style={styles.introTitle}>A conversation with the stars</Text>
            <Text style={styles.introText}>
              Ask your AI Vedic astrologer anything — career, relationships, timing, remedies.
              Send a message to begin your free 1-minute session.
            </Text>
            <Text style={styles.introDisclaimer}>
              For guidance and reflection — not a substitute for professional advice.
            </Text>
          </View>
        )}

        {notStarted && freeUsed && hasBalance && !showPaywall && (
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>You’re ready to chat</Text>
            <Text style={styles.introText}>
              {balance!.questions > 0 && `You have ${balance!.questions} question${balance!.questions > 1 ? 's' : ''}. `}
              {balance!.seconds > 0 && `You have ${formatSeconds(balance!.seconds)} of talk time. `}
              Send a message to begin.
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

        {/* Paywall — shown when the free minute / pack is exhausted, or on demand */}
        {(showPaywall || (notStarted && freeUsed && !hasBalance)) && (
          <Paywall
            title={ended ? 'Your session ended' : 'Continue your reading'}
            subtitle={
              ended
                ? 'Pick a pack to keep chatting with your astrologer.'
                : 'Unlock more with a question or time pack.'
            }
            prefill={{ contact: user?.phone ?? '', name: profile?.name }}
            onPurchased={handlePurchased}
          />
        )}
      </ScrollView>

      {inputVisible && (
        <View style={[styles.inputRow, { paddingBottom: kbVisible ? Spacing.sm : insets.bottom + TAB_BAR_HEIGHT }]}>
          <TextInput
            style={styles.input}
            placeholder={inputLocked ? 'Session ended' : 'Ask about your chart…'}
            placeholderTextColor={Colors.textDim}
            value={input}
            onChangeText={setInput}
            editable={!inputLocked}
            multiline
            onSubmitEditing={handleSend}
          />
          <Pressable
            style={[styles.sendBtn, !canSend && styles.sendBtnIdle]}
            onPress={handleSend}
            disabled={!canSend}
            android_ripple={{ color: Colors.goldDeep, borderless: true, radius: 24 }}
          >
            <Icon name="send" size={19} color={canSend ? Colors.canvas : Colors.textDim} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.canvas },
  center: { flex: 1, backgroundColor: Colors.canvas, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyIcon: {
    width: 72, height: 72, borderRadius: Radius.pill, marginBottom: Spacing.lg,
    backgroundColor: Accents.sapphire.faint, borderWidth: 1, borderColor: Accents.sapphire.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: Colors.text, textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.gold, borderRadius: Radius.sm, paddingVertical: 14, paddingHorizontal: Spacing.xl,
  },
  btnText: { fontFamily: Fonts.bodySemibold, color: Colors.canvas, fontSize: Fonts.size.md, letterSpacing: 0.3 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.canvas,
  },
  headerTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: Colors.goldLight, letterSpacing: 0.5 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingVertical: 5, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: Colors.borderStrong,
  },
  pillText: { fontFamily: Fonts.bodySemibold, color: Colors.goldLight, fontSize: Fonts.size.sm },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.sm },

  introCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  introEyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: Accents.sapphire.color, letterSpacing: 2, marginBottom: Spacing.sm },
  introTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: Colors.text, marginBottom: Spacing.sm },
  introText: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 21 },
  introDisclaimer: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: Colors.textDim, lineHeight: 16, marginTop: Spacing.sm, fontStyle: 'italic' },

  bubble: { maxWidth: '85%', borderRadius: Radius.lg, padding: Spacing.md },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.gold, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  userText: { fontFamily: Fonts.bodyMedium, color: Colors.canvas, fontSize: Fonts.size.md, lineHeight: 21 },
  aiText: { fontFamily: Fonts.body, color: Colors.text, fontSize: Fonts.size.md, lineHeight: 23 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.canvas,
  },
  input: {
    flex: 1, maxHeight: 120, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, color: Colors.text,
    backgroundColor: Colors.surfaceSunken, fontFamily: Fonts.body, fontSize: Fonts.size.md,
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  sendBtnIdle: { backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border },
});
