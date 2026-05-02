import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import type {
  ClientId, PlayerState, ProjectileState, ScoreEntry,
  ServerMessage, ClientMessage, Weapon,
} from "./types";

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const PLAYER_SPEED = 4;
const BOUNDS = 19.5;
const MAX_CHAT_LEN = 200;
const MAX_HEALTH = 100;

// Pistol config
const PROJECTILE_SPEED = 20;       // units/sec
const PROJECTILE_LIFETIME = 2;     // seconds
const PROJECTILE_RADIUS = 0.25;    // hit radius
const PLAYER_RADIUS = 0.25;
const PISTOL_DAMAGE = 25;
const FIRE_RATE_MS = 400;          // min ms between shots per player
const MAX_AMMO = 8;
const RELOAD_MS = 1000;            // matches reload animation duration
const RAMPAGE_KILLS = 10;
const RAMPAGE_MAX_HEALTH = 200;
const RAMPAGE_DAMAGE_MULT = 2;

// Must match TREE_POSITIONS in GameCanvas.tsx
const TREE_RADIUS = 0.4;
const TREES: { x: number; z: number }[] = [
  { x: -8,  z: -8  }, { x:  8, z: -8  }, { x: -8, z:  8  }, { x:  8, z:  8  },
  { x:  0,  z: -14 }, { x:  0, z:  14 }, { x: -14, z: 0  }, { x: 14, z:  0  },
  { x: -12, z:  12 }, { x:  12, z: -12 },
];

interface Client {
  id: ClientId;
  ws: WebSocket;
  name: string;
  inputX: number;
  inputZ: number;
  rotY: number;
  weapon: Weapon;
  dancing: boolean;
  joined: boolean;
  lastShotAt: number;
  reloadingUntil: number; // epoch ms, 0 = not reloading
  killStreak: number;
  onRampage: boolean;
}

interface LiveProjectile extends ProjectileState {
  age: number; // seconds
}

export class Room {
  private clients = new Map<ClientId, Client>();
  private states = new Map<ClientId, PlayerState>();
  private scores = new Map<ClientId, ScoreEntry>();
  private projectiles = new Map<string, LiveProjectile>();
  private tick = 0;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(readonly id: string) {
    this.interval = setInterval(() => this.update(), TICK_MS);
  }

  add(id: ClientId, ws: WebSocket) {
    this.clients.set(id, {
      id, ws, name: "Player",
      inputX: 0, inputZ: 0, rotY: 0,
      weapon: "none", dancing: false, joined: false, lastShotAt: 0, reloadingUntil: 0,
      killStreak: 0, onRampage: false,
    });
    const handshake: ServerMessage = { type: "handshake", yourId: id, tick: this.tick };
    ws.send(JSON.stringify(handshake));
  }

  remove(id: ClientId) {
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
        dancing: false, ammo: MAX_AMMO, reloading: false, onRampage: false,
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
      client.dancing = msg.dancing;
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
      if (client.reloadingUntil > now) return;  // already reloading
      if (state.ammo === MAX_AMMO) return;       // already full

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
      state.dancing = client.dancing;
      state.reloading = client.reloadingUntil > Date.now();
      state.onRampage = client.onRampage;

      if (moving) {
        state.x = Math.max(-BOUNDS, Math.min(BOUNDS, state.x + client.inputX * PLAYER_SPEED * dt));
        state.z = Math.max(-BOUNDS, Math.min(BOUNDS, state.z + client.inputZ * PLAYER_SPEED * dt));

        // Push player out of tree colliders
        for (const tree of TREES) {
          const dx = state.x - tree.x;
          const dz = state.z - tree.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const minDist = TREE_RADIUS + PLAYER_RADIUS;
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) / dist;
            state.x += dx * push;
            state.z += dz * push;
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

      // Out of bounds
      if (Math.abs(proj.x) > BOUNDS || Math.abs(proj.z) > BOUNDS) {
        this.projectiles.delete(pid);
        continue;
      }

      // Hit a tree
      const hitTree = TREES.some((tree) => {
        const dx = proj.x - tree.x;
        const dz = proj.z - tree.z;
        return dx * dx + dz * dz < (TREE_RADIUS + PROJECTILE_RADIUS) ** 2;
      });
      if (hitTree) {
        this.projectiles.delete(pid);
        continue;
      }

      // Hit detection against all other players
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

            // Victim score + streak reset
            const victimScore = this.scores.get(tid);
            if (victimScore) victimScore.deaths++;
            const victimClient = this.clients.get(tid);
            if (victimClient) {
              victimClient.killStreak = 0;
              victimClient.onRampage = false;
            }
            tstate.onRampage = false;
            tstate.maxHealth = MAX_HEALTH;

            // Killer score + streak
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
