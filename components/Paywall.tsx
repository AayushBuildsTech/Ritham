// Paywall — the chat "buy a pack" sheet. Shows a Questions | Time toggle over the
// pack grids from config/pricing.ts, runs the Razorpay purchase flow, and reports
// the fresh entitlement balance back to the chat screen on success.
//
// Prices are display-only here; the server recomputes the real amount (rule #3).

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import {
  SESSION_PLANS, QUESTION_PACKS, CALL_PACKS, paiseTo, formatSeconds,
  paisePerMinute, CHEAPEST_CALL_PER_MIN,
} from '../config/pricing';
import { purchasePack, Balance, PackKind } from '../lib/paymentService';
import { Colors, Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from './Icon';

// The chat paywall sells chat packs (Questions | Time); the 'call' variant sells
// voice-call minute packs. One component, two variants — see `variant` prop.
type PaywallKind = 'questions' | 'time';

interface Props {
  title?: string;
  subtitle?: string;
  prefill?: { contact?: string; email?: string; name?: string };
  variant?: 'chat' | 'call';                                     // default 'chat'
  onPurchased?: (kind: PaywallKind, balance?: Balance) => void;  // chat variant
  onPurchasedCall?: (balance?: Balance) => void;                 // call variant
}

export default function Paywall({ title, subtitle, prefill, variant = 'chat', onPurchased, onPurchasedCall }: Props) {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const [tab, setTab] = useState<PaywallKind>('questions');
  const [buyingId, setBuyingId] = useState<string | null>(null);

  // Localised duration ("5 min" → "5 मिनट"); packs are whole-minute so this is safe.
  const dur = (s: number) => (isHindi ? formatSeconds(s).replace('min', 'मिनट') : formatSeconds(s));
  const qLabel = (n: number) => (isHindi ? `${n} प्रश्न` : `${n} question${n > 1 ? 's' : ''}`);

  async function buy(kind: PackKind, planId: string) {
    if (buyingId) return;
    setBuyingId(planId);
    const res = await purchasePack(kind, planId, prefill);
    setBuyingId(null);

    if (res.ok) {
      if (kind === 'call') onPurchasedCall?.(res.balance);
      else onPurchased?.(kind as PaywallKind, res.balance);
      return;
    }
    if (res.error === 'cancelled') return; // silent — user backed out
    Alert.alert(isHindi ? 'भुगतान पूरा नहीं हुआ' : 'Payment not completed', friendlyError(res.error, isHindi));
  }

  // ── call variant: voice-call minute packs, per-minute value up front ──────────
  if (variant === 'call') {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{isHindi ? 'अपने ज्योतिषी से बात करें' : 'TALK TO YOUR JYOTISHI'}</Text>
        <Text style={styles.title}>{title ?? (isHindi ? 'कॉल मिनट खरीदें' : 'Buy call minutes')}</Text>
        <Text style={styles.subtitle}>
          {subtitle ?? (isHindi
            ? `${CHEAPEST_CALL_PER_MIN} से · आप केवल बात किए गए मिनटों का भुगतान करते हैं।`
            : `From ${CHEAPEST_CALL_PER_MIN} · you only pay for the minutes you speak.`)}
        </Text>
        {CALL_PACKS.map((p) => (
          <PackRow
            key={p.id}
            left={`${p.label} · ${dur(p.seconds)}`}
            price={paiseTo(p.price_paise)}
            badge={'badge' in p && p.badge === 'most_popular' ? (isHindi ? 'सबसे लोकप्रिय' : 'Most popular') : undefined}
            note={`${paiseTo(paisePerMinute(p.price_paise, p.seconds))}/${isHindi ? 'मिनट' : 'min'}`}
            busy={buyingId === p.id}
            disabled={!!buyingId}
            onPress={() => buy('call', p.id)}
          />
        ))}
        <View style={styles.secureRow}>
          <Icon name="lock" size={12} color={th.textDim} />
          <Text style={styles.secure}>{isHindi ? 'Razorpay से सुरक्षित भुगतान · UPI, कार्ड और वॉलेट' : 'Secure payment via Razorpay · UPI, cards & wallets'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{isHindi ? 'और अधिक अनलॉक करें' : 'UNLOCK MORE'}</Text>
      <Text style={styles.title}>{title ?? (isHindi ? 'अपनी बातचीत जारी रखें' : 'Continue your reading')}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {/* Questions | Time toggle */}
      <View style={styles.toggle}>
        <Pressable
          style={[styles.toggleBtn, tab === 'questions' && styles.toggleActive]}
          onPress={() => setTab('questions')}
        >
          <Text style={[styles.toggleText, tab === 'questions' && styles.toggleTextActive]}>{isHindi ? 'प्रश्न' : 'Questions'}</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, tab === 'time' && styles.toggleActive]}
          onPress={() => setTab('time')}
        >
          <Text style={[styles.toggleText, tab === 'time' && styles.toggleTextActive]}>{isHindi ? 'समय' : 'Time'}</Text>
        </Pressable>
      </View>

      {tab === 'questions'
        ? QUESTION_PACKS.map((p) => (
            <PackRow
              key={p.id}
              left={`${p.label} · ${qLabel(p.questions)}`}
              price={paiseTo(p.price_paise)}
              badge={'badge' in p && p.badge === 'most_popular' ? (isHindi ? 'सबसे लोकप्रिय' : 'Most popular') : undefined}
              note={'first_purchase_only' in p && p.first_purchase_only ? (isHindi ? 'केवल पहली खरीद' : 'First purchase only') : undefined}
              busy={buyingId === p.id}
              disabled={!!buyingId}
              onPress={() => buy('questions', p.id)}
            />
          ))
        : SESSION_PLANS.map((p) => (
            <PackRow
              key={p.id}
              left={`${p.label} · ${dur(p.seconds)}`}
              price={paiseTo(p.price_paise)}
              busy={buyingId === p.id}
              disabled={!!buyingId}
              onPress={() => buy('time', p.id)}
            />
          ))}

      <View style={styles.secureRow}>
        <Icon name="lock" size={12} color={th.textDim} />
        <Text style={styles.secure}>{isHindi ? 'Razorpay से सुरक्षित भुगतान · UPI, कार्ड और वॉलेट' : 'Secure payment via Razorpay · UPI, cards & wallets'}</Text>
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
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      accessibilityLabel={`${left}, ${price}${note ? `, ${note}` : ''}`}
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

function friendlyError(code?: string, isHindi = false): string {
  if (isHindi) {
    switch (code) {
      case 'first_purchase_only_used': return 'वह इंट्रो पैक एक-बार का ऑफ़र है और पहले ही उपयोग हो चुका है।';
      case 'razorpay_not_configured':  return 'भुगतान अभी सेट नहीं है। कृपया बाद में फिर कोशिश करें।';
      case 'signature_mismatch':       return 'हम उस भुगतान की पुष्टि नहीं कर सके। यदि राशि कटी है तो वह वापस कर दी जाएगी।';
      case 'payment_failed':           return 'भुगतान पूरा नहीं हुआ। कृपया फिर कोशिश करें।';
      default:                         return 'कुछ गड़बड़ हो गई। कृपया थोड़ी देर में फिर कोशिश करें।';
    }
  }
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
  toggleActive: { backgroundColor: th.goldSurface },
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
    fontFamily: Fonts.bodyBold, color: th.goldContrast, backgroundColor: th.goldSurface, fontSize: Fonts.size.xs,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  note: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, marginTop: 2 },
  price: { fontFamily: Fonts.displayBold, color: th.goldLight, fontSize: Fonts.size.xl },

  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: Spacing.xs },
  secure: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center' },
});
