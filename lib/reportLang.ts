// Per-report language (Master Prompt §1). Distinct from the app UI language
// (context/LanguageContext): a user can read the app in English but ask for a
// Hindi report, or vice-versa. The gate (app/report-language.tsx) is a real
// pre-generation step — generation does not start until a language is confirmed —
// and the choice is REMEMBERED so the next report pre-selects it (one-tap confirm,
// never a forced full reselect, never a silent skip).
//
// The chosen language is passed to the Claude API so the report is generated
// NATIVELY in that language (never English-then-translated).

import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from './i18n';
import { useLanguage } from '../context/LanguageContext';

const REPORT_LANG_KEY = 'ritham.reportLang';

/** The last language the user generated a report in — for pre-selecting the gate. */
export async function getRememberedReportLang(fallback: Lang): Promise<Lang> {
  try {
    const v = await AsyncStorage.getItem(REPORT_LANG_KEY);
    return v === 'en' || v === 'hi' ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Persist the language chosen on the gate so future reports pre-select it. */
export async function rememberReportLang(l: Lang): Promise<void> {
  try {
    await AsyncStorage.setItem(REPORT_LANG_KEY, l);
  } catch {
    /* non-fatal — the gate still passed `lang` through this session */
  }
}

/**
 * The language an intake screen should generate in: the gate's `?lang=` param
 * when present, otherwise the app UI language. Intake screens call this and pass
 * the result to their generate* function so the gate's choice is honoured.
 */
export function useReportLang(): Lang {
  const { lang } = useLanguage();
  const params = useLocalSearchParams<{ lang?: string }>();
  return params.lang === 'hi' || params.lang === 'en' ? params.lang : lang;
}
