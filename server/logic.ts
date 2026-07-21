import type { ClientId, LogicGraph, LogicNode, PlayerState } from "./types";

// Side-effects the logic graph can perform, implemented by the owning Room.
// Player-targeted effects receive the clientId that triggered the chain.
export interface LogicHooks {
  teleport(clientId: ClientId, x: number, z: number): void;
  changeMap(clientId: ClientId, mapId: string): void;
  setObjectVisible(objectId: string, visible: boolean): void;
  giveReward(clientId: ClientId, xp: number, currency: number): void;
}

// Context carried along a pulse. `clientId` is the player who triggered the chain
// (undefined for chains with no originating player).
interface PulseContext {
  clientId?: ClientId;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Evaluates a room's logic graph once per tick. Trigger nodes are checked against
 * live player state; firing propagates pulses synchronously along wires to logic and
 * action nodes, with per-pulse cycle protection.
 *
 * Runtime state (zone occupancy, counter values) is kept here, separate from the
 * serialized graph, and reset whenever the graph is rebuilt.
 */
export class LogicRuntime {
  private nodesById = new Map<string, LogicNode>();
  private adjacency = new Map<string, string[]>(); // nodeId → downstream nodeIds
  private zoneOccupancy = new Map<string, Set<ClientId>>(); // trigger nodeId → players currently inside
  private counters = new Map<string, number>(); // counter nodeId → accumulated pulses

  constructor(graph: LogicGraph | undefined, private readonly hooks: LogicHooks) {
    if (!graph) return;
    for (const node of graph.nodes) {
      this.nodesById.set(node.id, node);
      if (node.kind === "zoneEnter" || node.kind === "zoneExit") {
        this.zoneOccupancy.set(node.id, new Set());
      }
    }
    for (const wire of graph.wires) {
      if (!this.nodesById.has(wire.from) || !this.nodesById.has(wire.to)) continue;
      const list = this.adjacency.get(wire.from) ?? [];
      list.push(wire.to);
      this.adjacency.set(wire.from, list);
    }
  }

  /** Called once per tick with the room's live player states. */
  evaluate(states: Map<ClientId, PlayerState>): void {
    if (this.nodesById.size === 0) return;
    // Snapshot the player list so hooks that mutate room state (changeMap removes
    // players) can't disturb iteration.
    const players = Array.from(states.values());

    for (const node of this.nodesById.values()) {
      if (node.kind !== "zoneEnter" && node.kind !== "zoneExit") continue;
      const zx = num(node.params.x);
      const zz = num(node.params.z);
      const r = Math.max(0.1, num(node.params.radius, 1));
      const r2 = r * r;
      const occupancy = this.zoneOccupancy.get(node.id)!;
      const stillInside = new Set<ClientId>();

      for (const p of players) {
        if (p.health <= 0) continue;
        const dx = p.x - zx;
        const dz = p.z - zz;
        const inside = dx * dx + dz * dz <= r2;
        if (!inside) continue;
        stillInside.add(p.id);
        // Enter edge: newly inside this tick.
        if (node.kind === "zoneEnter" && !occupancy.has(p.id)) {
          this.fireFrom(node.id, { clientId: p.id });
        }
      }
      // Exit edge: was inside last tick, no longer.
      if (node.kind === "zoneExit") {
        for (const id of occupancy) {
          if (!stillInside.has(id)) this.fireFrom(node.id, { clientId: id });
        }
      }
      this.zoneOccupancy.set(node.id, stillInside);
    }
  }

  /** Starts a pulse at a trigger node and propagates it downstream. */
  private fireFrom(startNodeId: string, ctx: PulseContext): void {
    const visited = new Set<string>([startNodeId]);
    for (const next of this.adjacency.get(startNodeId) ?? []) {
      this.fire(next, ctx, visited);
    }
  }

  /** Executes a node's effect, then propagates the pulse to its successors. */
  private fire(nodeId: string, ctx: PulseContext, visited: Set<string>): void {
    if (visited.has(nodeId)) return; // cycle guard
    visited.add(nodeId);
    const node = this.nodesById.get(nodeId);
    if (!node) return;

    switch (node.kind) {
      case "counter": {
        const threshold = Math.max(1, Math.floor(num(node.params.threshold, 1)));
        const next = (this.counters.get(node.id) ?? 0) + 1;
        if (next < threshold) {
          this.counters.set(node.id, next);
          return; // gate closed — do not propagate yet
        }
        this.counters.set(node.id, 0); // reached threshold: reset and pass through
        break;
      }
      case "teleport":
        if (ctx.clientId) this.hooks.teleport(ctx.clientId, num(node.params.x), num(node.params.z));
        break;
      case "changeMap":
        if (ctx.clientId) this.hooks.changeMap(ctx.clientId, String(node.params.targetMapId ?? ""));
        break;
      case "setVisible":
        if (node.objectId) this.hooks.setObjectVisible(node.objectId, Boolean(node.params.visible));
        break;
      case "giveReward":
        if (ctx.clientId) this.hooks.giveReward(ctx.clientId, num(node.params.xp), num(node.params.currency));
        break;
    }

    for (const next of this.adjacency.get(node.id) ?? []) {
      this.fire(next, ctx, visited);
    }
  }
}
