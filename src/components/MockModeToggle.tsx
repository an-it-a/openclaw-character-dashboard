import { useWorldStore } from "@/store/worldStore";
import { MockStateController } from "./MockStateController";

import "./MockModeToggle.css";

/**
 * MockModeToggle
 *
 * Toggle that switches between mock and live data sources.
 * The active Phaser scene owns the actual data source lifecycle.
 */
export function MockModeToggle(): JSX.Element {
  const isMockMode = useWorldStore((s) => s.isMockMode);
  const setMockMode = useWorldStore((s) => s.setMockMode);

  return (
    <>
      <div className="mock-mode-toggle">
        <label className="mock-mode-toggle__label">
          <span className="mock-mode-toggle__text">
            {isMockMode ? "Mock data" : "Live data"}
          </span>
          <span className="mock-mode-toggle__switch">
            <input
              type="checkbox"
              checked={isMockMode}
              onChange={(e) => setMockMode(e.target.checked)}
              aria-label="Toggle mock mode"
            />
            <span className="mock-mode-toggle__slider" />
          </span>
        </label>
      </div>
      {isMockMode && <MockStateController />}
    </>
  );
}
