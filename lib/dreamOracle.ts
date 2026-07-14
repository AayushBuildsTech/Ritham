// dreamOracle — pure, deterministic Swapna Shastra reading builder.
//
// Given a dream SYMBOL (constants/dreams.ts), the PRAHAR it was seen in, and —
// optionally — the day's PANCHANG (already fetched & cached by the app for free
// via the `panchang` Edge Function), this composes a reading. It is entirely
// rule-based: NO AI, NO network call of its own, and therefore NO per-use cost
// beyond the VedAstro engine that already powers the Panchang.
//
// The Panchang only *colours* the omen — the reading works fully without it, so
// the feature degrades gracefully if the almanac isn't available.

import { DreamSymbol, Prahar } from '../constants/dreams';
import { Panchang } from './panchangService';

export interface DreamReading {
  title: string;        // the symbol name (localised)
  nature: DreamSymbol['nature'];
  omen: string;         // one-line essence
  reading: string;      // fuller interpretation
  timing: string;       // prahar fructification note
  timingLabel: string;  // prahar picker label + window, for the header chip
  sky?: string;         // Panchang overlay line (present only if panchang given)
}

// Pull the paksha (bright/dark fortnight) out of a Panchang tithi like
// "Shukla Panchami" / "Krishna Ashtami". Bright fortnight = waxing = a
// strengthening backdrop; dark fortnight = waning = a tempering one.
function pakshaOf(p?: Panchang | null): 'shukla' | 'krishna' | null {
  const t = (p?.tithi ?? '').toLowerCase();
  if (t.includes('shukla') || t.includes('purnima')) return 'shukla';
  if (t.includes('krishna') || t.includes('amavasya')) return 'krishna';
  return null;
}

// The day's sky as a single sentence that modulates the omen. Shukla paksha
// lifts an auspicious sign and softens a caution; Krishna paksha tempers both.
function skyLine(symbol: DreamSymbol, p: Panchang, isHindi: boolean): string {
  const paksha = pakshaOf(p);
  const nak = (p.nakshatra ?? '').split(' (')[0];
  const tithi = p.tithi ?? '';
  const auspicious = symbol.nature === 'auspicious';

  if (isHindi) {
    const base = `आज ${tithi}${nak ? `, ${nak} नक्षत्र` : ''} है`;
    if (paksha === 'shukla') {
      return auspicious
        ? `${base} — शुक्ल पक्ष का बढ़ता चंद्रमा इस शुभ संकेत को और बल देता है।`
        : `${base} — शुक्ल पक्ष का बढ़ता चंद्रमा इस चेतावनी को नरम कर देता है।`;
    }
    if (paksha === 'krishna') {
      return `${base} — कृष्ण पक्ष का घटता चंद्रमा इसे शांत, धीमे स्वर में पढ़ने को कहता है।`;
    }
    return base + '।';
  }

  const base = `Tonight’s sky carries ${tithi}${nak ? `, ${nak} nakshatra` : ''}`;
  if (paksha === 'shukla') {
    return auspicious
      ? `${base} — the waxing (Shukla) Moon strengthens this hopeful sign.`
      : `${base} — the waxing (Shukla) Moon softens this caution.`;
  }
  if (paksha === 'krishna') {
    return `${base} — the waning (Krishna) Moon asks you to read it in a quieter, slower key.`;
  }
  return `${base}.`;
}

export function interpretDream(
  symbol: DreamSymbol,
  prahar: Prahar,
  panchang: Panchang | null | undefined,
  isHindi: boolean,
): DreamReading {
  const windowTxt = isHindi ? prahar.windowHi : prahar.window;
  const praharName = isHindi ? prahar.hi : prahar.en;
  return {
    title: isHindi ? symbol.hi : symbol.en,
    nature: symbol.nature,
    omen: isHindi ? symbol.omenHi : symbol.omen,
    reading: isHindi ? symbol.readingHi : symbol.reading,
    timing: isHindi ? prahar.timingHi : prahar.timing,
    timingLabel: windowTxt ? `${praharName} · ${windowTxt}` : praharName,
    sky: panchang && !panchang.error ? skyLine(symbol, panchang, isHindi) : undefined,
  };
}
