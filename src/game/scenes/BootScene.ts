import Phaser from "phaser";

import { loadWorldConfig } from "@/data/worldConfig";
import { useWorldStore } from "@/store/worldStore";

/**
 * BootScene
 *
 * Responsibilities:
 * - Check if world.json has already been loaded by App.tsx (the normal path).
 *   If so, proceed immediately to PreloadScene.
 * - If worldConfig is not yet in the store (e.g. during isolated Phaser
 *   testing), fetch and validate it here as a fallback.
 * - Display a fatal error on the canvas if loading fails.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create(): void {
    // Fast path: App.tsx pre-loads world.json before mounting PhaserGame,
    // so the config is already in the store by the time Phaser starts.
    const existing = useWorldStore.getState().worldConfig;
    if (existing !== null) {
      this.scene.start("PreloadScene");
      return;
    }

    // Fallback path: load world.json directly (isolated / test usage).
    this.cameras.main.setBackgroundColor("#1a1a2e");

    const text = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "Loading world...", {
        fontSize: "18px",
        color: "#e0e0e0",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    loadWorldConfig()
      .then((config) => {
        useWorldStore.getState().setWorldConfig(config);
        text.destroy();
        this.scene.start("PreloadScene");
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        text.setText(`Fatal error loading world.json:\n\n${message}`);
        text.setColor("#ff4444");
        console.error("[BootScene]", message);
      });
  }
}
