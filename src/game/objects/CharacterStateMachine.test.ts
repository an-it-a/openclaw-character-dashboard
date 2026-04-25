import { describe, it, expect, vi, beforeEach } from "vitest";

import { CharacterStateMachine } from "./CharacterStateMachine";
import type {
  StateMachineCallbacks,
  CharacterStateMachineConfig,
} from "./CharacterStateMachine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCallbacks(
  overrides?: Partial<StateMachineCallbacks>,
): StateMachineCallbacks {
  return {
    moveTo: vi.fn((_routePx, _finalPx, _speed, onArrived) => {
      // Default: call onArrived immediately so tests can drive transitions
      onArrived();
    }),
    stopMovement: vi.fn(),
    onStateChanged: vi.fn(),
    randomWalkableInRoom: vi.fn(() => ({ x: 100, y: 100 })),
    claimInteractionPoint: vi.fn(() => ({
      finalPx: { x: 50, y: 50 },
      routePx: { x: 50, y: 50 },
    })),
    releaseInteractionPoint: vi.fn(),
    exitFurnitureIfNeeded: vi.fn((_speed, onDone: () => void) => onDone()),
    getInteractionPointPx: vi.fn(() => ({
      finalPx: { x: 50, y: 50 },
      routePx: { x: 50, y: 50 },
    })),
    ...overrides,
  };
}

