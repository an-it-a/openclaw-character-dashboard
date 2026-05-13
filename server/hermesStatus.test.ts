import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  deriveHermesAgentState,
  readProfileSessions,
  type HermesSessionRow,
} from "./hermesStatus";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("deriveHermesAgentState", () => {
  it("returns working when any surfaced session is active", () => {
    const rows: HermesSessionRow[] = [
      {
        id: "s1",
        title: "recent",
        started_at: 100,
        ended_at: null,
        last_active: 199,
        has_messages: true,
      },
      {
        id: "s2",
        title: "old",
        started_at: 50,
        ended_at: 60,
        last_active: 60,
        has_messages: true,
      },
    ];

    expect(deriveHermesAgentState(rows, 200_000, 5_000).status).toBe("working");
  });

  it("returns working for an open session active within a 30 minute dashboard window", () => {
    const rows: HermesSessionRow[] = [
      {
        id: "s30",
        title: "warm",
        started_at: 100,
        ended_at: null,
        last_active: 1_000,
        has_messages: true,
      },
    ];

    expect(deriveHermesAgentState(rows, 1_420_000, 1_800_000).status).toBe("working");
  });

  it("returns idle when an open session is older than a 10 second dashboard window", () => {
    const rows: HermesSessionRow[] = [
      {
        id: "s10",
        title: "brief",
        started_at: 100,
        ended_at: null,
        last_active: 1_000,
        has_messages: true,
      },
    ];

    expect(deriveHermesAgentState(rows, 1_011_000, 10_000).status).toBe("idle");
  });

  it("returns idle when all surfaced sessions are stale or ended", () => {
    const rows: HermesSessionRow[] = [
      {
        id: "s1",
        title: "stale",
        started_at: 100,
        ended_at: null,
        last_active: 150,
        has_messages: true,
      },
    ];

    expect(deriveHermesAgentState(rows, 200_000, 5_000).status).toBe("idle");
  });

  it("returns idle for an open session that has no messages yet", () => {
    const rows: HermesSessionRow[] = [
      {
        id: "empty-open",
        title: "empty",
        started_at: 1_000,
        ended_at: null,
        last_active: 1_000,
        has_messages: false,
      },
    ];

    expect(deriveHermesAgentState(rows, 1_100_000, 1_800_000).status).toBe("idle");
  });

  it("returns offline when there is no state database data", () => {
    expect(deriveHermesAgentState(null, 200_000, 5_000).status).toBe("offline");
  });
});

describe("readProfileSessions", () => {
  it("includes active child sessions created from compression lineage", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hermes-status-"));
    tempDirs.push(dir);
    const dbPath = path.join(dir, "state.db");

    execFileSync("python3", [
      "-c",
      String.raw`
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
conn.executescript("""
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  started_at REAL,
  ended_at REAL,
  end_reason TEXT,
  parent_session_id TEXT
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  timestamp REAL
);
""")
conn.execute(
  "INSERT INTO sessions (id, title, started_at, ended_at, end_reason, parent_session_id) VALUES (?, ?, ?, ?, ?, ?)",
  ('parent', 'Parent', 100.0, 120.0, 'compression', None)
)
conn.execute(
  "INSERT INTO sessions (id, title, started_at, ended_at, end_reason, parent_session_id) VALUES (?, ?, ?, ?, ?, ?)",
  ('child', 'Child', 121.0, None, None, 'parent')
)
conn.execute(
  "INSERT INTO messages (session_id, timestamp) VALUES (?, ?)",
  ('child', 150.0)
)
conn.commit()
conn.close()
`,
      dbPath,
    ]);

    const rows = await readProfileSessions(dbPath);
    expect(rows.map((row) => row.id)).toContain("child");
    expect(rows[0]?.id).toBe("child");
  });

  it("projects a compressed root forward to a live tip even when the tip has no messages yet", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hermes-status-"));
    tempDirs.push(dir);
    const dbPath = path.join(dir, "state.db");

    execFileSync("python3", [
      "-c",
      String.raw`
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
conn.executescript("""
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  started_at REAL,
  ended_at REAL,
  end_reason TEXT,
  parent_session_id TEXT
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  timestamp REAL
);
""")
conn.execute(
  "INSERT INTO sessions (id, title, started_at, ended_at, end_reason, parent_session_id) VALUES (?, ?, ?, ?, ?, ?)",
  ('root', 'Root', 100.0, 120.0, 'compression', None)
)
conn.execute(
  "INSERT INTO messages (session_id, timestamp) VALUES (?, ?)",
  ('root', 110.0)
)
conn.execute(
  "INSERT INTO sessions (id, title, started_at, ended_at, end_reason, parent_session_id) VALUES (?, ?, ?, ?, ?, ?)",
  ('tip', 'Tip', 121.0, None, None, 'root')
)
conn.commit()
conn.close()
`,
      dbPath,
    ]);

    const rows = await readProfileSessions(dbPath);
    expect(rows[0]?.id).toBe("tip");
    expect(rows[0]?.ended_at).toBeNull();
    expect(rows[0]?.last_active).toBe(121);
  });
});
