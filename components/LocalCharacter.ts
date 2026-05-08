import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { makeNameLabel, makeGhost, isOccluded } from "./utils/threeHelpers";
import type { Weapon } from "../server/types";

export interface GltfTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export interface CharacterUpdateOpts {
  dt: number;
  isMoving: boolean;
  weapon: Weapon;
  inEditMode: boolean;
  isReloading: boolean;
  camera: THREE.Camera;
}

export class LocalCharacter {
  // Read by GameCanvas
  root: THREE.Object3D | null = null;
  localDead = false;
  currentEmote: string | null = null;
  tplUnarmed: GltfTemplate | null = null;
  tplPistol: GltfTemplate | null = null;
  tplHammer: GltfTemplate | null = null;

  private scene: THREE.Scene;
  private playerName: string;

  private localUnarmed: THREE.Object3D | null = null;
  private localPistol: THREE.Object3D | null = null;
  private localHammer: THREE.Object3D | null = null;
  private mixerUnarmed: THREE.AnimationMixer | null = null;
  private mixerPistol: THREE.AnimationMixer | null = null;
  private mixerHammer: THREE.AnimationMixer | null = null;
  private walkUnarmed: THREE.AnimationAction | null = null;
  private walkPistol: THREE.AnimationAction | null = null;
  private walkHammer: THREE.AnimationAction | null = null;
  private danceAction: THREE.AnimationAction | null = null;
  private breakdanceAction: THREE.AnimationAction | null = null;
  private reloadAction: THREE.AnimationAction | null = null;
  private localGhostUnarmed: THREE.Mesh | null = null;
  private localGhostPistol: THREE.Mesh | null = null;
  private localGhostHammer: THREE.Mesh | null = null;
  private loadedCount = 0;
  private onReloadFinished: (() => void) | null = null;

  constructor(scene: THREE.Scene, playerName: string) {
    this.scene = scene;
    this.playerName = playerName;
  }

  load(onReady: () => void): void {
    const loader = new GLTFLoader();
    const checkDone = () => { if (++this.loadedCount === 3) onReady(); };

    loader.load("/lilguy.gltf", (gltf) => {
      this.tplUnarmed = { scene: gltf.scene.clone(true), animations: gltf.animations };

      const model = gltf.scene;
      model.scale.setScalar(0.48);
      model.visible = true;
      model.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
      this.scene.add(model);
      this.localUnarmed = model;
      this.root = model;
      model.add(makeNameLabel(this.playerName, true));
      this.localGhostUnarmed = makeGhost();
      model.add(this.localGhostUnarmed);

      this.mixerUnarmed = new THREE.AnimationMixer(model);
      if (gltf.animations.length > 0) {
        this.walkUnarmed = this.mixerUnarmed.clipAction(gltf.animations[0]);
        this.walkUnarmed.setLoop(THREE.LoopRepeat, Infinity);
        this.walkUnarmed.play();
        this.walkUnarmed.paused = true;
        this.walkUnarmed.setEffectiveWeight(0);
      }
      const danceClip = gltf.animations.find((a) => a.name === "dance");
      const breakdanceClip = gltf.animations.find((a) => a.name === "Breakdance");
      if (danceClip) {
        this.danceAction = this.mixerUnarmed.clipAction(danceClip);
        this.danceAction.setLoop(THREE.LoopOnce, 1);
        this.danceAction.clampWhenFinished = true;
        this.danceAction.setEffectiveWeight(0);
      }
      if (breakdanceClip) {
        this.breakdanceAction = this.mixerUnarmed.clipAction(breakdanceClip);
        this.breakdanceAction.setLoop(THREE.LoopRepeat, Infinity);
        this.breakdanceAction.setEffectiveWeight(0);
      }
      this.mixerUnarmed.addEventListener("finished", (e) => {
        const action = (e as THREE.Event & { action: THREE.AnimationAction }).action;
        if (action === this.danceAction || action === this.breakdanceAction) {
          this.currentEmote = null;
          action.setEffectiveWeight(0);
          action.stop();
          if (this.walkUnarmed) { this.walkUnarmed.paused = true; this.walkUnarmed.setEffectiveWeight(0); }
        }
      });

      checkDone();
    });

    loader.load("/lilguy_holding_pistol.gltf", (gltf) => {
      this.tplPistol = { scene: gltf.scene.clone(true), animations: gltf.animations };

      const model = gltf.scene;
      model.scale.setScalar(0.48);
      model.visible = false;
      model.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
      this.scene.add(model);
      this.localPistol = model;
      model.add(makeNameLabel(this.playerName, true));
      this.localGhostPistol = makeGhost();
      model.add(this.localGhostPistol);

      this.mixerPistol = new THREE.AnimationMixer(model);
      if (gltf.animations.length > 0) {
        this.walkPistol = this.mixerPistol.clipAction(gltf.animations[0]);
        this.walkPistol.setLoop(THREE.LoopRepeat, Infinity);
        this.walkPistol.play();
        this.walkPistol.paused = true;
        this.walkPistol.setEffectiveWeight(0);
      }
      const reloadClip = gltf.animations.find((a) => a.name === "reload");
      if (reloadClip) {
        this.reloadAction = this.mixerPistol.clipAction(reloadClip);
        this.reloadAction.setLoop(THREE.LoopOnce, 1);
        this.reloadAction.clampWhenFinished = true;
        this.reloadAction.setEffectiveWeight(0);
        this.mixerPistol.addEventListener("finished", (e) => {
          const action = (e as THREE.Event & { action: THREE.AnimationAction }).action;
          if (action === this.reloadAction) {
            this.reloadAction!.setEffectiveWeight(0);
            this.reloadAction!.stop();
            this.onReloadFinished?.();
            this.onReloadFinished = null;
          }
        });
      }

      checkDone();
    });

    loader.load("/lilguy_hammer.gltf", (gltf) => {
      this.tplHammer = { scene: gltf.scene.clone(true), animations: gltf.animations };

      const model = gltf.scene;
      model.scale.setScalar(0.48);
      model.visible = false;
      model.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
      this.scene.add(model);
      this.localHammer = model;
      model.add(makeNameLabel(this.playerName, true));
      this.localGhostHammer = makeGhost();
      model.add(this.localGhostHammer);

      this.mixerHammer = new THREE.AnimationMixer(model);
      if (gltf.animations.length > 0) {
        this.walkHammer = this.mixerHammer.clipAction(gltf.animations[0]);
        this.walkHammer.setLoop(THREE.LoopRepeat, Infinity);
        this.walkHammer.play();
        this.walkHammer.paused = true;
        this.walkHammer.setEffectiveWeight(0);
      }

      checkDone();
    });
  }

