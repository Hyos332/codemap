import { useState } from 'react';
import { formatNumber, formatRelative, plural, splitPath } from '../lib/format';
import { topBy, type GraphIndex } from '../lib/graph';
import { PROVIDERS, type FileNode, type Lang, type RepoMap } from '../types';
import styles from './Inspector.module.css';

const LANG_NAMES: Record<Lang, string> = { ts: 'TypeScript', js: 'JavaScript', vue: 'Vue', svelte: 'Svelte', py: 'Python', php: 'PHP' };
const LIST_PREVIEW = 8;

interface Props {
  map: RepoMap;
  index: GraphIndex;
  node: FileNode | null;
  colorOf: (node: FileNode) => string;
  onInspect: (id: string) => void;
  onClose: () => void;
}

export function Inspector(props: Props) {
  return (
    <aside className={styles.inspector} aria-label={props.node ? 'Detalle del archivo' : 'Resumen del repositorio'}>
      {props.node ? <FileDetail {...props} node={props.node} /> : <Summary {...props} />}
    </aside>
  );
}

function Summary({ map, colorOf, onInspect }: Props) {
  const languages = Object.entries(map.stats.languages).sort(([, a], [, b]) => b - a);

  return (
    <div key="summary" className={styles.body}>
      <p className="eyebrow">Resumen</p>
      <h2 className={styles.title}>{map.repo.name}</h2>
      {map.repo.description && <p className={styles.description}>{map.repo.description}</p>}
      <p className={`${styles.languages} mono`}>
        {languages.map(([lang, count]) => (
          <span key={lang}>
            {LANG_NAMES[lang as Lang]} {formatNumber(count)}
          </span>
        ))}
      </p>

      <FileList title="Archivos clave" hint="los más importados" files={topBy(map.nodes, 'fanIn', 6)} metric={(n) => plural(n.fanIn, 'uso', 'usos')} colorOf={colorOf} onInspect={onInspect} />
      <FileList title="Zonas calientes" hint="cambio × tamaño" files={topBy(map.nodes, 'heat', 6)} metric={(n) => plural(n.commits, 'commit', 'commits')} colorOf={colorOf} onInspect={onInspect} />

      {map.externals.length > 0 && (
        <section className={styles.section}>
          <h3 className="eyebrow">Dependencias externas</h3>
          <ul className={styles.chips}>
            {map.externals.map((ext) => (
              <li key={ext.name} className="mono">
                {ext.name}
                <span>{ext.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.tip}>Haz clic en un punto del mapa para ver de qué depende ese archivo y quién depende de él.</p>
    </div>
  );
}

function FileDetail({ map, index, node, colorOf, onInspect, onClose }: Props & { node: FileNode }) {
  const { dir, name } = splitPath(node.id);
  const filesFor = (ids: string[] | undefined) => (ids ?? []).map((id) => index.byId.get(id)).filter((n): n is FileNode => n !== undefined);
  const metrics: [string, string][] = [
    ['Líneas', formatNumber(node.loc)],
    ['Importado por', formatNumber(node.fanIn)],
    ['Importa', formatNumber(node.fanOut)],
    ['Commits', formatNumber(node.commits)],
    ['Autores', formatNumber(node.authors)],
    ['Último cambio', formatRelative(node.lastChange)],
  ];

  return (
    <div key={node.id} className={styles.body}>
      <div className={styles.detailTop}>
        <p className={`${styles.path} mono`}>
          <span className={styles.dot} style={{ background: colorOf(node) }} />
          {dir || 'raíz'}
        </p>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar detalle">
          ×
        </button>
      </div>
      <h2 className={`${styles.title} ${styles.fileName}`}>{name}</h2>
      <p className={`${styles.languages} mono`}>
        <span>{LANG_NAMES[node.lang]}</span>
        {node.test && <span>test</span>}
      </p>

      <dl className={styles.metrics}>
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt className="eyebrow">{label}</dt>
            <dd className="mono">{value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.heat}>
        <span className="eyebrow">Calor</span>
        <span className={styles.meter}>
          <span style={{ width: `${Math.max(node.heat * 100, 2)}%` }} />
        </span>
        <span className="mono">{Math.round(node.heat * 100)}</span>
      </div>

      <FileList title="Importado por" files={filesFor(index.importedBy.get(node.id))} colorOf={colorOf} onInspect={onInspect} accent />
      <FileList title="Importa" files={filesFor(index.imports.get(node.id))} colorOf={colorOf} onInspect={onInspect} />

      <a className={styles.external} href={PROVIDERS[map.repo.provider].fileUrl(map.repo.url, map.repo.sha, node.id)} target="_blank" rel="noreferrer">
        Abrir en {PROVIDERS[map.repo.provider].label} <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}

interface FileListProps {
  title: string;
  hint?: string;
  files: FileNode[];
  metric?: (node: FileNode) => string;
  accent?: boolean;
  colorOf: (node: FileNode) => string;
  onInspect: (id: string) => void;
}

function FileList({ title, hint, files, metric, accent, colorOf, onInspect }: FileListProps) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? files : files.slice(0, LIST_PREVIEW);

  return (
    <section className={styles.section}>
      <h3 className={`eyebrow ${styles.listTitle}`} data-accent={accent || undefined}>
        {title}
        <span>{hint ?? formatNumber(files.length)}</span>
      </h3>
      {files.length === 0 ? (
        <p className={styles.empty}>Ninguno.</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((file) => {
            const { dir, name } = splitPath(file.id);
            return (
              <li key={file.id}>
                <button type="button" onClick={() => onInspect(file.id)} title={file.id}>
                  <span className={styles.dot} style={{ background: colorOf(file) }} />
                  <span className={styles.fileLabel}>
                    <span>{name}</span>
                    <span className="mono">{dir}</span>
                  </span>
                  {metric && <span className={`${styles.metric} mono`}>{metric(file)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {files.length > LIST_PREVIEW && (
        <button type="button" className={styles.more} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Ver menos' : `Ver los ${formatNumber(files.length)}`}
        </button>
      )}
    </section>
  );
}
