// All shared TypeScript types for the world configuration system.
// The canonical runtime source of these types is the Zod schema in worldConfig.ts.

export type ObjectLayerType =
  | "floor"
  | "wall"
  | "floor-decor"
  | "top-decor"
  | "object"
  | "furniture"
  | "door";

export type ApproachDirection = "top" | "bottom" | "left" | "right";

export type InteractionPoint = {
  x: number;
  y: number;
  /**
   * Which side of the furniture the character must approach from.
   * When set, the pathfinder routes to the adjacent walkable cell on that
   * side before doing the final sub-cell tween onto the interaction point.
   */
  approachFrom?: ApproachDirection;
};

/**
 * Tile variant paths and dimensions for tiled surfaces (walls, floors).
 * All paths are relative to public/images/map/.
 * When present on a WorldObject, the renderer uses tile-stamping instead of
 * scaling a single image: left cap + repeated center tileSprite + right cap.
 * Floors may additionally specify bottom-row caps for the front edge.
 */
export type TileSet = {
  left?: string;
  center: string;
  right?: string;
  /** Floor only — bottom-edge row left cap */
  bottomLeft?: string;
  /** Floor only — bottom-edge row center (repeated) */
  bottom?: string;
  /** Floor only — bottom-edge row right cap */
  bottomRight?: string;
  tileWidth: number;
  tileHeight: number;
};

export type WorldObjectAnimation = {
  /** Frame size inside the spritesheet referenced by `asset`. */
  frameWidth: number;
  frameHeight: number;
  /** First frame index to include. Defaults to 0. */
  startFrame?: number;
  /** Number of sequential frames to play from `startFrame`. */
  frameCount: number;
  /** Playback speed in frames per second. Provide either this or frameDurationMs. */
  frameRate?: number;
  /** Milliseconds per frame. Provide either this or frameRate. */
  frameDurationMs?: number;
  /** Phaser repeat count. Use -1 to loop forever. Defaults to -1. */
  repeat?: number;
  yoyo?: boolean;
  /** Delay before the animation starts, in milliseconds. */
  delayMs?: number;
};

export type WorldObject = {
  id: string;
  type: ObjectLayerType;
  /**
   * Path relative to public/images/map/.
   * Ignored when `tiles` is set. May be omitted for door/wall objects that
   * have no visible sprite.
   */
  asset?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Whether this object blocks pathfinding.
   * Defaults: wall/object/furniture → true, others → false.
   * Explicit value in world.json overrides the default.
   */
  blocksPath?: boolean;
  /**
   * Tile variant set for tiled surfaces. When present, `asset` is ignored and
   * the renderer composes the surface from left/center/right (and optional
   * bottom-row) tile stamps.
   */
  tiles?: TileSet;
  /**
   * Sprite animation config for this object. When present, `asset` is loaded as
   * a spritesheet instead of a static image.
   */
  animation?: WorldObjectAnimation;
  /**
   * Pixel offsets relative to the object's own (x, y) origin.
   * Used for furniture/furniture-like objects where characters must stand at a specific point.
   */
  interactionPoints?: InteractionPoint[];
  /**
   * Controls which edge of the object is used as the Y-sort anchor.
   * - "bottom" (default): depth = Y_SORT_BASE + obj.y + obj.height.
   *   Correct for tall/front-facing objects like desks, plants, sofas.
   * - "top": depth = Y_SORT_BASE + obj.y.
   *   Correct for flat/horizontal objects like beds where the character
   *   lies on top and must always render in front of the object image.
   */
  depthAnchor?: "top" | "bottom";
};

export type Room = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  objects: WorldObject[];
};

export type CharacterConfig = {
  /** Unique identifier; must match the folder name under public/images/map/characters/ */
  id: string;
  /** OpenClaw gateway agent ID (as reported by agents.list) used to match live data. */
  agentId: string;
  name: string;
  /** Must match the id of a Room in WorldConfig.rooms */
  privateRoomId: string;
  spriteSheet: {
    /** Path to inside.png relative to public/ */
    inside: string;
    /** Path to outside.png relative to public/ */
    outside: string;
    frameWidth: number;
    frameHeight: number;
  };
};

export type WorldConfig = {
  canvasWidth: number;
  canvasHeight: number;
  rooms: Room[];
  characters: CharacterConfig[];
};

// ---------------------------------------------------------------------------
// Result type used across the data layer
// ---------------------------------------------------------------------------

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
