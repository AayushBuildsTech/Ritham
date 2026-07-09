// KundliChart — renders a traditional birth-chart diagram (North Indian diamond OR
// South Indian grid) as inline SVG inside a WebView. No image API, no network, no AI —
// it is drawn purely from the computed chart (a Lagna sign + planets-by-sign map), so it
// works offline at zero cost. react-native-webview is already a dependency (no rebuild).

import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export type ChartVariant = 'north' | 'south';
export interface ChartColors { line: string; text: string; accent: string }

interface Props {
  variant: ChartVariant;
  lagnaIndex: number;              // 0..11 (Aries..Pisces)
  planets: string[][];            // index = sign (0..11) → planet abbreviations in that sign
  colors: ChartColors;
}

// planet stack text inside a house/cell, centred at (cx, cy)
const stack = (arr: string[], cx: number, cy: number, color: string, size = 3.6) => {
  if (!arr.length) return '';
  const start = cy - ((arr.length - 1) * size) / 2 + 1;
  return arr.map((p, i) =>
    `<text x="${cx}" y="${start + i * (size + 0.6)}" fill="${color}" font-size="${size}" text-anchor="middle" font-family="sans-serif">${p}</text>`,
  ).join('');
};

// ── North Indian: fixed diamond houses; house 1 = Lagna sign at top-centre ──────────
const NORTH_CENTRES: [number, number][] = [
  [50, 22], [26, 12], [13, 26], [22, 50], [13, 74], [26, 88],
  [50, 78], [74, 88], [87, 74], [78, 50], [87, 26], [74, 12],
];
function northSvg(lagna: number, planets: string[][], c: ChartColors): string {
  const ln = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c.line}" stroke-width="0.5"/>`;
  const frame = `<rect x="1" y="1" width="98" height="98" fill="none" stroke="${c.line}" stroke-width="0.6"/>`
    + ln(1, 1, 99, 99) + ln(99, 1, 1, 99)
    + ln(50, 1, 99, 50) + ln(99, 50, 50, 99) + ln(50, 99, 1, 50) + ln(1, 50, 50, 1);
  let cells = '';
  for (let h = 1; h <= 12; h++) {
    const sign = (lagna + h - 1) % 12;
    const [cx, cy] = NORTH_CENTRES[h - 1];
    cells += `<text x="${cx}" y="${cy - 3}" fill="${c.accent}" font-size="3.2" text-anchor="middle" font-family="sans-serif">${sign + 1}</text>`;
    cells += stack(planets[sign] ?? [], cx, cy + 3, c.text);
  }
  return frame + cells;
}

// ── South Indian: fixed sign positions in a 4×4 ring; Lagna cell marked ─────────────
const SOUTH_CELL: Record<number, [number, number]> = {
  0: [0, 1], 1: [0, 2], 2: [0, 3], 3: [1, 3], 4: [2, 3], 5: [3, 3],
  6: [3, 2], 7: [3, 1], 8: [3, 0], 9: [2, 0], 10: [1, 0], 11: [0, 0],
};
function southSvg(lagna: number, planets: string[][], c: ChartColors): string {
  let grid = `<rect x="1" y="1" width="98" height="98" fill="none" stroke="${c.line}" stroke-width="0.6"/>`;
  for (let i = 1; i < 4; i++) {
    grid += `<line x1="${1 + i * 24.5}" y1="1" x2="${1 + i * 24.5}" y2="99" stroke="${c.line}" stroke-width="0.4"/>`;
    grid += `<line x1="1" y1="${1 + i * 24.5}" x2="99" y2="${1 + i * 24.5}" stroke="${c.line}" stroke-width="0.4"/>`;
  }
  let cells = '';
  for (let sign = 0; sign < 12; sign++) {
    const [row, col] = SOUTH_CELL[sign];
    const x = 1 + col * 24.5, y = 1 + row * 24.5, cx = x + 12.25, cy = y + 12.25;
    cells += `<text x="${x + 2}" y="${y + 5}" fill="${c.accent}" font-size="3" text-anchor="start" font-family="sans-serif">${sign + 1}</text>`;
    if (sign === lagna) cells += `<text x="${x + 22.5}" y="${y + 5}" fill="${c.accent}" font-size="3" text-anchor="end" font-family="sans-serif">As</text>`;
    cells += stack(planets[sign] ?? [], cx, cy + 1, c.text);
  }
  return grid + cells;
}

export function KundliChart({ variant, lagnaIndex, planets, colors }: Props) {
  const html = useMemo(() => {
    const body = variant === 'north' ? northSvg(lagnaIndex, planets, colors) : southSvg(lagnaIndex, planets, colors);
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">`
      + `<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{width:100%;height:100%;display:block}</style></head>`
      + `<body><svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${body}</svg></body></html>`;
  }, [variant, lagnaIndex, planets, colors]);

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={styles.web}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      androidLayerType="software"
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({ web: { width: '100%', aspectRatio: 1, backgroundColor: 'transparent' } });
