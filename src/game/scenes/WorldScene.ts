import Phaser from "phaser";

import { WorldMap, DEPTH } from "@/game/WorldMap";
import { CharacterSprite } from "@/game/objects/CharacterSprite";
import { CharacterStateMachine } from "@/game/objects/CharacterStateMachine";
import type { StateMachineCallbacks } from "@/game/objects/CharacterStateMachine";
import { CollisionGrid, GRID_CELL } from "@/game/pathfinding/CollisionGrid";
import { PathFinder } from "@/game/pathfinding/PathFinder";
import { LiveDataSource } from "@/data/live";
import { useWorldStore } from "@/store/worldStore";
import { useCharacterStore } from "@/store/characterStore";
import { MockDataSource } from "@/data/mock";
import type { DataSource } from "@/data/mock";
import type { MainState, SubState } from "@/store/characterStore";
import type { WorldConfig, WorldObject } from "@/types/world";

const SOFA_HANDOFF_DELAY_MS = 3_000;

// ---------------------------------------------------------------------------
// Internal per-character record
// ---------------------------------------------------------------------------

type CharacterRecord = {
  sprite: CharacterSprite;
  machine: CharacterStateMachine;
  mainState: MainState;
  subState: SubState;
  /** The walkable cell the character should tween back to before A* can run,
   *  set when the character's finalPx lands inside a blocked cell (e.g. bed,
   *  desk). Cleared once the exit tween completes. */
  furnitureExitPx: { x: number; y: number } | null;
  sofaSeatedAt: number | null;
  sofaLeaveTimer: Phaser.Time.TimerEvent | null;
};

/**
 * WorldScene
 *
 * Responsibilities:
 * - Build and render the full map from WorldConfig via WorldMap
 * - Spawn CharacterSprite instances
 * - Create CollisionGrid + PathFinder; build StateMachine callbacks
 * - Wire data source (mock/live) → CharacterStateMachine.setExternalState
 * - Wire click events → Zustand inspectorSelection
 * - Run the game loop (update → tick state machines)
 */
export class WorldScene extends Phaser.Scene {
  private worldMap!: WorldMap;
  private config!: WorldConfig;
  private collisionGrid!: CollisionGrid;
  private pathFinder!: PathFinder;
  private characters: Map<string, CharacterRecord> = new Map();
  private characterIdByAgentId: Map<string, string> = new Map();
  private dataSource: DataSource | null = null;

  /** Flat index: objectId → WorldObject (built once on create) */
  private objectIndex: Map<string, WorldObject> = new Map();

  /**
   * Occupancy map: pointKey ("objectId:pointIndex") → characterId.
   *
   * Stored as a plain Map (not in Zustand) so that claim/release are
   * guaranteed to be synchronous and serialised — no risk of React 18
   * automatic-batching deferring the functional-set snapshot between two
   * consecutive claimPoint calls.
   */
  private occupiedPoints: Map<string, string> = new Map();

  constructor() {
    super({ key: "WorldScene" });
  }

  // ---------------------------------------------------------------------------
  // Phaser lifecycle
  // ---------------------------------------------------------------------------

