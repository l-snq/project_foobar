import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import type { WebSocket } from "ws";
import type {
  ClientId, PlayerState, ProjectileState, ScoreEntry,
  ServerMessage, ClientMessage, Weapon, PlacedObject, MapConfig, StaticObject,
} from "./types";
import { SpatialGrid } from "./SpatialGrid";

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const PLAYER_SPEED = 4;
const MAX_CHAT_LEN = 200;
const MAX_HEALTH = 100;

// Pistol config
const PROJECTILE_SPEED = 20;
const PROJECTILE_LIFETIME = 2;
const PROJECTILE_RADIUS = 0.25;
const PLAYER_RADIUS = 0.25;
const PISTOL_DAMAGE = 25;
const FIRE_RATE_MS = 400;
const MAX_AMMO = 8;
const RELOAD_MS = 1000;
const RAMPAGE_KILLS = 10;
const RAMPAGE_MAX_HEALTH = 200;
const RAMPAGE_DAMAGE_MULT = 2;

export const MAP_DIR = join(process.cwd(), "maps");

interface Client {
  id: ClientId;
  ws: WebSocket;
  name: string;
  inputX: number;
  inputZ: number;
  rotY: number;
  weapon: Weapon;
  emote: string | null;
  joined: boolean;
  lastShotAt: number;
  reloadingUntil: number;
  killStreak: number;
  onRampage: boolean;
}

interface LiveProjectile extends ProjectileState {
  age: number;
}

export class Room {
  private map: MapConfig;
  private staticGrid: SpatialGrid;
  private maxStaticRadius: number;
  private bounds: number;
  private objectsFile: string;
  private pendingMapChange = new Set<ClientId>();

  private clients = new Map<ClientId, Client>();
  private states = new Map<ClientId, PlayerState>();
  private scores = new Map<ClientId, ScoreEntry>();
  private projectiles = new Map<string, LiveProjectile>();
  private placedObjects = new Map<string, PlacedObject>();
  private tick = 0;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(readonly id: string) {
    this.map = JSON.parse(readFileSync(join(MAP_DIR, `${id}.json`), "utf8"));
    this.bounds = this.map.bounds;
    this.objectsFile = join(MAP_DIR, `${id}.placed.json`);

    this.staticGrid = this.buildGrid();
    this.maxStaticRadius = this.calcMaxStaticRadius();

    this.interval = setInterval(() => this.update(), TICK_MS);
    try {
      const data = JSON.parse(readFileSync(this.objectsFile, "utf8")) as PlacedObject[];
      for (const obj of data) this.placedObjects.set(obj.id, obj);
    } catch { /* file doesn't exist yet, start empty */ }
  }

  private buildGrid(): SpatialGrid {
    const half = this.map.groundSize / 2;
    const grid = new SpatialGrid(2, -half, -half, half, half);
    for (const obj of this.map.staticObjects) {
      if (obj.hitboxShape === "cylinder") {
        grid.insert({ x: obj.x, z: obj.z, radius: obj.hitboxRadius });
      }
    }
    return grid;
  }

  private calcMaxStaticRadius(): number {
    return Math.max(0.1, ...this.map.staticObjects.map((o) => o.hitboxRadius));
  }

  private saveMap() {
    try {
      writeFileSync(join(MAP_DIR, `${this.id}.json`), JSON.stringify(this.map, null, 2));
    } catch (e) {
      console.error("[map] Failed to save:", e);
    }
  }

  add(id: ClientId, ws: WebSocket) {
    this.clients.set(id, {
      id, ws, name: "Player",
      inputX: 0, inputZ: 0, rotY: 0,
      weapon: "none", emote: null, joined: false, lastShotAt: 0, reloadingUntil: 0,
      killStreak: 0, onRampage: false,
    });
    const handshake: ServerMessage = { type: "handshake", yourId: id, tick: this.tick, map: this.map };
    ws.send(JSON.stringify(handshake));
    const objList: ServerMessage = { type: "objectList", objects: Array.from(this.placedObjects.values()) };
    ws.send(JSON.stringify(objList));
  }

  remove(id: ClientId) {
    this.pendingMapChange.delete(id);
    this.clients.delete(id);
    this.states.delete(id);
    this.scores.delete(id);
    for (const [pid, p] of this.projectiles) {
      if (p.ownerId === id) this.projectiles.delete(pid);
    }
    const msg: ServerMessage = { type: "playerLeft", id };
    this.broadcast(msg);
  }

