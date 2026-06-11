import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { PlayerState, Weapon } from "../../server/types";
import { makeNameLabel, makeGhost, isOccluded } from "../utils/threeHelpers";
import type { LocalCharacter, GltfTemplate } from "../LocalCharacter";

const LERP_FACTOR = 0.2;

interface RemotePlayer {
  rootUnarmed: THREE.Object3D;
  rootPistol: THREE.Object3D;
  label: CSS2DObject;
  mixerUnarmed: THREE.AnimationMixer;
  mixerPistol: THREE.AnimationMixer;
  walkActionUnarmed: THREE.AnimationAction;
  walkActionPistol: THREE.AnimationAction;
  danceAction: THREE.AnimationAction | null;
  breakdanceAction: THREE.AnimationAction | null;
  reloadAction: THREE.AnimationAction | null;
  emote: string | null;
  reloading: boolean;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetRotY: number;
  moving: boolean;
  weapon: Weapon;
  health: number;
  dead: boolean;
  ghost: THREE.Mesh;
}

// Mirrors other players from server snapshots: model swap (unarmed/pistol),
// position lerp, walk/emote/reload animations and occlusion ghosts.
export class RemotePlayers {
  private players = new Map<string, RemotePlayer>();
  // States that arrived before the local character's GLTF templates loaded
  private pending: PlayerState[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly character: LocalCharacter,
  ) {}

  applyState(p: PlayerState) {
    if (!this.character.tplUnarmed || !this.character.tplPistol) {
      const existing = this.pending.findIndex((s) => s.id === p.id);
      if (existing >= 0) this.pending[existing] = p;
      else this.pending.push(p);
      return;
    }
    if (!this.players.has(p.id)) {
      this.spawn(p.id, p);
      return;
    }
    const remote = this.players.get(p.id)!;
    remote.targetX = p.x;
    remote.targetY = p.y;
    remote.targetZ = p.z;
    remote.targetRotY = p.rotY;
    remote.moving = p.moving;
    remote.weapon = p.weapon;
    remote.health = p.health;
    remote.emote = p.emote;
    remote.reloading = p.reloading;
    if (remote.dead && p.health > 0) remote.dead = false;
  }

  // Call once the character templates have loaded.
  flushPending() {
    for (const p of this.pending) this.applyState(p);
    this.pending.length = 0;
  }

