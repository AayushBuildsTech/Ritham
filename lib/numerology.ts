// numerology — CORE NUMBER COMPUTATION in plain code. No API, no AI, ever.
//
// Two numbers are derived from a profile's name + date of birth:
//   • Life Path (from the DOB) — the headline number in Western numerology.
//   • Expression / Destiny (from the full birth name) — via the Pythagorean
//     letter→digit map.
// Master numbers 11, 22 and 33 are preserved (never reduced to 2/4/6).
//
// The MEANING TEXT for each number lives in a fixed pre-written library
// (constants/numerology.ts) — this file only produces the numbers.

export interface NumerologyNumber {
  number: number;    // 1–9, or master 11 / 22 / 33
  is_master: boolean;
}

export interface Numerology {
  life_path: NumerologyNumber;
  expression: NumerologyNumber;
  computed_at: string;
}

const MASTERS = new Set([11, 22, 33]);

// Pythagorean map: A=1 … I=9, J=1 … R=9, S=1 … Z=8.
const LETTER_VALUE: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < 26; i++) {
    map[String.fromCharCode(65 + i)] = (i % 9) + 1;
  }
  return map;
})();

// Reduce a number to a single digit, but STOP on a master number (11/22/33).
function reduceKeepingMaster(n: number): number {
  while (n > 9 && !MASTERS.has(n)) {
    n = String(n).split('').reduce((s, ch) => s + Number(ch), 0);
  }
  return n;
}

const wrap = (n: number): NumerologyNumber => ({ number: n, is_master: MASTERS.has(n) });

// Life Path — reduce day, month and year components independently (preserving
// masters), sum them, then reduce again. This is the component method, which
// surfaces master numbers correctly.
export function lifePathFromDob(dob: string): NumerologyNumber {
  const [y, m, d] = dob.split('-').map(Number); // 'YYYY-MM-DD'
  const parts = [d, m, y].map((v) => reduceKeepingMaster(v));
  const total = parts.reduce((s, v) => s + v, 0);
  return wrap(reduceKeepingMaster(total));
}

// Expression / Destiny — sum every letter's value across the full name.
export function expressionFromName(name: string): NumerologyNumber {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters) return wrap(0);
  const total = letters.split('').reduce((s, ch) => s + (LETTER_VALUE[ch] ?? 0), 0);
  return wrap(reduceKeepingMaster(total));
}

export function computeNumerology(name: string, dob: string): Numerology {
  return {
    life_path: lifePathFromDob(dob),
    expression: expressionFromName(name),
    computed_at: new Date().toISOString(),
  };
}
