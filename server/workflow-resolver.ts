const ACTIVE_TASK_STATE_PRIORITY: Record<string, number> = {
  running: 0,
  waiting_human: 1,
  waiting_tool: 2,
  blocked: 3,
  dispatching: 4,
  assigned: 5,
  queued: 6,
  draft: 7,
};

const FRESH_PRESENCE_MAX_MS = 60_000;
const AGING_PRESENCE_MAX_MS = 5 * 60_000;
const STALE_PRESENCE_MAX_MS = 15 * 60_000;

export type WorkflowDisplayState =
  | "idle"
  | "dispatching"
  | "working"
  | "waiting_tool"
  | "waiting_human"
  | "blocked"
  | "delivering"
  | "offline"
  | "error";

export type WorkflowPresenceFreshness =
  | "fresh"
  | "aging"
  | "stale"
  | "offlineCandidate";

export type WorkflowTaskSource = "presence" | "fallback" | "none";

export type DashboardAgentStateRow = {
  agent_id: string;
  state: string;
  current_task_id: string | null;
  task_title: string | null;
  task_kind: string | null;
  priority: number | null;
  current_session_key: string | null;
  status_text: string | null;
  wait_reason: string | null;
  last_event_at: string | null;
  last_seen_at: string | null;
  updated_at: string | null;
};

export type ActiveTaskRow = {
  id: string;
  title: string | null;
  description: string | null;
  kind: string | null;
  requester_agent_id: string | null;
  assigned_agent_id: string | null;
  parent_task_id: string | null;
  root_task_id: string | null;
  state: string;
  priority: number | null;
  wait_reason: string | null;
  session_key: string | null;
  created_at: string | null;
  queued_at: string | null;
  started_at: string | null;
  updated_at: string | null;
};

export type TaskArtifactRow = {
  id: number;
  task_id: string;
  agent_id: string | null;
  kind: string;
  path: string | null;
  label: string | null;
  metadata_json: string | null;
  created_at: string;
};

export type WorkflowForegroundTask = {
  id: string;
  title?: string;
  kind?: string;
  state?: string;
  waitReason?: string | null;
};

export type WorkflowAgentSnapshot = {
  agentId: string;
  displayState: WorkflowDisplayState;
  foregroundTask?: WorkflowForegroundTask;
  resolution: {
    taskSource: WorkflowTaskSource;
    stalePresence: boolean;
  };
  presenceFreshness: WorkflowPresenceFreshness;
  waitReason?: string | null;
  taskKind?: string;
  taskState?: string;
};

export type WorkflowSnapshot = {
  available: boolean;
  empty?: boolean;
  reason?: string;
  dbPath: string;
  agents: WorkflowAgentSnapshot[];
  activeTasks: WorkflowForegroundTask[];
  recentArtifacts: TaskArtifactRow[];
};

type WorkflowResolverInput = {
  dbPath: string;
  dashboardAgentStates: DashboardAgentStateRow[];
  activeTasks: ActiveTaskRow[];
  recentArtifacts: TaskArtifactRow[];
  now: number;
};

