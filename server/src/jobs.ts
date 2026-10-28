import { analyzeRepo } from './analyze.js';
import { repoSlug } from './repoRef.js';
import type { RepoMap, RepoRef, Stage } from './types.js';

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_LIMIT = 40;
const MAX_CONCURRENT = 2;

interface Job {
  stage: Stage;
  listeners: Set<(stage: Stage) => void>;
  promise: Promise<RepoMap>;
}

const cache = new Map<string, { map: RepoMap; at: number }>();
const running = new Map<string, Job>();
const waiting: (() => void)[] = [];
let active = 0;

export function requestMap(ref: RepoRef, onStage: (stage: Stage) => void): { result: Promise<RepoMap>; detach: () => void } {
  const key = repoSlug(ref).toLowerCase();

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { result: Promise.resolve(cached.map), detach: () => {} };
  }

  const current = running.get(key) ?? startJob(key, ref);
  current.listeners.add(onStage);
  onStage(current.stage);
  return { result: current.promise, detach: () => current.listeners.delete(onStage) };
}

function startJob(key: string, ref: RepoRef): Job {
  const job: Omit<Job, 'promise'> = { stage: 'queue', listeners: new Set() };
  const promise = withSlot(() =>
    analyzeRepo(ref, (stage) => {
      job.stage = stage;
      for (const listener of job.listeners) listener(stage);
    }),
  )
    .then((map) => {
      cache.delete(key);
      cache.set(key, { map, at: Date.now() });
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      return map;
    })
    .finally(() => running.delete(key));
  const created = Object.assign(job, { promise });
  running.set(key, created);
  return created;
}

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}
