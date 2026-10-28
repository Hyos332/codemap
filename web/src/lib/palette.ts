import type { Theme } from './theme';

const FOLDER_HUES: Record<Theme, string[]> = {
  light: ['#2b3dff', '#0f9488', '#d9406f', '#7a4fd6', '#c98a0a', '#1f86c4', '#4f8a2b', '#b0563b'],
  dark: ['#7d8bff', '#3cc7b5', '#ff6f99', '#a98bff', '#f2b84b', '#5bb8f0', '#8cc95e', '#e48a6c'],
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
