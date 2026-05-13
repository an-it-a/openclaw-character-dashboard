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

type WorldState = {
  worldConfig: WorldConfig | null;
  isMockMode: boolean;
  liveDataStatus: LiveDataStatus;
  liveDataError: string | null;
  inspectorSelection: InspectorSelection;

  setWorldConfig: (config: WorldConfig) => void;
  setMockMode: (enabled: boolean) => void;
  setLiveDataStatus: (status: LiveDataStatus, error?: string | null) => void;
  setInspectorSelection: (selection: InspectorSelection) => void;
};

export const useWorldStore = create<WorldState>()((set) => ({
  worldConfig: null,
  isMockMode: false,
  liveDataStatus: "connecting",
  liveDataError: null,
  inspectorSelection: null,

  setWorldConfig: (config) => set({ worldConfig: config }),
  setMockMode: (enabled) =>
    set({ isMockMode: enabled, liveDataStatus: "connecting", liveDataError: null }),
  setLiveDataStatus: (status, error = null) => set({ liveDataStatus: status, liveDataError: error }),
  setInspectorSelection: (selection) => set({ inspectorSelection: selection }),
}));
