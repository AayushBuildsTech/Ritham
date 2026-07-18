import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Animated, Easing,
} from 'react-native';
import { showAlert } from '../lib/dialog';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { useActiveProfile } from '../context/ProfileContext';
import { supabase } from '../lib/supabase';
import { ProfileRow, Kundli } from '../lib/kundliService';
import { MatchPerson, reportCredits } from '../lib/reportService';
import { personFromProfile, uploadPalm, generatePalm, buildPalmHint, checkPalmImage } from '../lib/palmService';
import { useReportLang } from '../lib/reportLang';
import { purchasePack } from '../lib/paymentService';
import { track } from '../lib/analytics';
import { REPORT_PRICES, paiseTo } from '../config/pricing';
import { Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { HeroBanner } from '../components/HeroBanner';
import { GradientCard } from '../components/GradientCard';
import { Reveal } from '../components/Reveal';
import { FEATURE_BANNER } from '../constants/appArt';

const ACCENT = Accents.amber;
const PALM_PRICE = paiseTo(REPORT_PRICES.palm.price_paise);

interface PickedImage { uri: string; base64: string; mimeType: string }

export default function PalmReadingScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const router = useRouter();
  const reportLang = useReportLang();
  const { isHindi } = useLanguage();
  const { user } = useAuth();
  const { activeId } = useActiveProfile();

  const [self, setSelf] = useState<MatchPerson | null>(null);
  const [kundli, setKundli] = useState<Kundli | null>(null);
  const [loadingSelf, setLoadingSelf] = useState(true);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [checking, setChecking] = useState(false);  // pre-payment palm-photo validation
  const [photoError, setPhotoError] = useState<{ title: string; body: string } | null>(null);
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState(false);          // validating / payment
  const [generating, setGenerating] = useState(false);

  const FOCI = isHindi
    ? ['सम्पूर्ण', 'प्रेम', 'करियर', 'धन', 'स्वास्थ्य', 'आध्यात्म']
    : ['Everything', 'Love', 'Career', 'Wealth', 'Health', 'Spiritual'];

  useEffect(() => { track('palm_started'); }, []);

  useEffect(() => {
    (async () => {
      if (!user || !activeId) { if (user) setLoadingSelf(false); return; }
      const { data } = await supabase.from('profiles').select('*').eq('id', activeId).maybeSingle();
      if (data) {
        const row = data as ProfileRow;
        setSelf(personFromProfile(row));
        setKundli(row.kundli_chart);
      }
      setLoadingSelf(false);
    })();
  }, [user, activeId]);

  // Zero-cost teaser — composed purely from the cached chart, no network / AI call.
  const hint = useMemo(() => (image ? buildPalmHint(kundli, reportLang) : null), [image, kundli, reportLang]);
  useEffect(() => { if (image) track('palm_hint_shown'); }, [image]);

  async function pick(fromCamera: boolean) {
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { showAlert(isHindi ? 'अनुमति चाहिए' : 'Permission needed', isHindi ? 'हथेली की फ़ोटो लेने के लिए कैमरा अनुमति दें।' : 'Please allow camera access to photograph your palm.'); return; }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showAlert(isHindi ? 'अनुमति चाहिए' : 'Permission needed', isHindi ? 'हथेली की फ़ोटो चुनने के लिए फ़ोटो अनुमति दें।' : 'Please allow photo access to upload your palm.'); return; }
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const a = res.assets[0];
    setPhotoError(null);
    // Free pre-payment sanity check: a too-small image can't hold readable palm lines.
    if ((a.width ?? 0) < 500 || (a.height ?? 0) < 500) {
      setPhotoError({
        title: isHindi ? 'साफ़ फ़ोटो चाहिए' : 'Clearer photo needed',
        body: isHindi
          ? 'यह फ़ोटो हथेली की रेखाएँ पढ़ने के लिए बहुत छोटी है। कृपया अच्छी रोशनी में अपनी हथेली का बड़ा, स्पष्ट क्लोज़-अप लें।'
          : 'That photo is too small to read your palm lines. Please take a larger, sharp close-up of your palm in good light.',
      });
      return;
    }
    // Cheap AI gate BEFORE the hint / payment: confirm it's a clear human palm.
    setChecking(true);
    const chk = await checkPalmImage(a.base64!, a.mimeType ?? 'image/jpeg');
    setChecking(false);
    if (!chk.palm) {
      setPhotoError({
        title: isHindi ? 'यह हथेली नहीं लगती' : 'That doesn’t look like a palm',
        body: isHindi
          ? 'कृपया अच्छी रोशनी में अपनी खुली हथेली (सामने की ओर) का स्पष्ट, फ़ोकस्ड क्लोज़-अप लें ताकि रेखाएँ साफ़ दिखें।'
          : (chk.reason ? chk.reason + ' ' : '') + 'Take a sharp, well-lit close-up of your open palm (front of the hand) so the lines are clearly visible.',
      });
      return;
    }
    setImage({ uri: a.uri, base64: a.base64!, mimeType: a.mimeType ?? 'image/jpeg' });
  }

  async function unlock() {
    if (!self || !image || !user || busy || generating) return;
    setBusy(true);
    try {
      // fill-first, pay-at-end: only charge if there isn't already an unused credit.
      const credits = await reportCredits('palm');
      if (credits < 1) {
        const pay = await purchasePack('report', 'palm', { email: user.email ?? '' });
        if (!pay.ok) {
          setBusy(false);
          if (pay.error !== 'cancelled') showAlert(isHindi ? 'भुगतान पूरा नहीं हुआ' : 'Payment not completed', isHindi ? 'कुछ गड़बड़ हुई। कृपया पुनः प्रयास करें।' : 'Something went wrong. Please try again in a moment.');
          return;
        }
        track('palm_purchased');
      }

      const up = await uploadPalm(user.id, image.base64, image.mimeType);
      if (up.error || !up.path) {
        setBusy(false);
        showAlert(isHindi ? 'अपलोड विफल' : 'Upload failed', isHindi ? 'हम आपकी हथेली की फ़ोटो अपलोड नहीं कर सके। कृपया पुनः प्रयास करें।' : 'We couldn’t upload your palm photo. Please try again.');
        return;
      }

      setBusy(false);
      setGenerating(true);
      const res = await generatePalm(self, up.path, focus, reportLang);
      setGenerating(false);

      if (res.report_id) {
        track('palm_generated');
        router.replace({ pathname: '/report-view', params: { id: res.report_id } });
        return;
      }
      if (res.error === 'needs_purchase') {
        showAlert(isHindi ? 'खरीद आवश्यक' : 'Purchase needed', isHindi ? 'आपका रिपोर्ट क्रेडिट नहीं मिला। कृपया रिपोर्ट्स से पुनः प्रयास करें।' : 'Your report credit wasn’t found. Please try again from Reports.');
        return;
      }
      showAlert(isHindi ? 'निर्माण विफल' : 'Generation failed', isHindi ? 'हम अभी आपकी रीडिंग नहीं बना सके। कृपया थोड़ी देर में पुनः प्रयास करें।' : 'We couldn’t generate your reading just now. Please try again in a moment.');
    } catch {
      setBusy(false);
      setGenerating(false);
      showAlert(isHindi ? 'कुछ गड़बड़ हुई' : 'Something went wrong', isHindi ? 'कृपया थोड़ी देर में पुनः प्रयास करें।' : 'Please try again in a moment.');
    }
  }

  if (loadingSelf) {
    return <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>;
  }

  if (!self) {
    return (
      <View style={styles.center}>
        <View style={styles.needCrest}><Icon name="palmreading" size={26} color={th.gold} /></View>
        <Text style={styles.needTitle}>{isHindi ? 'पहले अपनी कुंडली बनाएं' : 'Create your Kundli first'}</Text>
        <Text style={styles.needSub}>
          {isHindi
            ? 'यह रीडिंग आपकी हथेली को आपकी जन्म-कुंडली के साथ पढ़ती है। कृपया अपनी जन्म-जानकारी जोड़ें, फिर लौटें।'
            : 'This reading cross-references your palm with your birth chart. Please add your birth details, then come back.'}
        </Text>
        <Pressable style={styles.needBtn} onPress={() => router.replace('/profile')} android_ripple={{ color: th.goldDeep }}>
          <Text style={styles.needBtnText}>{isHindi ? 'जन्म-जानकारी जोड़ें' : 'Add my birth details'}</Text>
          <Icon name="arrowRight" size={15} color={th.goldContrast} />
        </Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.needBack}>{isHindi ? 'वापस' : 'Back'}</Text></Pressable>
      </View>
    );
  }

  if (generating) return <PalmGenerating styles={styles} isHindi={isHindi} />;

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'हस्तरेखा पठन' : 'Palm Reading'} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        <Reveal index={0}>
          <HeroBanner source={FEATURE_BANNER.palmreading} blend style={{ marginBottom: Spacing.md }} />
          <Text style={styles.eyebrow}>{isHindi ? 'हस्त रेखा · हस्तरेखा × ज्योतिष' : 'HASTA REKHA · PALMISTRY × ASTROLOGY'}</Text>
          <Text style={styles.h1}>{isHindi ? 'आपकी नियति आपके हाथ में' : 'Your destiny, in your hands'}</Text>
          <Text style={styles.lead}>
            {isHindi
              ? 'अपनी प्रमुख हाथ की स्पष्ट फ़ोटो अपलोड करें। हम आपकी रेखाओं और पर्वतों को पढ़ते हैं और उन्हें आपकी वैदिक कुंडली के साथ मिलाते हैं — यही इसे सच्चा और सटीक बनाता है।'
              : 'Upload a clear photo of your dominant hand. We read your lines and mounts and cross-reference them with your Vedic chart — that pairing is what makes it genuine, not guesswork.'}
          </Text>
        </Reveal>

        {/* Photo capture / preview */}
        <Reveal index={1}>
          {image ? (
            <>
              <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" />
              <Pressable onPress={() => pick(false)}><Text style={styles.changeLink}>{isHindi ? 'फ़ोटो बदलें' : 'Change photo'}</Text></Pressable>
            </>
          ) : (
            <View style={styles.uploadWrap}>
              <View style={styles.uploadIconRing}><Icon name="palmreading" size={30} color={ACCENT.color} /></View>
              <Text style={styles.uploadText}>{isHindi ? 'अपनी हथेली की फ़ोटो जोड़ें' : 'Add a photo of your palm'}</Text>
              <Text style={styles.uploadHint}>{isHindi ? 'प्रमुख हाथ · अच्छी रोशनी · तेज़ फ़ोकस · हथेली पूरी फ़्रेम में' : 'Dominant hand · good light · sharp focus · palm fills the frame'}</Text>
              {checking ? (
                <View style={styles.checkingRow}>
                  <ActivityIndicator color={ACCENT.color} />
                  <Text style={styles.checkingText}>{isHindi ? 'आपकी फ़ोटो जाँची जा रही है…' : 'Checking your photo…'}</Text>
                </View>
              ) : (
                <View style={styles.uploadBtnRow}>
                  <Pressable style={styles.uploadBtn} onPress={() => pick(true)} android_ripple={{ color: th.goldFaint }}>
                    <Icon name="camera" size={17} color={th.goldContrast} />
                    <Text style={styles.uploadBtnText}>{isHindi ? 'फ़ोटो लें' : 'Take photo'}</Text>
                  </Pressable>
                  <Pressable style={styles.uploadBtnAlt} onPress={() => pick(false)} android_ripple={{ color: th.goldFaint }}>
                    <Icon name="download" size={17} color={ACCENT.color} />
                    <Text style={styles.uploadBtnAltText}>{isHindi ? 'गैलरी' : 'Upload'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Themed photo-validation notice (replaces the native Android alert). */}
          {photoError && (
            <View style={styles.notice}>
              <View style={styles.noticeIcon}><Icon name="camera" size={16} color={ACCENT.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>{photoError.title}</Text>
                <Text style={styles.noticeBody}>{photoError.body}</Text>
              </View>
            </View>
          )}
        </Reveal>

        {/* Focus chips (optional) */}
        {image && (
          <Reveal index={2}>
            <Text style={styles.label}>{isHindi ? 'रीडिंग का केंद्र' : 'FOCUS OF THE READING'}</Text>
            <View style={styles.chips}>
              {FOCI.map((o, i) => {
                const val = i === 0 ? '' : o;
                const active = focus === val;
                return (
                  <Pressable key={o} style={[styles.chip, active && styles.chipActive]} onPress={() => setFocus(val)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{o}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Reveal>
        )}

        {/* Zero-cost hint + locked sections */}
        {image && hint && (
          <Reveal index={3}>
            <GradientCard colors={ACCENT.grad} borderColor={ACCENT.soft} style={styles.hintCard}>
              <View style={styles.hintTag}>
                <Icon name="sparkle" size={13} color="#FFFFFF" />
                <Text style={styles.hintTagText}>{isHindi ? 'हथेली मिली · मानचित्रित' : 'PALM RECEIVED · MAPPED'}</Text>
              </View>
              <Text style={styles.hintLead}>{hint.lead}</Text>
            </GradientCard>

            <Text style={[styles.label, { marginTop: Spacing.lg }]}>{isHindi ? 'पूरी रीडिंग में शामिल' : 'INSIDE YOUR FULL READING'}</Text>
            <View style={styles.lockedList}>
              {hint.locked.map((title) => (
                <View key={title} style={styles.lockedRow}>
                  <Text style={styles.lockedText} numberOfLines={1}>{title}</Text>
                  <Icon name="lock" size={14} color={th.textDim} />
                </View>
              ))}
            </View>

            <Pressable style={[styles.unlockBtn, busy && styles.btnDisabled]} onPress={unlock} disabled={busy} android_ripple={{ color: th.goldDeep }}>
              {busy
                ? <ActivityIndicator color={th.goldContrast} />
                : (
                  <>
                    <Icon name="lock" size={16} color={th.goldContrast} />
                    <Text style={styles.unlockText}>{isHindi ? `पूरी रीडिंग खोलें · ${PALM_PRICE}` : `Unlock full reading · ${PALM_PRICE}`}</Text>
                  </>
                )}
            </Pressable>
            <Text style={styles.note}>
              {isHindi
                ? 'आप केवल एक बार भुगतान करेंगे — आपकी रीडिंग असीमित पुनः-डाउनलोड के लिए सहेजी जाती है।'
                : 'You’ll pay only once — your reading is saved for unlimited re-download.'}
            </Text>
            <Text style={styles.disclaimer}>
              {isHindi
                ? 'हस्तरेखा एक व्याख्यात्मक कला है, मार्गदर्शन और चिंतन के लिए — निश्चितता या चिकित्सा/वित्तीय सलाह नहीं।'
                : 'Palmistry is an interpretive art offered for guidance & reflection — not a certainty, nor medical or financial advice.'}
            </Text>
          </Reveal>
        )}

        {/* How it works — shown before a photo is added */}
        {!image && (
          <Reveal index={2}>
            <Text style={[styles.label, { marginTop: Spacing.lg }]}>{isHindi ? 'यह कैसे काम करता है' : 'HOW IT WORKS'}</Text>
            <View style={styles.stepsCard}>
              {[
                isHindi ? 'अपनी प्रमुख हथेली की एक स्पष्ट फ़ोटो लें या अपलोड करें।' : 'Take or upload one clear photo of your dominant palm.',
                isHindi ? 'आपके चार्ट से तुरंत एक निःशुल्क संकेत देखें।' : 'See a free, instant hint drawn from your chart.',
                isHindi ? 'पूरी रीडिंग खोलें — रेखाएँ, पर्वत और कुंडली-मिलान।' : 'Unlock the full reading — lines, mounts & chart cross-reference.',
              ].map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              ))}
            </View>
          </Reveal>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// Bespoke palm-themed loader (amber, pulsing hand) — matches report-view's palm scan
// so the brief hand-off between screens reads as one continuous, palm-specific moment.
function PalmGenerating({ styles, isHindi }: { styles: ReturnType<typeof makeStyles>; isHindi: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.1] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  return (
    <View style={styles.center}>
      <Animated.View style={[styles.genHandRing, { transform: [{ scale }], opacity }]}>
        <Icon name="palmreading" size={46} color={ACCENT.color} />
      </Animated.View>
      <Text style={styles.genTitle}>{isHindi ? 'आपकी हथेली पढ़ी जा रही है…' : 'Reading your palm…'}</Text>
      <Text style={styles.genSub}>{isHindi ? 'आपकी रेखाओं और पर्वतों को आपकी कुंडली के साथ मिलाया जा रहा है। इसमें एक मिनट तक लग सकता है।' : 'Studying your lines and mounts against your chart. This can take up to a minute.'}</Text>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  genHandRing: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: ACCENT.faint,
    borderWidth: 1, borderColor: ACCENT.soft, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  center: { flex: 1, backgroundColor: th.canvas, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },

  genTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, textAlign: 'center', marginTop: Spacing.md },
  genSub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, textAlign: 'center', lineHeight: 20 },

  needCrest: {
    width: 64, height: 64, borderRadius: Radius.pill, backgroundColor: th.goldFaint,
    borderWidth: 1, borderColor: th.border, alignItems: 'center', justifyContent: 'center',
  },
  needTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, textAlign: 'center' },
  needSub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, textAlign: 'center', lineHeight: 20 },
  needBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 13, paddingHorizontal: Spacing.xl, marginTop: Spacing.sm,
  },
  needBtnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md },
  needBack: { fontFamily: Fonts.bodyMedium, color: th.goldLight, fontSize: Fonts.size.sm, marginTop: Spacing.xs },

  eyebrow: { fontFamily: Fonts.bodySemibold, color: ACCENT.color, fontSize: Fonts.size.xs, letterSpacing: 2, marginBottom: 6 },
  h1: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.xxl, lineHeight: 34 },
  lead: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, lineHeight: 21, marginTop: Spacing.sm, marginBottom: Spacing.lg },

  uploadWrap: {
    borderWidth: 1, borderColor: th.borderStrong, borderStyle: 'dashed', borderRadius: Radius.md,
    backgroundColor: th.surface, alignItems: 'center', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg, gap: 6,
  },
  uploadIconRing: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: ACCENT.faint,
    borderWidth: 1, borderColor: ACCENT.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  uploadText: { fontFamily: Fonts.bodySemibold, color: th.text, fontSize: Fonts.size.md },
  uploadHint: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center' },
  uploadBtnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: th.goldSurface, borderRadius: Radius.pill, paddingVertical: 11, paddingHorizontal: Spacing.lg,
  },
  uploadBtnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.sm },
  uploadBtnAlt: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: th.surfaceSunken, borderWidth: 1, borderColor: ACCENT.soft, borderRadius: Radius.pill, paddingVertical: 11, paddingHorizontal: Spacing.lg,
  },
  uploadBtnAltText: { fontFamily: Fonts.bodySemibold, color: ACCENT.color, fontSize: Fonts.size.sm },
  preview: { width: '100%', height: 260, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border },
  changeLink: { fontFamily: Fonts.bodyMedium, color: ACCENT.color, fontSize: Fonts.size.sm, marginTop: Spacing.sm, alignSelf: 'center' },
  checkingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  checkingText: { fontFamily: Fonts.bodyMedium, color: th.textMuted, fontSize: Fonts.size.sm },

  notice: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: ACCENT.faint, borderWidth: 1, borderColor: ACCENT.soft, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.md,
  },
  noticeIcon: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: th.surface,
    borderWidth: 1, borderColor: ACCENT.soft, alignItems: 'center', justifyContent: 'center',
  },
  noticeTitle: { fontFamily: Fonts.bodySemibold, color: th.text, fontSize: Fonts.size.sm },
  noticeBody: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.xs, lineHeight: 18, marginTop: 2 },

  label: { fontFamily: Fonts.bodySemibold, color: th.textMuted, fontSize: Fonts.size.xs, letterSpacing: 1.5, marginBottom: Spacing.sm, marginTop: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.pill, backgroundColor: th.surfaceSunken,
    paddingVertical: 8, paddingHorizontal: Spacing.md,
  },
  chipActive: { backgroundColor: th.goldSurface, borderColor: th.goldSurface },
  chipText: { fontFamily: Fonts.bodyMedium, color: th.textMuted, fontSize: Fonts.size.sm },
  chipTextActive: { fontFamily: Fonts.bodySemibold, color: th.goldContrast },

  hintCard: { padding: Spacing.lg, marginTop: Spacing.lg },
  hintTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  hintTagText: { fontFamily: Fonts.bodyBold, color: '#FFFFFF', fontSize: 10, letterSpacing: 1.5 },
  hintLead: { fontFamily: Fonts.body, color: '#FFFFFF', fontSize: Fonts.size.md, lineHeight: 24 },

  lockedList: { gap: Spacing.sm },
  lockedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: th.surface, borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm,
    paddingVertical: 13, paddingHorizontal: Spacing.md, opacity: 0.85,
  },
  lockedText: { fontFamily: Fonts.bodyMedium, color: th.textMuted, fontSize: Fonts.size.sm, flex: 1, marginRight: Spacing.sm },

  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 15, marginTop: Spacing.lg,
  },
  unlockText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.6 },
  note: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18 },
  disclaimer: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 17, fontStyle: 'italic' },

  stepsCard: { backgroundColor: th.surface, borderRadius: Radius.md, padding: Spacing.lg, borderWidth: 1, borderColor: th.border, gap: Spacing.md, ...Depth.card },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: ACCENT.faint, borderWidth: 1, borderColor: ACCENT.soft, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: Fonts.bodyBold, color: ACCENT.color, fontSize: Fonts.size.xs },
  stepText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.sm, lineHeight: 20, flex: 1 },
});
