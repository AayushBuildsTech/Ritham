import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getReport, ReportRow } from '../lib/reportService';
import { ReportContent, SAMPLE_CAREER } from '../lib/reportSchema';
import { buildReportHtml } from '../lib/reportRenderer';
import { reportAccent } from '../constants/reportAccents';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

export default function ReportView() {
  const th = useColors();
  const styles = makeStyles(th);
  const { t, isHindi } = useLanguage();
  const router = useRouter();
  // `preview` renders a bundled sample (no DB) so the renderer is testable before
  // the Edge Function JSON path exists — e.g. /report-view?preview=career.
  const { id, preview } = useLocalSearchParams<{ id: string; preview?: string }>();

  const [report, setReport] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // v2 structured content: the dev sample (preview) or the report's stored `pages`
  // (parsed if Supabase handed it back as a JSON string).
  const content: ReportContent | null = useMemo(() => {
    if (preview) return SAMPLE_CAREER;
    const raw = report?.pages;
    if (!raw) return null;
    try { return typeof raw === 'string' ? (JSON.parse(raw) as ReportContent) : (raw as ReportContent); }
    catch { return null; }
  }, [preview, report?.pages]);

  // Prefer the native-rendered v2 doc; fall back to the legacy HTML blob.
  const html: string | null = useMemo(
    () => (content ? buildReportHtml(content, reportAccent(content.type)) : report?.html ?? null),
    [content, report?.html],
  );

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
    if (!html || exporting) return;
    setExporting(true);
    try {
      // The on-screen doc reveals content on scroll, which prints blank past page 1.
      // For v2 content, render a print-mode HTML (all content visible & static); the
      // legacy html blob is already print-styled, so use it as-is.
      const printHtml = content ? buildReportHtml(content, reportAccent(content.type), { print: true }) : html;
      const { uri } = await Print.printToFileAsync({ html: printHtml });
      track('report_downloaded', { type: content?.type ?? report?.type });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: isHindi ? 'आपकी रिपोर्ट' : 'Your Report' });
      } else {
        Alert.alert(isHindi ? 'सहेजा गया' : 'Saved', `${isHindi ? 'PDF यहाँ सहेजी गई:' : 'PDF saved to:'} ${uri}`);
      }
    } catch {
      Alert.alert(isHindi ? 'निर्यात विफल' : 'Export failed', isHindi ? 'हम PDF नहीं बना सके। कृपया फिर कोशिश करें।' : 'We couldn’t create the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={isHindi ? 'आपकी रिपोर्ट' : 'Your Report'}
        onBack={() => router.back()}
        right={
          <Pressable onPress={download} disabled={!html || exporting} style={styles.dlBtn} hitSlop={8}>
            {exporting
              ? <ActivityIndicator color={th.gold} />
              : <Icon name="download" size={20} color={html ? th.goldLight : th.textDim} />}
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>
      ) : !html && report?.status === 'generating' ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.gold} size="large" />
          <Text style={styles.genTitle}>{t('reports.generating')}</Text>
          <Text style={styles.msg}>
            {isHindi
              ? 'हमारे ज्योतिषी आपकी कुंडली पढ़कर आपकी रिपोर्ट लिख रहे हैं। इसमें एक-दो मिनट लग सकते हैं — कृपया यह स्क्रीन खुली रखें।'
              : 'Our astrologer is reading your chart and writing your report. This can take a minute or two — please keep this screen open.'}
          </Text>
        </View>
      ) : !html && report?.status === 'failed' ? (
        <View style={styles.center}>
          <Text style={styles.genTitle}>{isHindi ? 'हम यह रिपोर्ट पूरी नहीं कर सके' : 'We couldn’t finish this report'}</Text>
          <Text style={styles.msg}>
            {isHindi
              ? 'इसे तैयार करते समय कुछ गड़बड़ हुई। आपका रिपोर्ट क्रेडिट सुरक्षित है — कृपया रिपोर्ट पर वापस जाकर इसे फिर से बनाएं।'
              : 'Something went wrong while preparing it. Your report credit is safe — please go back to Reports and try generating it again.'}
          </Text>
        </View>
      ) : !html ? (
        <View style={styles.center}>
          <Text style={styles.msg}>{isHindi ? 'यह रिपोर्ट उपलब्ध नहीं है।' : 'This report isn’t available.'}</Text>
        </View>
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          style={styles.web}
          showsVerticalScrollIndicator={false}
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
