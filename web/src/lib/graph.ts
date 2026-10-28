import type { Edge, FileNode, RepoMap } from '../types';

export interface GraphIndex {
  imports: Map<string, string[]>;
  importedBy: Map<string, string[]>;
  byId: Map<string, FileNode>;
}

export interface Filters {
  hideTests: boolean;
  hideIsolated: boolean;
}

export function indexGraph(map: RepoMap): GraphIndex {
  const imports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>();
  const push = (target: Map<string, string[]>, key: string, value: string) => {
    const list = target.get(key);
    if (list) list.push(value);
    else target.set(key, [value]);
  };
  for (const { source, target } of map.edges) {
    push(imports, source, target);
    push(importedBy, target, source);
  }
  return { imports, importedBy, byId: new Map(map.nodes.map((n) => [n.id, n])) };
}

export const isIsolated = (node: FileNode) => node.fanIn === 0 && node.fanOut === 0;

export function filterGraph(map: RepoMap, filters: Filters): { nodes: FileNode[]; edges: Edge[] } {
  const nodes = map.nodes.filter((n) => !(filters.hideTests && n.test) && !(filters.hideIsolated && isIsolated(n)));
  const kept = new Set(nodes.map((n) => n.id));
  return { nodes, edges: map.edges.filter((e) => kept.has(e.source) && kept.has(e.target)) };
}

export function rankGroups(nodes: FileNode[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.group, (counts.get(n.group) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function topBy(nodes: FileNode[], key: 'fanIn' | 'heat', limit: number): FileNode[] {
  return nodes.filter((n) => n[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, limit);
}

export function neighbourhood(index: GraphIndex, id: string): Set<string> {
  return new Set([id, ...(index.imports.get(id) ?? []), ...(index.importedBy.get(id) ?? [])]);
}
