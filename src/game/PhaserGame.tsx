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
      banner: false,
      parent: containerRef.current,
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
    // Intentionally no deps: Phaser game is created exactly once on mount.
    // canvasWidth/canvasHeight are stable at this point because App.tsx
    // ensures worldConfig is loaded before rendering PhaserGame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="phaser-container"
      style={{
        width: canvasWidth,
        height: canvasHeight,
        ...(overlayOpen ? { pointerEvents: "none" } : {}),
      }}
    />
  );
}
