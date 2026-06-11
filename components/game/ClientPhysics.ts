import RAPIER from "@dimforge/rapier3d-compat";
import type { MapConfig, PlacedObject } from "../../server/types";

const PLAYER_HALF_HEIGHT = 0.5;
const PLAYER_RADIUS = 0.25;
const OBJECT_HALF_HEIGHT = 0.5;

// Client-side Rapier world for movement prediction. Mirrors the server's
// static + placed-object colliders; the server remains authoritative.
export class ClientPhysics {
  private world: RAPIER.World | null = null;
  private playerBody: RAPIER.RigidBody | null = null;
  private playerCollider: RAPIER.Collider | null = null;
  private controller: RAPIER.KinematicCharacterController | null = null;
  private placedBodies = new Map<string, RAPIER.RigidBody[]>();
  private bounds = 40;
  private ready = false;
  private pendingMap: MapConfig | null = null;

  // Placed objects can arrive before the world is ready, so buildWorld
  // re-adds whatever the provider currently holds.
  constructor(private readonly getPlacedObjects: () => Iterable<PlacedObject>) {
    RAPIER.init().then(() => {
      this.ready = true;
      if (this.pendingMap) {
        const map = this.pendingMap;
        this.pendingMap = null;
        this.buildWorld(map);
      }
    });
  }

  buildWorld(map: MapConfig) {
    if (!this.ready) { this.pendingMap = map; return; }
    if (this.controller && this.world) {
      this.world.removeCharacterController(this.controller);
      this.controller = null;
    }
    this.playerBody = null;
    this.playerCollider = null;
    this.placedBodies.clear();
    this.bounds = map.bounds;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    for (const obj of map.staticObjects) {
      if (obj.hitboxRadius <= 0) continue;
      const hh = (obj.hitboxHeight ?? 1.0) / 2;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(obj.x, 0, obj.z));
      if (obj.hitboxShape === "cylinder") {
        this.world.createCollider(RAPIER.ColliderDesc.cylinder(hh, obj.hitboxRadius), body);
      } else if (obj.hitboxShape === "capsule") {
        this.world.createCollider(RAPIER.ColliderDesc.capsule(hh, obj.hitboxRadius), body);
      } else {
        const hw = obj.hitboxRadius;
        const hd = obj.hitboxDepth ?? obj.hitboxRadius;
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh, hd), body);
      }
    }
    for (const obj of this.getPlacedObjects()) this.addPlacedBody(obj);
  }

  addPlacedBody(obj: PlacedObject) {
    if (!this.world) return;
    const bodies: RAPIER.RigidBody[] = [];

    if (obj.hitboxes && obj.hitboxes.length > 0) {
      const cos = Math.cos(obj.rotY);
      const sin = Math.sin(obj.rotY);
      for (const hb of obj.hitboxes) {
        const wx = obj.x + (hb.offsetX * cos + hb.offsetZ * sin) * obj.scale;
        const wz = obj.z + (-hb.offsetX * sin + hb.offsetZ * cos) * obj.scale;
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(wx, 0, wz));
        if (hb.shape === "cylinder") {
          this.world.createCollider(RAPIER.ColliderDesc.cylinder(OBJECT_HALF_HEIGHT, hb.halfW * obj.scale), body);
        } else {
          this.world.createCollider(RAPIER.ColliderDesc.cuboid(hb.halfW * obj.scale, OBJECT_HALF_HEIGHT, hb.halfD * obj.scale), body);
        }
        bodies.push(body);
      }
    } else {
      const hx = obj.x + (obj.hitboxOffsetX ?? 0);
      const hz = obj.z + (obj.hitboxOffsetZ ?? 0);
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hx, 0, hz));
      if (obj.hitboxShape === "box") {
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(obj.hitboxRadius, OBJECT_HALF_HEIGHT, obj.hitboxRadius), body);
      } else {
        this.world.createCollider(RAPIER.ColliderDesc.cylinder(OBJECT_HALF_HEIGHT, obj.hitboxRadius), body);
      }
      bodies.push(body);
    }

    this.placedBodies.set(obj.id, bodies);
  }

  removePlacedBody(id: string) {
    const bodies = this.placedBodies.get(id);
    if (bodies && this.world) {
      for (const body of bodies) this.world.removeRigidBody(body);
      this.placedBodies.delete(id);
    }
  }

  get hasPlayer() { return this.playerBody !== null; }

  addPlayer(x: number, z: number) {
    if (!this.world || !this.ready) return;
    if (this.controller) {
      this.world.removeCharacterController(this.controller);
      this.controller = null;
    }
    if (this.playerBody) {
      this.world.removeRigidBody(this.playerBody);
      this.playerBody = null;
      this.playerCollider = null;
    }
    const ctrl = this.world.createCharacterController(0.01);
    ctrl.setSlideEnabled(true);
    ctrl.setApplyImpulsesToDynamicBodies(false);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0, z));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cylinder(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), body);
    this.controller = ctrl;
    this.playerBody = body;
    this.playerCollider = col;
  }

  teleportPlayer(x: number, z: number) {
    this.playerBody?.setNextKinematicTranslation({ x, y: 0, z });
  }

  // Runs desired movement through collision detection, steps the world,
  // and returns the resulting position — or null when physics isn't ready
  // (caller falls back to direct movement).
  movePlayer(dx: number, dz: number): { x: number; z: number } | null {
    if (!this.controller || !this.playerBody || !this.playerCollider || !this.world) return null;
    const cp = this.playerBody.translation();
    this.controller.computeColliderMovement(this.playerCollider, { x: dx, y: 0, z: dz });
    const mv = this.controller.computedMovement();
    this.playerBody.setNextKinematicTranslation({
      x: Math.max(-this.bounds, Math.min(this.bounds, cp.x + mv.x)),
      y: 0,
      z: Math.max(-this.bounds, Math.min(this.bounds, cp.z + mv.z)),
    });
    this.world.step();
    const np = this.playerBody.translation();
    return { x: np.x, z: np.z };
  }

  dispose() {
    if (this.controller && this.world) this.world.removeCharacterController(this.controller);
    this.controller = null;
    this.world = null;
  }
}
