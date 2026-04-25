import Phaser from "phaser";

import type { Room, TileSet, WorldConfig, WorldObject } from "@/types/world";
import { useWorldStore } from "@/store/worldStore";

function objectAnimationKey(obj: WorldObject): string {
  return `world-object-anim:${obj.id}`;
}

// ---------------------------------------------------------------------------
// Depth constants (rendering layer order from spec)
// ---------------------------------------------------------------------------

export const DEPTH = {
  FLOOR: 0,
  WALL: 1,
  FLOOR_DECOR: 2,
  /** Doors sit just above walls — always behind characters. */
  DOOR: 1.5,
  /** Base for Y-sorted objects and characters. Add the object/sprite's anchor
   *  Y pixel to get the final depth. Keeps all Y-sorted items well above the
   *  fixed floor/wall/decor layers (max canvas height is 760, so Y_SORT_BASE
   *  of 1000 provides a safe gap). */
  Y_SORT_BASE: 1000,
  WALL_BORDER: 3.5,
} as const;

const WALL_BORDER_THICKNESS = 10;
const WALL_BORDER_COLOR = 0x2a2a4a;

/**
 * WorldMap
 *
 * Renders all rooms and their objects from a WorldConfig using Phaser
 * GameObjects. Does not own any character rendering — that lives in
 * CharacterSprite (Phase 4).
 */
export class WorldMap {
  private scene: Phaser.Scene;
  private config: WorldConfig;

  constructor(scene: Phaser.Scene, config: WorldConfig) {
    this.scene = scene;
    this.config = config;
  }

  build(): void {
    for (const room of this.config.rooms) {
      this.renderRoom(room);
    }
    this.drawWallBorders();
  }

  // ---------------------------------------------------------------------------
  // Private: room rendering
  // ---------------------------------------------------------------------------

  private renderRoom(room: Room): void {
    // Sort objects by layer depth so they're drawn in the correct order
    const sorted = [...room.objects].sort(
      (a, b) => this.depthOf(a) - this.depthOf(b),
    );

    for (const obj of sorted) {
      this.renderObject(obj);
    }
  }

