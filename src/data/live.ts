import type { MainState } from "@/store/characterStore";
import type {
  WorkflowAgentState,
  WorkflowDebugState,
  WorkflowDisplayState,
  WorkflowForegroundTask,
  WorkflowPresenceFreshness,
  WorkflowTaskSource,
} from "@/store/worldStore";

import type { DataSource, StateChangeEvent, StateChangeHandler } from "./mock";

const SNAPSHOT_POLL_MS = 20_000;
const SESSION_ACTIVE_THRESHOLD_MS = readSessionActiveThresholdMs();

type SessionSummary = {
  key?: string;
  updatedAt?: number;
  status?: string;
  channel?: string;
  chatType?: string;
  lastChannel?: string;
  displayName?: string;
  origin?: {
    provider?: string;
    surface?: string;
    chatType?: string;
    from?: string;
    to?: string;
  };
};

type SnapshotResponse = {
  sessions?: {
    sessions?: SessionSummary[];
  };
  error?: string;
};

type WorkflowSnapshotResponse = {
  available: boolean;
  empty?: boolean;
  reason?: string;
  dbPath?: string;
  agents?: WorkflowAgentPayload[];
  activeTasks?: WorkflowForegroundTask[];
  recentArtifacts?: unknown[];
  error?: string;
};

type WorkflowAgentPayload = {
  agentId: string;
  displayState?: WorkflowDisplayState;
  foregroundTask?: WorkflowForegroundTask;
  resolution?: {
    taskSource?: WorkflowTaskSource;
    stalePresence?: boolean;
  };
  presenceFreshness?: WorkflowPresenceFreshness;
  waitReason?: string | null;
  taskKind?: string;
  taskState?: string;
};

type MergedAgentState = {
  mainState: MainState;
  workflow?: WorkflowAgentState;
};

type LiveDataSnapshotCallback = (
  snapshot: {
    workflowByAgentId: Record<string, WorkflowAgentState>;
    workflowDebug: WorkflowDebugState;
  },
) => void;

/**
 * LiveDataSource
 *
 * Polls the local snapshot API, derives each gateway agent's activity from
 * sessions.list output, and emits the dashboard's simplified main state.
 */
export type LiveDataStatusCallback = (status: "ok" | "error") => void;

