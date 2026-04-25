import Phaser from "phaser";

import { useWorldStore } from "@/store/worldStore";
import type { WorldConfig } from "@/types/world";

/**
 * PreloadScene
 *
 * Responsibilities:
 * - Read WorldConfig from Zustand
 * - Collect every unique asset referenced by rooms and characters
 * - Load all textures so WorldScene can use them synchronously
 * - Show a progress bar
 * - Transition to WorldScene
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload(): void {
    const config = useWorldStore.getState().worldConfig;
    if (!config) {
      console.error(
        "[PreloadScene] worldConfig is not set — BootScene may have failed.",
      );
      return;
    }

    this.load.json("clip-defs", "/clip-defs.json");

    this.createProgressBar();
    this.loadAssets(config);
  }

  create(): void {
    this.scene.start("WorldScene");
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createProgressBar(): void {
    const { width, height } = this.scale;
    const barW = 400;
    const barH = 20;
    const barX = (width - barW) / 2;
    const barY = height / 2 - barH / 2;

    const bg = this.add
      .rectangle(barX, barY, barW, barH, 0x333355)
      .setOrigin(0);
    const fill = this.add.rectangle(barX, barY, 0, barH, 0x6666cc).setOrigin(0);

    this.add
      .text(width / 2, barY - 24, "Loading assets...", {
        fontSize: "14px",
        color: "#e0e0e0",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    this.load.on("progress", (value: number) => {
      fill.setSize(barW * value, barH);
    });

    this.load.on("complete", () => {
      bg.destroy();
      fill.destroy();
    });
  }

  private loadAssets(config: WorldConfig): void {
    const loadedImages = new Set<string>();
    const loadedSpriteSheets = new Set<string>();

    const loadImage = (key: string, path: string): void => {
      if (!path || loadedImages.has(key)) return;
      loadedImages.add(key);
      this.load.image(key, path);
    };

    const loadSpriteSheet = (
      key: string,
      path: string,
      frameWidth: number,
      frameHeight: number,
    ): void => {
      if (!path || loadedSpriteSheets.has(key)) return;
      loadedSpriteSheets.add(key);
      this.load.spritesheet(key, path, { frameWidth, frameHeight });
    };

    // Room objects
    for (const room of config.rooms) {
      for (const obj of room.objects) {
        // Tiled surfaces: preload each variant path that is defined
        if (obj.tiles) {
          const { left, center, right, bottomLeft, bottom, bottomRight } =
            obj.tiles;
          for (const path of [
            left,
            center,
            right,
            bottomLeft,
            bottom,
            bottomRight,
          ]) {
            if (path) loadImage(path.replace(/^\//, ""), path);
          }
          continue;
        }
        if (!obj.asset) continue;
        // Use the asset path as the texture key (strip leading slash if any)
        const key = obj.asset.replace(/^\//, "");
        if (obj.animation) {
          loadSpriteSheet(
            key,
            obj.asset,
            obj.animation.frameWidth,
            obj.animation.frameHeight,
          );
          continue;
        }
        loadImage(key, obj.asset);
      }
    }

    // Character sprite sheets
    for (const char of config.characters) {
      const { inside, outside, frameWidth, frameHeight } = char.spriteSheet;

      const insideKey = `${char.id}-inside`;
      const outsideKey = `${char.id}-outside`;

      if (!loadedImages.has(insideKey) && inside) {
        loadedImages.add(insideKey);
        this.load.spritesheet(insideKey, inside, { frameWidth, frameHeight });
      }
      if (!loadedImages.has(outsideKey) && outside) {
        loadedImages.add(outsideKey);
        this.load.spritesheet(outsideKey, outside, { frameWidth, frameHeight });
      }
    }
  }
}
