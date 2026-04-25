import { useWorldStore } from "@/store/worldStore";
import type { LiveDataStatus } from "@/store/worldStore";
import { MockStateController } from "./MockStateController";

import "./MockModeToggle.css";

const STATUS_LABEL: Record<LiveDataStatus, string> = {
  connecting: "connecting…",
  ok: "connected",
  error: "no data",
};

/**
 * MockModeToggle
 *
 * Segmented control that switches between mock and live data sources.
 * When live mode is active, shows a status dot indicating connection health.
 */
export function MockModeToggle(): JSX.Element {
  const isMockMode = useWorldStore((s) => s.isMockMode);
  const setMockMode = useWorldStore((s) => s.setMockMode);
  const liveDataStatus = useWorldStore((s) => s.liveDataStatus);

  return (
    <>
      <div className="data-source-toggle">
        <div
          className="data-source-toggle__group"
          role="group"
          aria-label="Data source"
        >
          <button
            className={`data-source-toggle__btn${isMockMode ? " data-source-toggle__btn--active" : ""}`}
            onClick={() => setMockMode(true)}
            aria-pressed={isMockMode}
          >
            Mock
          </button>
          <button
            className={`data-source-toggle__btn${!isMockMode ? " data-source-toggle__btn--active" : ""}`}
            onClick={() => setMockMode(false)}
            aria-pressed={!isMockMode}
          >
            Live
            {!isMockMode && (
              <span
                className={`data-source-toggle__status data-source-toggle__status--${liveDataStatus}`}
                title={STATUS_LABEL[liveDataStatus]}
                aria-label={`Live data status: ${STATUS_LABEL[liveDataStatus]}`}
              />
            )}
          </button>
        </div>
      </div>
      {isMockMode && <MockStateController />}
    </>
  );
}
