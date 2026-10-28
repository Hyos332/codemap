import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { git } from './git.js';
import { AppError, type RepoRef } from './types.js';

export const HISTORY_DEPTH = 1000;
const MAX_REPO_KB = 1_500_000;

export interface RepoMeta {
  description: string | null;
  stars: number | null;
}

const UNKNOWN_META: RepoMeta = { description: null, stars: null };

export async function fetchMeta(ref: RepoRef): Promise<RepoMeta> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'codemap',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.name}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    return UNKNOWN_META;
  }
  if (res.status === 404) throw notFound(ref);
  if (!res.ok) return UNKNOWN_META;

  const body = (await res.json()) as { description?: string | null; stargazers_count?: number; size?: number; private?: boolean };
  if (body.private) throw notFound(ref);
  if (typeof body.size === 'number' && body.size > MAX_REPO_KB) {
    throw new AppError(413, 'Este repositorio es demasiado grande para analizarlo aquí.');
  }
  return { description: body.description ?? null, stars: body.stargazers_count ?? null };
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
        `https://github.com/${ref.owner}/${ref.name}.git`,
        dest,
      ],
      { timeout: 120_000 },
    );
  } catch (err) {
    const e = err as { killed?: boolean; stderr?: string };
    if (e.killed) throw new AppError(504, 'Clonar el repositorio tardó demasiado.');
    if (/not found|could not read Username|Authentication failed/i.test(e.stderr ?? '')) throw notFound(ref);
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
    const text = await readFile(join(dir, '.git', 'shallow'), 'utf8');
    return new Set(text.split('\n').map((l) => l.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function notFound(ref: RepoRef) {
  return new AppError(404, `No encontramos ${ref.owner}/${ref.name}. ¿Es público y está bien escrito?`);
}
