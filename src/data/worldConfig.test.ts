import { describe, it, expect } from "vitest";

import { WorldConfigSchema, loadWorldConfig } from "./worldConfig";

// ---------------------------------------------------------------------------
// Minimal valid config fixture
// ---------------------------------------------------------------------------

const validConfig = {
  canvasWidth: 1500,
  canvasHeight: 760,
  rooms: [
    {
      id: "office",
      label: "Office",
      x: 0,
      y: 0,
      width: 320,
      height: 288,
      objects: [
        {
          id: "office-floor-1",
          type: "floor",
          asset: "images/map/rooms/office/floor/center.png",
          x: 0,
          y: 0,
          width: 320,
          height: 288,
        },
      ],
    },
    {
      id: "private-natsuki",
      label: "Natsuki's Room",
      x: 320,
      y: 288,
      width: 192,
      height: 192,
      objects: [],
    },
  ],
  characters: [
    {
      id: "natsuki",
      agentId: "main",
      name: "Natsuki",
      privateRoomId: "private-natsuki",
      spriteSheet: {
        inside: "images/map/characters/natsuki/inside.png",
        outside: "images/map/characters/natsuki/outside.png",
        frameWidth: 48,
        frameHeight: 64,
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Schema validation tests
// ---------------------------------------------------------------------------

describe("WorldConfigSchema", () => {
  it("accepts a valid config", () => {
    const result = WorldConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("rejects missing rooms array", () => {
    const { rooms: _rooms, ...noRooms } = validConfig;
    const result = WorldConfigSchema.safeParse(noRooms);
    expect(result.success).toBe(false);
  });

  it("rejects empty rooms array", () => {
    const result = WorldConfigSchema.safeParse({ ...validConfig, rooms: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ObjectLayerType", () => {
    const bad = {
      ...validConfig,
      rooms: [
        {
          ...validConfig.rooms[0],
          objects: [
            {
              ...validConfig.rooms[0].objects[0],
              type: "invalid-type",
            },
          ],
        },
        validConfig.rooms[1],
      ],
    };
    const result = WorldConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a room with non-positive width", () => {
    const bad = {
      ...validConfig,
      rooms: [{ ...validConfig.rooms[0], width: 0 }, validConfig.rooms[1]],
    };
    const result = WorldConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a room with non-positive height", () => {
    const bad = {
      ...validConfig,
      rooms: [{ ...validConfig.rooms[0], height: -10 }, validConfig.rooms[1]],
    };
    const result = WorldConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a character with empty name", () => {
    const bad = {
      ...validConfig,
      characters: [{ ...validConfig.characters[0], name: "" }],
    };
    const result = WorldConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a character with empty agentId", () => {
    const bad = {
      ...validConfig,
      characters: [{ ...validConfig.characters[0], agentId: "" }],
    };
    const result = WorldConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a character with empty privateRoomId", () => {
    const bad = {
      ...validConfig,
      characters: [{ ...validConfig.characters[0], privateRoomId: "" }],
    };
    const result = WorldConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts objects with optional interactionPoints", () => {
    const withPoints = {
      ...validConfig,
      rooms: [
        {
          ...validConfig.rooms[0],
          objects: [
            {
              ...validConfig.rooms[0].objects[0],
              type: "furniture",
              interactionPoints: [{ x: 32, y: 32 }],
            },
          ],
        },
        validConfig.rooms[1],
      ],
    };
    const result = WorldConfigSchema.safeParse(withPoints);
    expect(result.success).toBe(true);
  });

  it("accepts objects with explicit blocksPath override", () => {
    const withBlock = {
      ...validConfig,
      rooms: [
        {
          ...validConfig.rooms[0],
          objects: [
            {
              ...validConfig.rooms[0].objects[0],
              blocksPath: false,
            },
          ],
        },
        validConfig.rooms[1],
      ],
    };
    const result = WorldConfigSchema.safeParse(withBlock);
    expect(result.success).toBe(true);
  });

  it("accepts objects with sprite animation config", () => {
    const withAnimation = {
      ...validConfig,
      rooms: [
        {
          ...validConfig.rooms[0],
          objects: [
            {
              ...validConfig.rooms[0].objects[0],
              type: "object",
              asset: "images/map/objects/monitor-blink.png",
              animation: {
                frameWidth: 32,
                frameHeight: 32,
                frameCount: 4,
                frameRate: 6,
              },
            },
          ],
        },
        validConfig.rooms[1],
      ],
    };
    const result = WorldConfigSchema.safeParse(withAnimation);
    expect(result.success).toBe(true);
  });

  it("rejects animation when both frameRate and frameDurationMs are set", () => {
    const bad = {
      ...validConfig,
      rooms: [
        {
          ...validConfig.rooms[0],
          objects: [
            {
              ...validConfig.rooms[0].objects[0],
              animation: {
                frameWidth: 32,
                frameHeight: 32,
                frameCount: 4,
                frameRate: 6,
                frameDurationMs: 200,
              },
            },
          ],
        },
        validConfig.rooms[1],
      ],
    };
    const result = WorldConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects animation without asset", () => {
    const bad = {
      ...validConfig,
      rooms: [
        {
          ...validConfig.rooms[0],
          objects: [
            {
              ...validConfig.rooms[0].objects[0],
              asset: "",
              animation: {
                frameWidth: 32,
                frameHeight: 32,
                frameCount: 4,
                frameRate: 6,
              },
            },
          ],
        },
        validConfig.rooms[1],
      ],
    };
    const result = WorldConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Referential integrity tests (via loadWorldConfig using fetch mock)
// ---------------------------------------------------------------------------

describe("loadWorldConfig referential integrity", () => {
  it("throws when a character references a non-existent privateRoomId", async () => {
    global.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          ...validConfig,
          characters: [
            { ...validConfig.characters[0], privateRoomId: "does-not-exist" },
          ],
        }),
      }) as Response;

    await expect(loadWorldConfig()).rejects.toThrow("does-not-exist");
  });

  it("throws when two objects share the same id", async () => {
    global.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          ...validConfig,
          rooms: [
            {
              ...validConfig.rooms[0],
              objects: [
                validConfig.rooms[0].objects[0],
                { ...validConfig.rooms[0].objects[0] }, // duplicate id
              ],
            },
            validConfig.rooms[1],
          ],
        }),
      }) as Response;

    await expect(loadWorldConfig()).rejects.toThrow("Duplicate");
  });

  it("throws when two characters share the same agentId", async () => {
    global.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          ...validConfig,
          characters: [
            validConfig.characters[0],
            {
              ...validConfig.characters[0],
              id: "duplicate-natsuki",
            },
          ],
        }),
      }) as Response;

    await expect(loadWorldConfig()).rejects.toThrow("agentId");
  });

  it("throws when fetch returns a non-OK response", async () => {
    global.fetch = async () =>
      ({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }) as Response;

    await expect(loadWorldConfig()).rejects.toThrow("404");
  });

  it("resolves with a valid config", async () => {
    global.fetch = async () =>
      ({
        ok: true,
        json: async () => validConfig,
      }) as Response;

    const config = await loadWorldConfig();
    expect(config.canvasWidth).toBe(1500);
    expect(config.rooms).toHaveLength(2);
    expect(config.characters[0].id).toBe("natsuki");
  });
});
