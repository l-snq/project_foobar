import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { NpcState } from "../../server/types";
import { hideHitboxGroup } from "../utils/hitboxUtils";

interface Entry {
  root: THREE.Object3D;
  bar: CSS2DObject;
  barFill: HTMLElement;
  targetX: number;
  targetZ: number;
  targetRotY: number;
}

// Renders server-controlled NPCs from snapshots: loads GLB models by url (cached),
// smooths position/rotation, shows a health bar, and reports removals so the caller
// can spawn a death effect.
export class NpcView {
  private entries = new Map<string, Entry>();
  private cache = new Map<string, THREE.Group>();
  private pending = new Set<string>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly loader: GLTFLoader,
    private readonly onNpcRemoved: (x: number, y: number, z: number) => void,
  ) {}

  sync(npcs: NpcState[]) {
    const seen = new Set<string>();
    for (const npc of npcs) {
      seen.add(npc.id);
      const entry = this.entries.get(npc.id);
      if (entry) {
        entry.targetX = npc.x;
        entry.targetZ = npc.z;
        entry.targetRotY = npc.rotY;
        const pct = Math.max(0, Math.min(1, npc.health / npc.maxHealth));
        entry.barFill.style.width = `${pct * 100}%`;
        entry.barFill.style.background = pct > 0.5 ? "#44dd55" : pct > 0.25 ? "#e0b020" : "#d03030";
      } else {
        this.spawn(npc);
      }
    }
    for (const [id, entry] of this.entries) {
      if (!seen.has(id)) {
        this.onNpcRemoved(entry.root.position.x, entry.root.position.y, entry.root.position.z);
        this.disposeEntry(entry);
        this.entries.delete(id);
      }
    }
  }

  update(dt: number) {
    const a = Math.min(1, dt * 12);
    for (const entry of this.entries.values()) {
      entry.root.position.x += (entry.targetX - entry.root.position.x) * a;
      entry.root.position.z += (entry.targetZ - entry.root.position.z) * a;
      // Shortest-path rotation lerp
      let diff = entry.targetRotY - entry.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      entry.root.rotation.y += diff * a;
    }
  }

  dispose() {
    for (const entry of this.entries.values()) this.disposeEntry(entry);
    this.entries.clear();
  }

  private spawn(npc: NpcState) {
    if (this.pending.has(npc.id)) return;
    this.pending.add(npc.id);
    this.load(npc.url).then((root) => {
      this.pending.delete(npc.id);
      if (this.entries.has(npc.id)) return; // raced with another spawn
      hideHitboxGroup(root);
      root.position.set(npc.x, 0, npc.z);
      root.rotation.y = npc.rotY;
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      this.scene.add(root);

      const barWrap = document.createElement("div");
      barWrap.style.cssText = "width:34px;height:5px;background:#300;border:1px solid #000;box-shadow:0 1px 2px rgba(0,0,0,0.6);";
      const barFill = document.createElement("div");
      barFill.style.cssText = "height:100%;width:100%;background:#44dd55;";
      barWrap.appendChild(barFill);
      const bar = new CSS2DObject(barWrap);
      bar.position.set(0, 2.3, 0);
      root.add(bar);

      this.entries.set(npc.id, { root, bar, barFill, targetX: npc.x, targetZ: npc.z, targetRotY: npc.rotY });
    }).catch((e) => {
      this.pending.delete(npc.id);
      console.error(`[npc] failed to load "${npc.url}":`, e);
    });
  }

  private load(url: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      const cached = this.cache.get(url);
      if (cached) { resolve(cached.clone(true)); return; }
      this.loader.load(url, (gltf) => {
        this.cache.set(url, gltf.scene.clone(true));
        resolve(gltf.scene.clone(true));
      }, undefined, reject);
    });
  }

  private disposeEntry(entry: Entry) {
    entry.root.remove(entry.bar);
    this.scene.remove(entry.root);
  }
}
