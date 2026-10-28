import { useCallback, useEffect, useState } from 'react';
import { ErrorView } from './components/ErrorView';
import { Landing } from './components/Landing';
import { Loading } from './components/Loading';
import { MapView } from './components/MapView';
import { analyze } from './lib/api';
import { useTheme } from './lib/theme';
import type { RepoMap, Stage } from './types';

type View =
  | { kind: 'home' }
  | { kind: 'loading'; repo: string; stage: Stage }
  | { kind: 'map'; map: RepoMap }
  | { kind: 'error'; repo: string; message: string };

const viewFromUrl = (): View => {
  const repo = new URLSearchParams(location.search).get('repo');
  return repo ? { kind: 'loading', repo, stage: 'queue' } : { kind: 'home' };
};

function titleOf(view: View): string {
  switch (view.kind) {
    case 'loading':
      return `Trazando ${view.repo} · CodeMap`;
    case 'map':
      return `${view.map.repo.owner}/${view.map.repo.name} · CodeMap`;
    case 'error':
      return 'No se pudo trazar · CodeMap';
    case 'home':
      return 'CodeMap';
  }
}

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState<View>(viewFromUrl);
  const loadingRepo = view.kind === 'loading' ? view.repo : null;

  useEffect(() => {
    if (!loadingRepo) return;
    return analyze(loadingRepo, {
      onStage: (stage) => setView((v) => (v.kind === 'loading' ? { ...v, stage } : v)),
      onResult: (map) => setView({ kind: 'map', map }),
      onError: (message) => setView({ kind: 'error', repo: loadingRepo, message }),
    });
  }, [loadingRepo]);

  useEffect(() => {
    const onPop = () => setView(viewFromUrl());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.title = titleOf(view);
  }, [view]);

  const navigate = useCallback((repo: string | null) => {
    history.pushState(null, '', repo ? `?repo=${encodeURIComponent(repo)}` : location.pathname);
    setView(viewFromUrl());
  }, []);

  const goHome = useCallback(() => navigate(null), [navigate]);
  const themeProps = { theme, onToggleTheme: toggleTheme };

  switch (view.kind) {
    case 'home':
      return <Landing {...themeProps} onSubmit={navigate} />;
    case 'loading':
      return <Loading repo={view.repo} stage={view.stage} onCancel={goHome} />;
    case 'map':
      return <MapView {...themeProps} map={view.map} onHome={goHome} />;
    case 'error':
      return <ErrorView repo={view.repo} message={view.message} onRetry={() => navigate(view.repo)} onHome={goHome} />;
  }
}
