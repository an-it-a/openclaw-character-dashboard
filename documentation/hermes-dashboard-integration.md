# Hermes Integration for OpenClaw Character Dashboard

This document explains how to change your existing dashboard so it retrieves:

1. **agent status from Hermes Agent itself**
2. **kanban data and actions** covering the Hermes dashboard Kanban tab

It is grounded in the current code in:

- Dashboard repo: `/home/ubuntu/openclaw-character-dashboard`
- Hermes repo: `/home/ubuntu/.hermes/hermes-agent`

---

## Executive summary

## Agent status — what to change
If you want the dashboard to get agent status from **Hermes** instead of the current OpenClaw workflow path, the recommended design is:

- use Hermes `GET /api/profiles` to discover all agents/profiles
- for each profile, read that profile's `state.db`
- derive `working` / `idle` from that profile's surfaced sessions
- expose one local dashboard route such as:
  - `GET /api/hermes/agents/status`

### Why this is needed
Hermes gives you these useful primitives:
- `GET /api/profiles`
- `GET /api/status`
- `GET /api/sessions`

But there is an important limitation:
- `GET /api/sessions` only reads the **current profile's** `state.db`
- Hermes profiles are isolated by `HERMES_HOME`
- each profile has its own `state.db`, sessions, memory, skills, logs, cron jobs

So a **single** Hermes dashboard instance does **not** directly give you one built-in endpoint for "all agents across all profiles with status".

That means the correct integration is a small **server-side aggregator** in your dashboard.

## Kanban
For Hermes Kanban, the real API surface is the dashboard plugin mounted under:

- `/api/plugins/kanban/*`

Those routes are implemented in:

- `/home/ubuntu/.hermes/hermes-agent/plugins/kanban/dashboard/plugin_api.py`

The plugin is mounted by Hermes dashboard here:

- `/home/ubuntu/.hermes/hermes-agent/hermes_cli/web_server.py`

For your dashboard, the recommended pattern is:

- browser talks to your own local Express server
- Express proxies Hermes Kanban routes server-side
- Express injects the Hermes session token server-side
- browser does **not** call Hermes dashboard directly

---

## 1. Hermes-native agent status

## 1.1 What Hermes already exposes

### Profiles
Hermes route:
- `GET /api/profiles`

Source:
- `/home/ubuntu/.hermes/hermes-agent/hermes_cli/web_server.py`

Current payload shape is effectively:

```json
{
  "profiles": [
    {
      "name": "default",
      "path": "/home/ubuntu/.hermes",
      "is_default": true,
      "model": "...",
      "provider": "...",
      "has_env": true,
      "skill_count": 12
    }
  ]
}
```

This is the right source for:
- which Hermes agents/profiles exist
- each profile's filesystem path
- model/provider metadata for dashboard display

### Sessions
Hermes route:
- `GET /api/sessions`

Source:
- `/home/ubuntu/.hermes/hermes-agent/hermes_cli/web_server.py`
- `/home/ubuntu/.hermes/hermes-agent/hermes_state.py`

This route returns rich session rows and marks each row with:
- `is_active`

Hermes computes `is_active` as:
- `ended_at is null`
- and `now - last_active < 300`

### Global Hermes status
Hermes route:
- `GET /api/status`

This is useful for:
- Hermes version
- gateway health
- active session count for the **current profile/server context**
- global health badge

This is **not** enough for per-agent status across all Hermes profiles.

---

## 1.2 Important architecture constraint

Hermes profile isolation matters here.

Relevant facts from Hermes code/docs:
- each profile has its own Hermes home
- each profile has its own `state.db`
- default profile DB:
  - `/home/ubuntu/.hermes/state.db`
- named profile DB:
  - `/home/ubuntu/.hermes/profiles/<profile-name>/state.db`
- `SessionDB()` resolves `state.db` from `get_hermes_home()`
- `get_hermes_home()` is driven by `HERMES_HOME`

So if your dashboard is talking to one Hermes dashboard server process, its `/api/sessions` endpoint only sees the `state.db` for **that process's active profile**.

That is why the agent-status integration should not be documented as:
- "call one Hermes endpoint and get all agent states"

Because today, that endpoint does not exist.

---

## 1.3 Recommended design for Hermes agent status

Add a local dashboard route such as:

- `GET /api/hermes/agents/status`

This route should do:

1. call Hermes `GET /api/profiles`
2. for each returned profile, determine the correct `state.db`
3. query that `state.db`
4. derive `working` / `idle`
5. return one row per Hermes agent/profile

### Recommended source hierarchy

For each profile:

