import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lang, translate } from '../lib/i18n';

// App language (English / Hindi). Chosen at first launch — BEFORE Google login —
// and changeable anytime in Settings. The choice persists to AsyncStorage so it is
// available pre-auth (there is no session yet at the language screen).
//
// `chosen` gates the pre-login language screen: it is false until the user makes an
// explicit pick, so first-run shows the language chooser before the sign-in screen.
//
// This governs the UI language only. The chat still auto-detects the user's script.
// Horoscopes and reports are generated in `lang` (the client passes it to those
// Edge Functions), so a Hindi user gets Hindi readings.

const LANG_KEY = 'ritham.lang';
const CHOSEN_KEY = 'ritham.langChosen';

interface LanguageContextValue {
  lang: Lang;
  isHindi: boolean;
  chosen: boolean;   // has the user made an explicit choice yet?
  ready: boolean;    // true once the persisted choice has loaded
  setLang: (l: Lang) => void;
  /** Translate a key for the active language, with optional {var} substitutions. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en'); // default: English (app "as usual")
  const [chosen, setChosen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(LANG_KEY), AsyncStorage.getItem(CHOSEN_KEY)])
      .then(([l, c]) => {
        if (l === 'en' || l === 'hi') setLangState(l);
        if (c === '1') setChosen(true);
      })
      .finally(() => setReady(true));
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    setChosen(true);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
    AsyncStorage.setItem(CHOSEN_KEY, '1').catch(() => {});
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, isHindi: lang === 'hi', chosen, ready, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

// Convenience: just the translate function (what most screens need).
export function useT(): LanguageContextValue['t'] {
  return useLanguage().t;
}
