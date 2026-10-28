import styles from './Status.module.css';
import { Button, Wordmark } from './ui';

interface Props {
  repo: string;
  message: string;
  onRetry: () => void;
  onHome: () => void;
}

export function ErrorView({ repo, message, onRetry, onHome }: Props) {
  return (
    <div className={styles.screen}>
      <Wordmark onClick={onHome} />
      <div className={styles.body}>
        <p className="eyebrow">Sin mapa para {repo}</p>
        <h1 className={styles.message}>{message}</h1>
        <div className={styles.actions}>
          <Button onClick={onHome}>Probar otro repositorio</Button>
          <Button variant="quiet" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      </div>
    </div>
  );
}
