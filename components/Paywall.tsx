// Paywall — the chat "buy a pack" sheet. Shows a Questions | Time toggle over the
// pack grids from config/pricing.ts, runs the Razorpay purchase flow, and reports
// the fresh entitlement balance back to the chat screen on success.
//
// Prices are display-only here; the server recomputes the real amount (rule #3).

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import {
  SESSION_PLANS, QUESTION_PACKS, paiseTo, formatSeconds,
} from '../config/pricing';
import { purchasePack, Balance } from '../lib/paymentService';
import { Colors, Fonts, Spacing } from '../constants/theme';

// The chat paywall only sells chat packs (never reports).
type PaywallKind = 'questions' | 'time';

interface Props {
  title?: string;
  subtitle?: string;
  prefill?: { contact?: string; email?: string; name?: string };
  onPurchased: (kind: PaywallKind, balance?: Balance) => void;
}

export default function Paywall({ title, subtitle, prefill, onPurchased }: Props) {
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
      <Text style={styles.title}>{title ?? 'Continue your reading'}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {/* Questions | Time toggle */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, tab === 'questions' && styles.toggleActive]}
          onPress={() => setTab('questions')}
        >
          <Text style={[styles.toggleText, tab === 'questions' && styles.toggleTextActive]}>Questions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, tab === 'time' && styles.toggleActive]}
          onPress={() => setTab('time')}
        >
          <Text style={[styles.toggleText, tab === 'time' && styles.toggleTextActive]}>Time</Text>
        </TouchableOpacity>
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

      <Text style={styles.secure}>🔒 Secure payment via Razorpay · UPI, cards & wallets</Text>
    </View>
  );
}

function PackRow({
  left, price, badge, note, busy, disabled, onPress,
}: {
  left: string; price: string; badge?: string; note?: string;
  busy: boolean; disabled: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, badge && styles.rowHighlight, disabled && !busy && styles.rowDim]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowLabel}>{left}</Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      {busy
        ? <ActivityIndicator color={Colors.gold} />
        : <Text style={styles.price}>{price}</Text>}
    </TouchableOpacity>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard, borderRadius: 16, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm,
  },
  title: { fontSize: Fonts.size.lg, color: Colors.goldLight, fontWeight: '700' },
  subtitle: { fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 20, marginBottom: Spacing.xs },

  toggle: {
    flexDirection: 'row', backgroundColor: Colors.bgMid, borderRadius: 12,
    padding: 4, marginVertical: Spacing.xs,
  },
  toggleBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: 9, alignItems: 'center' },
  toggleActive: { backgroundColor: Colors.gold },
  toggleText: { color: Colors.textMuted, fontSize: Fonts.size.md, fontWeight: '700' },
  toggleTextActive: { color: Colors.bg },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgMid, borderRadius: 12, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  rowHighlight: { borderColor: Colors.gold },
  rowDim: { opacity: 0.5 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  rowLabel: { color: Colors.text, fontSize: Fonts.size.md, fontWeight: '600' },
  badge: {
    color: Colors.bg, backgroundColor: Colors.goldLight, fontSize: Fonts.size.xs, fontWeight: '700',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  note: { color: Colors.textDim, fontSize: Fonts.size.xs, marginTop: 2 },
  price: { color: Colors.goldLight, fontSize: Fonts.size.lg, fontWeight: '700' },

  secure: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.xs },
});
