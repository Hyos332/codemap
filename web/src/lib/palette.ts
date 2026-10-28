import type { Theme } from './theme';

const FOLDER_HUES: Record<Theme, string[]> = {
  light: ['#2f6690', '#b5652b', '#5b7f3a', '#8c4f7d', '#2e8077', '#a8842c', '#5d5ba0', '#9a4b3f'],
  dark: ['#74a7d2', '#e0975c', '#97bb6d', '#cb8dba', '#66bbb0', '#dbb85c', '#9c9ad9', '#dc8977'],
};

export const COLORED_GROUPS = FOLDER_HUES.light.length;

export function folderColors(rankedGroups: string[], theme: Theme): Map<string, string> {
  const hues = FOLDER_HUES[theme];
  return new Map(rankedGroups.slice(0, hues.length).map((group, i) => [group, hues[i]!]));
}

export function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const t = Math.max(0, Math.min(1, amount));
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(' ')})`;
}

function parseHex(hex: string): number[] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}
