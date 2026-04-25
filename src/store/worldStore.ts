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

type WorldState = {
  worldConfig: WorldConfig | null;
  isMockMode: boolean;
  inspectorSelection: InspectorSelection;

  setWorldConfig: (config: WorldConfig) => void;
  setMockMode: (enabled: boolean) => void;
  setInspectorSelection: (selection: InspectorSelection) => void;
};

export const useWorldStore = create<WorldState>()((set) => ({
  worldConfig: null,
  isMockMode: false,
  inspectorSelection: null,

  setWorldConfig: (config) => set({ worldConfig: config }),
  setMockMode: (enabled) => set({ isMockMode: enabled }),
  setInspectorSelection: (selection) => set({ inspectorSelection: selection }),
}));
