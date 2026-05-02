export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
}

/**
 * Static spatial grid for circle colliders.
 * Insert all static colliders once at startup, then query cheaply each tick.
 * Each query touches only the cells the moving object overlaps — typically 1-4.
 */
export class SpatialGrid {
  private cells = new Map<number, CircleCollider[]>();
  private readonly cellSize: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cols: number;
  private readonly rows: number;

  constructor(cellSize: number, minX: number, minZ: number, maxX: number, maxZ: number) {
    this.cellSize = cellSize;
    this.minX = minX;
    this.minZ = minZ;
    this.cols = Math.ceil((maxX - minX) / cellSize);
    this.rows = Math.ceil((maxZ - minZ) / cellSize);
  }

  private key(col: number, row: number): number {
    return row * this.cols + col;
  }

  private toCol(x: number): number {
    return Math.floor((x - this.minX) / this.cellSize);
  }

  private toRow(z: number): number {
    return Math.floor((z - this.minZ) / this.cellSize);
  }

  /** Insert a static collider. Call once per collider at startup. */
  insert(collider: CircleCollider): void {
    const minCol = Math.max(0, this.toCol(collider.x - collider.radius));
    const maxCol = Math.min(this.cols - 1, this.toCol(collider.x + collider.radius));
    const minRow = Math.max(0, this.toRow(collider.z - collider.radius));
    const maxRow = Math.min(this.rows - 1, this.toRow(collider.z + collider.radius));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const k = this.key(col, row);
        let cell = this.cells.get(k);
        if (!cell) { cell = []; this.cells.set(k, cell); }
        cell.push(collider);
      }
    }
  }

  /**
   * Return all colliders whose cells overlap a circle at (x, z) with the given
   * query radius. Deduplicated — safe to use directly for collision response.
   */
  query(x: number, z: number, queryRadius: number): CircleCollider[] {
    const minCol = Math.max(0, this.toCol(x - queryRadius));
    const maxCol = Math.min(this.cols - 1, this.toCol(x + queryRadius));
    const minRow = Math.max(0, this.toRow(z - queryRadius));
    const maxRow = Math.min(this.rows - 1, this.toRow(z + queryRadius));

    const seen = new Set<CircleCollider>();
    const result: CircleCollider[] = [];

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cell = this.cells.get(this.key(col, row));
        if (!cell) continue;
        for (const c of cell) {
          if (!seen.has(c)) { seen.add(c); result.push(c); }
        }
      }
    }

    return result;
  }
}
