import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getMuhurats, MuhuratResult } from '../lib/muhuratService';
import { MUHURAT_ACTIVITIES, activityById, FunnelTarget } from '../config/muhuratRules';
import { track } from '../lib/analytics';
import { Colors, Fonts, Spacing } from '../constants/theme';

export default function MuhuratScreen() {
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [activity, setActivity] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [result, setResult] = useState<MuhuratResult | null>(null);

  useEffect(() => { track('muhurat_opened'); }, []);

  async function pick(id: string) {
    track('muhurat_activity_selected', { activity: id });
    setActivity(id);
    setState('loading');
    setResult(null);
    if (!profileId) { setState('error'); return; }
    const res = await getMuhurats(profileId, id);
    if (res.error) { setState('error'); return; }
    setResult(res);
    setState('ready');
    track('muhurat_results_viewed', { activity: id });
  }

  function goFunnel(target: FunnelTarget) {
    track('muhurat_funnel_clicked', { target });
    if (target === 'vastu') router.push('/report-vastu');
    else if (target === 'matchmaking') router.push('/report-matchmaking');
    else router.push('/(tabs)/chat');
  }

  const current = activity ? activityById(activity) : null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (current ? (setActivity(null), setState('idle')) : router.back())}>
          <Text style={styles.back}>‹ {current ? 'Activities' : 'Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shubh Muhurat</Text>
        <View style={{ width: 72 }} />
      </View>

      {/* ── Activity picker ─────────────────────────────────────────────────── */}
      {!current ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.lead}>Find auspicious dates for…</Text>
          {MUHURAT_ACTIVITIES.map((a) => (
            <TouchableOpacity key={a.id} style={styles.activityRow} activeOpacity={0.8} onPress={() => pick(a.id)}>
              <Text style={styles.activityEmoji}>{a.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityLabel}>{a.hindi} <Text style={styles.activityEn}>({a.label})</Text></Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.disclaimer}>
            Muhurat suggestions are computed from Panchang for guidance only. For important events,
            please confirm the timing with your family priest or astrologer.
          </Text>
        </ScrollView>
      ) : (
        /* ── Results ──────────────────────────────────────────────────────── */
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.resultTitle}>
            {current.emoji}  {current.hindi} <Text style={styles.activityEn}>({current.label})</Text>
          </Text>
          {result?.place ? <Text style={styles.resultSub}>Near {result.place} · next {result?.end && result?.start ? daysLabel(result.start, result.end) : '45 days'}</Text> : null}

          {state === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={Colors.gold} size="large" />
              <Text style={styles.loadingText}>Scanning the Panchang…</Text>
            </View>
          ) : state === 'error' ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>Couldn’t load muhurats right now.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => pick(current.id)}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : result && result.results && result.results.length > 0 ? (
            <>
              {result.results.map((r) => (
                <View key={r.date} style={styles.dayCard}>
                  <View style={styles.dayHead}>
                    <Text style={styles.dayDate}>{fmtDate(r.date)}</Text>
                    <Text style={styles.dayWeekday}>{r.weekday}</Text>
                  </View>
                  <View style={styles.windowPill}>
                    <Text style={styles.windowText}>✦ {r.window}</Text>
                  </View>
                  <Text style={styles.factors}>
                    {r.nakshatra} nakshatra · {r.tithi} · {r.yoga} yoga
                  </Text>
                </View>
              ))}

              {/* Soft funnel toward the matching paid product / chat */}
              <View style={styles.hookCard}>
                <Text style={styles.hookText}>{current.funnel.text}</Text>
                <TouchableOpacity style={styles.hookBtn} onPress={() => goFunnel(current.funnel.target)}>
                  <Text style={styles.hookBtnText}>{funnelCta(current.funnel.target)} →</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.center}>
              <Text style={styles.errorText}>No strongly auspicious dates found in this window.</Text>
              <Text style={styles.emptyHint}>Try again later, or ask the astrologer for a personalised muhurat.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => goFunnel('chat')}>
                <Text style={styles.retryText}>Ask the astrologer</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.disclaimer}>
            Computed from Panchang for guidance only. Please confirm important muhurats with a
            priest or astrologer.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function funnelCta(t: FunnelTarget): string {
  return t === 'vastu' ? 'Get a Vastu report' : t === 'matchmaking' ? 'Get a Matchmaking report' : 'Ask the astrologer';
}
function daysLabel(start: string, end: string): string {
  const n = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
  return `${n} days`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  back: { color: Colors.goldLight, fontSize: Fonts.size.md, width: 90 },
  headerTitle: { color: Colors.text, fontSize: Fonts.size.lg, fontWeight: '700' },

  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  lead: { color: Colors.textMuted, fontSize: Fonts.size.md, marginBottom: Spacing.md },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: 14, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  activityEmoji: { fontSize: 24 },
  activityLabel: { color: Colors.text, fontSize: Fonts.size.md, fontWeight: '700' },
  activityEn: { color: Colors.textMuted, fontWeight: '400', fontSize: Fonts.size.sm },
  chevron: { color: Colors.gold, fontSize: 22 },

  resultTitle: { color: Colors.text, fontSize: Fonts.size.lg, fontWeight: '700' },
  resultSub: { color: Colors.textMuted, fontSize: Fonts.size.sm, marginTop: 2, marginBottom: Spacing.md },

  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  loadingText: { color: Colors.textMuted, fontSize: Fonts.size.sm },
  errorText: { color: Colors.textMuted, fontSize: Fonts.size.md, textAlign: 'center' },
  emptyHint: { color: Colors.textDim, fontSize: Fonts.size.sm, textAlign: 'center', paddingHorizontal: Spacing.lg },

  dayCard: {
    backgroundColor: Colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  dayDate: { color: Colors.goldLight, fontSize: Fonts.size.md, fontWeight: '700' },
  dayWeekday: { color: Colors.textMuted, fontSize: Fonts.size.sm },
  windowPill: {
    alignSelf: 'flex-start', backgroundColor: Colors.bgMid, borderRadius: 8,
    paddingVertical: 4, paddingHorizontal: Spacing.sm, marginTop: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  windowText: { color: Colors.success, fontSize: Fonts.size.sm, fontWeight: '600' },
  factors: { color: Colors.textMuted, fontSize: Fonts.size.sm, marginTop: Spacing.sm },

  retryBtn: {
    marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.gold, borderRadius: 10,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
  },
  retryText: { color: Colors.goldLight, fontSize: Fonts.size.sm, fontWeight: '700' },

  hookCard: {
    backgroundColor: Colors.bgMid, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginTop: Spacing.md, alignItems: 'center', gap: Spacing.md,
  },
  hookText: { color: Colors.text, fontSize: Fonts.size.md, textAlign: 'center', lineHeight: 22 },
  hookBtn: { backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl },
  hookBtnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },

  disclaimer: {
    color: Colors.textDim, fontSize: Fonts.size.xs, lineHeight: 17,
    textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.sm,
  },
});
