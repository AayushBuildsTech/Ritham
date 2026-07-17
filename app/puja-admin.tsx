import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Modal, Linking,
} from 'react-native';
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
  fetchPujaSlot, formatSlotLabel, adminListBookings, adminUpdateStatus, adminDeleteBooking, adminSetSlot, AdminBooking,
} from '../lib/pujaSlot';

const FILTERS = ['paid', 'in_progress', 'completed', 'all'] as const;
type Filter = typeof FILTERS[number];
const NEXT_STATUS: { label: string; value: string; accent: keyof typeof Accents }[] = [
  { label: 'In Progress', value: 'in_progress', accent: 'sapphire' },
  { label: 'Completed', value: 'completed', accent: 'emerald' },
  { label: 'Refunded', value: 'refunded', accent: 'ruby' },
];
const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid', in_progress: 'In Progress', completed: 'Completed', refunded: 'Refunded', cancelled: 'Cancelled', pending_payment: 'Pending',
};

interface Confirm { title: string; message: string; confirmLabel: string; destructive?: boolean; run: () => Promise<void> }

export default function PujaAdminScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const owner = isOwner(user?.email);

  const [slotLabel, setSlotLabel] = useState('');
  const [pujaDate, setPujaDate] = useState('');
  const [cutoff, setCutoff] = useState('3');
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotMsg, setSlotMsg] = useState('');

  const [filter, setFilter] = useState<Filter>('paid');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };

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
    setSlotMsg('Slot updated ✓');
    loadSlot();
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setWorking(true);
    await confirm.run();
    setWorking(false);
    setConfirm(null);
  };

  const askStatus = (b: AdminBooking, s: { label: string; value: string }) =>
    setConfirm({
      title: `Mark as ${s.label}?`,
      message: `${who(b)} — ${getTier(b.tier_id)?.label.en ?? b.tier_id}`,
      confirmLabel: `Mark ${s.label}`,
      run: async () => {
        const r = await adminUpdateStatus(b.id, s.value);
        if (r.ok) { setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: s.value } : x))); flash(`Marked ${s.label}`); }
        else flash(r.error ?? 'Failed');
      },
    });

  const askDelete = (b: AdminBooking) =>
    setConfirm({
      title: 'Delete this booking?',
      message: `${who(b)} — ${paiseTo(b.amount_paise)}. This permanently removes the booking and can’t be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      run: async () => {
        const r = await adminDeleteBooking(b.id);
        if (r.ok) { setBookings((prev) => prev.filter((x) => x.id !== b.id)); flash('Booking deleted'); }
        else flash(r.error ?? 'Failed');
      },
    });

  const openWhatsApp = (phone?: string | null) => {
    if (!phone) return;
    const digits = phone.replace(/\D/g, '');
    const full = digits.length === 10 ? `91${digits}` : digits;
    Linking.openURL(`https://wa.me/${full}`).catch(() => flash('Could not open WhatsApp'));
  };

  if (!owner) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Puja Admin" onBack={() => router.back()} />
        <View style={styles.center}><Text style={styles.notAuth}>You don’t have access to this screen.</Text></View>
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
                <View style={styles.bkHeadRight}>
                  <Text style={styles.bkAmount}>{paiseTo(b.amount_paise)}</Text>
                  <Pressable onPress={() => askDelete(b)} hitSlop={8} style={styles.trashBtn} android_ripple={{ color: Accents.ruby.faint, borderless: true }}>
                    <Icon name="trash" size={17} color={th.textDim} />
                  </Pressable>
                </View>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusAccent(b.status).faint }]}>
                <Text style={[styles.statusPillText, { color: statusAccent(b.status).color }]}>{STATUS_LABEL[b.status] ?? b.status}</Text>
                <Text style={styles.bkDate}>· {new Date(b.created_at).toLocaleDateString()} · slot {b.preferred_date ?? '—'}</Text>
              </View>

              <Text style={styles.bkLine}><Text style={styles.bkKey}>Devotees: </Text>{(b.devotee_names ?? []).join(', ') || '—'}</Text>
              <Text style={styles.bkLine}><Text style={styles.bkKey}>Gotra: </Text>{(b.gotras?.length ? b.gotras.join(', ') : b.gotra) || '—'}</Text>
              {b.add_on_ids?.length ? (
                <Text style={styles.bkLine}><Text style={styles.bkKey}>Add-ons: </Text>{b.add_on_ids.map((id) => getAddOn(id)?.name.en ?? id).join(', ')}</Text>
              ) : null}
              {b.dakshina_paise > 0 ? <Text style={styles.bkLine}><Text style={styles.bkKey}>Dakshina: </Text>{paiseTo(b.dakshina_paise)}</Text> : null}
              {b.puja_wish ? <Text style={styles.bkLine}><Text style={styles.bkKey}>Wish: </Text>{b.puja_wish}</Text> : null}

              {/* WhatsApp — one tap to reach the devotee */}
              <Pressable style={styles.waBtn} onPress={() => openWhatsApp(b.contact_phone)} android_ripple={{ color: 'rgba(37,211,102,0.15)' }}>
                <Icon name="message" size={15} color="#25D366" />
                <Text style={styles.waText}>{b.contact_phone ?? '—'}</Text>
                <Icon name="external" size={13} color={th.textDim} />
              </Pressable>

              <View style={styles.actions}>
                {NEXT_STATUS.filter((s) => s.value !== b.status).map((s) => (
                  <Pressable key={s.value} style={[styles.actBtn, { borderColor: Accents[s.accent].color }]} onPress={() => askStatus(b, s)}>
                    <Text style={[styles.actText, { color: Accents[s.accent].color }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </KeyboardAwareScrollView>

      {/* toast */}
      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + Spacing.lg }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* themed confirm dialog */}
      <Modal visible={!!confirm} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !working && setConfirm(null)}>
        <Pressable style={styles.confirmBackdrop} onPress={() => !working && setConfirm(null)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>{confirm?.title}</Text>
            {confirm?.message ? <Text style={styles.confirmMsg}>{confirm.message}</Text> : null}
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmCancel} onPress={() => !working && setConfirm(null)} disabled={working}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmOk, confirm?.destructive && styles.confirmDanger, working && styles.btnDisabled]}
                onPress={runConfirm}
                disabled={working}
              >
                {working ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.confirmOkText}>{confirm?.confirmLabel}</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );

  function statusAccent(s: string) {
    return s === 'completed' ? Accents.emerald : s === 'in_progress' ? Accents.sapphire
      : s === 'refunded' || s === 'cancelled' ? Accents.ruby : Accents.gold;
  }
}

