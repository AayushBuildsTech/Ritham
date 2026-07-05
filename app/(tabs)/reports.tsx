import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { listReports, reportCredits, ReportRow, ReportType } from '../../lib/reportService';
import { REPORT_META, REPORT_GROUPS, paiseTo, REPORT_PRICES } from '../../config/pricing';
import { Colors, Fonts, Spacing } from '../../constants/theme';

export default function ReportsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<ReportType | null>(null);

  const load = useCallback(async () => {
    const [rs] = await Promise.all([listReports()]);
    const ready = rs.filter((r) => r.status === 'ready');

    // load credits for all report types
    const creditEntries = await Promise.all(
      REPORT_META.map(async (m) => [m.type, await reportCredits(m.type)] as const),
    );
    const creditMap: Record<string, number> = {};
    for (const [type, count] of creditEntries) creditMap[type] = count;

    setReports(ready);
    setCredits(creditMap);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;
  }

  const pastByType = reports.reduce<Record<string, ReportRow[]>>((acc, r) => {
    const list = acc[r.type] || (acc[r.type] = []);
    list.push(r);
    return acc;
  }, {});

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Reports</Text>
      <Text style={styles.sub}>Premium, personalised readings — beautifully presented.</Text>

      {REPORT_GROUPS.map((group) => {
        const items = REPORT_META.filter((m) => m.group === group.key);
        if (items.length === 0) return null;
        return (
          <View key={group.key} style={styles.groupSection}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            {items.map((meta) => {
              const priceObj = (REPORT_PRICES as any)[meta.type];
              const price = priceObj ? paiseTo(priceObj.price_paise) : '';
              const hasCredits = (credits[meta.type] || 0) > 0;
              const pastReports = pastByType[meta.type] || [];
              const flagship = meta.group === 'flagship';

              return (
                <View key={meta.type} style={[styles.card, flagship && styles.cardFlagship]}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardIcon}>{meta.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle}>{meta.title}</Text>
                        {flagship && <Text style={styles.flagBadge}>FLAGSHIP</Text>}
                      </View>
                      <Text style={styles.cardDesc}>{meta.desc}</Text>
                    </View>
                  </View>

                  {pastReports.length > 0 && (
                    <>
                      <TouchableOpacity
                        style={styles.myReportsBtn}
                        onPress={() => setOpen((o) => (o === meta.type ? null : meta.type as any))}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.myReportsText}>📄 My Reports ({pastReports.length})</Text>
                        <Text style={styles.myReportsChevron}>{open === meta.type ? '▲' : '▼'}</Text>
                      </TouchableOpacity>

                      {open === meta.type && pastReports.map((r) => (
                        <TouchableOpacity
                          key={r.id}
                          style={styles.reportRow}
                          onPress={() => router.push({ pathname: '/report-view', params: { id: r.id } })}
                        >
                          <Text style={styles.reportRowText}>
                            📄 {meta.title}{r.score != null ? ` · ${r.score}${meta.type === 'matchmaking' ? '%' : '/100'}` : ''}
                          </Text>
                          <Text style={styles.reportRowDate}>{new Date(r.created_at).toLocaleDateString('en-IN')}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  <TouchableOpacity
                    style={[styles.primaryBtn, flagship && styles.primaryBtnFlagship]}
                    onPress={() => router.push({ pathname: meta.route as any, params: { type: meta.type } })}
                  >
                    <Text style={styles.primaryBtnText}>
                      {hasCredits ? `Create Report →` : `Get Report · ${price}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        );
      })}

      <Text style={styles.secureNote}>🔒 Reports are generated privately and stored for unlimited re-download.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, paddingTop: 56 },
  h1: { fontSize: Fonts.size.xxl, color: Colors.text, fontWeight: '700' },
  sub: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginTop: 4, marginBottom: Spacing.lg },

  groupSection: { marginBottom: Spacing.lg },
  groupLabel: {
    color: Colors.goldLight, fontSize: Fonts.size.sm, fontWeight: '700',
    letterSpacing: 1, marginBottom: Spacing.sm, textTransform: 'uppercase',
  },

  card: {
    backgroundColor: Colors.bgCard, borderRadius: 16, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  cardFlagship: { borderColor: Colors.gold, backgroundColor: Colors.bgMid },
  cardHead: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  cardIcon: { fontSize: 34 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4, flexWrap: 'wrap' },
  cardTitle: { fontSize: Fonts.size.lg, color: Colors.goldLight, fontWeight: '700' },
  flagBadge: {
    color: Colors.bg, backgroundColor: Colors.gold, fontSize: 9, fontWeight: '800',
    letterSpacing: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden',
  },
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
  primaryBtnFlagship: { paddingVertical: Spacing.md + 2 },
  primaryBtnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },

  secureNote: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.md },
});
