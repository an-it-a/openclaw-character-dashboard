# Adding a New Agent

This guide shows how to add a new character (agent) to the dashboard. No source code changes are required — only assets and `world.json` inside the asset pack selected by `VITE_PUBLIC_DIR`.

## Step 1 — Add character assets

Create a folder `<VITE_PUBLIC_DIR>/images/map/characters/<name>/` and add:

| File                | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `inside.png`        | Sprite sheet used when the character is in their private room |
| `outside.png`       | Sprite sheet used in shared rooms (office, living)            |
| `room/floor.png`    | Floor tile for the private room                               |
| `object/bed.png`    | Bed furniture sprite                                          |
| `object/decor1.png` | Optional decorative element                                   |

### Sprite sheet format

- Frame size: set `frameWidth` / `frameHeight` in `world.json` to match your sprite sheet (e.g. 64 × 64 px)
- Layout: rows of frames (no padding between frames)
- The row layout, frame counts, and frame rates are all defined in `<VITE_PUBLIC_DIR>/clip-defs.json` — edit that file to customise animation for your asset pack
- Default clip layout (from the reference `clip-defs.json`):

| Row | Clip      | Frames | Used in          |
| --- | --------- | ------ | ---------------- |
| 0   | stand     | 3      | inside + outside |
| 1   | walk-down | 3      | inside + outside |
| 2   | walk-up   | 3      | inside + outside |
| 3   | walk-left | 3      | inside + outside |
| 4   | sit       | 2      | inside + outside |
| 5   | sleep     | 2      | inside only      |
| 5   | work      | 6      | outside only     |

Walk-right is derived from walk-left by flipping horizontally (`setFlipX(true)`) — no separate row needed.

## Step 2 — Add a private room to world.json

Open `<VITE_PUBLIC_DIR>/world.json` and add a new `Room` entry inside the `rooms` array:

```json
{
  "id": "private-charlie",
  "label": "Charlie's Room",
  "x": 512,
  "y": 288,
  "width": 192,
  "height": 192,
  "objects": [
    {
      "id": "private-charlie-floor",
      "type": "floor",
      "asset": "images/map/characters/charlie/room/floor.png",
      "x": 512,
      "y": 288,
      "width": 192,
      "height": 192,
      "blocksPath": false
    },
    {
      "id": "private-charlie-wall",
      "type": "wall",
      "asset": "",
      "x": 512,
      "y": 288,
      "width": 192,
      "height": 64,
      "blocksPath": true
    },
    {
      "id": "private-charlie-wall",
      "type": "wall",
      "asset": "images/map/characters/charlie/object/wall.png",
      "x": 512,
      "y": 288,
      "width": 192,
      "height": 64,
      "blocksPath": true
    },
    {
      "id": "private-charlie-door",
      "type": "object",
      "asset": "images/map/rooms/room-door.png",
      "x": 576,
      "y": 480,
      "width": 64,
      "height": 64,
      "blocksPath": false
    },
    {
      "id": "bed-charlie",
      "type": "furniture",
      "asset": "images/map/characters/charlie/object/bed.png",
      "x": 640,
      "y": 352,
      "width": 64,
      "height": 96,
      "blocksPath": true,
      "depthAnchor": "bottom",
      "interactionPoints": [{ "x": 8, "y": 40, "approachFrom": "bottom" }]
    }
  ]
}
```

> **Room placement:** Use `spec/map-positions.csv` formulas to calculate x/y for the room based on the total agent count. Rooms must not overlap.

## Step 3 — Add a CharacterConfig to world.json

Inside the `characters` array:

```json
{
  "id": "charlie",
  "agentId": "charlie-gateway-id",
  "name": "Charlie",
  "privateRoomId": "private-charlie",
  "spriteSheet": {
    "inside": "images/map/characters/charlie/inside.png",
    "outside": "images/map/characters/charlie/outside.png",
    "frameWidth": 64,
    "frameHeight": 64
  }
}
```

- `id` must exactly match the folder name under `<VITE_PUBLIC_DIR>/images/map/characters/`.
- `agentId` must match the live OpenClaw agent ID used by the gateway datasource.
- `frameWidth` / `frameHeight` must match the actual pixel dimensions of one frame in your sprite sheets. These are **not fixed** — set them to match however your sprite sheet was drawn.

## Step 4 — Verify

```bash
npm run dev:all
```

Charlie should appear in their private room, animate through idle states, and show up in the inspector panel when clicked.

If a texture fails to load, `PreloadScene` logs a warning and `WorldScene` / `CharacterSprite` skip that texture gracefully — so the app will not crash.

## Referential integrity

`loadWorldConfig()` validates at runtime that every `CharacterConfig.privateRoomId` references a real room id and that both `id` and `agentId` are unique. It will throw a descriptive error if not.
