"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "@/app/components/ui";
import { ROOT_ID, ancestorsOf, directionNodeId, offspringNodeId, type Lineage, type NodeId } from "@/lib/lineage";
import type { Version } from "@/lib/openrouter";

// The family tree on the Lineage tab: the original idea at the root, its
// directions, then each generation of bred offspring. Plain SVG, no library.
//  - Wide screens lay generations out left to right; narrow ones top to bottom.
//  - Drag to pan; pinch, Ctrl/⌘ + scroll or the buttons to zoom.
//  - Hovering or focusing a node highlights the lines to all its ancestors.
//  - Clicking a node (or Enter/Space) selects it for crossing.

type TreeNode = { id: NodeId; label: string; title: string; level: number; parents: NodeId[] };
type Box = { x: number; y: number; w: number; h: number };
type View = { x: number; y: number; k: number };

const NARROW = 640; // container width below which the tree turns vertical
const NODE_H = 58;
const MIN_K = 0.25;
const MAX_K = 2;

// Shorten text to fit a node, on a word boundary where possible.
function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut) + "…";
}

function buildNodes(idea: string, versions: Version[], lineage: Lineage): TreeNode[][] {
  const levels: TreeNode[][] = [
    [{ id: ROOT_ID, label: "Your idea", title: idea, level: 0, parents: [] }],
    versions.map((v) => ({ id: directionNodeId(v.direction), label: v.direction, title: v.title, level: 1, parents: [ROOT_ID] })),
  ];
  const sorted = [...lineage.offspring].sort((a, b) => a.generation - b.generation || a.createdAt - b.createdAt);
  for (const o of sorted) {
    const level = o.generation + 1;
    (levels[level] ??= []).push({ id: offspringNodeId(o.id), label: `Gen ${o.generation}`, title: o.title, level, parents: o.parents });
  }
  return levels.filter(Boolean);
}

// Position every node. Horizontal: one column per level. Vertical: one band per
// level, wrapped into rows of `perRow` so a phone never needs sideways scrolling to read it.
function layout(levels: TreeNode[][], vertical: boolean, containerWidth: number) {
  const boxes = new Map<NodeId, Box>();
  if (!vertical) {
    const w = 210;
    const colGap = 70;
    const rowGap = 14;
    const tallest = Math.max(...levels.map((l) => l.length));
    const fullH = tallest * NODE_H + (tallest - 1) * rowGap;
    levels.forEach((nodes, li) => {
      const colH = nodes.length * NODE_H + (nodes.length - 1) * rowGap;
      nodes.forEach((n, i) => boxes.set(n.id, { x: li * (w + colGap), y: (fullH - colH) / 2 + i * (NODE_H + rowGap), w, h: NODE_H }));
    });
    return { boxes, width: levels.length * w + (levels.length - 1) * colGap, height: fullH };
  }

  const perRow = containerWidth < 420 ? 2 : 3;
  const gap = 12;
  const w = Math.max(130, Math.floor((Math.min(containerWidth, 560) - 24 - gap * (perRow - 1)) / perRow));
  const rowW = perRow * w + (perRow - 1) * gap;
  const levelGap = 46;
  let y = 0;
  for (const nodes of levels) {
    for (let start = 0; start < nodes.length; start += perRow) {
      const row = nodes.slice(start, start + perRow);
      const used = row.length * w + (row.length - 1) * gap;
      row.forEach((n, i) => boxes.set(n.id, { x: (rowW - used) / 2 + i * (w + gap), y, w, h: NODE_H }));
      y += NODE_H + gap;
    }
    y += levelGap - gap;
  }
  return { boxes, width: rowW, height: y - levelGap };
}

