import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Animated, Easing } from 'react-native';
import { showAlert } from '../lib/dialog';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getReport, ReportRow } from '../lib/reportService';
import { ReportContent, SAMPLE_CAREER } from '../lib/reportSchema';
import { buildReportHtml } from '../lib/reportRenderer';
import { reportAccent } from '../constants/reportAccents';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing, ThemeColors, Accents } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

// Astrologer-style "preparing your report" step lines (a report is one long AI
// generation; these keep the wait feeling intentional and premium, tailored per type).
const CHART_STEPS = {
  en: ['Casting your Lagna kundli…', 'Placing the nine planets…', 'Reading your nakshatra…', 'Tracing your Mahadasha timeline…', 'Weighing the yogas in your chart…', 'Preparing your remedies…', 'Writing your reading…'],
  hi: ['आपकी लग्न कुंडली बनाई जा रही है…', 'नौ ग्रह स्थापित किए जा रहे हैं…', 'आपका नक्षत्र पढ़ा जा रहा है…', 'आपकी महादशा देखी जा रही है…', 'आपकी कुंडली के योग तौले जा रहे हैं…', 'आपके उपाय तैयार किए जा रहे हैं…', 'आपका पठन लिखा जा रहा है…'],
};
const VASTU_STEPS = {
  en: ['Studying your floor plan…', 'Mapping the eight directions…', 'Checking the Brahmasthan…', 'Locating Vaastu doshas…', 'Preparing your remedies…', 'Writing your report…'],
  hi: ['आपके नक्शे का अध्ययन हो रहा है…', 'आठ दिशाओं का मानचित्रण…', 'ब्रह्मस्थान की जाँच…', 'वास्तु दोष खोजे जा रहे हैं…', 'आपके उपाय तैयार किए जा रहे हैं…', 'आपकी रिपोर्ट लिखी जा रही है…'],
};
const MATCH_STEPS = {
  en: ['Aligning both charts…', 'Computing the 36 gunas…', 'Checking the eight kutas…', 'Screening for doshas…', 'Weighing your compatibility…', 'Writing your report…'],
  hi: ['दोनों कुंडलियाँ मिलाई जा रही हैं…', '36 गुणों की गणना…', 'आठ कूटों की जाँच…', 'दोष जाँचे जा रहे हैं…', 'आपकी अनुकूलता तौली जा रही है…', 'आपकी रिपोर्ट लिखी जा रही है…'],
};
const PALM_STEPS = {
  en: ['Mapping your palm…', 'Tracing the major lines…', 'Reading the mounts…', 'Cross-referencing your chart…', 'Preparing your remedies…', 'Writing your reading…'],
  hi: ['आपकी हथेली का मानचित्रण…', 'प्रमुख रेखाएँ खींची जा रही हैं…', 'पर्वत पढ़े जा रहे हैं…', 'आपकी कुंडली से मिलान…', 'आपके उपाय तैयार किए जा रहे हैं…', 'आपका पठन लिखा जा रहा है…'],
};

