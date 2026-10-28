import { formatCompact, formatNumber } from '../lib/format';
import type { RepoMap } from '../types';
import styles from './MapHeader.module.css';
import { Button, Kbd, ThemeToggle, Wordmark, type ThemeProps } from './ui';

const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

interface Props extends ThemeProps {
  map: RepoMap;
  onHome: () => void;
  onSearch: () => void;
  onTogglePanel?: () => void;
}

export function MapHeader({ map, onHome, onSearch, onTogglePanel, ...themeProps }: Props) {
  const { repo, stats } = map;
  const facts = [
    [formatNumber(stats.files), 'archivos'],
    [formatNumber(stats.edges), 'dependencias'],
    [formatNumber(stats.commits), 'commits'],
  ];

  return (
    <header className={styles.header}>
      <Wordmark onClick={onHome} />
      <span className={styles.rule} aria-hidden="true" />

      <div className={styles.repo}>
        <a href={repo.url} target="_blank" rel="noreferrer">
          <span>{repo.owner}</span>
          <span className={styles.slash}>/</span>
          <strong>{repo.name}</strong>
        </a>
        <span className={`${styles.ref} mono`}>
          {repo.branch} · {repo.sha.slice(0, 7)}
          {repo.stars !== null && <> · ★ {formatCompact(repo.stars)}</>}
        </span>
      </div>

      <dl className={`${styles.facts} mono`}>
        {facts.map(([value, label]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.actions}>
        {onTogglePanel && (
          <Button variant="quiet" onClick={onTogglePanel}>
            Vista
          </Button>
        )}
        <button type="button" className={styles.search} onClick={onSearch}>
          <span>Buscar archivo</span>
          <Kbd>{MOD_KEY}</Kbd>
          <Kbd>K</Kbd>
        </button>
        <ThemeToggle {...themeProps} />
      </div>
    </header>
  );
}
