import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useActiveProfile } from '../../context/ProfileContext';
import { supabase } from '../../lib/supabase';
import { sendChat, fetchGreeting, ChatResult, SessionKind, ChatBalance } from '../../lib/chatService';
import { getBalance } from '../../lib/paymentService';
import { getKundli, ProfileRow } from '../../lib/kundliService';
import { track } from '../../lib/analytics';
import Paywall from '../../components/Paywall';
import { formatSeconds } from '../../config/pricing';
import { Colors, Fonts, Spacing, Radius, Accents, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from '../../components/Icon';
import { TAB_BAR_HEIGHT } from './_layout';

type Entry = 'loading' | 'need_profile' | 'ready';
interface Msg { role: 'user' | 'assistant'; content: string }

// Starter questions for an empty chat. Hindi users get Devanagari starters (so a tap
// sends Devanagari → a Devanagari reply); English users get the natural Hinglish mix
// with one plain-English example so the language freedom is obvious.
const STARTER_CHIPS_EN = [
  'Aaj mera din kaisa rahega?',
  'Meri shaadi kab hogi?',
  'Career mein growth kab aayegi?',
  'Will I get a job this year?',
];
const STARTER_CHIPS_HI = [
  'आज मेरा दिन कैसा रहेगा?',
  'मेरी शादी कब होगी?',
  'करियर में तरक्की कब आएगी?',
  'क्या इस साल मुझे नौकरी मिलेगी?',
];

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ChatScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const STARTER_CHIPS = isHindi ? STARTER_CHIPS_HI : STARTER_CHIPS_EN;
  const router = useRouter();
  const { user } = useAuth();
  const { activeId } = useActiveProfile();
  const insets = useSafeAreaInsets();
  const kbVisible = useKeyboardState((s) => s.isVisible);

  const [entry, setEntry] = useState<Entry>('loading');
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const [freeUsed, setFreeUsed] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [greeting, setGreeting] = useState<string | null>(null);
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

  // Mirror `sending` into a ref so the countdown interval can read it without
  // re-subscribing on every keystroke/turn. Used to freeze the clock while the
  // astrologer computes (the server credits the same compute time back to expires_at).
  const sendingRef = useRef(false);
  useEffect(() => { sendingRef.current = sending; }, [sending]);

  const hasBalance = !!balance && (balance.questions > 0 || balance.seconds > 0);

  // ── load the ACTIVE person + free-minute status + entitlement balance ─────────
  // Chat is anchored to the active family member's chart. Switching person on
  // Home starts a fresh conversation here (a new person = a new context).
  useEffect(() => {
    if (!user || !activeId) return; // profiles still resolving (Home handles onboarding)
    (async () => {
      // fresh conversation for the newly-active person
      setMessages([]); setGreeting(null); setSessionId(null); setSessionKind(null);
      setExpiresAt(null); setRemaining(null); setEnded(false); setBanner('');
      setEntry('loading');

      const { data: p } = await supabase
        .from('profiles').select('*')
        .eq('id', activeId).maybeSingle();

      if (!p || !p.kundli_chart) { setEntry('need_profile'); return; }
      // §7 pre-send guarantee: a thin/legacy chart (no dasha timeline) is re-fetched via
      // kundliService (which pulls VedAstro, falling back to the local engine) BEFORE any
      // paid chat, so the astrologer always has the full chart and never lacks details.
      if (!p.kundli_chart.dasha_timeline || !Array.isArray(p.kundli_chart.dasha_timeline)) {
        try { await getKundli(p as ProfileRow); } catch (_) { /* server also self-heals */ }
      }
      setProfile({ id: p.id, name: p.name });

      const { data: u } = await supabase
        .from('users').select('free_minute_used_at').eq('id', user.id).maybeSingle();
      setFreeUsed(!!u?.free_minute_used_at);
      setBalance(await getBalance());
      setEntry('ready');
      // opening greeting (server-side text); fail-soft — chat opens without it
      fetchGreeting().then(setGreeting);
    })();
  }, [user, activeId]);

  // ── countdown (time-based sessions only) ─────────────────────────────────────
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      // Pause the countdown while a reply is generating — the server pushes expires_at
      // forward by the compute time, so on the next tick the clock resumes from where
      // it froze rather than having bled seconds during the wait.
      if (sendingRef.current) return;
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
      setBanner(isHindi ? 'आपका सत्र समाप्त हो गया है।' : 'Your session has ended.');
      return;
    }
    if (res.error) {
      setMessages((m) => [...m, { role: 'assistant', content: isHindi ? 'कुछ गड़बड़ हो गई। कृपया थोड़ी देर में फिर कोशिश करें।' : 'Something went wrong. Please try again in a moment.' }]);
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
    return <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>;
  }

  if (entry === 'need_profile') {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}><Icon name="sparkle" size={30} color={Accents.sapphire.color} /></View>
        <Text style={styles.title}>{isHindi ? 'ज्योतिषी से पूछें' : 'Ask the astrologer'}</Text>
        <Text style={styles.subtitle}>{isHindi ? 'पहले अपनी कुंडली बनाएं ताकि आपके ज्योतिषी आपकी कुंडली पढ़ सकें।' : 'Create your Kundli first so your astrologer can read your chart.'}</Text>
        <Pressable style={styles.btn} onPress={() => router.push('/profile')} android_ripple={{ color: th.goldDeep }}>
          <Text style={styles.btnText}>{isHindi ? 'अपनी कुंडली बनाएं' : 'Set up your Kundli'}</Text>
          <Icon name="arrowRight" size={16} color={th.goldContrast} />
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
        <View style={styles.headerRight}>
          {timed && remaining !== null && !ended && (
            <View style={[styles.pill, sending && styles.pillPaused]}>
              {/* While the astrologer computes, the clock is frozen (the server credits
                  the compute time back) — show a pause glyph so the hold reads as intentional. */}
              <Icon name={sending ? 'pause' : 'clock'} size={14} color={th.goldLight} />
              <Text style={styles.pillText}>{mmss(remaining)}</Text>
            </View>
          )}
          {sessionKind === 'paid_questions' && !ended && balance && (
            <View style={styles.pill}>
              <Icon name="question" size={14} color={th.goldLight} />
              <Text style={styles.pillText}>{balance.questions} {isHindi ? 'शेष' : 'left'}</Text>
            </View>
          )}
          <Pressable
            onPress={() => router.push('/chat-history')}
            hitSlop={10}
            style={styles.headerBtn}
            android_ripple={{ color: th.goldFaint, borderless: true, radius: 22 }}
          >
            <Icon name="history" size={22} color={th.goldLight} />
          </Pressable>
        </View>
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
            <Text style={styles.introEyebrow}>{isHindi ? 'आपका पहला मिनट निःशुल्क है' : 'YOUR FIRST MINUTE IS FREE'}</Text>
            <Text style={styles.introTitle}>{isHindi ? 'तारों से एक बातचीत' : 'A conversation with the stars'}</Text>
            <Text style={styles.introDisclaimer}>
              {isHindi ? 'मार्गदर्शन और चिंतन के लिए — पेशेवर सलाह का विकल्प नहीं।' : 'For guidance and reflection — not a substitute for professional advice.'}
            </Text>
          </View>
        )}

        {notStarted && freeUsed && hasBalance && !showPaywall && (
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>{isHindi ? 'आप बातचीत के लिए तैयार हैं' : 'You’re ready to chat'}</Text>
            <Text style={styles.introText}>
              {balance!.questions > 0 && (isHindi ? `आपके पास ${balance!.questions} प्रश्न हैं। ` : `You have ${balance!.questions} question${balance!.questions > 1 ? 's' : ''}. `)}
              {balance!.seconds > 0 && (isHindi ? `आपके पास ${formatSeconds(balance!.seconds)} का समय है। ` : `You have ${formatSeconds(balance!.seconds)} of talk time. `)}
              {isHindi ? 'शुरू करने के लिए एक संदेश भेजें।' : 'Send a message to begin.'}
            </Text>
          </View>
        )}

        {/* Astrologer's opening greeting (server-side text) — the first message of a new chat */}
        {greeting && inputVisible && (
          <View style={[styles.bubble, styles.aiBubble]}>
            <Text style={styles.aiText}>{greeting}</Text>
          </View>
        )}

        {/* Tappable starters — only on an empty chat; disappear once chatting begins */}
        {notStarted && inputVisible && (
          <View style={styles.chipsWrap}>
            {STARTER_CHIPS.map((q) => (
              <Pressable
                key={q}
                style={styles.chip}
                onPress={() => setInput(q)}
                android_ripple={{ color: th.goldDeep }}
              >
                <Text style={styles.chipText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.aiBubble]}>
            <Text style={m.role === 'user' ? styles.userText : styles.aiText}>{m.content}</Text>
          </View>
        ))}

        {sending && (
          <View style={[styles.bubble, styles.aiBubble]}>
            <ActivityIndicator color={th.gold} />
          </View>
        )}

        {/* Paywall — shown when the free minute / pack is exhausted, or on demand */}
        {(showPaywall || (notStarted && freeUsed && !hasBalance)) && (
          <Paywall
            title={ended ? (isHindi ? 'आपका सत्र समाप्त हुआ' : 'Your session ended') : (isHindi ? 'अपनी बातचीत जारी रखें' : 'Continue your reading')}
            subtitle={
              ended
                ? (isHindi ? 'अपने ज्योतिषी से बात जारी रखने के लिए एक पैक चुनें।' : 'Pick a pack to keep chatting with your astrologer.')
                : (isHindi ? 'प्रश्न या समय पैक से और अधिक अनलॉक करें।' : 'Unlock more with a question or time pack.')
            }
            prefill={{ email: user?.email ?? '', name: profile?.name }}
            onPurchased={handlePurchased}
          />
        )}
      </ScrollView>

      {inputVisible && (
        <View style={[styles.inputRow, { paddingBottom: kbVisible ? Spacing.sm : insets.bottom + TAB_BAR_HEIGHT }]}>
          <TextInput
            style={styles.input}
            placeholder={inputLocked ? (isHindi ? 'सत्र समाप्त' : 'Session ended') : (isHindi ? 'अपना सवाल पूछें… (हिंदी या अंग्रेज़ी)' : 'Apna sawaal poochein... (Hindi ya English)')}
            placeholderTextColor={th.textDim}
            value={input}
            onChangeText={setInput}
            editable={!inputLocked}
            multiline
            maxLength={2000}
            onSubmitEditing={handleSend}
          />
          <Pressable
            style={[styles.sendBtn, !canSend && styles.sendBtnIdle]}
            onPress={handleSend}
            disabled={!canSend}
            android_ripple={{ color: th.goldDeep, borderless: true, radius: 24 }}
          >
            <Icon name="send" size={19} color={canSend ? th.goldContrast : th.textMuted} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, backgroundColor: th.canvas, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyIcon: {
    width: 72, height: 72, borderRadius: Radius.pill, marginBottom: Spacing.lg,
    backgroundColor: Accents.sapphire.faint, borderWidth: 1, borderColor: Accents.sapphire.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 14, paddingHorizontal: Spacing.xl,
  },
  btnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: th.border, backgroundColor: th.canvas,
  },
  headerTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.goldLight, letterSpacing: 0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerBtn: { width: 40, height: 32, alignItems: 'flex-end', justifyContent: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: th.surface, borderRadius: Radius.pill, paddingVertical: 5, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: th.borderStrong,
  },
  pillPaused: { backgroundColor: th.goldFaint, borderColor: th.gold },
  pillText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.sm },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.sm },

  introCard: { backgroundColor: th.surface, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: th.border, marginBottom: Spacing.sm },
  introEyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: Accents.sapphire.color, letterSpacing: 2, marginBottom: Spacing.sm },
  introTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, marginBottom: Spacing.sm },
  introText: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 21 },
  introDisclaimer: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, lineHeight: 16, marginTop: Spacing.sm, fontStyle: 'italic' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  chip: {
    backgroundColor: th.surface, borderWidth: 1, borderColor: th.borderStrong,
    borderRadius: Radius.pill, paddingVertical: 9, paddingHorizontal: Spacing.md,
  },
  chipText: { fontFamily: Fonts.body, color: th.goldLight, fontSize: Fonts.size.sm },

  bubble: { maxWidth: '85%', borderRadius: Radius.lg, padding: Spacing.md },
  userBubble: { alignSelf: 'flex-end', backgroundColor: th.goldSurface, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: th.surface, borderWidth: 1, borderColor: th.border, borderBottomLeftRadius: 4 },
  userText: { fontFamily: Fonts.bodyMedium, color: th.goldContrast, fontSize: Fonts.size.md, lineHeight: 21 },
  aiText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, lineHeight: 23 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    borderTopWidth: 1, borderTopColor: th.border, backgroundColor: th.canvas,
  },
  input: {
    flex: 1, maxHeight: 120, borderWidth: 1, borderColor: th.border, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, color: th.text,
    backgroundColor: th.surfaceSunken, fontFamily: Fonts.body, fontSize: Fonts.size.md,
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: th.goldSurface, alignItems: 'center', justifyContent: 'center' },
  sendBtnIdle: { backgroundColor: th.surfaceRaised, borderWidth: 1, borderColor: th.border },
});
