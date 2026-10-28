import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHistory, type History } from './history.js';
import { extractImports } from './imports.js';
import { cloneRepo, fetchMeta } from './repo.js';
import { Resolver } from './resolve.js';
import { countLines, groupOf, isTestFile, scanRepo, type SourceFile } from './scan.js';
import type { Edge, FileNode, RepoMap, RepoRef, Stage } from './types.js';

export async function analyzeRepo(ref: RepoRef, onStage: (stage: Stage) => void): Promise<RepoMap> {
  const started = Date.now();

  onStage('meta');
  const meta = await fetchMeta(ref);

  const dir = await mkdtemp(join(tmpdir(), 'codemap-'));
  try {
    onStage('clone');
    const { branch, sha } = await cloneRepo(ref, dir);

    onStage('scan');
    const scan = await scanRepo(dir);

    onStage('imports');
    const graph = buildGraph(scan.files, scan.configs);

    onStage('history');
    const history = await readHistory(dir);
    const nodes = buildNodes(scan.files, graph.edges, history);

    const languages = Object.fromEntries(countBy(scan.files.map((f) => f.lang)));

    return {
      repo: { ...ref, url: `https://github.com/${ref.owner}/${ref.name}`, branch, sha, ...meta },
      stats: {
        files: nodes.length,
        edges: graph.edges.length,
        commits: history.commits,
        since: history.since,
        languages,
        truncated: scan.truncated,
        durationMs: Date.now() - started,
      },
      nodes,
      edges: graph.edges,
      externals: graph.externals,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function buildGraph(files: SourceFile[], configs: Map<string, string>) {
  const resolver = new Resolver(new Set(files.map((f) => f.path)), configs);
  const edges: Edge[] = [];
  const externals = new Map<string, number>();

  for (const file of files) {
    const targets = new Set<string>();
    const packages = new Set<string>();
    for (const ref of extractImports(file.lang, file.content)) {
      const result = resolver.resolve(file.path, ref);
      if (!result) continue;
      if ('file' in result) {
        if (result.file !== file.path) targets.add(result.file);
      } else {
        packages.add(result.external);
      }
    }
    for (const target of targets) edges.push({ source: file.path, target });
    for (const pkg of packages) increment(externals, pkg);
  }

  const topExternals = [...externals]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 12);

  return { edges, externals: topExternals };
}

function buildNodes(files: SourceFile[], edges: Edge[], history: History): FileNode[] {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const { source, target } of edges) {
    increment(fanOut, source);
    increment(fanIn, target);
  }

  const nodes: FileNode[] = files.map((file) => {
    const h = history.files.get(file.path);
    return {
      id: file.path,
      group: groupOf(file.path),
      lang: file.lang,
      loc: countLines(file.content),
      fanIn: fanIn.get(file.path) ?? 0,
      fanOut: fanOut.get(file.path) ?? 0,
      commits: h?.commits ?? 0,
      authors: h?.authors.size ?? 0,
      lastChange: h?.lastChange ?? null,
      heat: 0,
      test: isTestFile(file.path),
    };
  });

  const maxCommits = Math.max(1, ...nodes.map((n) => n.commits));
  const maxLoc = Math.max(1, ...nodes.map((n) => n.loc));
  const raw = nodes.map((n) => (n.commits / maxCommits) * (Math.log1p(n.loc) / Math.log1p(maxLoc)));
  const maxRaw = Math.max(...raw, 0);
  nodes.forEach((n, i) => {
    n.heat = maxRaw > 0 ? Math.round((raw[i]! / maxRaw) * 1000) / 1000 : 0;
  });
  return nodes;
}

function increment<K>(counts: Map<K, number>, key: K) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function countBy<K>(keys: K[]): Map<K, number> {
  const counts = new Map<K, number>();
  for (const key of keys) increment(counts, key);
  return counts;
}
