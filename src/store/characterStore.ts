import { create } from "zustand";

// ---------------------------------------------------------------------------
// Character state types (mirrors spec.md exactly)
// ---------------------------------------------------------------------------

export type MainState = "working" | "idle";

export type SubState =
  // working sub-states
  | "walking-to-work"
  | "working"
  | "leaving-work" // transitional: exit tween from desk back to approach cell
  | "walking-from-work" // transitional: walking to living/private room after work ends
  // idle sub-states
  | "standing"
  | "wandering"
  | "walking-to-sleep"
  | "sleeping"
  | "change-room"
  | "walking-to-sofa"
  | "sitting-on-sofa";

export type CharacterState = {
  characterId: string;
  mainState: MainState;
  subState: SubState;
  currentRoomId: string;
};

// ---------------------------------------------------------------------------
// Occupancy map — tracks which interaction points are claimed
// Key: "<objectId>:<pointIndex>", Value: characterId
// ---------------------------------------------------------------------------

type OccupancyMap = Record<string, string>;

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export type PendingForce = {
  characterId: string;
  mainState: MainState;
  subState: SubState;
};

export type CharacterMessage = {
  text: string;
  role: string;
  timestamp: number;
};

type CharacterStoreState = {
  characterStates: Record<string, CharacterState>;
  characterMessages: Record<string, CharacterMessage>;
  occupiedPoints: OccupancyMap;
  pendingForce: PendingForce | null;

  setCharacterState: (state: CharacterState) => void;
  setCharacterMessage: (characterId: string, message: CharacterMessage | null) => void;
  claimPoint: (pointKey: string, characterId: string) => boolean;
  releasePoint: (pointKey: string, characterId: string) => void;
  getOccupiedPointKey: (characterId: string) => string | null;
  forceCharacterState: (
    characterId: string,
    mainState: MainState,
    subState: SubState,
  ) => void;
  clearPendingForce: () => void;
};

export const useCharacterStore = create<CharacterStoreState>()((set, get) => ({
  characterStates: {},
  characterMessages: {},
  occupiedPoints: {},
  pendingForce: null,

  setCharacterState: (state) =>
    set((prev) => ({
      characterStates: { ...prev.characterStates, [state.characterId]: state },
    })),

  setCharacterMessage: (characterId, message) =>
    set((prev) => {
      const next = { ...prev.characterMessages };
      if (message === null) {
        delete next[characterId];
      } else {
        next[characterId] = message;
      }
      return { characterMessages: next };
    }),

  claimPoint: (pointKey, characterId) => {
    const { occupiedPoints } = get();
    if (occupiedPoints[pointKey] !== undefined) return false;
    set((prev) => ({
      occupiedPoints: { ...prev.occupiedPoints, [pointKey]: characterId },
    }));
    return true;
  },

  releasePoint: (pointKey, characterId) => {
    const { occupiedPoints } = get();
    if (occupiedPoints[pointKey] !== characterId) return;
    set((prev) => {
      const next = { ...prev.occupiedPoints };
      delete next[pointKey];
      return { occupiedPoints: next };
    });
  },

  getOccupiedPointKey: (characterId) => {
    const { occupiedPoints } = get();
    const entry = Object.entries(occupiedPoints).find(
      ([, v]) => v === characterId,
    );
    return entry ? entry[0] : null;
  },

  forceCharacterState: (characterId, mainState, subState) =>
    set({ pendingForce: { characterId, mainState, subState } }),

  clearPendingForce: () => set({ pendingForce: null }),
}));
