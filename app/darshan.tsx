import { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, ImageBackground } from 'react-native';
import { showAlert } from '../lib/dialog';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { TEMPLES, Temple, TEMPLE_HI } from '../config/temples';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Reveal } from '../components/Reveal';
import { TEMPLE_IMG } from '../constants/appArt';

// Bottom-weighted dark scrim so the temple name stays legible over the art.
const SCRIM = ['rgba(6,6,12,0)', 'rgba(7,7,15,0.45)', 'rgba(6,6,12,0.9)'] as const;

export default function DarshanScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const router = useRouter();

  useEffect(() => { track('darshan_opened'); }, []);

  async function watch(t: Temple) {
    track('darshan_temple_clicked', { temple: t.id });
    // Deep-link OUT to the temple's official live-darshan page (external YouTube
    // app / browser). We never embed or host the stream in v1.
    try {
      await Linking.openURL(t.streamUrl);
    } catch {
      showAlert(isHindi ? 'स्ट्रीम नहीं खुल सकी' : 'Couldn’t open the stream', isHindi ? 'कृपया फिर कोशिश करें, या मंदिर का आधिकारिक चैनल/वेबसाइट सीधे खोलें।' : 'Please try again, or open the temple’s official channel/website directly.');
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'लाइव दर्शन' : 'Live Darshan'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          {isHindi
            ? 'प्रमुख मंदिरों से लाइव आरती और दर्शन देखें, उनके आधिकारिक YouTube चैनलों पर प्रसारित।'
            : 'Watch live aarti & darshan from major temples, streamed on their official YouTube channels.'}
        </Text>

        {TEMPLES.map((t, i) => {
          const hi = isHindi ? TEMPLE_HI[t.id] : null;
          return (
          <Reveal key={t.id} index={i}>
            <View style={styles.card}>
              {TEMPLE_IMG[t.id] ? (
                <ImageBackground source={TEMPLE_IMG[t.id]} style={styles.cardBanner} resizeMode="cover">
                  <LinearGradient colors={SCRIM} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
                  <View style={styles.bannerOverlay}>
                    <Text style={styles.name}>{hi?.name ?? t.name}</Text>
                    <View style={styles.locRow}>
                      <Icon name="temple" size={13} color="rgba(255,255,255,0.9)" />
                      <Text style={styles.location}>{hi?.location ?? t.location}</Text>
                    </View>
                  </View>
                </ImageBackground>
              ) : (
                <View style={styles.cardHead}>
                  <View style={styles.icon}><Icon name="temple" size={24} color={Accents.ruby.color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nameFallback}>{hi?.name ?? t.name}</Text>
                    <Text style={styles.locationFallback}>{hi?.location ?? t.location}</Text>
                  </View>
                </View>
              )}

              <View style={styles.cardBody}>
                <Text style={styles.deity}>{hi?.deity ?? t.deity}</Text>
                <View style={styles.timingRow}>
                  <Icon name="clock" size={14} color={th.textMuted} />
                  <Text style={styles.timings}>{hi?.timings ?? t.timings}</Text>
                </View>

                <Pressable style={styles.watchBtn} onPress={() => watch(t)} android_ripple={{ color: th.goldDeep }}>
                  <Text style={styles.watchText}>{isHindi ? 'लाइव दर्शन देखें' : 'Watch Live Darshan'}</Text>
                  <Icon name="external" size={15} color={th.goldContrast} />
                </Pressable>
                <Text style={styles.unverified}>
                  {isHindi
                    ? `${t.source === 'youtube' ? 'आधिकारिक YouTube चैनल' : 'आधिकारिक मंदिर वेबसाइट'} खोलता है`
                    : `Opens the ${t.source === 'youtube' ? 'official YouTube channel' : 'official temple website'}`}
                </Text>
              </View>
            </View>
          </Reveal>
          );
        })}

        {/* Legal / safety disclaimer */}
        <Text style={styles.disclaimer}>
          {isHindi
            ? 'लाइव दर्शन स्ट्रीम संबंधित मंदिरों के आधिकारिक YouTube चैनलों या वेबसाइटों द्वारा प्रदान की जाती हैं। रिदम इस सामग्री का स्वामी नहीं है और न ही इसे होस्ट करता है, और किसी मंदिर से संबद्ध या समर्थित नहीं है। "लाइव दर्शन देखें" टैप करने पर आधिकारिक स्रोत खुलता है।'
            : 'Live darshan streams are provided by the respective temples’ official YouTube channels or websites. Ritham does not own or host this content, and is not affiliated with or endorsed by any temple. Tapping “Watch Live Darshan” opens the official source.'}
        </Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  lead: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, lineHeight: 22, marginBottom: Spacing.md },

  card: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.border,
    overflow: 'hidden', marginBottom: Spacing.md, ...Depth.card,
  },
  cardBanner: { width: '100%', aspectRatio: 16 / 9, justifyContent: 'flex-end' },
  bannerOverlay: { padding: Spacing.md },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  cardBody: { padding: Spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, paddingBottom: 0 },
  icon: {
    width: 52, height: 52, borderRadius: Radius.sm,
    backgroundColor: Accents.ruby.faint, borderWidth: 1, borderColor: Accents.ruby.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontFamily: Fonts.displayBold, color: '#FFFFFF', fontSize: Fonts.size.xl, letterSpacing: 0.2 },
  location: { fontFamily: Fonts.body, color: 'rgba(255,255,255,0.85)', fontSize: Fonts.size.sm },
  nameFallback: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.lg },
  locationFallback: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, marginTop: 2 },
  deity: { fontFamily: Fonts.bodyMedium, color: th.goldLight, fontSize: Fonts.size.sm },
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  timings: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm },

  watchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 13, marginTop: Spacing.md,
  },
  watchText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },
  unverified: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm },

  disclaimer: {
    fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, lineHeight: 17,
    textAlign: 'center', marginTop: Spacing.lg, paddingHorizontal: Spacing.sm,
  },
});
