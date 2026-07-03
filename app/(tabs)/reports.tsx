import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { listReports, reportCredits, ReportRow } from '../../lib/reportService';
import { purchasePack } from '../../lib/paymentService';
import { REPORT_PRICES, paiseTo } from '../../config/pricing';
import { Colors, Fonts, Spacing } from '../../constants/theme';

export default function ReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [vastuCredits, setVastuCredits] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showReports, setShowReports] = useState(false);

  const load = useCallback(async () => {
    const [rs, credits] = await Promise.all([listReports(), reportCredits('vastu')]);
    setReports(rs.filter((r) => r.status === 'ready'));
    setVastuCredits(credits);
    setLoading(false);
  }, []);

  // refresh whenever the tab regains focus (after buying / generating / viewing)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function buyVastu() {
    if (busy) return;
    setBusy(true);
    const res = await purchasePack('report', 'vastu', { contact: user?.phone ?? '' });
    setBusy(false);
    if (res.ok) {
      setVastuCredits((c) => c + 1);
      router.push('/report-vastu');
      return;
    }
    if (res.error === 'cancelled') return;
    Alert.alert('Payment not completed', 'Something went wrong. Please try again in a moment.');
  }

  const vastuReports = reports.filter((r) => r.type === 'vastu');

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Reports</Text>
      <Text style={styles.sub}>Premium, personalised readings — beautifully presented.</Text>

      {/* ── Vastu ─────────────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardIcon}>🏠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Vaastu Report</Text>
            <Text style={styles.cardDesc}>
              Upload your floor plan, answer a few questions, and receive a room-by-room
              Vaastu consultancy with a health score and remedies.
            </Text>
          </View>
        </View>

        {/* past reports — hidden behind a toggle so the card stays uncluttered */}
        {vastuReports.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.myReportsBtn}
              onPress={() => setShowReports((s) => !s)}
              activeOpacity={0.8}
            >
              <Text style={styles.myReportsText}>📄 My Reports ({vastuReports.length})</Text>
              <Text style={styles.myReportsChevron}>{showReports ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {showReports && vastuReports.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.reportRow}
                onPress={() => router.push({ pathname: '/report-view', params: { id: r.id } })}
              >
                <Text style={styles.reportRowText}>
                  📄 Vaastu Report{r.score != null ? ` · ${r.score}/100` : ''}
                </Text>
                <Text style={styles.reportRowDate}>{new Date(r.created_at).toLocaleDateString('en-IN')}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* CTA: create (has credit) or buy */}
        {vastuCredits > 0 ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/report-vastu')}>
            <Text style={styles.primaryBtnText}>Create your Vaastu Report →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={buyVastu} disabled={busy}>
            {busy
              ? <ActivityIndicator color={Colors.bg} />
              : <Text style={styles.primaryBtnText}>Get Vaastu Report · {paiseTo(REPORT_PRICES.vastu.price_paise)}</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* ── Matchmaking (coming soon) ─────────────────────────────────────────── */}
      <View style={[styles.card, styles.cardMuted]}>
        <View style={styles.cardHead}>
          <Text style={styles.cardIcon}>💞</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Matchmaking Report</Text>
            <Text style={styles.cardDesc}>
              Guna Milan compatibility between two charts, doshas, and remedies.
              {paiseTo(REPORT_PRICES.matchmaking.price_paise)}.
            </Text>
          </View>
        </View>
        <View style={styles.soonPill}><Text style={styles.soonText}>Coming soon</Text></View>
      </View>

      <Text style={styles.secureNote}>🔒 Reports are generated privately and stored only for you.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, paddingTop: 56 },
  h1: { fontSize: Fonts.size.xxl, color: Colors.text, fontWeight: '700' },
  sub: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginTop: 4, marginBottom: Spacing.lg },

  card: {
    backgroundColor: Colors.bgCard, borderRadius: 16, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  cardMuted: { opacity: 0.75 },
  cardHead: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  cardIcon: { fontSize: 34 },
  cardTitle: { fontSize: Fonts.size.lg, color: Colors.goldLight, fontWeight: '700', marginBottom: 4 },
  cardDesc: { fontSize: Fonts.size.sm, color: Colors.textMuted, lineHeight: 20 },

  myReportsBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.bgMid, borderRadius: 10, paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  myReportsText: { color: Colors.goldLight, fontSize: Fonts.size.sm, fontWeight: '700' },
  myReportsChevron: { color: Colors.textMuted, fontSize: Fonts.size.xs },

  reportRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.bgMid, borderRadius: 10, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  reportRowText: { color: Colors.text, fontSize: Fonts.size.md, fontWeight: '600' },
  reportRowDate: { color: Colors.textDim, fontSize: Fonts.size.xs },

  primaryBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: Spacing.md,
    alignItems: 'center', marginTop: Spacing.xs,
  },
  primaryBtnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },

  soonPill: {
    alignSelf: 'flex-start', backgroundColor: Colors.bgMid, borderRadius: 20,
    paddingVertical: 4, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  soonText: { color: Colors.textMuted, fontSize: Fonts.size.xs, fontWeight: '700' },

  secureNote: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.md },
});
