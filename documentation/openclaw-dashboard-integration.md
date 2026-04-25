# OpenClaw Gateway Integration — Complete Reference

This document captures how the dashboard currently connects to the OpenClaw Gateway and turns live session data into the map's `working` / `idle` character state.

---

## Overview

The browser does not connect to the OpenClaw Gateway directly. Instead, the React app polls a local Express endpoint, and that server opens a short-lived WebSocket connection to the gateway, performs the handshake, and returns a JSON snapshot.

```
Browser (React)
    │  GET /api/openclaw/snapshot  (every 20 s)
    ▼
Vite Dev Server (`/api` proxy)
    │  http://localhost:<VITE_API_PORT>
    ▼
Local Express Server (`server/index.ts`)
    │  ws://127.0.0.1:18789  (new connection per poll)
    ▼
OpenClaw Gateway
```

## Local Env Config

Runtime config lives in `.env` or `.env.local`.

| Variable                           | Purpose                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `VITE_API_PORT`                    | Port used by both the Vite `/api` proxy and the local Express server.             |
| `VITE_PUBLIC_DIR`                  | Asset pack/public root containing `world.json` and images.                        |
| `OPENCLAW_HOME`                    | OpenClaw config root containing `openclaw.json` and the default shared directory. |
| `SHARED_ROOT`                      | Root path served by the resource wall file browser.                               |
| `VITE_SESSION_ACTIVE_THRESHOLD_MS` | How long recent user-facing activity keeps an agent in `working`.                 |

---

## Gateway Address & Config

### Default

| Parameter          | Value                    |
| ------------------ | ------------------------ |
| WebSocket URL      | `ws://127.0.0.1:18789`   |
| HTTP origin header | `http://127.0.0.1:18789` |
| Bind               | loopback only            |

### Config file

The gateway reads from `<OPENCLAW_HOME>/openclaw.json`. The dashboard reads the same file at startup to pick up any overrides:

```
<OPENCLAW_HOME>/openclaw.json
```

Relevant section:

```json
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "<hex-token>"
    }
  }
}
```

### Reading the config (Node.js)

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readGatewayConfig() {
  try {
    const configPath = path.join(
      process.env.OPENCLAW_HOME ?? path.join(os.homedir(), ".openclaw"),
      "openclaw.json",
    );
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      gateway?: { port?: number; auth?: { token?: string } };
    };
    const port = parsed.gateway?.port ?? 18789;
    const token = parsed.gateway?.auth?.token ?? "";
    return {
      httpUrl: `http://127.0.0.1:${port}`,
      wsUrl: `ws://127.0.0.1:${port}`,
      token,
    };
  } catch {
    return {
      httpUrl: "http://127.0.0.1:18789",
      wsUrl: "ws://127.0.0.1:18789",
      token: "",
    };
  }
}
```

---

## WebSocket Protocol

### Transport

- Plain WebSocket (no sub-protocol needed).
- Must set the `Origin` header to the gateway HTTP URL (`http://127.0.0.1:<port>`).
- The connection is short-lived: open → handshake → requests → close. A new connection is made for every poll.

### Message envelope

All messages in both directions are JSON objects with a `type` field:

```
Client → Server  { type: 'req', id: string, method: string, params: object }
Server → Client  { type: 'res', id: string, ok: boolean, payload?: unknown, error?: { message?: string } }
Server → Client  { type: 'event', event: string, payload?: unknown }
```

---

## Connection Handshake

### Step 1 — Server sends challenge

Immediately after the WebSocket opens the server pushes:

```json
{
  "type": "event",
  "event": "connect.challenge"
}
```

The payload may include a `nonce` field (optional; unused in the current implementation).

### Step 2 — Client responds with `connect`

Send a request with `id: "connect"` and `method: "connect"`:

```json
{
  "type": "req",
  "id": "connect",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "openclaw-control-ui",
      "version": "tamons-b-side-dashboard-dev-server",
      "platform": "node",
      "mode": "webchat",
      "instanceId": "tamons-b-side-dashboard-dev-server"
    },
    "role": "operator",
    "scopes": ["operator.read"],
    "caps": ["tool-events"],
    "auth": { "token": "<token-from-config>" },
    "userAgent": "vite-dev-server",
    "locale": "en"
  }
}
```

