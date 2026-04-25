# world.json Reference

`world.json` inside the active `VITE_PUBLIC_DIR` asset pack is the **single source of truth** for all rooms and characters. Editing it (and dropping in the corresponding assets) is all that's required to change the map layout or add new agents.

## Top-level shape

```ts
{
  canvasWidth:  number;   // Canvas width in pixels — set to match your asset pack
  canvasHeight: number;   // Canvas height in pixels — set to match your asset pack
  rooms:        Room[];
  characters:   CharacterConfig[];
}
```

## Room

```ts
{
  id:      string;   // Unique, e.g. "office", "private-alice"
  label:   string;   // Display name shown in the inspector panel
  x:       number;   // Left edge in canvas pixels
  y:       number;   // Top edge in canvas pixels
  width:   number;   // Canvas pixels
  height:  number;   // Canvas pixels
  objects: WorldObject[];
}
```

## WorldObject

```ts
{
  id:     string;           // Unique across all rooms
  type:   ObjectLayerType;  // See below
  asset:  string;           // Path relative to the active public root, e.g. "images/map/objects/desk.png"
                            // Empty string "" for invisible objects (doors)
  x:      number;           // Absolute canvas x
  y:      number;           // Absolute canvas y
  width:  number;
  height: number;
  blocksPath?:  boolean;    // Overrides the type default (see table below)
  depthAnchor?: "top" | "bottom";
                            // Which edge of the sprite determines render depth.
                            // "bottom" (default): depth = y + height (standard for upright objects)
                            // "top": depth = y (use for objects the character walks behind, e.g. sofas)
  interactionPoints?: Array<{
    x: number;              // Pixel offset from object's (x, y) origin
    y: number;
    approachFrom?: "top" | "bottom" | "left" | "right";
                            // Which side the character walks in from before playing the interaction animation
  }>;
  animation?: {
    frameWidth: number;     // Width of one frame inside the spritesheet asset
    frameHeight: number;    // Height of one frame inside the spritesheet asset
    startFrame?: number;    // Default 0
    frameCount: number;     // Number of sequential frames to play
    frameRate?: number;     // Frames per second
    frameDurationMs?: number; // Milliseconds per frame; use instead of frameRate
    repeat?: number;        // Phaser repeat count, default -1 for infinite loop
    yoyo?: boolean;         // Optional ping-pong playback
    delayMs?: number;       // Optional delay before the first loop starts
  };
}
```

### ObjectLayerType and rendering depth

| Type          | Depth | Default blocksPath                   |
| ------------- | ----- | ------------------------------------ |
| `floor`       | 0     | false                                |
| `wall`        | 1     | **true**                             |
| `floor-decor` | 2     | false                                |
| `object`      | 3     | **true**                             |
| `furniture`   | 3     | **true**                             |
| `door`        | 3     | false (always walkable after pass 2) |
| `top-decor`   | 5     | false                                |

Doors explicitly override any blocking cells beneath them in the CollisionGrid (two-pass construction).

### interactionPoints

Relative to the object's `(x, y)` corner. The optional `approachFrom` field tells `CharacterStateMachine` which side the character walks in from before playing the interaction animation. Example:

```json
{
  "id": "desk-1",
  "type": "furniture",
  "x": 288,
  "y": 64,
  "width": 128,
  "height": 64,
  "depthAnchor": "bottom",
  "interactionPoints": [{ "x": 40, "y": -16, "approachFrom": "top" }]
}
```

The absolute pixel position is `{ x: 288+40, y: 64+(-16) } = { x: 328, y: 48 }`.

Multi-seat objects (e.g. a sofa) use multiple interaction points:

```json
{
  "id": "sofa",
  "type": "furniture",
  "x": 32,
  "y": 448,
  "width": 224,
  "height": 64,
  "depthAnchor": "top",
  "interactionPoints": [
    { "x": 17, "y": 20, "approachFrom": "bottom" },
    { "x": 86, "y": 20, "approachFrom": "bottom" },
    { "x": 156, "y": 20, "approachFrom": "bottom" }
  ]
}
```

### animation

Use `animation` when an object sprite should be treated as a spritesheet instead of a static image.

- `asset` must point to the spritesheet image.
- `tiles` and `animation` cannot be used together on the same object.
- Provide exactly one timing field: `frameRate` or `frameDurationMs`.
- Frames are read sequentially from `startFrame` through `startFrame + frameCount - 1`.
- Omit `repeat` or set it to `-1` to loop forever.

Example:

