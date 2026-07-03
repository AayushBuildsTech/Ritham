import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { listReports, reportCredits, ReportRow, ReportType } from '../../lib/reportService';
import { REPORT_PRICES, paiseTo } from '../../config/pricing';
import { Colors, Fonts, Spacing } from '../../constants/theme';

export default function ReportsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [vastuCredits, setVastuCredits] = useState(0);
  const [matchCredits, setMatchCredits] = useState(0);
  const [open, setOpen] = useState<ReportType | null>(null); // which "My Reports" list is expanded

  const load = useCallback(async () => {
    const [rs, vc, mc] = await Promise.all([
      listReports(), reportCredits('vastu'), reportCredits('matchmaking'),
    ]);
    setReports(rs.filter((r) => r.status === 'ready'));
    setVastuCredits(vc);
    setMatchCredits(mc);
    setLoading(false);
  }, []);

  // refresh whenever the tab regains focus (after generating / viewing)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const vastuReports = reports.filter((r) => r.type === 'vastu');
  const matchReports = reports.filter((r) => r.type === 'matchmaking');

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

        <PastReports
          label="Vaastu Report" items={vastuReports}
          expanded={open === 'vastu'} onToggle={() => setOpen((o) => (o === 'vastu' ? null : 'vastu'))}
          onOpen={(id) => router.push({ pathname: '/report-view', params: { id } })}
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/report-vastu')}>
          <Text style={styles.primaryBtnText}>
            {vastuCredits > 0
              ? 'Create your Vaastu Report →'
              : `Get Vaastu Report · ${paiseTo(REPORT_PRICES.vastu.price_paise)}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Matchmaking ───────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardIcon}>💞</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Matchmaking Report</Text>
            <Text style={styles.cardDesc}>
              Ashtakoot Guna Milan between your chart and your partner’s — 36-guna score,
              doshas, both birth charts, and remedies.
            </Text>
          </View>
        </View>

        <PastReports
          label="Matchmaking Report" items={matchReports}
          expanded={open === 'matchmaking'} onToggle={() => setOpen((o) => (o === 'matchmaking' ? null : 'matchmaking'))}
          onOpen={(id) => router.push({ pathname: '/report-view', params: { id } })}
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/report-matchmaking')}>
          <Text style={styles.primaryBtnText}>
            {matchCredits > 0
              ? 'Create your Matchmaking Report →'
              : `Get Matchmaking Report · ${paiseTo(REPORT_PRICES.matchmaking.price_paise)}`}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.secureNote}>🔒 Reports are generated privately and stored only for you.</Text>
    </ScrollView>
  );
}

// Collapsible list of a user's past reports of one type.
function PastReports({ label, items, expanded, onToggle, onOpen }: {
  label: string; items: ReportRow[]; expanded: boolean; onToggle: () => void; onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <TouchableOpacity style={styles.myReportsBtn} onPress={onToggle} activeOpacity={0.8}>
        <Text style={styles.myReportsText}>📄 My Reports ({items.length})</Text>
        <Text style={styles.myReportsChevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && items.map((r) => (
        <TouchableOpacity key={r.id} style={styles.reportRow} onPress={() => onOpen(r.id)}>
          <Text style={styles.reportRowText}>
            📄 {label}{r.score != null ? ` · ${r.score}${r.type === 'matchmaking' ? '%' : '/100'}` : ''}
          </Text>
          <Text style={styles.reportRowDate}>{new Date(r.created_at).toLocaleDateString('en-IN')}</Text>
        </TouchableOpacity>
      ))}
    </>
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

  secureNote: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.md },
});