**Field notes:**

| Field                         | Required | Notes                                                                    |
| ----------------------------- | -------- | ------------------------------------------------------------------------ |
| `minProtocol` / `maxProtocol` | Yes      | Must be `3`.                                                             |
| `client.id`                   | Yes      | Identifies the connecting client type. Use `"openclaw-control-ui"`.      |
| `client.version`              | Yes      | Free-form string; used for logging.                                      |
| `client.platform`             | Yes      | `"node"` for server-side, `"browser"` for frontend.                      |
| `client.mode`                 | Yes      | `"webchat"` for operator UIs.                                            |
| `client.instanceId`           | Yes      | Unique instance string per process.                                      |
| `role`                        | Yes      | `"operator"` grants read access to all agents/sessions.                  |
| `scopes`                      | Yes      | `["operator.read"]` is sufficient for a read-only dashboard.             |
| `caps`                        | Yes      | `["tool-events"]` enables tool execution events.                         |
| `auth.token`                  | Yes      | The hex token from `openclaw.json`. Pass `{}` if no token is configured. |
| `locale`                      | Yes      | `"en"`                                                                   |

### Step 3 — Server responds with `hello-ok`

```json
{
  "type": "res",
  "id": "connect",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 3,
    "server": {
      "version": "2026.4.8",
      "connId": "b0380c3e-8a36-4443-9798-58fc48d0487f"
    },
    "features": {
      "methods": ["health", "agents.list", "sessions.list", "..."],
      "events": ["connect.challenge", "agent", "chat", "session.message", "..."]
    },
    "snapshot": {
      "presence": [...],
      "health": {...},
      "stateVersion": { "presence": 5057, "health": 17940 },
      "uptimeMs": 949146405,
      "sessionDefaults": {
        "defaultAgentId": "main",
        "mainKey": "main",
        "mainSessionKey": "agent:main:main",
        "scope": "per-sender"
      },
      "updateAvailable": {
        "currentVersion": "2026.4.8",
        "latestVersion": "2026.4.15",
        "channel": "latest"
      }
    },
    "canvasHostUrl": "http://127.0.0.1:18789",
    "policy": {
      "maxPayload": 26214400,
      "maxBufferedBytes": 52428800,
      "tickIntervalMs": 30000
    }
  }
}
```

If `ok` is `false`, the `error.message` field explains the failure. Close the socket and surface the error.

---

## Methods Used by the Dashboard

After the `connect` response, the client can issue requests with incrementing numeric `id` values. All four data-fetch calls are made in parallel immediately after successful authentication.

### `agents.list`

Returns all configured agents.

**Request:**

```json
{ "type": "req", "id": "2", "method": "agents.list", "params": {} }
```

**Response payload:**

```json
{
  "defaultId": "main",
  "mainKey": "main",
  "scope": "per-sender",
  "agents": [
    {
      "id": "main",
      "workspace": "/home/ubuntu/.openclaw/workspace",
      "model": { "primary": "github-copilot/gpt-5.4" }
    },
    {
      "id": "developer",
      "name": "developer",
      "workspace": "/home/ubuntu/.openclaw/agents/developer",
      "model": { "primary": "github-copilot/gpt-5.4" }
    }
  ]
}
```

**Usage:** Extract `payload.agents` (array). Each element has at minimum an `id` string.

---

### `sessions.list`

Returns all active and recent sessions across all agents.

**Request:**

```json
{
  "type": "req",
  "id": "3",
  "method": "sessions.list",
  "params": {
    "includeGlobal": true,
    "includeUnknown": true,
    "limit": 100
  }
}
```

**Response payload:**

