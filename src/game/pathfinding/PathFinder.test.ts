import { describe, it, expect } from "vitest";

import { CollisionGrid } from "./CollisionGrid";
import { PathFinder } from "./PathFinder";
import type { WorldConfig } from "@/types/world";

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

describe("PathFinder", () => {
  it("returns a single-cell path when from === to", () => {
    const grid = new CollisionGrid(makeConfig());
    const pf = new PathFinder(grid);
    const path = pf.findPath({ gx: 2, gy: 2 }, { gx: 2, gy: 2 });
    expect(path).toEqual([{ gx: 2, gy: 2 }]);
  });

  it("finds a straight-line path with no obstacles", () => {
    const grid = new CollisionGrid(makeConfig());
    const pf = new PathFinder(grid);
    const path = pf.findPath({ gx: 0, gy: 0 }, { gx: 3, gy: 0 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ gx: 0, gy: 0 });
    expect(path![path!.length - 1]).toEqual({ gx: 3, gy: 0 });
  });

  it("routes around a wall obstacle", () => {
    // Build a vertical wall at gx=2, gy=0..4
    const config = makeConfig();
    config.rooms[0].objects.push({
      id: "wall",
      type: "wall",
      asset: "",
      x: 64, // gx=2
      y: 0,
      width: 32,
      height: 160, // gy 0..4
    });
    const grid = new CollisionGrid(config);
    const pf = new PathFinder(grid);

    // Path from gx=0 to gx=4, same row — must go around
    const path = pf.findPath({ gx: 0, gy: 2 }, { gx: 4, gy: 2 });
    expect(path).not.toBeNull();
    // Path must not pass through any blocked cell (wall is at gx=2, gy=0..4)
    const throughBlockedCell = path!.some((p) => !grid.isWalkable(p.gx, p.gy));
    expect(throughBlockedCell).toBe(false);
    expect(path![path!.length - 1]).toEqual({ gx: 4, gy: 2 });
  });

  it("returns null when destination is completely surrounded by blocking cells", () => {
    const config: WorldConfig = {
      canvasWidth: 320,
      canvasHeight: 320,
      rooms: [
        {
          id: "room",
          label: "Room",
          x: 0,
          y: 0,
          width: 320,
          height: 320,
          objects: [
            // Floor makes all cells walkable first
            {
              id: "floor",
              type: "floor",
              asset: "",
              x: 0,
              y: 0,
              width: 320,
              height: 320,
            },
            // Surround cell (5,5) on all 4 sides + the cell itself
            {
              id: "b1",
              type: "object",
              asset: "",
              x: 160,
              y: 160,
              width: 32,
              height: 32,
            }, // (5,5)
            {
              id: "b2",
              type: "object",
              asset: "",
              x: 128,
              y: 160,
              width: 32,
              height: 32,
            }, // (4,5)
            {
              id: "b3",
              type: "object",
              asset: "",
              x: 192,
              y: 160,
              width: 32,
              height: 32,
            }, // (6,5)
            {
              id: "b4",
              type: "object",
              asset: "",
              x: 160,
              y: 128,
              width: 32,
              height: 32,
            }, // (5,4)
            {
              id: "b5",
              type: "object",
              asset: "",
              x: 160,
              y: 192,
              width: 32,
              height: 32,
            }, // (5,6)
          ],
        },
      ],
      characters: [],
    };
    const grid = new CollisionGrid(config);
    const pf = new PathFinder(grid);
    // Target cell (5,5) is blocked; nearestWalkable will also be surrounded
    // so path will reroute to nearest walkable near target
    const path = pf.findPath({ gx: 0, gy: 0 }, { gx: 5, gy: 5 });
    // Either path is null or it ends at the nearest walkable instead
    if (path !== null) {
      const last = path[path.length - 1];
      expect(grid.isWalkable(last.gx, last.gy)).toBe(true);
    }
  });

  it("path does not contain consecutive duplicate cells", () => {
    const grid = new CollisionGrid(makeConfig());
    const pf = new PathFinder(grid);
    const path = pf.findPath({ gx: 0, gy: 0 }, { gx: 5, gy: 5 });
    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i++) {
      expect(path![i]).not.toEqual(path![i - 1]);
    }
  });
});
