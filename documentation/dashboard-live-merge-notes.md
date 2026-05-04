# Dashboard Live Merge Notes

## Purpose

This document is the practical developer handoff for integrating the workflow model into the dashboard **without breaking the existing live integration**.

Read this together with:

- Workflow interpretation spec:
  - `this file`
- Workflow schema scaffold:
  - `documentation/workflow/schema.sql`
- Existing dashboard live Gateway reference:
  - `documentation/openclaw-dashboard-integration.md`

This document is intentionally implementation-oriented.

---

## Non-Negotiable Rule

The existing dashboard live path must remain the source of truth for:

- live / connected indicator
- Gateway reachability
- current OpenClaw transport health
- session-derived baseline activity already implemented in the dashboard

The workflow layer must be added as an **enrichment layer**.
It must **not** replace the current live transport path.

If the workflow layer is missing, empty, stale, or failing, the dashboard should still behave as live if the Gateway live path is healthy.

---

## Exact File Paths

## Dashboard repo root

- `/home/ubuntu/openclaw-character-dashboard`

## Existing dashboard files that matter

### Server-side live Gateway path

- `/home/ubuntu/openclaw-character-dashboard/server/index.ts`
  - current Express server
  - currently exposes the dashboard's live OpenClaw snapshot endpoint

- `/home/ubuntu/openclaw-character-dashboard/server/ws.d.ts`
  - local WebSocket typings/support file already in repo

### Frontend live data path

- `/home/ubuntu/openclaw-character-dashboard/src/data/live.ts`
  - current frontend live fetch path
  - this is the key place where workflow enrichment should be merged into existing live data

- `/home/ubuntu/openclaw-character-dashboard/src/store/worldStore.ts`
  - app/world state store
  - likely the right place to hold merged live + workflow-enriched state

- `/home/ubuntu/openclaw-character-dashboard/src/components/InspectorPanel.tsx`
  - useful for debug fields such as foreground task, wait reason, source, freshness

### Character state / animation path

- `/home/ubuntu/openclaw-character-dashboard/src/game/objects/CharacterStateMachine.ts`
  - current mapping between logical state and sprite/animation behavior

- `/home/ubuntu/openclaw-character-dashboard/src/store/characterStore.ts`
- `/home/ubuntu/openclaw-character-dashboard/src/game/scenes/WorldScene.ts`
- `/home/ubuntu/openclaw-character-dashboard/src/game/objects/CharacterSprite.ts`

### Existing live integration documentation

- `/home/ubuntu/openclaw-character-dashboard/documentation/openclaw-dashboard-integration.md`

---

## OpenClaw / Workflow File Paths

## OpenClaw config and live Gateway

- OpenClaw config:
  - `/home/ubuntu/.openclaw/openclaw.json`
- Gateway default:
  - `ws://127.0.0.1:18789`
  - `http://127.0.0.1:18789`

## Workflow docs and schema

- Workflow interpretation spec:
  - `/home/ubuntu/.openclaw/workspace/dashboard-workflow-integration.md`
- Workflow schema scaffold:
  - `/home/ubuntu/.openclaw/workspace/workflow/schema.sql`

## Intended workflow database path

Recommended default path:

- `/home/ubuntu/.openclaw/workspace/workflow/workflow.sqlite`

Important:
- this DB may not exist yet
- even if it exists, it may be empty
- the dashboard must not treat that as a live failure

---

## What Already Exists vs What Needs to Be Added

## Already exists

The dashboard already has a live data path based on OpenClaw Gateway.
From the current repo documentation, it works like this:

1. frontend polls a local Express endpoint
2. server opens a short-lived WebSocket connection to Gateway
3. server performs Gateway handshake
4. server returns a JSON snapshot
5. frontend uses that to drive current live state

That live path should remain intact.

## Needs to be added

A separate workflow enrichment layer that:

