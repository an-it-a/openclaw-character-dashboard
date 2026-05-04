import path from "node:path";
import { existsSync } from "node:fs";

import type { DatabaseSync } from "node:sqlite";

import {
  buildWorkflowSnapshot,
  type ActiveTaskRow,
  type DashboardAgentStateRow,
  type TaskArtifactRow,
  type WorkflowSnapshot,
} from "./workflow-resolver";

const RECENT_ARTIFACT_LIMIT = 100;

type SqliteModule = {
  DatabaseSync: typeof DatabaseSync;
};

export async function readWorkflowSnapshot(
  openClawHome: string,
): Promise<WorkflowSnapshot> {
  const dbPath = resolveWorkflowDbPath(openClawHome);
  if (!existsSync(dbPath)) {
    return {
      available: false,
      reason: "workflow-db-missing",
      dbPath,
      agents: [],
      activeTasks: [],
      recentArtifacts: [],
    };
  }

  const sqlite = (await import("node:sqlite")) as SqliteModule;
  const db = new sqlite.DatabaseSync(dbPath, { readonly: true });

  try {
    const dashboardAgentStates = db
      .prepare(
        `
          SELECT
            agent_id,
            state,
            current_task_id,
            task_title,
            task_kind,
            priority,
            current_session_key,
            status_text,
            wait_reason,
            last_event_at,
            last_seen_at,
            updated_at
          FROM dashboard_agent_state
        `,
      )
      .all() as DashboardAgentStateRow[];

    const activeTasks = db
      .prepare(
        `
          SELECT
            id,
            title,
            description,
            kind,
            requester_agent_id,
            assigned_agent_id,
            parent_task_id,
            root_task_id,
            state,
            priority,
            wait_reason,
            session_key,
            created_at,
            queued_at,
            started_at,
            updated_at
          FROM active_tasks
        `,
      )
      .all() as ActiveTaskRow[];

    const recentArtifacts = db
      .prepare(
        `
          SELECT
            id,
            task_id,
            agent_id,
            kind,
            path,
            label,
            metadata_json,
            created_at
          FROM task_artifacts
          ORDER BY created_at DESC
          LIMIT ${RECENT_ARTIFACT_LIMIT}
        `,
      )
      .all() as TaskArtifactRow[];

    return buildWorkflowSnapshot({
      dbPath,
      dashboardAgentStates,
      activeTasks,
      recentArtifacts,
      now: Date.now(),
    });
  } finally {
    db.close();
  }
}

function resolveWorkflowDbPath(openClawHome: string): string {
  const configuredPath = process.env["WORKFLOW_DB_PATH"];
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return path.join(openClawHome, "workspace", "workflow", "workflow.sqlite");
}
