import { create } from "zustand";

import type { WorldConfig } from "@/types/world";

// ---------------------------------------------------------------------------
// Inspector selection — what the user has clicked on the map
// ---------------------------------------------------------------------------

export type InspectorSelection =
  | { type: "character"; characterId: string }
  | { type: "room"; roomId: string }
  | { type: "resource-wall" }
  | null;

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export type LiveDataStatus = "connecting" | "ok" | "error";

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

export type WorkflowTaskSource = "presence" | "fallback" | "none";

export type WorkflowPresenceFreshness =
  | "fresh"
  | "aging"
  | "stale"
  | "offlineCandidate";

export type WorkflowForegroundTask = {
  id: string;
  title?: string;
  kind?: string;
  state?: string;
  waitReason?: string | null;
};

export type WorkflowAgentState = {
  available: boolean;
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

export type WorkflowDebugState = {
  available: boolean;
  empty: boolean;
  reason?: string;
  dbPath?: string;
  lastError?: string;
};

type WorldState = {
  worldConfig: WorldConfig | null;
  isMockMode: boolean;
  liveDataStatus: LiveDataStatus;
  inspectorSelection: InspectorSelection;
  workflowByAgentId: Record<string, WorkflowAgentState>;
  workflowDebug: WorkflowDebugState;

  setWorldConfig: (config: WorldConfig) => void;
  setMockMode: (enabled: boolean) => void;
  setLiveDataStatus: (status: LiveDataStatus) => void;
  setInspectorSelection: (selection: InspectorSelection) => void;
  setWorkflowState: (
    workflowByAgentId: Record<string, WorkflowAgentState>,
    workflowDebug: WorkflowDebugState,
  ) => void;
};

export const useWorldStore = create<WorldState>()((set) => ({
  worldConfig: null,
  isMockMode: false,
  liveDataStatus: "connecting",
  inspectorSelection: null,
  workflowByAgentId: {},
  workflowDebug: {
    available: false,
    empty: false,
  },

  setWorldConfig: (config) => set({ worldConfig: config }),
  setMockMode: (enabled) =>
    set({
      isMockMode: enabled,
      liveDataStatus: "connecting",
      workflowByAgentId: {},
      workflowDebug: {
        available: false,
        empty: false,
      },
    }),
  setLiveDataStatus: (status) => set({ liveDataStatus: status }),
  setInspectorSelection: (selection) => set({ inspectorSelection: selection }),
  setWorkflowState: (workflowByAgentId, workflowDebug) =>
    set({ workflowByAgentId, workflowDebug }),
}));
