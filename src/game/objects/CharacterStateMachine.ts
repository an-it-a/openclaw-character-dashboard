import type { MainState, SubState } from "@/store/characterStore";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CharacterStateMachineConfig = {
  characterId: string;
  privateRoomId: string;
  sharedRoomIds: string[]; // rooms the character can roam (living, office)
};

export type StateMachineCallbacks = {
  /** Ask the machine to move to a pixel position. Call onArrived when done.
   * routePx: target used for A* (the approach cell for furniture, or same as finalPx).
   * finalPx: exact pixel the sprite should land on after path is walked.
   */
  moveTo: (
    routePx: { x: number; y: number },
    finalPx: { x: number; y: number },
    speed: "fastest" | "normal" | "slowest",
    onArrived: () => void,
  ) => void;
  /** Stop any ongoing movement immediately. */
  stopMovement: () => void;
  /** Called whenever state/subState changes. */
  onStateChanged: (
    mainState: MainState,
    subState: SubState,
    roomId: string,
  ) => void;
  /** Get a random walkable pixel in the given room. */
  randomWalkableInRoom: (roomId: string) => { x: number; y: number } | null;
  /** Get a free interaction point for the given object id. Returns null if all occupied. */
  claimInteractionPoint: (
    objectId: string,
    pointIndex: number,
  ) => {
    finalPx: { x: number; y: number };
    routePx: { x: number; y: number };
  } | null;
  /** Release a previously claimed interaction point. */
  releaseInteractionPoint: (objectId: string, pointIndex: number) => void;
  /**
   * If the character is currently inside a non-walkable furniture cell, tween
   * to the recorded exit cell and call onDone when clear. If already on open
   * floor, calls onDone immediately.
   */
  exitFurnitureIfNeeded: (
    speed: "fastest" | "normal" | "slowest",
    onDone: () => void,
  ) => void;
  /** Get the pixel position of an interaction point (absolute). */
  getInteractionPointPx: (
    objectId: string,
    pointIndex: number,
  ) => {
    finalPx: { x: number; y: number };
    routePx: { x: number; y: number };
  } | null;
};

// Sub-states that are stable (not transition states); these hold for 30–360 s
const STABLE_IDLE_SUBSTATES: SubState[] = [
  "standing",
  "wandering",
  "sleeping",
  "sitting-on-sofa",
];

const MIN_HOLD_MS = 30_000;
const MAX_HOLD_MS = 360_000;

/**
 * CharacterStateMachine
 *
 * Pure state machine — no Phaser or React dependencies.
 * Driven by:
 *   - setExternalState()   from the data source (mock or live)
 *   - tick(deltaMs)        from the Phaser game loop
 *   - onArrived()          called internally via callbacks.moveTo
 */
export class CharacterStateMachine {
  private config: CharacterStateMachineConfig;
  private callbacks: StateMachineCallbacks;

  private mainState: MainState = "idle";
  private subState: SubState = "standing";
  private currentRoomId: string;

  private pendingMainState: MainState | null = null;
  private holdTimer: number = 0; // ms remaining in current stable sub-state
  private claimedPoint: { objectId: string; pointIndex: number } | null = null;

