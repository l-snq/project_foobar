import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { WebSocket } from "ws";
import RAPIER from "@dimforge/rapier3d-compat";
import type {
  ClientId, PlayerState, ProjectileState, ScoreEntry,
  ServerMessage, ClientMessage, Weapon, PlacedObject, MapConfig, StaticObject,
} from "./types";
import { saveHomePlacedObjects } from "./db";

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const PLAYER_SPEED = 4;
const MAX_CHAT_LEN = 200;
const MAX_HEALTH = 100;

const PROJECTILE_SPEED = 20;
const PROJECTILE_LIFETIME = 2;
const PROJECTILE_RADIUS = 0.25;
const PLAYER_RADIUS = 0.25;
const PLAYER_HALF_HEIGHT = 0.5;
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
  userId: string;
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
  private world: RAPIER.World;
  private bounds: number;
  private objectsFile: string;
  private pendingMapChange = new Set<ClientId>();
  private isHome: boolean;
  private ownerUserId: string | null;

  private clients = new Map<ClientId, Client>();
  private states = new Map<ClientId, PlayerState>();
  private scores = new Map<ClientId, ScoreEntry>();
  private projectiles = new Map<string, LiveProjectile>();
  private placedObjects = new Map<string, PlacedObject>();
  private tick = 0;
  private interval: ReturnType<typeof setInterval> | null = null;

  // Rapier handles per player
  private playerBodies = new Map<ClientId, RAPIER.RigidBody>();
  private playerColliders = new Map<ClientId, RAPIER.Collider>();
  private controllers = new Map<ClientId, RAPIER.KinematicCharacterController>();
  // Rapier handles per placed object
  private placedBodies = new Map<string, RAPIER.RigidBody>();

  constructor(readonly id: string, mapConfig?: MapConfig, initialPlacedObjects?: PlacedObject[]) {
    this.isHome = id.startsWith("home_");
    this.ownerUserId = this.isHome ? id.replace("home_", "") : null;

    if (mapConfig) {
      this.map = mapConfig;
    } else {
      this.map = JSON.parse(readFileSync(join(MAP_DIR, `${id}.json`), "utf8"));
    }

    if (this.isHome) {
      this.map = {
        ...this.map,
        hideGround: true,
        environment: {
          ...this.map.environment,
          sky: { top: "#0a3d8f", mid: "#3b9fef", horizon: "#d4eeff" },
        },
      };
    }

    this.bounds = this.map.bounds;
    this.objectsFile = join(MAP_DIR, `${id}.placed.json`);
    this.world = this.buildPhysicsWorld();
    this.interval = setInterval(() => this.update(), TICK_MS);

    if (initialPlacedObjects) {
      for (const obj of initialPlacedObjects) {
        this.placedObjects.set(obj.id, obj);
        this.addPlacedBody(obj);
      }
    } else {
      try {
        const data = JSON.parse(readFileSync(this.objectsFile, "utf8")) as PlacedObject[];
        for (const obj of data) {
          this.placedObjects.set(obj.id, obj);
          this.addPlacedBody(obj);
        }
      } catch { /* start empty */ }
    }
  }

  // ---- Physics world ----

  private buildPhysicsWorld(): RAPIER.World {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    for (const obj of this.map.staticObjects) {
      this.addStaticCollider(world, obj);
    }
    return world;
  }

  private addStaticCollider(world: RAPIER.World, obj: StaticObject) {
    const hh = (obj.hitboxHeight ?? 1.0) / 2;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(obj.x, 0, obj.z),
    );
    if (obj.hitboxShape === "cylinder") {
      world.createCollider(RAPIER.ColliderDesc.cylinder(hh, obj.hitboxRadius), body);
    } else if (obj.hitboxShape === "capsule") {
      world.createCollider(RAPIER.ColliderDesc.capsule(hh, obj.hitboxRadius), body);
    } else {
      const hw = obj.hitboxRadius;
      const hd = obj.hitboxDepth ?? obj.hitboxRadius;
      world.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh, hd), body);
    }
  }

  private addPlacedBody(obj: PlacedObject) {
    const hx = obj.x + (obj.hitboxOffsetX ?? 0);
    const hz = obj.z + (obj.hitboxOffsetZ ?? 0);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(hx, 0, hz),
    );
    if (obj.hitboxShape === "box") {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(obj.hitboxRadius, PLAYER_HALF_HEIGHT, obj.hitboxRadius),
        body,
      );
    } else {
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(PLAYER_HALF_HEIGHT, obj.hitboxRadius),
        body,
      );
    }
    this.placedBodies.set(obj.id, body);
  }

  private removePlacedBody(objectId: string) {
    const body = this.placedBodies.get(objectId);
    if (body) {
      this.world.removeRigidBody(body);
      this.placedBodies.delete(objectId);
    }
  }

  private addPlayerPhysics(id: ClientId, x: number, z: number) {
    const controller = this.world.createCharacterController(0.01);
    controller.setSlideEnabled(true);
    controller.setApplyImpulsesToDynamicBodies(false);

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0, z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(PLAYER_HALF_HEIGHT, PLAYER_RADIUS),
      body,
    );
    this.playerBodies.set(id, body);
    this.playerColliders.set(id, collider);
    this.controllers.set(id, controller);
  }

  private removePlayerPhysics(id: ClientId) {
    const controller = this.controllers.get(id);
    if (controller) {
      this.world.removeCharacterController(controller);
      this.controllers.delete(id);
    }
    const body = this.playerBodies.get(id);
    if (body) {
      this.world.removeRigidBody(body);
      this.playerBodies.delete(id);
      this.playerColliders.delete(id);
    }
  }

  private rebuildPhysicsWorld() {
    // Preserve player positions before destroying world
    const playerPositions = new Map<ClientId, { x: number; z: number }>();
    for (const [id, body] of this.playerBodies) {
      const pos = body.translation();
      playerPositions.set(id, { x: pos.x, z: pos.z });
    }

    // Controllers must be freed before the world is dropped
    for (const controller of this.controllers.values()) {
      this.world.removeCharacterController(controller);
    }
    this.controllers.clear();
    this.playerBodies.clear();
    this.playerColliders.clear();
    this.placedBodies.clear();

    this.world = this.buildPhysicsWorld();

    // Re-add player bodies at their previous positions
    for (const [id] of this.clients) {
      const pos = playerPositions.get(id) ?? { x: 0, z: 0 };
      this.addPlayerPhysics(id, pos.x, pos.z);
    }
  }

  // ---- Room lifecycle ----

  private saveMap() {
    try {
      writeFileSync(join(MAP_DIR, `${this.id}.json`), JSON.stringify(this.map, null, 2));
    } catch (e) {
      console.error("[map] Failed to save:", e);
    }
  }

  private saveObjects() {
    if (this.isHome && this.ownerUserId) {
      saveHomePlacedObjects(this.ownerUserId, Array.from(this.placedObjects.values()))
        .catch((e) => console.error(`[home:${this.ownerUserId}] Failed to save objects:`, e));
      return;
    }
    try {
      writeFileSync(this.objectsFile, JSON.stringify(Array.from(this.placedObjects.values()), null, 2));
    } catch (e) {
      console.error("[objects] Failed to save:", e);
    }
  }

  private spawn(): { x: number; z: number } {
    const pts = this.map.spawnPoints;
    return pts[Math.floor(Math.random() * pts.length)] ?? { x: 0, z: 0 };
  }

  add(id: ClientId, ws: WebSocket) {
    this.clients.set(id, {
      id, ws, name: "Player", userId: "",
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
    this.removePlayerPhysics(id);
    for (const [pid, p] of this.projectiles) {
      if (p.ownerId === id) this.projectiles.delete(pid);
    }
    this.broadcast({ type: "playerLeft", id });
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
      client.userId = msg.userId ?? "";
      client.joined = true;
      const spawn = this.spawn();
      this.states.set(id, {
        id, name,
        x: spawn.x, y: 0, z: spawn.z, rotY: 0,
        moving: false, weapon: "none",
        health: MAX_HEALTH, maxHealth: MAX_HEALTH,
        emote: null, ammo: MAX_AMMO, reloading: false, onRampage: false,
      });
      this.scores.set(id, { id, name, kills: 0, deaths: 0 });
      this.addPlayerPhysics(id, spawn.x, spawn.z);
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
      client.lastShotAt = now;
      state.ammo--;
      const pid = randomUUID();
      this.projectiles.set(pid, {
        id: pid, ownerId: id,
        x: state.x, z: state.z,
        dirX: msg.dirX / len, dirZ: msg.dirZ / len,
        age: 0,
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
      if (this.isHome && client.userId !== this.ownerUserId) return;
      if (
        typeof msg.url !== "string" ||
        !msg.url.startsWith("/uploads/") ||
        (!msg.url.endsWith(".gltf") && !msg.url.endsWith(".glb"))
      ) return;
      if (msg.scale < 0.1 || msg.scale > 10) return;
      if (Math.abs(msg.x) > 40 || Math.abs(msg.z) > 40) return;
      const hitboxRadius = Math.max(0.1, Math.min(10, msg.hitboxRadius ?? 1.0));
      const obj: PlacedObject = {
        id: randomUUID(), url: msg.url, placedBy: id,
        x: msg.x, z: msg.z, rotY: msg.rotY, scale: msg.scale,
        hitboxShape: msg.hitboxShape === "box" ? "box" : "cylinder",
        hitboxRadius,
        hitboxOffsetX: msg.hitboxOffsetX ?? 0,
        hitboxOffsetZ: msg.hitboxOffsetZ ?? 0,
      };
      this.placedObjects.set(obj.id, obj);
      this.addPlacedBody(obj);
      this.saveObjects();
      this.broadcast({ type: "objectPlaced", object: obj });
    }

    if (msg.type === "moveObject") {
      if (this.isHome && client.userId !== this.ownerUserId) return;
      const obj = this.placedObjects.get(msg.id);
      if (!obj) return;
      if (msg.scale < 0.1 || msg.scale > 10) return;
      if (Math.abs(msg.x) > 40 || Math.abs(msg.z) > 40) return;
      this.removePlacedBody(obj.id);
      obj.x = msg.x;
      obj.z = msg.z;
      obj.rotY = msg.rotY;
      obj.scale = msg.scale;
      obj.hitboxShape = msg.hitboxShape === "box" ? "box" : "cylinder";
      obj.hitboxRadius = Math.max(0.1, Math.min(10, msg.hitboxRadius ?? obj.hitboxRadius));
      obj.hitboxOffsetX = msg.hitboxOffsetX ?? 0;
      obj.hitboxOffsetZ = msg.hitboxOffsetZ ?? 0;
      this.addPlacedBody(obj);
      this.saveObjects();
      this.broadcast({ type: "objectMoved", object: obj });
    }

    if (msg.type === "deleteObject") {
      if (this.isHome && client.userId !== this.ownerUserId) return;
      if (!this.placedObjects.has(msg.id)) return;
      this.removePlacedBody(msg.id);
      this.placedObjects.delete(msg.id);
      this.saveObjects();
      this.broadcast({ type: "objectDeleted", id: msg.id });
    }

    if (msg.type === "bakeMap") {
      const newStatics: StaticObject[] = [
        ...this.map.staticObjects,
        ...Array.from(this.placedObjects.values()).map((obj) => ({
          url: obj.url,
          x: obj.x, z: obj.z, rotY: obj.rotY,
          scale: obj.scale,
          hitboxShape: obj.hitboxShape,
          hitboxRadius: obj.hitboxRadius,
        })),
      ];
      this.map = { ...this.map, staticObjects: newStatics };
      this.placedObjects.clear();
      this.saveMap();
      this.saveObjects();
      this.rebuildPhysicsWorld();
      this.broadcast({ type: "mapBaked" });
      console.log(`[${this.id}] Map baked: ${newStatics.length} static objects`);
    }
  }

  // ---- Game loop ----

  private update() {
    this.tick++;
    const dt = TICK_MS / 1000;

    // 1. Apply desired movement via character controllers
    for (const [id, client] of this.clients) {
      if (!client.joined) continue;
      const state = this.states.get(id)!;
      if (state.health <= 0) continue;

      state.moving = client.inputX !== 0 || client.inputZ !== 0;
      state.rotY = client.rotY;
      state.weapon = client.weapon;
      state.emote = client.emote;
      state.reloading = client.reloadingUntil > Date.now();
      state.onRampage = client.onRampage;

      const body = this.playerBodies.get(id);
      const collider = this.playerColliders.get(id);
      const controller = this.controllers.get(id);
      if (!body || !collider || !controller) continue;

      const desired = {
        x: client.inputX * PLAYER_SPEED * dt,
        y: 0,
        z: client.inputZ * PLAYER_SPEED * dt,
      };
      controller.computeColliderMovement(collider, desired);
      const mv = controller.computedMovement();
      const pos = body.translation();
      body.setNextKinematicTranslation({
        x: Math.max(-this.bounds, Math.min(this.bounds, pos.x + mv.x)),
        y: 0,
        z: Math.max(-this.bounds, Math.min(this.bounds, pos.z + mv.z)),
      });
    }

    // 2. Step physics
    this.world.step();

    // 3. Read back positions, check water + doors
    for (const [id, client] of this.clients) {
      if (!client.joined) continue;
      const state = this.states.get(id)!;
      if (state.health <= 0) continue;

      const body = this.playerBodies.get(id);
      if (body) {
        const pos = body.translation();
        state.x = pos.x;
        state.z = pos.z;
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

    // 4. Move projectiles + wall hit detection via ray cast
    for (const [pid, proj] of this.projectiles) {
      proj.age += dt;
      if (proj.age > PROJECTILE_LIFETIME) {
        this.projectiles.delete(pid);
        continue;
      }

      const stepDist = PROJECTILE_SPEED * dt;
      const ray = new RAPIER.Ray(
        { x: proj.x, y: 0, z: proj.z },
        { x: proj.dirX, y: 0, z: proj.dirZ },
      );
      // EXCLUDE_KINEMATIC so bullets pass through players (handled below)
      const hit = this.world.castRay(ray, stepDist + PROJECTILE_RADIUS, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
      if (hit !== null) {
        this.projectiles.delete(pid);
        continue;
      }

      proj.x += proj.dirX * stepDist;
      proj.z += proj.dirZ * stepDist;

      if (Math.abs(proj.x) > this.bounds || Math.abs(proj.z) > this.bounds) {
        this.projectiles.delete(pid);
        continue;
      }

      // Player hit detection
      for (const [tid, tstate] of this.states) {
        if (tid === proj.ownerId) continue;
        if (tstate.health <= 0) continue;
        const dx = proj.x - tstate.x;
        const dz = proj.z - tstate.z;
        if (Math.sqrt(dx * dx + dz * dz) < PROJECTILE_RADIUS + PLAYER_RADIUS) {
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
            if (victimClient) { victimClient.killStreak = 0; victimClient.onRampage = false; }
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

            const respawnPos = this.spawn();
            setTimeout(() => {
              const s = this.states.get(tid);
              if (!s) return;
              s.health = s.maxHealth;
              s.x = respawnPos.x;
              s.z = respawnPos.z;
              const b = this.playerBodies.get(tid);
              if (b) b.setNextKinematicTranslation({ x: respawnPos.x, y: 0, z: respawnPos.z });
            }, 3000);
          }
          break;
        }
      }
    }

    this.broadcast({
      type: "snapshot",
      tick: this.tick,
      players: Array.from(this.states.values()),
      projectiles: Array.from(this.projectiles.values()).map(
        ({ id, ownerId, x, z, dirX, dirZ }) => ({ id, ownerId, x, z, dirX, dirZ }),
      ),
      scores: Array.from(this.scores.values()),
    });
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
    for (const controller of this.controllers.values()) {
      this.world.removeCharacterController(controller);
    }
  }
}