export class LiveDataSource implements DataSource {
  private agentIds: string[];
  private handlers: StateChangeHandler[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private inFlight = false;
  private previousStates = new Map<string, MainState>();
  private onStatus: LiveDataStatusCallback | null = null;
  private onSnapshot: LiveDataSnapshotCallback | null = null;

  constructor(
    agentIds: string[],
    onStatus?: LiveDataStatusCallback,
    onSnapshot?: LiveDataSnapshotCallback,
  ) {
    this.agentIds = agentIds;
    this.onStatus = onStatus ?? null;
    this.onSnapshot = onSnapshot ?? null;
  }

  start(): void {
    this.stopped = false;
    void this.poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  on(_event: "stateChange", handler: StateChangeHandler): void {
    this.handlers.push(handler);
  }

  off(_event: "stateChange", handler: StateChangeHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.inFlight) {
      return;
    }

    this.inFlight = true;

    try {
      const live = await fetchJson<SnapshotResponse>("/api/openclaw/snapshot");
      const workflow = await this.fetchWorkflowSnapshot();

      this.handleSnapshot(live, workflow);
      this.onStatus?.("ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[LiveDataSource] ${message}`);
      this.onStatus?.("error");
    } finally {
      this.inFlight = false;
      if (!this.stopped) {
        this.timer = setTimeout(() => {
          void this.poll();
        }, SNAPSHOT_POLL_MS);
      }
    }
  }

  private handleSnapshot(
    payload: SnapshotResponse,
    workflow: WorkflowSnapshotResponse | null,
  ): void {
    const sessions = payload.sessions?.sessions ?? [];
    const sessionsByAgentId = new Map<string, SessionSummary[]>();
    const workflowByAgentId = mapWorkflowByAgentId(workflow);

    this.onSnapshot?.({
      workflowByAgentId,
      workflowDebug: deriveWorkflowDebugState(workflow),
    });

    for (const session of sessions) {
      const agentId = agentIdFromSessionKey(session.key);
      if (!agentId) {
        continue;
      }

      const agentSessions = sessionsByAgentId.get(agentId) ?? [];
      agentSessions.push(session);
      sessionsByAgentId.set(agentId, agentSessions);
    }

    for (const agentId of this.agentIds) {
      const agentSessions = sessionsByAgentId.get(agentId) ?? [];
      const nextState = deriveAgentState(
        agentSessions,
        workflowByAgentId[agentId],
        Date.now(),
      );
      const previousState = this.previousStates.get(agentId);

      if (previousState === nextState.mainState) {
        continue;
      }

      this.previousStates.set(agentId, nextState.mainState);
      this.emit({ agentId, state: nextState.mainState });
    }
  }

  private async fetchWorkflowSnapshot(): Promise<WorkflowSnapshotResponse | null> {
    try {
      return await fetchJson<WorkflowSnapshotResponse>("/api/openclaw/workflow");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[LiveDataSource] workflow enrichment unavailable: ${message}`);

      return {
        available: false,
        reason: "workflow-fetch-failed",
        agents: [],
        activeTasks: [],
        recentArtifacts: [],
        error: message,
      };
    }
  }

  private emit(event: StateChangeEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}

function deriveAgentState(
  sessions: SessionSummary[],
  workflow: WorkflowAgentState | undefined,
  now: number,
): MergedAgentState {
  if (workflow?.available && workflow.displayState) {
    return {
      mainState: mapWorkflowDisplayStateToMainState(workflow.displayState),
      workflow,
    };
  }

  return {
    mainState: deriveMainState(sessions, now),
    workflow,
  };
}

function deriveMainState(sessions: SessionSummary[], now: number): MainState {
  const isWorking = sessions.some((session) => {
    if (!isUserFacingSession(session)) {
      return false;
    }

    const updatedAt =
      typeof session.updatedAt === "number" ? session.updatedAt : 0;

    if (session.status === "active") {
      return true;
    }

    return now - updatedAt <= SESSION_ACTIVE_THRESHOLD_MS;
  });

  return isWorking ? "working" : "idle";
}

function mapWorkflowDisplayStateToMainState(
  displayState: WorkflowDisplayState,
): MainState {
  switch (displayState) {
    case "working":
    case "dispatching":
    case "waiting_tool":
    case "waiting_human":
    case "blocked":
    case "delivering":
      return "working";
    case "idle":
    case "offline":
    case "error":
    default:
      return "idle";
  }
}

function mapWorkflowByAgentId(
  workflow: WorkflowSnapshotResponse | null,
): Record<string, WorkflowAgentState> {
  const byAgentId: Record<string, WorkflowAgentState> = {};

  for (const agent of workflow?.agents ?? []) {
    byAgentId[agent.agentId] = {
      available: workflow?.available ?? false,
      displayState: agent.displayState,
      foregroundTask: agent.foregroundTask,
      resolution: agent.resolution,
      presenceFreshness: agent.presenceFreshness,
      waitReason: agent.waitReason,
      taskKind: agent.taskKind,
      taskState: agent.taskState,
    };
  }

  return byAgentId;
}

function deriveWorkflowDebugState(
  workflow: WorkflowSnapshotResponse | null,
): WorkflowDebugState {
  return {
    available: workflow?.available ?? false,
    empty: workflow?.empty ?? false,
    reason: workflow?.reason,
    dbPath: workflow?.dbPath,
    lastError: workflow?.error,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }

  return payload;
}

function isUserFacingSession(session: SessionSummary): boolean {
  if (session.origin?.provider === "heartbeat") {
    return false;
  }

  if (session.displayName === "heartbeat") {
    return false;
  }

  const channel =
    session.channel ?? session.lastChannel ?? session.origin?.surface;
  if (channel === "telegram") {
    return true;
  }

  const chatType = session.chatType ?? session.origin?.chatType;
  if (
    chatType === "direct" &&
    session.origin?.provider &&
    session.origin.provider !== "heartbeat"
  ) {
    return true;
  }

  return false;
}

function readSessionActiveThresholdMs(): number {
  const rawValue = import.meta.env.VITE_SESSION_ACTIVE_THRESHOLD_MS;
  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 10_000;
  }

  return parsedValue;
}

function agentIdFromSessionKey(key: string | undefined): string {
  if (!key) {
    return "";
  }

  const parts = key.split(":");
  return parts[0] === "agent" ? (parts[1] ?? "") : "";
}
