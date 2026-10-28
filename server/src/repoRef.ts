import type { Provider, RepoRef } from './types.js';

interface ProviderInfo {
  label: string;
  host: string;
  nestedGroups: boolean;
  fileUrl: (repoUrl: string, sha: string, path: string) => string;
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  github: { label: 'GitHub', host: 'github.com', nestedGroups: false, fileUrl: (url, sha, path) => `${url}/blob/${sha}/${path}` },
  gitlab: { label: 'GitLab', host: 'gitlab.com', nestedGroups: true, fileUrl: (url, sha, path) => `${url}/-/blob/${sha}/${path}` },
  bitbucket: { label: 'Bitbucket', host: 'bitbucket.org', nestedGroups: false, fileUrl: (url, sha, path) => `${url}/src/${sha}/${path}` },
};

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_DEPTH = 20;

export function parseRepo(input: string): RepoRef | null {
  const location = input
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/^[a-z+]+:\/\//i, '')
    .replace(/^[^@/]+@/, '')
    .replace(/^([\w-]+(?:\.[\w-]+)+):/, '$1/')
    .replace(/^www\./i, '');

  const [first, ...rest] = location.split('/').filter(Boolean);
  if (!first) return null;
  const provider = (Object.keys(PROVIDERS) as Provider[]).find((p) => PROVIDERS[p].host === first.toLowerCase());
  if (!provider && first.includes('.')) return null;

  const chosen = provider ?? 'github';
  const segments = provider ? rest : [first, ...rest];
  const stop = segments.indexOf('-');
  const path = PROVIDERS[chosen].nestedGroups ? segments.slice(0, stop === -1 ? MAX_DEPTH + 1 : stop) : segments.slice(0, 2);
  if (path.length < 2) return null;

  const name = path.pop()!.replace(/\.git$/i, '');
  if (![...path, name].every((part) => SEGMENT.test(part) && !/^\.+$/.test(part))) return null;
  return { provider: chosen, owner: path.join('/'), name };
}

export const repoPath = (ref: RepoRef) => `${ref.owner}/${ref.name}`;

export const repoUrl = (ref: RepoRef) => `https://${PROVIDERS[ref.provider].host}/${repoPath(ref)}`;

export const repoSlug = (ref: RepoRef) => (ref.provider === 'github' ? repoPath(ref) : `${PROVIDERS[ref.provider].host}/${repoPath(ref)}`);