  constructor(
    config: CharacterStateMachineConfig,
    callbacks: StateMachineCallbacks,
  ) {
    this.config = config;
    this.callbacks = callbacks;
    this.currentRoomId = config.privateRoomId;
    this.holdTimer = this.randomHoldMs();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Call once after the machine is fully wired up (callbacks ready, sprite
   * spawned). Picks a random initial idle sub-state so characters don't all
   * start in the same pose.
   */
  start(): void {
    this.pickNextSubState();
  }

  /** Called each frame with elapsed milliseconds. */
  tick(deltaMs: number): void {
    if (!this.isStableSubState()) return;

    this.holdTimer -= deltaMs;
    if (this.holdTimer <= 0) {
      this.holdTimer = this.randomHoldMs();

      if (this.mainState === "working") {
        // Work session complete — walk to living room or private room.
        this.enterWalkingFromWork();
      } else {
        this.pickNextSubState();
      }
    }
  }

  /**
   * Set the main state from an external data source.
   * If a transition is already in progress (movement), the new state is
   * queued and applied once movement completes.
   */
  setExternalState(state: MainState): void {
    if (state === this.mainState) return;
    this.pendingMainState = state;
    this.applyPendingStateIfReady();
  }

  /**
   * Force the character into a specific main + sub-state immediately.
   * Stops any in-progress movement, releases claimed points, and drives
   * the character toward the target state using the same enter-methods as
   * the normal state machine. Useful for debug/mock controllers.
   */
  forceState(mainState: MainState, subState: SubState): void {
    this.pendingMainState = null;
    this.callbacks.stopMovement();

    const shouldExitFurnitureFirst =
      mainState === "idle" && subState === "standing";
    if (!shouldExitFurnitureFirst) {
      this.releaseCurrentPoint();
    }

    if (mainState === "working") {
      // Both "walking-to-work" and "working" drive the same enter method;
      // it will walk to a desk and settle into "working" on arrival.
      this.enterWalkingToWork();
      return;
    }

    // idle branch
    this.mainState = "idle";

    switch (subState) {
      case "wandering":
        this.subState = "wandering";
        this.notifyStateChanged();
        this.startWandering();
        break;

      case "walking-to-sleep":
      case "sleeping":
        this.subState = "walking-to-sleep";
        this.notifyStateChanged();
        this.enterWalkingToSleep();
        break;

      case "walking-to-sofa":
      case "sitting-on-sofa":
        this.subState = "walking-to-sofa";
        this.notifyStateChanged();
        this.enterWalkingToSofa();
        break;

      case "change-room":
        this.subState = "change-room";
        this.notifyStateChanged();
        this.enterChangeRoom();
        break;

      default:
        // standing (and any unrecognised sub-state)
        this.enterIdleStanding();
        break;
    }
  }

  getMainState(): MainState {
    return this.mainState;
  }

  getSubState(): SubState {
    return this.subState;
  }

  getCurrentRoomId(): string {
    return this.currentRoomId;
  }

  // ---------------------------------------------------------------------------
  // Private: state transitions
  // ---------------------------------------------------------------------------

  private applyPendingStateIfReady(): void {
    if (this.pendingMainState === null) return;
    if (!this.isStableSubState()) return; // still transitioning

    const next = this.pendingMainState;
    this.pendingMainState = null;

    if (next === "working") {
      this.enterWalkingToWork();
    } else if (this.mainState === "working") {
      // Externally set to idle while working — walk away from the office.
      this.enterWalkingFromWork();
    } else {
      this.enterIdleStanding();
    }
  }

  private enterWalkingToWork(): void {
    this.releaseCurrentPoint();
    this.mainState = "working";
    this.subState = "walking-to-work";
    this.notifyStateChanged();

    // Navigate to the office
    const officeId =
      this.config.sharedRoomIds.find((id) => id === "office") ?? "office";

    // Try to claim any available desk in random order
    let claimed: {
      finalPx: { x: number; y: number };
      routePx: { x: number; y: number };
    } | null = null;
    const deskIds = Array.from({ length: 10 }, (_, i) => `desk-${i + 1}`);
    // Fisher-Yates shuffle so each run picks a random free desk
    for (let i = deskIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deskIds[i], deskIds[j]] = [deskIds[j], deskIds[i]];
    }
    for (const deskId of deskIds) {
      claimed = this.callbacks.claimInteractionPoint(deskId, 0);
      if (claimed) {
        this.claimedPoint = { objectId: deskId, pointIndex: 0 };
        break;
      }
    }

    // Fallback: stand anywhere in the office
    if (!claimed) {
      const fallback = this.callbacks.randomWalkableInRoom(officeId);
      if (fallback) claimed = { finalPx: fallback, routePx: fallback };
    }

    if (claimed) {
      this.currentRoomId = officeId;
      this.callbacks.moveTo(claimed.routePx, claimed.finalPx, "fastest", () => {
        this.subState = "working";
        // Reset holdTimer on arrival so the working session is always a full
        // 30–360 s, regardless of how much was left on the previous idle timer.
        this.holdTimer = this.randomHoldMs();
        this.notifyStateChanged();
        this.applyPendingStateIfReady();
      });
    } else {
      // Fallback: just mark as working in place
      this.subState = "working";
      this.notifyStateChanged();
    }
  }

