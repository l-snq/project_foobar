import * as THREE from "three";
import type { HitboxDef } from "../../server/types";

/**
 * Finds the "hitbox" group in a freshly loaded (unscaled, unrotated) GLTF scene,
 * hides all its child meshes from rendering, and returns a HitboxDef per mesh.
 *
 * Naming convention in Blockbench:
 *   - Parent group: "hitbox"
 *   - Children: any name; names containing "cyl" become cylinder colliders, rest are boxes.
 *
 * Call this BEFORE applying any scale/rotation to the root so offsets are in model-local space.
 */
export function extractHitboxes(root: THREE.Object3D): HitboxDef[] {
  const group = root.getObjectByName("hitbox");
  if (!group) return [];

  const defs: HitboxDef[] = [];
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.visible = false;

    const box = new THREE.Box3().setFromObject(child);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

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
  const group = root.getObjectByName("hitbox");
  if (!group) return;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.visible = false;
  });
}
