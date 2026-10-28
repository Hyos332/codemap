import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';

export interface Tokens {
  paper: string;
  ink: string;
  ink2: string;
  cold: string;
  accent: string;
  heat: string;
}

const STORAGE_KEY = 'codemap-theme';

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      return;
    }
  }, [theme]);

  return [theme, toggle];
}

export function readTokens(): Tokens {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return { paper: read('--paper'), ink: read('--ink'), ink2: read('--ink-2'), cold: read('--cold'), accent: read('--accent'), heat: read('--heat') };
}