```json
{
  "ts": 1776674724685,
  "path": "(multiple)",
  "count": 5,
  "defaults": {
    "modelProvider": "github-copilot",
    "model": "gpt-5.4",
    "contextTokens": 400000
  },
  "sessions": [
    {
      "key": "agent:main:main",
      "kind": "direct",
      "displayName": "heartbeat",
      "chatType": "direct",
      "origin": {
        "label": "heartbeat",
        "provider": "heartbeat",
        "from": "heartbeat",
        "to": "heartbeat"
      },
      "updatedAt": 1776674559066,
      "sessionId": "008d2b3a-b270-4046-9d1f-8f9483a752e8",
      "systemSent": true,
      "abortedLastRun": false,
      "inputTokens": 163011,
      "outputTokens": 81,
      "totalTokens": 162956,
      "estimatedCostUsd": 0,
      "status": "done",
      "startedAt": 1776674531549,
      "endedAt": 1776674559006,
      "runtimeMs": 27457,
      "modelProvider": "github-copilot",
      "model": "gpt-5.4",
      "contextTokens": 400000,
      "lastTo": "heartbeat"
    },
    {
      "key": "agent:news-crawler:cron:7ce4006d-4d59-4db0-a872-4f97d16ff511",
      "kind": "direct",
      "label": "Cron: Utage daily news digest",
      "displayName": "Cron: Utage daily news digest",
      "updatedAt": 1776650400014,
      "sessionId": "d6fd0140-7dd5-4bbb-9cfc-759a3c0eecb0",
      "systemSent": true,
      "inputTokens": 62542,
      "outputTokens": 5926,
      "totalTokens": 66596,
      "estimatedCostUsd": 0,
      "modelProvider": "github-copilot",
      "model": "gpt-5.4",
      "contextTokens": 400000
    }
  ]
}
```

**Key fields per session:**

| Field                   | Type                                | Notes                                                                                                                          |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `key`                   | string                              | Format: `agent:<agentId>:<channel-or-cron>:<scope>`. Parse the second segment to get the `agentId`.                            |
| `status`                | `"done"` \| `"active"` \| undefined | `"active"` = agent is currently running. Absence of status = session was never completed or is from a cron with no completion. |
| `updatedAt`             | number                              | Unix ms timestamp of last activity. Used to calculate staleness.                                                               |
| `startedAt` / `endedAt` | number \| undefined                 | Present when the session had a run.                                                                                            |

**Deriving `agentId` from `key`:**

```ts
function agentIdFromSessionKey(key: string): string {
  // key format: "agent:<agentId>:<rest...>"
  const parts = key.split(":");
  return parts[1] ?? "";
}
```

---

### `system-presence`

Returns all currently connected nodes and the gateway itself. Used to populate the presence display and verify gateway connectivity.

**Request:**

```json
{ "type": "req", "id": "4", "method": "system-presence", "params": {} }
```

**Response payload** (array):

```json
[
  {
    "host": "bot-network",
    "ip": "10.0.0.239",
    "version": "2026.4.8",
    "platform": "linux 6.17.0-1007-oracle",
    "deviceFamily": "Linux",
    "modelIdentifier": "arm64",
    "mode": "gateway",
    "reason": "self",
    "text": "Gateway: bot-network (10.0.0.239) · app 2026.4.8 · mode gateway · reason self",
    "ts": 1776674724678
  },
  {
    "host": "openclaw-control-ui",
    "version": "tamons-b-side-dashboard-dev-server",
    "platform": "node",
    "mode": "webchat",
    "roles": ["operator"],
    "scopes": ["operator.read"],
    "instanceId": "tamons-b-side-dashboard-dev-server",
    "reason": "connect",
    "ts": 1776674724677,
    "text": "Node: openclaw-control-ui · mode webchat"
  }
]
```