  handleMessage(id: ClientId, raw: string) {
    if (this.pendingMapChange.has(id)) return;
    let msg: ClientMessage;
    try { msg = JSON.parse(raw); } catch { return; }
    const client = this.clients.get(id);
    if (!client) return;

    if (msg.type === "join") {
      const name = msg.name.trim().slice(0, 24) || "Player";
      client.name = name;
      client.joined = true;
      this.states.set(id, {
        id, name, x: 0, y: 0, z: 0, rotY: 0,
        moving: false, weapon: "none",
        health: MAX_HEALTH, maxHealth: MAX_HEALTH,
        emote: null, ammo: MAX_AMMO, reloading: false, onRampage: false,
      });
      this.scores.set(id, { id, name, kills: 0, deaths: 0 });
      return;
    }

    if (!client.joined) return;

    if (msg.type === "input") {
      const len = Math.sqrt(msg.x * msg.x + msg.z * msg.z);
      client.inputX = len > 1 ? msg.x / len : msg.x;
      client.inputZ = len > 1 ? msg.z / len : msg.z;
      client.rotY = msg.rotY;
      client.weapon = msg.weapon;
      client.emote = msg.emote;
    }

    if (msg.type === "shoot") {
      const now = Date.now();
      if (now - client.lastShotAt < FIRE_RATE_MS) return;
      const state = this.states.get(id);
      if (!state || state.health <= 0) return;
      if (client.weapon !== "pistol") return;
      if (client.reloadingUntil > now) return;
      if (state.ammo <= 0) return;

      const len = Math.sqrt(msg.dirX * msg.dirX + msg.dirZ * msg.dirZ);
      if (len < 0.001) return;
      const dirX = msg.dirX / len;
      const dirZ = msg.dirZ / len;

      client.lastShotAt = now;
      state.ammo--;
      const pid = randomUUID();
      this.projectiles.set(pid, {
        id: pid, ownerId: id,
        x: state.x, z: state.z, dirX, dirZ, age: 0,
      });
    }

    if (msg.type === "reload") {
      const now = Date.now();
      const state = this.states.get(id);
      if (!state || state.health <= 0) return;
      if (client.weapon !== "pistol") return;
      if (client.reloadingUntil > now) return;
      if (state.ammo === MAX_AMMO) return;

      client.reloadingUntil = now + RELOAD_MS;
      state.reloading = true;
      setTimeout(() => {
        const s = this.states.get(id);
        if (!s) return;
        s.ammo = MAX_AMMO;
        s.reloading = false;
        client.reloadingUntil = 0;
      }, RELOAD_MS);
    }

    if (msg.type === "chat") {
      const text = msg.text.trim().slice(0, MAX_CHAT_LEN);
      if (!text) return;
      this.broadcast({ type: "chat", fromId: id, fromName: client.name, text });
    }

    if (msg.type === "placeObject") {
      if (
        typeof msg.url !== "string" ||
        !msg.url.startsWith("/uploads/") ||
        (!msg.url.endsWith(".gltf") && !msg.url.endsWith(".glb"))
      ) return;
      if (msg.scale < 0.1 || msg.scale > 10) return;
      if (Math.abs(msg.x) > 40 || Math.abs(msg.z) > 40) return;
      const hitboxRadius = Math.max(0.1, Math.min(10, msg.hitboxRadius ?? 1.0));
      const obj: PlacedObject = {
        id: randomUUID(),
        url: msg.url,
        placedBy: id,
        x: msg.x,
        z: msg.z,
        rotY: msg.rotY,
        scale: msg.scale,
        hitboxShape: msg.hitboxShape === "box" ? "box" : "cylinder",
        hitboxRadius,
        hitboxOffsetX: msg.hitboxOffsetX ?? 0,
        hitboxOffsetZ: msg.hitboxOffsetZ ?? 0,
      };
      this.placedObjects.set(obj.id, obj);
      this.saveObjects();
      this.broadcast({ type: "objectPlaced", object: obj });
    }

    if (msg.type === "moveObject") {
      const obj = this.placedObjects.get(msg.id);
      if (!obj) return;
      if (msg.scale < 0.1 || msg.scale > 10) return;
      if (Math.abs(msg.x) > 40 || Math.abs(msg.z) > 40) return;
      obj.x = msg.x;
      obj.z = msg.z;
      obj.rotY = msg.rotY;
      obj.scale = msg.scale;
      obj.hitboxShape = msg.hitboxShape === "box" ? "box" : "cylinder";
      obj.hitboxRadius = Math.max(0.1, Math.min(10, msg.hitboxRadius ?? obj.hitboxRadius));
      obj.hitboxOffsetX = msg.hitboxOffsetX ?? 0;
      obj.hitboxOffsetZ = msg.hitboxOffsetZ ?? 0;
      this.saveObjects();
      this.broadcast({ type: "objectMoved", object: obj });
    }

    if (msg.type === "deleteObject") {
      if (!this.placedObjects.has(msg.id)) return;
      this.placedObjects.delete(msg.id);
      this.saveObjects();
      this.broadcast({ type: "objectDeleted", id: msg.id });
    }

    if (msg.type === "bakeMap") {
      // Promote all placed objects to static objects
      const newStatics: StaticObject[] = [
        ...this.map.staticObjects,
        ...Array.from(this.placedObjects.values()).map((obj) => ({
          url: obj.url,
          x: obj.x,
          z: obj.z,
          rotY: obj.rotY,
          scale: obj.scale,
          hitboxShape: obj.hitboxShape,
          hitboxRadius: obj.hitboxRadius,
        })),
      ];
      this.map = { ...this.map, staticObjects: newStatics };
      this.staticGrid = this.buildGrid();
      this.maxStaticRadius = this.calcMaxStaticRadius();
      this.placedObjects.clear();
      this.saveMap();
      this.saveObjects();
      this.broadcast({ type: "mapBaked" });
      console.log(`[${this.id}] Map baked: ${newStatics.length} static objects`);
    }
  }

