import * as THREE from "three";
import type { LogicGraph } from "../../server/types";

// Renders logic-graph nodes that have a world presence — trigger zones (rings)
// and teleport destinations (markers) — so the creator can see them while editing.
// Hidden during normal play; only shown in logic-edit mode.
export class LogicView {
  private group = new THREE.Group();

  constructor(private readonly scene: THREE.Scene) {
    this.group.visible = false;
    this.scene.add(this.group);
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  // Rebuild the world markers from the current graph.
  sync(graph: LogicGraph) {
    this.clear();
    for (const node of graph.nodes) {
      const px = Number(node.params.x) || 0;
      const pz = Number(node.params.z) || 0;

      if (node.kind === "zoneEnter" || node.kind === "zoneExit") {
        const r = Math.max(0.1, Number(node.params.radius) || 1.5);
        const color = node.kind === "zoneEnter" ? 0x44ff88 : 0xffaa33;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r - 0.1, r + 0.1, 40),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(px, 0.04, pz);
        this.group.add(ring);
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(r, 40),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(px, 0.03, pz);
        this.group.add(fill);
      } else if (node.kind === "teleport") {
        const marker = new THREE.Mesh(
          new THREE.ConeGeometry(0.35, 0.9, 4),
          new THREE.MeshBasicMaterial({ color: 0x3b9fef, transparent: true, opacity: 0.8 }),
        );
        marker.position.set(px, 0.45, pz);
        marker.rotation.y = Math.PI / 4;
        this.group.add(marker);
      }
    }
  }

  private clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material)?.dispose?.();
    }
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