export function buildWorkflowSnapshot({
  dbPath,
  dashboardAgentStates,
  activeTasks,
  recentArtifacts,
  now,
}: WorkflowResolverInput): WorkflowSnapshot {
  if (
    dashboardAgentStates.length === 0 &&
    activeTasks.length === 0 &&
    recentArtifacts.length === 0
  ) {
    return {
      available: true,
      empty: true,
      dbPath,
      agents: [],
      activeTasks: [],
      recentArtifacts: [],
    };
  }

  const tasksById = new Map(activeTasks.map((task) => [task.id, task]));
  const tasksByAgentId = new Map<string, ActiveTaskRow[]>();

  for (const task of activeTasks) {
    const agentId = task.assigned_agent_id;
    if (!agentId) {
      continue;
    }

    const agentTasks = tasksByAgentId.get(agentId) ?? [];
    agentTasks.push(task);
    tasksByAgentId.set(agentId, agentTasks);
  }

  const presenceByAgentId = new Map(
    dashboardAgentStates.map((agentState) => [agentState.agent_id, agentState]),
  );
  const agentIds = new Set<string>([
    ...dashboardAgentStates.map((row) => row.agent_id),
    ...activeTasks
      .map((task) => task.assigned_agent_id)
      .filter((agentId): agentId is string => typeof agentId === "string"),
  ]);

  const agents = Array.from(agentIds)
    .sort()
    .map((agentId) => {
      const presence = presenceByAgentId.get(agentId) ?? null;
      const agentTasks = [...(tasksByAgentId.get(agentId) ?? [])].sort(
        compareTasks,
      );
      const presenceFreshness = classifyPresenceFreshness(
        presence?.last_seen_at ?? null,
        now,
      );
      const stalePresence = isStalePresence(presenceFreshness);
      const preferredPresenceTask = presence?.current_task_id
        ? tasksById.get(presence.current_task_id) ?? null
        : null;
      const foregroundTask =
        preferredPresenceTask && !stalePresence
          ? preferredPresenceTask
          : agentTasks[0] ?? null;
      const taskSource: WorkflowTaskSource = preferredPresenceTask && !stalePresence
        ? "presence"
        : foregroundTask
          ? "fallback"
          : "none";
      const waitReason = foregroundTask?.wait_reason ?? presence?.wait_reason ?? null;
      const displayState = deriveDisplayState(foregroundTask, presence?.state ?? null);

      return {
        agentId,
        displayState,
        foregroundTask: foregroundTask
          ? {
              id: foregroundTask.id,
              title: foregroundTask.title ?? undefined,
              kind: foregroundTask.kind ?? undefined,
              state: foregroundTask.state,
              waitReason,
            }
          : undefined,
        resolution: {
          taskSource,
          stalePresence,
        },
        presenceFreshness,
        waitReason,
        taskKind: foregroundTask?.kind ?? undefined,
        taskState: foregroundTask?.state ?? undefined,
      } satisfies WorkflowAgentSnapshot;
    });

  return {
    available: true,
    empty: false,
    dbPath,
    agents,
    activeTasks: activeTasks.map((task) => ({
      id: task.id,
      title: task.title ?? undefined,
      kind: task.kind ?? undefined,
      state: task.state,
      waitReason: task.wait_reason,
    })),
    recentArtifacts,
  };
}

function compareTasks(a: ActiveTaskRow, b: ActiveTaskRow): number {
  const stateDelta =
    resolveTaskPriority(a.state) - resolveTaskPriority(b.state);
  if (stateDelta !== 0) {
    return stateDelta;
  }

  const priorityDelta = (b.priority ?? 0) - (a.priority ?? 0);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const updatedAtDelta =
    parseTimestamp(b.updated_at) - parseTimestamp(a.updated_at);
  if (updatedAtDelta !== 0) {
    return updatedAtDelta;
  }

  return parseTimestamp(b.created_at) - parseTimestamp(a.created_at);
}

function resolveTaskPriority(state: string): number {
  return ACTIVE_TASK_STATE_PRIORITY[state] ?? Number.MAX_SAFE_INTEGER;
}

function parseTimestamp(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifyPresenceFreshness(
  lastSeenAt: string | null,
  now: number,
): WorkflowPresenceFreshness {
  const seenAt = parseTimestamp(lastSeenAt);
  if (seenAt <= 0) {
    return "offlineCandidate";
  }

  const ageMs = Math.max(0, now - seenAt);
  if (ageMs <= FRESH_PRESENCE_MAX_MS) {
    return "fresh";
  }
  if (ageMs <= AGING_PRESENCE_MAX_MS) {
    return "aging";
  }
  if (ageMs <= STALE_PRESENCE_MAX_MS) {
    return "stale";
  }

  return "offlineCandidate";
}

function isStalePresence(
  freshness: WorkflowPresenceFreshness,
): boolean {
  return freshness === "stale" || freshness === "offlineCandidate";
}

function deriveDisplayState(
  foregroundTask: ActiveTaskRow | null,
  presenceState: string | null,
): WorkflowDisplayState {
  if (foregroundTask) {
    switch (foregroundTask.state) {
      case "running":
        return "working";
      case "waiting_tool":
        return "waiting_tool";
      case "waiting_human":
        return "waiting_human";
      case "blocked":
        return "blocked";
      case "dispatching":
      case "assigned":
        return "dispatching";
      case "queued":
      case "draft":
      default:
        return "idle";
    }
  }

  if (
    presenceState === "idle" ||
    presenceState === "dispatching" ||
    presenceState === "working" ||
    presenceState === "waiting_tool" ||
    presenceState === "waiting_human" ||
    presenceState === "blocked" ||
    presenceState === "delivering" ||
    presenceState === "offline" ||
    presenceState === "error"
  ) {
    return presenceState;
  }

  return "idle";
}