  private renderObject(obj: WorldObject): void {
    if (obj.tiles) {
      this.renderTiledObject(obj);
      return;
    }

    if (!obj.asset) return; // doors / collision-only walls have no sprite

    const key = obj.asset.replace(/^\//, "");

    // Check the texture was successfully loaded; skip gracefully if not
    if (!this.scene.textures.exists(key)) return;

    if (obj.animation) {
      this.renderAnimatedObject(obj, key);
      return;
    }

    const image = this.scene.add
      .image(obj.x, obj.y, key)
      .setOrigin(0, 0)
      .setDepth(this.depthOf(obj));

    // Scale the image to the declared size in case it differs from the texture size
    const tex = this.scene.textures.get(key);
    const src = tex.getSourceImage();
    if (src.width > 0 && src.height > 0) {
      image.setScale(obj.width / src.width, obj.height / src.height);
    }

    this.makeObjectInteractive(obj, image);
  }

  private renderAnimatedObject(obj: WorldObject, key: string): void {
    const { animation } = obj;
    if (!animation) return;

    const animationKey = objectAnimationKey(obj);
    if (!this.scene.anims.exists(animationKey)) {
      const start = animation.startFrame ?? 0;
      const end = start + animation.frameCount - 1;
      this.scene.anims.create({
        key: animationKey,
        frames: this.scene.anims.generateFrameNumbers(key, { start, end }),
        frameRate: animation.frameRate ?? 1000 / animation.frameDurationMs!,
        repeat: animation.repeat ?? -1,
        yoyo: animation.yoyo ?? false,
        delay: animation.delayMs ?? 0,
      });
    }

    const sprite = this.scene.add
      .sprite(obj.x, obj.y, key)
      .setOrigin(0, 0)
      .setDepth(this.depthOf(obj));

    const tex = this.scene.textures.get(key);
    const frame = tex.get(0);
    if (frame.width > 0 && frame.height > 0) {
      sprite.setDisplaySize(obj.width, obj.height);
    }

    sprite.play(animationKey);
    this.makeObjectInteractive(obj, sprite);
  }

  private makeObjectInteractive(
    obj: WorldObject,
    gameObject: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  ): void {
    // Make room objects and furniture interactive for inspector clicks
    if (obj.type === "object" || obj.type === "furniture") {
      gameObject.setInteractive({ useHandCursor: true });
      gameObject.on("pointerdown", () => {
        if (
          useWorldStore.getState().inspectorSelection?.type === "resource-wall"
        )
          return;
        // Emits a scene-level event; WorldScene or React components can listen
        this.scene.events.emit("objectClicked", obj);
      });
    }
  }

  /**
   * Renders a tiled surface using left/center/right cap stamps.
   *
   * Single-row mode (walls, corridor-floor):
   *   [left cap] [tileSprite center ...] [right cap]
   *
   * Floor mode (office-floor, living-floor) — adds an optional bottom edge row:
   *   Interior rows (height - tileHeight):
   *     [left cap] [tileSprite center ...] [right cap]
   *   Bottom row (tileHeight tall, only when bottom* variants are supplied):
   *     [bottomLeft cap] [tileSprite bottom ...] [bottomRight cap]
   */
  private renderTiledObject(obj: WorldObject): void {
    const tiles = obj.tiles as TileSet;
    const depth = this.depthOf(obj);
    const { tileWidth, tileHeight } = tiles;

    const hasBottomRow =
      tiles.bottom !== undefined ||
      tiles.bottomLeft !== undefined ||
      tiles.bottomRight !== undefined;

    const interiorHeight = hasBottomRow ? obj.height - tileHeight : obj.height;

    // Helper: stamp a single cap image
    const stamp = (assetPath: string, x: number, y: number): void => {
      const key = assetPath.replace(/^\//, "");
      if (!this.scene.textures.exists(key)) return;
      this.scene.add.image(x, y, key).setOrigin(0, 0).setDepth(depth);
    };

    // Helper: place a tileSprite for the center portion
    const tileCenter = (
      assetPath: string,
      x: number,
      y: number,
      w: number,
      h: number,
    ): void => {
      if (w <= 0 || h <= 0) return;
      const key = assetPath.replace(/^\//, "");
      if (!this.scene.textures.exists(key)) return;
      this.scene.add
        .tileSprite(x, y, w, h, key)
        .setOrigin(0, 0)
        .setDepth(depth);
    };

    // Compute widths for the interior row, accounting for caps
    const leftW = tiles.left !== undefined ? tileWidth : 0;
    const rightW = tiles.right !== undefined ? tileWidth : 0;
    const centerW = obj.width - leftW - rightW;

    // --- Interior rows ---
    if (tiles.left !== undefined)
      tileCenter(tiles.left, obj.x, obj.y, leftW, interiorHeight);
    tileCenter(tiles.center, obj.x + leftW, obj.y, centerW, interiorHeight);
    if (tiles.right !== undefined)
      tileCenter(
        tiles.right,
        obj.x + obj.width - tileWidth,
        obj.y,
        rightW,
        interiorHeight,
      );

    // --- Bottom row (floors only) ---
    if (hasBottomRow) {
      const by = obj.y + interiorHeight;
      const blW = tiles.bottomLeft !== undefined ? tileWidth : 0;
      const brW = tiles.bottomRight !== undefined ? tileWidth : 0;
      const bcW = obj.width - blW - brW;

      if (tiles.bottomLeft !== undefined) stamp(tiles.bottomLeft, obj.x, by);
      if (tiles.bottom !== undefined)
        tileCenter(tiles.bottom, obj.x + blW, by, bcW, tileHeight);
      if (tiles.bottomRight !== undefined)
        stamp(tiles.bottomRight, obj.x + obj.width - tileWidth, by);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: wall border lines
  // ---------------------------------------------------------------------------

  private drawWallBorders(): void {
    const graphics = this.scene.add.graphics().setDepth(DEPTH.WALL_BORDER);
    graphics.fillStyle(WALL_BORDER_COLOR, 1);

    // Collect every door from every room into a single flat list so that
    // shared edges (e.g. office-bottom / living-top) can be gapped by doors
    // that belong to either adjacent room.
    const allDoors: WorldObject[] = this.config.rooms.flatMap((r) =>
      r.objects.filter((o) => o.type === "door"),
    );

    // Strategy: draw each room's TOP and LEFT border only.
    // This ensures every shared interior wall is drawn exactly once.
    // After all rooms, patch the canvas right and bottom exterior edges.
    const { canvasWidth, canvasHeight } = this.config;
    const t = WALL_BORDER_THICKNESS;

    for (const room of this.config.rooms) {
      const { x, y, width, height } = room;
      // Top border — only draw if this room's top is not the canvas top edge
      if (y > 0) {
        this.drawSegmentWithDoors(
          graphics,
          x,
          y,
          width,
          t,
          "horizontal",
          allDoors,
        );
      }
      // Left border — only draw if this room's left is not the canvas left edge
      if (x > 0) {
        this.drawSegmentWithDoors(
          graphics,
          x,
          y,
          t,
          height,
          "vertical",
          allDoors,
        );
      }
      // Bottom border — only draw if this room's bottom is the canvas bottom edge
      if (y + height >= canvasHeight) {
        this.drawSegmentWithDoors(
          graphics,
          x,
          y + height - t,
          width,
          t,
          "horizontal",
          allDoors,
        );
      }
      // Right border — only draw if this room's right is the canvas right edge
      if (x + width >= canvasWidth) {
        this.drawSegmentWithDoors(
          graphics,
          x + width - t,
          y,
          t,
          height,
          "vertical",
          allDoors,
        );
      }
    }
  }

  private drawSegmentWithDoors(
    graphics: Phaser.GameObjects.Graphics,
    edgeX: number,
    edgeY: number,
    edgeW: number,
    edgeH: number,
    axis: "horizontal" | "vertical",
    allDoors: WorldObject[],
  ): void {
    // Compute gap intervals: any door whose bounding box overlaps this strip
    // creates a gap in the border.
    const gaps: Array<[number, number]> = [];

    for (const door of allDoors) {
      const doorLeft = door.x;
      const doorRight = door.x + door.width;
      const doorTop = door.y;
      const doorBottom = door.y + door.height;
      const stripLeft = edgeX;
      const stripRight = edgeX + edgeW;
      const stripTop = edgeY;
      const stripBottom = edgeY + edgeH;

      const overlapsH = doorLeft < stripRight && doorRight > stripLeft;
      const overlapsV = doorTop < stripBottom && doorBottom > stripTop;

      if (overlapsH && overlapsV) {
        if (axis === "horizontal") {
          const gapStart = Math.max(doorLeft - stripLeft, 0);
          const gapEnd = Math.min(doorRight - stripLeft, edgeW);
          if (gapEnd > gapStart) gaps.push([gapStart, gapEnd]);
        } else {
          const gapStart = Math.max(doorTop - stripTop, 0);
          const gapEnd = Math.min(doorBottom - stripTop, edgeH);
          if (gapEnd > gapStart) gaps.push([gapStart, gapEnd]);
        }
      }
    }

    // Draw the border segments, skipping gap intervals
    const totalLen = axis === "horizontal" ? edgeW : edgeH;
    let cursor = 0;

    for (const [gStart, gEnd] of gaps.sort((a, b) => a[0] - b[0])) {
      if (cursor < gStart) {
        if (axis === "horizontal") {
          graphics.fillRect(edgeX + cursor, edgeY, gStart - cursor, edgeH);
        } else {
          graphics.fillRect(edgeX, edgeY + cursor, edgeW, gStart - cursor);
        }
      }
      cursor = Math.max(cursor, gEnd);
    }

    if (cursor < totalLen) {
      if (axis === "horizontal") {
        graphics.fillRect(edgeX + cursor, edgeY, totalLen - cursor, edgeH);
      } else {
        graphics.fillRect(edgeX, edgeY + cursor, edgeW, totalLen - cursor);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: depth lookup
  // ---------------------------------------------------------------------------

  private depthOf(obj: WorldObject): number {
    switch (obj.type) {
      case "floor":
        return DEPTH.FLOOR;
      case "wall":
        return DEPTH.WALL;
      case "floor-decor":
        return DEPTH.FLOOR_DECOR;
      case "door":
        // Doors are wall openings — fixed depth, always behind characters.
        return DEPTH.DOOR;
      case "object":
      case "furniture":
      case "top-decor":
      default: {
        // Y-sort: "top" anchor uses the object's top edge (correct for flat/
        // horizontal furniture like beds where the character lies on top).
        // "bottom" anchor (default) uses the bottom edge (correct for tall/
        // front-facing objects like desks and plants).
        const anchorY = obj.depthAnchor === "top" ? obj.y : obj.y + obj.height;
        return DEPTH.Y_SORT_BASE + anchorY;
      }
    }
  }
}
