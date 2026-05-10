import * as THREE from "three";
import type { HitboxDef } from "../../server/types";

/**
 * Finds all meshes whose direct parent is the group named "hitbox".
 * Using parent-name lookup is more reliable than finding the group first,
 * since it doesn't depend on the exact depth of the group in the hierarchy.
 */
function collectHitboxMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj.parent?.name === "hitbox" && (obj as THREE.Mesh).isMesh) {
      meshes.push(obj as THREE.Mesh);
    }
  });
  return meshes;
}

/**
 * Extracts physics hitbox definitions from a freshly loaded GLTF scene.
 * Finds all meshes inside a group named "hitbox", hides them visually,
 * and returns a HitboxDef per mesh with offsets in root-local space.
 *
 * Naming convention in Blockbench:
 *   - Group named exactly "hitbox" anywhere in the hierarchy
 *   - Meshes inside it: any name — all become box colliders
 *
 * Call this BEFORE applying any scale/rotation to the root.
 */
export function extractHitboxes(root: THREE.Object3D): HitboxDef[] {
  root.updateMatrixWorld(true);

  const meshes = collectHitboxMeshes(root);
  if (meshes.length === 0) {
    console.warn('[hitboxUtils] No meshes found inside a "hitbox" group. Falling back to legacy hitbox.');
    return [];
  }

  // Root inverse matrix converts world-space positions back to root-local space.
  // This is required because mesh.matrixWorld includes all ancestor transforms
  // (including any coordinate correction Blockbench bakes into the GLTF root).
  const rootInvMatrix = root.matrixWorld.clone().invert();

  const defs: HitboxDef[] = [];

  for (const mesh of meshes) {
    mesh.visible = false;

    // Clone geometry and bake the full world transform into vertex positions.
    // This correctly handles any parent group transforms, rotations, or scales.
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld); // → world space
    geo.applyMatrix4(rootInvMatrix);    // → root-local space

    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    geo.dispose();

    defs.push({
      shape: "box",
      offsetX: center.x,
      offsetZ: center.z,
      halfW: size.x / 2,
      halfD: size.z / 2,
    });
  }

  return defs;
}

/**
 * Hides all meshes inside the "hitbox" group without extracting data.
 * Call this when loading an already-placed object whose hitboxes are stored server-side.
 */
export function hideHitboxGroup(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.parent?.name === "hitbox" && (obj as THREE.Mesh).isMesh) {
      obj.visible = false;
    }
  });
}
