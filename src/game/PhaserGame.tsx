import { useEffect, useRef } from "react";

import Phaser from "phaser";

import { BootScene } from "@/game/scenes/BootScene";
import { PreloadScene } from "@/game/scenes/PreloadScene";
import { WorldScene } from "@/game/scenes/WorldScene";
import { useWorldStore } from "@/store/worldStore";

// Default canvas dimensions used only if worldConfig is unavailable at mount
// time (which should not happen given the App-level pre-load, but acts as a
// safe fallback to avoid Phaser errors).
const DEFAULT_WIDTH = 1500;
const DEFAULT_HEIGHT = 760;

/**
 * PhaserGame
 *
 * React component that owns the Phaser Game instance lifecycle.
 * Mounts once; the game is destroyed on unmount.
 *
 * Canvas dimensions are read from worldConfig (pre-loaded by App.tsx before
 * this component renders) so that changing canvasWidth / canvasHeight in
 * world.json is the only step needed to resize the game.
 *
 * All data flows between React and Phaser via the Zustand stores —
 * never via props or direct DOM references.
 */
export function PhaserGame(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const worldConfig = useWorldStore((s) => s.worldConfig);
  const overlayOpen = useWorldStore(
    (s) => s.inspectorSelection?.type === "resource-wall",
  );

  const canvasWidth = worldConfig?.canvasWidth ?? DEFAULT_WIDTH;
  const canvasHeight = worldConfig?.canvasHeight ?? DEFAULT_HEIGHT;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: "#1a1a2e",
      scene: [BootScene, PreloadScene, WorldScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      banner: false,
      parent: containerRef.current,
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [canvasWidth, canvasHeight]);

  return (
    <div
      ref={containerRef}
      className="phaser-container"
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...(overlayOpen ? { pointerEvents: "none" } : {}),
      }}
    />
  );
}
