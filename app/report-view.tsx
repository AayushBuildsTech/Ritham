import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getReport, ReportRow } from '../lib/reportService';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

export default function ReportView() {
  const th = useColors();
  const styles = makeStyles(th);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [report, setReport] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // The report is generated in the background (long Claude call), so poll the row
  // until it flips from 'generating' to 'ready' / 'failed'.
  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const MAX_TRIES = 80; // ~4 min at 3s between polls

    const poll = async () => {
      const r = await getReport(id);
      if (cancelled) return;
      setReport(r);
      setLoading(false);
      if (r?.status === 'generating' && tries < MAX_TRIES) {
        tries += 1;
        timer = setTimeout(poll, 3000);
      }
    };

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);

  async function download() {
    if (!report?.html || exporting) return;
    setExporting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: report.html });
      track('report_downloaded', { type: report.type });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Your Report' });
      } else {
        Alert.alert('Saved', `PDF saved to: ${uri}`);
      }
    } catch {
      Alert.alert('Export failed', 'We couldn’t create the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Your Report"
        onBack={() => router.back()}
        right={
          <Pressable onPress={download} disabled={!report?.html || exporting} style={styles.dlBtn} hitSlop={8}>
            {exporting
              ? <ActivityIndicator color={th.gold} />
              : <Icon name="download" size={20} color={report?.html ? th.goldLight : th.textDim} />}
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>
      ) : report?.status === 'generating' ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.gold} size="large" />
          <Text style={styles.genTitle}>Preparing your report…</Text>
          <Text style={styles.msg}>
            Our astrologer is reading your chart and writing your report. This can take a
            minute or two — please keep this screen open.
          </Text>
        </View>
      ) : report?.status === 'failed' ? (
        <View style={styles.center}>
          <Text style={styles.genTitle}>We couldn’t finish this report</Text>
          <Text style={styles.msg}>
            Something went wrong while preparing it. Your report credit is safe — please go
            back to Reports and try generating it again.
          </Text>
        </View>
      ) : !report || !report.html ? (
        <View style={styles.center}>
          <Text style={styles.msg}>This report isn’t available.</Text>
        </View>
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html: report.html }}
          style={styles.web}
          showsVerticalScrollIndicator
        />
      )}
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  dlBtn: { minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  genTitle: { fontFamily: Fonts.display, color: th.gold, fontSize: Fonts.size.lg, textAlign: 'center', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  msg: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  web: { flex: 1, backgroundColor: th.canvas },
});
