# Project Structure

A reference for developers and AI agents working in this repository.

## Top-level layout

```
openclaw-character-dashboard/
├── .env / .env.local # Local runtime config (ports, asset root, shared root, live threshold)
├── spec/           # Read-only requirements (do not modify)
├── plan/           # TODO lists and planning notes
│   └── TODO.md
├── documentation/  # Developer/agent reference docs (this folder)
│   ├── project-structure.md
│   ├── world-json-reference.md
│   ├── adding-an-agent.md
│   ├── pathfinding.md
│   ├── openclaw-dashboard-integration.md
│   └── images/                    # Screenshots and diagrams for docs
├── public/ / custom public dir # Asset root selected by VITE_PUBLIC_DIR
│   ├── world.json              # World definition — single source of truth
│   ├── clip-defs.json          # Animation clip definitions (rows, frames, rates)
│   └── images/map/             # All game assets
│       ├── rooms/              # Shared room tile images
│       ├── objects/            # Shared world object sprites
│       └── characters/[name]/  # Per-character sprites + room assets
├── server/
│   └── index.ts               # Express API for live snapshot + resource wall
├── src/
│   ├── main.tsx               # React entry point
│   ├── test-setup.ts          # Vitest global setup (@testing-library/jest-dom)
│   ├── styles/global.css      # Global CSS reset and variables
│   ├── types/world.ts         # Shared TypeScript types
│   ├── data/
│   │   ├── worldConfig.ts     # Zod validation + loadWorldConfig()
│   │   ├── worldConfig.test.ts
│   │   ├── mock.ts            # MockDataSource (random state changes)
│   │   └── live.ts            # LiveDataSource polling /api/openclaw/snapshot
│   ├── store/
│   │   ├── worldStore.ts      # worldConfig, isMockMode, inspectorSelection
│   │   └── characterStore.ts  # characterStates, occupancy map
│   ├── game/                  # All Phaser 3 code — never import outside here
│   │   ├── PhaserGame.tsx     # React component: mounts/destroys Phaser Game
│   │   ├── WorldMap.ts        # Renders rooms/objects; emits objectClicked events
│   │   ├── scenes/
│   │   │   ├── BootScene.ts   # Loads world.json + clip-defs.json; stores config in Zustand
│   │   │   ├── PreloadScene.ts# Loads all textures declared in world.json
│   │   │   └── WorldScene.ts  # Spawns characters; runs game loop; wires clicks
│   │   ├── objects/
│   │   │   ├── CharacterSprite.ts       # Phaser Sprite: animations, tweened movement
│   │   │   ├── CharacterStateMachine.ts # Pure state machine (no Phaser deps)
│   │   │   └── CharacterStateMachine.test.ts
│   │   └── pathfinding/
│   │       ├── CollisionGrid.ts         # 32×32 px walkability grid
│   │       ├── CollisionGrid.test.ts
│   │       ├── PathFinder.ts            # A* pathfinder with embedded MinHeap
│   │       └── PathFinder.test.ts
│   └── components/
│       ├── App.tsx / App.css
│       ├── InspectorPanel.tsx / .css    # Right-side details panel
│       ├── MockModeToggle.tsx / .css    # Toggle mock ↔ live data
│       ├── ResourceWallOverlay.tsx / .css # File browser modal
│       └── FilePreview.tsx / .css      # Multi-type file preview
├── install.sh     # macOS/Linux installer (Node ≥ 22 check, npm install, runner scripts)
├── install.bat    # Windows CMD installer
├── install.ps1    # Windows PowerShell installer
├── README.md      # Non-technical user guide (Traditional Chinese)
├── README-en.md   # Non-technical user guide (English)
├── README-tech.md # Developer/agent reference README
├── README-assets.md     # AI asset creation guide (Traditional Chinese)
├── README-assets-en.md  # AI asset creation guide (English)
├── AGENTS.md      # Coding conventions for AI agents
└── ...config files (package.json, tsconfig.json, vite.config.ts, …)
```

## Runtime config

- `VITE_PUBLIC_DIR` selects the asset pack/public root used by Vite.
- `VITE_API_PORT` selects the local Express API port used by both Vite proxy and server.
- `OPENCLAW_HOME` selects the OpenClaw config root used to locate `openclaw.json` and the default shared directory.
- `SHARED_ROOT` selects the resource wall browsing root.
- `VITE_SESSION_ACTIVE_THRESHOLD_MS` controls how long recent user-facing activity keeps an agent in `working`.

## Data flow

```
world.json
  └─► BootScene (Zod validate) ─► worldStore.worldConfig
         └─► PreloadScene (load textures)
               └─► WorldScene
                     ├─► WorldMap (static rendering)
                     ├─► CollisionGrid + PathFinder
                     ├─► CharacterSprite × N  ──────────────────────┐
                     └─► CharacterStateMachine × N                  │
                           ├─ callbacks.moveTo ─► CharacterSprite.tweenTo
                           └─ callbacks.onStateChanged ─► characterStore
                                                                     │
MockDataSource / LiveDataSource                                      │
  └─ stateChange event ─► CharacterStateMachine.setExternalState     │
                                                                      ▼
React UI (InspectorPanel, MockModeToggle) ◄── Zustand stores ◄──────┘
```

```
Browser ─► Vite /api proxy ─► Express server (`server/index.ts`) ─► OpenClaw Gateway
```

## Rendering layer order (depth values)

| Layer            | Depth | Contents                               |
| ---------------- | ----- | -------------------------------------- |
| Floor            | 0     | Room floor tiles                       |
| Wall             | 1     | Back walls                             |
| Floor decor      | 2     | Carpets, decals                        |
| Object/Furniture | 3     | Desks, sofa, gym, doors                |
| Character        | 4     | Character sprites                      |
| Top decor        | 5     | Desk overlays, plants above characters |
| Wall border      | 6     | Coloured border lines with door gaps   |

## Key conventions

- **React ↔ Phaser communication:** only via Zustand — no direct DOM refs or prop-drilling into Phaser objects.
- **No Phaser imports outside `src/game/`.**
- **`world.json` is the single source of truth** — add agents by editing the file inside the active `VITE_PUBLIC_DIR` asset pack.
- **`strict: true` TypeScript** — no `any`, no non-null assertions.
- **Prettier** controls all formatting.
