export type Provider = 'github' | 'gitlab' | 'bitbucket';

export interface RepoRef {
  provider: Provider;
  owner: string;
  name: string;
}

export type Lang = 'ts' | 'js' | 'vue' | 'svelte' | 'py' | 'php';

export interface FileNode {
  id: string;
  group: string;
  lang: Lang;
  loc: number;
  fanIn: number;
  fanOut: number;
  commits: number;
  authors: number;
  lastChange: string | null;
  heat: number;
  test: boolean;
}

export interface Edge {
  source: string;
  target: string;
}

export interface RepoMap {
  repo: {
    provider: Provider;
    owner: string;
    name: string;
    url: string;
    branch: string;
    sha: string;
    description: string | null;
    stars: number | null;
  };
  stats: {
    files: number;
    edges: number;
    commits: number;
    since: string | null;
    languages: Partial<Record<Lang, number>>;
    truncated: boolean;
    durationMs: number;
  };
  nodes: FileNode[];
  edges: Edge[];
  externals: { name: string; count: number }[];
}

export type Stage = 'queue' | 'meta' | 'clone' | 'scan' | 'imports' | 'history';

export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
