import type { ClientId, LogicGraph, LogicNode, NpcBehavior, PlayerState } from "./types";

// Must match Room's TICK_RATE — used to convert timer/delay seconds into ticks.
const TICK_HZ = 20;
const MAX_SCHEDULED = 2000; // safety cap on pending delay pulses

// Side-effects the logic graph can perform, implemented by the owning Room.
// Player-targeted effects receive the clientId that triggered the chain.
export interface LogicHooks {
  teleport(clientId: ClientId, x: number, z: number): void;
  changeMap(clientId: ClientId, mapId: string): void;
  setObjectVisible(objectId: string, visible: boolean): void;
  giveReward(clientId: ClientId, xp: number, currency: number): void;
  showMessage(clientId: ClientId | undefined, text: string): void;
  playSound(freq: number): void;
  spawnNpc(url: string, behavior: NpcBehavior, health: number, x: number, z: number): void;
}

// Context carried along a pulse. `clientId` is the player who triggered the chain
// (undefined for chains with no originating player, e.g. timers).
interface PulseContext {
  clientId?: ClientId;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Evaluates a room's logic graph once per tick. Trigger nodes are checked against
 * live player state (or fired externally by object hit/use events); firing propagates
 * pulses synchronously along wires to logic and action nodes, with per-pulse cycle
 * protection. Timers and delays advance on an internal tick counter.
 *
 * Runtime state (zone occupancy, counters, timers, scheduled delays) is kept here,
 * separate from the serialized graph, and reset whenever the graph is rebuilt.
 */
export class LogicRuntime {
  private nodesById = new Map<string, LogicNode>();
  private adjacency = new Map<string, string[]>(); // nodeId → downstream nodeIds
  private zoneOccupancy = new Map<string, Set<ClientId>>(); // trigger nodeId → players inside
  private counters = new Map<string, number>(); // counter nodeId → accumulated pulses
  private timerTicks = new Map<string, number>(); // timer nodeId → ticks since last fire
  private onceFired = new Set<string>(); // `once` nodeIds that have already passed a pulse
  private scheduled: { fireTick: number; nodeId: string; ctx: PulseContext }[] = []; // pending delays
  private internalTick = 0;
  private started = false;

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
    this.internalTick++;

    // onStart: fire once on the first evaluated tick after (re)build.
    if (!this.started) {
      this.started = true;
      for (const node of this.nodesById.values()) {
        if (node.kind === "onStart") this.propagate(node.id, {});
      }
    }

    // Due delays.
    if (this.scheduled.length > 0) {
      const due = this.scheduled.filter((s) => s.fireTick <= this.internalTick);
      if (due.length > 0) {
        this.scheduled = this.scheduled.filter((s) => s.fireTick > this.internalTick);
        for (const s of due) this.propagate(s.nodeId, s.ctx);
      }
    }

    // Autonomous timers.
    for (const node of this.nodesById.values()) {
      if (node.kind !== "timer") continue;
      const periodTicks = Math.max(1, Math.round(num(node.params.period, 5) * TICK_HZ));
      const t = (this.timerTicks.get(node.id) ?? 0) + 1;
      if (t >= periodTicks) {
        this.timerTicks.set(node.id, 0);
        this.propagate(node.id, {});
      } else {
        this.timerTicks.set(node.id, t);
      }
    }

    // Zone triggers. Snapshot players so hooks that mutate room state (changeMap
    // removes players) can't disturb iteration.
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
        if (dx * dx + dz * dz > r2) continue;
        stillInside.add(p.id);
        if (node.kind === "zoneEnter" && !occupancy.has(p.id)) {
          this.propagate(node.id, { clientId: p.id });
        }
      }
      if (node.kind === "zoneExit") {
        for (const id of occupancy) {
          if (!stillInside.has(id)) this.propagate(node.id, { clientId: id });
        }
      }
      this.zoneOccupancy.set(node.id, stillInside);
    }
  }

  /** External event: a placed object was hit by a projectile (ctx = shooter). */
  onObjectShot(objectId: string, shooterId: ClientId): void {
    this.fireObjectTrigger("objectShot", objectId, shooterId);
  }

  /** External event: a player pressed Use near a placed object (ctx = user). */
  onObjectUsed(objectId: string, userId: ClientId): void {
    this.fireObjectTrigger("objectUsed", objectId, userId);
  }

  /** External event: a logic-spawned NPC died (ctx = killer if a player). */
  onNpcKilled(killerId?: ClientId): void {
    for (const node of this.nodesById.values()) {
      if (node.kind === "npcKilled") this.propagate(node.id, { clientId: killerId });
    }
  }

  private fireObjectTrigger(kind: "objectShot" | "objectUsed", objectId: string, clientId: ClientId): void {
    for (const node of this.nodesById.values()) {
      if (node.kind === kind && node.objectId === objectId) {
        this.propagate(node.id, { clientId });
      }
    }
  }

  /** Starts a pulse at a node and propagates it to that node's successors. */
  private propagate(startNodeId: string, ctx: PulseContext): void {
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
      case "delay": {
        // Re-fire this node's successors later, preserving player context.
        if (this.scheduled.length < MAX_SCHEDULED) {
          const delayTicks = Math.max(1, Math.round(num(node.params.seconds, 1) * TICK_HZ));
          this.scheduled.push({ fireTick: this.internalTick + delayTicks, nodeId: node.id, ctx });
        }
        return; // defer propagation
      }
      case "once": {
        if (this.onceFired.has(node.id)) return; // already spent
        this.onceFired.add(node.id);
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
      case "showMessage":
        this.hooks.showMessage(ctx.clientId, String(node.params.text ?? ""));
        break;
      case "playSound":
        this.hooks.playSound(num(node.params.freq, 440));
        break;
      case "spawnNPC": {
        const behavior = (["idle", "patrol", "chase", "shoot"].includes(String(node.params.behavior))
          ? node.params.behavior : "idle") as NpcBehavior;
        this.hooks.spawnNpc(String(node.params.url ?? ""), behavior, num(node.params.health, 50), num(node.params.x), num(node.params.z));
        break;
      }
    }

    for (const next of this.adjacency.get(node.id) ?? []) {
      this.fire(next, ctx, visited);
    }
  }
}