  private enterIdleStanding(): void {
    this.mainState = "idle";
    this.holdTimer = this.randomHoldMs();
    this.callbacks.stopMovement();

    if (this.claimedPoint) {
      // Use a non-stable transitional subState so that any mock "working"
      // signal arriving during the exit tween is queued as pendingMainState
      // rather than immediately re-triggering enterWalkingToWork. Without
      // this, the character oscillates: desk → approach cell → desk → …
      // because applyPendingStateIfReady fires mid-tween while "standing"
      // (stable) and reclaims the desk that was just vacated.
      this.subState = "leaving-work";
      this.notifyStateChanged();
      this.callbacks.exitFurnitureIfNeeded("fastest", () => {
        this.releaseCurrentPoint();
        this.subState = "standing";
        this.notifyStateChanged();
        this.applyPendingStateIfReady();
      });
    } else {
      this.subState = "standing";
      this.notifyStateChanged();
      this.applyPendingStateIfReady();
    }
  }

  private pickNextSubState(): void {
    if (this.mainState !== "idle") return;

    this.releaseCurrentPoint();

    // Choose from possible sub-states based on current room
    const inPrivateRoom = this.currentRoomId === this.config.privateRoomId;
    const canSleep = inPrivateRoom;
    const canSitOnSofa = this.config.sharedRoomIds.includes("living");

    const choices: SubState[] = ["standing", "wandering"];
    if (canSleep) choices.push("walking-to-sleep");
    if (canSitOnSofa) choices.push("walking-to-sofa");
    // 30% chance to change room
    if (Math.random() < 0.3) choices.push("change-room");

    const chosen = choices[Math.floor(Math.random() * choices.length)];

    switch (chosen) {
      case "standing":
        this.subState = "standing";
        this.holdTimer = this.randomHoldMs();
        this.callbacks.stopMovement();
        break;

      case "wandering":
        this.subState = "wandering";
        this.startWandering();
        break;

      case "walking-to-sleep":
        this.subState = "walking-to-sleep";
        this.notifyStateChanged();
        this.enterWalkingToSleep();
        return; // notified early

      case "walking-to-sofa":
        this.subState = "walking-to-sofa";
        this.notifyStateChanged();
        this.enterWalkingToSofa();
        return;

      case "change-room":
        this.subState = "change-room";
        this.notifyStateChanged();
        this.enterChangeRoom();
        return;

      default:
        this.subState = "standing";
        this.holdTimer = this.randomHoldMs();
        this.callbacks.stopMovement();
    }

    this.notifyStateChanged();
  }

  private startWandering(): void {
    const dest = this.callbacks.randomWalkableInRoom(this.currentRoomId);
    if (!dest) {
      this.subState = "standing";
      this.holdTimer = this.randomHoldMs();
      this.notifyStateChanged();
      return;
    }
    this.callbacks.moveTo(dest, dest, "slowest", () => {
      if (this.subState === "wandering") {
        // Defer to break synchronous call-stack recursion; real moveTo is
        // always async (Phaser tween), so this is a no-op in production.
        setTimeout(() => {
          if (this.subState === "wandering") {
            this.startWandering();
          }
        }, 0);
      }
    });
    this.notifyStateChanged();
  }

  private enterWalkingToSleep(): void {
    const bedObjectId = `bed-${this.config.characterId}`;
    const point = this.callbacks.claimInteractionPoint(bedObjectId, 0);
    if (!point) {
      this.enterIdleStanding();
      return;
    }
    this.claimedPoint = { objectId: bedObjectId, pointIndex: 0 };
    this.currentRoomId = this.config.privateRoomId;
    this.callbacks.moveTo(point.routePx, point.finalPx, "normal", () => {
      this.subState = "sleeping";
      this.holdTimer = this.randomHoldMs();
      this.notifyStateChanged();
      this.applyPendingStateIfReady();
    });
  }

