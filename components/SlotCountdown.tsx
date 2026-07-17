import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Fonts, Spacing, Radius, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from './Icon';
import { NEXT_SLOT, getSlotStatus, fmtCountdown, SlotStatus, L } from '../config/pujas';

// Re-computes the slot status every second so the countdown ticks live.
export function useSlotTick(): SlotStatus {
  const [status, setStatus] = useState<SlotStatus>(() => getSlotStatus());
  useEffect(() => {
    const id = setInterval(() => setStatus(getSlotStatus()), 1000);
    return () => clearInterval(id);
  }, []);
  return status;
}

// Full card: "Next Puja · <date>" + a live "Bookings close in [d][h][m][s]" pill
// row, or a closed notice once the cutoff passes. `compact` renders a single
// muted line (for the listing card).
export function SlotCountdown({ compact, style }: { compact?: boolean; style?: ViewStyle | ViewStyle[] }) {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const status = useSlotTick();
  const tr = (l: L) => (isHindi ? l.hi : l.en);
  const dateLabel = tr(NEXT_SLOT.label);

  if (compact) {
    return (
      <View style={[styles.compactRow, style]}>
        <Icon name="calendar" size={13} color={status.open ? th.gold : th.textDim} />
        <Text style={styles.compactText} numberOfLines={1}>
          {status.open
            ? `${isHindi ? 'अगली पूजा' : 'Next puja'}: ${dateLabel}`
            : (isHindi ? 'बुकिंग बंद — नया स्लॉट जल्द' : 'Bookings closed — next slot soon')}
        </Text>
      </View>
    );
  }

  if (!status.open) {
    return (
      <View style={[styles.closedCard, style]}>
        <Icon name="clock" size={16} color={th.textMuted} />
        <Text style={styles.closedText}>
          {isHindi
            ? 'इस स्लॉट की बुकिंग बंद है — नया स्लॉट जल्द खुलेगा।'
            : 'Bookings for this slot are closed — next slot opening soon.'}
        </Text>
      </View>
    );
  }

  const { d, h, m, s } = fmtCountdown(status.msToClose);
  const cells: { v: number; u: string }[] = [
    { v: d, u: isHindi ? 'दिन' : 'DAYS' },
    { v: h, u: isHindi ? 'घंटे' : 'HRS' },
    { v: m, u: isHindi ? 'मिनट' : 'MIN' },
    { v: s, u: isHindi ? 'सेकंड' : 'SEC' },
  ];

  return (
    <View style={[styles.card, style]}>
      <View style={styles.dateRow}>
        <Icon name="calendar" size={15} color={th.gold} />
        <Text style={styles.dateLabel}>{isHindi ? 'अगली पूजा' : 'Next Puja'}</Text>
        <Text style={styles.dateVal}>{dateLabel}</Text>
      </View>
      <Text style={styles.closeLabel}>{isHindi ? 'बुकिंग बंद होने में' : 'Bookings close in'}</Text>
      <View style={styles.pills}>
        {cells.map((c, i) => (
          <View key={i} style={styles.pill}>
            <Text style={styles.pillNum}>{String(c.v).padStart(2, '0')}</Text>
            <Text style={styles.pillUnit}>{c.u}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.md, alignItems: 'center',
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  dateLabel: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  dateVal: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.text },
  closeLabel: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, marginTop: Spacing.sm, marginBottom: 6, letterSpacing: 0.5 },
  pills: { flexDirection: 'row', gap: Spacing.sm },
  pill: {
    minWidth: 54, backgroundColor: th.surfaceSunken, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center',
  },
  pillNum: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.goldLight },
  pillUnit: { fontFamily: Fonts.bodySemibold, fontSize: 9, color: th.textDim, letterSpacing: 1, marginTop: 1 },

  closedCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: th.surfaceSunken, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    padding: Spacing.md,
  },
  closedText: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 19 },

  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  compactText: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.xs, color: th.textMuted },
});
