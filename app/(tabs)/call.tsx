// Call tab — "Talk to your Jyotishi". A pre-call screen (active person, value +
// balance, one primary action) plus a full-screen call modal (connecting → live →
// ended) built around the living CallOrb. Same brain as chat, in spoken mode.
//
// Voice needs a development build (the Vapi SDK is native). Without it, startCall
// returns 'voice_unavailable' and we show a friendly "update the app" message.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts, Spacing, Radius, Depth, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useActiveProfile, RELATION_LABEL } from '../../context/ProfileContext';
import { Icon } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { CallOrb } from '../../components/CallOrb';
import Paywall from '../../components/Paywall';
import { getBalance } from '../../lib/paymentService';
import { startCall, callErrorMessage, CallState, CallHandle } from '../../lib/callService';
import { formatSeconds, CHEAPEST_CALL_PER_MIN } from '../../config/pricing';
import { TAB_BAR_HEIGHT } from './_layout';

type Phase = 'precall' | 'call' | 'paywall';

const mmss = (s: number) => {
  const m = Math.floor(Math.max(0, s) / 60);
  const r = Math.max(0, s) % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
};

export default function CallScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { active } = useActiveProfile();

  const [phase, setPhase] = useState<Phase>('precall');
  const [callState, setCallState] = useState<CallState>('idle');
  const [callSeconds, setCallSeconds] = useState(0);
  const [volume, setVolume] = useState(0);
  const [allowance, setAllowance] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [lastLine, setLastLine] = useState('');

  const handleRef = useRef<CallHandle | null>(null);
  const startedRef = useRef(false);
  const usedRef = useRef(0);

  const refreshBalance = useCallback(() => {
    getBalance().then((b) => setCallSeconds(b.callSeconds)).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { refreshBalance(); }, [refreshBalance]));

  // countdown while the call is live; auto-end at zero
  useEffect(() => {
    if (phase !== 'call') return;
    if (callState === 'connecting' || callState === 'ended' || callState === 'error') return;
    if (callState === 'active') startedRef.current = true;
    if (!startedRef.current) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        usedRef.current = allowance - (r - 1);
        if (r <= 1) { handleRef.current?.stop(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, callState, allowance]);

  const hasKundli = !!active?.hasKundli;
  const person = active?.name ?? 'you';
  const relation = active ? (RELATION_LABEL[active.relation] ?? 'Family') : '';

  async function begin() {
    if (!active) return;
    if (!hasKundli) {
      Alert.alert('Kundli needed', 'Please open this person’s Kundli once so it’s ready, then call.',
        [{ text: 'OK' }, { text: 'Open Kundli', onPress: () => router.push('/profile') }]);
      return;
    }
    setMuted(false); setCaptionsOn(false); setLastLine('');
    startedRef.current = false; usedRef.current = 0;
    setPhase('call'); setCallState('connecting');

    const res = await startCall({
      profileId: active.id,
      onState: setCallState,
      onVolume: setVolume,
      onTranscript: (role, text) => { if (role === 'assistant') setLastLine(text); },
      onEnd: () => { setCallState('ended'); refreshBalance(); },
      onError: (m) => { setCallState('error'); if (m) console.warn('call error', m); },
    });

    if (!res.ok) {
      if (res.error === 'needs_purchase') { setPhase('paywall'); return; }
      setPhase('precall');
      Alert.alert('Call', callErrorMessage(res.error));
      return;
    }
    handleRef.current = res.handle ?? null;
    setAllowance(res.allowanceSeconds ?? 60);
    setRemaining(res.allowanceSeconds ?? 60);
  }

  function endCall() { handleRef.current?.stop(); }
  function toggleMute() { const n = !muted; setMuted(n); handleRef.current?.setMuted(n); }
  function closeCall() {
    handleRef.current = null; startedRef.current = false;
    setPhase('precall'); setCallState('idle'); setVolume(0);
    refreshBalance();
  }

  const statusText =
    callState === 'connecting' ? 'Connecting…' :
    callState === 'speaking' ? 'Ritham is speaking…' :
    callState === 'error' ? 'Call interrupted' :
    'Listening…';

  const hasMinutes = callSeconds > 0;
  const primaryLabel = !hasKundli ? 'Finish your Kundli' : hasMinutes ? 'Call now' : 'Start free call';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + Spacing.lg, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.xl, paddingHorizontal: Spacing.lg, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0}>
          <Text style={styles.brand}>RITHAM</Text>
        </Reveal>

        {/* active person chip */}
        <Reveal index={1}>
          <View style={styles.chip}>
            <Icon name="profile" size={15} color={th.gold} />
            <Text style={styles.chipText}>{person}{relation ? ` · ${relation}` : ''}</Text>
          </View>
        </Reveal>

        <Reveal index={2}>
          <View style={styles.orbWrap}><CallOrb state="idle" size={200} /></View>
        </Reveal>

        <Reveal index={3}>
          <Text style={styles.title}>Talk to your Jyotishi</Text>
          <Text style={styles.subtitle}>Ask anything, out loud — in your own language.</Text>
        </Reveal>

        {/* value + balance (pricing surfaced up front) */}
        <Reveal index={4}>
          <View style={styles.valueRow}>
            <View style={styles.dot} />
            <Text style={styles.valueText}>
              {hasMinutes
                ? `You have ${formatSeconds(callSeconds)} of call time`
                : 'Your first 60 seconds are free'}
            </Text>
          </View>
          <Text style={styles.perMin}>Calls from {CHEAPEST_CALL_PER_MIN} · you pay only for what you speak</Text>
        </Reveal>

        <Reveal index={5}>
          <Pressable style={styles.primary} onPress={begin} android_ripple={{ color: th.goldFaint }}>
            <LinearGradient colors={th.gSplash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Icon name="phoneCall" size={19} color={th.goldContrast} />
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setPhase('paywall')}>
            <Text style={styles.secondaryText}>Buy call minutes</Text>
          </Pressable>
        </Reveal>
      </ScrollView>

      {/* ── full-screen call experience ─────────────────────────────────────── */}
      <Modal visible={phase === 'call'} animationType="fade" onRequestClose={endCall} statusBarTranslucent>
        <View style={styles.callRoot}>
          <LinearGradient colors={th.gHero} style={StyleSheet.absoluteFill} />

          {callState === 'ended' || callState === 'error' ? (
            // ── ended summary ──
            <View style={[styles.callBody, { paddingTop: insets.top + Spacing.xxl }]}>
              <Text style={styles.endedTitle}>Call ended</Text>
              <Text style={styles.endedSub}>
                You spoke for {formatSeconds(Math.max(0, Math.round(usedRef.current)))}
              </Text>
              <View style={{ height: Spacing.lg }} />
              <View style={styles.valueRow}>
                <View style={styles.dot} />
                <Text style={styles.valueText}>
                  {callSeconds > 0 ? `${formatSeconds(callSeconds)} of call time left` : 'No call time left'}
                </Text>
              </View>
              <View style={{ height: Spacing.xl }} />
              <Pressable
                style={styles.primary}
                onPress={() => { const buy = callSeconds <= 0; closeCall(); if (buy) setPhase('paywall'); else begin(); }}
              >
                <LinearGradient colors={th.gSplash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Icon name={callSeconds > 0 ? 'phoneCall' : 'diamond'} size={18} color={th.goldContrast} />
                <Text style={styles.primaryText}>{callSeconds > 0 ? 'Call again' : 'Buy minutes'}</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={closeCall}><Text style={styles.secondaryText}>Done</Text></Pressable>
            </View>
          ) : (
            // ── live call ──
            <View style={[styles.callBody, { paddingTop: insets.top + Spacing.lg }]}>
              <View style={styles.liveHeader}>
                <Text style={styles.liveName}>Ritham · Jyotishi</Text>
                <Text style={[styles.timer, remaining <= 30 && { color: th.error }]}>{mmss(remaining)} left</Text>
              </View>

              <View style={styles.liveOrb}>
                <CallOrb state={callState} volume={volume} size={230} />
              </View>

              <Text style={styles.status}>{statusText}</Text>
              {captionsOn && lastLine ? <Text style={styles.caption} numberOfLines={3}>{lastLine}</Text> : null}

              <View style={{ flex: 1 }} />

              <View style={styles.controls}>
                <ControlButton icon={muted ? 'micOff' : 'mic'} label={muted ? 'Unmute' : 'Mute'} onPress={toggleMute} active={muted} th={th} />
                <EndButton onPress={endCall} th={th} />
                <ControlButton icon="message" label="Captions" onPress={() => setCaptionsOn((v) => !v)} active={captionsOn} th={th} />
              </View>
              <View style={{ height: insets.bottom + Spacing.lg }} />
            </View>
          )}
        </View>
      </Modal>

      {/* ── call-pack paywall ───────────────────────────────────────────────── */}
      <Modal visible={phase === 'paywall'} animationType="slide" transparent onRequestClose={() => setPhase('precall')}>
        <Pressable style={styles.backdrop} onPress={() => setPhase('precall')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Paywall
            variant="call"
            prefill={{ name: active?.name }}
            onPurchasedCall={(bal) => {
              if (bal) setCallSeconds(bal.callSeconds); else refreshBalance();
              setPhase('precall');
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function ControlButton({ icon, label, onPress, active, th }: { icon: any; label: string; onPress: () => void; active?: boolean; th: ThemeColors }) {
  const styles = makeStyles(th);
  return (
    <Pressable style={styles.ctrl} onPress={onPress}>
      <View style={[styles.ctrlCircle, active && styles.ctrlActive]}>
        <Icon name={icon} size={22} color={active ? th.goldContrast : th.text} />
      </View>
      <Text style={styles.ctrlLabel}>{label}</Text>
    </Pressable>
  );
}

function EndButton({ onPress, th }: { onPress: () => void; th: ThemeColors }) {
  const styles = makeStyles(th);
  return (
    <Pressable style={styles.ctrl} onPress={onPress}>
      <View style={styles.endCircle}>
        <Icon name="phoneOff" size={24} color="#FFFFFF" />
      </View>
      <Text style={styles.ctrlLabel}>End</Text>
    </Pressable>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },

  brand: { fontFamily: Fonts.bodySemibold, color: th.gold, fontSize: Fonts.size.xs, letterSpacing: 4, textAlign: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center', marginTop: Spacing.md,
    backgroundColor: th.surface, borderColor: th.border, borderWidth: 1,
    borderRadius: Radius.pill, paddingVertical: 6, paddingHorizontal: Spacing.md,
  },
  chipText: { fontFamily: Fonts.bodyMedium, color: th.text, fontSize: Fonts.size.sm },

  orbWrap: { alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, textAlign: 'center', marginTop: Spacing.sm },
  subtitle: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted, textAlign: 'center', marginTop: 6 },

  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: th.success },
  valueText: { fontFamily: Fonts.bodySemibold, color: th.text, fontSize: Fonts.size.md },
  perMin: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: 4 },

  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    overflow: 'hidden', borderRadius: Radius.pill, paddingVertical: 16, paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xl, minWidth: 240, ...Depth.glow,
  },
  primaryText: { fontFamily: Fonts.bodyBold, color: th.goldContrast, fontSize: Fonts.size.lg, letterSpacing: 0.3 },
  secondary: { alignSelf: 'center', paddingVertical: Spacing.md },
  secondaryText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.md },

  // live call
  callRoot: { flex: 1, backgroundColor: th.canvas },
  callBody: { flex: 1, paddingHorizontal: Spacing.lg, alignItems: 'center' },
  liveHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveName: { fontFamily: Fonts.displayMedium, color: th.text, fontSize: Fonts.size.lg },
  timer: { fontFamily: Fonts.bodySemibold, color: th.textMuted, fontSize: Fonts.size.md },
  liveOrb: { marginTop: Spacing.xxl, alignItems: 'center' },
  status: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, marginTop: Spacing.xl },
  caption: {
    fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, textAlign: 'center',
    marginTop: Spacing.md, lineHeight: 22, paddingHorizontal: Spacing.md,
  },

  controls: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: Spacing.xl },
  ctrl: { alignItems: 'center', gap: 8 },
  ctrlCircle: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: th.surface, borderWidth: 1, borderColor: th.border,
  },
  ctrlActive: { backgroundColor: th.goldSurface, borderColor: th.goldSurface },
  ctrlLabel: { fontFamily: Fonts.bodyMedium, color: th.textMuted, fontSize: Fonts.size.xs },
  endCircle: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: th.error, ...Depth.card,
  },

  // ended
  endedTitle: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.xxl, textAlign: 'center' },
  endedSub: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, textAlign: 'center', marginTop: 6 },

  // paywall sheet
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: th.scrimBackdrop },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: th.canvas, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
  },
});