  private enterWalkingToSofa(): void {
    const sofaPoints = [0, 1, 2];
    for (let i = sofaPoints.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sofaPoints[i], sofaPoints[j]] = [sofaPoints[j], sofaPoints[i]];
    }

    let claimed: {
      finalPx: { x: number; y: number };
      routePx: { x: number; y: number };
    } | null = null;
    let claimedIndex = -1;

    for (const i of sofaPoints) {
      const pt = this.callbacks.claimInteractionPoint("sofa", i);
      if (pt) {
        claimed = pt;
        claimedIndex = i;
        break;
      }
    }

    if (!claimed) {
      // All sofa spots occupied — fall back to standing
      this.enterIdleStanding();
      return;
    }

    this.claimedPoint = { objectId: "sofa", pointIndex: claimedIndex };
    this.currentRoomId = "living";
    this.callbacks.moveTo(claimed.routePx, claimed.finalPx, "normal", () => {
      this.subState = "sitting-on-sofa";
      this.holdTimer = this.randomHoldMs();
      this.notifyStateChanged();
      this.applyPendingStateIfReady();
    });
  }

  private enterWalkingFromWork(): void {
    // Exit the desk sprite position, then walk to the living room or private
    // room so the character doesn't stand idle in the middle of the office.
    this.mainState = "idle";
    this.subState = "leaving-work";
    this.notifyStateChanged();
    this.callbacks.stopMovement();

    const doWalk = (): void => {
      this.releaseCurrentPoint();

      // 50 % chance to go to private room, 50 % to living room
      const livingId =
        this.config.sharedRoomIds.find((id) => id === "living") ??
        this.config.privateRoomId;
      const destination =
        Math.random() < 0.5 ? this.config.privateRoomId : livingId;

      const target = this.callbacks.randomWalkableInRoom(destination);
      if (!target) {
        this.subState = "standing";
        this.holdTimer = this.randomHoldMs();
        this.notifyStateChanged();
        this.applyPendingStateIfReady();
        return;
      }

      this.subState = "walking-from-work";
      this.notifyStateChanged();

      this.callbacks.moveTo(target, target, "normal", () => {
        this.currentRoomId = destination;
        this.subState = "standing";
        this.holdTimer = this.randomHoldMs();
        this.notifyStateChanged();
        this.applyPendingStateIfReady();
      });
    };

    if (this.claimedPoint) {
      this.callbacks.exitFurnitureIfNeeded("fastest", doWalk);
    } else {
      doWalk();
    }
  }

  private enterChangeRoom(): void {
    const isInPrivate = this.currentRoomId === this.config.privateRoomId;
    const destination = isInPrivate ? "living" : this.config.privateRoomId;

    const dest = this.callbacks.randomWalkableInRoom(destination);
    if (!dest) {
      this.enterIdleStanding();
      return;
    }

    this.callbacks.moveTo(dest, dest, "normal", () => {
      this.currentRoomId = destination;
      this.subState = "standing";
      this.holdTimer = this.randomHoldMs();
      this.notifyStateChanged();
      this.applyPendingStateIfReady();
    });
  }

  // ---------------------------------------------------------------------------
  // Private: helpers
  // ---------------------------------------------------------------------------

  private isStableSubState(): boolean {
    return (
      STABLE_IDLE_SUBSTATES.includes(this.subState) ||
      this.subState === "working"
    );
  }

  private releaseCurrentPoint(): void {
    if (this.claimedPoint) {
      this.callbacks.releaseInteractionPoint(
        this.claimedPoint.objectId,
        this.claimedPoint.pointIndex,
      );
      this.claimedPoint = null;
    }
  }

  private randomHoldMs(): number {
    return MIN_HOLD_MS + Math.random() * (MAX_HOLD_MS - MIN_HOLD_MS);
  }

  private notifyStateChanged(): void {
    this.callbacks.onStateChanged(
      this.mainState,
      this.subState,
      this.currentRoomId,
    );
  }
}
