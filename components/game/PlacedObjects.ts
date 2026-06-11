import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { ClientMessage, HitboxDef, PlacedObject, StoreItem } from "../../server/types";
import { extractHitboxes, hideHitboxGroup } from "../utils/hitboxUtils";
import type { ClientPhysics } from "./ClientPhysics";

export interface SelectedObjectInfo {
  id: string;
  scale: number;
  rotY: number;
  hitboxShape: "cylinder" | "box";
  hitboxRadius: number;
  hitboxOffsetX: number;
  hitboxOffsetZ: number;
}

interface PlacedEntry {
  data: PlacedObject;
  root: THREE.Object3D;
  hitboxMesh: THREE.Object3D;
}

interface Options {
  scene: THREE.Scene;
  loader: GLTFLoader;
  physics: ClientPhysics;
  camera: THREE.Camera;
  domElement: HTMLElement;
  send: (msg: ClientMessage) => void;
  onSelectionChange: (sel: SelectedObjectInfo | null) => void;
  onPlacementModeChange: (active: boolean) => void;
}

// Manages user-placed GLB objects: spawning from server messages, the
// placement ghost, edit-mode selection with a translate gizmo, hitbox
// wireframes and the client-side physics bodies that mirror them.
export class PlacedObjects {
  private entries = new Map<string, PlacedEntry>();
  private gltfCache = new Map<string, THREE.Group>();
  private rootToId = new Map<THREE.Object3D, string>();

  private ghost: THREE.Object3D | null = null;
  private placementUrl: string | null = null;
  private placementStoreItemId: string | null = null;
  private placementPreset: Partial<PlacedObject> | null = null;
  private placementHitboxes: HitboxDef[] = [];
  private placementGen = 0;

  private selectedId: string | null = null;
  private selectionBox: THREE.Box3Helper | null = null;
  private clipboard: PlacedObject | null = null;
  private debugVisible = false;

  private transformControls: TransformControls;
  private gizmoPointerDown = false;

  constructor(private readonly opts: Options) {
    const tc = new TransformControls(opts.camera, opts.domElement);
    tc.setMode("translate");
    tc.setSpace("world");
    tc.showY = false; // ground-plane only
    opts.scene.add(tc.getHelper());
    this.transformControls = tc;

    // Track when the gizmo captures a pointer-down so click handling can ignore it
    tc.addEventListener("mouseDown", () => { this.gizmoPointerDown = true; });
    tc.addEventListener("mouseUp", () => {
      this.gizmoPointerDown = false;
      // Send final position to server after drag ends
      const entry = this.selectedId ? this.entries.get(this.selectedId) : null;
      if (entry) this.sendMove(entry.data);
    });

    // Live-update hitbox and selection box while dragging
    tc.addEventListener("objectChange", () => {
      if (!this.selectedId) return;
      const entry = this.entries.get(this.selectedId);
      if (!entry) return;
      entry.data.x = entry.root.position.x;
      entry.data.z = entry.root.position.z;
      this.updateHitboxMesh(entry);
      this.opts.physics.removePlacedBody(this.selectedId);
      this.opts.physics.addPlacedBody(entry.data);
      this.refreshSelectionBox(entry.root);
    });
  }

  get isPlacing() { return this.placementUrl !== null; }
  get isGizmoActive() { return this.gizmoPointerDown; }
  get currentSelectedId() { return this.selectedId; }

  allData(): Iterable<PlacedObject> {
    return Array.from(this.entries.values(), (e) => e.data);
  }

