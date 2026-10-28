import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import type { ImportRef } from './imports.js';

export type Resolution = { file: string } | { external: string } | null;

const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte'];
const TS_EXTS = ['.ts', '.tsx', '.mts', '.cts'];
const ALIAS_BASES = ['src', 'resources/js', 'app', ''];
const NODE_BUILTINS = new Set(builtinModules);

const PY_STDLIB = new Set(
  ('__future__ abc argparse array ast asyncio base64 bisect builtins calendar codecs collections concurrent ' +
    'configparser contextlib copy csv ctypes dataclasses datetime decimal difflib enum errno fnmatch fractions ' +
    'functools gc getpass glob gzip hashlib heapq hmac html http importlib inspect io ipaddress itertools json ' +
    'locale logging math mimetypes multiprocessing operator os pathlib pickle platform pprint queue random re ' +
    'secrets select shlex shutil signal socket sqlite3 ssl stat statistics string struct subprocess sys tarfile ' +
    'tempfile textwrap threading time timeit traceback types typing unicodedata unittest urllib uuid warnings ' +
    'weakref xml zipfile zlib').split(' '),
);

interface AliasScope {
  dir: string;
  baseUrl: string | null;
  paths: [pattern: string, targets: string[]][];
}

interface Workspace {
  dir: string;
  entries: string[];
}

type Finder = (path: string) => string | null;

export class Resolver {
  private readonly aliasScopes: AliasScope[] = [];
  private readonly workspaces = new Map<string, Workspace>();
  private readonly packageDirs: string[] = [''];
  private readonly psr4: [prefix: string, dirs: string[]][] = [];
  private readonly pyRoots = new Set(['', 'src', 'lib']);
  private readonly findJs: Finder = (path) => this.findWithExtensions(path, jsCandidates);
  private readonly findPy: Finder = (path) => this.findWithExtensions(path, pyCandidates);
  private readonly findExact: Finder = (path) => this.findWithExtensions(path, (base) => [base]);

  constructor(
    private readonly files: Set<string>,
    configs: Map<string, string>,
  ) {
    const scopesByDir = new Map<string, AliasScope>();
    for (const [path, content] of configs) {
      const dir = dirOf(path);
      const name = posix.basename(path);
      if (/^(tsconfig|jsconfig)/.test(name)) this.addAliasConfig(scopesByDir, dir, content);
      else if (name === 'package.json') this.addPackage(dir, content);
      else if (name === 'composer.json') this.addComposer(dir, content);
      else this.pyRoots.add(dir).add(posix.join(dir, 'src'));
    }

    for (const scope of scopesByDir.values()) {
      if (scope.paths.length > 0 && scope.baseUrl === null) scope.baseUrl = scope.dir;
      this.aliasScopes.push(scope);
    }
    this.aliasScopes.sort((a, b) => b.dir.length - a.dir.length);
    this.packageDirs.sort((a, b) => b.length - a.length);
    this.psr4.sort((a, b) => b[0].length - a[0].length);
  }

  resolve(from: string, ref: ImportRef): Resolution {
    const first = this.resolveSpec(from, ref.kind, ref.spec);
    if (isFile(first) || ref.fallback === undefined) return first;
    const second = this.resolveSpec(from, ref.kind, ref.fallback);
    return isFile(second) ? second : first;
  }

  private addAliasConfig(scopesByDir: Map<string, AliasScope>, dir: string, content: string) {
    const options = (parseJsonc(content) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | null)?.compilerOptions;
    if (!options) return;
    const scope = scopesByDir.get(dir) ?? { dir, baseUrl: null, paths: [] };
    if (options.baseUrl) scope.baseUrl = posix.join(dir, options.baseUrl);
    for (const [pattern, targets] of Object.entries(options.paths ?? {})) {
      if (Array.isArray(targets)) scope.paths.push([pattern, targets]);
    }
    scopesByDir.set(dir, scope);
  }

