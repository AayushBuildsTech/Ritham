import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { ScreenHeader } from '../../components/ScreenHeader';
import { supabase } from '../../lib/supabase';
import { getPuja, getTier, L, paiseTo } from '../../config/pujas';

interface Booking {
  id: string;
  puja_id: string;
  tier_id: string;
  amount_paise: number;
  status: string;
  created_at: string;
  devotee_names: string[] | null;
}

const STATUS_META: Record<string, { en: string; hi: string; accent: keyof typeof Accents }> = {
  pending_payment: { en: 'Pending Payment', hi: 'भुगतान लंबित', accent: 'amber' },
  paid:            { en: 'Confirmed', hi: 'पुष्ट', accent: 'emerald' },
  in_progress:     { en: 'In Progress', hi: 'प्रगति में', accent: 'sapphire' },
  completed:       { en: 'Completed', hi: 'पूर्ण', accent: 'emerald' },
  cancelled:       { en: 'Cancelled', hi: 'रद्द', accent: 'ruby' },
  refunded:        { en: 'Refunded', hi: 'रिफंड', accent: 'ruby' },
};

export default function MyBookingsScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tr = (l: L) => (isHindi ? l.hi : l.en);

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('puja_bookings')
      .select('id, puja_id, tier_id, amount_paise, status, created_at, devotee_names')
      .order('created_at', { ascending: false });
    setBookings((data as Booking[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'मेरी पूजा' : 'My Pujas'} onBack={() => router.back()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} /></View>
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{isHindi ? 'अभी कोई बुकिंग नहीं' : 'No bookings yet'}</Text>
          <Pressable style={styles.browseBtn} onPress={() => router.replace('/puja' as any)}>
            <Text style={styles.browseBtnText}>{isHindi ? 'पूजा देखें' : 'Browse Pujas'}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          {bookings.map((b, i) => {
            const puja = getPuja(b.puja_id);
            const tier = getTier(b.tier_id);
            const meta = STATUS_META[b.status] ?? STATUS_META.paid;
            const accent = Accents[meta.accent];
            return (
              <Reveal key={b.id} index={i}>
                <View style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>{puja ? tr(puja.title) : b.puja_id}</Text>
                    <View style={[styles.statusChip, { backgroundColor: accent.faint }]}>
                      <Text style={[styles.statusText, { color: accent.color }]}>
                        {isHindi ? meta.hi : meta.en}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>
                    {tier ? tr(tier.label) : b.tier_id}
                    {b.devotee_names?.length ? ` · ${b.devotee_names.join(', ')}` : ''}
                  </Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardDate}>{new Date(b.created_at).toLocaleDateString()}</Text>
                    <Text style={styles.cardAmount}>{paiseTo(b.amount_paise)}</Text>
                  </View>
                </View>
              </Reveal>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  emptyTitle: { fontFamily: Fonts.display, fontSize: Fonts.size.lg, color: th.textMuted, marginBottom: Spacing.lg },
  browseBtn: { backgroundColor: th.goldSurface, borderRadius: Radius.pill, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl },
  browseBtnText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: th.goldContrast },
  card: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    padding: Spacing.md, marginBottom: Spacing.md, ...Depth.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { flex: 1, fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.text },
  statusChip: { borderRadius: Radius.pill, paddingVertical: 3, paddingHorizontal: Spacing.sm },
  statusText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs },
  cardMeta: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: 4 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  cardDate: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim },
  cardAmount: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.goldLight },
});
