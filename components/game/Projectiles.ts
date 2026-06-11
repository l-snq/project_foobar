import * as THREE from "three";
import type { ProjectileState } from "../../server/types";
import { makeProjectileLine } from "../utils/threeHelpers";

const BULLET_LENGTH = 0.6; // world units
const BULLET_Y = 0.5;

// Visual-only bullet tracers; the server is authoritative for hits.
export class Projectiles {
  private lines = new Map<string, THREE.Line>();

  constructor(private readonly scene: THREE.Scene) {}

  sync(projectiles: ProjectileState[]) {
    const seen = new Set<string>();
    for (const p of projectiles) {
      seen.add(p.id);
      let line = this.lines.get(p.id);
      if (!line) {
        line = makeProjectileLine();
        this.scene.add(line);
        this.lines.set(p.id, line);
      }
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, p.x - p.dirX * BULLET_LENGTH, BULLET_Y, p.z - p.dirZ * BULLET_LENGTH); // tail
      pos.setXYZ(1, p.x, BULLET_Y, p.z); // head
      pos.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
    for (const [id, line] of this.lines) {
      if (!seen.has(id)) this.removeLine(id, line);
    }
  }

  dispose() {
    for (const [id, line] of this.lines) this.removeLine(id, line);
  }

  private removeLine(id: string, line: THREE.Line) {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
    this.scene.remove(line);
    this.lines.delete(id);
  }
}
