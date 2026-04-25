import type { CollisionGrid, GridPos } from "./CollisionGrid";

/**
 * PathFinder
 *
 * A simple A* pathfinder that operates on a CollisionGrid.
 * Returns an array of GridPos waypoints from `from` to `to` (inclusive),
 * or null if no path exists.
 *
 * We implement A* directly rather than relying on phaser3-rex-plugins Board
 * so that:
 *  1. It can be unit-tested without a Phaser context.
 *  2. It works on the pixel-positioned rooms in world.json without
 *     needing to align everything to a tilemap.
 */
export class PathFinder {
  private grid: CollisionGrid;

  constructor(grid: CollisionGrid) {
    this.grid = grid;
  }

  /**
   * Find a path from `from` to `to`.
   * Returns waypoints including the start and end, or null if unreachable.
   */
  findPath(from: GridPos, to: GridPos): GridPos[] | null {
    if (!this.grid.isWalkable(to.gx, to.gy)) {
      // Try to find nearest walkable to destination
      const nearest = this.grid.nearestWalkable(
        to.gx * 32 + 16,
        to.gy * 32 + 16,
      );
      if (!nearest) return null;
      to = nearest;
    }

    // Trivial case
    if (from.gx === to.gx && from.gy === to.gy) return [from];

    const openSet = new MinHeap<Node>((a, b) => a.f - b.f);
    const closedSet = new Set<string>();
    const nodeMap = new Map<string, Node>();

    const startNode: Node = { pos: from, g: 0, f: heuristic(from, to), parent: null };
    openSet.push(startNode);
    nodeMap.set(key(from), startNode);

    while (openSet.size > 0) {
      const current = openSet.pop()!;
      const ck = key(current.pos);

      if (closedSet.has(ck)) continue;
      closedSet.add(ck);

      if (current.pos.gx === to.gx && current.pos.gy === to.gy) {
        return reconstructPath(current);
      }

      for (const neighbor of this.neighbors(current.pos)) {
        const nk = key(neighbor);
        if (closedSet.has(nk)) continue;

        const g = current.g + 1;
        const existing = nodeMap.get(nk);
        if (existing && existing.g <= g) continue;

        const node: Node = { pos: neighbor, g, f: g + heuristic(neighbor, to), parent: current };
        nodeMap.set(nk, node);
        openSet.push(node);
      }
    }

    return null; // no path found
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private neighbors(pos: GridPos): GridPos[] {
    const { gx, gy } = pos;
    const result: GridPos[] = [];
    // 4-directional movement (no diagonals — cleaner for sprite direction)
    const candidates: GridPos[] = [
      { gx: gx, gy: gy - 1 },
      { gx: gx, gy: gy + 1 },
      { gx: gx - 1, gy: gy },
      { gx: gx + 1, gy: gy },
    ];
    for (const c of candidates) {
      if (this.grid.isWalkable(c.gx, c.gy)) result.push(c);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Node = {
  pos: GridPos;
  g: number;
  f: number;
  parent: Node | null;
};

function key(pos: GridPos): string {
  return `${pos.gx},${pos.gy}`;
}

function heuristic(a: GridPos, b: GridPos): number {
  return Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy);
}

function reconstructPath(node: Node): GridPos[] {
  const path: GridPos[] = [];
  let current: Node | null = node;
  while (current) {
    path.unshift(current.pos);
    current = current.parent;
  }
  return path;
}

// ---------------------------------------------------------------------------
// Minimal binary min-heap for A* open set
// ---------------------------------------------------------------------------

class MinHeap<T> {
  private data: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.data.length;
  }

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.data[i], this.data[parent]) < 0) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.compare(this.data[l], this.data[smallest]) < 0) smallest = l;
      if (r < n && this.compare(this.data[r], this.data[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}
