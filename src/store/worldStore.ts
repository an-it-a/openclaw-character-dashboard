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
  inspectorSelection: InspectorSelection;

  setWorldConfig: (config: WorldConfig) => void;
  setMockMode: (enabled: boolean) => void;
  setLiveDataStatus: (status: LiveDataStatus) => void;
  setInspectorSelection: (selection: InspectorSelection) => void;
};

export const useWorldStore = create<WorldState>()((set) => ({
  worldConfig: null,
  isMockMode: false,
  liveDataStatus: "connecting",
  inspectorSelection: null,

  setWorldConfig: (config) => set({ worldConfig: config }),
  setMockMode: (enabled) =>
    set({ isMockMode: enabled, liveDataStatus: "connecting" }),
  setLiveDataStatus: (status) => set({ liveDataStatus: status }),
  setInspectorSelection: (selection) => set({ inspectorSelection: selection }),
}));
