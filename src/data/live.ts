import type { MainState } from "@/store/characterStore";

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

/**
 * LiveDataSource
 *
 * Polls the local snapshot API, derives each gateway agent's activity from
 * sessions.list output, and emits the dashboard's simplified main state.
 */
export class LiveDataSource implements DataSource {
  private agentIds: string[];
  private handlers: StateChangeHandler[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private inFlight = false;
  private previousStates = new Map<string, MainState>();

  constructor(agentIds: string[]) {
    this.agentIds = agentIds;
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
      const response = await fetch("/api/openclaw/snapshot", {
        headers: { Accept: "application/json" },
      });

      const payload = (await response.json()) as SnapshotResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      this.handleSnapshot(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[LiveDataSource] ${message}`);
    } finally {
      this.inFlight = false;
      if (!this.stopped) {
        this.timer = setTimeout(() => {
          void this.poll();
        }, SNAPSHOT_POLL_MS);
      }
    }
  }

  private handleSnapshot(payload: SnapshotResponse): void {
    const sessions = payload.sessions?.sessions ?? [];
    const sessionsByAgentId = new Map<string, SessionSummary[]>();

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
      const nextState = deriveMainState(agentSessions, Date.now());
      const previousState = this.previousStates.get(agentId);

      if (previousState === nextState) {
        continue;
      }

      this.previousStates.set(agentId, nextState);
      this.emit({ agentId, state: nextState });
    }
  }

  private emit(event: StateChangeEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
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
