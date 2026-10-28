import type { RepoRef } from './types.js';

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

export function parseRepo(input: string): RepoRef | null {
  const cleaned = input
    .trim()
    .replace(/^git@github\.com:/i, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '')
    .replace(/[?#].*$/, '');
  const [owner, rawName] = cleaned.split('/');
  const name = rawName?.replace(/\.git$/i, '');
  if (!owner || !name) return null;
  for (const part of [owner, name]) {
    if (!SEGMENT.test(part) || /^\.+$/.test(part)) return null;
  }
  return { owner, name };
}