  async add(rawData: PlacedObject) {
    if (this.entries.has(rawData.id)) return;
    // Migrate objects saved before hitbox fields were added
    const data: PlacedObject = {
      ...rawData,
      hitboxShape: rawData.hitboxShape ?? "cylinder",
      hitboxRadius: rawData.hitboxRadius ?? 1.0,
      hitboxOffsetX: rawData.hitboxOffsetX ?? 0,
      hitboxOffsetZ: rawData.hitboxOffsetZ ?? 0,
    };
    const root = await this.loadGltf(data.url);
    hideHitboxGroup(root);
    this.applyRootTransform(data, root);
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    this.opts.scene.add(root);
    const hitboxMesh = this.makeHitboxMesh(data);
    hitboxMesh.visible = this.debugVisible;
    this.opts.scene.add(hitboxMesh);
    this.entries.set(data.id, { data, root, hitboxMesh });
    this.rootToId.set(root, data.id);
    this.opts.physics.addPlacedBody(data);
  }

  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.rootToId.delete(entry.root);
    this.opts.scene.remove(entry.root);
    this.disposeHitboxMesh(entry.hitboxMesh);
    this.opts.scene.remove(entry.hitboxMesh);
    this.entries.delete(id);
    this.opts.physics.removePlacedBody(id);
    if (this.selectedId === id) this.select(null);
  }

  // Another client (or the server echo) moved an object.
  applyServerMove(obj: PlacedObject) {
    const entry = this.entries.get(obj.id);
    if (!entry) {
      this.add(obj).catch((e) => console.error("[objectMoved] add failed:", e));
      return;
    }
    entry.data = obj;
    this.applyRootTransform(obj, entry.root);
    this.opts.physics.removePlacedBody(obj.id);
    this.opts.physics.addPlacedBody(obj);
    this.updateHitboxMesh(entry);
    if (this.selectedId === obj.id) {
      this.refreshSelectionBox(entry.root);
      this.opts.onSelectionChange(this.selectionInfo(obj));
    }
  }

  // ---- Placement mode ----

  enterPlacement(url: string, preset?: Partial<PlacedObject>) {
    this.clearGhost();
    const gen = ++this.placementGen;
    this.placementUrl = url;
    this.placementPreset = preset ?? null;
    this.placementHitboxes = preset?.hitboxes ?? [];
    this.opts.onPlacementModeChange(true);
    this.loadGltf(url).then((root) => {
      if (gen !== this.placementGen) return; // placement was cancelled while loading
      // Extract hitboxes BEFORE applying scale/rotation so offsets are in model-local space
      if (!preset?.hitboxes) {
        this.placementHitboxes = extractHitboxes(root);
      }
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const makeTranslucent = (m: THREE.Material) => {
            const c = m.clone();
            c.transparent = true;
            c.opacity = 0.45;
            return c;
          };
          child.material = Array.isArray(child.material)
            ? child.material.map(makeTranslucent)
            : makeTranslucent(child.material as THREE.Material);
        }
      });
      if (preset?.scale) root.scale.setScalar(preset.scale);
      if (preset?.rotY !== undefined) root.rotation.y = preset.rotY;
      this.ghost = root;
      this.opts.scene.add(root);
    });
  }

  enterStoreItemPlacement(item: StoreItem) {
    this.placementStoreItemId = item.id;
    this.enterPlacement(item.model_url);
  }

  exitPlacement() {
    this.placementGen++;
    this.clearGhost();
    this.placementUrl = null;
    this.placementStoreItemId = null;
    this.placementPreset = null;
    this.placementHitboxes = [];
    this.opts.onPlacementModeChange(false);
    this.opts.domElement.focus();
  }

  confirmPlacement() {
    if (!this.ghost || !this.placementUrl) return;
    const storeItemId = this.placementStoreItemId;
    const shared = {
      x: this.ghost.position.x,
      z: this.ghost.position.z,
      rotY: this.ghost.rotation.y,
      scale: this.placementPreset?.scale ?? 1,
      hitboxShape: this.placementPreset?.hitboxShape ?? ("cylinder" as const),
      hitboxRadius: this.placementPreset?.hitboxRadius ?? 1.0,
      hitboxOffsetX: this.placementPreset?.hitboxOffsetX ?? 0,
      hitboxOffsetZ: this.placementPreset?.hitboxOffsetZ ?? 0,
      hitboxes: this.placementHitboxes.length > 0 ? this.placementHitboxes : undefined,
    };
    if (storeItemId) {
      this.opts.send({ type: "placeStoreItem", itemId: storeItemId, ...shared });
    } else {
      this.opts.send({ type: "placeObject", url: this.placementUrl, ...shared });
    }
    this.exitPlacement();
  }

  // ---- Edit-mode selection ----

  // Click in edit mode: select the placed object under the cursor, or deselect.
  handleEditClick(raycaster: THREE.Raycaster) {
    // Raycast roots recursively (hidden hitbox meshes don't interfere — their
    // raycast is disabled), then walk up the parent chain to find the root.
    const roots = Array.from(this.rootToId.keys());
    const hits = roots.length > 0 ? raycaster.intersectObjects(roots, true) : [];
    if (hits.length > 0) {
      let hitObj: THREE.Object3D | null = hits[0].object;
      while (hitObj) {
        const hitId = this.rootToId.get(hitObj);
        if (hitId) { this.select(hitId); return; }
        hitObj = hitObj.parent;
      }
    }
    if (this.selectedId) this.select(null);
  }

  select(id: string | null) {
    if (this.selectedId) {
      const prev = this.entries.get(this.selectedId);
      if (prev) prev.hitboxMesh.visible = this.debugVisible;
    }
    if (this.selectionBox) { this.opts.scene.remove(this.selectionBox); this.selectionBox = null; }
    this.selectedId = id;
    const entry = id ? this.entries.get(id) : null;
    if (entry) {
      this.refreshSelectionBox(entry.root);
      entry.hitboxMesh.visible = true;
      this.transformControls.attach(entry.root);
      this.opts.onSelectionChange(this.selectionInfo(entry.data));
    } else {
      this.transformControls.detach();
      this.opts.onSelectionChange(null);
    }
  }

  // Apply a transform/hitbox change from the edit panel and sync to the server.
  applyTransform(sel: SelectedObjectInfo) {
    const entry = this.entries.get(sel.id);
    if (!entry) return;
    entry.data.scale = sel.scale;
    entry.data.rotY = sel.rotY;
    entry.data.hitboxShape = sel.hitboxShape;
    entry.data.hitboxRadius = sel.hitboxRadius;
    entry.data.hitboxOffsetX = sel.hitboxOffsetX;
    entry.data.hitboxOffsetZ = sel.hitboxOffsetZ;
    entry.root.scale.setScalar(sel.scale);
    entry.root.rotation.y = sel.rotY;
    this.opts.physics.removePlacedBody(sel.id);
    this.opts.physics.addPlacedBody(entry.data);
    this.updateHitboxMesh(entry);
    if (this.selectedId === sel.id) {
      this.refreshSelectionBox(entry.root);
      entry.hitboxMesh.visible = true;
    }
    this.sendMove(entry.data);
  }

  requestDelete(id: string) {
    this.opts.send({ type: "deleteObject", id });
    this.remove(id);
  }

  copySelected() {
    const entry = this.selectedId ? this.entries.get(this.selectedId) : null;
    if (entry) this.clipboard = { ...entry.data };
  }

  pasteClipboard() {
    if (this.clipboard) this.enterPlacement(this.clipboard.url, this.clipboard);
  }

  setDebugVisible(visible: boolean) {
    this.debugVisible = visible;
    for (const [id, entry] of this.entries) {
      entry.hitboxMesh.visible = visible || this.selectedId === id;
    }
  }

  // Per-frame: ghost follows the cursor, Q/E rotate it.
  update(dt: number, rotateCCW: boolean, rotateCW: boolean, raycaster: THREE.Raycaster, mouse: THREE.Vector2, camera: THREE.Camera, groundPlane: THREE.Plane) {
    if (!this.ghost) return;
    if (rotateCCW) this.ghost.rotation.y -= Math.PI * dt;
    if (rotateCW) this.ghost.rotation.y += Math.PI * dt;
    raycaster.setFromCamera(mouse, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      this.ghost.position.set(hit.x, 0, hit.z);
    }
  }

  dispose() {
    this.placementGen++;
    this.clearGhost();
    if (this.selectionBox) this.opts.scene.remove(this.selectionBox);
    for (const entry of this.entries.values()) {
      this.opts.scene.remove(entry.root);
      this.disposeHitboxMesh(entry.hitboxMesh);
      this.opts.scene.remove(entry.hitboxMesh);
    }
    this.entries.clear();
    this.rootToId.clear();
    this.transformControls.detach();
    this.opts.scene.remove(this.transformControls.getHelper());
    this.transformControls.dispose();
  }

  // ---- Internals ----

  private sendMove(data: PlacedObject) {
    this.opts.send({
      type: "moveObject",
      id: data.id,
      x: data.x,
      z: data.z,
      rotY: data.rotY,
      scale: data.scale,
      hitboxShape: data.hitboxShape,
      hitboxRadius: data.hitboxRadius,
      hitboxOffsetX: data.hitboxOffsetX,
      hitboxOffsetZ: data.hitboxOffsetZ,
      hitboxes: data.hitboxes,
    });
  }

  private selectionInfo(data: PlacedObject): SelectedObjectInfo {
    return {
      id: data.id,
      scale: data.scale,
      rotY: data.rotY,
      hitboxShape: data.hitboxShape,
      hitboxRadius: data.hitboxRadius,
      hitboxOffsetX: data.hitboxOffsetX,
      hitboxOffsetZ: data.hitboxOffsetZ,
    };
  }

  private loadGltf(url: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      const cached = this.gltfCache.get(url);
      if (cached) { resolve(cached.clone(true)); return; }
      this.opts.loader.load(url, (gltf) => {
        this.gltfCache.set(url, gltf.scene.clone(true));
        resolve(gltf.scene.clone(true));
      }, undefined, (err) => {
        console.error(`[gltf] failed to load "${url}":`, err);
        reject(err);
      });
    });
  }

  private applyRootTransform(data: PlacedObject, root: THREE.Object3D) {
    root.position.set(data.x, 0, data.z);
    root.rotation.y = data.rotY;
    root.scale.setScalar(data.scale);
  }

  private refreshSelectionBox(root: THREE.Object3D) {
    if (this.selectionBox) { this.opts.scene.remove(this.selectionBox); this.selectionBox = null; }
    const box = new THREE.Box3().setFromObject(root);
    this.selectionBox = new THREE.Box3Helper(box, 0x44ff88);
    this.opts.scene.add(this.selectionBox);
  }

  private clearGhost() {
    if (this.ghost) { this.opts.scene.remove(this.ghost); this.ghost = null; }
  }

  private makeHitboxMesh(data: PlacedObject): THREE.Object3D {
    const group = new THREE.Group();
    group.visible = false;
    const wireMat = () => new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.5 });

    if (data.hitboxes && data.hitboxes.length > 0) {
      // Multi-hitbox: one wireframe per HitboxDef, positions computed in world space
      const cos = Math.cos(data.rotY);
      const sin = Math.sin(data.rotY);
      for (const hb of data.hitboxes) {
        const wx = data.x + (hb.offsetX * cos + hb.offsetZ * sin) * data.scale;
        const wz = data.z + (-hb.offsetX * sin + hb.offsetZ * cos) * data.scale;
        const hw = hb.halfW * data.scale;
        const hd = hb.halfD * data.scale;
        const geo = hb.shape === "cylinder"
          ? new THREE.CylinderGeometry(hw, hw, 2, 16)
          : new THREE.BoxGeometry(hw * 2, 2, hd * 2);
        const mesh = new THREE.Mesh(geo, wireMat());
        mesh.position.set(wx, 1, wz);
        group.add(mesh);
      }
    } else {
      const r = data.hitboxRadius;
      const geo = data.hitboxShape === "box"
        ? new THREE.BoxGeometry(r * 2, 2, r * 2)
        : new THREE.CylinderGeometry(r, r, 2, 24);
      const mesh = new THREE.Mesh(geo, wireMat());
      mesh.position.set(data.x + (data.hitboxOffsetX ?? 0), 1, data.z + (data.hitboxOffsetZ ?? 0));
      group.add(mesh);
    }

    // Disable raycasting on all children — Three.js r184 doesn't skip invisible
    // objects during intersection, so these wireframes would intercept clicks.
    group.traverse((child) => { child.raycast = () => {}; });
    return group;
  }

  private disposeHitboxMesh(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }

  private updateHitboxMesh(entry: PlacedEntry) {
    this.disposeHitboxMesh(entry.hitboxMesh);
    this.opts.scene.remove(entry.hitboxMesh);
    entry.hitboxMesh = this.makeHitboxMesh(entry.data);
    this.opts.scene.add(entry.hitboxMesh);
    entry.hitboxMesh.visible = this.debugVisible || this.selectedId === entry.data.id;
  }
}
