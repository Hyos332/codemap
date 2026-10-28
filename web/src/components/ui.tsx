import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Theme } from '../lib/theme';
import styles from './ui.module.css';

export interface ThemeProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function Wordmark({ onClick }: { onClick?: () => void }) {
  const content = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" />
        <circle cx="12" cy="12" r="5" opacity="0.55" />
        <circle cx="12" cy="12" r="1.8" className={styles.core} />
      </svg>
      <span>CodeMap</span>
    </>
  );
  return onClick ? (
    <button type="button" className={styles.wordmark} onClick={onClick} aria-label="Volver al inicio">
      {content}
    </button>
  ) : (
    <span className={styles.wordmark}>{content}</span>
  );
}

export function ThemeToggle({ theme, onToggleTheme }: ThemeProps) {
  const next = theme === 'dark' ? 'claro' : 'oscuro';
  return (
    <button type="button" className={styles.iconButton} onClick={onToggleTheme} aria-label={`Cambiar a modo ${next}`} title={`Modo ${next}`}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="6.5" />
        <path d="M10 3.5a6.5 6.5 0 0 1 0 13Z" className={styles.fill} />
      </svg>
    </button>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'quiet'; children: ReactNode };

export function Button({ variant = 'solid', className, ...rest }: ButtonProps) {
  return <button type="button" className={[styles.button, styles[variant], className].filter(Boolean).join(' ')} {...rest} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