- reads workflow state from SQLite
- resolves foreground task per agent
- derives better workflow display states (`waiting_tool`, `waiting_human`, `blocked`, etc.)
- exposes artifacts/output attribution
- merges onto the existing live model without replacing it

---

## Recommended Integration Architecture

Use a two-source merge model.

```text
Frontend
  ├─ existing live snapshot (Gateway-backed)
  └─ workflow enrichment snapshot (SQLite-backed, optional)

Merged display model
  ├─ live indicator / connectivity -> from live snapshot
  ├─ baseline agent/session liveness -> from live snapshot
  ├─ foreground task / wait reason / workflow state -> from workflow enrichment
  └─ recent artifacts / workflow debug info -> from workflow enrichment
```

### Safe ownership split

## Existing live snapshot owns

- `isLive`
- connection health
- gateway errors
- transport freshness
- currently-working baseline if workflow data is absent
- any existing session/resource-wall behaviors already implemented

## Workflow enrichment owns

- `foregroundTask`
- `workflowDisplayState`
- `waitReason`
- `taskKind`
- `taskState`
- `resolution.taskSource`
- `resolution.stalePresence`
- recent task artifacts

---

## Recommended Server-Side Change

Do **not** replace the existing live endpoint.

### Keep existing route

Keep the current route in:

- `/home/ubuntu/openclaw-character-dashboard/server/index.ts`

Specifically, preserve the route that currently powers:

- `GET /api/openclaw/snapshot`

### Add a second route

Add a separate optional route, for example:

- `GET /api/openclaw/workflow`

This route should:

1. check whether workflow DB exists
2. if missing, return a **non-fatal** payload
3. if present, load workflow views/tables
4. resolve per-agent foreground tasks using the spec
5. return enrichment-only data

### Important behavior for `GET /api/openclaw/workflow`

If the DB does not exist, return something like:

```json
{
  "available": false,
  "reason": "workflow-db-missing",
  "dbPath": "/home/ubuntu/.openclaw/workspace/workflow/workflow.sqlite",
  "agents": [],
  "activeTasks": [],
  "recentArtifacts": []
}
```

If the DB exists but is empty:

```json
{
  "available": true,
  "empty": true,
  "dbPath": "/home/ubuntu/.openclaw/workspace/workflow/workflow.sqlite",
  "agents": [],
  "activeTasks": [],
  "recentArtifacts": []
}
```

That response should **not** cause the app to go offline.

---

## Recommended Frontend Merge Point

The main merge point should be:

- `/home/ubuntu/openclaw-character-dashboard/src/data/live.ts`

### Why

That file is already the live-data entry point.
It is the cleanest place to:

1. fetch existing live snapshot
2. fetch workflow enrichment snapshot
3. merge them into one normalized frontend payload
4. preserve old behavior if workflow is unavailable

### Recommended fetch strategy

1. fetch existing live snapshot first
2. try to fetch workflow enrichment second
3. if workflow enrichment fails:
   - keep live snapshot result
   - attach a soft error/debug flag only
   - do not fail the whole request path

Pseudo-flow:

```ts
const live = await fetchOpenClawSnapshot();
let workflow = null;

try {
  workflow = await fetchWorkflowSnapshot();
} catch {
  workflow = null;
}

return mergeLiveAndWorkflow(live, workflow);
```

---

## Recommended Store Merge Point

Merged result should flow into:

- `/home/ubuntu/openclaw-character-dashboard/src/store/worldStore.ts`

Suggested approach:

- keep existing live state fields intact
- add workflow fields as optional enrichment
- compute display-ready values from merged state

Suggested per-agent shape:

```ts
{
  id: string,
  liveState: {
    isActive: boolean,
    lastSeenAt?: string,
    sessionActivity?: unknown
  },
  workflow: {
    available: boolean,
    displayState?: 'idle' | 'dispatching' | 'working' | 'waiting_tool' | 'waiting_human' | 'blocked' | 'delivering' | 'offline' | 'error',
    foregroundTask?: {
      id: string,
      title?: string,
      kind?: string,
      state?: string,
      waitReason?: string | null
    },
    resolution?: {
      taskSource?: 'presence' | 'fallback' | 'none',
      stalePresence?: boolean
    },
    presenceFreshness?: 'fresh' | 'aging' | 'stale' | 'offlineCandidate'
  }
}
```

