import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent } from 'react';
import { neighbourhood, type GraphIndex } from '../lib/graph';
import type { Tokens } from '../lib/theme';
import type { Edge, FileNode } from '../types';
import styles from './GraphCanvas.module.css';

interface GraphNode extends SimulationNodeDatum {
  id: string;
  file: FileNode;
  radius: number;
  x: number;
  y: number;
}

interface GraphLink {
  source: GraphNode;
  target: GraphNode;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GraphHandle {
  focus: (id: string) => void;
  fit: () => void;
}

interface Props {
  nodes: FileNode[];
  edges: Edge[];
  index: GraphIndex;
  radiusOf: (node: FileNode) => number;
  colorOf: (node: FileNode) => string;
  heatMode: boolean;
  selectedId: string | null;
  highlightGroup: string | null;
  insets: Insets;
  tokens: Tokens;
  onSelect: (id: string | null) => void;
}

interface Scene {
  nodes: GraphNode[];
  links: GraphLink[];
  byId: Map<string, GraphNode>;
  landmarks: GraphNode[];
  transform: ZoomTransform;
  hoverId: string | null;
  width: number;
  height: number;
}

const LANDMARK_COUNT = 9;
const LABEL_ZOOM = 1.6;
const MAX_NEIGHBOUR_LABELS = 14;
const MAX_LABELS = 260;

export const GraphCanvas = forwardRef<GraphHandle, Props>(function GraphCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const scene = useRef<Scene>({ nodes: [], links: [], byId: new Map(), landmarks: [], transform: zoomIdentity, hoverId: null, width: 0, height: 0 });
  const simulation = useRef<Simulation<GraphNode, undefined>>(null);
  const zoomBehavior = useRef<ZoomBehavior<HTMLCanvasElement, unknown>>(null);
  const frame = useRef(0);
  const fitted = useRef(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hovering, setHovering] = useState(false);

  const requestPaint = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) paint(ctx, scene.current, propsRef.current);
    });
  };

  const animateTo = (transform: ZoomTransform) => {
    const canvas = canvasRef.current;
    if (canvas && zoomBehavior.current) select(canvas).transition().duration(750).call(zoomBehavior.current.transform, transform);
  };

  const viewportCenter = () => {
    const { width, height } = scene.current;
    const { insets } = propsRef.current;
    return { x: (insets.left + width - insets.right) / 2, y: (insets.top + height - insets.bottom) / 2 };
  };

  const fit = () => {
    const { nodes, width, height } = scene.current;
    if (nodes.length === 0) return;
    const { insets } = propsRef.current;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(
      (width - insets.left - insets.right) / Math.max(maxX - minX + 80, 1),
      (height - insets.top - insets.bottom) / Math.max(maxY - minY + 80, 1),
      2.4,
    );
    const center = viewportCenter();
    animateTo(zoomIdentity.translate(center.x - k * ((minX + maxX) / 2), center.y - k * ((minY + maxY) / 2)).scale(k));
  };

  const focus = (id: string) => {
    const node = scene.current.byId.get(id);
    if (!node) return;
    const k = Math.max(scene.current.transform.k, 1.9);
    const center = viewportCenter();
    animateTo(zoomIdentity.translate(center.x - k * node.x, center.y - k * node.y).scale(k));
  };

  useImperativeHandle(ref, () => ({ focus, fit }));

  useEffect(() => {
    const canvas = canvasRef.current!;
    let lastK = 1;
    const behavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.06, 8])
      .clickDistance(4)
      .on('zoom', (event: { transform: ZoomTransform }) => {
        scene.current.transform = event.transform;
        if (Math.abs(event.transform.k - lastK) > 0.01) {
          lastK = event.transform.k;
          setZoomLevel(lastK);
        }
        requestPaint();
      });
    zoomBehavior.current = behavior;
    select(canvas).call(behavior).on('dblclick.zoom', null);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      scene.current.width = rect.width;
      scene.current.height = rect.height;
      requestPaint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      simulation.current?.stop();
    };
  }, []);

  useEffect(() => {
    const previous = scene.current.byId;
    const groups = [...new Set(props.nodes.map((n) => n.group))];
    const spread = 34 * Math.sqrt(props.nodes.length + 1);

    const nodes: GraphNode[] = props.nodes.map((file) => {
      const old = previous.get(file.id);
      const angle = (groups.indexOf(file.group) / Math.max(groups.length, 1)) * Math.PI * 2;
      const x = old?.x ?? Math.cos(angle) * spread + (Math.random() - 0.5) * spread * 0.4;
      const y = old?.y ?? Math.sin(angle) * spread + (Math.random() - 0.5) * spread * 0.4;
      return { id: file.id, file, radius: props.radiusOf(file), x, y, vx: old?.vx, vy: old?.vy };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = props.edges.map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)! }));

    Object.assign(scene.current, {
      nodes,
      links,
      byId,
      landmarks: [...nodes].sort((a, b) => b.file.fanIn - a.file.fanIn).slice(0, LANDMARK_COUNT).filter((n) => n.file.fanIn > 0),
    });

    if (!fitted.current) {
      const { width, height } = scene.current;
      const k = Math.min(1, Math.min(width, height) / (spread * 2.6 + 120));
      const center = viewportCenter();
      if (canvasRef.current && zoomBehavior.current) {
        select(canvasRef.current).call(zoomBehavior.current.transform, zoomIdentity.translate(center.x, center.y).scale(k));
      }
    }

    simulation.current?.stop();
    simulation.current = forceSimulation(nodes)
      .alpha(previous.size === 0 ? 1 : 0.35)
      .velocityDecay(0.38)
      .force('link', forceLink<GraphNode, GraphLink>(links).distance(48).strength(0.25))
      .force('charge', forceManyBody<GraphNode>().strength(-110).distanceMax(600))
      .force('collide', forceCollide<GraphNode>((n) => n.radius + 4))
      .force('cluster', forceCluster(0.05))
      .force('x', forceX<GraphNode>(0).strength(0.02))
      .force('y', forceY<GraphNode>(0).strength(0.02))
      .on('tick', requestPaint)
      .on('end', () => {
        if (fitted.current) return;
        fitted.current = true;
        fit();
      });
  }, [props.nodes, props.edges, props.radiusOf]);

  useEffect(requestPaint, [props.colorOf, props.selectedId, props.highlightGroup, props.heatMode, props.tokens]);

  const nodeAt = (e: MouseEvent<HTMLCanvasElement>): GraphNode | null => {
    const sim = simulation.current;
    if (!sim) return null;
    const t = scene.current.transform;
    const [x, y] = t.invert([e.nativeEvent.offsetX, e.nativeEvent.offsetY]);
    const node = sim.find(x, y, 40 / t.k);
    return node && Math.hypot(node.x - x, node.y - y) <= node.radius + 5 / t.k ? node : null;
  };

  const onPointerMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const id = nodeAt(e)?.id ?? null;
    if (id === scene.current.hoverId) return;
    scene.current.hoverId = id;
    setHovering(id !== null);
    requestPaint();
  };

  const onPointerLeave = () => {
    scene.current.hoverId = null;
    setHovering(false);
    requestPaint();
  };

  return (
    <div className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-hovering={hovering || undefined}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={(e) => props.onSelect(nodeAt(e)?.id ?? null)}
        aria-label="Mapa de dependencias. Usa la búsqueda para navegar con el teclado."
        role="img"
      />
      <div className={`${styles.scale} mono`} style={{ left: props.insets.left, bottom: props.insets.bottom }}>
        <span className={styles.bar} />
        <span>×{zoomLevel.toFixed(2)}</span>
        <button type="button" onClick={fit}>
          Encuadrar
        </button>
      </div>
    </div>
  );
});

