"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LogicGraph, LogicNode, LogicNodeKind } from "../../server/types";

interface Props {
  open: boolean;
  graph: LogicGraph;
  onChange: (g: LogicGraph) => void;
  onClose: () => void;
  // Arm a one-shot capture: the next viewport ground-click calls back with world x/z.
  onCaptureWorldPoint: (cb: (x: number, z: number) => void) => void;
  listObjects: () => { id: string; url: string }[];
}

type Category = "trigger" | "logic" | "action";

const NODE_META: Record<LogicNodeKind, { label: string; cat: Category }> = {
  zoneEnter: { label: "Zone Enter", cat: "trigger" },
  zoneExit: { label: "Zone Exit", cat: "trigger" },
  objectShot: { label: "Object Shot", cat: "trigger" },
  objectUsed: { label: "Object Used", cat: "trigger" },
  timer: { label: "Timer", cat: "trigger" },
  onStart: { label: "On Start", cat: "trigger" },
  npcKilled: { label: "NPC Killed", cat: "trigger" },
  counter: { label: "Counter", cat: "logic" },
  delay: { label: "Delay", cat: "logic" },
  once: { label: "Once", cat: "logic" },
  teleport: { label: "Teleport", cat: "action" },
  changeMap: { label: "Change Map", cat: "action" },
  setVisible: { label: "Set Visible", cat: "action" },
  giveReward: { label: "Give Reward", cat: "action" },
  showMessage: { label: "Show Message", cat: "action" },
  playSound: { label: "Play Sound", cat: "action" },
  spawnNPC: { label: "Spawn NPC", cat: "action" },
};

const CAT_COLOR: Record<Category, string> = {
  trigger: "var(--sage)",
  logic: "var(--mustard)",
  action: "var(--terracotta)",
};

const NODE_W = 150;
const NODE_H = 46;
const CANVAS_W = 420;
const CANVAS_H = 340;

const hasInput = (kind: LogicNodeKind) => NODE_META[kind].cat !== "trigger";
const hasOutput = (kind: LogicNodeKind) => NODE_META[kind].cat !== "action";

function defaultParams(kind: LogicNodeKind): Record<string, number | string | boolean> {
  switch (kind) {
    case "zoneEnter":
    case "zoneExit": return { x: 0, z: 0, radius: 1.5 };
    case "objectShot":
    case "objectUsed": return {};
    case "timer": return { period: 5 };
    case "onStart": return {};
    case "npcKilled": return {};
    case "counter": return { threshold: 3 };
    case "delay": return { seconds: 1 };
    case "once": return {};
    case "teleport": return { x: 0, z: 0 };
    case "changeMap": return { targetMapId: "hub" };
    case "setVisible": return { visible: true };
    case "giveReward": return { xp: 50, currency: 10 };
    case "showMessage": return { text: "Hello!" };
    case "playSound": return { freq: 660 };
    case "spawnNPC": return { url: "", behavior: "shoot", health: 50, x: 0, z: 0 };
  }
}

const basename = (url: string) => url.split("/").pop() ?? url;

