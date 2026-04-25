import type { WorldConfig, WorldObject } from "@/types/world";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GridPos = { gx: number; gy: number };

/** Pixel size of one grid cell */
export const GRID_CELL = 32;

// ---------------------------------------------------------------------------
// Blocking defaults per object type
// ---------------------------------------------------------------------------

function defaultBlocksPath(obj: WorldObject): boolean {
  switch (obj.type) {
    case "wall":
    case "object":
    case "furniture":
      return true;
    case "floor":
    case "floor-decor":
    case "top-decor":
    case "door":
      return false;
    default:
      return false;
  }
}

/**
 * CollisionGrid
 *
 * Builds a 2-D boolean walkability grid (32 × 32 px cells) from the world
 * config. Doors explicitly mark their cells walkable, overriding any wall
 * that occupies the same area.
 *
 * Coordinate helpers:
 *   worldToGrid(px, py) → { gx, gy }
 *   gridToWorld(gx, gy) → { px, py }  (top-left of cell)
 *   gridCenterToWorld(gx, gy) → { px, py }  (centre of cell)
 */
export class CollisionGrid {
  private grid: boolean[][];
  /** Set of "gx,gy" strings for cells occupied by door objects. */
  private doorCells: Set<string> = new Set();
  readonly cols: number;
  readonly rows: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;

  constructor(config: WorldConfig) {
    this.canvasWidth = config.canvasWidth;
    this.canvasHeight = config.canvasHeight;
    this.cols = Math.ceil(config.canvasWidth / GRID_CELL);
    this.rows = Math.ceil(config.canvasHeight / GRID_CELL);

    // Initialise all cells as blocked.
    // Only cells covered by a floor object become walkable; this means any area
    // outside a room's floor (including gaps between rooms and canvas edges) is
    // naturally impassable without needing explicit wall objects there.
    this.grid = Array.from({ length: this.rows }, () =>
      new Array(this.cols).fill(false),
    );

    // Pass 1 — mark floor cells walkable
    for (const room of config.rooms) {
      for (const obj of room.objects) {
        if (obj.type === "floor" && !(obj.blocksPath ?? false)) {
          this.markCells(obj, true);
        }
      }
    }

    // Pass 2 — mark blocking objects (walls, furniture, objects)
    for (const room of config.rooms) {
      for (const obj of room.objects) {
        const blocks = obj.blocksPath ?? defaultBlocksPath(obj);
        if (blocks) {
          this.markCells(obj, false);
        }
      }
    }

    // Pass 3 — doors override walls/objects → mark walkable; also record door cells
    for (const room of config.rooms) {
      for (const obj of room.objects) {
        if (obj.type === "door") {
          this.markCells(obj, true);
          this.markDoorCells(obj);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  isWalkable(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return false;
    return this.grid[gy][gx];
  }

  /** Returns true if the cell is occupied by a door object.
   *  Used to exclude door cells from random wander targets while still
   *  allowing A* to route through them. */
  isDoorCell(gx: number, gy: number): boolean {
    return this.doorCells.has(`${gx},${gy}`);
  }

  worldToGrid(px: number, py: number): GridPos {
    return {
      gx: Math.floor(px / GRID_CELL),
      gy: Math.floor(py / GRID_CELL),
    };
  }

  gridToWorld(gx: number, gy: number): { px: number; py: number } {
    return { px: gx * GRID_CELL, py: gy * GRID_CELL };
  }

  gridCenterToWorld(gx: number, gy: number): { px: number; py: number } {
    return {
      px: gx * GRID_CELL + GRID_CELL / 2,
      py: gy * GRID_CELL + GRID_CELL / 2,
    };
  }

  /**
   * Find the nearest walkable grid cell to a given pixel position.
   * Searches in expanding rings until a walkable cell is found.
   */
  nearestWalkable(px: number, py: number): GridPos | null {
    const { gx: cx, gy: cy } = this.worldToGrid(px, py);

    for (let radius = 0; radius <= Math.max(this.cols, this.rows); radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.isWalkable(nx, ny)) return { gx: nx, gy: ny };
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private markCells(obj: WorldObject, walkable: boolean): void {
    const startGx = Math.floor(obj.x / GRID_CELL);
    const startGy = Math.floor(obj.y / GRID_CELL);
    const endGx = Math.ceil((obj.x + obj.width) / GRID_CELL);
    const endGy = Math.ceil((obj.y + obj.height) / GRID_CELL);

    for (let gy = startGy; gy < endGy; gy++) {
      for (let gx = startGx; gx < endGx; gx++) {
        if (gy >= 0 && gy < this.rows && gx >= 0 && gx < this.cols) {
          this.grid[gy][gx] = walkable;
        }
      }
    }
  }

  private markDoorCells(obj: WorldObject): void {
    const startGx = Math.floor(obj.x / GRID_CELL);
    const startGy = Math.floor(obj.y / GRID_CELL);
    const endGx = Math.ceil((obj.x + obj.width) / GRID_CELL);
    const endGy = Math.ceil((obj.y + obj.height) / GRID_CELL);

    for (let gy = startGy; gy < endGy; gy++) {
      for (let gx = startGx; gx < endGx; gx++) {
        if (gy >= 0 && gy < this.rows && gx >= 0 && gx < this.cols) {
          this.doorCells.add(`${gx},${gy}`);
        }
      }
    }
  }
}
