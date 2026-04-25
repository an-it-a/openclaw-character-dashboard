# OpenClaw Character Dashboard

An open-source React + Phaser dashboard that turns your OpenClaw agents into animated characters on a map.

It supports:

- live OpenClaw activity via the local gateway
- mock mode for layout and animation work
- configurable asset packs, so you can reskin the whole dashboard for your own anime, manga, game, or original world
- a resource wall file browser backed by your OpenClaw shared directory

## What You Need

- Node.js >= 22
- an OpenClaw installation with the local gateway running
- an asset pack containing `world.json` and the referenced images

## Installation

One-command installers are provided for all platforms. Each installer checks requirements, offers to install/upgrade Node.js if needed, runs `npm install`, and creates a `run` script.

### macOS / Linux

```bash
./install.sh
```

Then start the dashboard:

```bash
./run.sh
```

### Windows — PowerShell (recommended)

```powershell
.\install.ps1
```

Then start the dashboard:

```powershell
.\run.ps1
```

### Windows — Command Prompt

```cmd
install.bat
```

Then start the dashboard:

```cmd
run.bat
```

---

## Manual Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create your local config:

```bash
cp .env.example .env.local
```

3. Set the key env values for your machine:

```env
OPENCLAW_HOME=/path/to/your/.openclaw
VITE_PUBLIC_DIR=./public
VITE_API_PORT=3001
SHARED_ROOT=/path/to/your/.openclaw/shared
VITE_SESSION_ACTIVE_THRESHOLD_MS=10000
```

4. Start the dashboard and local API together:

```bash
npm run dev:all
```

5. Open the Vite URL shown in the terminal.

## How This Integrates With Your OpenClaw

The dashboard does not talk to the gateway directly from the browser.

Flow:

```text
Browser -> Vite /api proxy -> local Express server -> OpenClaw gateway
```

The server reads gateway config from:

```text
<OPENCLAW_HOME>/openclaw.json
```

From that file it picks up:

- gateway port
- gateway auth token

By default, the resource wall also reads from:

```text
<OPENCLAW_HOME>/shared
```

You can override that with `SHARED_ROOT`.

## Env Config

These settings control the project runtime:

| Variable                           | Purpose                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `OPENCLAW_HOME`                    | Path to your OpenClaw root directory. Used to locate `openclaw.json` and the default shared directory. |
| `VITE_API_PORT`                    | Port used by both the Vite `/api` proxy and the local Express API server.                              |
| `VITE_PUBLIC_DIR`                  | Asset pack/public root that contains `world.json` and all map assets.                                  |
| `SHARED_ROOT`                      | Resource wall browsing root. Defaults to `<OPENCLAW_HOME>/shared`.                                     |
| `VITE_SESSION_ACTIVE_THRESHOLD_MS` | How long recent user-facing activity keeps an agent in `working`.                                      |

## Map Your Agents To Characters

Agent mapping happens in `world.json`.

Each character needs both:

- `id`: the dashboard/internal character id and asset folder name
- `agentId`: the live OpenClaw agent id from the gateway

Example:

```json
{
  "id": "natsuki",
  "agentId": "main",
  "name": "Natsuki",
  "privateRoomId": "private-natsuki",
  "spriteSheet": {
    "inside": "images/map/characters/natsuki/inside.png",
    "outside": "images/map/characters/natsuki/outside.png",
    "frameWidth": 48,
    "frameHeight": 64
  }
}
```

Rules:

- `id` must match the character asset folder under `images/map/characters/<id>/`
- `agentId` must match the real OpenClaw agent id returned by the gateway, such as `main`, `researcher`, `news-crawler`, or `social-media-post-writer`
- `privateRoomId` must match one of the room ids in the same `world.json`

If the agent IDs do not match your OpenClaw setup, live mode will never update the character correctly.

## Customize The Characters And Rooms

This project is designed to be reskinned.

To change the theme to your favorite anime, manga, game, VTubers, or original characters:

1. Create or duplicate an asset pack directory.
2. Point `VITE_PUBLIC_DIR` to that directory.
3. Replace the room, object, and character assets.
4. Update `world.json` to match the new rooms, positions, characters, and image paths.

Expected asset layout:

```text
<VITE_PUBLIC_DIR>/
  world.json
  images/map/
    rooms/
    objects/
    characters/<character-id>/
      inside.png
      outside.png
      room/
      object/
```

Important details:

- sprite sheets use `48x64` frames
- `world.json` is the source of truth for map layout and character config
- no source code change is required to swap character art or room art if your asset paths and `world.json` are correct

## Live State Behavior

Live mode only controls the character main state:

- `working`
- `idle`

Idle sub-states such as wandering, sleeping, or sitting are still driven locally by the character state machine.

An agent is treated as `working` when the dashboard sees recent user-facing activity for that mapped `agentId`.

## Common Commands

```bash
npm run dev        # frontend only
npm run server     # local Express API only
npm run dev:all    # frontend + API together
npm run typecheck
npm run build
```

## More Documentation

- `documentation/openclaw-dashboard-integration.md` — gateway and live data details
- `documentation/world-json-reference.md` — `world.json` schema and rules
- `documentation/adding-an-agent.md` — add new mapped characters
- `documentation/project-structure.md` — project layout and data flow