---

## Current Working/Idle Mapping vs Workflow Mapping

The dashboard currently has a simpler live model.
Do not delete that.

Instead:

## If workflow data is unavailable

Use current behavior exactly as-is.

## If workflow data is available

Use workflow display state as an overlay:

- `working`
- `dispatching`
- `waiting_tool`
- `waiting_human`
- `blocked`
- `delivering`
- `idle`
- `offline`
- `error`

### Current animation-safe mapping

If the Phaser state machine does not yet support all of those, map safely for now:

- `working`, `dispatching`, `waiting_tool`, `waiting_human`, `blocked`, `delivering` -> current `working` animation
- `idle`, `offline`, `error` -> current `idle` animation

That gives richer logic without forcing immediate animation refactors.

The likely file for this mapping is:

- `/home/ubuntu/openclaw-character-dashboard/src/game/objects/CharacterStateMachine.ts`

---

## Exact Merge Rules

## Rule 1 — preserve live indicator

The app's global live indicator must continue to come from the existing Gateway live path.

Workflow data must never be allowed to turn the live indicator red by itself.

## Rule 2 — workflow augments agent interpretation

Workflow data may override only workflow-specific interpretation such as:

- current foreground task
- waiting/blocked state
- clearer task-specific display state

## Rule 3 — fallback to live model when workflow is absent

If workflow payload is:
- missing
- unavailable
- empty
- failed

then continue using the current live model.

## Rule 4 — do not infer working from session alone when workflow data is available

When workflow data exists and is populated, use it for foreground-task interpretation instead of guessing from sessions.

## Rule 5 — missing workflow data is a soft failure

Workflow unavailability should be treated like:
- enrichment unavailable
- not like dashboard offline

---

## Workflow Resolver Rules

Implement these exactly as defined in:

- `/home/ubuntu/.openclaw/workspace/dashboard-workflow-integration.md`

### Resolver summary

1. prefer `agent_presence.current_task_id`
2. validate referenced task is non-terminal
3. if stale/missing, fallback to active-task selection
4. choose one foreground task per agent by:
   - state precedence
   - priority desc
   - updated_at desc
   - created_at desc

### State precedence

1. `running`
2. `waiting_human`
3. `waiting_tool`
4. `blocked`
5. `dispatching`
6. `assigned`
7. `queued`
8. `draft`

### Terminal states

- `completed`
- `failed`
- `cancelled`
- `timed_out`

### Derived agent display states

- task `running` -> agent `working`
- task `waiting_tool` -> agent `waiting_tool`
- task `waiting_human` -> agent `waiting_human`
- task `blocked` -> agent `blocked`
- task `dispatching` or `assigned` -> agent `dispatching`
- task `queued` or `draft` -> usually `idle`
- no active task -> `idle`

---

## Recommended Backend Query Set

These queries are already defined conceptually in:

- `/home/ubuntu/.openclaw/workspace/dashboard-workflow-integration.md`

Minimum useful reads:

1. `dashboard_agent_state`
2. `active_tasks`
3. recent `task_artifacts`
4. optional recent `task_events` for detail views

### Schema source

Use:

- `/home/ubuntu/.openclaw/workspace/workflow/schema.sql`

### DB path

Default to:

- `/home/ubuntu/.openclaw/workspace/workflow/workflow.sqlite`

But make the server route configurable if desired.

---

## Recommended Implementation Steps

These steps are meant to be followed in order.

## Step 1 — preserve current live path

Verify the current live flow still works using:

- `/home/ubuntu/openclaw-character-dashboard/server/index.ts`
- `/home/ubuntu/openclaw-character-dashboard/src/data/live.ts`