  private saveObjects() {
    try {
      writeFileSync(this.objectsFile, JSON.stringify(Array.from(this.placedObjects.values()), null, 2));
    } catch (e) {
      console.error("[objects] Failed to save:", e);
    }
  }

  private update() {
    this.tick++;
    const dt = TICK_MS / 1000;

    // Move players
    for (const [id, client] of this.clients) {
      if (!client.joined) continue;
      const state = this.states.get(id)!;
      if (state.health <= 0) continue;

      const moving = client.inputX !== 0 || client.inputZ !== 0;
      state.moving = moving;
      state.rotY = client.rotY;
      state.weapon = client.weapon;
      state.emote = client.emote;
      state.reloading = client.reloadingUntil > Date.now();
      state.onRampage = client.onRampage;

      if (moving) {
        state.x = Math.max(-this.bounds, Math.min(this.bounds, state.x + client.inputX * PLAYER_SPEED * dt));
        state.z = Math.max(-this.bounds, Math.min(this.bounds, state.z + client.inputZ * PLAYER_SPEED * dt));

        for (const col of this.staticGrid.query(state.x, state.z, PLAYER_RADIUS + this.maxStaticRadius)) {
          const dx = state.x - col.x;
          const dz = state.z - col.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const minDist = col.radius + PLAYER_RADIUS;
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) / dist;
            state.x += dx * push;
            state.z += dz * push;
          }
        }

        for (const obj of this.placedObjects.values()) {
          const hx = obj.x + (obj.hitboxOffsetX ?? 0);
          const hz = obj.z + (obj.hitboxOffsetZ ?? 0);
          if (obj.hitboxShape === "box") {
            const hw = obj.hitboxRadius;
            const closestX = Math.max(hx - hw, Math.min(hx + hw, state.x));
            const closestZ = Math.max(hz - hw, Math.min(hz + hw, state.z));
            const dx = state.x - closestX;
            const dz = state.z - closestZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < PLAYER_RADIUS && dist > 0) {
              const push = (PLAYER_RADIUS - dist) / dist;
              state.x += dx * push;
              state.z += dz * push;
            }
          } else {
            const dx = state.x - hx;
            const dz = state.z - hz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const minDist = obj.hitboxRadius + PLAYER_RADIUS;
            if (dist < minDist && dist > 0) {
              const push = (minDist - dist) / dist;
              state.x += dx * push;
              state.z += dz * push;
            }
          }
        }
      }

      // Water Y offset
      state.y = 0;
      for (const zone of this.map.waterZones) {
        const halfW = zone.width / 2;
        const halfH = zone.height / 2;
        if (
          state.x >= zone.x - halfW && state.x <= zone.x + halfW &&
          state.z >= zone.z - halfH && state.z <= zone.z + halfH
        ) {
          state.y = -0.5;
          break;
        }
      }

      // Door triggers
      if (!this.pendingMapChange.has(id)) {
        for (const door of this.map.doors) {
          const dx = state.x - door.x;
          const dz = state.z - door.z;
          if (dx * dx + dz * dz < door.triggerRadius * door.triggerRadius) {
            this.pendingMapChange.add(id);
            client.ws.send(JSON.stringify({ type: "changeMap", targetMapId: door.targetMapId } satisfies ServerMessage));
            this.remove(id);
            break;
          }
        }
      }
    }

    // Move projectiles and check hits
    for (const [pid, proj] of this.projectiles) {
      proj.age += dt;
      if (proj.age > PROJECTILE_LIFETIME) {
        this.projectiles.delete(pid);
        continue;
      }

      proj.x += proj.dirX * PROJECTILE_SPEED * dt;
      proj.z += proj.dirZ * PROJECTILE_SPEED * dt;

      if (Math.abs(proj.x) > this.bounds || Math.abs(proj.z) > this.bounds) {
        this.projectiles.delete(pid);
        continue;
      }

      const hitStatic = this.staticGrid.query(proj.x, proj.z, PROJECTILE_RADIUS + this.maxStaticRadius).some((col) => {
        const dx = proj.x - col.x;
        const dz = proj.z - col.z;
        return dx * dx + dz * dz < (col.radius + PROJECTILE_RADIUS) ** 2;
      });
      if (hitStatic) {
        this.projectiles.delete(pid);
        continue;
      }

      for (const [tid, tstate] of this.states) {
        if (tid === proj.ownerId) continue;
        if (tstate.health <= 0) continue;

        const dx = proj.x - tstate.x;
        const dz = proj.z - tstate.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < PROJECTILE_RADIUS + PLAYER_RADIUS) {
          this.projectiles.delete(pid);

          const shooterClient = this.clients.get(proj.ownerId);
          const damage = (shooterClient?.onRampage ? RAMPAGE_DAMAGE_MULT : 1) * PISTOL_DAMAGE;
          tstate.health = Math.max(0, tstate.health - damage);
          this.broadcast({ type: "hit", targetId: tid, health: tstate.health });

          if (tstate.health <= 0) {
            this.broadcast({ type: "died", targetId: tid });

            const victimScore = this.scores.get(tid);
            if (victimScore) victimScore.deaths++;
            const victimClient = this.clients.get(tid);
            if (victimClient) {
              victimClient.killStreak = 0;
              victimClient.onRampage = false;
            }
            tstate.onRampage = false;
            tstate.maxHealth = MAX_HEALTH;

            const killerScore = this.scores.get(proj.ownerId);
            if (killerScore) killerScore.kills++;
            if (shooterClient) {
              shooterClient.killStreak++;
              if (shooterClient.killStreak >= RAMPAGE_KILLS && !shooterClient.onRampage) {
                shooterClient.onRampage = true;
                const killerState = this.states.get(proj.ownerId);
                if (killerState) {
                  killerState.onRampage = true;
                  killerState.maxHealth = RAMPAGE_MAX_HEALTH;
                  killerState.health = RAMPAGE_MAX_HEALTH;
                }
                this.broadcast({ type: "rampage", playerId: proj.ownerId, playerName: shooterClient.name });
              }
            }

            setTimeout(() => {
              const s = this.states.get(tid);
              if (!s) return;
              s.health = s.maxHealth;
              s.x = 0;
              s.z = 0;
            }, 3000);
          }
          break;
        }
      }
    }

    const snapshot: ServerMessage = {
      type: "snapshot",
      tick: this.tick,
      players: Array.from(this.states.values()),
      projectiles: Array.from(this.projectiles.values()).map(({ id, ownerId, x, z, dirX, dirZ }) => ({
        id, ownerId, x, z, dirX, dirZ,
      })),
      scores: Array.from(this.scores.values()),
    };
    this.broadcast(snapshot);
  }

  private broadcast(msg: ServerMessage) {
    const raw = JSON.stringify(msg);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === 1) client.ws.send(raw);
    }
  }

  get size() { return this.clients.size; }

  destroy() {
    if (this.interval) clearInterval(this.interval);
  }
}