  create(): void {
    const config = useWorldStore.getState().worldConfig;
    if (!config) {
      console.error("[WorldScene] worldConfig not available");
      return;
    }
    this.config = config;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearSofaTimers();
    });

    // --- Static map ---
    this.worldMap = new WorldMap(this, config);
    this.worldMap.build();

    // --- Pathfinding ---
    this.collisionGrid = new CollisionGrid(config);
    this.pathFinder = new PathFinder(this.collisionGrid);

    // --- Object index (all rooms, all objects) ---
    for (const room of config.rooms) {
      for (const obj of room.objects) {
        this.objectIndex.set(obj.id, obj);
      }
    }

    // --- Characters ---
    for (const char of config.characters) {
      this.characterIdByAgentId.set(char.agentId, char.id);

      // Determine the private room and pick a spawn position inside it
      const privateRoom = config.rooms.find((r) => r.id === char.privateRoomId);
      const spawnPx = privateRoom
        ? {
            x: privateRoom.x + privateRoom.width / 2,
            y: privateRoom.y + privateRoom.height / 2,
          }
        : { x: 100, y: 100 };

      const sprite = new CharacterSprite(
        this,
        spawnPx.x,
        spawnPx.y,
        char,
        "inside",
      );

      // Shared rooms available to all characters (office + living)
      const sharedRoomIds = config.rooms
        .filter((r) => !r.id.startsWith("private-") && r.id !== "corridor")
        .map((r) => r.id);

      const machine = new CharacterStateMachine(
        {
          characterId: char.id,
          privateRoomId: char.privateRoomId,
          sharedRoomIds,
        },
        this.buildCallbacks(char.id, sprite),
      );

      this.characters.set(char.id, {
        sprite,
        machine,
        mainState: "idle",
        subState: "standing",
        furnitureExitPx: null,
        sofaSeatedAt: null,
        sofaLeaveTimer: null,
      });

      // Kick off the initial random idle sub-state
      machine.start();

      // Initialise store state
      useCharacterStore.getState().setCharacterState({
        characterId: char.id,
        mainState: "idle",
        subState: "standing",
        currentRoomId: char.privateRoomId,
      });

      // Wire character sprite click → inspector
      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => {
        if (
          useWorldStore.getState().inspectorSelection?.type === "resource-wall"
        )
          return;
        useWorldStore
          .getState()
          .setInspectorSelection({ type: "character", characterId: char.id });
      });
    }

    // --- Object / room click events from WorldMap ---
    this.events.on("objectClicked", (obj: WorldObject) => {
      if (obj.id === "resource-wall") {
        useWorldStore
          .getState()
          .setInspectorSelection({ type: "resource-wall" });
      } else {
        // Find which room owns this object
        const owningRoom = config.rooms.find((r) =>
          r.objects.some((o) => o.id === obj.id),
        );
        if (owningRoom) {
          useWorldStore
            .getState()
            .setInspectorSelection({ type: "room", roomId: owningRoom.id });
        }
      }
    });

    // --- Data source ---
    const isMockMode = useWorldStore.getState().isMockMode;
    this.startDataSource(isMockMode);

    // Re-start data source if mock mode is toggled while the scene is active
    useWorldStore.subscribe((state, prev) => {
      if (state.isMockMode !== prev.isMockMode) {
        this.startDataSource(state.isMockMode);
      }
    });

    // Forward forced states from the debug controller to the relevant machine
    useCharacterStore.subscribe((state, prev) => {
      if (state.pendingForce && state.pendingForce !== prev.pendingForce) {
        const { characterId, mainState, subState } = state.pendingForce;
        this.characters
          .get(characterId)
          ?.machine.forceState(mainState, subState);
        useCharacterStore.getState().clearPendingForce();
      }
    });
  }

  update(_time: number, delta: number): void {
    for (const [, { sprite, machine }] of this.characters.entries()) {
      machine.tick(delta);

      // Y-sort: update depth every frame so characters render correctly relative
      // to furniture as they move. sprite.y is the feet position (origin 0.5, 1).
      sprite.setDepth(DEPTH.Y_SORT_BASE + sprite.y);

      // Switch inside/outside variant every frame based on pixel position so
      // the sprite updates during mid-walk transitions (not only on state change).
      const isInPrivate = this.config.rooms.some(
        (r) =>
          r.id.startsWith("private-") &&
          sprite.x >= r.x &&
          sprite.x < r.x + r.width &&
          sprite.y >= r.y &&
          sprite.y < r.y + r.height,
      );
      sprite.switchVariant(isInPrivate ? "inside" : "outside");
    }
  }

  // ---------------------------------------------------------------------------
  // Data source management
  // ---------------------------------------------------------------------------

  private startDataSource(isMockMode: boolean): void {
    // Stop existing source first
    if (this.dataSource) {
      this.dataSource.stop();
      this.dataSource = null;
    }

    const agentIds = this.config.characters.map((c) => c.agentId);
    const handleStateChange = ({
      agentId,
      state,
    }: {
      agentId: string;
      state: MainState;
    }): void => {
      const characterId = this.characterIdByAgentId.get(agentId);
      if (!characterId) {
        return;
      }

      this.characters.get(characterId)?.machine.setExternalState(state);
    };

    if (isMockMode) {
      const mock = new MockDataSource(agentIds);
      mock.on("stateChange", handleStateChange);
      mock.start();
      this.dataSource = mock;
      return;
    }

    const live = new LiveDataSource(agentIds);
    live.on("stateChange", handleStateChange);
    live.start();
    this.dataSource = live;
  }

  // ---------------------------------------------------------------------------
  // StateMachine callback factory
  // ---------------------------------------------------------------------------

  private buildCallbacks(
    characterId: string,
    sprite: CharacterSprite,
  ): StateMachineCallbacks {
    return {
      moveTo: (routePx, finalPx, speed, onArrived) => {
        const record = this.characters.get(characterId);
        if (!record) {
          onArrived();
          return;
        }

        const doMove = () => {
          const start = this.collisionGrid.worldToGrid(sprite.x, sprite.y);
          const end = this.collisionGrid.worldToGrid(routePx.x, routePx.y);
          const gridPath = this.pathFinder.findPath(start, end);

          if (!gridPath || gridPath.length === 0) {
            onArrived();
            return;
          }

          // If finalPx lands inside a blocked cell, remember routePx as the
          // exit waypoint so the next moveTo can tween out before pathfinding.
          const finalGrid = this.collisionGrid.worldToGrid(
            finalPx.x,
            finalPx.y,
          );
          record.furnitureExitPx = !this.collisionGrid.isWalkable(
            finalGrid.gx,
            finalGrid.gy,
          )
            ? routePx
            : null;

          this.walkPath(sprite, gridPath, 0, finalPx, speed, onArrived);
        };

        // If the character is currently inside a blocked cell (sitting at a
        // desk or lying on a bed), tween back to the recorded approach cell
        // before running A* from open floor.
        const currentGrid = this.collisionGrid.worldToGrid(sprite.x, sprite.y);
        if (
          !this.collisionGrid.isWalkable(currentGrid.gx, currentGrid.gy) &&
          record.furnitureExitPx
        ) {
          const exitPx = record.furnitureExitPx;
          record.furnitureExitPx = null;
          sprite.tweenTo(exitPx.x, exitPx.y, speed, doMove);
        } else {
          doMove();
        }
      },

      stopMovement: () => {
        sprite.stopMovement();
      },

      onStateChanged: (mainState, subState, roomId) => {
        const record = this.characters.get(characterId);
        if (record) {
          record.mainState = mainState;
          record.subState = subState;
          this.handleSofaStateChange(characterId, subState);
        }

        useCharacterStore.getState().setCharacterState({
          characterId,
          mainState,
          subState,
          currentRoomId: roomId,
        });

        // Switch inside/outside variant based on room type
        const isPrivate = roomId.startsWith("private-");
        sprite.switchVariant(isPrivate ? "inside" : "outside");

        // Play the appropriate animation clip for stable (non-walking) states
        switch (subState) {
          case "working":
            sprite.playClip("work");
            break;
          case "sleeping":
            sprite.playClip("sleep");
            break;
          case "sitting-on-sofa":
            sprite.playClip("sit");
            break;
          case "standing":
            sprite.playClip("stand");
            break;
          // Walking / transition sub-states: clip is driven by tweenTo()
        }
      },

      randomWalkableInRoom: (roomId) => {
        const room = this.config.rooms.find((r) => r.id === roomId);
        if (!room) return null;

        // Try up to 20 random cells inside the room bounds
        for (let attempt = 0; attempt < 20; attempt++) {
          const px = room.x + Math.random() * room.width;
          const py = room.y + Math.random() * room.height;
          const { gx, gy } = this.collisionGrid.worldToGrid(px, py);
          if (
            this.collisionGrid.isWalkable(gx, gy) &&
            !this.collisionGrid.isDoorCell(gx, gy)
          ) {
            const center = this.collisionGrid.gridCenterToWorld(gx, gy);
            return { x: center.px, y: center.py };
          }
        }

        // Fallback: use nearestWalkable from room centre
        const cx = room.x + room.width / 2;
        const cy = room.y + room.height / 2;
        const nearest = this.collisionGrid.nearestWalkable(cx, cy);
        if (!nearest) return null;
        const center = this.collisionGrid.gridCenterToWorld(
          nearest.gx,
          nearest.gy,
        );
        return { x: center.px, y: center.py };
      },

      claimInteractionPoint: (objectId, pointIndex) => {
        const obj = this.objectIndex.get(objectId);
        if (!obj?.interactionPoints) return null;
        const pt = obj.interactionPoints[pointIndex];
        if (!pt) return null;

        const pointKey = `${objectId}:${pointIndex}`;
        // Use the plain Map for atomic claim — guaranteed synchronous, no
        // React-18 batching can interleave between the has-check and the set.
        if (this.occupiedPoints.has(pointKey)) return null;
        this.occupiedPoints.set(pointKey, characterId);

        return this.resolveInteractionPointPx(obj, pt);
      },

      releaseInteractionPoint: (objectId, pointIndex) => {
        const pointKey = `${objectId}:${pointIndex}`;
        if (this.occupiedPoints.get(pointKey) === characterId) {
          this.occupiedPoints.delete(pointKey);
        }
      },

      exitFurnitureIfNeeded: (speed, onDone) => {
        const record = this.characters.get(characterId);
        if (!record) {
          onDone();
          return;
        }
        const { gx, gy } = this.collisionGrid.worldToGrid(sprite.x, sprite.y);
        if (!this.collisionGrid.isWalkable(gx, gy) && record.furnitureExitPx) {
          // Character is still inside a blocked cell — tween to the recorded
          // approach cell first, then notify the caller.
          const exitPx = record.furnitureExitPx;
          record.furnitureExitPx = null;
          sprite.tweenTo(exitPx.x, exitPx.y, speed, onDone);
        } else {
          onDone();
        }
      },

      getInteractionPointPx: (objectId, pointIndex) => {
        const obj = this.objectIndex.get(objectId);
        if (!obj?.interactionPoints) return null;
        const pt = obj.interactionPoints[pointIndex];
        if (!pt) return null;
        return this.resolveInteractionPointPx(obj, pt);
      },
    };
  }

  private handleSofaStateChange(characterId: string, subState: SubState): void {
    const record = this.characters.get(characterId);
    if (!record) {
      return;
    }

    if (subState !== "sitting-on-sofa") {
      record.sofaSeatedAt = null;
      this.clearSofaLeaveTimer(record);
      return;
    }

    record.sofaSeatedAt = this.time.now;
    this.clearSofaLeaveTimer(record);

    let previousSitterId: string | null = null;
    let earliestSeatTime = Number.POSITIVE_INFINITY;

    for (const [otherCharacterId, otherRecord] of this.characters.entries()) {
      if (
        otherCharacterId === characterId ||
        otherRecord.subState !== "sitting-on-sofa" ||
        otherRecord.sofaSeatedAt === null
      ) {
        continue;
      }

      if (otherRecord.sofaSeatedAt < earliestSeatTime) {
        earliestSeatTime = otherRecord.sofaSeatedAt;
        previousSitterId = otherCharacterId;
      }
    }

    if (!previousSitterId) {
      return;
    }

    this.scheduleSofaDeparture(previousSitterId);
  }

  private scheduleSofaDeparture(characterId: string): void {
    const record = this.characters.get(characterId);
    if (!record || record.sofaLeaveTimer) {
      return;
    }

    record.sofaLeaveTimer = this.time.delayedCall(SOFA_HANDOFF_DELAY_MS, () => {
      record.sofaLeaveTimer = null;
      if (record.subState !== "sitting-on-sofa") {
        return;
      }

      record.machine.forceState("idle", "standing");
    });
  }

  private clearSofaLeaveTimer(record: CharacterRecord): void {
    record.sofaLeaveTimer?.remove(false);
    record.sofaLeaveTimer = null;
  }

  private clearSofaTimers(): void {
    for (const [, record] of this.characters.entries()) {
      this.clearSofaLeaveTimer(record);
    }
  }

  // ---------------------------------------------------------------------------
  // Interaction point resolution
  // ---------------------------------------------------------------------------

  /**
   * Converts a raw InteractionPoint (relative offsets) into absolute pixel
   * coordinates, returning both the exact final position and the A* route
   * target.
   *
   * - finalPx: exact pixel where the character sprite should end up
   *   (may be inside a blocked cell, e.g. on a bed or sofa).
   * - routePx: the cell-centre the pathfinder should route to before the
   *   final sub-cell tween. When approachFrom is set this is the centre of
   *   the adjacent walkable cell on that side; otherwise it equals finalPx
   *   and the pathfinder falls back to its own nearest-walkable logic.
   *
   * Interaction points use (left-edge x, vertical-centre y) as their
   * reference. The sprite origin is (0.5, 1) — bottom-centre — so we add
   * half the sprite width (+24) and half the sprite height (+32) to convert.
   */
  private resolveInteractionPointPx(
    obj: import("@/types/world").WorldObject,
    pt: import("@/types/world").InteractionPoint,
  ): { finalPx: { x: number; y: number }; routePx: { x: number; y: number } } {
    const finalPx = { x: obj.x + pt.x + 24, y: obj.y + pt.y + 32 };

    if (!pt.approachFrom) {
      return { finalPx, routePx: finalPx };
    }

    // Compute the grid cell centre adjacent to the furniture on the specified side.
    let approachGridX: number;
    let approachGridY: number;

    switch (pt.approachFrom) {
      case "top":
        approachGridX = Math.floor(finalPx.x / GRID_CELL);
        approachGridY = Math.floor(obj.y / GRID_CELL) - 1;
        break;
      case "bottom":
        approachGridX = Math.floor(finalPx.x / GRID_CELL);
        approachGridY = Math.ceil((obj.y + obj.height) / GRID_CELL);
        break;
      case "left":
        approachGridX = Math.floor(obj.x / GRID_CELL) - 1;
        approachGridY = Math.floor(finalPx.y / GRID_CELL);
        break;
      case "right":
        approachGridX = Math.ceil((obj.x + obj.width) / GRID_CELL);
        approachGridY = Math.floor(finalPx.y / GRID_CELL);
        break;
    }

    // If the computed cell is not walkable (e.g. another object there),
    // fall back to nearest walkable to avoid getting stuck.
    const approachCenter = this.collisionGrid.gridCenterToWorld(
      approachGridX,
      approachGridY,
    );
    const routeGrid = this.collisionGrid.isWalkable(
      approachGridX,
      approachGridY,
    )
      ? { px: approachCenter.px, py: approachCenter.py }
      : (() => {
          const nearest = this.collisionGrid.nearestWalkable(
            approachCenter.px,
            approachCenter.py,
          );
          return nearest
            ? this.collisionGrid.gridCenterToWorld(nearest.gx, nearest.gy)
            : approachCenter;
        })();

    return { finalPx, routePx: { x: routeGrid.px, y: routeGrid.py } };
  }

  // ---------------------------------------------------------------------------
  // Path-walking helper
  // ---------------------------------------------------------------------------

  /**
   * Recursively walks through grid waypoints, then does a final pixel-precise
   * tween to the exact interaction-point position (which may be sub-cell).
   */
  private walkPath(
    sprite: CharacterSprite,
    gridPath: Array<{ gx: number; gy: number }>,
    index: number,
    finalPx: { x: number; y: number },
    speed: "fastest" | "normal" | "slowest",
    onDone: () => void,
  ): void {
    if (index >= gridPath.length) {
      // All grid waypoints reached — final sub-cell tween to exact interaction-
      // point pixel. The target may be inside a blocked cell (e.g. on a bed or
      // sofa); that is intentional — pathfinding only routes around objects,
      // but the character is visually snapped onto them for the animation.
      const dx = finalPx.x - sprite.x;
      const dy = finalPx.y - sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < GRID_CELL / 4) {
        onDone();
      } else {
        sprite.tweenTo(finalPx.x, finalPx.y, speed, onDone);
      }
      return;
    }

    const wp = gridPath[index];
    const center = this.collisionGrid.gridCenterToWorld(wp.gx, wp.gy);

    sprite.tweenTo(center.px, center.py, speed, () => {
      this.walkPath(sprite, gridPath, index + 1, finalPx, speed, onDone);
    });
  }
}
