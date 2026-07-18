import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { showAlert } from '../lib/dialog';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import {
  useActiveProfile, RELATION_LABEL, FAMILY_RELATIONS, FamilyMember,
} from '../context/ProfileContext';
import { Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Reveal';
import { ScreenHeader } from '../components/ScreenHeader';
import { SelectModal, Option } from '../components/SelectModal';

export default function FamilyScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { t, isHindi } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { members, activeId, loading, setActive, refresh } = useActiveProfile();
  const [pickRelation, setPickRelation] = useState(false);

  // Refresh whenever we return here (after adding/editing a member).
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const relationOpts: Option[] = FAMILY_RELATIONS.map((r) => ({
    label: RELATION_LABEL[r], value: r,
  }));

  function onSwitch(m: FamilyMember) {
    if (m.id !== activeId) { setActive(m.id); track('active_profile_switched'); }
  }

  function onAddRelation(relation: string) {
    setPickRelation(false);
    router.push({ pathname: '/profile', params: { new: '1', relation } });
  }

  function confirmDelete(m: FamilyMember) {
    showAlert(
      isHindi ? `${m.name} को हटाएं?` : `Remove ${m.name}?`,
      isHindi ? 'यह उनका जन्म विवरण और कुंडली हटा देगा। इसे वापस नहीं लाया जा सकता।' : 'This deletes their birth details and chart. This cannot be undone.',
      [
        { text: isHindi ? 'रद्द करें' : 'Cancel', style: 'cancel' },
        {
          text: isHindi ? 'हटाएं' : 'Remove', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('profiles').delete().eq('id', m.id);
            if (error) { showAlert(isHindi ? 'हटाया नहीं जा सका' : 'Could not remove', error.message); return; }
            track('family_member_removed');
            if (activeId === m.id) {
              const self = members.find((x) => x.relation === 'self');
              if (self) setActive(self.id);
            }
            await refresh();
          },
        },
      ],
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>;
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'परिवार' : 'Family'} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0}>
          <Text style={styles.eyebrow}>{isHindi ? 'एक खाता, पूरा परिवार' : 'ONE ACCOUNT, THE WHOLE FAMILY'}</Text>
          <Text style={styles.sub}>
            {isHindi
              ? 'अपने प्रियजनों को जोड़ें — हर किसी को अपनी कुंडली, राशिफल, चैट और रिपोर्ट मिलती है। किसी व्यक्ति को पूरे ऐप में सक्रिय करने के लिए टैप करें।'
              : 'Add the people you care about — each gets their own Kundli, horoscope, chat and reports. Tap a person to make them active across the app.'}
          </Text>
        </Reveal>

        {members.map((m, i) => {
          const isActive = m.id === activeId;
          const isSelf = m.relation === 'self';
          return (
            <Reveal key={m.id} index={i + 1}>
              <Pressable
                style={[styles.card, isActive && styles.cardActive]}
                onPress={() => onSwitch(m)}
                android_ripple={{ color: th.goldFaint }}
              >
                <View style={styles.avatar}>
                  <Icon name={isActive ? 'moon' : 'profile'} size={22} color={th.gold} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={2}>{m.name}</Text>
                    {isActive && <Text style={styles.activePill}>{isHindi ? 'सक्रिय' : 'ACTIVE'}</Text>}
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    {isSelf ? (isHindi ? 'आप' : 'You') : RELATION_LABEL[m.relation] ?? (isHindi ? 'परिवार' : 'Family')}
                    {m.moonSign ? ` · ${isHindi ? 'चंद्र' : 'Moon in'} ${m.moonSign}` : (isHindi ? ' · कुंडली लंबित' : ' · Kundli pending')}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  style={styles.iconBtn}
                  onPress={() => router.push({ pathname: '/profile', params: { id: m.id } })}
                  android_ripple={{ color: th.goldFaint, borderless: true, radius: 20 }}
                >
                  <Icon name="chevron" size={20} color={th.textDim} />
                </Pressable>
                {!isSelf && (
                  <Pressable
                    hitSlop={8}
                    style={styles.iconBtn}
                    onPress={() => confirmDelete(m)}
                    android_ripple={{ color: th.goldFaint, borderless: true, radius: 20 }}
                  >
                    <Icon name="trash" size={17} color={th.textDim} />
                  </Pressable>
                )}
              </Pressable>
            </Reveal>
          );
        })}

        <Reveal index={members.length + 1}>
          <Pressable
            style={styles.addBtn}
            onPress={() => setPickRelation(true)}
            android_ripple={{ color: th.goldDeep }}
          >
            <Icon name="plus" size={18} color={th.goldContrast} />
            <Text style={styles.addText}>{isHindi ? 'परिवार सदस्य जोड़ें' : 'Add a family member'}</Text>
          </Pressable>
        </Reveal>

        <Reveal index={members.length + 2}>
          <Text style={styles.note}>
            {isHindi
              ? 'आपके प्रश्न और समय पैक आपके पूरे परिवार में साझा होते हैं — सभी की रीडिंग के लिए एक ही वॉलेट।'
              : 'Your question and time packs are shared across everyone in your family — one wallet for all their readings.'}
          </Text>
        </Reveal>
      </ScrollView>

      <SelectModal
        visible={pickRelation}
        title={isHindi ? 'आप किसे जोड़ रहे हैं?' : 'Who are you adding?'}
        options={relationOpts}
        onSelect={onAddRelation}
        onClose={() => setPickRelation(false)}
      />
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, backgroundColor: th.canvas, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg },

  eyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2.5, marginBottom: 6 },
  sub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 20, marginBottom: Spacing.lg },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border, marginBottom: Spacing.sm, ...Depth.card,
  },
  cardActive: { borderColor: th.borderStrong, backgroundColor: th.goldFaint },
  avatar: {
    width: 46, height: 46, borderRadius: Radius.pill, backgroundColor: th.goldFaint,
    borderWidth: 1, borderColor: th.border, alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.lg, color: th.text, flexShrink: 1 },
  activePill: {
    fontFamily: Fonts.bodyBold, color: th.goldContrast, backgroundColor: th.goldSurface, fontSize: 9,
    letterSpacing: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden',
  },
  meta: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: 3 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 15, marginTop: Spacing.md,
  },
  addText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },

  note: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, lineHeight: 17, textAlign: 'center', marginTop: Spacing.lg },
});
