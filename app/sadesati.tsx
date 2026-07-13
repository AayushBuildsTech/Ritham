import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getSadeSati, SadeSatiStatus, getKundli, ProfileRow } from '../lib/kundliService';
import { track } from '../lib/analytics';
import {
  PHASE_MEANING, PHASE_HOUSE, NOT_IN_SADE_SATI, SADE_SATI_INTRO,
  PHASE_MEANING_HI, PHASE_HOUSE_HI, NOT_IN_SADE_SATI_HI, SADE_SATI_INTRO_HI,
} from '../config/sadeSatiPhases';
import { Fonts, Spacing, Radius, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { hiSign } from '../lib/astroHindi';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { SadeSatiTimeline } from '../components/SadeSatiTimeline';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtMY = (iso?: string) => { if (!iso) return '—'; const d = new Date(iso); return `${MON[d.getMonth()]} ${d.getFullYear()}`; };

export default function SadeSatiScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<SadeSatiStatus | null>(null);

  useEffect(() => {
    track('sadesati_tracker_viewed');
    (async () => {
      try {
        if (!profileId) { setState('error'); return; }
        const { data: p } = await supabase.from('profiles').select('*').eq('id', profileId).maybeSingle();
        if (!p) { setState('error'); return; }
        let moon: string | undefined = p.kundli_chart?.moon_sign;
        // self-heal: if the stored chart is missing its Moon sign, re-fetch via kundliService
        if (!moon) { try { moon = (await getKundli(p as ProfileRow)).moon_sign; } catch { /* ignore */ } }
        if (!moon) { setState('error'); return; }
        setData(await getSadeSati(moon));
        setState('ready');
      } catch { setState('error'); }
    })();
  }, [profileId]);

  function openChat() {
    track('sadesati_chat_hook_clicked');
    router.push('/(tabs)/chat');
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'साढ़े साती ट्रैकर' : 'Sade Sati Tracker'} onBack={() => router.back()} />

      {state === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>
      ) : state === 'error' || !data ? (
        <View style={styles.center}><Text style={styles.errorText}>{isHindi ? 'इसे पढ़ने के लिए हमें आपकी कुंडली चाहिए। कृपया पहले अपनी कुंडली खोलें, फिर कोशिश करें।' : 'We need your Kundli to read this. Please open your chart first, then try again.'}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.moonLine}>{isHindi ? `चंद्रमा ${hiSign(data.moonSign)} में` : `Chandra (Moon) in ${data.moonSign}`}</Text>
          <Text style={styles.intro}>{isHindi ? SADE_SATI_INTRO_HI : SADE_SATI_INTRO}</Text>

          {data.active && data.phase ? (
            <>
              <View style={styles.card}>
                <View style={styles.phaseHead}>
                  <Text style={styles.phaseNow}>{isHindi ? `चरण ${data.phase} / 3` : `Phase ${data.phase} of 3`}</Text>
                  <Text style={styles.phaseHouse}>{(isHindi ? PHASE_HOUSE_HI : PHASE_HOUSE)[data.phase]}</Text>
                </View>

                <SadeSatiTimeline phase={data.phase} progress={data.progress ?? 0} />

                <View style={styles.dateRow}>
                  <View>
                    <Text style={styles.dateCap}>{isHindi ? 'यह चरण' : 'THIS PHASE'}</Text>
                    <Text style={styles.dateVal}>{fmtMY(data.phaseStart)} – {fmtMY(data.phaseEnd)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.dateCap}>{isHindi ? 'पूर्ण चक्र समाप्त' : 'FULL CYCLE ENDS'}</Text>
                    <Text style={styles.dateVal}>{fmtMY(data.fullEnd)}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.body}>{(isHindi ? PHASE_MEANING_HI : PHASE_MEANING)[data.phase]}</Text>
            </>
          ) : (
            <View style={styles.calmCard}>
              <Icon name="check" size={20} color={th.goldLight} />
              <Text style={styles.calmText}>{isHindi ? NOT_IN_SADE_SATI_HI : NOT_IN_SADE_SATI}</Text>
              {data.nextStart && (
                <Text style={styles.nextLine}>{isHindi ? `अगली बार लगभग ${fmtMY(data.nextStart)} में शुरू होने की संभावना।` : `Next expected to begin around ${fmtMY(data.nextStart)}.`}</Text>
              )}
            </View>
          )}

          <View style={styles.hookCard}>
            <Text style={styles.hookText}>
              {isHindi
                ? <>समझना चाहते हैं कि इसका <Text style={styles.hookEm}>आपकी</Text> स्थिति के लिए क्या अर्थ है?</>
                : <>Want to understand what this means for <Text style={styles.hookEm}>your</Text> situation?</>}
            </Text>
            <Pressable style={styles.hookBtn} onPress={openChat} android_ripple={{ color: th.goldDeep }}>
              <Text style={styles.hookBtnText}>{isHindi ? 'अपने ज्योतिषी से पूछें' : 'Ask your astrologer'}</Text>
              <Icon name="arrowRight" size={15} color={th.goldContrast} />
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            {isHindi
              ? 'आपके जन्म के चंद्रमा के चारों ओर शनि के गोचर से गणना। परिवर्तन और विकास की अवधि — मार्गदर्शन और चिंतन के लिए, पेशेवर सलाह नहीं।'
              : 'Computed from Shani’s transit around your natal Chandra. A period of change and growth — for guidance and reflection, not professional advice.'}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  moonLine: { fontFamily: Fonts.displayBold, color: th.goldLight, fontSize: Fonts.size.xl },
  intro: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, lineHeight: 21, marginTop: Spacing.sm },

  card: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.lg, marginTop: Spacing.lg,
  },
  phaseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phaseNow: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.xxl },
  phaseHouse: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.xs, flexShrink: 1, textAlign: 'right', maxWidth: '55%' },

  dateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xl },
  dateCap: { fontFamily: Fonts.bodySemibold, color: th.textDim, fontSize: 10, letterSpacing: 1.5 },
  dateVal: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.md, marginTop: 3 },

  body: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, lineHeight: 24, marginTop: Spacing.lg },

  calmCard: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.border,
    padding: Spacing.lg, marginTop: Spacing.lg, alignItems: 'center', gap: Spacing.sm,
  },
  calmText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, lineHeight: 23, textAlign: 'center' },
  nextLine: { fontFamily: Fonts.bodySemibold, color: th.goldLight, fontSize: Fonts.size.sm, textAlign: 'center' },

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