Do not change the semantics of the existing live indicator first.

## Step 2 — add separate workflow server route

In:
- `/home/ubuntu/openclaw-character-dashboard/server/index.ts`

Add a second endpoint for workflow enrichment only.
Do not alter `GET /api/openclaw/snapshot` behavior.

## Step 3 — implement workflow DB reader/resolver

Suggested new server file(s):

- `/home/ubuntu/openclaw-character-dashboard/server/workflow.ts`
- `/home/ubuntu/openclaw-character-dashboard/server/workflow-resolver.ts`

These are suggested filenames, not requirements.

Responsibilities:
- open SQLite
- load workflow data
- resolve foreground task per agent
- return enrichment payload only

## Step 4 — merge in frontend live loader

In:
- `/home/ubuntu/openclaw-character-dashboard/src/data/live.ts`

Add the second fetch and merge logic.
If workflow fails, continue with the live snapshot.

## Step 5 — expose optional debug info

Useful places:
- `/home/ubuntu/openclaw-character-dashboard/src/components/InspectorPanel.tsx`

Show optional fields such as:
- workflow display state
- foreground task title
- task kind
- task state
- wait reason
- resolution source
- presence freshness

## Step 6 — keep animation mapping conservative first

In:
- `/home/ubuntu/openclaw-character-dashboard/src/game/objects/CharacterStateMachine.ts`

Map richer workflow states onto existing animations first.
Do not block integration on new sprite/animation work.

---

## Failure Handling Checklist

## If Gateway live snapshot fails

- the app may show live disconnected / red
- this is a real live failure

## If workflow route fails but Gateway is healthy

- keep live indicator green
- keep baseline live behavior working
- optionally show workflow unavailable in debug panel only

## If workflow DB is missing

- same as above
- treat as enrichment unavailable

## If workflow DB is empty

- same as above
- treat as enrichment empty, not broken

---

## Recommended Test Checklist

## Must pass

1. Existing live indicator still turns green when Gateway path is healthy
2. Existing live indicator still turns red only when Gateway path actually fails
3. With workflow DB missing, dashboard still behaves live
4. With workflow DB empty, dashboard still behaves live
5. With workflow DB populated, foreground task / wait reason appear correctly
6. With workflow DB populated, waiting/blocked states are reflected in inspector/debug UI
7. Existing resource wall / file browser behavior is unchanged

## Good extra checks

8. If workflow route errors once, next successful live poll still renders normally
9. If workflow data conflicts with stale session-derived activity, workflow task interpretation wins for the agent card/inspector, but global live status stays correct
10. Terminal tasks never remain active foreground tasks

---

## Suggested API Shapes

## Existing live endpoint

Keep as-is:

- `GET /api/openclaw/snapshot`

## New workflow endpoint

Suggested:

- `GET /api/openclaw/workflow`

Suggested response:

```json
{
  "available": true,
  "empty": false,
  "dbPath": "/home/ubuntu/.openclaw/workspace/workflow/workflow.sqlite",
  "agents": [
    {
      "agentId": "researcher",
      "displayState": "working",
      "foregroundTask": {
        "id": "task_123",
        "title": "Compare workflow options",
        "kind": "research",
        "state": "running",
        "waitReason": null
      },
      "resolution": {
        "taskSource": "presence",
        "stalePresence": false
      },
      "presenceFreshness": "fresh"
    }
  ],
  "activeTasks": [],
  "recentArtifacts": []
}
```

---

## Short Version for Developers

If you only remember a few things, remember these:

1. **Do not replace the current live/Gateway path**
2. **Add workflow as a second optional data source**
3. **Merge in `src/data/live.ts`**
4. **Keep global live indicator owned by the existing live path**
5. **Use workflow only for foreground-task interpretation and artifacts**
6. **Missing workflow data must be a soft failure**
7. **Use the exact file paths in this doc when patching**
