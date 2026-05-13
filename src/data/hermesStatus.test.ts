import { describe, expect, it } from "vitest";

import {
  deriveMainStateFromHermesAgent,
  mapHermesAgentsToStates,
  type HermesAgentStatus,
} from "./hermesStatus";

describe("deriveMainStateFromHermesAgent", () => {
  it("returns working when Hermes reports an agent as working", () => {
    const agent: HermesAgentStatus = {
      profile: "researcher",
      status: "working",
    };

    expect(deriveMainStateFromHermesAgent(agent)).toBe("working");
  });

  it("returns idle when Hermes reports an agent as idle", () => {
    const agent: HermesAgentStatus = {
      profile: "researcher",
      status: "idle",
    };

    expect(deriveMainStateFromHermesAgent(agent)).toBe("idle");
  });

  it("treats offline and error states as idle for character animation", () => {
    expect(
      deriveMainStateFromHermesAgent({ profile: "researcher", status: "offline" }),
    ).toBe("idle");
    expect(
      deriveMainStateFromHermesAgent({ profile: "researcher", status: "error" }),
    ).toBe("idle");
  });
});

describe("mapHermesAgentsToStates", () => {
  it("maps Hermes profiles directly to matching world agent ids", () => {
    const result = mapHermesAgentsToStates(
      [
        { profile: "researcher", status: "working" },
        { profile: "news-crawler", status: "idle" },
      ],
      ["researcher", "news-crawler"],
    );

    expect(result).toEqual(
      new Map([
        ["researcher", "working"],
        ["news-crawler", "idle"],
      ]),
    );
  });

  it("supports the legacy seo-expert world id by reading content-optimizer", () => {
    const result = mapHermesAgentsToStates(
      [{ profile: "content-optimizer", status: "working" }],
      ["seo-expert"],
    );

    expect(result).toEqual(new Map([["seo-expert", "working"]]));
  });

  it("throws when a configured world agentId is missing from the backend payload", () => {
    expect(() =>
      mapHermesAgentsToStates([{ profile: "researcher", status: "working" }], [
        "researcher",
        "unknown-agent",
      ]),
    ).toThrow(/unknown-agent/);
  });

  it("throws when backend payload is missing all configured world agents", () => {
    expect(() =>
      mapHermesAgentsToStates([], ["researcher", "youtube-script-writer"]),
    ).toThrow(/researcher, youtube-script-writer/);
  });
});
