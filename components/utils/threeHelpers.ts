import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

export interface GroundBuildResult {
  group: THREE.Group;
  grid: THREE.GridHelper;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
}

export function buildGround(size: number, defaultColor: string, paintData?: string[][]): GroundBuildResult {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  if (paintData && paintData.length > 0) {
    for (let row = 0; row < paintData.length; row++) {
      for (let col = 0; col < (paintData[row]?.length ?? 0); col++) {
        ctx.fillStyle = paintData[row][col];
        ctx.fillRect(col, row, 1, 1);
      }
    }
  } else {
    ctx.fillStyle = defaultColor;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;

  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshLambertMaterial({ map: texture });
  const plane = new THREE.Mesh(geo, mat);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;

  // Grid is always visible at a low opacity; paint mode bumps it up
  const grid = new THREE.GridHelper(size, size, 0x000000, 0x000000);
  grid.position.y = 0.01;
  const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const m of gridMats) { m.transparent = true; m.opacity = 0.12; }

  const group = new THREE.Group();
  group.add(plane);
  group.add(grid);

  return { group, grid, canvas, texture };
}

export function makeNameLabel(name: string, isLocal = false): CSS2DObject {
  const div = document.createElement("div");
  div.textContent = name;
  div.style.cssText = `
    color: ${isLocal ? "#7dd3fc" : "#ffffff"};
    font-size: 12px;
    font-family: sans-serif;
    font-weight: 600;
    text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6);
    pointer-events: none;
    white-space: nowrap;
    user-select: none;
  `;
  const label = new CSS2DObject(div);
  label.position.set(0, 2.2, 0);
  return label;
}

const BULLET_LENGTH = 0.6; // world units


export function makeProjectileLine(): THREE.Line {
  // Two points: tail then head. Updated each frame from server state.
  const positions = new Float32Array(6); // 2 × xyz
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffdd00 });
  return new THREE.Line(geo, mat);
}

// ---- Occlusion ghost system ----
// occluders: add wall/level meshes here when level geometry is introduced.
// Currently empty, so ghosts never show (ready for when maps are added).
const occluders: THREE.Object3D[] = [];
const ghostOcclusionRaycaster = new THREE.Raycaster();

export function makeGhost(): THREE.Mesh {
	const geo = new THREE.CylinderGeometry(0.28, 0.28, 1.6, 10);
	const mat = new THREE.MeshBasicMaterial({
		color: 0x44ff88,
		depthTest: false,
		depthWrite: false,
		transparent: true,
		opacity: 0.55,
	});
	const mesh = new THREE.Mesh(geo, mat);
	mesh.position.y = 0.8;
	mesh.visible = false;
	mesh.name = "__ghost";
	return mesh;
}

export function isOccluded(camera: THREE.OrthographicCamera, worldPos: THREE.Vector3): boolean {
	if (occluders.length === 0) return false;
	const target = worldPos.clone();
	target.y += 0.9;
	const dir = target.clone().sub(camera.position).normalize();
	const dist = camera.position.distanceTo(target);
	ghostOcclusionRaycaster.set(camera.position, dir);
	ghostOcclusionRaycaster.far = dist - 0.2;
	return ghostOcclusionRaycaster.intersectObjects(occluders, true).length > 0;
}