**Note:** This method may fail (e.g. if the scope doesn't allow it). The dashboard calls it with `.catch(() => [])` and treats failure as an empty presence list.

---

### `agent.identity.get`

Returns the display identity for a single agent (name, avatar, emoji). Called once per agent after `agents.list`.

**Request:**

```json
{
  "type": "req",
  "id": "5",
  "method": "agent.identity.get",
  "params": { "agentId": "main" }
}
```

**Response payload:**

```json
{
  "agentId": "main",
  "name": "Natsuki",
  "avatar": "🎀",
  "emoji": "🎀"
}
```

Other agents may return a path string for `avatar` instead of an emoji:

```json
{
  "agentId": "developer",
  "name": "泉 / Izumi",
  "avatar": "/avatar/developer",
  "emoji": "🛠️"
}
```

**All agent identities from the live gateway:**

| `agentId`                      | `name`           | `emoji` |
| ------------------------------ | ---------------- | ------- |
| `main`                         | Natsuki          | 🎀      |
| `agent-resource-manager`       | 藤田 / Fujita    | 📋      |
| `art-director`                 | 飛鳥 / Asuka     | 🎨      |
| `developer`                    | 泉 / Izumi       | 🛠️      |
| `news-crawler`                 | 歌夏 / Utage     | 🪭      |
| `pixel-dashboard-art-director` | 結菜 / Yuina     | 🖼️      |
| `researcher`                   | 倫太郎 / Rintaro | 💪🏻      |
| `seo-expert`                   | 敬人 / Keito     | 💰      |
| `social-media-post-writer`     | 多聞 / Tamon     | ✨      |
| `youtube-script-writer`        | 櫻利 / Ouri      | 👑      |

---

## Full Snapshot Flow (Complete Code)

This is the exact implementation from `vite.config.ts` adapted as a standalone async function. It opens a WebSocket, handshakes, fires all requests in parallel, collects results, and closes.

```ts
import { WebSocket } from "ws"; // npm install ws

interface GatewayConfig {
  httpUrl: string;
  wsUrl: string;
  token: string;
}

async function fetchGatewaySnapshot(gateway: GatewayConfig): Promise<{
  agents: unknown;
  sessions: unknown;
  presence: unknown;
  identities: Record<string, unknown>;
  source: string;
  fetchedAt: number;
}> {
  const ws = new WebSocket(gateway.wsUrl, {
    headers: { Origin: gateway.httpUrl },
  });

  let requestSeq = 1;
  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();

  const request = <T>(method: string, params: Record<string, unknown>) =>
    new Promise<T>((resolve, reject) => {
      const id = String(requestSeq++);
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      ws.send(JSON.stringify({ type: "req", id, method, params }));
    });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Gateway snapshot timeout"));
      try {
        ws.close();
      } catch {}
    }, 15000);

    ws.onmessage = async (event) => {
      const message = JSON.parse(String(event.data)) as
        | { type: "event"; event: string; payload?: { nonce?: string } }
        | {
            type: "res";
            id: string;
            ok: boolean;
            payload?: unknown;
            error?: { message?: string };
          };

      // Step 1: respond to challenge
      if (message.type === "event" && message.event === "connect.challenge") {
        ws.send(
          JSON.stringify({
            type: "req",
            id: "connect",
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "openclaw-control-ui",
                version: "my-dashboard-dev-server",
                platform: "node",
                mode: "webchat",
                instanceId: "my-dashboard-dev-server",
              },
              role: "operator",
              scopes: ["operator.read"],
              caps: ["tool-events"],
              auth: gateway.token ? { token: gateway.token } : {},
              userAgent: "vite-dev-server",
              locale: "en",
            },
          }),
        );
        return;
      }

      if (message.type !== "res") return;

      // Step 2: handle connect response, fire data requests
      if (message.id === "connect") {
        if (!message.ok) {
          clearTimeout(timeout);
          reject(new Error(message.error?.message ?? "Gateway connect failed"));
          ws.close();
          return;
        }

        try {
          const [agents, sessions, presence] = await Promise.all([
            request("agents.list", {}),
            request("sessions.list", {
              includeGlobal: true,
              includeUnknown: true,
              limit: 100,
            }),
            request("system-presence", {}).catch(() => []),
          ]);

          // Fetch identities for all agents in parallel
          const agentList = (
            (agents as { agents?: Array<{ id: string }> }).agents ?? []
          ).map((a) => a.id);

          const identities = Object.fromEntries(
            await Promise.all(
              agentList.map(async (agentId) => {
                try {
                  const identity = await request("agent.identity.get", {
                    agentId,
                  });
                  return [agentId, identity];
                } catch (err) {
                  return [
                    agentId,
                    { error: err instanceof Error ? err.message : String(err) },
                  ];
                }
              }),
            ),
          );

          clearTimeout(timeout);
          resolve({
            agents,
            sessions,
            presence,
            identities,
            source: gateway.httpUrl,
            fetchedAt: Date.now(),
          });
          ws.close();
        } catch (err) {
          clearTimeout(timeout);
          reject(err instanceof Error ? err : new Error(String(err)));
          ws.close();
        }
        return;
      }

      // Step 3: resolve pending requests
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.ok) {
        entry.resolve(message.payload);
      } else {
        entry.reject(
          new Error(message.error?.message ?? "Gateway request failed"),
        );
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Gateway websocket error"));
    };
  });
}
```

---

## Local Snapshot API

The React frontend polls a local HTTP endpoint exposed by `server/index.ts`. Vite proxies `/api/*` to that server using `VITE_API_PORT`.

```
GET /api/openclaw/snapshot
→ 200 { agents, sessions, presence, identities, source, fetchedAt }
→ 500 { error: string }
```

### Current routing

```ts
// vite.config.ts
server: {
  proxy: {
    "/api": {
      target: `http://localhost:${env.VITE_API_PORT ?? 3001}`,
      changeOrigin: true,
    },
  },
}

