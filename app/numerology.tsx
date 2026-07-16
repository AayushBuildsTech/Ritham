import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getNumerology } from '../lib/numerologyService';
import { Numerology, NumerologyNumber } from '../lib/numerology';
import { meaningFor, meaningForHi } from '../constants/numerology';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Reveal } from '../components/Reveal';
import { HeroBanner } from '../components/HeroBanner';

export default function NumerologyScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<Numerology | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    track('numerology_viewed');
    (async () => {
      if (!profileId) { setState('error'); return; }
      // Don't select `numerology` (added by migration 010) — a missing column would
      // fail the whole query. It's recomputed instantly and persisted best-effort.
      const { data: profile } = await supabase
        .from('profiles').select('id, name, dob')
        .eq('id', profileId).maybeSingle();
      if (!profile) { setState('error'); return; }
      setName(profile.name);
      const num = await getNumerology({ id: profile.id, name: profile.name, dob: profile.dob });
      setData(num);
      setState('ready');
    })();
  }, [profileId]);

  function openChat() {
    track('home_hook_clicked', { source: 'numerology' });
    router.push('/(tabs)/chat');
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'अंक ज्योतिष' : 'Numerology'} onBack={() => router.back()} />

      {state === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>
      ) : state === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{isHindi ? 'अभी आपका अंक ज्योतिष लोड नहीं हो सका।' : 'Couldn’t load your numerology right now.'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <HeroBanner
            source={require('../assets/numerology/numerology-hero.webp')}
            aspectRatio={1}
            vignette
            style={{ width: '82%', alignSelf: 'center', marginBottom: Spacing.sm }}
          />
          <Text style={styles.intro}>
            {isHindi
              ? `${name?.trim().split(/\s+/)[0]}, आपके मूल अंक आपके नाम और जन्म तिथि से निकाले गए हैं।`
              : `${name?.trim().split(/\s+/)[0]}, your core numbers are drawn from your name and date of birth.`}
          </Text>

          {data ? <Reveal index={0}><NumberCard kind="Life Path" n={data.life_path} /></Reveal> : null}
          {data ? <Reveal index={1}><NumberCard kind="Expression" n={data.expression} /></Reveal> : null}

          {/* Soft hook into Chat (gentle, optional) */}
          <Reveal index={2}>
            <View style={styles.hookCard}>
              <Text style={styles.hookText}>
                {isHindi
                  ? <>देखें कि आपकी <Text style={styles.hookEm}>जन्म कुंडली</Text> इस सब को कैसे आकार देती है।</>
                  : <>See how your <Text style={styles.hookEm}>birth chart</Text> shapes all of this.</>}
              </Text>
              <Pressable style={styles.hookBtn} onPress={openChat} android_ripple={{ color: th.goldDeep }}>
                <Text style={styles.hookBtnText}>{isHindi ? 'बातचीत शुरू करें' : 'Start a chat'}</Text>
                <Icon name="arrowRight" size={15} color={th.goldContrast} />
              </Pressable>
            </View>
          </Reveal>

          <Text style={styles.footnote}>
            {isHindi
              ? 'अंक आपके नाम और जन्म तिथि से गणना किए जाते हैं। मार्गदर्शन और चिंतन के लिए, पेशेवर सलाह नहीं।'
              : 'Numbers are computed from your name and birth date. For guidance and reflection, not professional advice.'}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function NumberCard({ kind, n }: { kind: 'Life Path' | 'Expression'; n: NumerologyNumber }) {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const meaning = isHindi ? meaningForHi(n.number) : meaningFor(n.number);
  const kindLabel = isHindi
    ? (kind === 'Life Path' ? 'जीवन पथ' : 'अभिव्यक्ति')
    : kind;
  const masterSuffix = n.is_master ? (isHindi ? ' · मास्टर नंबर' : ' · Master Number') : '';
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.badge}>
          <Text style={styles.badgeNum}>{n.number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kind}>{kindLabel}{masterSuffix}</Text>
          <Text style={styles.cardTitle}>{meaning?.title ?? '—'}</Text>
          {meaning ? <Text style={styles.keyword}>{meaning.keyword}</Text> : null}
        </View>
      </View>
      {meaning ? (
        <Text style={styles.body}>{kind === 'Life Path' ? meaning.life_path : meaning.expression}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, textAlign: 'center' },

  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  intro: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, lineHeight: 22, marginBottom: Spacing.lg },

  card: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.border,
    padding: Spacing.lg, marginBottom: Spacing.md, ...Depth.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  badge: {
    width: 60, height: 60, borderRadius: Radius.pill, backgroundColor: Accents.amethyst.faint,
    borderWidth: 1, borderColor: Accents.amethyst.soft, alignItems: 'center', justifyContent: 'center',
  },
  badgeNum: { fontFamily: Fonts.displayBold, color: Accents.amethyst.color, fontSize: Fonts.size.xxl },
  kind: { fontFamily: Fonts.bodySemibold, color: Accents.amethyst.color, fontSize: Fonts.size.xs, letterSpacing: 1.5, textTransform: 'uppercase' },
  cardTitle: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.xl, marginTop: 2 },
  keyword: { fontFamily: Fonts.bodyMedium, color: th.goldLight, fontSize: Fonts.size.sm, marginTop: 2 },
  body: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, lineHeight: 24 },

  hookCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.lg, marginTop: Spacing.lg, alignItems: 'center', gap: Spacing.md,
  },
  hookText: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  hookEm: { fontFamily: Fonts.bodySemibold, color: th.goldLight },
  hookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 12, paddingHorizontal: Spacing.xl,
  },
  hookBtnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md },

  footnote: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, lineHeight: 17, textAlign: 'center', marginTop: Spacing.lg },
});