  // Returns true if emote started
  triggerEmote(name: "dance" | "breakdance"): boolean {
    if (this.currentEmote) return false;
    if (name === "dance" && this.danceAction && this.walkUnarmed) {
      this.currentEmote = "dance";
      this.walkUnarmed.setEffectiveWeight(0);
      this.walkUnarmed.paused = true;
      this.danceAction.reset();
      this.danceAction.setEffectiveWeight(1);
      this.danceAction.play();
      return true;
    }
    if (name === "breakdance" && this.breakdanceAction && this.walkUnarmed) {
      this.currentEmote = "breakdance";
      this.walkUnarmed.setEffectiveWeight(0);
      this.walkUnarmed.paused = true;
      this.breakdanceAction.reset();
      this.breakdanceAction.setEffectiveWeight(1);
      this.breakdanceAction.play();
      return true;
    }
    return false;
  }

  // Returns true if reload animation started; caller handles ws.send and state
  triggerReload(onFinished: () => void): boolean {
    if (!this.reloadAction || !this.walkPistol || !this.mixerPistol) return false;
    this.walkPistol.setEffectiveWeight(0);
    this.walkPistol.paused = true;
    this.reloadAction.reset();
    this.reloadAction.setEffectiveWeight(1);
    this.reloadAction.play();
    this.onReloadFinished = onFinished;
    return true;
  }

  setDead(): void {
    this.localDead = true;
    if (this.localUnarmed) this.localUnarmed.visible = false;
    if (this.localPistol) this.localPistol.visible = false;
    if (this.localHammer) this.localHammer.visible = false;
  }

  setAlive(x: number, z: number): void {
    this.localDead = false;
    if (this.root) this.root.position.set(x, 0, z);
  }

  update({ dt, isMoving, weapon, inEditMode, isReloading, camera }: CharacterUpdateOpts): void {
    if (!this.localUnarmed || !this.localPistol || !this.localHammer) return;

    // Model swap
    const wantHammer = inEditMode;
    const wantPistol = weapon === "pistol" && !wantHammer;
    this.localUnarmed.visible = !this.localDead && !wantPistol && !wantHammer;
    this.localPistol.visible = !this.localDead && wantPistol;
    this.localHammer.visible = !this.localDead && wantHammer;
    this.root = wantHammer ? this.localHammer : (wantPistol ? this.localPistol : this.localUnarmed);

    // Sync inactive models so swaps are seamless
    for (const m of [this.localUnarmed, this.localPistol, this.localHammer]) {
      if (m !== this.root) {
        m.position.copy(this.root.position);
        m.rotation.copy(this.root.rotation);
      }
    }

    // Occlusion ghost
    if (!this.localDead) {
      const worldPos = new THREE.Vector3();
      this.root.getWorldPosition(worldPos);
      const occluded = isOccluded(camera, worldPos);
      if (this.localGhostUnarmed) this.localGhostUnarmed.visible = occluded && !wantPistol && !wantHammer;
      if (this.localGhostPistol) this.localGhostPistol.visible = occluded && wantPistol;
      if (this.localGhostHammer) this.localGhostHammer.visible = occluded && wantHammer;
    } else {
      if (this.localGhostUnarmed) this.localGhostUnarmed.visible = false;
      if (this.localGhostPistol) this.localGhostPistol.visible = false;
      if (this.localGhostHammer) this.localGhostHammer.visible = false;
    }

    // Stop breakdance on movement
    if (this.currentEmote === "breakdance" && isMoving) {
      this.currentEmote = null;
      if (this.breakdanceAction) { this.breakdanceAction.setEffectiveWeight(0); this.breakdanceAction.stop(); }
      if (this.walkUnarmed) { this.walkUnarmed.paused = false; this.walkUnarmed.setEffectiveWeight(1); }
    }

    // Animation drive
    if (this.currentEmote !== null) {
      this.mixerUnarmed?.update(dt);
    } else if (isReloading && weapon === "pistol") {
      this.mixerPistol?.update(dt);
    } else {
      const activeWalk = wantHammer ? this.walkHammer : (wantPistol ? this.walkPistol : this.walkUnarmed);
      const activeMixer = wantHammer ? this.mixerHammer : (wantPistol ? this.mixerPistol : this.mixerUnarmed);
      if (activeWalk) {
        activeWalk.paused = !isMoving;
        activeWalk.setEffectiveWeight(isMoving ? 1 : 0);
      }
      activeMixer?.update(dt);
    }
  }

  dispose(): void {
    this.mixerUnarmed?.stopAllAction();
    this.mixerPistol?.stopAllAction();
    this.mixerHammer?.stopAllAction();
  }
}