  removeAbsent(seen: Set<string>) {
    for (const id of this.players.keys()) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  remove(id: string) {
    const remote = this.players.get(id);
    if (!remote) return;
    remote.mixerUnarmed.stopAllAction();
    remote.mixerPistol.stopAllAction();
    // Remove the label from its parent so CSS2DRenderer drops the DOM element
    remote.rootUnarmed.remove(remote.label);
    this.scene.remove(remote.rootUnarmed);
    this.scene.remove(remote.rootPistol);
    this.players.delete(id);
  }

  // Marks the player dead and returns the position for a death explosion.
  markDead(id: string): THREE.Vector3 | null {
    const remote = this.players.get(id);
    if (!remote) return null;
    const root = remote.weapon === "pistol" ? remote.rootPistol : remote.rootUnarmed;
    const pos = root.position.clone();
    remote.dead = true;
    remote.rootUnarmed.visible = false;
    remote.rootPistol.visible = false;
    return pos;
  }

  update(dt: number, camera: THREE.OrthographicCamera) {
    for (const remote of this.players.values()) {
      if (remote.dead) { remote.ghost.visible = false; continue; }
      // Emoting forces unarmed model
      const isPistol = !remote.emote && remote.weapon === "pistol";
      remote.rootUnarmed.visible = !isPistol;
      remote.rootPistol.visible = isPistol;

      const activeRoot = isPistol ? remote.rootPistol : remote.rootUnarmed;
      const inactiveRoot = isPistol ? remote.rootUnarmed : remote.rootPistol;

      activeRoot.position.x += (remote.targetX - activeRoot.position.x) * LERP_FACTOR;
      activeRoot.position.y += (remote.targetY - activeRoot.position.y) * LERP_FACTOR;
      activeRoot.position.z += (remote.targetZ - activeRoot.position.z) * LERP_FACTOR;
      activeRoot.rotation.y += (remote.targetRotY - activeRoot.rotation.y) * LERP_FACTOR;
      inactiveRoot.position.copy(activeRoot.position);
      inactiveRoot.rotation.copy(activeRoot.rotation);

      if (remote.emote) {
        const emoteAction = remote.emote === "breakdance" ? remote.breakdanceAction : remote.danceAction;
        if (emoteAction && emoteAction.weight === 0) {
          remote.walkActionUnarmed.setEffectiveWeight(0);
          remote.walkActionUnarmed.paused = true;
          emoteAction.reset();
          emoteAction.setEffectiveWeight(1);
          emoteAction.play();
        }
        remote.mixerUnarmed.update(dt);
      } else if (remote.reloading && isPistol) {
        if (remote.reloadAction && remote.reloadAction.weight === 0) {
          remote.walkActionPistol.setEffectiveWeight(0);
          remote.walkActionPistol.paused = true;
          remote.reloadAction.reset();
          remote.reloadAction.setEffectiveWeight(1);
          remote.reloadAction.play();
        }
        remote.mixerPistol.update(dt);
      } else {
        if (remote.danceAction && remote.danceAction.weight > 0) {
          remote.danceAction.setEffectiveWeight(0);
          remote.danceAction.stop();
        }
        if (remote.breakdanceAction && remote.breakdanceAction.weight > 0) {
          remote.breakdanceAction.setEffectiveWeight(0);
          remote.breakdanceAction.stop();
        }
        if (remote.reloadAction && remote.reloadAction.weight > 0) {
          remote.reloadAction.setEffectiveWeight(0);
          remote.reloadAction.stop();
        }
        const walk = isPistol ? remote.walkActionPistol : remote.walkActionUnarmed;
        const mixer = isPistol ? remote.mixerPistol : remote.mixerUnarmed;
        if (walk) {
          walk.paused = !remote.moving;
          walk.setEffectiveWeight(remote.moving ? 1 : 0);
        }
        mixer.update(dt);
      }

      const worldPos = new THREE.Vector3();
      activeRoot.getWorldPosition(worldPos);
      remote.ghost.visible = isOccluded(camera, worldPos);
    }
  }

  dispose() {
    for (const id of Array.from(this.players.keys())) this.remove(id);
  }

  private spawn(id: string, state: PlayerState) {
    const makeModel = (tpl: GltfTemplate, visible: boolean) => {
      const model = tpl.scene.clone(true);
      model.scale.setScalar(0.48);
      model.position.set(state.x, state.y, state.z);
      model.rotation.y = state.rotY;
      model.visible = visible;
      model.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
      this.scene.add(model);
      const mixer = new THREE.AnimationMixer(model);
      const clip = tpl.animations[0]?.clone();
      let walkAction!: THREE.AnimationAction;
      if (clip) {
        walkAction = mixer.clipAction(clip);
        walkAction.setLoop(THREE.LoopRepeat, Infinity);
        walkAction.play();
        walkAction.paused = true;
        walkAction.setEffectiveWeight(0);
      }
      return { root: model, mixer, walkAction };
    };

    const tplUnarmed = this.character.tplUnarmed!;
    const tplPistol = this.character.tplPistol!;
    const unarmed = makeModel(tplUnarmed, state.weapon !== "pistol");
    const pistol = makeModel(tplPistol, state.weapon === "pistol");

    const label = makeNameLabel(state.name);
    unarmed.root.add(label);
    pistol.root.add(makeNameLabel(state.name));

    // One-shot actions stop themselves when finished
    const makeOneShot = (mixer: THREE.AnimationMixer, clip: THREE.AnimationClip | undefined, loop: boolean) => {
      if (!clip) return null;
      const action = mixer.clipAction(clip.clone());
      if (loop) {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.setEffectiveWeight(0);
      mixer.addEventListener("finished", (e) => {
        if (e.action === action) { action.setEffectiveWeight(0); action.stop(); }
      });
      return action;
    };

    const danceAction = makeOneShot(unarmed.mixer, tplUnarmed.animations.find((a) => a.name === "dance"), false);
    const breakdanceAction = makeOneShot(unarmed.mixer, tplUnarmed.animations.find((a) => a.name === "Breakdance"), true);
    const reloadAction = makeOneShot(pistol.mixer, tplPistol.animations.find((a) => a.name === "reload"), false);

    const ghost = makeGhost();
    unarmed.root.add(ghost);

    this.players.set(id, {
      rootUnarmed: unarmed.root,
      rootPistol: pistol.root,
      label,
      mixerUnarmed: unarmed.mixer,
      mixerPistol: pistol.mixer,
      walkActionUnarmed: unarmed.walkAction,
      walkActionPistol: pistol.walkAction,
      danceAction,
      breakdanceAction,
      reloadAction,
      emote: state.emote,
      reloading: state.reloading,
      targetX: state.x,
      targetY: state.y,
      targetZ: state.z,
      targetRotY: state.rotY,
      moving: state.moving,
      weapon: state.weapon,
      health: state.health,
      dead: false,
      ghost,
    });
  }
}