function forceCluster(strength: number) {
  let nodes: GraphNode[] = [];
  const force = (alpha: number) => {
    const centers = new Map<string, { x: number; y: number; count: number }>();
    for (const n of nodes) {
      const c = centers.get(n.file.group) ?? { x: 0, y: 0, count: 0 };
      c.x += n.x;
      c.y += n.y;
      c.count++;
      centers.set(n.file.group, c);
    }
    for (const n of nodes) {
      const c = centers.get(n.file.group)!;
      n.vx = (n.vx ?? 0) - (n.x - c.x / c.count) * strength * alpha;
      n.vy = (n.vy ?? 0) - (n.y - c.y / c.count) * strength * alpha;
    }
  };
  force.initialize = (all: GraphNode[]) => {
    nodes = all;
  };
  return force;
}

function paint(ctx: CanvasRenderingContext2D, scene: Scene, props: Props) {
  const { tokens, selectedId, highlightGroup, heatMode, colorOf, index } = props;
  const { transform: t, width, height } = scene;
  const dpr = ctx.canvas.width / Math.max(width, 1);
  const px = 1 / t.k;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(t.x, t.y);
  ctx.scale(t.k, t.k);

  const focusId = selectedId ?? scene.hoverId;
  const focus = focusId ? scene.byId.get(focusId) : undefined;
  const related = focus ? neighbourhood(index, focus.id) : null;
  const isLit = (n: GraphNode) => (related ? related.has(n.id) : highlightGroup ? n.file.group === highlightGroup : true);
  const dimmed = related !== null || highlightGroup !== null;

  const strokeLinks = (links: GraphLink[], color: string, alpha: number, width: number) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * px;
    ctx.beginPath();
    for (const { source, target } of links) {
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
    }
    ctx.stroke();
  };

  strokeLinks(scene.links, tokens.ink, dimmed ? 0.05 : 0.17, 0.75);
  if (focus) {
    strokeLinks(scene.links.filter((l) => l.source === focus), tokens.ink, 0.75, 1.1);
    strokeLinks(scene.links.filter((l) => l.target === focus), tokens.accent, 0.9, 1.3);
  } else if (highlightGroup) {
    strokeLinks(scene.links.filter((l) => l.source.file.group === highlightGroup || l.target.file.group === highlightGroup), tokens.ink, 0.4, 0.9);
  }

  if (heatMode) {
    ctx.strokeStyle = tokens.heat;
    ctx.lineWidth = 0.8 * px;
    for (const n of scene.nodes) {
      if (n.file.heat < 0.25 || !isLit(n)) continue;
      const rings = Math.ceil(n.file.heat * 4);
      for (let i = 1; i <= rings; i++) {
        ctx.globalAlpha = 0.34 - i * 0.06;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + i * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  for (const n of scene.nodes) {
    ctx.globalAlpha = isLit(n) ? 1 : 0.13;
    ctx.fillStyle = colorOf(n.file);
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  if (focus) {
    ctx.strokeStyle = tokens.ink;
    ctx.lineWidth = 1.5 * px;
    ctx.beginPath();
    ctx.arc(focus.x, focus.y, focus.radius + 3.5 * px, 0, Math.PI * 2);
    ctx.stroke();
  }

  const labelled = labelsFor(scene, related, isLit);
  ctx.font = `500 ${11 * px}px "IBM Plex Mono", monospace`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5 * px;
  ctx.strokeStyle = tokens.paper;
  for (const n of labelled) {
    const label = n.id.slice(n.id.lastIndexOf('/') + 1);
    const x = n.x + n.radius + 5 * px;
    ctx.fillStyle = n === focus ? tokens.ink : tokens.ink2;
    ctx.strokeText(label, x, n.y);
    ctx.fillText(label, x, n.y);
  }
}

function labelsFor(scene: Scene, related: Set<string> | null, isLit: (n: GraphNode) => boolean): GraphNode[] {
  if (related) {
    const nodes = [...related].map((id) => scene.byId.get(id)).filter((n): n is GraphNode => n !== undefined);
    return nodes.sort((a, b) => b.file.fanIn - a.file.fanIn).slice(0, MAX_NEIGHBOUR_LABELS + 1);
  }

  const t = scene.transform;
  const landmarks = scene.landmarks.filter(isLit);
  if (t.k < LABEL_ZOOM) return landmarks;

  const [left, top] = t.invert([0, 0]);
  const [right, bottom] = t.invert([scene.width, scene.height]);
  const visible = scene.nodes.filter((n) => isLit(n) && n.x > left && n.x < right && n.y > top && n.y < bottom && n.radius * t.k >= 3.5);
  return [...new Set([...landmarks, ...visible])].slice(0, MAX_LABELS);
}
