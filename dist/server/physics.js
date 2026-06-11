"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomPhysics = exports.PLAYER_HALF_HEIGHT = exports.PLAYER_RADIUS = void 0;
const rapier3d_compat_1 = __importDefault(require("@dimforge/rapier3d-compat"));
exports.PLAYER_RADIUS = 0.25;
exports.PLAYER_HALF_HEIGHT = 0.5;
class RoomPhysics {
    constructor(map) {
        this.playerBodies = new Map();
        this.playerColliders = new Map();
        this.controllers = new Map();
        this.placedBodies = new Map();
        this.world = this._buildWorld(map);
    }
    _buildWorld(map) {
        const world = new rapier3d_compat_1.default.World({ x: 0, y: 0, z: 0 });
        for (const obj of map.staticObjects)
            this._addStaticCollider(world, obj);
        return world;
    }
    _addStaticCollider(world, obj) {
        if (obj.hitboxes && obj.hitboxes.length > 0) {
            const cos = Math.cos(obj.rotY ?? 0);
            const sin = Math.sin(obj.rotY ?? 0);
            const scale = obj.scale ?? 1;
            for (const hb of obj.hitboxes) {
                const wx = obj.x + (hb.offsetX * cos + hb.offsetZ * sin) * scale;
                const wz = obj.z + (-hb.offsetX * sin + hb.offsetZ * cos) * scale;
                const body = world.createRigidBody(rapier3d_compat_1.default.RigidBodyDesc.fixed().setTranslation(wx, 0, wz));
                world.createCollider(rapier3d_compat_1.default.ColliderDesc.cuboid(hb.halfW * scale, exports.PLAYER_HALF_HEIGHT, hb.halfD * scale), body);
            }
            return;
        }
        if (obj.hitboxRadius <= 0)
            return;
        const hh = (obj.hitboxHeight ?? 1.0) / 2;
        const body = world.createRigidBody(rapier3d_compat_1.default.RigidBodyDesc.fixed().setTranslation(obj.x, 0, obj.z));
        if (obj.hitboxShape === "cylinder") {
            world.createCollider(rapier3d_compat_1.default.ColliderDesc.cylinder(hh, obj.hitboxRadius), body);
        }
        else if (obj.hitboxShape === "capsule") {
            world.createCollider(rapier3d_compat_1.default.ColliderDesc.capsule(hh, obj.hitboxRadius), body);
        }
        else {
            const hw = obj.hitboxRadius;
            const hd = obj.hitboxDepth ?? obj.hitboxRadius;
            world.createCollider(rapier3d_compat_1.default.ColliderDesc.cuboid(hw, hh, hd), body);
        }
    }
    addPlacedBody(obj) {
        const bodies = [];
        if (obj.hitboxes && obj.hitboxes.length > 0) {
            const cos = Math.cos(obj.rotY);
            const sin = Math.sin(obj.rotY);
            for (const hb of obj.hitboxes) {
                const wx = obj.x + (hb.offsetX * cos + hb.offsetZ * sin) * obj.scale;
                const wz = obj.z + (-hb.offsetX * sin + hb.offsetZ * cos) * obj.scale;
                const body = this.world.createRigidBody(rapier3d_compat_1.default.RigidBodyDesc.fixed().setTranslation(wx, 0, wz));
                if (hb.shape === "cylinder") {
                    this.world.createCollider(rapier3d_compat_1.default.ColliderDesc.cylinder(exports.PLAYER_HALF_HEIGHT, hb.halfW * obj.scale), body);
                }
                else {
                    this.world.createCollider(rapier3d_compat_1.default.ColliderDesc.cuboid(hb.halfW * obj.scale, exports.PLAYER_HALF_HEIGHT, hb.halfD * obj.scale), body);
                }
                bodies.push(body);
            }
        }
        else {
            const hx = obj.x + (obj.hitboxOffsetX ?? 0);
            const hz = obj.z + (obj.hitboxOffsetZ ?? 0);
            const body = this.world.createRigidBody(rapier3d_compat_1.default.RigidBodyDesc.fixed().setTranslation(hx, 0, hz));
            if (obj.hitboxShape === "box") {
                this.world.createCollider(rapier3d_compat_1.default.ColliderDesc.cuboid(obj.hitboxRadius, exports.PLAYER_HALF_HEIGHT, obj.hitboxRadius), body);
            }
            else {
                this.world.createCollider(rapier3d_compat_1.default.ColliderDesc.cylinder(exports.PLAYER_HALF_HEIGHT, obj.hitboxRadius), body);
            }
            bodies.push(body);
        }
        this.placedBodies.set(obj.id, bodies);
    }
    removePlacedBody(objectId) {
        const bodies = this.placedBodies.get(objectId);
        if (bodies) {
            for (const body of bodies)
                this.world.removeRigidBody(body);
            this.placedBodies.delete(objectId);
        }
    }
    addPlayer(id, x, z) {
        const controller = this.world.createCharacterController(0.01);
        controller.setSlideEnabled(true);
        controller.setApplyImpulsesToDynamicBodies(false);
        const body = this.world.createRigidBody(rapier3d_compat_1.default.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0, z));
        const collider = this.world.createCollider(rapier3d_compat_1.default.ColliderDesc.cylinder(exports.PLAYER_HALF_HEIGHT, exports.PLAYER_RADIUS), body);
        this.playerBodies.set(id, body);
        this.playerColliders.set(id, collider);
        this.controllers.set(id, controller);
    }
    removePlayer(id) {
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
    rebuild(map, playerPositions) {
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
    destroy() {
        for (const controller of this.controllers.values()) {
            this.world.removeCharacterController(controller);
        }
    }
}
exports.RoomPhysics = RoomPhysics;