// server/index.ts
app.get("/api/openclaw/snapshot", async (_req, res) => {
  const payload = await fetchGatewaySnapshot(gateway);
  res.status(200).json(payload);
});
```

---

## Client-Side Polling

The frontend polls `/api/openclaw/snapshot` every 20 seconds in `src/data/live.ts`.

### Constants

```ts
const SNAPSHOT_POLL_MS = 20_000; // poll every 20 s
const SESSION_ACTIVE_THRESHOLD_MS = Number(
  import.meta.env.VITE_SESSION_ACTIVE_THRESHOLD_MS ?? 10000,
);
```

---

## Activity State Derivation

The gateway does not provide a simple `working` / `idle` field. The dashboard derives a main state from session data on every poll.

### Current mapping

```ts
type MainState = "working" | "idle";
```

**An agent is `working` if:**

- Any session whose `key` starts with `agent:<agentId>:` has `status === "active"`, OR
- Any user-facing session for that agent has `updatedAt` within `VITE_SESSION_ACTIVE_THRESHOLD_MS` of now.

**A user-facing session is currently one of:**

- Telegram traffic (`channel`, `lastChannel`, or `origin.surface` is `telegram`)
- Another direct session with a non-heartbeat provider

```ts
function isUserFacingSession(session: SessionSummary): boolean {
  if (session.origin?.provider === "heartbeat") return false;
  if (session.displayName === "heartbeat") return false;

  const channel =
    session.channel ?? session.lastChannel ?? session.origin?.surface;
  if (channel === "telegram") return true;

  const chatType = session.chatType ?? session.origin?.chatType;
  return chatType === "direct" && !!session.origin?.provider;
}
```

All non-working results collapse directly to `idle`. Idle sub-states such as sleeping or wandering are still handled by the local `CharacterStateMachine`, not by the gateway integration.

---

## Agent ID Mapping

The gateway uses functional agent IDs (`"main"`, `"developer"`, `"news-crawler"`) that differ from the dashboard's display aliases (`"natsuki"`, `"izumi"`, `"utage"`). A registry maps between them:

```ts
// src/content/agentRegistry.ts
interface AgentProfile {
  gatewayId: string; // as reported by agents.list
  dashboardId: string; // short internal alias
  roomId: string; // which room the agent lives in
  color: string; // hex token color on the map
  displayName: string; // fallback if agent.identity.get fails
}

