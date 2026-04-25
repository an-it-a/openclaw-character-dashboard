import { useEffect, useState } from "react";

import { PhaserGame } from "@/game/PhaserGame";
import { InspectorPanel } from "@/components/InspectorPanel";
import { MockModeToggle } from "@/components/MockModeToggle";
import { ResourceWallOverlay } from "@/components/ResourceWallOverlay";
import { loadWorldConfig } from "@/data/worldConfig";
import { useWorldStore } from "@/store/worldStore";

import "./App.css";

/**
 * App
 *
 * Loads world.json before mounting the Phaser game so that canvas dimensions
 * are available in Zustand when PhaserGame initialises its Phaser.Game instance.
 * BootScene detects the pre-loaded config and skips its own fetch.
 */
export function App(): JSX.Element {
  const worldConfig = useWorldStore((s) => s.worldConfig);
  const setWorldConfig = useWorldStore((s) => s.setWorldConfig);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (worldConfig !== null) return; // already loaded (e.g. HMR)

    loadWorldConfig()
      .then(setWorldConfig)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setLoadError(message);
        console.error("[App] Failed to load world.json:", message);
      });
  }, [worldConfig, setWorldConfig]);

  if (loadError !== null) {
    return (
      <div className="app-load-error">
        <pre>
          Fatal error loading world.json:{"\n\n"}
          {loadError}
        </pre>
      </div>
    );
  }

  if (worldConfig === null) {
    return <div className="app-loading">Loading world...</div>;
  }

  return (
    <div className="app-layout">
      <div className="app-canvas-area">
        <PhaserGame />
      </div>
      <div className="app-sidebar">
        <MockModeToggle />
        <InspectorPanel />
      </div>
      <ResourceWallOverlay />
    </div>
  );
}
