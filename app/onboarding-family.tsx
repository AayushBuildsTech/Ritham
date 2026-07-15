import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useActiveProfile, RELATION_LABEL, FAMILY_RELATIONS,
} from '../context/ProfileContext';
import { Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Reveal';
import { SelectModal, Option } from '../components/SelectModal';

// Shown ONCE, right after a new user creates their own Kundli (profile.tsx →
// wasNew). Surfaces the family feature at onboarding so it isn't buried, while
// staying fully skippable. Adding a member routes to the birth-details form and
// returns here (so several can be added); Continue/Skip goes to Home.
export default function OnboardingFamilyScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { members, refresh } = useActiveProfile();
  const [pick, setPick] = useState(false);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const family = members.filter((m) => m.relation !== 'self');
  const selfName = members.find((m) => m.relation === 'self')?.name?.trim().split(/\s+/)[0];

  const relationOpts: Option[] = FAMILY_RELATIONS.map((r) => ({ label: RELATION_LABEL[r], value: r }));
  const onAdd = (relation: string) => {
    setPick(false);
    router.push({ pathname: '/profile', params: { new: '1', relation } });
  };
  const finish = () => router.replace('/(tabs)');

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, {
          paddingTop: insets.top + Spacing.xxl,
          paddingBottom: insets.bottom + Spacing.xl,
        }]}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0}>
          <View style={styles.crest}><Icon name="family" size={28} color={th.gold} /></View>
          <Text style={styles.eyebrow}>{selfName ? (isHindi ? `आप तैयार हैं, ${selfName}` : `YOU’RE ALL SET, ${selfName.toUpperCase()}`) : (isHindi ? 'आप तैयार हैं' : 'YOU’RE ALL SET')}</Text>
          <Text style={styles.h1}>{isHindi ? 'अपना परिवार जोड़ें?' : 'Add your family?'}</Text>
          <Text style={styles.sub}>
            {isHindi
              ? 'रिदम आपके पूरे परिवार का मार्गदर्शन कर सकता है। प्रियजनों को जोड़ें ताकि उन्हें अपनी कुंडली, दैनिक राशिफल, चैट और रिपोर्ट मिलें — और आपके प्रश्न व समय पैक सभी के लिए काम करते हैं, एक साझा वॉलेट।'
              : 'Ritham can guide your whole family. Add loved ones to get their Kundli, daily horoscope, chat and reports — and your question & time packs work for everyone, one shared wallet.'}
          </Text>
        </Reveal>

        {family.length > 0 && (
          <Reveal index={1}>
            <Text style={styles.addedLabel}>{isHindi ? 'जोड़े गए' : 'ADDED'}</Text>
            {family.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.avatar}><Icon name="profile" size={18} color={th.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName} numberOfLines={2}>{m.name}</Text>
                  <Text style={styles.memberMeta} numberOfLines={1}>
                    {RELATION_LABEL[m.relation] ?? (isHindi ? 'परिवार' : 'Family')}
                    {m.moonSign ? ` · ${isHindi ? 'चंद्र' : 'Moon in'} ${m.moonSign}` : ''}
                  </Text>
                </View>
                <Icon name="check" size={18} color={th.gold} />
              </View>
            ))}
          </Reveal>
        )}

        <Reveal index={2}>
          <Pressable
            style={styles.addBtn}
            onPress={() => setPick(true)}
            android_ripple={{ color: th.goldDeep }}
          >
            <Icon name="plus" size={18} color={th.goldContrast} />
            <Text style={styles.addText}>
              {family.length > 0 ? (isHindi ? 'एक और सदस्य जोड़ें' : 'Add another family member') : (isHindi ? 'परिवार सदस्य जोड़ें' : 'Add a family member')}
            </Text>
          </Pressable>

          <Pressable style={styles.skipBtn} onPress={finish} android_ripple={{ color: th.goldFaint }}>
            <Text style={styles.skipText}>
              {family.length > 0 ? (isHindi ? 'रिदम पर जारी रखें' : 'Continue to Ritham') : (isHindi ? 'अभी छोड़ें' : 'Skip for now')}
            </Text>
          </Pressable>
        </Reveal>

        <Reveal index={3}>
          <Text style={styles.note}>{isHindi ? 'आप बाद में कभी भी होम या सेटिंग्स से परिवार जोड़ या प्रबंधित कर सकते हैं।' : 'You can always add or manage family later from Home or Settings.'}</Text>
        </Reveal>
      </ScrollView>

      <SelectModal
        visible={pick}
        title={isHindi ? 'आप किसे जोड़ रहे हैं?' : 'Who are you adding?'}
        options={relationOpts}
        onSelect={onAdd}
        onClose={() => setPick(false)}
      />
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { paddingHorizontal: Spacing.lg },

  crest: {
    width: 64, height: 64, borderRadius: Radius.pill, backgroundColor: th.goldFaint,
    borderWidth: 1, borderColor: th.border, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  eyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2.5, marginBottom: 6 },
  h1: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.hero, color: th.text, marginBottom: Spacing.sm },
  sub: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted, lineHeight: 24, marginBottom: Spacing.xl },

  addedLabel: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.textMuted, letterSpacing: 2, marginBottom: Spacing.sm },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border, marginBottom: Spacing.sm, ...Depth.card,
  },
  avatar: {
    width: 40, height: 40, borderRadius: Radius.pill, backgroundColor: th.goldFaint,
    borderWidth: 1, borderColor: th.border, alignItems: 'center', justifyContent: 'center',
  },
  memberName: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.text },
  memberMeta: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: 2 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 15, marginTop: Spacing.md,
  },
  addText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },

  skipBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginTop: Spacing.sm },
  skipText: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.md },

  note: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, textAlign: 'center', marginTop: Spacing.lg, lineHeight: 17 },
});
