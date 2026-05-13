import type { MainState } from "../store/characterStore";

import type { DataSource, StateChangeEvent, StateChangeHandler } from "./mock";

const SNAPSHOT_POLL_MS = 20_000;

export type HermesAgentStatusState = "working" | "idle" | "offline" | "error";

export type HermesAgentStatus = {
  profile: string;
  status: HermesAgentStatusState;
};

type HermesAgentsStatusResponse = {
  agents?: HermesAgentStatus[];
  error?: string;
};

const PROFILE_ALIASES: Record<string, string[]> = {
  "content-optimizer": ["seo-expert"],
  "seo-expert": ["content-optimizer"],
};

/**
 * HermesLiveDataSource
 *
 * Polls the local Hermes aggregation API and maps Hermes profile status back to
 * the world.json character agent ids.
 */
export type LiveDataStatusCallback = (status: "ok" | "error", errorMessage?: string) => void;

export class HermesLiveDataSource implements DataSource {
  private agentIds: string[];
  private handlers: StateChangeHandler[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private inFlight = false;
  private previousStates = new Map<string, MainState>();
  private onStatus: LiveDataStatusCallback | null = null;

  constructor(agentIds: string[], onStatus?: LiveDataStatusCallback) {
    this.agentIds = agentIds;
    this.onStatus = onStatus ?? null;
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
      const response = await fetch("/api/hermes/agents/status", {
        headers: { Accept: "application/json" },
      });

      const payload = (await response.json()) as HermesAgentsStatusResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }

      this.handleSnapshot(payload);
      this.onStatus?.("ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[HermesLiveDataSource] ${message}`);
      this.onStatus?.("error", message);
    } finally {
      this.inFlight = false;
      if (!this.stopped) {
        this.timer = setTimeout(() => {
          void this.poll();
        }, SNAPSHOT_POLL_MS);
      }
    }
  }

  private handleSnapshot(payload: HermesAgentsStatusResponse): void {
    const nextStates = mapHermesAgentsToStates(payload.agents ?? [], this.agentIds);

    for (const agentId of this.agentIds) {
      const nextState = nextStates.get(agentId) ?? "idle";
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

export function mapHermesAgentsToStates(
  agents: HermesAgentStatus[],
  agentIds: string[],
): Map<string, MainState> {
  const states = new Map<string, MainState>();
  const byProfile = new Map(agents.map((agent) => [agent.profile, agent] as const));
  const missingAgentIds: string[] = [];

  for (const agentId of agentIds) {
    const matches = [agentId, ...(PROFILE_ALIASES[agentId] ?? [])];
    const matchedAgent = matches
      .map((candidate) => byProfile.get(candidate))
      .find((agent): agent is HermesAgentStatus => agent !== undefined);

    if (!matchedAgent) {
      missingAgentIds.push(agentId);
      continue;
    }

    states.set(agentId, deriveMainStateFromHermesAgent(matchedAgent));
  }

  if (missingAgentIds.length > 0) {
    throw new Error(
      `world.json agentId not found in backend status payload: ${missingAgentIds.join(", ")}`,
    );
  }

  return states;
}

export function deriveMainStateFromHermesAgent(
  agent: HermesAgentStatus | undefined,
): MainState {
  if (!agent) {
    return "idle";
  }

  return agent.status === "working" ? "working" : "idle";
}
