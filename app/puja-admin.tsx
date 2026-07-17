import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { isOwner } from '../config/owner';
import { getTier, getAddOn, paiseTo } from '../config/pujas';
import {
  fetchPujaSlot, formatSlotLabel, adminListBookings, adminUpdateStatus, adminSetSlot, AdminBooking,
} from '../lib/pujaSlot';

const FILTERS = ['paid', 'in_progress', 'completed', 'all'] as const;
type Filter = typeof FILTERS[number];
const NEXT_STATUS: { label: string; value: string; accent: keyof typeof Accents }[] = [
  { label: 'In Progress', value: 'in_progress', accent: 'sapphire' },
  { label: 'Completed', value: 'completed', accent: 'emerald' },
  { label: 'Refunded', value: 'refunded', accent: 'ruby' },
];

export default function PujaAdminScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const owner = isOwner(user?.email);

  const [slotLabel, setSlotLabel] = useState('');
  const [pujaDate, setPujaDate] = useState('');   // YYYY-MM-DD
  const [cutoff, setCutoff] = useState('3');
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotMsg, setSlotMsg] = useState('');

  const [filter, setFilter] = useState<Filter>('paid');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');

  const loadSlot = useCallback(async () => {
    const s = await fetchPujaSlot(true);
    setSlotLabel(formatSlotLabel(s.pujaDateISO, false));
    setPujaDate(s.pujaDateISO.slice(0, 10));
  }, []);

  const loadBookings = useCallback(async (f: Filter) => {
    setLoading(true); setListErr('');
    const res = await adminListBookings(f === 'all' ? undefined : f);
    if (!res.ok) setListErr(res.error ?? 'Failed to load');
    setBookings(res.bookings ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (owner) { loadSlot(); loadBookings(filter); } }, [owner]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSaveSlot = async () => {
    setSlotMsg('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pujaDate)) { setSlotMsg('Enter the puja date as YYYY-MM-DD.'); return; }
    const c = parseInt(cutoff, 10);
    if (Number.isNaN(c) || c < 0 || c > 30) { setSlotMsg('Cutoff days must be 0–30.'); return; }
    setSavingSlot(true);
    const res = await adminSetSlot(pujaDate, c);
    setSavingSlot(false);
    if (!res.ok) { setSlotMsg(res.error ?? 'Could not save.'); return; }
    setSlotMsg('Slot updated.');
    loadSlot();
  };

  const setStatus = async (id: string, status: string) => {
    const res = await adminUpdateStatus(id, status);
    if (res.ok) setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
  };

  if (!owner) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Puja Admin" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.notAuth}>You don’t have access to this screen.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Puja Admin"
        onBack={() => router.back()}
        right={<Pressable onPress={() => loadBookings(filter)} hitSlop={10}><Icon name="history" size={20} color={th.gold} /></Pressable>}
      />
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl }}
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        {/* ── Slot editor ─────────────────────────────────────────────── */}
        <Text style={styles.eyebrow}>NEXT SLOT</Text>
        <View style={styles.card}>
          <Text style={styles.slotCurrent}>{slotLabel || '—'}</Text>
          <View style={styles.rowFields}>
            <View style={styles.flex1}>
              <Text style={styles.label}>Puja date</Text>
              <TextInput style={styles.input} value={pujaDate} onChangeText={setPujaDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={th.textDim} autoCapitalize="none" />
            </View>
            <View style={styles.cutoffField}>
              <Text style={styles.label}>Close (days before)</Text>
              <TextInput style={styles.input} value={cutoff} onChangeText={(t) => setCutoff(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad" placeholder="3" placeholderTextColor={th.textDim} />
            </View>
          </View>
          <Pressable style={[styles.saveBtn, savingSlot && styles.btnDisabled]} onPress={onSaveSlot} disabled={savingSlot}>
            {savingSlot ? <ActivityIndicator color={th.goldContrast} /> : <Text style={styles.saveBtnText}>Save slot</Text>}
          </Pressable>
          {slotMsg ? <Text style={styles.slotMsg}>{slotMsg}</Text> : null}
        </View>

        {/* ── Bookings ────────────────────────────────────────────────── */}
        <View style={styles.bookingsHead}>
          <Text style={styles.eyebrow}>BOOKINGS</Text>
          <Text style={styles.count}>{bookings.length}</Text>
        </View>
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable key={f} style={[styles.filterChip, filter === f && styles.filterChipOn]}
              onPress={() => { setFilter(f); loadBookings(f); }}>
              <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>
                {f === 'in_progress' ? 'In Progress' : f[0].toUpperCase() + f.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={th.gold} /></View>
        ) : listErr ? (
          <Text style={styles.err}>{listErr}</Text>
        ) : bookings.length === 0 ? (
          <Text style={styles.empty}>No bookings.</Text>
        ) : (
          bookings.map((b) => (
            <View key={b.id} style={styles.booking}>
              <View style={styles.bkHead}>
                <Text style={styles.bkTitle}>{getTier(b.tier_id)?.label.en ?? b.tier_id}</Text>
                <Text style={styles.bkAmount}>{paiseTo(b.amount_paise)}</Text>
              </View>
              <Text style={styles.bkStatus}>{b.status} · {new Date(b.created_at).toLocaleDateString()} · slot {b.preferred_date ?? '—'}</Text>
              <Text style={styles.bkLine}><Text style={styles.bkKey}>Devotees: </Text>{(b.devotee_names ?? []).join(', ') || '—'}</Text>
              <Text style={styles.bkLine}><Text style={styles.bkKey}>Gotra: </Text>{(b.gotras?.length ? b.gotras.join(', ') : b.gotra) || '—'}</Text>
              <Text style={styles.bkLine}><Text style={styles.bkKey}>WhatsApp: </Text>{b.contact_phone ?? '—'}</Text>
              {b.add_on_ids?.length ? (
                <Text style={styles.bkLine}><Text style={styles.bkKey}>Add-ons: </Text>{b.add_on_ids.map((id) => getAddOn(id)?.name.en ?? id).join(', ')}</Text>
              ) : null}
              {b.dakshina_paise > 0 ? <Text style={styles.bkLine}><Text style={styles.bkKey}>Dakshina: </Text>{paiseTo(b.dakshina_paise)}</Text> : null}
              {b.puja_wish ? <Text style={styles.bkLine}><Text style={styles.bkKey}>Wish: </Text>{b.puja_wish}</Text> : null}
              <View style={styles.actions}>
                {NEXT_STATUS.filter((s) => s.value !== b.status).map((s) => (
                  <Pressable key={s.value} style={[styles.actBtn, { borderColor: Accents[s.accent].color }]} onPress={() => setStatus(b.id, s.value)}>
                    <Text style={[styles.actText, { color: Accents[s.accent].color }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  scroll: { flex: 1 },
  flex1: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  notAuth: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted },

  eyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2, marginBottom: Spacing.sm },
  card: { backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.border, padding: Spacing.md, marginBottom: Spacing.xl, ...Depth.card },
  slotCurrent: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.lg, color: th.goldLight, marginBottom: Spacing.md },
  rowFields: { flexDirection: 'row', gap: Spacing.md },
  cutoffField: { width: 130 },
  label: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm, padding: Spacing.md, minHeight: 48,
    color: th.text, backgroundColor: th.surfaceSunken, fontFamily: Fonts.body, fontSize: Fonts.size.md,
  },
  saveBtn: { backgroundColor: th.goldSurface, borderRadius: Radius.pill, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md },
  btnDisabled: { opacity: 0.7 },
  saveBtnText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: th.goldContrast },
  slotMsg: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: Spacing.sm, textAlign: 'center' },

  bookingsHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  count: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.textDim },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  filterChip: { borderWidth: 1, borderColor: th.border, borderRadius: Radius.pill, paddingVertical: 6, paddingHorizontal: Spacing.md, backgroundColor: th.surface },
  filterChipOn: { backgroundColor: th.goldSurface, borderColor: th.goldSurface },
  filterText: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.xs, color: th.textMuted },
  filterTextOn: { color: th.goldContrast, fontFamily: Fonts.bodySemibold },
  err: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.error, textAlign: 'center', padding: Spacing.lg },
  empty: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textDim, textAlign: 'center', padding: Spacing.xl },

  booking: { backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border, padding: Spacing.md, marginBottom: Spacing.md },
  bkHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bkTitle: { flex: 1, fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.text },
  bkAmount: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.goldLight },
  bkStatus: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.xs, color: th.textDim, marginTop: 2, marginBottom: Spacing.sm, textTransform: 'capitalize' },
  bkLine: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 21 },
  bkKey: { fontFamily: Fonts.bodySemibold, color: th.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  actBtn: { borderWidth: 1, borderRadius: Radius.pill, paddingVertical: 6, paddingHorizontal: Spacing.md },
  actText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs },
});
