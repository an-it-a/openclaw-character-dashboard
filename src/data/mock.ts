import type { MainState } from "@/store/characterStore";

// ---------------------------------------------------------------------------
// Shared event interface (mock and live both implement this)
// ---------------------------------------------------------------------------

export type StateChangeEvent = {
  agentId: string;
  state: MainState;
};

export type StateChangeHandler = (event: StateChangeEvent) => void;

export interface DataSource {
  start(): void;
  stop(): void;
  on(event: "stateChange", handler: StateChangeHandler): void;
  off(event: "stateChange", handler: StateChangeHandler): void;
}

// ---------------------------------------------------------------------------
// MockDataSource
// ---------------------------------------------------------------------------

const MIN_INTERVAL_MS = 30_000;
const MAX_INTERVAL_MS = 360_000;

/**
 * MockDataSource
 *
 * Randomly emits { agentId, state } events for each agent at a 30–360 s
 * random interval. Used when isMockMode === true.
 */
export class MockDataSource implements DataSource {
  private agentIds: string[];
  private handlers: StateChangeHandler[] = [];
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private agentStates: Map<string, MainState> = new Map();

  constructor(agentIds: string[]) {
    this.agentIds = agentIds;
  }

  start(): void {
    for (const id of this.agentIds) {
      this.agentStates.set(id, "idle");
      this.scheduleNext(id);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  on(_event: "stateChange", handler: StateChangeHandler): void {
    this.handlers.push(handler);
  }

  off(_event: "stateChange", handler: StateChangeHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private scheduleNext(agentId: string): void {
    const delayMs = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
    const timer = setTimeout(() => {
      this.flip(agentId);
      this.scheduleNext(agentId);
    }, delayMs);
    this.timers.set(agentId, timer);
  }

  private flip(agentId: string): void {
    const current = this.agentStates.get(agentId) ?? "idle";
    const next: MainState = current === "idle" ? "working" : "idle";
    this.agentStates.set(agentId, next);
    this.emit({ agentId, state: next });
  }

  private emit(event: StateChangeEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
