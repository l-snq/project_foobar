import RAPIER from "@dimforge/rapier3d-compat";
import type { ClientId, MapConfig, StaticObject, PlacedObject } from "./types";

export const PLAYER_RADIUS = 0.25;
export const PLAYER_HALF_HEIGHT = 0.5;

export class RoomPhysics {
  world: RAPIER.World;
  playerBodies = new Map<ClientId, RAPIER.RigidBody>();
  playerColliders = new Map<ClientId, RAPIER.Collider>();
  controllers = new Map<ClientId, RAPIER.KinematicCharacterController>();
  placedBodies = new Map<string, RAPIER.RigidBody>();

  constructor(map: MapConfig) {
    this.world = this._buildWorld(map);
  }

  private _buildWorld(map: MapConfig): RAPIER.World {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    for (const obj of map.staticObjects) this._addStaticCollider(world, obj);
    return world;
  }

  private _addStaticCollider(world: RAPIER.World, obj: StaticObject) {
    if (obj.hitboxRadius <= 0) return;
    const hh = (obj.hitboxHeight ?? 1.0) / 2;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(obj.x, 0, obj.z));
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

  addPlacedBody(obj: PlacedObject): void {
    const hx = obj.x + (obj.hitboxOffsetX ?? 0);
    const hz = obj.z + (obj.hitboxOffsetZ ?? 0);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hx, 0, hz));
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

  removePlacedBody(objectId: string): void {
    const body = this.placedBodies.get(objectId);
    if (body) {
      this.world.removeRigidBody(body);
      this.placedBodies.delete(objectId);
    }
  }

  addPlayer(id: ClientId, x: number, z: number): void {
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

  removePlayer(id: ClientId): void {
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

  rebuild(map: MapConfig, playerPositions: Map<ClientId, { x: number; z: number }>): void {
    for (const controller of this.controllers.values()) {
      this.world.removeCharacterController(controller);
    }
    this.controllers.clear();
    this.playerBodies.clear();
    this.playerColliders.clear();
    this.placedBodies.clear();
    this.world = this._buildWorld(map);
    for (const [id, pos] of playerPositions) {
      this.addPlayer(id, pos.x, pos.z);
    }
  }

  destroy(): void {
    for (const controller of this.controllers.values()) {
      this.world.removeCharacterController(controller);
    }
  }
}
