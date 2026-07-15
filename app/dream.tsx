import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getPanchang, Panchang } from '../lib/panchangService';
import {
  DreamSymbol, DreamCategory, DREAM_CATEGORIES, PRAHARS,
  searchDreams, dreamsInCategory, findPrahar,
} from '../constants/dreams';
import { interpretDream, DreamReading } from '../lib/dreamOracle';
import { track } from '../lib/analytics';
import { Fonts, Spacing, Radius, Depth, Accents, AccentName, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Reveal } from '../components/Reveal';

// Dream feature (Swapna Shastra) — a FREE, rule-based dream oracle. The omen
// comes from a fixed traditional dictionary (constants/dreams.ts); the timing
// from the prahar (quarter of night) it was seen in; and the day's backdrop
// from the Panchang the app already fetches. No AI, no extra provider cost.
//
// UX: pick a THEME (6 cards) → pick a SYMBOL from a short, scannable list, or
// search across everything. Selecting a symbol replaces the picker with the
// reading, keeping the flow calm and focused.
const NATURE_ACCENT: Record<DreamSymbol['nature'], AccentName> = {
  auspicious: 'emerald',
  caution: 'saffron',
  neutral: 'sapphire',
};

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = 12;
const CARD_W = (SCREEN_W - Spacing.lg * 2 - GRID_GAP) / 2;

