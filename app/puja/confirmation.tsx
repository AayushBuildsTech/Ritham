import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { SacredDivider } from '../../components/SacredDivider';
import { paiseTo } from '../../config/pujas';

export default function PujaConfirmationScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { amount, tier } = useLocalSearchParams<{ amount: string; tier: string }>();

  const steps = isHindi
    ? [
        'हमें आपकी बुकिंग मिल गई है और यह हमारे रामेश्वरम् पुजारियों को भेज दी गई है।',
        'पूजा तिथि पर अग्नि तीर्थम् पर आपके नाम और गोत्र में कर्म संपन्न होगा।',
        'पूजा के हर चरण पर व्हाट्सएप पर लाइव अपडेट मिलेंगे।',
        'पूरा पूजा वीडियो 3–5 दिनों में व्हाट्सएप पर साझा किया जाएगा।',
      ]
    : [
        'We’ve received your booking and shared it with our Rameswaram priests.',
        'On the puja date, the rites are performed in your name & gotra at Agni Theertham.',
        'You get live WhatsApp updates at every step of the puja.',
        'Your full puja video is shared on WhatsApp within 3–5 days.',
      ];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0}>
          <View style={styles.badgeRing}>
            <LinearGradient colors={Accents.gold.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
              <Icon name="check" size={38} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <Text style={styles.title}>{isHindi ? 'बुकिंग पुष्ट हुई' : 'Booking Confirmed'}</Text>
          <SacredDivider style={{ marginVertical: Spacing.md, paddingHorizontal: Spacing.xl }} />
          <Text style={styles.subtitle}>
            {isHindi
              ? 'आपकी पूजा बुक हो गई है। आपके पितरों को शांति मिले। 🙏'
              : 'Your puja is booked. May your ancestors find peace. 🙏'}
          </Text>
        </Reveal>

        {(amount || tier) ? (
          <Reveal index={1}>
            <View style={styles.receipt}>
              {tier ? (
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>{isHindi ? 'पैकेज' : 'Package'}</Text>
                  <Text style={styles.receiptVal}>{tier}</Text>
                </View>
              ) : null}
              {amount ? (
                <View style={[styles.receiptRow, styles.receiptTotal]}>
                  <Text style={styles.receiptLabel}>{isHindi ? 'भुगतान' : 'Amount Paid'}</Text>
                  <Text style={styles.receiptAmount}>{paiseTo(Number(amount))}</Text>
                </View>
              ) : null}
            </View>
          </Reveal>
        ) : null}

        <Reveal index={2}>
          <SacredDivider label={isHindi ? 'आगे क्या होगा' : 'What Happens Next'} style={{ marginBottom: Spacing.lg }} />
          <View style={styles.timeline}>
            {steps.map((s, i) => (
              <View key={i} style={styles.tlRow}>
                <View style={styles.tlRail}>
                  <View style={styles.tlNode}><Text style={styles.tlNum}>{i + 1}</Text></View>
                  {i < steps.length - 1 ? <View style={styles.tlLine} /> : null}
                </View>
                <Text style={styles.tlText}>{s}</Text>
              </View>
            ))}
          </View>
        </Reveal>

        <Reveal index={3}>
          <Pressable style={styles.primaryWrap} onPress={() => router.replace('/puja/my-bookings' as any)} android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
            <LinearGradient colors={Accents.gold.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{isHindi ? 'मेरी बुकिंग देखें' : 'View My Bookings'}</Text>
            </LinearGradient>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/(tabs)' as any)}>
            <Text style={styles.secondaryBtnText}>{isHindi ? 'होम पर लौटें' : 'Back to Home'}</Text>
          </Pressable>
        </Reveal>
      </ScrollView>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { paddingHorizontal: Spacing.lg },
  badgeRing: {
    width: 96, height: 96, borderRadius: 48, alignSelf: 'center', marginBottom: Spacing.lg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: th.borderStrong, backgroundColor: th.goldFaint, ...Depth.glow,
  },
  badge: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, textAlign: 'center' },
  subtitle: {
    fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted, textAlign: 'center',
    lineHeight: 24, marginBottom: Spacing.xl, paddingHorizontal: Spacing.md,
  },
  receipt: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.md, marginBottom: Spacing.xl, ...Depth.card,
  },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  receiptTotal: { borderTopWidth: 1, borderTopColor: th.divider, marginTop: 2 },
  receiptLabel: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted },
  receiptVal: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.text },
  receiptAmount: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.goldLight },

  timeline: { marginBottom: Spacing.xl },
  tlRow: { flexDirection: 'row', gap: Spacing.md },
  tlRail: { alignItems: 'center', width: 28 },
  tlNode: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: th.goldFaint,
    borderWidth: 1, borderColor: th.borderStrong, alignItems: 'center', justifyContent: 'center',
  },
  tlNum: { fontFamily: Fonts.bodyBold, fontSize: 13, color: th.gold },
  tlLine: { width: 2, flex: 1, backgroundColor: th.border, marginVertical: 2 },
  tlText: { flex: 1, fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 21, paddingBottom: Spacing.lg, paddingTop: 4 },

  primaryWrap: { borderRadius: Radius.pill, overflow: 'hidden', marginBottom: Spacing.sm, ...Depth.glow },
  primaryBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
  primaryBtnText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: '#FFFFFF' },
  secondaryBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
  secondaryBtnText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.textMuted },
});
