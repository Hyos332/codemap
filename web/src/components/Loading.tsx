import { useEffect, useState } from 'react';
import type { Stage } from '../types';
import { DecryptedText } from './motion';
import styles from './Status.module.css';
import { Button, Wordmark } from './ui';

const STEPS: { stage: Stage; label: string }[] = [
  { stage: 'meta', label: 'Consultando GitHub' },
  { stage: 'clone', label: 'Clonando el historial' },
  { stage: 'scan', label: 'Leyendo archivos' },
  { stage: 'imports', label: 'Trazando dependencias' },
  { stage: 'history', label: 'Midiendo el cambio' },
];

export function Loading({ repo, stage, onCancel }: { repo: string; stage: Stage; onCancel: () => void }) {
  const current = STEPS.findIndex((s) => s.stage === stage);
  const elapsed = useElapsedSeconds(stage);

  return (
    <div className={styles.screen}>
      <Wordmark onClick={onCancel} />
      <div className={styles.body}>
        <p className="eyebrow">{stage === 'queue' ? 'En cola' : 'Trazando'}</p>
        <h1 className={styles.repo}>
          <DecryptedText text={repo} duration={1100} />
        </h1>
        <ol className={styles.steps}>
          {STEPS.map((step, i) => {
            const state = i < current ? 'done' : i === current ? 'active' : 'pending';
            return (
              <li key={step.stage} className={styles[state]}>
                <span className={styles.marker} aria-hidden="true" />
                <span>{step.label}</span>
                <span className={`${styles.status} mono`}>{state === 'done' ? 'listo' : state === 'active' ? `${elapsed}s` : ''}</span>
              </li>
            );
          })}
        </ol>
        <p className={styles.note}>Los repositorios grandes pueden tardar hasta un minuto.</p>
        <Button variant="quiet" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function useElapsedSeconds(restartOn: unknown): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    setSeconds(0);
    return () => clearInterval(timer);
  }, [restartOn]);
  return seconds;
}
