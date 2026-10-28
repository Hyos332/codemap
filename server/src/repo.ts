import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { git } from './git.js';
import { repoPath, repoSlug, repoUrl } from './repoRef.js';
import { AppError, type Provider, type RepoRef } from './types.js';

export const HISTORY_DEPTH = 1000;
const MAX_REPO_KB = 1_500_000;

export interface RepoMeta {
  description: string | null;
  stars: number | null;
}

interface ProviderMeta extends RepoMeta {
  hidden: boolean;
  sizeKb: number | null;
}

interface MetaSource {
  endpoint: (ref: RepoRef) => string;
  headers: () => Record<string, string>;
  read: (body: Record<string, unknown>) => ProviderMeta;
}

const UNKNOWN_META: RepoMeta = { description: null, stars: null };

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const count = (value: unknown) => (typeof value === 'number' ? value : null);

const META_SOURCES: Record<Provider, MetaSource> = {
  github: {
    endpoint: (ref) => `https://api.github.com/repos/${repoPath(ref)}`,
    headers: () => ({
      Accept: 'application/vnd.github+json',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    }),
    read: (body) => ({ description: text(body.description), stars: count(body.stargazers_count), hidden: body.private === true, sizeKb: count(body.size) }),
  },
  gitlab: {
    endpoint: (ref) => `https://gitlab.com/api/v4/projects/${encodeURIComponent(repoPath(ref))}`,
    headers: () => ({}),
    read: (body) => ({ description: text(body.description), stars: count(body.star_count), hidden: body.visibility !== undefined && body.visibility !== 'public', sizeKb: null }),
  },
  bitbucket: {
    endpoint: (ref) => `https://api.bitbucket.org/2.0/repositories/${repoPath(ref)}`,
    headers: () => ({}),
    read: (body) => {
      const bytes = count(body.size);
      return { description: text(body.description), stars: null, hidden: body.is_private === true, sizeKb: bytes === null ? null : bytes / 1024 };
    },
  },
};

export async function fetchMeta(ref: RepoRef): Promise<RepoMeta> {
  const source = META_SOURCES[ref.provider];
  let res: Response;
  try {
    res = await fetch(source.endpoint(ref), {
      headers: { 'User-Agent': 'codemap', ...source.headers() },
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    return UNKNOWN_META;
  }
  if (res.status === 404) throw notFound(ref);
  if (!res.ok) return UNKNOWN_META;

  const { hidden, sizeKb, ...meta } = source.read((await res.json()) as Record<string, unknown>);
  if (hidden) throw notFound(ref);
  if (sizeKb !== null && sizeKb > MAX_REPO_KB) throw new AppError(413, 'Este repositorio es demasiado grande para analizarlo aquí.');
  return meta;
}

export async function cloneRepo(ref: RepoRef, dest: string): Promise<{ branch: string; sha: string }> {
  try {
    await git(
      [
        '-c', 'core.symlinks=false',
        'clone',
        '--quiet',
        '--depth', String(HISTORY_DEPTH),
        '--filter=blob:none',
        '--single-branch',
        '--no-tags',
        `${repoUrl(ref)}.git`,
        dest,
      ],
      { timeout: 120_000 },
    );
  } catch (err) {
    const e = err as { killed?: boolean; stderr?: string };
    if (e.killed) throw new AppError(504, 'Clonar el repositorio tardó demasiado.');
    if (/not found|could not read Username|Authentication failed|does not appear to be a git repository/i.test(e.stderr ?? '')) throw notFound(ref);
    throw new AppError(502, 'No se pudo clonar el repositorio.');
  }

  const [branch, sha] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dest }),
    git(['rev-parse', 'HEAD'], { cwd: dest }),
  ]);
  return { branch: branch.trim(), sha: sha.trim() };
}

export async function shallowBoundary(dir: string): Promise<Set<string>> {
  try {
    const content = await readFile(join(dir, '.git', 'shallow'), 'utf8');
    return new Set(content.split('\n').map((l) => l.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function notFound(ref: RepoRef) {
  return new AppError(404, `No encontramos ${repoSlug(ref)}. ¿Es público y está bien escrito?`);
}
