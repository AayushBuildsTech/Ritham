// SadeSatiTimeline — a calm, non-alarmist visual of the ~7.5-year Sade Sati cycle.
// Three equal segments (rising / peak / setting), the current phase gently highlighted,
// and a gold marker for exactly where the user stands. Deliberately NO red/warning
// tones — Sade Sati is anxiety-prone, so everything here reads reassuring and premium.

import { View, Text, StyleSheet } from 'react-native';
import { Fonts, Spacing, Radius, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { PHASE_LABEL, SadePhase } from '../config/sadeSatiPhases';

const PHASES: SadePhase[] = [1, 2, 3];

export function SadeSatiTimeline({ phase, progress }: { phase: SadePhase; progress: number }) {
  const th = useColors();
  const s = makeStyles(th);
  const pct = Math.min(1, Math.max(0, progress));

  return (
    <View style={s.wrap}>
      <View style={s.track}>
        {PHASES.map((p) => (
          <View
            key={p}
            style={[
              s.segment,
              p === 1 && s.segFirst,
              p === 3 && s.segLast,
              p === phase ? s.segActive : s.segIdle,
            ]}
          />
        ))}
        {/* current-position marker (gold) */}
        <View style={[s.marker, { left: `${pct * 100}%` }]}>
          <View style={s.markerDot} />
          <View style={s.markerStem} />
        </View>
      </View>

      <View style={s.labels}>
        {PHASES.map((p) => (
          <Text key={p} style={[s.label, p === phase && s.labelActive]} numberOfLines={1}>
            {PHASE_LABEL[p]}
          </Text>
        ))}
      </View>
      <View style={s.stepsRow}>
        {PHASES.map((p) => (
          <Text key={p} style={[s.step, p === phase && s.stepActive]}>{`Phase ${p} of 3`}</Text>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  wrap: { marginTop: Spacing.md },
  track: { flexDirection: 'row', height: 12, position: 'relative' },
  segment: { flex: 1, height: 12, marginHorizontal: 2 },
  segFirst: { marginLeft: 0, borderTopLeftRadius: Radius.pill, borderBottomLeftRadius: Radius.pill },
  segLast: { marginRight: 0, borderTopRightRadius: Radius.pill, borderBottomRightRadius: Radius.pill },
  segIdle: { backgroundColor: th.surfaceRaised, borderWidth: 1, borderColor: th.border },
  segActive: { backgroundColor: th.goldFaint, borderWidth: 1, borderColor: th.gold },

  marker: { position: 'absolute', top: -5, alignItems: 'center', marginLeft: -6 },
  markerDot: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: th.gold,
    borderWidth: 2, borderColor: th.canvas,
  },
  markerStem: { width: 2, height: 10, backgroundColor: th.gold, opacity: 0.5, marginTop: -1 },

  labels: { flexDirection: 'row', marginTop: Spacing.md },
  label: { flex: 1, textAlign: 'center', fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim },
  labelActive: { color: th.goldLight, fontFamily: Fonts.bodySemibold },
  stepsRow: { flexDirection: 'row', marginTop: 2 },
  step: { flex: 1, textAlign: 'center', fontFamily: Fonts.body, fontSize: 10, color: 'transparent' },
  stepActive: { color: th.textMuted },
});