function who(b: AdminBooking): string {
  return (b.devotee_names ?? [])[0] ?? 'Booking';
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
  bkHeadRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bkTitle: { flex: 1, fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.text },
  bkAmount: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.goldLight },
  trashBtn: { padding: 4 },
  statusPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.pill, paddingVertical: 3, paddingHorizontal: Spacing.sm, marginTop: 6, marginBottom: Spacing.sm, gap: 4 },
  statusPillText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.xs },
  bkDate: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim },
  bkLine: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 21 },
  bkKey: { fontFamily: Fonts.bodySemibold, color: th.text },

  waBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md,
    backgroundColor: th.surfaceSunken, borderRadius: Radius.sm, borderWidth: 1, borderColor: th.border,
    paddingVertical: 10, paddingHorizontal: Spacing.md,
  },
  waText: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.text, letterSpacing: 0.3 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  actBtn: { borderWidth: 1, borderRadius: Radius.pill, paddingVertical: 8, paddingHorizontal: Spacing.md },
  actText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs },

  toast: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, alignItems: 'center' },
  toastText: {
    fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.goldContrast,
    backgroundColor: th.goldSurface, borderRadius: Radius.pill, paddingVertical: 10, paddingHorizontal: Spacing.lg, overflow: 'hidden',
    ...Depth.card,
  },

  confirmBackdrop: { flex: 1, backgroundColor: th.scrimBackdrop, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  confirmCard: { width: '100%', backgroundColor: th.scrimSheet, borderRadius: Radius.xl, borderWidth: 1, borderColor: th.border, padding: Spacing.lg, ...Depth.raised },
  confirmTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, marginBottom: Spacing.sm },
  confirmMsg: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 21, marginBottom: Spacing.lg },
  confirmActions: { flexDirection: 'row', gap: Spacing.md },
  confirmCancel: { flex: 1, borderRadius: Radius.pill, borderWidth: 1, borderColor: th.border, paddingVertical: Spacing.md, alignItems: 'center' },
  confirmCancelText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.textMuted },
  confirmOk: { flex: 1, borderRadius: Radius.pill, backgroundColor: th.goldSurface, paddingVertical: Spacing.md, alignItems: 'center' },
  confirmDanger: { backgroundColor: th.error },
  confirmOkText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: '#FFFFFF' },
});