1. **profile metadata** from `GET /api/profiles`
2. **activity state** from that profile's `state.db`
3. optional display metadata from:
   - `GET /api/profiles/{name}/soul`
   - your own roster mapping / nickname mapping

---

## 1.4 How to derive `working` / `idle`

### Minimum useful rule
Mark a Hermes agent/profile as:

- **`working`** if it has at least one surfaced active session
- **`idle`** otherwise

### Hermes-aligned activity rule
Hermes itself uses this general rule for session activity:

- `ended_at IS NULL`
- and `now - last_active < 300 seconds`

So for your dashboard, use the same threshold first.

### Why 300 seconds
That is what Hermes web server currently uses for `is_active` in `/api/sessions`.

---

## 1.5 Important filtering rule: ignore child/subagent sessions

If you query `state.db` directly, do **not** blindly use every row in `sessions`.

Hermes `list_sessions_rich(include_children=False)` intentionally filters out:
- sub-agent runs
- compression continuations

and surfaces:
- root sessions
- branch sessions

So your aggregator should mimic that behavior.

### Hermes-aligned surfaced-session filter
Use this SQL predicate:

```sql
(
  s.parent_session_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM sessions p
    WHERE p.id = s.parent_session_id
      AND p.end_reason = 'branched'
      AND s.started_at >= p.ended_at
  )
)
```

That keeps the dashboard focused on visible/main sessions rather than internal noise.

---

## 1.6 Recommended SQL for per-profile status

For each profile's `state.db`, a practical query is:

```sql
SELECT
  s.id,
  s.source,
  s.model,
  s.title,
  s.started_at,
  s.ended_at,
  s.end_reason,
  s.message_count,
  COALESCE(
    (SELECT MAX(m.timestamp) FROM messages m WHERE m.session_id = s.id),
    s.started_at
  ) AS last_active
FROM sessions s
WHERE (
  s.parent_session_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM sessions p
    WHERE p.id = s.parent_session_id
      AND p.end_reason = 'branched'
      AND s.started_at >= p.ended_at
  )
)
ORDER BY last_active DESC, s.started_at DESC;
```

Then in your server code:

```ts
const ACTIVE_WINDOW_MS = 300_000;
const isActive = row.ended_at == null && nowMs - row.last_active * 1000 < ACTIVE_WINDOW_MS;
const mainState = isActive ? "working" : "idle";
```

### Recommended per-profile reduction
From the query results for one profile:
- pick the newest surfaced session as `latestSession`
- if **any** surfaced session is active → `working`
- else → `idle`

This avoids missing an active thread when the most recent row is slightly stale.

---

## 1.7 Recommended response shape for your dashboard

Suggested local route response:

```json
{
  "agents": [
    {
      "profile": "researcher",
      "displayName": "Kai",
      "path": "/home/ubuntu/.hermes/profiles/researcher",
      "provider": "copilot",
      "model": "gpt-5.4",
      "status": "working",
      "reason": "active_session",
      "latestSession": {
        "id": "20260514_012300_xxx",
        "source": "telegram",
        "title": "research latest AI news",
        "started_at": 1715620000,
        "ended_at": null,
        "last_active": 1715620200,
        "is_active": true
      }
    }
  ],
  "generatedAt": 1715620205
}
```

Recommended fields:
- `profile`
- `displayName`
- `path`
- `provider`
- `model`
- `status`
- `reason`
- `latestSession`

Possible `reason` values:
- `active_session`
- `no_active_session`
- `no_state_db`
- `db_error`

---

## 1.8 Suggested Express implementation shape

Recommended new server module(s):

- `/home/ubuntu/openclaw-character-dashboard/server/hermes.ts`
- `/home/ubuntu/openclaw-character-dashboard/server/hermes-status.ts`

### Responsibilities of `hermes-status.ts`
- call Hermes `GET /api/profiles`
- derive per-profile `state.db` path
- open SQLite readonly
- run surfaced-session query
- compute `working` / `idle`
- return normalized dashboard payload

### Recommended local route
- `GET /api/hermes/agents/status`

---

## 1.9 Suggested path derivation

From `GET /api/profiles`, Hermes already returns `path`.

So the safest rule is:
- use the returned profile `path`
- append `/state.db`

Examples:
- `default` → `/home/ubuntu/.hermes/state.db`
- `researcher` → `/home/ubuntu/.hermes/profiles/researcher/state.db`
- `news-crawler` → `/home/ubuntu/.hermes/profiles/news-crawler/state.db`

This is better than hardcoding assumptions in the dashboard.

---

## 1.10 Optional richer statuses

If you only need minimum parity, stop at:
- `working`
- `idle`

