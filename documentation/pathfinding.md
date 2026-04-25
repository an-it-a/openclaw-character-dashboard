# Pathfinding

The dashboard uses a custom A* pathfinder that operates on a 32×32 px grid derived from `world.json`. It was implemented from scratch (instead of using `phaser3-rex-plugins`) so that:

1. It can be **unit-tested without a Phaser context** (`CollisionGrid.test.ts`, `PathFinder.test.ts`).
2. It works on arbitrarily-positioned rooms without requiring a Tiled tilemap alignment.

---

## CollisionGrid

**File:** `src/game/pathfinding/CollisionGrid.ts`

Builds a 2-D boolean walkability grid from a `WorldConfig`. Each cell is 32×32 px.

### Construction (two-pass)

1. **Pass 1 — blocking objects:** For every object whose `blocksPath` is (or defaults to) `true`, all cells overlapping that object's bounding box are marked non-walkable.
2. **Pass 2 — doors:** Door objects always override pass 1, marking their cells walkable again. This allows door gaps in walls.

### Key API

| Method | Description |
|---|---|
| `isWalkable(gx, gy)` | Returns `true` if the cell is walkable |
| `worldToGrid(px, py)` | Converts pixel position to grid cell `{ gx, gy }` |
| `gridToWorld(gx, gy)` | Returns top-left pixel of cell |
| `gridCenterToWorld(gx, gy)` | Returns centre pixel of cell |
| `nearestWalkable(px, py)` | BFS outward from pixel position; returns nearest walkable cell or `null` |

---

## PathFinder

**File:** `src/game/pathfinding/PathFinder.ts`

4-directional A* (no diagonals) operating on a `CollisionGrid`.

### Algorithm

- **Open set:** binary min-heap ordered by `f = g + h`
- **Heuristic:** Manhattan distance
- **Closed set:** `Set<string>` using `"gx,gy"` keys
- **Re-queuing:** if a shorter path to a neighbour is found, the node is re-pushed; stale copies are discarded on pop via the closed-set check

### `findPath(from, to) → GridPos[] | null`

- If `to` is not walkable, `nearestWalkable` is used to find the closest valid destination.
- Returns the full path including `from` and `to`, or `null` if unreachable.
- If `from === to`, returns `[from]`.

### Movement in WorldScene

`WorldScene.walkPath()` walks through the returned grid waypoints one at a time using `CharacterSprite.tweenTo()`. After all waypoints are reached, a final pixel-precise tween moves the sprite to the exact `interactionPoint` position (which may be sub-cell).

Walk speed is passed through from `CharacterStateMachine`:

| Speed constant | px/s | Used for |
|---|---|---|
| `fastest` | 160 | `walking-to-work` |
| `normal` | 80 | `change-room`, `walking-to-sleep`, `walking-to-sofa` |
| `slowest` | 40 | `wandering` |

---

## Testing

```bash
npx vitest run src/game/pathfinding/CollisionGrid.test.ts
npx vitest run src/game/pathfinding/PathFinder.test.ts
```

All tests run without Phaser — the grid and pathfinder have zero Phaser dependencies.
