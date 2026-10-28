import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { filterGraph, indexGraph, isIsolated, rankGroups, type Filters } from '../lib/graph';
import { folderColors, mix } from '../lib/palette';
import { readTokens } from '../lib/theme';
import { useMediaQuery } from '../lib/useMediaQuery';
import type { FileNode, RepoMap } from '../types';
import { ControlPanel, type ColorMode, type SizeMode } from './ControlPanel';
import { GraphCanvas, type GraphHandle, type Insets } from './GraphCanvas';
import { Inspector } from './Inspector';
import { MapHeader } from './MapHeader';
import styles from './MapView.module.css';
import { SearchPalette } from './SearchPalette';
import type { ThemeProps } from './ui';

const LAYOUT = { header: 60, panel: 252, inspector: 348, gap: 16 };

const RADIUS: Record<SizeMode, (node: FileNode) => number> = {
  fanIn: (n) => 2.6 + Math.min(13, Math.sqrt(n.fanIn) * 2),
  loc: (n) => 2.2 + Math.min(13, Math.sqrt(n.loc) / 4.5),
};

interface Props extends ThemeProps {
  map: RepoMap;
  onHome: () => void;
}

export function MapView({ map, theme, onToggleTheme, onHome }: Props) {
  const graph = useRef<GraphHandle>(null);
  const compact = useMediaQuery('(max-width: 900px)');
  const [colorMode, setColorMode] = useState<ColorMode>('folder');
  const [sizeMode, setSizeMode] = useState<SizeMode>('fanIn');
  const [filters, setFilters] = useState<Filters>({ hideTests: false, hideIsolated: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightGroup, setHighlightGroup] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const tokens = useMemo(readTokens, [theme]);
  const index = useMemo(() => indexGraph(map), [map]);
  const groups = useMemo(() => rankGroups(map.nodes), [map]);
  const groupColors = useMemo(() => folderColors(groups.map((g) => g.name), theme), [groups, theme]);
  const visible = useMemo(() => filterGraph(map, filters), [map, filters]);
  const visibleIds = useMemo(() => new Set(visible.nodes.map((n) => n.id)), [visible]);
  const counts = useMemo(() => ({ tests: map.nodes.filter((n) => n.test).length, isolated: map.nodes.filter(isIsolated).length }), [map]);

  const colorOf = useMemo(
    () => (colorMode === 'heat' ? (n: FileNode) => mix(tokens.cold, tokens.accent, Math.sqrt(n.heat)) : (n: FileNode) => groupColors.get(n.group) ?? tokens.cold),
    [colorMode, tokens, groupColors],
  );

  const insets = useMemo<Insets>(
    () =>
      compact
        ? { top: LAYOUT.header, right: 0, bottom: 0, left: 0 }
        : { top: LAYOUT.header + LAYOUT.gap, right: LAYOUT.inspector + LAYOUT.gap * 2, bottom: LAYOUT.gap, left: LAYOUT.panel + LAYOUT.gap * 2 },
    [compact],
  );

  const activeId = selectedId !== null && visibleIds.has(selectedId) ? selectedId : null;
  const activeNode = activeId ? index.byId.get(activeId) ?? null : null;

  const inspect = useCallback((id: string) => {
    setSelectedId(id);
    graph.current?.focus(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape' && !typing) {
        setSelectedId(null);
        setHighlightGroup(null);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const layoutVars = {
    '--header-h': `${LAYOUT.header}px`,
    '--panel-w': `${LAYOUT.panel}px`,
    '--inspector-w': `${LAYOUT.inspector}px`,
    '--gap': `${LAYOUT.gap}px`,
  } as CSSProperties;

  return (
    <div className={styles.view} style={layoutVars}>
      <MapHeader
        map={map}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onHome={onHome}
        onSearch={() => setSearchOpen(true)}
        onTogglePanel={compact ? () => setPanelOpen((open) => !open) : undefined}
      />

      <GraphCanvas
        ref={graph}
        nodes={visible.nodes}
        edges={visible.edges}
        index={index}
        radiusOf={RADIUS[sizeMode]}
        colorOf={colorOf}
        heatMode={colorMode === 'heat'}
        selectedId={activeId}
        highlightGroup={highlightGroup}
        insets={insets}
        tokens={tokens}
        onSelect={setSelectedId}
      />

      {(!compact || panelOpen) && (
        <ControlPanel
          colorMode={colorMode}
          onColorMode={setColorMode}
          sizeMode={sizeMode}
          onSizeMode={setSizeMode}
          filters={filters}
          onFilters={setFilters}
          counts={counts}
          groups={groups}
          groupColors={groupColors}
          coldColor={tokens.cold}
          highlightGroup={highlightGroup}
          onHighlightGroup={setHighlightGroup}
          stats={map.stats}
        />
      )}

      {(!compact || activeNode) && (
        <Inspector map={map} index={index} node={activeNode} colorOf={colorOf} onInspect={inspect} onClose={() => setSelectedId(null)} />
      )}

      {searchOpen && (
        <SearchPalette
          nodes={visible.nodes}
          colorOf={colorOf}
          onPick={(id) => {
            setSearchOpen(false);
            inspect(id);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}
