import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { MockModeToggle } from "./MockModeToggle";
import { useWorldStore } from "@/store/worldStore";

describe("MockModeToggle", () => {
  beforeEach(() => {
    useWorldStore.setState({
      worldConfig: null,
      isMockMode: false,
      liveDataStatus: "connecting",
      liveDataError: null,
      inspectorSelection: null,
    });
  });

  it("shows the live data error when backend status is missing a configured world agent", () => {
    useWorldStore.getState().setLiveDataStatus(
      "error",
      "world.json agentId not found in backend status payload: unknown-agent",
    );

    render(<MockModeToggle />);

    expect(
      screen.getByText(/world\.json agentId not found in backend status payload: unknown-agent/i),
    ).toBeInTheDocument();
  });
});
