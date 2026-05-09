import * as THREE from "three";
import type { GroundBuildResult } from "./utils/threeHelpers";

export class FloorPainter {
  isActive = false;
  brushColor = "#3a7d44";
  brushSize = 1;
  paintData: string[][] = [];

  private scene: THREE.Scene;
  private groundResult: GroundBuildResult | null = null;
  private groundSize = 40;
  private isPainting = false;
  private tileHighlight: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.tileHighlight = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.tileHighlight.rotation.x = -Math.PI / 2;
    this.tileHighlight.position.y = 0.015;
    this.tileHighlight.visible = false;
    scene.add(this.tileHighlight);
  }

  applyMap(result: GroundBuildResult | null, size: number, existingData?: string[][], defaultColor = "#3a7d44"): void {
    this.groundResult = result;
    this.groundSize = size;

    if (existingData && existingData.length > 0) {
      this.paintData = existingData.map((row) => [...row]);
    } else {
      this.paintData = Array.from({ length: size }, () => Array(size).fill(defaultColor));
    }

    // If already in paint mode when the map reloads, re-show the grid
    if (this.isActive && result) result.grid.visible = true;
  }

  toggle(setActive: (v: boolean) => void): void {
    this.isActive = !this.isActive;
    setActive(this.isActive);
    if (this.groundResult) this.groundResult.grid.visible = this.isActive;
    if (!this.isActive) {
      this.tileHighlight.visible = false;
      this.isPainting = false;
    }
  }

  onMouseDown(): void {
    this.isPainting = true;
  }

  onMouseUp(): void {
    this.isPainting = false;
  }

  /** Call every frame from the animation loop. */
  update(raycaster: THREE.Raycaster, mouse: THREE.Vector2, camera: THREE.Camera, groundPlane: THREE.Plane): void {
    if (!this.isActive || !this.groundResult) return;

    raycaster.setFromCamera(mouse, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      const size = this.groundSize;
      const bs = this.brushSize;
      const col = Math.floor(hit.x + size / 2);
      const row = Math.floor(hit.z + size / 2);
      this.tileHighlight.position.set(col - size / 2 + bs / 2, 0.015, row - size / 2 + bs / 2);
      this.tileHighlight.scale.set(bs, bs, 1);
      this.tileHighlight.visible = true;
      if (this.isPainting) this.paint(col, row);
    } else {
      this.tileHighlight.visible = false;
    }
  }

  dispose(): void {
    this.scene.remove(this.tileHighlight);
    this.tileHighlight.geometry.dispose();
    (this.tileHighlight.material as THREE.Material).dispose();
  }

  private paint(centerCol: number, centerRow: number): void {
    if (!this.groundResult) return;
    const { canvas, texture } = this.groundResult;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = this.groundSize;
    const bs = this.brushSize;
    const color = this.brushColor;
    const half = Math.floor(bs / 2);
    for (let dr = -half; dr < bs - half; dr++) {
      for (let dc = -half; dc < bs - half; dc++) {
        const col = centerCol + dc;
        const row = centerRow + dr;
        if (col < 0 || col >= size || row < 0 || row >= size) continue;
        ctx.fillStyle = color;
        ctx.fillRect(col, row, 1, 1);
        if (this.paintData[row]) this.paintData[row][col] = color;
      }
    }
    texture.needsUpdate = true;
  }
}