export default function LogicPanel({ open, graph, onChange, onClose, onCaptureWorldPoint, listObjects }: Props) {
  // Latest graph, readable from async (world-capture / drag) callbacks without staleness.
  const graphRef = useRef(graph);
  useEffect(() => { graphRef.current = graph; }, [graph]);
  const svgRef = useRef<SVGSVGElement>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [wiringFrom, setWiringFrom] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const mutate = useCallback((fn: (g: LogicGraph) => LogicGraph) => {
    onChange(fn(graphRef.current));
  }, [onChange]);

  const setParam = useCallback((id: string, key: string, value: number | string | boolean) => {
    mutate((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)),
    }));
  }, [mutate]);

  const addNode = useCallback((kind: LogicNodeKind) => {
    const id = crypto.randomUUID();
    mutate((g) => {
      const node: LogicNode = {
        id, kind,
        ex: 20 + (g.nodes.length % 4) * 24,
        ey: 20 + (g.nodes.length % 6) * 20,
        params: defaultParams(kind),
      };
      return { ...g, nodes: [...g.nodes, node] };
    });
    setSelectedNodeId(id);
  }, [mutate]);

  const deleteNode = useCallback((id: string) => {
    mutate((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      wires: g.wires.filter((w) => w.from !== id && w.to !== id),
    }));
    setSelectedNodeId((cur) => (cur === id ? null : cur));
  }, [mutate]);

  const addWire = useCallback((from: string, to: string) => {
    if (from === to) return;
    mutate((g) => {
      if (g.wires.some((w) => w.from === from && w.to === to)) return g;
      return { ...g, wires: [...g.wires, { id: crypto.randomUUID(), from, to }] };
    });
  }, [mutate]);

  const deleteWire = useCallback((id: string) => {
    mutate((g) => ({ ...g, wires: g.wires.filter((w) => w.id !== id) }));
  }, [mutate]);

  // ---- Node dragging ----
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);

  const svgPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  // Drag is tracked via pointer capture on the SVG (handlers live on the <svg> element),
  // so there are no self-referential window listeners to add/remove.
  const onNodePointerDown = (e: React.PointerEvent, node: LogicNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    const p = svgPoint(e.clientX, e.clientY);
    dragRef.current = { id: node.id, offX: p.x - node.ex, offY: p.y - node.ey };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onSvgPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = svgPoint(e.clientX, e.clientY);
    const ex = Math.max(0, Math.min(CANVAS_W - NODE_W, p.x - drag.offX));
    const ey = Math.max(0, Math.min(CANVAS_H - NODE_H, p.y - drag.offY));
    mutate((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === drag.id ? { ...n, ex, ey } : n)) }));
  };
  const onSvgPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    svgRef.current?.releasePointerCapture(e.pointerId);
  };

  // ---- Wiring via ports ----
  const onOutputClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setWiringFrom(nodeId);
  };
  const onInputClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (wiringFrom && wiringFrom !== nodeId) {
      addWire(wiringFrom, nodeId);
      setWiringFrom(null);
    }
  };

  // ---- World-point capture ----
  const captureFor = (nodeId: string) => {
    setCapturing(true);
    onCaptureWorldPoint((x, z) => {
      setCapturing(false);
      mutate((g) => ({
        ...g,
        nodes: g.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, params: { ...n.params, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 } }
            : n,
        ),
      }));
    });
  };

  if (!open) return null;

  const selected = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const num = (v: unknown, f = 0) => (typeof v === "number" ? v : f);

  return (
    // Full-screen pass-through layer; only the window itself captures pointers,
    // so clicks in the open viewport still reach the 3D world for point capture.
    <div className="fixed inset-0 z-40" style={{ pointerEvents: "none" }}>
      <div
        className="bevel-out absolute flex flex-col"
        style={{ pointerEvents: "auto", left: 12, top: 44, bottom: 160, width: 452, background: "var(--face)" }}
        onClick={() => { setSelectedNodeId(null); setWiringFrom(null); }}
      >
        <div className="retro-titlebar flex items-center gap-1.5 px-1.5 py-1">
          <span className="retro-titlebar-glyph">⌄</span>
          <span className="retro-titlebar-glyph">□</span>
          <span className="flex-1 text-center" style={{ fontSize: 12 }}>logic editor</span>
          <button className="retro-titlebar-glyph" onClick={onClose}>×</button>
        </div>

        <div className="p-2 flex flex-col gap-2 min-h-0 overflow-y-auto retro-scroll" style={{ fontSize: 11 }}>
          {/* Palette */}
          <div className="retro-section">
            <span className="retro-section-label">Add node</span>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(NODE_META) as LogicNodeKind[]).map((kind) => (
                <button
                  key={kind}
                  className="retro-btn"
                  style={{ fontSize: 10, borderLeft: `4px solid ${CAT_COLOR[NODE_META[kind].cat]}` }}
                  onClick={(e) => { e.stopPropagation(); addNode(kind); }}
                >
                  + {NODE_META[kind].label}
                </button>
              ))}
            </div>
          </div>

          {/* Graph canvas */}
          <div className="bevel-in" style={{ background: "var(--well-alt)", width: CANVAS_W, alignSelf: "center" }}>
            <svg
              ref={svgRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ display: "block" }}
              onClick={() => { setSelectedNodeId(null); setWiringFrom(null); }}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
            >
              {/* Wires */}
              {graph.wires.map((w) => {
                const a = graph.nodes.find((n) => n.id === w.from);
                const b = graph.nodes.find((n) => n.id === w.to);
                if (!a || !b) return null;
                const x1 = a.ex + NODE_W, y1 = a.ey + NODE_H / 2;
                const x2 = b.ex, y2 = b.ey + NODE_H / 2;
                const mx = (x1 + x2) / 2;
                return (
                  <path
                    key={w.id}
                    d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                    stroke="var(--ink-dim)" strokeWidth={2} fill="none"
                    style={{ cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); deleteWire(w.id); }}
                  />
                );
              })}

              {/* Nodes */}
              {graph.nodes.map((node) => {
                const color = CAT_COLOR[NODE_META[node.kind].cat];
                const sel = node.id === selectedNodeId;
                const wiring = node.id === wiringFrom;
                return (
                  <g key={node.id} transform={`translate(${node.ex}, ${node.ey})`}>
                    <rect
                      width={NODE_W} height={NODE_H} rx={3}
                      fill="var(--face)" stroke={sel ? "var(--ink)" : color} strokeWidth={sel ? 2.5 : 1.5}
                      style={{ cursor: "move" }}
                      onPointerDown={(e) => onNodePointerDown(e, node)}
                    />
                    <rect width={NODE_W} height={16} rx={3} fill={color} style={{ cursor: "move" }}
                      onPointerDown={(e) => onNodePointerDown(e, node)} />
                    <text x={6} y={12} fill="var(--well)" fontSize={10} fontWeight={700} style={{ pointerEvents: "none" }}>
                      {NODE_META[node.kind].label}
                    </text>
                    <text x={6} y={34} fill="var(--ink-dim)" fontSize={9} style={{ pointerEvents: "none" }}>
                      {nodeSummary(node)}
                    </text>
                    {/* Input port */}
                    {hasInput(node.kind) && (
                      <circle cx={0} cy={NODE_H / 2} r={6}
                        fill={wiringFrom ? "var(--sage)" : "var(--well)"} stroke="var(--ink-dim)" strokeWidth={1.5}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => onInputClick(e, node.id)} />
                    )}
                    {/* Output port */}
                    {hasOutput(node.kind) && (
                      <circle cx={NODE_W} cy={NODE_H / 2} r={6}
                        fill={wiring ? "var(--sage)" : "var(--well)"} stroke="var(--ink-dim)" strokeWidth={1.5}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => onOutputClick(e, node.id)} />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Hints */}
          {wiringFrom && <p style={{ fontSize: 10, color: "var(--terracotta)" }}>Click a target node&apos;s input port to connect.</p>}
          {capturing && <p style={{ fontSize: 10, color: "var(--sage)" }}>Click a spot in the world to set the location…</p>}
          {graph.nodes.length === 0 && (
            <p style={{ fontSize: 10, color: "var(--ink-dim)" }}>
              Add a trigger (e.g. Zone Enter), an action (e.g. Teleport), then click the trigger&apos;s
              right port then the action&apos;s left port to wire them.
            </p>
          )}

          {/* Inspector */}
          {selected && (
            <div className="retro-section">
              <span className="retro-section-label">{NODE_META[selected.kind].label}</span>
              {renderInspector(selected)}
              <button
                className="retro-btn w-full mt-2"
                style={{ color: "var(--ui-danger)", fontWeight: 700, fontSize: 10 }}
                onClick={(e) => { e.stopPropagation(); deleteNode(selected.id); }}
              >
                DELETE NODE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function nodeSummary(node: LogicNode): string {
    const target = () => (node.objectId ? basename(objUrl(node.objectId)) : "(no target)");
    switch (node.kind) {
      case "zoneEnter":
      case "zoneExit": return `(${num(node.params.x)}, ${num(node.params.z)}) r${num(node.params.radius, 1.5)}`;
      case "objectShot": return `shot: ${target()}`;
      case "objectUsed": return `used: ${target()}`;
      case "timer": return `every ${num(node.params.period, 5)}s`;
      case "onStart": return `on room start`;
      case "npcKilled": return `on NPC killed`;
      case "spawnNPC": return `${String(node.params.behavior ?? "idle")} ${node.params.url ? basename(String(node.params.url)) : "(no model)"}`;
      case "counter": return `every ${num(node.params.threshold, 1)}`;
      case "delay": return `wait ${num(node.params.seconds, 1)}s`;
      case "once": return `first pulse only`;
      case "teleport": return `→ (${num(node.params.x)}, ${num(node.params.z)})`;
      case "changeMap": return `→ ${String(node.params.targetMapId ?? "")}`;
      case "setVisible": return `${node.params.visible ? "show" : "hide"} ${target()}`;
      case "giveReward": return `+${num(node.params.xp)}xp +${num(node.params.currency)}c`;
      case "showMessage": return `"${String(node.params.text ?? "").slice(0, 16)}"`;
      case "playSound": return `♪ ${num(node.params.freq, 440)}Hz`;
    }
  }

  function objUrl(id: string): string {
    return listObjects().find((o) => o.id === id)?.url ?? id;
  }

  function renderInspector(node: LogicNode) {
    const numField = (label: string, key: string, step = 1, fallback = 0) => (
      <label className="flex items-center justify-between gap-2 mb-1" style={{ fontSize: 10 }}>
        {label}
        <input
          type="number" step={step} className="retro-input" style={{ width: 90 }}
          value={num(node.params[key], fallback)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setParam(node.id, key, parseFloat(e.target.value) || 0)}
        />
      </label>
    );

    const objectSelect = (label: string) => (
      <label className="flex items-center justify-between gap-2 mb-1" style={{ fontSize: 10 }}>
        {label}
        <select
          className="retro-input" style={{ width: 150 }}
          value={node.objectId ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => mutate((g) => ({
            ...g,
            nodes: g.nodes.map((n) => (n.id === node.id ? { ...n, objectId: e.target.value || undefined } : n)),
          }))}
        >
          <option value="">(pick an object)</option>
          {listObjects().map((o) => (
            <option key={o.id} value={o.id}>{basename(o.url)}</option>
          ))}
        </select>
      </label>
    );

    const urlSelect = (label: string) => {
      const urls = Array.from(new Set(listObjects().map((o) => o.url)));
      return (
        <label className="flex items-center justify-between gap-2 mb-1" style={{ fontSize: 10 }}>
          {label}
          <select
            className="retro-input" style={{ width: 150 }}
            value={String(node.params.url ?? "")}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setParam(node.id, "url", e.target.value)}
          >
            <option value="">(pick a model)</option>
            {urls.map((u) => <option key={u} value={u}>{basename(u)}</option>)}
          </select>
        </label>
      );
    };

    switch (node.kind) {
      case "zoneEnter":
      case "zoneExit":
        return (
          <>
            <p style={{ fontSize: 9, color: "var(--ink-dim)" }}>Center: ({num(node.params.x)}, {num(node.params.z)})</p>
            <button className="retro-btn w-full mb-1" style={{ fontSize: 10 }}
              onClick={(e) => { e.stopPropagation(); captureFor(node.id); }}>
              📍 Set zone center in world
            </button>
            {numField("Radius", "radius", 0.5, 1.5)}
          </>
        );
      case "objectShot":
        return (
          <>
            {objectSelect("When this object is shot")}
            <p style={{ fontSize: 9, color: "var(--ink-dim)" }}>Fires when a bullet hits the object.</p>
          </>
        );
      case "objectUsed":
        return (
          <>
            {objectSelect("When this object is used")}
            <p style={{ fontSize: 9, color: "var(--ink-dim)" }}>Fires when a player presses F within 2.5 units.</p>
          </>
        );
      case "timer":
        return numField("Period (seconds)", "period", 0.5, 5);
      case "onStart":
        return <p style={{ fontSize: 9, color: "var(--ink-dim)" }}>Fires once when the room loads (or the graph is saved). Good for spawning NPCs / setting initial state.</p>;
      case "npcKilled":
        return <p style={{ fontSize: 9, color: "var(--ink-dim)" }}>Fires whenever an NPC dies; the killer (if a player) is carried as context.</p>;
      case "counter":
        return numField("Fire every N pulses", "threshold", 1, 1);
      case "delay":
        return numField("Delay (seconds)", "seconds", 0.5, 1);
      case "once":
        return <p style={{ fontSize: 9, color: "var(--ink-dim)" }}>Passes the first pulse only, then blocks.</p>;
      case "teleport":
        return (
          <>
            <p style={{ fontSize: 9, color: "var(--ink-dim)" }}>Destination: ({num(node.params.x)}, {num(node.params.z)})</p>
            <button className="retro-btn w-full" style={{ fontSize: 10 }}
              onClick={(e) => { e.stopPropagation(); captureFor(node.id); }}>
              📍 Set destination in world
            </button>
          </>
        );
      case "changeMap":
        return (
          <label className="flex items-center justify-between gap-2" style={{ fontSize: 10 }}>
            Target map
            <input
              type="text" className="retro-input" style={{ width: 120 }}
              value={String(node.params.targetMapId ?? "")}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setParam(node.id, "targetMapId", e.target.value)}
            />
          </label>
        );
      case "setVisible":
        return (
          <>
            {objectSelect("Target object")}
            <label className="flex items-center gap-2" style={{ fontSize: 10 }}>
              <input
                type="checkbox" checked={Boolean(node.params.visible)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setParam(node.id, "visible", e.target.checked)}
              />
              Make visible (unchecked = hide)
            </label>
          </>
        );
      case "giveReward":
        return (
          <>
            {numField("XP", "xp", 10, 0)}
            {numField("Currency", "currency", 5, 0)}
          </>
        );
      case "showMessage":
        return (
          <label className="flex flex-col gap-1" style={{ fontSize: 10 }}>
            Message text
            <input
              type="text" className="retro-input"
              value={String(node.params.text ?? "")}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setParam(node.id, "text", e.target.value)}
            />
          </label>
        );
      case "playSound":
        return numField("Frequency (Hz)", "freq", 20, 440);
      case "spawnNPC":
        return (
          <>
            {urlSelect("Model")}
            <label className="flex items-center justify-between gap-2 mb-1" style={{ fontSize: 10 }}>
              Behavior
              <select
                className="retro-input" style={{ width: 110 }}
                value={String(node.params.behavior ?? "idle")}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setParam(node.id, "behavior", e.target.value)}
              >
                <option value="idle">Idle</option>
                <option value="patrol">Patrol</option>
                <option value="chase">Chase</option>
                <option value="shoot">Shoot</option>
              </select>
            </label>
            {numField("Health", "health", 10, 50)}
            <p style={{ fontSize: 9, color: "var(--ink-dim)" }}>Spawn: ({num(node.params.x)}, {num(node.params.z)})</p>
            <button className="retro-btn w-full" style={{ fontSize: 10 }}
              onClick={(e) => { e.stopPropagation(); captureFor(node.id); }}>
              📍 Set spawn point in world
            </button>
            {!node.params.url && <p style={{ fontSize: 9, color: "var(--ui-danger)" }}>Place a GLB in your home first, then pick it as the model.</p>}
          </>
        );
    }
  }
}