function makeConfig(
  overrides?: Partial<CharacterStateMachineConfig>,
): CharacterStateMachineConfig {
  return {
    characterId: "alice",
    privateRoomId: "private-alice",
    sharedRoomIds: ["office", "living"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CharacterStateMachine", () => {
  let callbacks: StateMachineCallbacks;
  let config: CharacterStateMachineConfig;

  beforeEach(() => {
    callbacks = makeCallbacks();
    config = makeConfig();
  });

  it("starts in idle/standing in private room", () => {
    const sm = new CharacterStateMachine(config, callbacks);
    expect(sm.getMainState()).toBe("idle");
    expect(sm.getSubState()).toBe("standing");
    expect(sm.getCurrentRoomId()).toBe("private-alice");
  });

  it("transitions to working/walking-to-work when external state → working", () => {
    const sm = new CharacterStateMachine(config, callbacks);
    sm.setExternalState("working");
    expect(sm.getMainState()).toBe("working");
    // moveTo is called (immediately onArrived), so subState advances to working
    expect(sm.getSubState()).toBe("working");
  });

  it("calls moveTo with fastest speed when walking-to-work", () => {
    const sm = new CharacterStateMachine(config, callbacks);
    // Prevent immediate arrival so we can inspect mid-transition
    const deferredCallbacks = makeCallbacks({
      moveTo: vi.fn(), // never calls onArrived
    });
    const sm2 = new CharacterStateMachine(config, deferredCallbacks);
    sm2.setExternalState("working");
    expect(deferredCallbacks.moveTo).toHaveBeenCalledWith(
      expect.objectContaining({ x: expect.any(Number) }),
      expect.objectContaining({ x: expect.any(Number) }),
      "fastest",
      expect.any(Function),
    );
    void sm; // suppress unused var warning
  });

  it("transitions to idle/standing when external state → idle while working", () => {
    const sm = new CharacterStateMachine(config, callbacks);
    sm.setExternalState("working");
    sm.setExternalState("idle");
    expect(sm.getMainState()).toBe("idle");
    expect(sm.getSubState()).toBe("standing");
  });

  it("calls onStateChanged whenever state changes", () => {
    const sm = new CharacterStateMachine(config, callbacks);
    sm.setExternalState("working");
    expect(callbacks.onStateChanged).toHaveBeenCalled();
  });

  it("timer below MIN_HOLD does not trigger sub-state change", () => {
    const sm = new CharacterStateMachine(config, callbacks);
    // Tick less than 30 s
    sm.tick(29_000);
    expect(sm.getSubState()).toBe("standing");
  });

  it("timer exceeding MAX_HOLD triggers sub-state change", () => {
    const sm = new CharacterStateMachine(config, callbacks);
    // Force the timer to expire
    sm.tick(361_000);
    // Sub-state changed (could be any idle sub-state)
    expect(callbacks.onStateChanged).toHaveBeenCalled();
  });

  it("falls back to idle/standing when all sofa points are occupied", () => {
    const noSofaCallbacks = makeCallbacks({
      claimInteractionPoint: vi.fn(() => null), // all occupied
    });
    const sm = new CharacterStateMachine(config, noSofaCallbacks);
    sm.setExternalState("idle");
    // Manually force walking-to-sofa by ticking into a state change
    // We can verify the fallback by directly testing the internal path:
    // since claimInteractionPoint returns null, it should fall back to standing
    sm.tick(361_000);
    // Should not be stuck in walking-to-sofa
    expect(sm.getSubState()).not.toBe("walking-to-sofa");
  });

  it("claims another free sofa point when an earlier one is occupied", () => {
    const pointOne = {
      finalPx: { x: 120, y: 220 },
      routePx: { x: 128, y: 224 },
    };
    const claimInteractionPoint = vi.fn(
      (_objectId: string, pointIndex: number) => {
        if (pointIndex === 1) return pointOne;
        return null;
      },
    );
    const sofaCallbacks = makeCallbacks({ claimInteractionPoint });
    const sm = new CharacterStateMachine(config, sofaCallbacks);

    sm.forceState("idle", "sitting-on-sofa");

    expect(claimInteractionPoint).toHaveBeenCalledWith("sofa", 1);
    expect(sofaCallbacks.moveTo).toHaveBeenCalledWith(
      pointOne.routePx,
      pointOne.finalPx,
      "normal",
      expect.any(Function),
    );
    expect(sm.getSubState()).toBe("sitting-on-sofa");
    expect(sm.getCurrentRoomId()).toBe("living");
  });

  it("exits the sofa before forcing idle/standing", () => {
    const sofaCallbacks = makeCallbacks();
    const sm = new CharacterStateMachine(config, sofaCallbacks);

    sm.forceState("idle", "sitting-on-sofa");
    sm.forceState("idle", "standing");

    expect(sofaCallbacks.exitFurnitureIfNeeded).toHaveBeenCalledWith(
      "fastest",
      expect.any(Function),
    );
    expect(sofaCallbacks.releaseInteractionPoint).toHaveBeenCalledWith(
      "sofa",
      expect.any(Number),
    );
    expect(sm.getSubState()).toBe("standing");
  });

  it("after work session timer expires, character walks to living or private room (not standing in office)", () => {
    // Use deferred moveTo so we can observe the intermediate subState
    const arrival = { fn: null as (() => void) | null };
    const deferredCallbacks = makeCallbacks({
      moveTo: vi.fn((_routePx, _finalPx, _speed, onArrived: () => void) => {
        arrival.fn = onArrived;
      }),
    });
    const sm = new CharacterStateMachine(config, deferredCallbacks);
    sm.setExternalState("working");
    // Simulate work moveTo completing (desk arrival)
    arrival.fn?.();
    expect(sm.getSubState()).toBe("working");

    // Expire the work timer — should enter leaving-work then walking-from-work
    sm.tick(361_000);
    // While deferred moveTo hasn't resolved, subState is "walking-from-work"
    expect(sm.getSubState()).toBe("walking-from-work");
    expect(sm.getMainState()).toBe("idle");

    // Simulate arrival at destination
    arrival.fn?.();
    expect(sm.getSubState()).toBe("standing");
    // Must NOT be in the office any more
    expect(sm.getCurrentRoomId()).not.toBe("office");
  });

  it("when external idle arrives while working, character walks away from office", () => {
    const arrival = { fn: null as (() => void) | null };
    const deferredCallbacks = makeCallbacks({
      moveTo: vi.fn((_routePx, _finalPx, _speed, onArrived: () => void) => {
        arrival.fn = onArrived;
      }),
    });
    const sm = new CharacterStateMachine(config, deferredCallbacks);
    sm.setExternalState("working");
    arrival.fn?.(); // arrive at desk
    expect(sm.getSubState()).toBe("working");

    sm.setExternalState("idle");
    // Should be in a non-office walk subState
    expect(["leaving-work", "walking-from-work"]).toContain(sm.getSubState());
    expect(sm.getMainState()).toBe("idle");
  });

  it("does not call moveTo while already in a non-stable transition", () => {
    const deferredMove = vi.fn(); // never calls onArrived
    const deferredCallbacks = makeCallbacks({ moveTo: deferredMove });
    const sm = new CharacterStateMachine(config, deferredCallbacks);
    sm.setExternalState("working"); // starts moving
    const firstCallCount = deferredMove.mock.calls.length;
    sm.setExternalState("idle"); // queued — cannot apply yet
    // moveTo should not have been called again
    expect(deferredMove.mock.calls.length).toBe(firstCallCount);
  });
});
