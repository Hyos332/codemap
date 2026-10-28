import { useMemo, useState, type FormEvent } from 'react';
import { parseRepo, PROVIDERS, repoSlug } from '../types';
import styles from './Landing.module.css';
import { BlurText, DecryptedText } from './motion';
import { Button, ThemeToggle, Wordmark, type ThemeProps } from './ui';

const EXAMPLES = ['pmndrs/zustand', 'vuejs/pinia', 'gitlab.com/gitlab-org/gitlab-svgs'];

const FEATURES = [
  { title: 'Dependencias', text: 'Quién importa a quién, resuelto con alias de tsconfig, workspaces, paquetes de Python y autoload de Composer.' },
  { title: 'Zonas calientes', text: 'Los archivos que más cambian y más pesan. Ahí suelen vivir los bugs y las revisiones lentas.' },
  { title: 'Archivos clave', text: 'Los que sostienen al resto. Si los rompes, se nota en todo el sistema.' },
];

export function Landing({ onSubmit, ...themeProps }: ThemeProps & { onSubmit: (repo: string) => void }) {
  const [value, setValue] = useState('');
  const parsed = parseRepo(value);
  const showHint = value.trim() !== '' && !parsed;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (parsed) onSubmit(repoSlug(parsed));
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Wordmark />
        <ThemeToggle {...themeProps} />
      </header>

      <main className={styles.hero}>
        <div className={styles.copy}>
          <p className="eyebrow">
            <DecryptedText text="Para leer código heredado" />
          </p>
          <h1 className={styles.title}>
            <BlurText text="Antes de tocarlo," />{' '}
            <em>
              <BlurText text="entiéndelo." delay={0.3} />
            </em>
          </h1>
          <p className={styles.lede}>
            Pega un repositorio público de GitHub, GitLab o Bitbucket y CodeMap traza el mapa de sus archivos: quién depende de quién, qué archivos sostienen al resto y
            dónde se concentra el cambio.
          </p>

          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <input
                className="mono"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="usuario/proyecto o URL del repo"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoFocus
                aria-label="Repositorio de GitHub, GitLab o Bitbucket"
              />
              {parsed && <span className={`${styles.provider} mono`}>{PROVIDERS[parsed.provider].label}</span>}
            </label>
            <Button type="submit" disabled={!parsed}>
              Trazar mapa <span aria-hidden="true">→</span>
            </Button>
          </form>
          <p className={`${styles.hint} mono`} aria-live="polite">
            {showHint ? 'Formato: usuario/proyecto, o la URL completa en GitHub, GitLab o Bitbucket.' : null}
          </p>

          <div className={styles.examples}>
            <span className="eyebrow">Prueba con</span>
            {EXAMPLES.map((repo) => (
              <button key={repo} type="button" className="mono" onClick={() => onSubmit(repo)}>
                {repo}
              </button>
            ))}
          </div>
        </div>

        <Contours />
      </main>

      <section className={styles.features}>
        {FEATURES.map((f, i) => (
          <article key={f.title}>
            <span className={`${styles.index} mono`}>{String(i + 1).padStart(2, '0')}</span>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      <footer className={`${styles.footer} mono`}>
        <span>Hecho por Luis Felipe Hoyos Vega</span>
        <span>Santander · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}

function Contours() {
  const rings = useMemo(() => Array.from({ length: 11 }, (_, i) => contourPath(200, 200, 26 + i * 15.5, i)), []);
  return (
    <figure className={styles.figure} aria-hidden="true">
      <svg viewBox="0 0 400 400">
        {rings.map((d, i) => (
          <path key={d} d={d} className={i < 3 ? styles.hot : undefined} style={{ animationDelay: `${i * 70}ms` }} />
        ))}
        <circle cx="205" cy="196" r="4" className={styles.peak} />
        <line x1="209" y1="196" x2="318" y2="128" className={styles.leader} />
      </svg>
      <figcaption className="mono">
        <span>src/store.ts</span>
        <span>56 commits · 41 importaciones</span>
      </figcaption>
    </figure>
  );
}

function contourPath(cx: number, cy: number, radius: number, seed: number): string {
  const steps = 72;
  const points = Array.from({ length: steps }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2;
    const wobble = Math.sin(angle * 3 + seed * 0.6) * radius * 0.07 + Math.sin(angle * 5 - seed) * radius * 0.035 + Math.cos(angle * 2 + 1.3) * seed * 1.4;
    const r = radius + wobble;
    return `${(cx + Math.cos(angle) * r).toFixed(1)} ${(cy + Math.sin(angle) * r * 0.86).toFixed(1)}`;
  });
  return `M${points.join('L')}Z`;
}