  private addPackage(dir: string, content: string) {
    if (!dir) return;
    this.packageDirs.push(dir);
    const pkg = parseJsonc(content) as { name?: string; main?: string; module?: string; source?: string } | null;
    if (!pkg?.name) return;
    const sourceOf = (entry?: string) => entry?.replace(/^\.?\/?(dist|lib|build|esm|cjs)\//, 'src/');
    const entries = [pkg.source, sourceOf(pkg.module), sourceOf(pkg.main), 'src/index', 'index', pkg.module, pkg.main];
    this.workspaces.set(pkg.name, { dir, entries: entries.filter((e): e is string => !!e) });
  }

  private addComposer(dir: string, content: string) {
    const autoload = (parseJsonc(content) as { autoload?: { 'psr-4'?: Record<string, string | string[]> } } | null)?.autoload?.['psr-4'];
    for (const [prefix, target] of Object.entries(autoload ?? {})) {
      const dirs = (Array.isArray(target) ? target : [target]).map((t) => posix.join(dir, t));
      this.psr4.push([prefix.replace(/\\+$/, ''), dirs]);
    }
  }

  private resolveSpec(from: string, kind: ImportRef['kind'], spec: string): Resolution {
    switch (kind) {
      case 'js':
        return this.resolveJs(from, spec.split('?')[0]!);
      case 'py':
        return this.resolvePy(from, spec);
      case 'php-class':
        return this.resolvePhpClass(spec.replace(/^\\/, ''));
      case 'php-path':
        return firstFile([posix.join(dirOf(from), spec)], this.findExact);
    }
  }

  private resolveJs(from: string, spec: string): Resolution {
    if (spec.startsWith('.')) return firstFile([posix.join(dirOf(from), spec)], this.findJs);
    if (spec.startsWith('/')) return firstFile([spec.slice(1)], this.findJs);

    const aliased = this.aliasCandidates(from, spec);
    const workspace = this.findWorkspace(spec);
    const local = firstFile([...aliased, ...(workspace ? workspaceCandidates(workspace, spec) : [])], this.findJs);
    if (local || /^[@~#]\//.test(spec)) return local;

    if (spec.startsWith('node:') || NODE_BUILTINS.has(spec.split('/')[0]!)) return null;
    return /^[\w@][\w.@/-]*$/.test(spec) ? { external: packageName(spec) } : null;
  }

  private aliasCandidates(from: string, spec: string): string[] {
    const candidates: string[] = [];
    const scope = this.aliasScopes.find((s) => isInside(from, s.dir));
    if (scope) {
      const base = scope.baseUrl ?? scope.dir;
      for (const [pattern, targets] of scope.paths) {
        const match = matchPattern(pattern, spec);
        if (match !== null) candidates.push(...targets.map((t) => posix.join(base, t.replace('*', match))));
      }
      if (scope.baseUrl !== null) candidates.push(posix.join(scope.baseUrl, spec));
    }
    if (/^[@~#]\//.test(spec)) {
      const pkgDir = this.packageDirs.find((d) => isInside(from, d)) ?? '';
      candidates.push(...ALIAS_BASES.map((d) => posix.join(pkgDir, d, spec.slice(2))));
    }
    return candidates;
  }

  private findWorkspace(spec: string): (Workspace & { name: string }) | null {
    let best: (Workspace & { name: string }) | null = null;
    for (const [name, ws] of this.workspaces) {
      const matches = spec === name || spec.startsWith(`${name}/`);
      if (matches && (!best || name.length > best.name.length)) best = { name, ...ws };
    }
    return best;
  }

  private resolvePy(from: string, spec: string): Resolution {
    const dots = /^\.*/.exec(spec)![0].length;
    const modulePath = spec.slice(dots).split('.').filter(Boolean).join('/');

    if (dots > 0) {
      let base = dirOf(from);
      for (let i = 1; i < dots; i++) base = dirOf(base);
      return firstFile([posix.join(base, modulePath)], this.findPy);
    }

    const local = firstFile([...this.pyRoots].map((root) => posix.join(root, modulePath)), this.findPy);
    if (local) return local;
    const top = spec.split('.')[0]!;
    return PY_STDLIB.has(top) ? null : { external: top };
  }

  private resolvePhpClass(name: string): Resolution {
    const candidates = this.psr4
      .filter(([prefix]) => !prefix || name.startsWith(`${prefix}\\`))
      .flatMap(([prefix, dirs]) => {
        const rest = (prefix ? name.slice(prefix.length + 1) : name).replace(/\\/g, '/');
        return dirs.map((dir) => posix.join(dir, `${rest}.php`));
      });
    const local = firstFile(candidates, this.findExact);
    if (local) return local;
    return name.includes('\\') ? { external: name.split('\\')[0]! } : null;
  }

  private findWithExtensions(path: string, expand: (base: string) => string[]): string | null {
    const base = posix.normalize(path).replace(/^\.\/|\/$/g, '');
    if (base === '..' || base.startsWith('../')) return null;
    return expand(base === '.' ? '' : base).find((candidate) => this.files.has(candidate)) ?? null;
  }
}

function jsCandidates(base: string): string[] {
  const jsExt = /\.[mc]?jsx?$/.exec(base);
  const stem = jsExt ? base.slice(0, -jsExt[0].length) : null;
  return [
    base,
    ...(stem === null ? [] : TS_EXTS.map((ext) => stem + ext)),
    ...JS_EXTS.map((ext) => base + ext),
    ...JS_EXTS.map((ext) => posix.join(base, `index${ext}`)),
  ];
}

function pyCandidates(base: string): string[] {
  return base ? [`${base}.py`, `${base}/__init__.py`] : ['__init__.py'];
}

function workspaceCandidates(workspace: Workspace & { name: string }, spec: string): string[] {
  const subpath = spec.slice(workspace.name.length + 1);
  const paths = subpath ? [posix.join('src', subpath), subpath] : workspace.entries;
  return paths.map((p) => posix.join(workspace.dir, p));
}

function firstFile(candidates: string[], find: Finder): Resolution {
  for (const candidate of candidates) {
    const file = find(candidate);
    if (file) return { file };
  }
  return null;
}

function isFile(resolution: Resolution): resolution is { file: string } {
  return resolution !== null && 'file' in resolution;
}

function dirOf(path: string): string {
  const dir = posix.dirname(path);
  return dir === '.' ? '' : dir;
}

function isInside(file: string, dir: string): boolean {
  return dir === '' || file.startsWith(`${dir}/`);
}

function matchPattern(pattern: string, spec: string): string | null {
  const star = pattern.indexOf('*');
  if (star === -1) return pattern === spec ? '' : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (spec.length < prefix.length + suffix.length || !spec.startsWith(prefix) || !spec.endsWith(suffix)) return null;
  return spec.slice(prefix.length, spec.length - suffix.length);
}

function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') && parts[1] ? `${parts[0]}/${parts[1]}` : parts[0]!;
}

export function parseJsonc(text: string): unknown {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) break;
      i++;
    } else {
      out += ch;
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}