const AGENT_REGISTRY: AgentProfile[] = [
  {
    gatewayId: "main",
    dashboardId: "natsuki",
    roomId: "natsuki-room",
    color: "#f6c177",
    displayName: "Natsuki",
  },
  {
    gatewayId: "agent-resource-manager",
    dashboardId: "fujita",
    roomId: "fujita-room",
    color: "#ff9e64",
    displayName: "Fujita",
  },
  {
    gatewayId: "developer",
    dashboardId: "izumi",
    roomId: "izumi-room",
    color: "#7dcfff",
    displayName: "Izumi",
  },
  {
    gatewayId: "art-director",
    dashboardId: "asuka",
    roomId: "asuka-room",
    color: "#f9a8d4",
    displayName: "Asuka",
  },
  {
    gatewayId: "pixel-dashboard-art-director",
    dashboardId: "yuina",
    roomId: "yuina-room",
    color: "#7dd3fc",
    displayName: "Yuina",
  },
  {
    gatewayId: "researcher",
    dashboardId: "rintaro",
    roomId: "rintaro-room",
    color: "#d4bfff",
    displayName: "Rintaro",
  },
  {
    gatewayId: "news-crawler",
    dashboardId: "utage",
    roomId: "utage-room",
    color: "#ff7ab6",
    displayName: "Utage",
  },
  {
    gatewayId: "social-media-post-writer",
    dashboardId: "tamon",
    roomId: "tamon-room",
    color: "#ef4444",
    displayName: "Tamon",
  },
  {
    gatewayId: "youtube-script-writer",
    dashboardId: "ouri",
    roomId: "ouri-room",
    color: "#8be9fd",
    displayName: "Ouri",
  },
  {
    gatewayId: "seo-expert",
    dashboardId: "keito",
    roomId: "keito-room",
    color: "#b7ff70",
    displayName: "Keito",
  },
];
```

---

## Shared Files API

The local Express server also exposes shared-file routes rooted at `SHARED_ROOT` (default `<OPENCLAW_HOME>/shared`).

### `GET /api/files?path=<subpath>`

Returns a directory listing.

**Response:**

```json
{
  "entries": [
    { "name": "projects", "isDir": true, "size": 0, "mtime": 1776000000000 },
    { "name": "notes.md", "isDir": false, "size": 4096, "mtime": 1776001000000 }
  ]
}
```

Entries are sorted: directories first, then files, both alphabetical.

### `GET /api/file?path=<subpath>`

Streams a file with the correct `Content-Type` header. Used for images, audio, video, PDF, markdown, and other preview types.

**Security:** Both routes resolve the subpath within `SHARED_ROOT` and reject any path that would escape it (path-traversal protection).

---

## Standalone Probe Script

`app/scripts/probe-gateway.mjs` connects to the gateway without the Vite layer and prints the full snapshot as JSON. Useful for debugging the gateway directly:

```bash
node scripts/probe-gateway.mjs
# Optional env overrides:
OPENCLAW_GATEWAY_TOKEN=<token> \
OPENCLAW_GATEWAY_ORIGIN=http://127.0.0.1:18789 \
OPENCLAW_GATEWAY_WS=ws://127.0.0.1:18789 \
  node scripts/probe-gateway.mjs