If you want richer Hermes-native states later, you can derive:
- `working`
- `idle`
- `error`
- `offline`
- `starting`

Suggested heuristics:
- `error`: profile exists but `state.db` read fails repeatedly
- `offline`: profile exists but no `state.db` yet
- `starting`: recent session row exists but no messages yet and session is still open

But for now, `working` / `idle` is enough and cleaner.

---

## 1.11 What to do with the current OpenClaw status path

Your dashboard currently has:
- `GET /api/openclaw/snapshot`
- `GET /api/openclaw/workflow`
- merge logic in `src/data/live.ts`

If you are switching the dashboard to Hermes-native agent status, then:

### Recommended change
Create a new dedicated Hermes path, for example:
- `GET /api/hermes/agents/status`

And migrate the agent tiles/character state source to that route.

### Recommended frontend split
- OpenClaw live adapter stays separate if still needed for other features
- Hermes agent status becomes its own adapter, for example:
  - `src/data/hermesStatus.ts`

Do **not** mix Hermes profile aggregation logic into the old OpenClaw workflow adapter.

---

## 2. How to retrieve Kanban data

## 2.1 Real backend surface

Hermes Kanban dashboard API is the plugin mounted under:
- `/api/plugins/kanban/`

Implementation:
- `/home/ubuntu/.hermes/hermes-agent/plugins/kanban/dashboard/plugin_api.py`

Mount point:
- `/home/ubuntu/.hermes/hermes-agent/hermes_cli/web_server.py`

This plugin is the correct source for **all functions in the Kanban tab**.

---

## 2.2 Authentication requirements

Current Hermes code shows that non-public `/api/*` routes require the Hermes dashboard session token.

Relevant server details:
- token variable: `_SESSION_TOKEN`
- custom header: `X-Hermes-Session-Token`
- WebSocket auth: `?token=<session-token>` query param

### Recommended integration pattern for your dashboard
Do this:
- browser → your Express server
- Express server → Hermes dashboard plugin routes

Why:
- keeps Hermes session token off the browser app code
- lets you normalize payloads if Hermes changes later
- fits your current local-server architecture

---

## 2.3 Recommended local proxy routes in your dashboard server

Recommended additions in your Express server:

- `GET /api/hermes/kanban/board`
- `GET /api/hermes/kanban/tasks/:id`
- `POST /api/hermes/kanban/tasks`
- `PATCH /api/hermes/kanban/tasks/:id`
- `POST /api/hermes/kanban/tasks/bulk`
- `POST /api/hermes/kanban/tasks/:id/comments`
- `POST /api/hermes/kanban/links`
- `DELETE /api/hermes/kanban/links`
- `GET /api/hermes/kanban/diagnostics`
- `POST /api/hermes/kanban/tasks/:id/reclaim`
- `POST /api/hermes/kanban/tasks/:id/specify`
- `POST /api/hermes/kanban/tasks/:id/reassign`
- `GET /api/hermes/kanban/config`
- `GET /api/hermes/kanban/home-channels`
- `POST /api/hermes/kanban/tasks/:id/home-subscribe/:platform`
- `DELETE /api/hermes/kanban/tasks/:id/home-subscribe/:platform`
- `GET /api/hermes/kanban/stats`
- `GET /api/hermes/kanban/assignees`
- `GET /api/hermes/kanban/tasks/:id/log`
- `POST /api/hermes/kanban/dispatch`
- `GET /api/hermes/kanban/boards`
- `POST /api/hermes/kanban/boards`
- `PATCH /api/hermes/kanban/boards/:slug`
- `DELETE /api/hermes/kanban/boards/:slug`
- `POST /api/hermes/kanban/boards/:slug/switch`
- `WS /api/hermes/kanban/events`

These proxy to Hermes:
- `/api/plugins/kanban/...`

---

## 2.4 Kanban: read endpoints

## Board
**Hermes route**
- `GET /api/plugins/kanban/board`

Query params:
- `tenant`
- `include_archived`
- `board`

Returns:
- `columns: [{ name, tasks[] }]`
- `tenants: string[]`
- `assignees: string[]`
- `latest_event_id: number`
- `now: number`

## Task detail drawer
**Hermes route**
- `GET /api/plugins/kanban/tasks/{task_id}`

Returns:
- `task`
- `comments[]`
- `events[]`
- `links`
- `runs[]`

## Diagnostics
**Hermes route**
- `GET /api/plugins/kanban/diagnostics`

## Config
**Hermes route**
- `GET /api/plugins/kanban/config`

## Home channels
**Hermes route**
- `GET /api/plugins/kanban/home-channels`

