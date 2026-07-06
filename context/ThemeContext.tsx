import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, ThemeColors } from '../constants/theme';

// Light / dark theming. Default is LIGHT. The choice persists to AsyncStorage.
// Screens read the active palette with useColors() and build their StyleSheet
// per-render via a local makeStyles(c) factory.

export type ThemeMode = 'light' | 'dark';
const STORAGE_KEY = 'ritham.themeMode';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  ready: boolean; // true once the persisted choice has loaded
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light'); // default: light
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => { if (v === 'light' || v === 'dark') setModeState(v); })
      .finally(() => setReady(true));
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };
  const toggle = () => setMode(mode === 'dark' ? 'light' : 'dark');

  const colors = mode === 'dark' ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, colors, isDark: mode === 'dark', ready, toggle, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

// Convenience: just the active palette (what makeStyles(c) needs).
export function useColors(): ThemeColors {
  return useTheme().colors;
}
