import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type HermesProfile = {
  name: string;
  path: string;
  is_default?: boolean;
  model?: string | null;
  provider?: string | null;
};

export type HermesSessionRow = {
  id: string;
  title: string | null;
  started_at: number;
  ended_at: number | null;
  last_active: number;
  has_messages: boolean;
};

export type HermesAgentStatusState = "working" | "idle" | "offline" | "error";

export type HermesAgentStatus = {
  profile: string;
  path?: string;
  provider?: string | null;
  model?: string | null;
  status: HermesAgentStatusState;
  reason?: string;
  latestSession?: {
    id: string;
    title: string | null;
    started_at: number;
    ended_at: number | null;
    last_active: number;
    is_active: boolean;
  };
};

export type HermesAgentsStatusResponse = {
  agents: HermesAgentStatus[];
  generatedAt: number;
};

const DEFAULT_ACTIVE_WINDOW_MS = 300_000;

export async function fetchHermesAgentsStatus(
  hermesBaseUrl: string,
  sessionToken?: string,
  activeWindowMs = DEFAULT_ACTIVE_WINDOW_MS,
): Promise<HermesAgentsStatusResponse> {
  const profiles = await fetchHermesProfiles(hermesBaseUrl, sessionToken);
  const generatedAt = Date.now();

  return {
    agents: await Promise.all(
      profiles.map(async (profile) =>
        buildAgentStatus(profile, generatedAt, activeWindowMs),
      ),
    ),
    generatedAt,
  };
}

export function deriveHermesAgentState(
  rows: HermesSessionRow[] | null,
  nowMs: number,
  activeWindowMs: number,
): Pick<HermesAgentStatus, "status" | "reason" | "latestSession"> {
  if (rows === null) {
    return { status: "offline", reason: "no_state_db" };
  }

  const latestRow = rows[0];
  const activeRow = rows.find((row) => isActiveSession(row, nowMs, activeWindowMs));

  return {
    status: activeRow ? "working" : "idle",
    reason: activeRow ? "active_session" : "no_active_session",
    latestSession: latestRow
      ? {
          id: latestRow.id,
          title: latestRow.title,
          started_at: latestRow.started_at,
          ended_at: latestRow.ended_at,
          last_active: latestRow.last_active,
          is_active: isActiveSession(latestRow, nowMs, activeWindowMs),
        }
      : undefined,
  };
}

async function buildAgentStatus(
  profile: HermesProfile,
  nowMs: number,
  activeWindowMs: number,
): Promise<HermesAgentStatus> {
  const dbPath = path.join(profile.path, "state.db");

  if (!existsSync(dbPath)) {
    return {
      profile: profile.name,
      path: profile.path,
      provider: profile.provider ?? null,
      model: profile.model ?? null,
      status: "offline",
      reason: "no_state_db",
    };
  }

  try {
    const rows = await readProfileSessions(dbPath);
    const derived = deriveHermesAgentState(rows, nowMs, activeWindowMs);

    return {
      profile: profile.name,
      path: profile.path,
      provider: profile.provider ?? null,
      model: profile.model ?? null,
      ...derived,
    };
  } catch (error) {
    return {
      profile: profile.name,
      path: profile.path,
      provider: profile.provider ?? null,
      model: profile.model ?? null,
      status: "error",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchHermesSessionToken(
  hermesBaseUrl: string,
): Promise<string> {
  const response = await fetch(hermesBaseUrl, {
    headers: { Accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Hermes dashboard HTML: HTTP ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/window\.__HERMES_SESSION_TOKEN__\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not find Hermes session token in dashboard HTML");
  }

  return match[1];
}

async function fetchHermesProfiles(
  hermesBaseUrl: string,
  sessionToken?: string,
): Promise<HermesProfile[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (sessionToken) {
    headers["X-Hermes-Session-Token"] = sessionToken;
  }

  const response = await fetch(`${hermesBaseUrl}/api/profiles`, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch Hermes profiles: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { profiles?: HermesProfile[] };
  return payload.profiles ?? [];
}

export async function readProfileSessions(dbPath: string): Promise<HermesSessionRow[]> {
  const script = String.raw`
import json
import sqlite3
import sys

db_path = sys.argv[1]
conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row


def get_last_active(session_id, started_at):
    row = conn.execute(
        "SELECT MAX(timestamp) AS ts, COUNT(*) AS count FROM messages WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    ts = row["ts"] if row is not None else None
    count = row["count"] if row is not None else 0
    return (ts if ts is not None else started_at, count > 0)


def get_session_row(session_id):
    row = conn.execute(
        "SELECT id, title, started_at, ended_at, end_reason, parent_session_id FROM sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    if row is None:
        return None
    data = dict(row)
    data["last_active"], data["has_messages"] = get_last_active(data["id"], data["started_at"])
    return data


def get_compression_tip(session_id):
    current = session_id
    while True:
        parent = conn.execute(
            "SELECT id, ended_at, end_reason FROM sessions WHERE id = ?",
            (current,),
        ).fetchone()
        if parent is None or parent["end_reason"] != "compression" or parent["ended_at"] is None:
            return current
        child = conn.execute(
            """
            SELECT id
            FROM sessions
            WHERE parent_session_id = ?
              AND started_at >= ?
            ORDER BY started_at DESC, id DESC
            LIMIT 1
            """,
            (current, parent["ended_at"]),
        ).fetchone()
        if child is None:
            return current
        current = child["id"]


surfaced = conn.execute(
    """
    SELECT s.id, s.title, s.started_at, s.ended_at, s.end_reason, s.parent_session_id
    FROM sessions s
    WHERE (
      s.parent_session_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM sessions p
        WHERE p.id = s.parent_session_id
          AND p.end_reason = 'branched'
          AND p.ended_at IS NOT NULL
          AND s.started_at >= p.ended_at
      )
    )
    ORDER BY s.started_at DESC, s.id DESC
    """
).fetchall()

projected = []
for row in surfaced:
    data = dict(row)
    tip_id = get_compression_tip(data["id"]) if data.get("end_reason") == "compression" else data["id"]
    tip = get_session_row(tip_id)
    if tip is None:
        tip = data
        tip["last_active"], tip["has_messages"] = get_last_active(tip["id"], tip["started_at"])
    projected.append({
        "id": tip["id"],
        "title": tip.get("title"),
        "started_at": tip["started_at"],
        "ended_at": tip.get("ended_at"),
        "last_active": tip["last_active"],
        "has_messages": tip["has_messages"],
    })

projected.sort(key=lambda row: (row["last_active"], row["started_at"], row["id"]), reverse=True)
print(json.dumps(projected))
`;

  const { stdout, stderr } = await execFileAsync("python3", ["-c", script, dbPath]);
  if (stderr.trim()) {
    throw new Error(stderr.trim());
  }
  return JSON.parse(stdout) as HermesSessionRow[];
}

function isActiveSession(
  row: HermesSessionRow,
  nowMs: number,
  activeWindowMs: number,
): boolean {
  return (
    row.ended_at === null &&
    row.has_messages &&
    nowMs - row.last_active * 1000 < activeWindowMs
  );
}