export default function DreamScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<DreamSymbol | null>(null);
  const [praharId, setPraharId] = useState<string>('p4'); // default: near dawn
  const [panchang, setPanchang] = useState<Panchang | null>(null);

  useEffect(() => { track('dream_viewed'); }, []);

  // Fetch today's Panchang once (best-effort — the reading works without it).
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      const p = await getPanchang(profileId);
      if (!cancelled && !p.error) setPanchang(p);
    })();
    return () => { cancelled = true; };
  }, [profileId]);

  const searching = query.trim().length > 0;
  const rows: DreamSymbol[] = useMemo(
    () => (searching ? searchDreams(query) : categoryId ? dreamsInCategory(categoryId) : []),
    [searching, query, categoryId],
  );
  const category = categoryId ? DREAM_CATEGORIES.find((c) => c.id === categoryId) : undefined;

  const reading: DreamReading | null = symbol
    ? interpretDream(symbol, findPrahar(praharId), panchang, isHindi)
    : null;

  function pickSymbol(d: DreamSymbol) {
    setSymbol(d);
    track('dream_symbol_picked', { symbol: d.id });
  }
  function changeSymbol() {
    setSymbol(null); // keep the current theme / search so they return where they were
  }
  function openChat() {
    track('home_hook_clicked', { source: 'dream' });
    router.push('/(tabs)/chat');
  }

  const accent = symbol ? Accents[NATURE_ACCENT[symbol.nature]] : Accents.amethyst;

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'स्वप्न फल' : 'Dream Oracle'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
        <Text style={styles.intro}>
          {isHindi
            ? 'आपने स्वप्न में जो देखा, उसे चुनें। पारंपरिक स्वप्न शास्त्र और आज के पंचांग से उसका फल जानें।'
            : 'Choose what you saw in your dream. Read its meaning from traditional Swapna Shastra and today’s Panchang.'}
        </Text>

        {/* ── Search (always available) ─────────────────────────────────────────── */}
        <View style={styles.searchBox}>
          <Icon name="eye" size={18} color={th.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={isHindi ? 'स्वप्न का प्रतीक खोजें…' : 'Search a dream symbol…'}
            placeholderTextColor={th.textDim}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Icon name="close" size={18} color={th.textMuted} />
            </Pressable>
          )}
        </View>

        {/* ── A symbol is chosen → show the reading (picker hidden) ──────────────── */}
        {symbol && reading ? (
          <>
            <Reveal index={0}>
              <Pressable style={styles.selected} onPress={changeSymbol} android_ripple={{ color: th.goldFaint }}>
                <View style={[styles.natureDot, { backgroundColor: accent.faint, borderColor: accent.soft }]}>
                  <Icon name="dream" size={18} color={accent.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName}>{reading.title}</Text>
                  <Text style={styles.selectedOmen} numberOfLines={1}>{reading.omen}</Text>
                </View>
                <View style={styles.changeBtn}>
                  <Icon name="edit" size={13} color={th.gold} />
                  <Text style={styles.changeText}>{isHindi ? 'बदलें' : 'Change'}</Text>
                </View>
              </Pressable>
            </Reveal>

            {/* prahar */}
            <Reveal index={1}>
              <Text style={styles.stepLabel}>{isHindi ? 'यह किस समय देखा?' : 'WHEN DID YOU SEE IT?'}</Text>
              <View style={styles.praharWrap}>
                {PRAHARS.map((p) => {
                  const on = praharId === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setPraharId(p.id)}
                      android_ripple={{ color: th.goldFaint }}
                      style={[styles.prahar, on && styles.praharOn]}
                    >
                      <Text style={[styles.praharName, on && styles.praharNameOn]}>{isHindi ? p.hi : p.en}</Text>
                      {(isHindi ? p.windowHi : p.window) ? (
                        <Text style={[styles.praharWin, on && styles.praharWinOn]}>{isHindi ? p.windowHi : p.window}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </Reveal>

            {/* the reading */}
            <Reveal index={2}>
              <View style={[styles.card, { borderColor: accent.soft }]}>
                <View style={styles.cardHead}>
                  <View style={[styles.natureChip, { backgroundColor: accent.faint, borderColor: accent.soft }]}>
                    <Icon name="moon" size={20} color={accent.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.natureLabel, { color: accent.color }]}>{natureLabel(reading.nature, isHindi)}</Text>
                    <Text style={styles.cardTitle}>{reading.title}</Text>
                  </View>
                </View>
                <Text style={[styles.omen, { color: accent.color }]}>{reading.omen}</Text>
                <Text style={styles.body}>{reading.reading}</Text>
              </View>

              <View style={styles.subCard}>
                <View style={styles.subHead}>
                  <Icon name="clock" size={16} color={th.gold} />
                  <Text style={styles.subTitle}>{isHindi ? 'फल का समय' : 'When it may unfold'}</Text>
                </View>
                <Text style={styles.subMeta}>{reading.timingLabel}</Text>
                <Text style={styles.subBody}>{reading.timing}</Text>
              </View>

              {reading.sky && (
                <View style={styles.subCard}>
                  <View style={styles.subHead}>
                    <Icon name="sparkle" size={16} color={th.gold} />
                    <Text style={styles.subTitle}>{isHindi ? 'आज का आकाश' : 'Today’s sky'}</Text>
                  </View>
                  <Text style={styles.subBody}>{reading.sky}</Text>
                </View>
              )}

              <View style={styles.hookCard}>
                <Text style={styles.hookText}>
                  {isHindi
                    ? <>यह स्वप्न आपकी <Text style={styles.hookEm}>कुंडली</Text> से कैसे जुड़ता है, जानें।</>
                    : <>Ask how this dream ties into your <Text style={styles.hookEm}>birth chart</Text>.</>}
                </Text>
                <Pressable style={styles.hookBtn} onPress={openChat} android_ripple={{ color: th.goldDeep }}>
                  <Text style={styles.hookBtnText}>{isHindi ? 'बातचीत शुरू करें' : 'Start a chat'}</Text>
                  <Icon name="arrowRight" size={15} color={th.goldContrast} />
                </Pressable>
              </View>
            </Reveal>
          </>
        ) : searching ? (
          /* ── Search results (rich rows) ───────────────────────────────────────── */
          <View style={styles.rowsWrap}>
            {rows.length > 0 ? (
              rows.map((d, i) => <SymbolRow key={d.id} d={d} index={i} onPress={() => pickSymbol(d)} />)
            ) : (
              <Text style={styles.noResult}>{isHindi ? 'कोई मिलता प्रतीक नहीं मिला।' : 'No matching symbol found.'}</Text>
            )}
          </View>
        ) : category ? (
          /* ── Inside a theme (rich rows + a way back) ───────────────────────────── */
          <View style={styles.rowsWrap}>
            <Pressable style={styles.crumb} onPress={() => setCategoryId(null)} hitSlop={8}>
              <Icon name="back" size={16} color={th.gold} />
              <Text style={styles.crumbText}>{isHindi ? 'सभी विषय' : 'All themes'}</Text>
            </Pressable>
            <Text style={styles.crumbTitle}>{isHindi ? category.hi : category.en}</Text>
            {rows.map((d, i) => <SymbolRow key={d.id} d={d} index={i} onPress={() => pickSymbol(d)} />)}
          </View>
        ) : (
          /* ── Theme grid (the calm entry point) ─────────────────────────────────── */
          <>
            <Text style={styles.stepLabel}>{isHindi ? 'विषय चुनें' : 'BROWSE BY THEME'}</Text>
            <View style={styles.grid}>
              {DREAM_CATEGORIES.map((c, i) => (
                <CategoryCard key={c.id} c={c} index={i} onPress={() => { setCategoryId(c.id); track('dream_symbol_picked', { symbol: `theme:${c.id}` }); }} />
              ))}
            </View>
          </>
        )}

        <Text style={styles.footnote}>
          {isHindi
            ? 'स्वप्न फल पारंपरिक स्वप्न शास्त्र पर आधारित है — मार्गदर्शन और चिंतन के लिए, पेशेवर सलाह नहीं।'
            : 'Dream readings draw on traditional Swapna Shastra — for guidance and reflection, not professional advice.'}
        </Text>
        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ── Theme card (2-col grid) ────────────────────────────────────────────────────
function CategoryCard({ c, index, onPress }: { c: DreamCategory; index: number; onPress: () => void }) {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  return (
    <Reveal index={index} style={styles.gridItem}>
      <Pressable style={styles.themeCard} android_ripple={{ color: th.goldFaint }} onPress={onPress}>
        <View style={styles.themeTop}>
          <LinearGradient colors={Accents[c.accent].grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.themeChip}>
            <Icon name={c.icon} size={22} color="#FFFFFF" />
          </LinearGradient>
          <View style={styles.themeArrow}><Icon name="arrowRight" size={14} color={th.gold} /></View>
        </View>
        <Text style={styles.themeTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.9}>
          {isHindi ? c.hi : c.en}
        </Text>
        <Text style={styles.themeCount}>{c.ids.length} {isHindi ? 'संकेत' : 'signs'}</Text>
      </Pressable>
    </Reveal>
  );
}

// ── Rich symbol row ────────────────────────────────────────────────────────────
function SymbolRow({ d, index, onPress }: { d: DreamSymbol; index: number; onPress: () => void }) {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const accent = Accents[NATURE_ACCENT[d.nature]];
  return (
    <Reveal index={index}>
      <Pressable style={styles.row} android_ripple={{ color: th.goldFaint }} onPress={onPress}>
        <View style={[styles.rowIcon, { backgroundColor: accent.faint, borderColor: accent.soft }]}>
          <Icon name="dream" size={18} color={accent.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{isHindi ? d.hi : d.en}</Text>
          <Text style={styles.rowOmen} numberOfLines={1}>{isHindi ? d.omenHi : d.omen}</Text>
        </View>
        <Icon name="chevron" size={20} color={th.textDim} />
      </Pressable>
    </Reveal>
  );
}

function natureLabel(nature: DreamSymbol['nature'], isHindi: boolean): string {
  if (isHindi) return nature === 'auspicious' ? 'शुभ संकेत' : nature === 'caution' ? 'सावधानी' : 'मिश्रित संकेत';
  return nature === 'auspicious' ? 'AUSPICIOUS SIGN' : nature === 'caution' ? 'A GENTLE CAUTION' : 'A MIXED SIGN';
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  intro: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.md, lineHeight: 22, marginBottom: Spacing.lg },

  stepLabel: {
    fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.textMuted,
    letterSpacing: 1.8, marginBottom: Spacing.md, marginTop: Spacing.xs,
  },

  // search
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: th.surface, borderRadius: Radius.pill, borderWidth: 1, borderColor: th.border,
    paddingHorizontal: Spacing.lg, height: 50, marginBottom: Spacing.lg, ...Depth.card,
  },
  searchInput: { flex: 1, fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.text, padding: 0 },

  // theme grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridItem: { width: CARD_W, marginBottom: GRID_GAP },
  themeCard: {
    backgroundColor: th.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border, minHeight: 132, ...Depth.card,
  },
  themeTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.sm },
  themeChip: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  themeArrow: { width: 28, height: 28, borderRadius: Radius.pill, backgroundColor: th.goldFaint, alignItems: 'center', justifyContent: 'center' },
  themeTitle: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: th.text, lineHeight: 20, minHeight: 40 },
  themeCount: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted, marginTop: 2 },

  // rows
  rowsWrap: { gap: Spacing.sm },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  crumbText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.gold },
  crumbTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, marginBottom: Spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    paddingVertical: 12, paddingHorizontal: Spacing.md,
  },
  rowIcon: { width: 42, height: 42, borderRadius: Radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.text },
  rowOmen: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: 1 },
  noResult: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, paddingVertical: Spacing.md, textAlign: 'center' },

  // selected summary
  selected: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.borderStrong,
    paddingVertical: 12, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm,
  },
  natureDot: { width: 42, height: 42, borderRadius: Radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  selectedName: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: th.text },
  selectedOmen: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginTop: 1 },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: th.goldFaint },
  changeText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold },

  // prahar selector
  praharWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  prahar: {
    paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.md,
    backgroundColor: th.surface, borderWidth: 1, borderColor: th.border,
  },
  praharOn: { borderColor: th.borderStrong, backgroundColor: th.goldFaint },
  praharName: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.text },
  praharNameOn: { color: th.gold },
  praharWin: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted, marginTop: 1 },
  praharWinOn: { color: th.goldLight },

  // reading card
  card: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1,
    padding: Spacing.lg, marginTop: Spacing.lg, ...Depth.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  natureChip: { width: 52, height: 52, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  natureLabel: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, letterSpacing: 1.5, textTransform: 'uppercase' },
  cardTitle: { fontFamily: Fonts.displayBold, color: th.text, fontSize: Fonts.size.xl, marginTop: 2 },
  omen: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, marginBottom: Spacing.sm },
  body: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md, lineHeight: 24 },

  // sub-cards (timing / sky)
  subCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    padding: Spacing.md, marginTop: Spacing.md,
  },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  subTitle: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.text },
  subMeta: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.sm, color: th.goldLight, marginBottom: 4 },
  subBody: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 21 },

  // chat hook
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

  footnote: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, lineHeight: 17, textAlign: 'center', marginTop: Spacing.xl },
});
