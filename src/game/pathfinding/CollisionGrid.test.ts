import { describe, it, expect } from "vitest";

import { CollisionGrid, GRID_CELL } from "./CollisionGrid";
import type { WorldConfig } from "@/types/world";

// Minimal WorldConfig factory for tests.
// Includes a floor object covering the entire room so that cells are walkable
// by default, matching the CollisionGrid "start blocked, mark floor walkable" logic.
function makeConfig(overrides?: Partial<WorldConfig>): WorldConfig {
  return {
    canvasWidth: 320,
    canvasHeight: 320,
    rooms: [
      {
        id: "test-room",
        label: "Test",
        x: 0,
        y: 0,
        width: 320,
        height: 320,
        objects: [
          {
            id: "test-floor",
            type: "floor",
            asset: "",
            x: 0,
            y: 0,
            width: 320,
            height: 320,
            blocksPath: false,
          },
        ],
      },
    ],
    characters: [],
    ...overrides,
  };
}

describe("CollisionGrid", () => {
  it("marks floor-covered cells as walkable", () => {
    const grid = new CollisionGrid(makeConfig());
    expect(grid.isWalkable(0, 0)).toBe(true);
    expect(grid.isWalkable(4, 4)).toBe(true);
  });

  it("returns false for out-of-bounds cells", () => {
    const grid = new CollisionGrid(makeConfig());
    expect(grid.isWalkable(-1, 0)).toBe(false);
    expect(grid.isWalkable(0, -1)).toBe(false);
    expect(grid.isWalkable(999, 0)).toBe(false);
    expect(grid.isWalkable(0, 999)).toBe(false);
  });

  it("marks a wall object as non-walkable", () => {
    const config = makeConfig();
    config.rooms[0].objects.push({
      id: "wall-1",
      type: "wall",
      asset: "",
      x: 0,
      y: 0,
      width: 64,
      height: 32,
    });
    const grid = new CollisionGrid(config);
    // cells (0,0), (1,0) are covered by the 64×32 wall
    expect(grid.isWalkable(0, 0)).toBe(false);
    expect(grid.isWalkable(1, 0)).toBe(false);
    // cell (2, 0) is outside the wall
    expect(grid.isWalkable(2, 0)).toBe(true);
  });

  it("marks a floor object as walkable by default", () => {
    const config = makeConfig();
    config.rooms[0].objects.push({
      id: "floor-1",
      type: "floor",
      asset: "",
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    });
    const grid = new CollisionGrid(config);
    expect(grid.isWalkable(0, 0)).toBe(true);
    expect(grid.isWalkable(1, 1)).toBe(true);
  });

  it("door objects override blocking walls", () => {
    const config = makeConfig();
    // A wall covering cells (0,0)→(3,0)
    config.rooms[0].objects.push({
      id: "wall-1",
      type: "wall",
      asset: "",
      x: 0,
      y: 0,
      width: 128,
      height: 32,
    });
    // A door at cell (1,0) — 32×32 covering exactly that cell
    config.rooms[0].objects.push({
      id: "door-1",
      type: "door",
      asset: "",
      x: GRID_CELL,
      y: 0,
      width: GRID_CELL,
      height: GRID_CELL,
    });
    const grid = new CollisionGrid(config);
    expect(grid.isWalkable(0, 0)).toBe(false); // still wall
    expect(grid.isWalkable(1, 0)).toBe(true); // door overrides
    expect(grid.isWalkable(2, 0)).toBe(false); // still wall
  });

  it("respects explicit blocksPath: false override on a wall-type object", () => {
    const config = makeConfig();
    config.rooms[0].objects.push({
      id: "special-wall",
      type: "wall",
      asset: "",
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      blocksPath: false,
    });
    const grid = new CollisionGrid(config);
    expect(grid.isWalkable(0, 0)).toBe(true);
  });

  it("respects explicit blocksPath: true override on a floor-decor-type object", () => {
    const config = makeConfig();
    config.rooms[0].objects.push({
      id: "blocking-decor",
      type: "floor-decor",
      asset: "",
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      blocksPath: true,
    });
    const grid = new CollisionGrid(config);
    expect(grid.isWalkable(0, 0)).toBe(false);
  });

  it("worldToGrid and gridToWorld are inverse operations", () => {
    const grid = new CollisionGrid(makeConfig());
    const { gx, gy } = grid.worldToGrid(96, 128);
    expect(gx).toBe(3);
    expect(gy).toBe(4);
    const { px, py } = grid.gridToWorld(3, 4);
    expect(px).toBe(96);
    expect(py).toBe(128);
  });

  it("nearestWalkable returns the queried cell if already walkable", () => {
    const grid = new CollisionGrid(makeConfig());
    const result = grid.nearestWalkable(48, 48); // centre of cell (1,1)
    expect(result).toEqual({ gx: 1, gy: 1 });
  });

  it("nearestWalkable finds adjacent walkable cell when queried cell is blocked", () => {
    const config = makeConfig();
    // Block cell (0,0)
    config.rooms[0].objects.push({
      id: "block",
      type: "object",
      asset: "",
      x: 0,
      y: 0,
      width: 32,
      height: 32,
    });
    const grid = new CollisionGrid(config);
    const result = grid.nearestWalkable(16, 16); // centre of blocked cell (0,0)
    expect(result).not.toBeNull();
    expect(result).not.toEqual({ gx: 0, gy: 0 });
    expect(grid.isWalkable(result!.gx, result!.gy)).toBe(true);
  });
});
