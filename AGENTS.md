# AGENTS.md — openclaw-character-dashboard

This file provides guidance for agentic coding agents and developers working in this repository.

## Project Overview

A single-page dashboard for [OpenClaw](https://github.com/openclaw/openclaw) that renders an animated character map and an inspector panel. Characters represent agents, each with their own private room, and animate through states driven by live or mock OpenClaw data.

**Tech stack:** React + TypeScript + Vite + **Phaser 3**  
**Spec:** `spec/spec.md` — read this first before making any changes  
**Canvas resolution:** configured per asset pack in `world.json` (`canvasWidth` / `canvasHeight`)  
**Character sprite size:** configured per character in `world.json` (`spriteSheet.frameWidth` / `frameHeight`)  
**Animation clips:** configured per asset pack in `clip-defs.json` (rows, frame counts, frame rates)

---

## Build, Lint, and Test Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run typecheck    # Type-check (no emit)
npm run lint         # Lint
npm run lint:fix     # Lint and auto-fix
npm run format       # Format with Prettier
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage

# Run a single test file
npx vitest run src/path/to/file.test.ts

# Run tests matching a name pattern
npx vitest run -t "test name pattern"
```

---

## Runtime Config

Runtime config lives in `.env` or `.env.local`.

- `VITE_PUBLIC_DIR` selects the asset pack/public root used by Vite.
- `VITE_API_PORT` selects the local Express API port used by the Vite `/api` proxy and `server/index.ts`.
- `OPENCLAW_HOME` selects the OpenClaw config root used to locate `openclaw.json` and the default shared directory.
- `SHARED_ROOT` selects the resource wall file-browsing root.
- `VITE_SESSION_ACTIVE_THRESHOLD_MS` controls how long recent user-facing activity keeps an agent in `working`.

Use `npm run dev:all` when you need both the Vite frontend and the local Express API for live data and resource wall behavior.

---

## Directory Structure

```
openclaw-character-dashboard/
├── spec/                        # Project requirements (do not modify)
│   ├── spec.md
│   ├── map-positions.csv
│   ├── character-points.csv
│   ├── character-sprite-sheet.csv
│   └── graphics-spec.csv
├── plan/                        # Planning docs and TODO lists
├── documentation/               # Developer/agent docs
├── public/ or custom public dir # Asset root selected by VITE_PUBLIC_DIR
│   ├── world.json               # World definition file (rooms + characters)
│   └── images/map/
│       ├── rooms/               # Room tile images
│       ├── objects/             # World object sprites
│       └── characters/[name]/   # Per-character sprite sheets + room assets
├── src/
│   ├── components/              # React components (UI shell, inspector panel)
│   ├── game/                    # All Phaser 3 code
│   │   ├── scenes/              # Phaser scenes (Boot, Preload, World)
│   │   ├── objects/             # Phaser GameObjects (CharacterSprite, etc.)
│   │   └── pathfinding/         # Pathfinding helpers wrapping Phaser tilemaps
│   ├── hooks/                   # Custom React hooks (useGameInstance, etc.)
│   ├── store/                   # Zustand stores
│   ├── types/                   # Shared TypeScript types
│   ├── utils/                   # Pure utility functions
│   ├── data/                    # Data layer: mock.ts, live.ts, worldConfig.ts
│   └── main.tsx
├── AGENTS.md
└── ...config files
```

---

## Phaser 3 Integration

Phaser 3 is the rendering and game-logic engine. React owns the UI shell (inspector panel, overlays, HUD); Phaser owns the canvas map.

### Key conventions

- Create the Phaser `Game` instance inside a React component (`src/game/PhaserGame.tsx`) using a `useEffect` that mounts/destroys it once.
- Pass data between React and Phaser via the Zustand store — never use direct DOM manipulation or prop-drilling into Phaser objects.
- All Phaser code lives under `src/game/`. Do **not** import Phaser anywhere outside that directory.
- Use **Phaser tilemaps** to build each room's floor/wall/decor layers; collision layers drive pathfinding.
- Use the **`phaser3-rex-plugins`** `PathFollower` + `Board` plugin (or equivalent) for grid-based character pathfinding. Alternatively use `NavMesh` if the map warrants it; document the choice in `/documentation`.
- Rendering layer order (lowest → highest depth value):
  `floor → wall → floor decor → character → top decor`
- Use Phaser `tweens` for smooth walk animations between tiles; use `AnimationManager` for sprite clips.
- Sprite walk direction: the spec only defines walk down / up / left — derive "walk right" by flipping the left clip horizontally (`setFlipX(true)`).

### Scenes

| Scene          | Purpose                                        |
| -------------- | ---------------------------------------------- |
| `BootScene`    | Load `world.json`; configure Phaser globals    |
| `PreloadScene` | Load all textures declared in `world.json`     |
| `WorldScene`   | Build tilemap, spawn characters, run game loop |

---

## World Definition File — `<VITE_PUBLIC_DIR>/world.json`

**This is the single source of truth for all rooms and characters.** Editing `world.json` inside the active `VITE_PUBLIC_DIR` asset pack is how developers add agents or rearrange the map — no source code changes should be required.

### Schema (TypeScript representation)

```ts
type ObjectLayer =
  | "floor"
  | "wall"
  | "floor-decor"
  | "top-decor"
  | "object"
  | "furniture";

type ApproachDirection = "top" | "bottom" | "left" | "right";

type InteractionPoint = {
  x: number; // pixel offset from object's (x, y) origin
  y: number;
  approachFrom?: ApproachDirection; // which side the character walks in from
};

type WorldObject = {
  id: string; // unique, e.g. "desk-1"
  type: ObjectLayer;
  asset: string; // path under the active public root, e.g. images/map/
  x: number;
  y: number;
  width: number;
  height: number;
  blocksPath?: boolean; // defaults: wall/object/furniture → true, others → false
  depthAnchor?: "top" | "bottom"; // which edge sets render depth; default bottom
  interactionPoints?: InteractionPoint[]; // relative to object origin; used by beds, sofas, desks, etc.
  animation?: {
    /* see world-json-reference.md */
  };
};

type Room = {
  id: string; // e.g. "office", "living", "private-alice"
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  objects: WorldObject[];
};

type CharacterConfig = {
  id: string; // matches folder name under the active public root
  agentId: string; // matches the live datasource agent id
  name: string;
  privateRoomId: string; // must match a room id
  spriteSheet: {
    inside: string; // path to inside.png
    outside: string; // path to outside.png
    frameWidth: number; // e.g. 64 — set per character to match the sprite sheet
    frameHeight: number; // e.g. 64 — set per character to match the sprite sheet
  };
};

type WorldConfig = {
  canvasWidth: number; // canvas width in pixels, e.g. 1500
  canvasHeight: number; // canvas height in pixels, e.g. 760
  rooms: Room[];
  characters: CharacterConfig[];
};
```

### Loading `world.json`

- Fetch and validate at runtime in `BootScene` using **Zod** (or `valibot`).
- Fail loudly with a readable error if the schema is invalid — do not silently fall back.
- The validated config is stored in the Zustand store and consumed by `PreloadScene` and `WorldScene`.
- The config loader lives at `src/data/worldConfig.ts` and exports `loadWorldConfig(): Promise<WorldConfig>`.

### `clip-defs.json`

Animation clip definitions live in `<VITE_PUBLIC_DIR>/clip-defs.json`, separate from `world.json`. Each entry maps a clip name (e.g. `"walk-down"`) to its sprite-sheet row, frame count, frame rate, and which sprite variants (`inside` / `outside`) it applies to. Both files are loaded by `PreloadScene`; `CharacterSprite` reads them at runtime from Phaser's JSON cache. To change animation timing or add new clips, edit `clip-defs.json` — no source code changes required.

### Adding a new agent

1. Add the character's assets to `<VITE_PUBLIC_DIR>/images/map/characters/[name]/`.
2. Add a `CharacterConfig` entry to `<VITE_PUBLIC_DIR>/world.json`.
3. Add a private room `Room` entry (with its objects) to `<VITE_PUBLIC_DIR>/world.json`.
4. No source code changes required.

---

## Code Style Guidelines

### TypeScript

- `"strict": true` in `tsconfig.json` — no exceptions.
- Explicit return types on all exported functions and hooks.
- Use `type` for object shapes and unions; `interface` only when declaration merging is needed.
- Never use `any`; use `unknown` then narrow.
- Use the `satisfies` operator to validate literals without widening.
- No non-null assertions (`!`); prefer `?.` and `??`.

### Naming Conventions

| Thing                 | Convention              | Example                               |
| --------------------- | ----------------------- | ------------------------------------- |
| React components      | PascalCase              | `InspectorPanel.tsx`                  |
| Phaser scenes/objects | PascalCase              | `WorldScene.ts`, `CharacterSprite.ts` |
| Hooks                 | camelCase, `use` prefix | `useGameInstance.ts`                  |
| Utility / data files  | camelCase               | `worldConfig.ts`                      |
| Type files            | camelCase               | `character.ts`                        |
| Constants             | SCREAMING_SNAKE         | `MAX_CANVAS_WIDTH`                    |
| CSS classes           | kebab-case              | `inspector-panel`                     |

### Imports

Order: Node built-ins → third-party → `@/` aliases → relative. Separate groups with blank lines. Use `import type` for type-only imports.

```ts
import { useEffect, useRef } from "react";

import Phaser from "phaser";
import { create } from "zustand";

import type { WorldConfig } from "@/types/world";
import { loadWorldConfig } from "@/data/worldConfig";
```

Prefer named exports. Only use default exports for top-level React page components.

### Error Handling

- Surface config and data errors to the UI immediately; never swallow them silently.
- Validate `world.json` with Zod at load time; throw with a descriptive message on failure.
- Use `Result`-style returns (`{ ok: true, value } | { ok: false, error }`) for functions that can fail.

### State Management

- **Zustand** for global state: `worldConfig`, `characterStates`, `isMockMode`, `inspectorSelection`.
- Component-local UI state (`useState`) for hover, scroll, panel open/close.
- Character state transitions must follow `spec.md` exactly — do not invent sub-states.

### Mock Data

- `isMockMode: boolean` (Zustand) toggles live vs. mock data globally.
- Mock mode randomly cycles states/sub-states at 30–360 s intervals (`src/data/mock.ts`).
- Live data fetching lives in `src/data/live.ts`.

---

## Key Spec References

| File                              | Contents                                             |
| --------------------------------- | ---------------------------------------------------- |
| `spec/spec.md`                    | Full project requirements                            |
| `spec/map-positions.csv`          | Room/object positions; formulas based on agent count |
| `spec/character-points.csv`       | Interaction points per furniture item (x/y offsets)  |
| `spec/character-sprite-sheet.csv` | Sprite rows, frame counts, animation clip names      |
| `spec/graphics-spec.csv`          | All object types, pixel sizes, asset paths           |

---

## Formatting

- **Prettier** controls all formatting — do not manually reformat.
- 2-space indentation, double quotes, trailing commas, semicolons on, 100-char line limit.

---

## Testing

- **Vitest** as test runner; `@testing-library/react` for component tests.
- Test files co-located with source: `src/data/worldConfig.test.ts`.
- Unit-test all pure utilities: config validation, pathfinding helpers, state-machine logic.
- Do not test Phaser internals; test the logic that feeds into them.
- Run one file: `npx vitest run src/data/worldConfig.test.ts`

---

## Documentation

- `/plan/TODO.md` — current TODO list and phase tracker
- `/documentation/project-structure.md` — full directory tree, data flow diagram, rendering layer table
- `/documentation/world-json-reference.md` — complete `world.json` + `clip-defs.json` schema reference
- `/documentation/adding-an-agent.md` — step-by-step guide: assets → `world.json` → verify
- `/documentation/pathfinding.md` — CollisionGrid and PathFinder design and API
- `/documentation/openclaw-dashboard-integration.md` — OpenClaw Gateway WebSocket protocol, snapshot flow, live data derivation