function GeneratingView({ type, isHindi, styles }: { type?: string; isHindi: boolean; styles: ReturnType<typeof makeStyles> }) {
  const lang = isHindi ? 'hi' : 'en';
  const isPalm = type === 'palm';
  const steps = type === 'vastu' ? VASTU_STEPS[lang] : type === 'matchmaking' ? MATCH_STEPS[lang] : isPalm ? PALM_STEPS[lang] : CHART_STEPS[lang];
  const [i, setI] = useState(0);
  const rot = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const scan = useRef(new Animated.Value(0)).current; // palm: scan-line sweep

  useEffect(() => {
    Animated.loop(Animated.timing(rot, { toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    // palm: a biometric-style scan line sweeps down the hand, then back up (never a jump-cut).
    Animated.loop(Animated.sequence([
      Animated.timing(scan, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(scan, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
    // Slow crawl toward ~92% — feels like progress without ever "completing" before the report lands.
    Animated.timing(prog, { toValue: 0.92, duration: 85000, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const id = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
      setTimeout(() => setI((n) => (n + 1) % steps.length), 260);
    }, 3400);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });
  const width = prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const scanY = scan.interpolate({ inputRange: [0, 1], outputRange: [-56, 56] });
  const scanGlow = scan.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1, 0.35] });
  const A = Accents.amber;

  return (
    <View style={styles.center}>
      {isPalm ? (
        // Bespoke palm-scan loader — a hand with a sweeping biometric scan line + lighting mounts.
        <View style={styles.palmScan}>
          <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.9] }) }}>
            <Icon name="palmreading" size={104} color={A.color} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.scanBand, { opacity: scanGlow, transform: [{ translateY: scanY }] }]}>
            <LinearGradient
              colors={['transparent', A.soft, A.color, A.soft, 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      ) : (
        <View style={styles.genOrb}>
          <Animated.View style={[styles.genRing, { transform: [{ rotate: spin }] }]} />
          <Animated.Text style={[styles.genGlyph, { opacity: glow, transform: [{ scale }] }]}>✦</Animated.Text>
        </View>
      )}
      <Text style={[styles.genTitle, isPalm && { color: A.color }]}>{isPalm ? (isHindi ? 'आपकी हथेली पढ़ी जा रही है' : 'Reading your palm') : (isHindi ? 'आपकी रिपोर्ट तैयार हो रही है' : 'Preparing your report')}</Text>
      <Animated.Text style={[styles.genStep, isPalm && { color: A.color }, { opacity: fade }]}>{steps[i]}</Animated.Text>
      <View style={styles.genBarTrack}><Animated.View style={[styles.genBarFill, isPalm && { backgroundColor: A.color }, { width }]} /></View>
      <Text style={styles.msg}>
        {isHindi
          ? 'हमारे ज्योतिषी आपकी कुंडली पढ़कर आपकी रिपोर्ट लिख रहे हैं। इसमें एक-दो मिनट लग सकते हैं — कृपया यह स्क्रीन खुली रखें।'
          : 'Your astrologer is reading your chart and writing your report. This can take a minute or two — please keep this screen open.'}
      </Text>
    </View>
  );
}

export default function ReportView() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
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
        showAlert(isHindi ? 'सहेजा गया' : 'Saved', `${isHindi ? 'PDF यहाँ सहेजी गई:' : 'PDF saved to:'} ${uri}`);
      }
    } catch {
      showAlert(isHindi ? 'निर्यात विफल' : 'Export failed', isHindi ? 'हम PDF नहीं बना सके। कृपया फिर कोशिश करें।' : 'We couldn’t create the PDF. Please try again.');
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
        <GeneratingView type={report?.type} isHindi={isHindi} styles={styles} />
      ) : !html && report?.status === 'failed' && report?.type === 'palm' ? (
        // Palm failures are almost always an unreadable photo — the credit was released,
        // so the user can re-upload a clearer palm and regenerate WITHOUT paying again.
        <View style={styles.center}>
          <Text style={styles.genTitle}>{isHindi ? 'हम आपकी हथेली स्पष्ट रूप से नहीं पढ़ सके' : 'We couldn’t read your palm clearly'}</Text>
          <Text style={styles.msg}>
            {isHindi
              ? 'फ़ोटो शायद धुंधली, कम रोशनी में, या हथेली की नहीं थी। आपका ₹99 सुरक्षित है — एक स्पष्ट फ़ोटो के साथ फिर से प्रयास करें, दोबारा भुगतान नहीं करना होगा।'
              : 'The photo may have been blurry, poorly lit, or not a palm. Your ₹99 is safe — try again with a clearer photo, you won’t be charged twice.'}
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => router.replace('/palmreading' as any)} android_ripple={{ color: th.goldDeep }}>
            <Icon name="camera" size={16} color={th.goldContrast} />
            <Text style={styles.retryText}>{isHindi ? 'दूसरी फ़ोटो आज़माएं' : 'Try another photo'}</Text>
          </Pressable>
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
  // engaging "preparing your report" screen
  genOrb: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  palmScan: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md, overflow: 'hidden' },
  scanBand: { position: 'absolute', left: 10, right: 10, height: 40 },
  genRing: { position: 'absolute', width: 92, height: 92, borderRadius: 46, borderWidth: 2.5, borderColor: th.gold, borderTopColor: 'transparent', borderRightColor: 'transparent' },
  genGlyph: { fontSize: 44, color: th.gold, textShadowColor: th.gold, textShadowRadius: 16 },
  genStep: { fontFamily: Fonts.body, color: th.goldLight, fontSize: Fonts.size.md, textAlign: 'center', marginBottom: Spacing.lg, minHeight: 24 },
  genBarTrack: { width: 200, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden', marginBottom: Spacing.lg },
  genBarFill: { height: '100%', borderRadius: 3, backgroundColor: th.gold },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.lg,
    backgroundColor: th.goldSurface, borderRadius: 12, paddingVertical: 13, paddingHorizontal: Spacing.xl,
  },
  retryText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md },
});