```json
{
  "id": "office-monitor-1",
  "type": "object",
  "asset": "images/map/objects/office/monitor-blink.png",
  "x": 352,
  "y": 128,
  "width": 32,
  "height": 32,
  "animation": {
    "frameWidth": 32,
    "frameHeight": 32,
    "frameCount": 4,
    "frameRate": 6,
    "repeat": -1
  }
}
```

For slower loops, you can use `frameDurationMs` instead:

```json
"animation": {
  "frameWidth": 64,
  "frameHeight": 64,
  "startFrame": 0,
  "frameCount": 8,
  "frameDurationMs": 180,
  "repeat": -1,
  "yoyo": true,
  "delayMs": 300
}
```

## CharacterConfig

```ts
{
  id: string; // Unique; must match folder under <VITE_PUBLIC_DIR>/images/map/characters/
  agentId: string; // Live OpenClaw agent id, e.g. "main"
  name: string; // Display name
  privateRoomId: string; // Must match a Room.id
  spriteSheet: {
    inside: string; // Path to inside.png (relative to the active public root)
    outside: string; // Path to outside.png (relative to the active public root)
    frameWidth: number; // Width of one frame in pixels — must match the sprite sheet
    frameHeight: number; // Height of one frame in pixels — must match the sprite sheet
  }
}
```

## clip-defs.json

Animation clips for character sprites are defined in `<VITE_PUBLIC_DIR>/clip-defs.json` — a **separate file** from `world.json`. This means clip timing and frame counts can be changed per asset pack without touching source code.

### Schema

```ts
type ClipDef = {
  row: number; // Zero-indexed row in the sprite sheet
  frames: number; // Number of frames in the row
  frameRate: number; // Frames per second
  repeat: number; // Phaser repeat count; -1 = loop forever
  variants: ("inside" | "outside")[];
  // Which sprite sheet variant(s) this clip applies to
};

type ClipDefs = Record<string, ClipDef>; // key = clip name, e.g. "walk-down"
```

### Example

```json
{
  "stand": {
    "row": 0,
    "frames": 3,
    "frameRate": 1,
    "repeat": -1,
    "variants": ["inside", "outside"]
  },
  "walk-down": {
    "row": 1,
    "frames": 3,
    "frameRate": 8,
    "repeat": -1,
    "variants": ["inside", "outside"]
  },
  "walk-up": {
    "row": 2,
    "frames": 3,
    "frameRate": 8,
    "repeat": -1,
    "variants": ["inside", "outside"]
  },
  "walk-left": {
    "row": 3,
    "frames": 3,
    "frameRate": 8,
    "repeat": -1,
    "variants": ["inside", "outside"]
  },
  "sit": {
    "row": 4,
    "frames": 2,
    "frameRate": 1,
    "repeat": -1,
    "variants": ["inside", "outside"]
  },
  "sleep": {
    "row": 5,
    "frames": 2,
    "frameRate": 1,
    "repeat": -1,
    "variants": ["inside"]
  },
  "work": {
    "row": 5,
    "frames": 6,
    "frameRate": 3,
    "repeat": -1,
    "variants": ["outside"]
  }
}
```

- `walk-right` has no entry — it is derived from `walk-left` by flipping the sprite horizontally (`setFlipX(true)`).
- Both `world.json` and `clip-defs.json` are loaded by `PreloadScene`; `CharacterSprite` reads clip-defs at runtime from Phaser's JSON cache.
- To adjust animation speed, add a new clip, or change frame counts for a custom sprite sheet — edit `clip-defs.json` only.

## Validation

`loadWorldConfig()` (in `src/data/worldConfig.ts`) validates the file with Zod at runtime. It checks:

1. All required fields are present and have the correct types.
2. Every `CharacterConfig.privateRoomId` references an existing `Room.id`.
3. All `WorldObject.id` values within a room are unique.
4. All `CharacterConfig.id` values are unique.
5. All `CharacterConfig.agentId` values are unique.

Validation failures throw immediately with a descriptive error message — they are never silently swallowed.

## Adding a corridor / shared passage

Add a room with `type: "door"` objects at the edges that connect adjacent rooms:

```json
{
  "id": "corridor",
  "label": "Corridor",
  "x": 320, "y": 480, "width": 192, "height": 64,
  "objects": [
    { "id": "corridor-floor", "type": "floor", ... },
    { "id": "corridor-door-west", "type": "object", "asset": "", "x": 320, "y": 480, "width": 10, "height": 64, "blocksPath": false }
  ]
}
```

Doors with `asset: ""` are invisible (no sprite rendered) but still mark their grid cells as walkable.
