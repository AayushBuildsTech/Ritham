import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, Radius, Depth, Accents, AccentName, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { Icon, IconName } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';
import { TAB_BAR_HEIGHT } from './_layout';

type Category = { icon: IconName; accent: AccentName; title: string; desc: string };
const CATEGORIES_EN: Category[] = [
  { icon: 'beads', accent: 'saffron', title: 'Rudraksha', desc: 'Certified, energised beads and malas for daily practice and protection.' },
  { icon: 'diamond', accent: 'sapphire', title: 'Gemstone Bracelets', desc: 'Genuine crystal bracelets, chosen to balance and strengthen your chart.' },
  { icon: 'eye', accent: 'amethyst', title: 'Evil Eye', desc: 'Nazar-suraksha charms and bracelets to guard against negative energy.' },
];
const CATEGORIES_HI: Category[] = [
  { icon: 'beads', accent: 'saffron', title: 'रुद्राक्ष', desc: 'दैनिक साधना और सुरक्षा के लिए प्रमाणित, ऊर्जावान मनके और मालाएं।' },
  { icon: 'diamond', accent: 'sapphire', title: 'रत्न ब्रेसलेट', desc: 'आपकी कुंडली को संतुलित और सशक्त करने के लिए चुने गए असली क्रिस्टल ब्रेसलेट।' },
  { icon: 'eye', accent: 'amethyst', title: 'नज़र रक्षा', desc: 'नकारात्मक ऊर्जा से बचाव के लिए नज़र-सुरक्षा चार्म और ब्रेसलेट।' },
];

export default function StoreScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const CATEGORIES = isHindi ? CATEGORIES_HI : CATEGORIES_EN;
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {
        paddingTop: insets.top + Spacing.lg,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom,
      }]}
      showsVerticalScrollIndicator={false}
    >
      <Reveal index={0}>
        <View style={styles.hero}>
          <Text style={styles.brand}>RITHAM</Text>
          <Text style={styles.title}>{isHindi ? 'पवित्र स्टोर' : 'The Sacred Store'}</Text>
          <View style={styles.pill}><Text style={styles.pillText}>{isHindi ? 'जल्द आ रहा है' : 'COMING SOON'}</Text></View>
          <Text style={styles.subtitle}>
            {isHindi
              ? 'रुद्राक्ष, रत्न ब्रेसलेट और नज़र रक्षा चार्म का चुनिंदा संग्रह — प्रामाणिक, ऊर्जावान और आपकी कुंडली के अनुरूप। हम इसे अंतिम रूप दे रहे हैं।'
              : 'A curated collection of rudraksha, gemstone bracelets and evil-eye charms — authentic, energised and matched to your chart. We’re putting the finishing touches on it.'}
          </Text>
        </View>
      </Reveal>

      <Reveal index={1}>
        <Text style={styles.previewLabel}>{isHindi ? 'आगे क्या आ रहा है — एक झलक' : 'A GLIMPSE OF WHAT’S COMING'}</Text>
      </Reveal>

      {CATEGORIES.map((c, i) => (
        <Reveal key={c.title} index={2 + i}>
          <View style={styles.card}>
            <View style={[styles.cardIcon, { backgroundColor: Accents[c.accent].faint, borderWidth: 1, borderColor: Accents[c.accent].soft }]}>
              <Icon name={c.icon} size={22} color={Accents[c.accent].color} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{c.title}</Text>
              <Text style={styles.cardDesc}>{c.desc}</Text>
            </View>
          </View>
        </Reveal>
      ))}

      <Reveal index={5}>
        <Text style={styles.note}>
          {isHindi
            ? 'तब तक, अपनी कुंडली, दैनिक राशिफल देखें और हमारे AI ज्योतिषी से परामर्श करें।'
            : 'Until then, explore your Kundli, daily horoscopes and consult our AI astrologer.'}
        </Text>
      </Reveal>
      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { paddingHorizontal: Spacing.lg },

  hero: { alignItems: 'center', marginBottom: Spacing.xl },
  brand: { fontFamily: Fonts.bodySemibold, color: th.gold, fontSize: Fonts.size.xs, letterSpacing: 4, marginBottom: Spacing.sm },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.hero, color: th.text, textAlign: 'center' },
  pill: {
    backgroundColor: th.surface, borderColor: th.borderStrong, borderWidth: 1,
    borderRadius: Radius.pill, paddingVertical: 5, paddingHorizontal: Spacing.md, marginTop: Spacing.md,
  },
  pillText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.xs, letterSpacing: 2 },
  subtitle: {
    fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted, textAlign: 'center',
    lineHeight: 24, marginTop: Spacing.md, paddingHorizontal: Spacing.sm,
  },

  previewLabel: {
    fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.textDim, textAlign: 'center',
    letterSpacing: 2, marginBottom: Spacing.md,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md,
    padding: Spacing.lg, borderWidth: 1, borderColor: th.border, marginBottom: Spacing.md,
    ...Depth.card,
  },
  cardIcon: {
    width: 48, height: 48, borderRadius: Radius.sm,
    backgroundColor: th.goldFaint, alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.lg, color: th.goldLight, marginBottom: 2 },
  cardDesc: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 19 },

  note: {
    fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textDim, textAlign: 'center',
    lineHeight: 22, marginTop: Spacing.lg, paddingHorizontal: Spacing.sm,
  },
});
