import { git } from './git.js';
import { HISTORY_DEPTH, shallowBoundary } from './repo.js';

export interface FileHistory {
  commits: number;
  authors: Set<string>;
  lastChange: string;
}

export interface History {
  commits: number;
  since: string | null;
  files: Map<string, FileHistory>;
}

const RECORD = '\u001e';
const FIELD = '\u001f';

export async function readHistory(dir: string): Promise<History> {
  const [log, boundary] = await Promise.all([
    git(
      ['-c', 'core.quotepath=off', 'log', '--no-merges', '--name-only', `-n${HISTORY_DEPTH}`, `--format=${RECORD}%H${FIELD}%an${FIELD}%aI`],
      { cwd: dir, timeout: 60_000 },
    ),
    shallowBoundary(dir),
  ]);
  return parseLog(log, boundary);
}

export function parseLog(log: string, boundary: Set<string>): History {
  const files = new Map<string, FileHistory>();
  let commits = 0;
  let since: string | null = null;

  for (const record of log.split(RECORD)) {
    const lines = record.split('\n');
    const [hash, author, date] = (lines[0] ?? '').split(FIELD);
    if (!hash || !author || !date) continue;
    if (boundary.has(hash)) continue;

    commits++;
    since = date;
    for (const line of lines.slice(1)) {
      const path = line.trim();
      if (!path) continue;
      const entry = files.get(path);
      if (entry) {
        entry.commits++;
        entry.authors.add(author);
      } else {
        files.set(path, { commits: 1, authors: new Set([author]), lastChange: date });
      }
    }
  }
  return { commits, since, files };
}
