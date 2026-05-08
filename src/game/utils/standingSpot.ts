import type { GridPos } from "@/game/pathfinding/CollisionGrid";

export const MIN_STANDING_Y_GAP = 2;

export type StandingOccupant = GridPos & {
  characterId: string;
};

export function hasStandingColumnConflict(
  candidate: GridPos,
  occupants: StandingOccupant[],
  characterId: string,
): boolean {
  return occupants.some(
    (occupant) =>
      occupant.characterId !== characterId &&
      occupant.gx === candidate.gx &&
      Math.abs(occupant.gy - candidate.gy) < MIN_STANDING_Y_GAP,
  );
}
