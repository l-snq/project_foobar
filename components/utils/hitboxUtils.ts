import * as THREE from "three";
import type { HitboxDef } from "../../server/types";

/** Case-insensitive search for a node named "hitbox" anywhere in the hierarchy. */
function findHitboxGroup(root: THREE.Object3D): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (!found && obj !== root && obj.name.toLowerCase().includes("hitbox")) found = obj;
  });
  return found;
}

/**
 * Finds the "hitbox" group in a freshly loaded (unscaled, unrotated) GLTF scene,
 * hides all its child meshes from rendering, and returns a HitboxDef per mesh.
 *
 * Naming convention in Blockbench:
 *   - Parent group: "hitbox" (case-insensitive)
 *   - Children: any name; names containing "cyl" become cylinder colliders, rest are boxes.
 *
 * Call this BEFORE applying any scale/rotation to the root so offsets are in model-local space.
 */
export function extractHitboxes(root: THREE.Object3D): HitboxDef[] {
  // Force world matrix update so Box3.setFromObject gives correct bounds on a freshly loaded GLTF
  root.updateMatrixWorld(true);

  const group = findHitboxGroup(root);
  if (!group) return [];

  const defs: HitboxDef[] = [];
  group.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;

    // Extract geometry BEFORE hiding — setFromObject can ignore invisible objects
    const box = new THREE.Box3().setFromObject(child);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    child.visible = false;

    const isCylinder = child.name.toLowerCase().includes("cyl");
    defs.push({
      shape: isCylinder ? "cylinder" : "box",
      offsetX: center.x,
      offsetZ: center.z,
      halfW: size.x / 2,
      halfD: size.z / 2,
    });
  });

  return defs;
}

/**
 * Hides the "hitbox" group in a loaded GLTF without extracting data.
 * Call this when loading an already-placed object whose hitboxes are stored in PlacedObject.
 */
export function hideHitboxGroup(root: THREE.Object3D): void {
  const group = findHitboxGroup(root);
  if (!group) return;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.visible = false;
  });
}