```

---

## Complete Sample Gateway Response

This is an actual captured response from the live gateway running `probe-gateway.mjs`:

```json
{
  "hello": {
    "type": "hello-ok",
    "protocol": 3,
    "server": {
      "version": "2026.4.8",
      "connId": "b0380c3e-8a36-4443-9798-58fc48d0487f"
    },
    "features": {
      "methods": [
        "health",
        "agents.list",
        "agents.create",
        "agents.update",
        "agents.delete",
        "sessions.list",
        "sessions.create",
        "sessions.send",
        "sessions.abort",
        "sessions.delete",
        "sessions.reset",
        "sessions.compact",
        "agent.identity.get",
        "system-presence",
        "config.get",
        "config.set",
        "models.list",
        "tools.catalog",
        "cron.list",
        "cron.add",
        "cron.remove"
      ],
      "events": [
        "connect.challenge",
        "agent",
        "chat",
        "session.message",
        "session.tool",
        "sessions.changed",
        "presence",
        "tick",
        "shutdown",
        "health",
        "heartbeat"
      ]
    },
    "snapshot": {
      "presence": [
        {
          "host": "bot-network",
          "ip": "10.0.0.239",
          "version": "2026.4.8",
          "platform": "linux 6.17.0-1007-oracle",
          "mode": "gateway",
          "reason": "self",
          "ts": 1776674724678
        }
      ],
      "uptimeMs": 949146405,
      "updateAvailable": {
        "currentVersion": "2026.4.8",
        "latestVersion": "2026.4.15",
        "channel": "latest"
      }
    },
    "policy": {
      "maxPayload": 26214400,
      "maxBufferedBytes": 52428800,
      "tickIntervalMs": 30000
    }
  },
  "agents": {
    "defaultId": "main",
    "agents": [
      {
        "id": "main",
        "workspace": "/home/ubuntu/.openclaw/workspace",
        "model": { "primary": "github-copilot/gpt-5.4" }
      },
      {
        "id": "developer",
        "workspace": "/home/ubuntu/.openclaw/agents/developer",
        "model": { "primary": "github-copilot/gpt-5.4" }
      },
      {
        "id": "agent-resource-manager",
        "workspace": "/home/ubuntu/.openclaw/agents/agent-resource-manager",
        "model": { "primary": "github-copilot/gpt-5.4" }
      },
      {
        "id": "news-crawler",
        "workspace": "/home/ubuntu/.openclaw/agents/news-crawler",
        "model": { "primary": "github-copilot/gpt-5.4" }
      },
      {
        "id": "social-media-post-writer",
        "workspace": "/home/ubuntu/.openclaw/agents/social-media-post-writer",
        "model": { "primary": "github-copilot/gemini-3-flash" }
      },
      {
        "id": "youtube-script-writer",
        "workspace": "/home/ubuntu/.openclaw/agents/youtube-script-writer",
        "model": { "primary": "github-copilot/claude-sonnet-4.6" }
      },
      {
        "id": "seo-expert",
        "workspace": "/home/ubuntu/.openclaw/agents/seo-expert",
        "model": { "primary": "github-copilot/gemini-3-flash" }
      },
      {
        "id": "researcher",
        "workspace": "/home/ubuntu/.openclaw/agents/researcher",
        "model": { "primary": "github-copilot/claude-sonnet-4.6" }
      },
      {
        "id": "art-director",
        "workspace": "/home/ubuntu/.openclaw/agents/art-director",
        "model": { "primary": "github-copilot/gpt-5.4" }
      },
      {
        "id": "pixel-dashboard-art-director",
        "workspace": "/home/ubuntu/.openclaw/agents/pixel-dashboard-art-director",
        "model": { "primary": "github-copilot/gpt-5.4" }
      }
    ]
  },
  "sessions": {
    "count": 5,
    "sessions": [
      {
        "key": "agent:main:main",
        "kind": "direct",
        "displayName": "heartbeat",
        "updatedAt": 1776674559066,
        "sessionId": "008d2b3a-b270-4046-9d1f-8f9483a752e8",
        "status": "done",
        "startedAt": 1776674531549,
        "endedAt": 1776674559006,
        "runtimeMs": 27457,
        "inputTokens": 163011,
        "outputTokens": 81,
        "model": "gpt-5.4"
      },
      {
        "key": "agent:news-crawler:cron:7ce4006d-4d59-4db0-a872-4f97d16ff511",
        "kind": "direct",
        "label": "Cron: Utage daily news digest",
        "updatedAt": 1776650400014,
        "sessionId": "d6fd0140-7dd5-4bbb-9cfc-759a3c0eecb0",
        "inputTokens": 62542,
        "outputTokens": 5926,
        "model": "gpt-5.4"
      },
      {
        "key": "agent:agent-resource-manager:cron:c8c1f882-e232-4ea1-a5d5-2969954140bf",
        "kind": "direct",
        "label": "Cron: Fujita daily agent enhancement",
        "updatedAt": 1776628800016,
        "sessionId": "2f94cd11-eaaa-4a08-b41a-092e3c9e0043",
        "inputTokens": 32101,
        "outputTokens": 3859,
        "model": "gpt-5.4"
      }
    ]
  },
  "presence": [
    {
      "host": "bot-network",
      "ip": "10.0.0.239",
      "version": "2026.4.8",
      "platform": "linux 6.17.0-1007-oracle",
      "mode": "gateway",
      "reason": "self",
      "ts": 1776674724731
    }
  ],
  "identities": {
    "main": {
      "agentId": "main",
      "name": "Natsuki",
      "avatar": "🎀",
      "emoji": "🎀"
    },
    "agent-resource-manager": {
      "agentId": "agent-resource-manager",
      "name": "藤田 / Fujita",
      "avatar": "📋",
      "emoji": "📋"
    },
    "art-director": {
      "agentId": "art-director",
      "name": "飛鳥 / Asuka",
      "avatar": "🎨",
      "emoji": "🎨"
    },
    "developer": {
      "agentId": "developer",
      "name": "泉 / Izumi",
      "avatar": "/avatar/developer",
      "emoji": "🛠️"
    },
    "news-crawler": {
      "agentId": "news-crawler",
      "name": "歌夏 / Utage",
      "avatar": "/avatar/news-crawler",
      "emoji": "🪭"
    },
    "pixel-dashboard-art-director": {
      "agentId": "pixel-dashboard-art-director",
      "name": "結菜 / Yuina",
      "avatar": "🖼️",
      "emoji": "🖼️"
    },
    "researcher": {
      "agentId": "researcher",
      "name": "倫太郎 / Rintaro",
      "avatar": "/avatar/researcher",
      "emoji": "💪🏻"
    },
    "seo-expert": {
      "agentId": "seo-expert",
      "name": "敬人 / Keito",
      "avatar": "/avatar/seo-expert",
      "emoji": "💰"
    },
    "social-media-post-writer": {
      "agentId": "social-media-post-writer",
      "name": "多聞 / Tamon",
      "avatar": "/avatar/social-media-post-writer",
      "emoji": "✨"
    },
    "youtube-script-writer": {
      "agentId": "youtube-script-writer",
      "name": "櫻利 / Ouri",
      "avatar": "/avatar/youtube-script-writer",
      "emoji": "👑"
    }
  }
}
```

---

## Error Handling

| Scenario                               | Behaviour                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway unreachable                    | `ws.onerror` fires → `GET /api/openclaw/snapshot` returns `500 { error: "Gateway websocket error" }` → `connected: false`, `error` shown in TopBar |
| Auth failure                           | `connect` response has `ok: false` → same 500 path → `connected: false`                                                                            |
| `system-presence` not permitted        | `.catch(() => [])` → `presence: []`, rest of snapshot still succeeds                                                                               |
| `agent.identity.get` failure per-agent | Caught individually → `identities[agentId] = { error: "..." }` → dashboard falls back to `displayName` from registry                               |
| Timeout (15 s)                         | `setTimeout` fires → reject + close → 500                                                                                                          |

---

## Available Gateway Methods (full list from hello response)

The `hello-ok` payload includes the complete list of available methods and events. Below are the ones most relevant to a dashboard use case:

**Agent management:**
`agents.list`, `agents.create`, `agents.update`, `agents.delete`, `agents.files.list`, `agents.files.get`, `agents.files.set`, `agent.identity.get`, `agent.wait`

**Session management:**
`sessions.list`, `sessions.create`, `sessions.send`, `sessions.abort`, `sessions.patch`, `sessions.reset`, `sessions.delete`, `sessions.compact`, `sessions.subscribe`, `sessions.messages.subscribe`

**System / status:**
`health`, `status`, `usage.status`, `usage.cost`, `system-presence`, `gateway.identity.get`, `config.get`, `models.list`, `tools.catalog`, `last-heartbeat`

**Cron:**
`cron.list`, `cron.status`, `cron.add`, `cron.update`, `cron.remove`, `cron.run`, `cron.runs`

**Available events pushed by gateway:**
`connect.challenge`, `agent`, `chat`, `session.message`, `session.tool`, `sessions.changed`, `presence`, `tick`, `shutdown`, `health`, `heartbeat`, `update.available`

---

## Implementation Checklist for a New Project

1. **Read gateway config** from `<OPENCLAW_HOME>/openclaw.json` → `gateway.port` + `gateway.auth.token`.
2. **Open WebSocket** to `ws://127.0.0.1:<port>` with `Origin: http://127.0.0.1:<port>`.
3. **Wait for** `{ type: 'event', event: 'connect.challenge' }`.
4. **Send** `connect` request with `minProtocol: 3`, `maxProtocol: 3`, `role: 'operator'`, `scopes: ['operator.read']`.
5. **Check** `connect` response: abort on `ok: false`.
6. **Fire in parallel:** `agents.list`, `sessions.list`, `system-presence` (with `.catch`).
7. **For each agent id** returned by `agents.list`: call `agent.identity.get` (with `.catch`).
8. **Close the socket.**
9. **Derive activity state** from session `status` and `updatedAt` timestamps.
10. **Poll every 20 s.** Keep a `nonActiveStates` map across polls; apply 1.5% drift on each tick.
11. **Surface `connected: false`** to the UI whenever the snapshot fetch throws.
