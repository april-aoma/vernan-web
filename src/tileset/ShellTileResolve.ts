import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_KEYBLOCK,
  TILE_KEYBLOCK_CONNECTOR,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "../world/TileMap";

/**
 * Thin shell art: fixed forest connect tiles + 4-neighbor solid nine-slice.
 * Full MemberGraphAutotile / biome pools deferred.
 */

/** Open-edge bits: N=1 E=2 S=4 W=8 (open = no solid mass neighbor). */
const N = 1;
const E = 2;
const S = 4;
const W = 8;

/**
 * Nine-slice island from `block` memberGraphLayout (cols 0–2, rows 1–3):
 * TL block, T main_r8c8, TR main_0_3, …
 */
const SOLID_NINE: Record<number, string> = {
  0: "main_r8c7", // fully surrounded
  [N]: "main_r8c8",
  [E]: "main_1_3",
  [S]: "main_r9c8",
  [W]: "main_1_2",
  [N | E]: "main_0_3",
  [N | W]: "block",
  [S | E]: "main_2_3",
  [S | W]: "main_2_2",
  [N | S]: "main_r8c7", // vertical corridor — center fill
  [E | W]: "main_r8c7", // horizontal corridor
  [N | E | W]: "main_r8c8", // top cap with sides
  [S | E | W]: "main_r9c8",
  [N | S | E]: "main_1_3",
  [N | S | W]: "main_1_2",
  [N | E | S | W]: "main_6_1", // isolated (requireNoNeighbors)
};

const LADDER_TILE = "main_5_2";
const PLATFORM_MID = "main_3_2";
const PLATFORM_END = "main_3_3";
const DOOR_TOP = "main_9_3";
const DOOR_BOTTOM = "main_10_3";
const SOLID_FILL = "main_0_2";
const BREAKABLE_TILE = "main_r4c3";

function isSolidMass(code: number): boolean {
  return (
    code === TILE_SOLID ||
    code === TILE_BREAKABLE ||
    code === TILE_KEYBLOCK ||
    code === TILE_KEYBLOCK_CONNECTOR
  );
}

function openEdgeMask(map: TileMap, tx: number, ty: number): number {
  let mask = 0;
  if (!isSolidMass(map.tileAt(tx, ty - 1))) mask |= N;
  if (!isSolidMass(map.tileAt(tx + 1, ty))) mask |= E;
  if (!isSolidMass(map.tileAt(tx, ty + 1))) mask |= S;
  if (!isSolidMass(map.tileAt(tx - 1, ty))) mask |= W;
  return mask;
}

/** Resolve display tile id for a shell map cell, or null to skip / color-fallback. */
export function resolveShellTileId(map: TileMap, tx: number, ty: number): string | null {
  const code = map.tileAt(tx, ty);
  switch (code) {
    case TILE_EMPTY:
      return null;
    case TILE_SOLID:
      return SOLID_NINE[openEdgeMask(map, tx, ty)] ?? SOLID_FILL;
    case TILE_LADDER:
      return LADDER_TILE;
    case TILE_PLATFORM: {
      const left = map.tileAt(tx - 1, ty) === TILE_PLATFORM;
      const right = map.tileAt(tx + 1, ty) === TILE_PLATFORM;
      // End caps when only one side continues (thin heuristic).
      if (left !== right) return PLATFORM_END;
      return PLATFORM_MID;
    }
    case TILE_DOOR: {
      // 2-tall door: top cell uses main_9_3, lower uses main_10_3.
      const above = map.tileAt(tx, ty - 1);
      const below = map.tileAt(tx, ty + 1);
      if (above !== TILE_DOOR && below === TILE_DOOR) return DOOR_TOP;
      if (above === TILE_DOOR) return DOOR_BOTTOM;
      return DOOR_TOP;
    }
    case TILE_BREAKABLE:
      return BREAKABLE_TILE;
    case TILE_KEYBLOCK:
    case TILE_KEYBLOCK_CONNECTOR:
      return SOLID_FILL;
    default:
      return null;
  }
}