## Stats
**Hermes route**
- `GET /api/plugins/kanban/stats`

## Assignees
**Hermes route**
- `GET /api/plugins/kanban/assignees`

## Worker log
**Hermes route**
- `GET /api/plugins/kanban/tasks/{task_id}/log`

## Boards list
**Hermes route**
- `GET /api/plugins/kanban/boards`

---

## 2.5 Kanban: write/mutation endpoints

## Create task
- `POST /api/plugins/kanban/tasks`

## Update task
- `PATCH /api/plugins/kanban/tasks/{task_id}`

Body fields include:
- `status`
- `assignee`
- `priority`
- `title`
- `body`
- `result`
- `block_reason`
- `summary`
- `metadata`

Important rule:
- direct `status: "running"` is rejected
- entering `running` should happen through dispatcher/claim flow

## Bulk update
- `POST /api/plugins/kanban/tasks/bulk`

## Add comment
- `POST /api/plugins/kanban/tasks/{task_id}/comments`

## Add dependency link
- `POST /api/plugins/kanban/links`

## Delete dependency link
- `DELETE /api/plugins/kanban/links?parent_id=...&child_id=...`

## Reclaim running task
- `POST /api/plugins/kanban/tasks/{task_id}/reclaim`

## Specify triage task
- `POST /api/plugins/kanban/tasks/{task_id}/specify`

## Reassign task
- `POST /api/plugins/kanban/tasks/{task_id}/reassign`

## Subscribe task to home channel
- `POST /api/plugins/kanban/tasks/{task_id}/home-subscribe/{platform}`

## Unsubscribe task from home channel
- `DELETE /api/plugins/kanban/tasks/{task_id}/home-subscribe/{platform}`

## Dispatch nudge
- `POST /api/plugins/kanban/dispatch`

## Create board
- `POST /api/plugins/kanban/boards`

## Update board metadata
- `PATCH /api/plugins/kanban/boards/{slug}`

## Delete/archive board
- `DELETE /api/plugins/kanban/boards/{slug}?delete=false`

## Switch board
- `POST /api/plugins/kanban/boards/{slug}/switch`

---

## 2.6 Kanban live updates

**Hermes route**
- `WS /api/plugins/kanban/events`

Query params:
- `token=<session-token>`
- `since=<event_id>`
- `board=<slug>`

Recommended client behavior:
- open WS with `since=latest_event_id`
- when events arrive, refresh board and any open drawer
- keep the client simple; use events mainly as refresh triggers

---

## 3. Recommended implementation plan

## Phase 1 — Hermes-native agent status
Add:
- `server/hermes-status.ts`
- `GET /api/hermes/agents/status`
- `src/data/hermesStatus.ts`

Use:
- Hermes `GET /api/profiles`
- per-profile `state.db` aggregation

## Phase 2 — Hermes Kanban proxy
Add:
- `server/hermes-kanban.ts`
- local `/api/hermes/kanban/*` proxy routes
- `src/data/hermesKanban.ts`

## Phase 3 — frontend migration
Switch agent tiles to use:
- `/api/hermes/agents/status`

Keep Kanban UI on:
- `/api/hermes/kanban/*`

---

## 4. Exact file references

## Your dashboard repo
- `/home/ubuntu/openclaw-character-dashboard/server/index.ts`
- `/home/ubuntu/openclaw-character-dashboard/server/workflow.ts`
- `/home/ubuntu/openclaw-character-dashboard/src/data/live.ts`
- `/home/ubuntu/openclaw-character-dashboard/src/store/worldStore.ts`

## Hermes repo
- `/home/ubuntu/.hermes/hermes-agent/hermes_cli/web_server.py`
- `/home/ubuntu/.hermes/hermes-agent/hermes_state.py`
- `/home/ubuntu/.hermes/hermes-agent/hermes_constants.py`
- `/home/ubuntu/.hermes/hermes-agent/plugins/kanban/dashboard/plugin_api.py`
- `/home/ubuntu/.hermes/hermes-agent/website/docs/user-guide/profiles.md`

---

## Bottom line

If you want the dashboard to get **agent status from Hermes**:

- do **not** document it as the old OpenClaw workflow path
- do **not** pretend `GET /api/status` solves per-agent state
- do **not** pretend one Hermes `/api/sessions` call covers all profiles

Instead:
- call Hermes `GET /api/profiles`
- aggregate each profile's `state.db`
- derive `working` / `idle`
- expose one local dashboard route like:
  - `GET /api/hermes/agents/status`

For Kanban, still use:
- `/api/plugins/kanban/*`

through your own local server-side proxy.