// A soft curve from a parent to a child.
function edgePath(p: Box, c: Box, vertical: boolean) {
  if (vertical) {
    const [x1, y1, x2, y2] = [p.x + p.w / 2, p.y + p.h, c.x + c.w / 2, c.y];
    const dy = Math.max(24, (y2 - y1) / 2);
    return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
  }
  const [x1, y1, x2, y2] = [p.x + p.w, p.y + p.h / 2, c.x, c.y + c.h / 2];
  const dx = Math.max(24, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

export function LineageTree({
  idea,
  versions,
  lineage,
  selected,
  canSelect,
  onToggle,
  onOpen,
  freshIds,
  pickIds,
}: {
  idea: string;
  versions: Version[];
  lineage: Lineage;
  selected: NodeId[];
  canSelect: (id: NodeId) => boolean;
  onToggle: (id: NodeId) => void;
  onOpen: (id: NodeId) => void;
  freshIds: Set<string>; // offspring ids born in this visit (they bloom in)
  pickIds: Set<string>; // offspring a generation verdict picked
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [active, setActive] = useState<NodeId | null>(null);
  const vertical = width > 0 && width < NARROW;
  const height = vertical ? 520 : 440;

  // Track the container's width so the layout can switch orientation.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const levels = useMemo(() => buildNodes(idea, versions, lineage), [idea, versions, lineage]);
  const { boxes, width: treeW, height: treeH } = useMemo(() => layout(levels, vertical, width), [levels, vertical, width]);
  const nodes = levels.flat();

  // Fit the whole tree in view (vertical trees fit their width and start at the top).
  const fit = useCallback(() => {
    if (!width) return;
    const pad = 20;
    const k = vertical
      ? Math.min(1, (width - pad) / treeW)
      : Math.max(MIN_K, Math.min(1, (width - pad * 2) / treeW, (height - pad * 2) / treeH));
    setView({ x: (width - treeW * k) / 2, y: vertical ? pad : (height - treeH * k) / 2, k });
  }, [width, height, treeW, treeH, vertical]);

  // Refit when the tree's shape changes (new offspring, rotation, resize).
  useEffect(fit, [fit, nodes.length]);

  // Zoom around a point in the container (defaults to its centre).
  const zoomBy = useCallback(
    (factor: number, cx = width / 2, cy = height / 2) =>
      setView((v) => {
        const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
        return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
      }),
    [width, height]
  );

  // Ctrl/⌘ + wheel zooms; a plain wheel keeps scrolling the page. Needs a
  // non-passive listener to stop the browser's own page zoom.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el!.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Drag to pan with one pointer, pinch to zoom with two.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; pts: { x: number; y: number }[] } | null>(null);
  const restart = () => (gesture.current = { view, pts: [...pointers.current.values()] });

  function local(e: ReactPointerEvent) {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if ((e.target as Element).closest("[data-node]")) return; // nodes are clicked, not dragged
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    restart();
  }
  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const now = [...pointers.current.values()];
    const { view: v0, pts } = gesture.current;
    if (now.length === 1 && pts.length === 1) {
      setView({ ...v0, x: v0.x + now[0].x - pts[0].x, y: v0.y + now[0].y - pts[0].y });
    } else if (now.length >= 2 && pts.length >= 2) {
      const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const k = Math.min(MAX_K, Math.max(MIN_K, (v0.k * dist(now[0], now[1])) / dist(pts[0], pts[1])));
      const m0 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const m1 = { x: (now[0].x + now[1].x) / 2, y: (now[0].y + now[1].y) / 2 };
      setView({ k, x: m1.x - ((m0.x - v0.x) * k) / v0.k, y: m1.y - ((m0.y - v0.y) * k) / v0.k });
    }
  }
  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    restart();
  }

  // Lines to light up: every edge on the path from the active node to the root.
  const lit = useMemo(() => {
    if (!active) return new Set<NodeId>();
    const chain = ancestorsOf(lineage, active);
    chain.add(active);
    return chain;
  }, [active, lineage]);

  const edges = nodes.flatMap((n) =>
    n.parents.flatMap((p) => {
      const pb = boxes.get(p);
      const cb = boxes.get(n.id);
      return pb && cb ? [{ key: `${p}>${n.id}`, d: edgePath(pb, cb, vertical), on: lit.has(n.id) && lit.has(p) }] : [];
    })
  );
  const titleMax = Math.floor(((boxes.get(ROOT_ID)?.w ?? 200) - 20) / 6.4);

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-2xl border border-line bg-slate-50/70"
        style={{ height }}
      >
        {width > 0 && (
          <svg
            role="group"
            aria-label="Family tree of your idea"
            width={width}
            height={height}
            className="block cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {/* Lines first, so nodes sit on top; lit ones last so they draw over the rest. */}
              {[...edges.filter((e) => !e.on), ...edges.filter((e) => e.on)].map((e) => (
                <path
                  key={e.key}
                  d={e.d}
                  fill="none"
                  className={e.on ? "stroke-accent" : "stroke-slate-300"}
                  strokeWidth={e.on ? 2.5 : 1.25}
                />
              ))}

              {nodes.map((n) => {
                const box = boxes.get(n.id)!;
                const isRoot = n.id === ROOT_ID;
                const isSelected = selected.includes(n.id);
                const selectable = !isRoot && (isSelected || canSelect(n.id));
                const oid = n.id.startsWith("o:") ? n.id.slice(2) : "";
                const isPick = pickIds.has(oid);
                const fresh = freshIds.has(oid);
                return (
                  <g
                    key={n.id}
                    data-node
                    transform={`translate(${box.x},${box.y})`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isRoot ? undefined : isSelected}
                    aria-disabled={!isRoot && !selectable ? true : undefined}
                    aria-label={`${n.label}: ${n.title}${isSelected ? ", selected to cross" : ""}${isPick ? ", the judge's pick" : ""}`}
                    className="group cursor-pointer outline-none"
                    onPointerEnter={() => setActive(n.id)}
                    onPointerLeave={() => setActive((a) => (a === n.id ? null : a))}
                    onFocus={() => setActive(n.id)}
                    onBlur={() => setActive((a) => (a === n.id ? null : a))}
                    onClick={() => {
                      onOpen(n.id);
                      if (selectable) onToggle(n.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      onOpen(n.id);
                      if (selectable) onToggle(n.id);
                    }}
                  >
                    <title>{`${n.label}: ${n.title}`}</title>
                    <g className={fresh ? "animate-node-bloom" : undefined}>
                      <rect
                        width={box.w}
                        height={box.h}
                        rx={12}
                        className={`transition-colors ${
                          isRoot ? "fill-slate-900" : isSelected ? "fill-surface stroke-accent" : "fill-surface stroke-line group-hover:stroke-slate-400"
                        } group-focus-visible:stroke-accent`}
                        strokeWidth={isSelected ? 2.5 : 1}
                        style={{ opacity: !isRoot && !selectable ? 0.55 : 1 }}
                      />
                      {/* A 2px focus ring drawn outside the node, since SVG has no outline. */}
                      <rect
                        x={-4}
                        y={-4}
                        width={box.w + 8}
                        height={box.h + 8}
                        rx={15}
                        fill="none"
                        className="stroke-accent opacity-0 group-focus-visible:opacity-100"
                        strokeWidth={2}
                      />
                      <text x={12} y={21} className={`text-[10px] font-semibold ${isRoot ? "fill-slate-300" : "fill-accent"}`}>
                        {clip(n.label, Math.floor(titleMax * 0.9))}
                        {isPick && " ★ pick"}
                      </text>
                      <text x={12} y={41} className={`text-[12px] font-medium ${isRoot ? "fill-slate-50" : "fill-slate-900"}`}>
                        {clip(n.title, titleMax)}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {/* Zoom controls */}
        <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <ZoomButton label="Zoom in" onClick={() => zoomBy(1.25)}>
            +
          </ZoomButton>
          <ZoomButton label="Zoom out" onClick={() => zoomBy(0.8)}>
            −
          </ZoomButton>
          <ZoomButton label="Fit the whole tree" onClick={fit}>
            <Icon name="refresh" className="h-3.5 w-3.5" />
          </ZoomButton>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Click or press Enter on a node to select it for crossing. Drag to move around; pinch, Ctrl/⌘ + scroll or the
        buttons to zoom.
      </p>
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center border-b border-line text-base font-semibold text-slate-600 last:border-b-0 hover:bg-slate-100 hover:text-slate-950"
    >
      {children}
    </button>
  );
}
