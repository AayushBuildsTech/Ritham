import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getRetrograde, RetrogradeStatus } from '../lib/kundliService';
import { track } from '../lib/analytics';
import { SIGNS } from '../lib/ephemeris';
import {
  RETRO_MEANING, PLANET_LABEL, PLANET_THEME, RetroPlanet,
  RETRO_MEANING_HI, PLANET_LABEL_HI, PLANET_THEME_HI,
} from '../config/retrogradeMeanings';
import { Fonts, Spacing, Radius, Accents, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { HeroBanner } from '../components/HeroBanner';
import { FEATURE_BANNER } from '../constants/appArt';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso: string, year = false) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MON[d.getMonth()]}${year ? ' ' + d.getFullYear() : ''}`;
};
// whole-sign house of a transiting sign from the user's Lagna
const houseFrom = (lagna: string, si: number) => {
  const li = SIGNS.indexOf(lagna);
  return li < 0 ? 0 : ((si - li + 12) % 12) + 1;
};
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

export default function RetrogradeScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<RetrogradeStatus | null>(null);
  const [lagna, setLagna] = useState<string | null>(null);

  useEffect(() => {
    track('retrograde_tracker_viewed');
    (async () => {
      try {
        const res = await getRetrograde();
        setData(res);
        // optional personalization: read the user's Lagna from their stored chart
        if (profileId) {
          const { data: p } = await supabase.from('profiles').select('kundli_chart').eq('id', profileId).maybeSingle();
          const k = p?.kundli_chart;
          if (k?.lagna) { setLagna(k.lagna); }
        }
        setState('ready');
      } catch { setState('error'); }
    })();
  }, [profileId]);

  function openChat() {
    track('retrograde_chat_hook_clicked');
    router.push('/(tabs)/chat');
  }

  const current = data?.current ?? [];

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'वक्री ग्रह ट्रैकर' : 'Retrograde (Vakri) Tracker'} onBack={() => router.back()} />

      {state === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>
      ) : state === 'error' ? (
        <View style={styles.center}><Text style={styles.errorText}>{isHindi ? 'अभी आकाश नहीं पढ़ा जा सका। कृपया फिर कोशिश करें।' : 'Couldn’t read the sky right now. Please try again.'}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <HeroBanner source={FEATURE_BANNER.vakri} style={{ marginBottom: Spacing.lg }} />
          <Text style={styles.sectionLabel}>{isHindi ? 'अभी' : 'RIGHT NOW'}</Text>

          {current.length === 0 ? (
            <View style={styles.calmCard}>
              <Icon name="check" size={20} color={Accents.emerald.color} />
              <Text style={styles.calmText}>{isHindi ? 'अभी कोई ग्रह वक्री नहीं है — आकाश सीधी गति में है।' : 'No planets are retrograde right now — the skies are moving direct.'}</Text>
            </View>
          ) : (
            current.map((c) => {
              const house = lagna ? houseFrom(lagna, c.signIndex) : 0;
              return (
                <View key={c.planet} style={styles.retroCard}>
                  <View style={styles.retroHead}>
                    <Text style={styles.retroTitle}>{(isHindi ? PLANET_LABEL_HI : PLANET_LABEL)[c.planet]}</Text>
                    <View style={styles.badge}><Text style={styles.badgeText}>{isHindi ? 'वक्री' : 'Vakri'}</Text></View>
                  </View>
                  <Text style={styles.retroDates}>{`${fmt(c.start)} – ${fmt(c.end, true)}`}</Text>
                  <Text style={styles.retroTheme}>{(isHindi ? PLANET_THEME_HI : PLANET_THEME)[c.planet]}</Text>
                  {house > 0 && (
                    <Text style={styles.personal}>
                      {isHindi
                        ? <>आपके लिए, {PLANET_LABEL_HI[c.planet]} आपके <Text style={styles.personalEm}>{house}वें भाव</Text> में वक्री है।</>
                        : <>For you, {c.planet} is retrograde in your <Text style={styles.personalEm}>{ord(house)} house</Text>.</>}
                    </Text>
                  )}
                  <Text style={styles.retroBody}>{(isHindi ? RETRO_MEANING_HI : RETRO_MEANING)[c.planet]}</Text>
                </View>
              );
            })
          )}

          {data?.upcoming && data.upcoming.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>{isHindi ? 'आगे' : 'COMING UP'}</Text>
              <View style={styles.group}>
                {data.upcoming.map((u, i) => (
                  <View key={u.planet} style={[styles.row, i < data.upcoming.length - 1 && styles.rowBorder]}>
                    <Text style={styles.rowLabel}>{(isHindi ? PLANET_LABEL_HI : PLANET_LABEL)[u.planet as RetroPlanet]}</Text>
                    <Text style={styles.rowValue}>{isHindi ? `${fmt(u.start, true)} से` : `from ${fmt(u.start, true)}`}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={styles.hookCard}>
            <Text style={styles.hookText}>
              {isHindi
                ? <>यह आप पर <Text style={styles.hookEm}>व्यक्तिगत रूप से</Text> कैसे असर डालता है?</>
                : <>Curious how this affects <Text style={styles.hookEm}>you</Text> specifically?</>}
            </Text>
            <Pressable style={styles.hookBtn} onPress={openChat} android_ripple={{ color: th.goldDeep }}>
              <Text style={styles.hookBtnText}>{isHindi ? 'अपने ज्योतिषी से पूछें' : 'Ask your astrologer'}</Text>
              <Icon name="arrowRight" size={15} color={th.goldContrast} />
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            {isHindi
              ? 'वक्री अवधि ग्रहों की स्थिति से गणना की जाती है और सभी के लिए समान होती है। मार्गदर्शन और चिंतन के लिए, पेशेवर सलाह नहीं।'
              : 'Retrograde periods are computed from planetary positions and are the same for everyone. For guidance and reflection, not professional advice.'}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, textAlign: 'center' },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  sectionLabel: { fontFamily: Fonts.bodySemibold, color: Accents.sapphire.color, fontSize: Fonts.size.xs, letterSpacing: 2, marginBottom: Spacing.sm, marginTop: Spacing.lg },

  calmCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border, padding: Spacing.lg,
  },
  calmText: { flex: 1, fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, lineHeight: 22 },

  retroCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
  retroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  retroTitle: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.xl },
  badge: { backgroundColor: Accents.sapphire.faint, borderWidth: 1, borderColor: Accents.sapphire.soft, borderRadius: Radius.pill, paddingVertical: 3, paddingHorizontal: 10 },
  badgeText: { fontFamily: Fonts.bodySemibold, color: Accents.sapphire.color, fontSize: Fonts.size.xs, letterSpacing: 0.5 },
  retroDates: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.md, marginTop: 4 },
  retroTheme: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, marginTop: 2 },
  personal: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.sm, marginTop: Spacing.sm, lineHeight: 21 },
  personalEm: { fontFamily: Fonts.bodySemibold, color: th.goldLight },
  retroBody: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, lineHeight: 23, marginTop: Spacing.sm },

  group: { backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border, paddingHorizontal: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, gap: Spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: th.divider },
  rowLabel: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md },
  rowValue: { fontFamily: Fonts.bodySemibold, color: th.text, fontSize: Fonts.size.md },

  hookCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.lg, marginTop: Spacing.xl, alignItems: 'center', gap: Spacing.md,
  },
  hookText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  hookEm: { fontFamily: Fonts.bodySemibold, color: th.goldLight },
  hookBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 12, paddingHorizontal: Spacing.xl },
  hookBtnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md },

  footnote: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, lineHeight: 17, textAlign: 'center', marginTop: Spacing.lg },
});
