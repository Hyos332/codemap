import type { RepoMap, Stage } from '../types';

interface AnalyzeHandlers {
  onStage: (stage: Stage) => void;
  onResult: (map: RepoMap) => void;
  onError: (message: string) => void;
}

export function analyze(repo: string, handlers: AnalyzeHandlers): () => void {
  const source = new EventSource(`/api/analyze?repo=${encodeURIComponent(repo)}`);
  const finish = () => source.close();
  const listen = <T,>(event: string, handle: (data: T) => void) =>
    source.addEventListener(event, (e) => handle(JSON.parse((e as MessageEvent<string>).data) as T));

  listen<{ stage: Stage }>('stage', ({ stage }) => handlers.onStage(stage));
  listen<RepoMap>('result', (map) => {
    finish();
    handlers.onResult(map);
  });
  listen<{ message: string }>('failure', ({ message }) => {
    finish();
    handlers.onError(message);
  });
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) return;
    finish();
    handlers.onError('Se perdió la conexión con el servidor.');
  };

  return finish;
}
