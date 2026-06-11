import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { MapConfig, StaticObject } from "../../server/types";
import { buildGround } from "../utils/threeHelpers";
import { hideHitboxGroup } from "../utils/hitboxUtils";
import type { FloorPainter } from "../FloorPainter";

// Renders everything described by a MapConfig: sky, fog, lights, ground,
// static GLTF objects, water zones, door rings and collider debug wireframes.
export class MapView {
  private lights: THREE.Object3D[] = [];
  private ground: THREE.Group | null = null;
  private staticRoots: THREE.Object3D[] = [];
  private waterRoots: THREE.Object3D[] = [];
  private doorRoots: THREE.Object3D[] = [];
  private debugMeshes: THREE.Mesh[] = [];
  private generation = 0;
  private debugVisible = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly loader: GLTFLoader,
    private readonly floorPainter: FloorPainter,
    private readonly mount: HTMLElement,
  ) {}

  setDebugVisible(visible: boolean) {
    this.debugVisible = visible;
    for (const m of this.debugMeshes) m.visible = visible;
  }

  // Safe to call repeatedly (e.g. on reconnect): cleans up the previous map
  // first, and a generation counter discards stale async GLTF loads.
  apply(map: MapConfig) {
    const gen = ++this.generation;
    this.clearSceneObjects();

    this.mount.style.background = `linear-gradient(180deg, ${map.environment.sky.top} 0%, ${map.environment.sky.mid} 40%, ${map.environment.sky.horizon} 100%)`;
    this.scene.fog = new THREE.Fog(new THREE.Color(map.environment.fog.color), map.environment.fog.near, map.environment.fog.far);

    const ambient = new THREE.AmbientLight(new THREE.Color(map.environment.ambientLight.color), map.environment.ambientLight.intensity);
    this.scene.add(ambient);
    this.lights.push(ambient);

    const sunLight = new THREE.DirectionalLight(new THREE.Color(map.environment.sun.color), map.environment.sun.intensity);
    sunLight.position.set(map.environment.sun.x, map.environment.sun.y, map.environment.sun.z);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 80;
    sunLight.shadow.camera.left = -28;
    sunLight.shadow.camera.right = 28;
    sunLight.shadow.camera.top = 28;
    sunLight.shadow.camera.bottom = -28;
    sunLight.shadow.bias = -0.001;
    this.scene.add(sunLight);
    this.lights.push(sunLight);

    if (!map.hideGround) {
      const result = buildGround(map.groundSize, map.environment.groundColor, map.groundPaintData);
      this.ground = result.group;
      this.floorPainter.applyMap(result, map.groundSize, map.groundPaintData, map.environment.groundColor);
      this.scene.add(this.ground);
    } else {
      this.floorPainter.applyMap(null, 0);
    }

    // Static objects — group by URL so each GLTF is fetched once (skip collisionOnly)
    const byUrl = new Map<string, StaticObject[]>();
    for (const obj of map.staticObjects) {
      if (obj.collisionOnly) continue;
      const list = byUrl.get(obj.url) ?? [];
      list.push(obj);
      byUrl.set(obj.url, list);
    }
    for (const [url, objs] of byUrl) {
      this.loader.load(url, (gltf) => {
        if (gen !== this.generation) return; // stale — map was re-applied while loading
        for (const obj of objs) {
          const mesh = gltf.scene.clone(true);
          hideHitboxGroup(mesh);
          mesh.position.set(obj.x, 0, obj.z);
          mesh.rotation.y = obj.rotY;
          this.scene.add(mesh);
          this.staticRoots.push(mesh);
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
        }
      });
    }

    for (const zone of map.waterZones) {
      const waterMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(zone.width, zone.height),
        new THREE.MeshBasicMaterial({ color: 0x1a7bbf, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      waterMesh.rotation.x = -Math.PI / 2;
      waterMesh.position.set(zone.x, 0.02, zone.z);
      this.scene.add(waterMesh);
      this.waterRoots.push(waterMesh);
    }

    // Door trigger zones — glowing ring on ground + floating label
    for (const door of map.doors) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(door.triggerRadius - 0.12, door.triggerRadius + 0.12, 40),
        new THREE.MeshBasicMaterial({ color: 0x44ffcc, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(door.x, 0.03, door.z);
      this.scene.add(ring);
      this.doorRoots.push(ring);

      const labelDiv = document.createElement("div");
      labelDiv.textContent = `→ ${door.label}`;
      labelDiv.style.cssText = `
        color: #44ffcc;
        font-size: 13px;
        font-family: sans-serif;
        font-weight: 700;
        text-shadow: 0 0 8px rgba(0,255,200,0.9), 0 1px 3px rgba(0,0,0,0.8);
        pointer-events: none;
        white-space: nowrap;
        user-select: none;
      `;
      const doorLabel = new CSS2DObject(labelDiv);
      doorLabel.position.set(door.x, 2.2, door.z);
      this.scene.add(doorLabel);
      this.doorRoots.push(doorLabel);
    }

    // Debug wireframes for static colliders
    for (const obj of map.staticObjects) {
      const h = obj.hitboxHeight ?? 1.0;
      const depth = obj.hitboxDepth ?? obj.hitboxRadius;
      let geo: THREE.BufferGeometry;
      if (obj.hitboxShape === "box") {
        geo = new THREE.BoxGeometry(obj.hitboxRadius * 2, h, depth * 2);
      } else if (obj.hitboxShape === "capsule") {
        geo = new THREE.CapsuleGeometry(obj.hitboxRadius, h, 4, 8);
      } else {
        geo = new THREE.CylinderGeometry(obj.hitboxRadius, obj.hitboxRadius, h, 16);
      }
      const color = obj.hitboxShape === "box" ? 0xff4400 : obj.hitboxShape === "capsule" ? 0xffaa00 : 0x00ff88;
      const dbMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, wireframe: true }));
      dbMesh.position.set(obj.x, h / 2, obj.z);
      dbMesh.visible = this.debugVisible;
      this.scene.add(dbMesh);
      this.debugMeshes.push(dbMesh);
    }
  }

  private clearSceneObjects() {
    for (const root of this.staticRoots) this.scene.remove(root);
    this.staticRoots = [];
    for (const root of this.waterRoots) this.scene.remove(root);
    this.waterRoots = [];
    for (const root of this.doorRoots) this.scene.remove(root);
    this.doorRoots = [];
    for (const m of this.debugMeshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.scene.remove(m);
    }
    this.debugMeshes = [];
    for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
    if (this.ground) { this.scene.remove(this.ground); this.ground = null; }
  }

  dispose() {
    this.generation++; // invalidate in-flight loads
    this.clearSceneObjects();
  }
}
