import { useMemo, useState, type KeyboardEvent } from 'react';
import { splitPath } from '../lib/format';
import { topBy } from '../lib/graph';
import type { FileNode } from '../types';
import styles from './SearchPalette.module.css';
import { Kbd } from './ui';

const LIMIT = 12;

interface Props {
  nodes: FileNode[];
  colorOf: (node: FileNode) => string;
  onPick: (id: string) => void;
  onClose: () => void;
}

export function SearchPalette({ nodes, colorOf, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => search(nodes, query.trim().toLowerCase()), [nodes, query]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (e.key in moves) {
      e.preventDefault();
      setActive((i) => (i + moves[e.key]! + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter' && results[active]) {
      onPick(results[active].id);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.dialog} role="dialog" aria-label="Buscar archivo" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className={`${styles.input} mono`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Busca por nombre o ruta…"
          spellCheck={false}
          autoFocus
          aria-label="Nombre o ruta del archivo"
        />
        <ul className={styles.results} role="listbox">
          {results.map((node, i) => {
            const { dir, name } = splitPath(node.id);
            return (
              <li key={node.id} role="option" aria-selected={i === active}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => onPick(node.id)}>
                  <span className={styles.dot} style={{ background: colorOf(node) }} />
                  <span className={styles.name}>{name}</span>
                  <span className={`${styles.dir} mono`}>{dir}</span>
                </button>
              </li>
            );
          })}
          {results.length === 0 && <li className={styles.empty}>Ningún archivo coincide.</li>}
        </ul>
        <footer className={`${styles.footer} mono`}>
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navegar
          </span>
          <span>
            <Kbd>↵</Kbd> abrir
          </span>
          <span>
            <Kbd>esc</Kbd> cerrar
          </span>
        </footer>
      </div>
    </div>
  );
}

function search(nodes: FileNode[], query: string): FileNode[] {
  if (!query) return topBy(nodes, 'fanIn', LIMIT);
  return nodes
    .map((node) => ({ node, score: scoreOf(node.id.toLowerCase(), query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.node.id.length - b.node.id.length)
    .slice(0, LIMIT)
    .map((r) => r.node);
}

function scoreOf(path: string, query: string): number {
  const name = splitPath(path).name;
  if (name.startsWith(query)) return 4;
  if (name.includes(query)) return 3;
  if (path.includes(query)) return 2;
  let cursor = 0;
  for (const ch of path) if (ch === query[cursor]) cursor++;
  return cursor === query.length ? 1 : 0;
}
