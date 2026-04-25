import { z } from "zod";

import type { WorldConfig } from "@/types/world";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const InteractionPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  approachFrom: z.enum(["top", "bottom", "left", "right"]).optional(),
});

const TileSetSchema = z.object({
  left: z.string().optional(),
  center: z.string().min(1, "TileSet center path must not be empty"),
  right: z.string().optional(),
  bottomLeft: z.string().optional(),
  bottom: z.string().optional(),
  bottomRight: z.string().optional(),
  tileWidth: z.number().positive("TileSet tileWidth must be positive"),
  tileHeight: z.number().positive("TileSet tileHeight must be positive"),
});

const WorldObjectAnimationSchema = z
  .object({
    frameWidth: z.number().positive("animation.frameWidth must be positive"),
    frameHeight: z.number().positive("animation.frameHeight must be positive"),
    startFrame: z
      .number()
      .int("animation.startFrame must be an integer")
      .min(0)
      .optional(),
    frameCount: z
      .number()
      .int("animation.frameCount must be an integer")
      .positive("animation.frameCount must be positive"),
    frameRate: z
      .number()
      .positive("animation.frameRate must be positive")
      .optional(),
    frameDurationMs: z
      .number()
      .positive("animation.frameDurationMs must be positive")
      .optional(),
    repeat: z.number().int("animation.repeat must be an integer").optional(),
    yoyo: z.boolean().optional(),
    delayMs: z.number().min(0, "animation.delayMs must be >= 0").optional(),
  })
  .superRefine((animation, ctx) => {
    if (
      animation.frameRate === undefined &&
      animation.frameDurationMs === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frameRate"],
        message: "animation must define either frameRate or frameDurationMs",
      });
    }

    if (
      animation.frameRate !== undefined &&
      animation.frameDurationMs !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frameDurationMs"],
        message: "animation cannot define both frameRate and frameDurationMs",
      });
    }
  });

const ObjectLayerTypeSchema = z.enum([
  "floor",
  "wall",
  "floor-decor",
  "top-decor",
  "object",
  "furniture",
  "door",
]);

const WorldObjectSchema = z
  .object({
    id: z.string().min(1, "WorldObject id must not be empty"),
    type: ObjectLayerTypeSchema,
    asset: z.string().optional(),
    x: z.number(),
    y: z.number(),
    width: z.number().positive("WorldObject width must be positive"),
    height: z.number().positive("WorldObject height must be positive"),
    blocksPath: z.boolean().optional(),
    tiles: TileSetSchema.optional(),
    animation: WorldObjectAnimationSchema.optional(),
    interactionPoints: z.array(InteractionPointSchema).optional(),
    depthAnchor: z.enum(["top", "bottom"]).optional(),
  })
  .superRefine((obj, ctx) => {
    // Must have either a non-empty asset or a tiles set (doors and walls may
    // have neither — they use invisible collision rects).
    const hasTiles = obj.tiles !== undefined;
    const hasAsset = typeof obj.asset === "string" && obj.asset.length > 0;
    const isCollisionOnly = obj.type === "door" || obj.type === "wall";
    if (!hasTiles && !hasAsset && !isCollisionOnly) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["asset"],
        message: `WorldObject "${obj.id}" of type "${obj.type}" must have either a non-empty asset path or a tiles set`,
      });
    }

    if (obj.animation !== undefined && !hasAsset) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animation"],
        message: `WorldObject "${obj.id}" animation requires a non-empty asset path`,
      });
    }

    if (obj.animation !== undefined && hasTiles) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animation"],
        message: `WorldObject "${obj.id}" cannot define both animation and tiles`,
      });
    }
  });

const RoomSchema = z.object({
  id: z.string().min(1, "Room id must not be empty"),
  label: z.string().min(1, "Room label must not be empty"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive("Room width must be positive"),
  height: z.number().positive("Room height must be positive"),
  objects: z.array(WorldObjectSchema),
});

const CharacterConfigSchema = z.object({
  id: z.string().min(1, "Character id must not be empty"),
  agentId: z.string().min(1, "Character agentId must not be empty"),
  name: z.string().min(1, "Character name must not be empty"),
  privateRoomId: z.string().min(1, "Character privateRoomId must not be empty"),
  spriteSheet: z.object({
    inside: z.string().min(1),
    outside: z.string().min(1),
    frameWidth: z.number().positive(),
    frameHeight: z.number().positive(),
  }),
});

const WorldConfigSchema = z.object({
  canvasWidth: z.number().positive(),
  canvasHeight: z.number().positive(),
  rooms: z.array(RoomSchema).min(1, "world.json must define at least one room"),
  characters: z.array(CharacterConfigSchema),
});

// ---------------------------------------------------------------------------
// Cross-field validation
// ---------------------------------------------------------------------------

function validateReferentialIntegrity(config: WorldConfig): void {
  const roomIds = new Set(config.rooms.map((r) => r.id));
  const characterIds = new Set<string>();
  const agentIds = new Set<string>();

  for (const char of config.characters) {
    if (characterIds.has(char.id)) {
      throw new Error(
        `Duplicate Character id "${char.id}" found in characters.`,
      );
    }
    characterIds.add(char.id);

    if (agentIds.has(char.agentId)) {
      throw new Error(
        `Duplicate Character agentId "${char.agentId}" found in characters.`,
      );
    }
    agentIds.add(char.agentId);

    if (!roomIds.has(char.privateRoomId)) {
      throw new Error(
        `Character "${char.id}" references privateRoomId "${char.privateRoomId}" which does not exist in rooms.`,
      );
    }
  }

  const objectIds = new Set<string>();
  for (const room of config.rooms) {
    for (const obj of room.objects) {
      if (objectIds.has(obj.id)) {
        throw new Error(
          `Duplicate WorldObject id "${obj.id}" found in room "${room.id}".`,
        );
      }
      objectIds.add(obj.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Public loader
// ---------------------------------------------------------------------------

/**
 * Fetches /world.json, validates it against the Zod schema, and returns a
 * fully-typed WorldConfig. Throws a descriptive error on any failure —
 * never silently falls back.
 */
export async function loadWorldConfig(): Promise<WorldConfig> {
  let raw: unknown;

  try {
    const response = await fetch("/world.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    raw = await response.json();
  } catch (err) {
    throw new Error(
      `Failed to fetch world.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const parsed = WorldConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const messages = parsed.error.errors
      .map((e) => `  • ${e.path.join(".")} — ${e.message}`)
      .join("\n");
    throw new Error(`world.json validation failed:\n${messages}`);
  }

  const config = parsed.data as WorldConfig;
  validateReferentialIntegrity(config);

  return config;
}

// Export schema for use in tests
export { WorldConfigSchema };
