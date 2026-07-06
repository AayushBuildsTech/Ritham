// Paywall — the chat "buy a pack" sheet. Shows a Questions | Time toggle over the
// pack grids from config/pricing.ts, runs the Razorpay purchase flow, and reports
// the fresh entitlement balance back to the chat screen on success.
//
// Prices are display-only here; the server recomputes the real amount (rule #3).

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import {
  SESSION_PLANS, QUESTION_PACKS, paiseTo, formatSeconds,
} from '../config/pricing';
import { purchasePack, Balance } from '../lib/paymentService';
import { Colors, Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { Icon } from './Icon';

// The chat paywall only sells chat packs (never reports).
type PaywallKind = 'questions' | 'time';

interface Props {
  title?: string;
  subtitle?: string;
  prefill?: { contact?: string; email?: string; name?: string };
  onPurchased: (kind: PaywallKind, balance?: Balance) => void;
}

export default function Paywall({ title, subtitle, prefill, onPurchased }: Props) {
  const th = useColors();
  const styles = makeStyles(th);
  const [tab, setTab] = useState<PaywallKind>('questions');
  const [buyingId, setBuyingId] = useState<string | null>(null);

  async function buy(kind: PaywallKind, planId: string) {
    if (buyingId) return;
    setBuyingId(planId);
    const res = await purchasePack(kind, planId, prefill);
    setBuyingId(null);

    if (res.ok) {
      onPurchased(kind, res.balance);
      return;
    }
    if (res.error === 'cancelled') return; // silent — user backed out
    Alert.alert('Payment not completed', friendlyError(res.error));
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>UNLOCK MORE</Text>
      <Text style={styles.title}>{title ?? 'Continue your reading'}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {/* Questions | Time toggle */}
      <View style={styles.toggle}>
        <Pressable
          style={[styles.toggleBtn, tab === 'questions' && styles.toggleActive]}
          onPress={() => setTab('questions')}
        >
          <Text style={[styles.toggleText, tab === 'questions' && styles.toggleTextActive]}>Questions</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, tab === 'time' && styles.toggleActive]}
          onPress={() => setTab('time')}
        >
          <Text style={[styles.toggleText, tab === 'time' && styles.toggleTextActive]}>Time</Text>
        </Pressable>
      </View>

      {tab === 'questions'
        ? QUESTION_PACKS.map((p) => (
            <PackRow
              key={p.id}
              left={`${p.label} · ${p.questions} question${p.questions > 1 ? 's' : ''}`}
              price={paiseTo(p.price_paise)}
              badge={'badge' in p && p.badge === 'most_popular' ? 'Most popular' : undefined}
              note={'first_purchase_only' in p && p.first_purchase_only ? 'First purchase only' : undefined}
              busy={buyingId === p.id}
              disabled={!!buyingId}
              onPress={() => buy('questions', p.id)}
            />
          ))
        : SESSION_PLANS.map((p) => (
            <PackRow
              key={p.id}
              left={`${p.label} · ${formatSeconds(p.seconds)}`}
              price={paiseTo(p.price_paise)}
              busy={buyingId === p.id}
              disabled={!!buyingId}
              onPress={() => buy('time', p.id)}
            />
          ))}

      <View style={styles.secureRow}>
        <Icon name="lock" size={12} color={th.textDim} />
        <Text style={styles.secure}>Secure payment via Razorpay · UPI, cards & wallets</Text>
      </View>
    </View>
  );
}

function PackRow({
  left, price, badge, note, busy, disabled, onPress,
}: {
  left: string; price: string; badge?: string; note?: string;
  busy: boolean; disabled: boolean; onPress: () => void;
}) {
  const th = useColors();
  const styles = makeStyles(th);
  return (
    <Pressable
      style={[styles.row, badge && styles.rowHighlight, disabled && !busy && styles.rowDim]}
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: th.goldFaint }}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowLabel}>{left}</Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      {busy
        ? <ActivityIndicator color={th.gold} />
        : <Text style={styles.price}>{price}</Text>}
    </Pressable>
  );
}

function friendlyError(code?: string): string {
  switch (code) {
    case 'first_purchase_only_used': return 'That intro pack is a one-time offer and has already been used.';
    case 'razorpay_not_configured':  return 'Payments are not set up yet. Please try again later.';
    case 'signature_mismatch':       return 'We could not verify that payment. If money was deducted it will be refunded.';
    case 'payment_failed':           return 'The payment did not go through. Please try again.';
    default:                         return 'Something went wrong. Please try again in a moment.';
  }
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: th.surfaceRaised, borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 1, borderColor: th.borderStrong, gap: Spacing.sm, ...Depth.raised,
  },
  eyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2 },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text },
  subtitle: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 20, marginBottom: Spacing.xs },

  toggle: {
    flexDirection: 'row', backgroundColor: th.surfaceSunken, borderRadius: Radius.sm,
    padding: 4, marginVertical: Spacing.xs, borderWidth: 1, borderColor: th.border,
  },
  toggleBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm - 4, alignItems: 'center' },
  toggleActive: { backgroundColor: th.gold },
  toggleText: { fontFamily: Fonts.bodySemibold, color: th.textMuted, fontSize: Fonts.size.md },
  toggleTextActive: { color: th.goldContrast },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.sm, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border,
  },
  rowHighlight: { borderColor: th.borderStrong },
  rowDim: { opacity: 0.5 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  rowLabel: { fontFamily: Fonts.bodyMedium, color: th.text, fontSize: Fonts.size.md },
  badge: {
    fontFamily: Fonts.bodyBold, color: th.goldContrast, backgroundColor: th.goldLight, fontSize: Fonts.size.xs,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  note: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, marginTop: 2 },
  price: { fontFamily: Fonts.displayBold, color: th.goldLight, fontSize: Fonts.size.xl },

  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: Spacing.xs },
  secure: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center' },
});
