import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readPreference, writePreference } from '../lib/storage';
import { isNativeApp } from './native';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'theme';
const CANVAS: Record<ResolvedTheme, string> = { light: '#EEF0F3', dark: '#0F1524' };

interface ThemeValue {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue>({ choice: 'system', resolved: 'light', setChoice: () => undefined });

function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Applies the theme to the page, the browser bar colour and, in the Android app, the status bar. */
function apply(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CANVAS[theme]);
  if (isNativeApp()) {
    void import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) =>
        Promise.all([
          StatusBar.setBackgroundColor({ color: CANVAS[theme] }),
          // Style.Dark = light icons, for a dark background.
          StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }),
        ]),
      )
      .catch(() => undefined);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readPreference<ThemeChoice>(KEY, 'system'));
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    let media: MediaQueryList | undefined;
    try {
      media = window.matchMedia?.('(prefers-color-scheme: dark)');
    } catch {
      media = undefined;
    }
    if (!media) return;
    const onChange = () => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const resolved: ResolvedTheme = choice === 'system' ? system : choice;

  useEffect(() => {
    apply(resolved);
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    writePreference(KEY, next);
    setChoiceState(next);
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
