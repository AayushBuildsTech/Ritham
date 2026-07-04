import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getReport, ReportRow } from '../lib/reportService';
import { Colors, Fonts, Spacing } from '../constants/theme';

export default function ReportView() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [report, setReport] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) { setLoading(false); return; }
      setReport(await getReport(id));
      setLoading(false);
    })();
  }, [id]);

  async function download() {
    if (!report?.html || exporting) return;
    setExporting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: report.html });
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.title}>Your Report</Text>
        <TouchableOpacity onPress={download} disabled={!report?.html || exporting}>
          {exporting
            ? <ActivityIndicator color={Colors.gold} />
            : <Text style={[styles.download, !report?.html && styles.downloadDisabled]}>Download</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>
      ) : !report || !report.html ? (
        <View style={styles.center}>
          <Text style={styles.msg}>
            {report?.status === 'generating'
              ? 'Your report is still being prepared. Please check back shortly.'
              : 'This report isn’t available.'}
          </Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  back: { color: Colors.goldLight, fontSize: Fonts.size.md },
  title: { color: Colors.text, fontSize: Fonts.size.lg, fontWeight: '700' },
  download: { color: Colors.goldLight, fontSize: Fonts.size.md, fontWeight: '700' },
  downloadDisabled: { color: Colors.textDim },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  msg: { color: Colors.textMuted, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  web: { flex: 1, backgroundColor: Colors.bg },
});
