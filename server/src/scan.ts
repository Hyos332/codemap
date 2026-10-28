import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Lang } from './types.js';

const MAX_FILES = 5000;
const MAX_FILE_BYTES = 512 * 1024;

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'bower_components', 'vendor', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.output', '.turbo', '.cache', '.parcel-cache',
  '__pycache__', '.venv', 'venv', 'site-packages', '.tox', '.mypy_cache',
  'public', 'storage', 'target', '.idea', '.vscode',
]);

const LANG_BY_EXT: Record<string, Lang> = {
  '.ts': 'ts', '.tsx': 'ts', '.mts': 'ts', '.cts': 'ts',
  '.js': 'js', '.jsx': 'js', '.mjs': 'js', '.cjs': 'js',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.py': 'py',
  '.php': 'php',
};

const CONFIG_FILE = /^(?:(?:tsconfig|jsconfig)(?:\.[\w-]+)?\.json|package\.json|composer\.json|pyproject\.toml|setup\.py)$/;

export interface SourceFile {
  path: string;
  lang: Lang;
  content: string;
}

export interface ScanResult {
  files: SourceFile[];
  configs: Map<string, string>;
  truncated: boolean;
}

export async function scanRepo(root: string): Promise<ScanResult> {
  const files: SourceFile[] = [];
  const configs = new Map<string, string>();
  let truncated = false;
  const queue: string[] = [''];

  while (queue.length > 0) {
    const rel = queue.shift()!;
    const entries = await readdir(join(root, rel), { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) queue.push(path);
        continue;
      }
      if (!entry.isFile()) continue;

      const isConfig = CONFIG_FILE.test(entry.name);
      const lang = langOf(entry.name);
      const isSource = lang !== null && files.length < MAX_FILES;
      if (lang && !isSource) truncated = true;
      if (!isConfig && !isSource) continue;

      const content = await readSmall(join(root, path));
      if (content === null) continue;
      if (isConfig) configs.set(path, content);
      if (isSource) files.push({ path, lang, content });
    }
  }

  return { files, configs, truncated };
}

export function langOf(fileName: string): Lang | null {
  if (/\.d\.[cm]?ts$/.test(fileName) || /[.-]min\.js$/.test(fileName)) return null;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return null;
  return LANG_BY_EXT[fileName.slice(dot).toLowerCase()] ?? null;
}

export function countLines(content: string): number {
  let count = 0;
  for (const line of content.split('\n')) if (line.trim() !== '') count++;
  return count;
}

export function isTestFile(path: string): boolean {
  return (
    /(^|\/)(__tests__|__mocks__|tests?|spec|specs|e2e|cypress)\//i.test(path) ||
    /\.(test|spec|stories)\.[a-z]+$/i.test(path) ||
    /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(path) ||
    /Test\.php$/.test(path)
  );
}

export function groupOf(path: string): string {
  const dirs = path.split('/').slice(0, -1);
  if (dirs.length === 0) return '/';
  const [first, second, third] = dirs;
  if ((first === 'packages' || first === 'apps' || first === 'libs') && second) return `${first}/${second}`;
  if (['src', 'lib', 'app', 'source'].includes(first!) && second) return `${first}/${second}`;
  if (first === 'resources' && second === 'js' && third) return `resources/js/${third}`;
  return first!;
}

async function readSmall(path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    if (info.size > MAX_FILE_BYTES) return null;
    const content = await readFile(path, 'utf8');
    return content.includes('\u0000') ? null : content;
  } catch {
    return null;
  }
}
