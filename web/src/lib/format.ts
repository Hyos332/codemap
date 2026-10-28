const numberFormat = new Intl.NumberFormat('es-ES');
const compactFormat = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
const relativeFormat = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' });

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export const formatNumber = (n: number) => numberFormat.format(n);
export const formatCompact = (n: number) => compactFormat.format(n);
export const formatMonth = (iso: string) => dateFormat.format(new Date(iso));

export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const [unit, size] = RELATIVE_STEPS.find(([, ms]) => Math.abs(diff) >= ms) ?? ['minute', 60_000];
  return relativeFormat.format(Math.round(diff / size), unit);
}

export function splitPath(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? { dir: '', name: path } : { dir: path.slice(0, slash), name: path.slice(slash + 1) };
}

export const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;
