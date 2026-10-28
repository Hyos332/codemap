import type { Filters } from '../lib/graph';
import { formatMonth, formatNumber, plural } from '../lib/format';
import type { RepoMap } from '../types';
import styles from './ControlPanel.module.css';

export type ColorMode = 'folder' | 'heat';
export type SizeMode = 'fanIn' | 'loc';

interface Props {
  colorMode: ColorMode;
  onColorMode: (mode: ColorMode) => void;
  sizeMode: SizeMode;
  onSizeMode: (mode: SizeMode) => void;
  filters: Filters;
  onFilters: (filters: Filters) => void;
  counts: { tests: number; isolated: number };
  groups: { name: string; count: number }[];
  groupColors: Map<string, string>;
  coldColor: string;
  highlightGroup: string | null;
  onHighlightGroup: (group: string | null) => void;
  stats: RepoMap['stats'];
}

export function ControlPanel(props: Props) {
  const { filters, onFilters, counts } = props;
  const toggles: { key: keyof Filters; label: string; count: number }[] = [
    { key: 'hideTests', label: 'Tests', count: counts.tests },
    { key: 'hideIsolated', label: 'Archivos sueltos', count: counts.isolated },
  ];

  return (
    <aside className={styles.panel} aria-label="Opciones del mapa">
      <section>
        <h3 className="eyebrow">Color</h3>
        <Segmented
          value={props.colorMode}
          onChange={props.onColorMode}
          options={[
            ['folder', 'Carpeta'],
            ['heat', 'Calor'],
          ]}
        />
      </section>

      <section>
        <h3 className="eyebrow">Tamaño</h3>
        <Segmented
          value={props.sizeMode}
          onChange={props.onSizeMode}
          options={[
            ['fanIn', 'Importancia'],
            ['loc', 'Líneas'],
          ]}
        />
      </section>

      <section>
        <h3 className="eyebrow">Mostrar</h3>
        {toggles.map(({ key, label, count }) => (
          <label key={key} className={styles.check}>
            <input type="checkbox" checked={!filters[key]} onChange={(e) => onFilters({ ...filters, [key]: !e.target.checked })} />
            <span className={styles.box} aria-hidden="true" />
            <span>{label}</span>
            <span className="mono">{formatNumber(count)}</span>
          </label>
        ))}
      </section>

      <section>{props.colorMode === 'folder' ? <FolderLegend {...props} /> : <HeatLegend {...props} />}</section>

      {props.stats.truncated && <p className={styles.note}>Repositorio muy grande: se muestran los primeros {formatNumber(props.stats.files)} archivos.</p>}
    </aside>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: [T, string][] }) {
  return (
    <div className={styles.segmented} role="radiogroup">
      {options.map(([option, label]) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function FolderLegend({ groups, groupColors, coldColor, highlightGroup, onHighlightGroup }: Props) {
  const colored = groups.filter((g) => groupColors.has(g.name));
  const rest = groups.length - colored.length;
  const restCount = groups.slice(colored.length).reduce((sum, g) => sum + g.count, 0);

  return (
    <>
      <h3 className="eyebrow">Carpetas</h3>
      <ul className={styles.legend}>
        {colored.map((g) => (
          <li key={g.name}>
            <button
              type="button"
              aria-pressed={highlightGroup === g.name}
              data-dimmed={(highlightGroup !== null && highlightGroup !== g.name) || undefined}
              onClick={() => onHighlightGroup(highlightGroup === g.name ? null : g.name)}
            >
              <span className={styles.swatch} style={{ background: groupColors.get(g.name) }} />
              <span className={`${styles.groupName} mono`}>{g.name}</span>
              <span className="mono">{g.count}</span>
            </button>
          </li>
        ))}
        {rest > 0 && (
          <li className={styles.rest}>
            <span className={styles.swatch} style={{ background: coldColor }} />
            <span className={`${styles.groupName} mono`}>{plural(rest, 'carpeta más', 'carpetas más')}</span>
            <span className="mono">{restCount}</span>
          </li>
        )}
      </ul>
    </>
  );
}

function HeatLegend({ stats }: Props) {
  return (
    <>
      <h3 className="eyebrow">Calor</h3>
      <div className={styles.ramp} aria-hidden="true" />
      <div className={`${styles.rampLabels} mono`}>
        <span>estable</span>
        <span>cambia mucho</span>
      </div>
      <p className={styles.note}>
        Commits × tamaño en los últimos {formatNumber(stats.commits)} commits{stats.since ? `, desde ${formatMonth(stats.since)}` : ''}. Los anillos marcan los
        archivos más inestables.
      </p>
    </>
  );
}
