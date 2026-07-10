import { JavaRandom } from "../util/JavaRandom";
import type { PlacedRoomObject } from "../world/PlacedRoomObject";
import { RoomKind } from "../world/DungeonTypes";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
} from "../world/TileMap";
import type { BiomeResolution } from "./NormalRoomBiomes";
import type { AutotileObject, DecoClusterFallback, DecoPlacementRule, TilesetProject } from "./TilesetProject";
import type { TerrainTileBridge } from "./TerrainTileBridge";
import { groundYFromMap } from "../world/SecretRoomMapBuild";

/** Java ProceduralRoomGen ambient / room overlay ARGB tags. */
export const AMBIENT_DECO_ARGB_RED = 0x66ff4a4a;
export const AMBIENT_DECO_ARGB_BLUE = 0x664a8bff;
export const ITEM_DECO_OVERLAY_ARGB = 0xddffcc44;
export const SHOP_DECO_OVERLAY_ARGB = 0xcc8b6914;
const SHOP_ITEM_BACKDROP_ANCHOR_TILE_ID = "main_r13c7";
const SECRET_STATUE_FEET_TILE_ID = "main_r3c7";
const STATUE_PEDESTAL_TILE_ID = "main_r3c8";

type FootprintCell = { tileId: string; dTx: number; dTy: number };

export type DecoStamp = {
  tx: number;
  ty: number;
  tileId: string;
  /** 0 = red channel tint hint, 1 = blue */
  channel: 0 | 1;
  /** Rolled at gen from canBreakAsDeco chance (Java DecoTile.breakableDeco). */
  breakableDeco?: boolean;
  /** Ground-hugging (scatter grass etc.) — Java DecoTile.groundHugging. */
  groundHugging?: boolean;
};

export { placeStepBreakables } from "./placeStepBreakables";

/**
 * Ambient deco clusters only (Java RoomGenerator ellipse blobs).
 * Ground scatter runs later — after placed props — so prefer-above can see logs/stumps.
 */
export function placeAmbientDecoClusters(
  project: TilesetProject,
  map: TileMap,
  contentSeed: bigint,
  biome: BiomeResolution,
  ladderColumnTx: number,
  floorOrdinal = 1,
  roomKind: RoomKind = RoomKind.NORMAL,
): DecoStamp[] {
  const w = map.getWidth();
  const h = map.getHeight();
  const rng = new JavaRandom(contentSeed ^ 0xdec07een);
  let cmin = biome.decoClusterCountMin;
  let cmax = biome.decoClusterCountMax;
  if (cmax < cmin) [cmin, cmax] = [cmax, cmin];
  const clusters = cmin + (cmax > cmin ? rng.nextInt(cmax - cmin + 1) : 0);

  const groundScatter = project.groundScatterTileIds();
  const poolMembers = project.decoPoolMemberTileIds(biome.decoPool);
  const poolRed = expandDecoPoolEntries(
    project,
    biome.decoPool,
    biome.decoClusterFallback,
    "red",
    groundScatter,
    floorOrdinal,
    poolMembers,
    roomKind,
  );
  const poolBlue = expandDecoPoolEntries(
    project,
    biome.decoPool,
    biome.decoClusterFallback,
    "blue",
    groundScatter,
    floorOrdinal,
    poolMembers,
    roomKind,
  );
  if (!poolRed.length && !poolBlue.length) return [];

  const stamps: DecoStamp[] = [];
  const occupied = new Set<string>();

  for (let i = 0; i < clusters; i++) {
    const red = rng.nextBoolean();
    const channel: 0 | 1 = red ? 0 : 1;
    const pool = red ? poolRed : poolBlue;
    if (!pool.length) continue;
    const cx = 2 + rng.nextInt(Math.max(1, w - 4));
    const baseY = 2 + rng.nextInt(Math.max(1, h - 6));
    const cw = 3 + rng.nextInt(5);
    const ch = 3 + rng.nextInt(6);
    for (let dx = -cw; dx <= cw; dx++) {
      for (let dy = -ch; dy <= ch; dy++) {
        const tx = cx + dx;
        const ty = baseY + dy;
        if (tx <= 1 || tx >= w - 1) continue;
        if (ty <= 1 || ty >= h - 1) continue;
        if (ladderColumnTx >= 0 && tx === ladderColumnTx) continue;
        if (map.tileAt(tx, ty) !== TILE_EMPTY) continue;
        const nx = dx / cw;
        const ny = dy / ch;
        if (nx * nx + ny * ny > 1.0) continue;
        if (rng.nextInt(7) === 0) continue;
        const key = `${tx},${ty}`;
        if (occupied.has(key)) continue;

        const entry = pool[rng.nextInt(pool.length)]!;
        if (entry.kind === "full" && entry.obj) {
          const placed = stampFullObject(
            project,
            map,
            entry.obj,
            tx,
            ty,
            channel,
            occupied,
            ladderColumnTx,
            rng,
          );
          stamps.push(...placed);
        } else if (entry.tileId && project.cell(entry.tileId)) {
          occupied.add(key);
          stamps.push({
            tx,
            ty,
            tileId: entry.tileId,
            channel,
            breakableDeco: rollBreakableDeco(project, entry.tileId, rng),
            groundHugging: false,
          });
        }
      }
    }
  }

  return stamps;
}

/**
 * @deprecated Prefer {@link placeAmbientDecoClusters} then props then {@link scatterEligibleGroundDeco}.
 * Kept for callers that still want clusters+scatter in one shot (no placed-prop prefer-above).
 */
export function placeAmbientDeco(
  project: TilesetProject,
  map: TileMap,
  contentSeed: bigint,
  biome: BiomeResolution,
  ladderColumnTx: number,
  floorOrdinal = 1,
): DecoStamp[] {
  const stamps = placeAmbientDecoClusters(
    project,
    map,
    contentSeed,
    biome,
    ladderColumnTx,
    floorOrdinal,
  );
  return scatterEligibleGroundDeco(
    project,
    map,
    contentSeed,
    applyAmbientDecoPlacementRules(stamps, project, map, contentSeed, {
      placed: [],
      bridge: biome.bridge,
      roomKind: RoomKind.NORMAL,
      floorOrdinal,
    }),
    ladderColumnTx,
    floorOrdinal,
    {
      placed: [],
      bridge: biome.bridge,
      roomKind: RoomKind.NORMAL,
    },
  );
}

/**
 * Thin reground: drop stamps that lost EMPTY cell or ground-only support after
 * seams/keyblocks (Java DecoPlacementRules.regroundToFinalTerrain /
 * cullInvalidGroundHuggingDeco subset).
 */
export function regroundDecoStampsToFinalTerrain(
  stamps: DecoStamp[],
  map: TileMap,
  ladderColumnTx: number,
  project?: TilesetProject | null,
): DecoStamp[] {
  return stamps.filter((s) => {
    if (ladderColumnTx >= 0 && s.tx === ladderColumnTx) return false;
    if (s.tx <= 0 || s.ty <= 0 || s.tx >= map.getWidth() - 1 || s.ty >= map.getHeight() - 1) {
      return false;
    }
    if (map.tileAt(s.tx, s.ty) !== TILE_EMPTY) return false;
    if (project) {
      if (isFloatingGroundOnlyDeco(project, map, s)) return false;
    } else if (s.groundHugging) {
      return proceduralDecoEligibleGroundCell(map, s.tx, s.ty);
    }
    return true;
  });
}

/**
 * Drop ambient stamps that fail object spawn-surface flags
 * (Java DecoPlacementRules.apply spawn-surface filter).
 * Packaged full-object multi-cell footprints are exempt.
 */
export function filterDecoBySpawnSurface(
  stamps: DecoStamp[],
  project: TilesetProject,
  map: TileMap,
): DecoStamp[] {
  const decoByCell = decoByCellMap(stamps);
  return stamps.filter((s) =>
    proceduralDecoPassesSpawnSurface(project, map, s, decoByCell),
  );
}

export type ApplyAmbientDecoCtx = {
  placed?: PlacedRoomObject[];
  bridge?: TerrainTileBridge | null;
  roomKind?: RoomKind;
  floorOrdinal?: number;
};

/**
 * Java DecoPlacementRules.apply ambient filter (before scatter):
 * spawn surface → drop scatter-rule tiles → spawnWeight → preferAdjacent → preferAbove.
 */
export function applyAmbientDecoPlacementRules(
  stamps: DecoStamp[],
  project: TilesetProject,
  map: TileMap,
  contentSeed: bigint,
  ctx: ApplyAmbientDecoCtx = {},
): DecoStamp[] {
  const placed = ctx.placed ?? [];
  const bridge = ctx.bridge ?? null;
  const roomKind = ctx.roomKind ?? RoomKind.NORMAL;
  const floor = ctx.floorOrdinal ?? 1;
  const tileAllowed = (id: string) => project.tileAllowed(id, floor, roomKind);
  const decoByCell = decoByCellMap(stamps);
  const kept: DecoStamp[] = [];

  for (const d of stamps) {
    const tid = d.tileId?.trim() ?? "";
    const owner = tid ? project.objectByTileId.get(tid) : undefined;
    const packagedFootprint =
      !!owner?.isFullObject && hasMultiCellMemberFootprint(owner);

    if (
      !packagedFootprint &&
      !proceduralDecoPassesSpawnSurface(project, map, d, decoByCell)
    ) {
      continue;
    }

    const rule =
      packagedFootprint || !tid ? undefined : project.decoPlacementRules.get(tid);

    if (rule?.scatterOnEligibleGround) continue;

    if (rule) {
      const spawnMix =
        contentSeed ^ (BigInt(d.tx) * 0x1b873593n) ^ (BigInt(d.ty) * 0x85ebca6bn);
      if (!passesSpawnWeightRoll(rule, spawnMix)) continue;

      if (rule.adjacentToTileIds.length) {
        if (!preferAdjacentMatches(map, bridge, roomKind, contentSeed, tileAllowed, d.tx, d.ty, rule)) {
          continue;
        }
      }

      if (rule.preferredAboveTileIds.length || rule.preferredAboveObjectIds.length) {
        const abovePreferred = preferAboveMatches(
          project,
          map,
          stamps,
          placed,
          bridge,
          roomKind,
          contentSeed,
          tileAllowed,
          d.tx,
          d.ty,
          rule,
        );
        const preferMix =
          contentSeed ^ (BigInt(d.tx) * 0xc2b2ae3dn) ^ (BigInt(d.ty) * 0x165667b1n);
        if (!passesPreferAboveRoll(rule, abovePreferred, preferMix)) continue;
      }
    }

    kept.push(d);
  }
  return kept;
}

/** Java DecoPlacementRules.refreshGroundHuggingFlags. */
export function refreshGroundHuggingFlags(
  stamps: DecoStamp[],
  map: TileMap,
): DecoStamp[] {
  let changed = false;
  const out: DecoStamp[] = [];
  for (const d of stamps) {
    const hug = proceduralDecoEligibleGroundCell(map, d.tx, d.ty);
    if (hug !== !!d.groundHugging) {
      changed = true;
      out.push({ ...d, groundHugging: hug });
    } else {
      out.push(d);
    }
  }
  return changed ? out : stamps;
}

/**
 * Java DecoPlacementRules.dropIncompletePackagedFootprints — drop full-object
 * instances missing any footprint member after per-tile filtering.
 */
export function dropIncompletePackagedFootprints(
  stamps: DecoStamp[],
  project: TilesetProject,
): DecoStamp[] {
  const index = buildPackagedDecoIndex(project);
  if (!index.anchorByMemberTile.size) return stamps;

  const presentByInstance = new Map<string, Set<string>>();
  for (const d of stamps) {
    const tid = d.tileId?.trim();
    if (!tid) continue;
    const anchor = index.anchorByMemberTile.get(tid);
    if (!anchor) continue;
    const selfCell = findMemberCell(tid, anchor, index.footprintsByAnchor);
    if (!selfCell) continue;
    const instanceKey = `${anchor}@${d.tx - selfCell.dTx},${d.ty - selfCell.dTy}`;
    let set = presentByInstance.get(instanceKey);
    if (!set) {
      set = new Set();
      presentByInstance.set(instanceKey, set);
    }
    set.add(tid);
  }

  const incomplete = new Set<string>();
  for (const [instanceKey, present] of presentByInstance) {
    const at = instanceKey.indexOf("@");
    if (at <= 0) continue;
    const anchor = instanceKey.slice(0, at);
    const variants = index.footprintsByAnchor.get(anchor);
    if (!variants?.length) continue;
    if (!packagedInstanceComplete(present, variants)) incomplete.add(instanceKey);
  }
  if (!incomplete.size) return stamps;

  return stamps.filter((d) => {
    const tid = d.tileId?.trim();
    if (!tid) return true;
    const anchor = index.anchorByMemberTile.get(tid);
    if (!anchor) return true;
    const selfCell = findMemberCell(tid, anchor, index.footprintsByAnchor);
    if (!selfCell) return true;
    const instanceKey = `${anchor}@${d.tx - selfCell.dTx},${d.ty - selfCell.dTy}`;
    return !incomplete.has(instanceKey);
  });
}

export type PackagedDecoIndex = {
  anchorByMemberTile: Map<string, string>;
  footprintsByAnchor: Map<string, Array<Array<{ tileId: string; dTx: number; dTy: number }>>>;
};

export function buildPackagedDecoIndex(project: TilesetProject): PackagedDecoIndex {
  const anchorByMemberTile = new Map<string, string>();
  const footprintsByAnchor = new Map<
    string,
    Array<Array<{ tileId: string; dTx: number; dTy: number }>>
  >();
  for (const obj of project.objects) {
    if (!obj.isFullObject || !hasMultiCellMemberFootprint(obj)) continue;
    const anchor = (obj.anchorTileId || obj.tileIds[0] || "").trim();
    if (!anchor) continue;
    const foot = footprintCellsForObject(obj);
    if (!foot.length) continue;
    let variants = footprintsByAnchor.get(anchor);
    if (!variants) {
      variants = [];
      footprintsByAnchor.set(anchor, variants);
    }
    const dup = variants.some(
      (v) =>
        v.length === foot.length &&
        v.every((c, i) => c.tileId === foot[i]!.tileId && c.dTx === foot[i]!.dTx && c.dTy === foot[i]!.dTy),
    );
    if (!dup) variants.push(foot);
    for (const c of foot) {
      if (!anchorByMemberTile.has(c.tileId)) anchorByMemberTile.set(c.tileId, anchor);
    }
  }
  return { anchorByMemberTile, footprintsByAnchor };
}

function footprintCellsForObject(
  obj: AutotileObject,
): Array<{ tileId: string; dTx: number; dTy: number }> {
  const cells = obj.islands[0]?.cells;
  if (cells?.length) {
    return cells.map((c) => ({ tileId: c.tileId, dTx: c.dTx, dTy: c.dTy }));
  }
  return footprintDeltasFromObject(obj).map((c, i) => ({
    tileId: obj.tileIds[i] ?? obj.tileIds[0]!,
    dTx: c.dTx,
    dTy: c.dTy,
  }));
}

function findMemberCell(
  tileId: string,
  anchor: string,
  footprintsByAnchor: Map<string, Array<Array<{ tileId: string; dTx: number; dTy: number }>>>,
): { tileId: string; dTx: number; dTy: number } | null {
  const variants = footprintsByAnchor.get(anchor);
  if (!variants) return null;
  for (const foot of variants) {
    for (const c of foot) {
      if (c.tileId === tileId) return c;
    }
  }
  return null;
}

function packagedInstanceComplete(
  present: Set<string>,
  variants: Array<Array<{ tileId: string; dTx: number; dTy: number }>>,
): boolean {
  for (const foot of variants) {
    if (foot.every((c) => present.has(c.tileId))) return true;
  }
  return false;
}

function decoByCellMap(stamps: DecoStamp[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of stamps) {
    if (d.tileId) m.set(`${d.tx},${d.ty}`, d.tileId.trim());
  }
  return m;
}

/**
 * Java DecoPlacementRules.isFloatingGroundOnlyDeco — ground-only deco mid-air.
 */
export function isFloatingGroundOnlyDeco(
  project: TilesetProject,
  map: TileMap,
  d: DecoStamp,
): boolean {
  if (proceduralDecoEligibleGroundCell(map, d.tx, d.ty)) return false;
  const tid = d.tileId?.trim();
  if (!tid) return !!d.groundHugging;
  if (isPackagedDecoMemberTile(project, tid)) return false;
  const owner = project.objectByTileId.get(tid);
  if (!owner) return !!d.groundHugging;
  return owner.canSpawnOnGround && !owner.canSpawnInAir;
}

/** Java DecoPlacementRules.isPackagedDecoMemberTile (full-object multi-cell). */
function isPackagedDecoMemberTile(project: TilesetProject, tileId: string): boolean {
  const owner = project.objectByTileId.get(tileId);
  if (!owner?.isFullObject) return false;
  return hasMultiCellMemberFootprint(owner);
}

function hasMultiCellMemberFootprint(obj: AutotileObject): boolean {
  const cells = obj.islands[0]?.cells;
  if (cells?.length) {
    if (cells.length > 1) return true;
    const c = cells[0]!;
    if (c.dTx !== 0 || c.dTy !== 0) return true;
  }
  const layout = obj.memberGraphLayout?.cells;
  if (!layout?.length) return false;
  if (layout.length > 1) return true;
  return false;
}

/**
 * Java LogicalObjectLayout.proceduralDecoPassesSpawnSurface (floor / air / ceiling / wall).
 */
function proceduralDecoPassesSpawnSurface(
  project: TilesetProject,
  map: TileMap,
  d: DecoStamp,
  decoByCell: Map<string, string>,
): boolean {
  const tid = d.tileId?.trim() ?? "";
  const owner = tid ? project.objectByTileId.get(tid) : undefined;
  if (owner?.isFullObject && hasMultiCellMemberFootprint(owner)) return true;

  const onGround = owner == null || owner.canSpawnOnGround;
  const inAir = owner != null && owner.canSpawnInAir;
  const ceiling = owner != null && owner.canHangFromCeiling;
  const wall = owner != null && owner.canClingToWall;
  if (!onGround && !inAir && !ceiling && !wall) return false;

  if (!ceiling && !wall) {
    if (onGround && inAir) return true;
    if (onGround) {
      return proceduralDecoPassesGroundOnly(project, map, decoByCell, d.tx, d.ty, tid);
    }
    return proceduralDecoPassesAirOnly(map, d.tx, d.ty);
  }

  if (onGround && proceduralDecoPassesGroundOnly(project, map, decoByCell, d.tx, d.ty, tid)) {
    return true;
  }
  if (inAir && proceduralDecoPassesAirOnly(map, d.tx, d.ty)) return true;
  if (ceiling && proceduralDecoPassesCeiling(map, d.tx, d.ty)) return true;
  if (wall && proceduralDecoPassesWall(map, d.tx, d.ty)) return true;
  return false;
}

function proceduralDecoPassesGroundOnly(
  project: TilesetProject,
  map: TileMap,
  decoByCell: Map<string, string>,
  tx: number,
  ty: number,
  tileId: string,
): boolean {
  if (map.tileAt(tx, ty) !== TILE_EMPTY) return false;
  if (proceduralDecoEligibleGroundCell(map, tx, ty)) return true;
  if (!tileId) return false;
  const belowId = decoByCell.get(`${tx},${ty + 1}`);
  if (!belowId) return false;
  const owner = project.objectByTileId.get(tileId);
  if (!owner?.isFullObject) return false;
  // Stacked full-object segment: same owner as cell below.
  const belowOwner = project.objectByTileId.get(belowId);
  return belowOwner != null && belowOwner.id === owner.id;
}

function proceduralDecoPassesAirOnly(map: TileMap, tx: number, ty: number): boolean {
  if (map.tileAt(tx, ty) !== TILE_EMPTY) return false;
  const bty = ty + 1;
  return bty < map.getHeight() && !map.isStandableFloorTile(tx, bty);
}

function proceduralDecoPassesCeiling(map: TileMap, tx: number, ty: number): boolean {
  if (map.tileAt(tx, ty) !== TILE_EMPTY) return false;
  const a = ty - 1;
  if (a < 0) return false;
  const above = map.tileAt(tx, a);
  return above === TILE_SOLID || above === TILE_BREAKABLE;
}

function proceduralDecoPassesWall(map: TileMap, tx: number, ty: number): boolean {
  if (map.tileAt(tx, ty) !== TILE_EMPTY) return false;
  if (tx - 1 >= 0) {
    const l = map.tileAt(tx - 1, ty);
    if (l === TILE_SOLID || l === TILE_BREAKABLE) return true;
  }
  if (tx + 1 < map.getWidth()) {
    const r = map.tileAt(tx + 1, ty);
    if (r === TILE_SOLID || r === TILE_BREAKABLE) return true;
  }
  return false;
}

/** Java preferAdjacent orth/diag neighbor display-tile match. */
function preferAdjacentMatches(
  map: TileMap,
  bridge: TerrainTileBridge | null,
  roomKind: RoomKind,
  displaySalt: bigint,
  tileAllowed: (id: string) => boolean,
  tx: number,
  ty: number,
  rule: DecoPlacementRule,
): boolean {
  if (!rule.adjacentToTileIds.length) return true;
  const w = map.getWidth();
  const h = map.getHeight();
  const want = new Set(rule.adjacentToTileIds);
  let orthMatch = false;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const disp = neighborDisplayId(map, bridge, roomKind, displaySalt, tileAllowed, nx, ny);
    if (disp && want.has(disp)) {
      orthMatch = true;
      break;
    }
  }
  let diagMatch = false;
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const disp = neighborDisplayId(map, bridge, roomKind, displaySalt, tileAllowed, nx, ny);
    if (disp && want.has(disp)) {
      diagMatch = true;
      break;
    }
  }
  const wO = rule.preferAdjacentOrthogonalWeight;
  const wD = rule.preferAdjacentDiagonalWeight;
  return (wO > 0 && orthMatch) || (wD > 0 && diagMatch);
}

function neighborDisplayId(
  map: TileMap,
  bridge: TerrainTileBridge | null,
  roomKind: RoomKind,
  displaySalt: bigint,
  tileAllowed: (id: string) => boolean,
  nx: number,
  ny: number,
): string | null {
  if (!bridge) return null;
  return bridge.displayTileIdForRoomKind(
    map.tileAt(nx, ny),
    nx,
    ny,
    displaySalt,
    roomKind,
    tileAllowed,
  );
}

type PoolEntry =
  | { kind: "tile"; tileId: string }
  | { kind: "full"; obj: AutotileObject; tileId: string };

function expandDecoPoolEntries(
  project: TilesetProject,
  pool: Array<{ objectId: string; weight: number }>,
  fallback: DecoClusterFallback,
  channel: "red" | "blue",
  groundScatter: Set<string>,
  floorOrdinal: number,
  poolMembers: Set<string>,
  roomKind: RoomKind,
): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const entry of pool) {
    const count = Math.max(0, Math.round(entry.weight * 10));
    if (count <= 0) continue;
    const obj = project.objectById.get(entry.objectId);
    if (obj && !objectAllowedInRoomKind(obj, roomKind)) continue;
    if (obj?.isFullObject && obj.memberGraphLayout && obj.tileIds.length) {
      if (!objectMatchesChannel(obj, channel)) continue;
      const anchor = obj.tileIds[0]!;
      if (!tileEligibleForAmbient(project, anchor, groundScatter, floorOrdinal, poolMembers, roomKind)) continue;
      for (let i = 0; i < count; i++) {
        out.push({ kind: "full", obj, tileId: anchor });
      }
      continue;
    }
    if (obj?.tileIds.length) {
      if (!objectMatchesChannel(obj, channel)) continue;
      const members =
        obj.objectType === "tile+variations" || !obj.objectType
          ? obj.tileIds
          : [obj.tileIds[0]!];
      for (const mid of members) {
        if (!tileEligibleForAmbient(project, mid, groundScatter, floorOrdinal, poolMembers, roomKind)) continue;
        for (let i = 0; i < count; i++) out.push({ kind: "tile", tileId: mid });
      }
      continue;
    }
    if (project.cell(entry.objectId)) {
      const ch = project.decoBlobChannelForTile(entry.objectId);
      if (ch !== "all" && ch !== channel) continue;
      if (!tileEligibleForAmbient(project, entry.objectId, groundScatter, floorOrdinal, poolMembers, roomKind)) continue;
      for (let i = 0; i < count; i++) out.push({ kind: "tile", tileId: entry.objectId });
    }
  }
  if (!out.length) {
    const fb = channel === "red" ? fallback.red : fallback.blue;
    if (tileEligibleForAmbient(project, fb, groundScatter, floorOrdinal, poolMembers, roomKind, true)) {
      out.push({ kind: "tile", tileId: fb });
    }
  }
  return out;
}

function objectMatchesChannel(obj: AutotileObject, channel: "red" | "blue"): boolean {
  return obj.decoBlobClusterChannel === "all" || obj.decoBlobClusterChannel === channel;
}

/** Java LogicalObjectLayout.roomKindsWhitelist — object-level allow list. */
function objectAllowedInRoomKind(obj: AutotileObject, roomKind: RoomKind): boolean {
  if (!obj.roomKinds.length) return true;
  const rk = (RoomKind[roomKind] ?? "NORMAL").toUpperCase();
  for (const raw of obj.roomKinds) {
    const t = raw.trim().toUpperCase();
    if (t === rk) return true;
    if (
      t === "SECRET_ROOM" &&
      (roomKind === RoomKind.SECRET || roomKind === RoomKind.SUPER_SECRET)
    ) {
      return true;
    }
  }
  return false;
}

function tileOrOwnerInDecoPoolMembers(
  tileId: string,
  owner: AutotileObject | undefined,
  poolMembers: Set<string> | undefined,
): boolean {
  if (!poolMembers?.size) return false;
  if (poolMembers.has(tileId)) return true;
  if (!owner) return false;
  for (const mid of owner.tileIds) {
    if (poolMembers.has(mid)) return true;
  }
  return false;
}

/** Java ProceduralRoomGen.tileIdAllowedInMergedDecoRootPool — no orphan non-anchor picks. */
function tileIdAllowedInMergedDecoRootPool(project: TilesetProject, tileId: string): boolean {
  const owner = project.objectByTileId.get(tileId);
  if (!owner) return true;
  if (owner.isHorizontalStripAutotile) return false;
  const anchor = owner.tileIds[0];
  if (!anchor || tileId === anchor) return true;
  if (owner.isFullObject || owner.objectType === "autotile") return false;
  return true;
}

/**
 * Java ProceduralRoomGen.proceduralDecoTileEligibleForRoomKind — room-kind + pool gate
 * for ambient clusters, overlays, and ground scatter.
 */
function proceduralDecoTileEligibleForRoomKind(
  project: TilesetProject,
  tileId: string,
  roomKind: RoomKind,
  floorOrdinal: number,
  poolMembers: Set<string> | undefined,
  groundScatter: Set<string>,
  /** Fallback tiles skip background pool membership (Java pickTileIdForArgb). */
  isFallback = false,
): boolean {
  if (!project.cell(tileId)) return false;
  if (groundScatter.has(tileId)) return false;
  if (!project.tileAllowedInRoomKind(tileId, roomKind)) return false;
  if (!project.tileAllowedOnFloor(tileId, floorOrdinal)) return false;
  if (!project.emptyMapTerrainTileIds.has(tileId)) return false;
  if (!isFallback && project.backgroundSceneTileIds.has(tileId)) {
    return poolMembers?.has(tileId) ?? false;
  }
  if (!tileIdAllowedInMergedDecoRootPool(project, tileId)) return false;
  const owner = project.objectByTileId.get(tileId);
  if (owner) {
    if (!objectAllowedInRoomKind(owner, roomKind)) return false;
    return tileOrOwnerInDecoPoolMembers(tileId, owner, poolMembers);
  }
  return true;
}

function tileEligibleForAmbient(
  project: TilesetProject,
  tileId: string,
  groundScatter: Set<string>,
  floorOrdinal: number,
  poolMembers: Set<string> | undefined,
  roomKind: RoomKind,
  isFallback = false,
): boolean {
  return proceduralDecoTileEligibleForRoomKind(
    project,
    tileId,
    roomKind,
    floorOrdinal,
    poolMembers,
    groundScatter,
    isFallback,
  );
}

function rollBreakableDeco(
  project: TilesetProject,
  tileId: string,
  rng: JavaRandom,
): boolean {
  const p = project.decoBreakableChanceByTileId.get(tileId);
  if (p == null || p <= 0) return false;
  return rng.nextDouble() < p;
}

function stampFullObject(
  project: TilesetProject,
  map: TileMap,
  obj: AutotileObject,
  anchorTx: number,
  anchorTy: number,
  channel: 0 | 1,
  occupied: Set<string>,
  ladderColumnTx: number,
  rng: JavaRandom,
): DecoStamp[] {
  const cells = footprintCellsForObject(obj);
  if (!cells.length) return [];

  const groundingReq = fullObjectGroundingRequired(obj);
  let resolvedTy = anchorTy;
  if (groundingReq) {
    const snapped = resolveGroundedAnchorTyFromMap(
      map,
      anchorTx,
      anchorTy,
      cells,
      ladderColumnTx,
    );
    if (snapped < 0) return [];
    resolvedTy = snapped;
  } else if (
    !decoFootprintFitsBounds(map, anchorTx, resolvedTy, cells, ladderColumnTx) ||
    !fullObjectStampCellsAllOpenAirOnMap(map, anchorTx, resolvedTy, cells)
  ) {
    return [];
  }

  for (const c of cells) {
    const tx = anchorTx + c.dTx;
    const ty = resolvedTy + c.dTy;
    if (!decoFootprintFitsBounds(map, anchorTx, resolvedTy, cells, ladderColumnTx)) return [];
    if (ladderColumnTx >= 0 && tx === ladderColumnTx) return [];
    if (!mapCellIsOpenAirForDeco(map, tx, ty)) return [];
    if (occupied.has(`${tx},${ty}`)) return [];
    if (!project.cell(c.tileId)) return [];
  }
  if (groundingReq && !fullObjectStampRestsOnMapFloor(map, anchorTx, resolvedTy, cells)) {
    return [];
  }

  const layoutAnchor = obj.anchorTileId || obj.tileIds[0] || cells[0]!.tileId;
  const groundHug = proceduralDecoEligibleGroundCell(map, anchorTx, resolvedTy);
  const out: DecoStamp[] = [];
  for (const c of cells) {
    const tx = anchorTx + c.dTx;
    const ty = resolvedTy + c.dTy;
    occupied.add(`${tx},${ty}`);
    out.push({
      tx,
      ty,
      tileId: c.tileId,
      channel,
      breakableDeco: rollBreakableDeco(project, c.tileId, rng),
      groundHugging: groundHug,
    });
  }
  tryStampStatuePedestalCompanion(
    project,
    map,
    out,
    occupied,
    anchorTx,
    resolvedTy,
    channel,
    layoutAnchor,
    cells,
    rng,
  );
  return out;
}

/** Java DecoPlacementRules.regroundPackagedDeco — snap grounded full objects to play floor. */
export function regroundPackagedDeco(
  stamps: DecoStamp[],
  project: TilesetProject,
  map: TileMap,
  ladderColumnTx: number,
): DecoStamp[] {
  const index = buildPackagedDecoIndex(project);
  if (!index.anchorByMemberTile.size || !stamps.length) return stamps;

  const groundingByAnchor = buildGroundingRequiredByAnchor(project);
  const instanceByKey = new Map<
    string,
    { anchorTileId: string; anchorTx: number; anchorTy: number; layout: FootprintCell[] }
  >();

  for (const d of stamps) {
    const tid = d.tileId?.trim();
    if (!tid) continue;
    const anchor = index.anchorByMemberTile.get(tid);
    if (!anchor) continue;
    const selfCell = findMemberCell(tid, anchor, index.footprintsByAnchor);
    if (!selfCell) continue;
    const variants = index.footprintsByAnchor.get(anchor);
    const layout = variants?.find((foot) => foot.some((c) => c.tileId === tid));
    if (!layout) continue;
    const anchorTx = d.tx - selfCell.dTx;
    const anchorTy = d.ty - selfCell.dTy;
    const key = `${anchor}@${anchorTx},${anchorTy}`;
    if (!instanceByKey.has(key)) {
      instanceByKey.set(key, { anchorTileId: anchor, anchorTx, anchorTy, layout });
    }
  }

  const dropInstances = new Set<string>();
  const deltaTyByInstance = new Map<string, number>();
  for (const [key, ref] of instanceByKey) {
    if (!groundingByAnchor.get(ref.anchorTileId)) continue;
    const snapped = resolveGroundedAnchorTyFromMap(
      map,
      ref.anchorTx,
      ref.anchorTy,
      ref.layout,
      ladderColumnTx,
    );
    if (snapped < 0) dropInstances.add(key);
    else if (snapped !== ref.anchorTy) deltaTyByInstance.set(key, snapped - ref.anchorTy);
  }
  if (!dropInstances.size && !deltaTyByInstance.size) return stamps;

  const kept: DecoStamp[] = [];
  for (const d of stamps) {
    const tid = d.tileId?.trim();
    if (!tid) {
      kept.push(d);
      continue;
    }
    const anchor = index.anchorByMemberTile.get(tid);
    if (!anchor) {
      kept.push(d);
      continue;
    }
    const selfCell = findMemberCell(tid, anchor, index.footprintsByAnchor);
    if (!selfCell) {
      kept.push(d);
      continue;
    }
    const anchorTx = d.tx - selfCell.dTx;
    const anchorTy = d.ty - selfCell.dTy;
    const key = `${anchor}@${anchorTx},${anchorTy}`;
    if (dropInstances.has(key)) continue;
    const dy = deltaTyByInstance.get(key);
    if (dy != null && dy !== 0) {
      const nty = d.ty + dy;
      kept.push({
        ...d,
        ty: nty,
        groundHugging: proceduralDecoEligibleGroundCell(map, d.tx, nty),
      });
    } else {
      kept.push(d);
    }
  }
  return dropIncompletePackagedFootprints(
    refreshGroundHuggingFlags(kept, map),
    project,
  );
}

/**
 * ITEM/SHOP rear-wall backdrop + overlay blobs (Java RoomGenerator ITEM/SHOP deco pass).
 */
export function placeRoomKindDecoOverlays(
  stamps: DecoStamp[],
  project: TilesetProject,
  map: TileMap,
  kind: RoomKind,
  contentSeed: bigint,
  ladderColumnTx: number,
  biome: BiomeResolution,
  floorOrdinal: number,
): DecoStamp[] {
  if (kind !== RoomKind.ITEM && kind !== RoomKind.SHOP) return stamps;

  const groundY = groundYFromMap(map);
  const occupied = new Set(stamps.map((s) => `${s.tx},${s.ty}`));
  const out = stamps.slice();
  const rng = new JavaRandom(contentSeed ^ 0x17e6c4a57n);
  const poolMembers = project.decoPoolMemberTileIds(biome.decoPool);
  const poolTiles = expandDecoPoolTileIds(
    project,
    biome.decoPool,
    floorOrdinal,
    poolMembers,
    kind,
  );

  const gyc = groundY[clampInt(Math.floor(map.getWidth() / 2), 1, map.getWidth() - 2)]!;
  if (kind === RoomKind.ITEM) {
    const cx = Math.floor(map.getWidth() / 2);
    stampItemShopBackdropWall(
      project,
      map,
      out,
      occupied,
      cx - 1,
      gyc,
      1,
      ladderColumnTx,
      rng,
    );
    for (let dy = 2; dy <= 4; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        stampOverlayBlobCell(
          project,
          map,
          out,
          occupied,
          cx + dx,
          gyc - dy,
          ITEM_DECO_OVERLAY_ARGB,
          biome.decoClusterFallback,
          poolTiles,
          ladderColumnTx,
          rng,
          true,
        );
      }
    }
  } else {
    const baseGx = clampInt(Math.floor(map.getWidth() / 2) - 4, 2, map.getWidth() - 10);
    stampItemShopBackdropWall(
      project,
      map,
      out,
      occupied,
      baseGx + 2,
      gyc,
      1,
      ladderColumnTx,
      rng,
    );
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 8; dx++) {
        stampOverlayBlobCell(
          project,
          map,
          out,
          occupied,
          baseGx + dx,
          gyc - 1 - dy,
          SHOP_DECO_OVERLAY_ARGB,
          biome.decoClusterFallback,
          poolTiles,
          ladderColumnTx,
          rng,
          true,
        );
      }
    }
  }
  return out;
}

function stampItemShopBackdropWall(
  project: TilesetProject,
  map: TileMap,
  out: DecoStamp[],
  occupied: Set<string>,
  backdropLeftTx: number,
  groundRowTy: number,
  channel: 0 | 1,
  ladderColumnTx: number,
  rng: JavaRandom,
): void {
  const owner = project.objectByTileId.get(SHOP_ITEM_BACKDROP_ANCHOR_TILE_ID);
  const obj =
    owner?.isFullObject ? owner : project.objectById.get("shop/item background");
  if (!obj?.isFullObject) return;
  const stamp = footprintCellsForObject(obj);
  if (!stamp.length) return;
  let maxDy = 0;
  for (const c of stamp) maxDy = Math.max(maxDy, c.dTy);
  const anchorTx = backdropLeftTx;
  const anchorTy = groundRowTy - 1 - maxDy;
  const placed = stampFullObject(
    project,
    map,
    obj,
    anchorTx,
    anchorTy,
    channel,
    occupied,
    ladderColumnTx,
    rng,
  );
  out.push(...placed);
}

function stampOverlayBlobCell(
  project: TilesetProject,
  map: TileMap,
  out: DecoStamp[],
  occupied: Set<string>,
  tx: number,
  ty: number,
  argb: number,
  fallback: DecoClusterFallback,
  poolTiles: string[],
  ladderColumnTx: number,
  rng: JavaRandom,
  skipBackdropPick: boolean,
): void {
  if (tx <= 1 || tx >= map.getWidth() - 1 || ty <= 1 || ty >= map.getHeight() - 1) return;
  if (ladderColumnTx >= 0 && tx === ladderColumnTx) return;
  const key = `${tx},${ty}`;
  if (occupied.has(key)) return;
  if (map.tileAt(tx, ty) !== TILE_EMPTY) return;

  let tileId: string | null = null;
  if (poolTiles.length) {
    for (let tries = 0; tries < 8 && !tileId; tries++) {
      const pick = poolTiles[rng.nextInt(poolTiles.length)]!;
      if (skipBackdropPick && pick === SHOP_ITEM_BACKDROP_ANCHOR_TILE_ID) continue;
      const owner = project.objectByTileId.get(pick);
      if (owner?.isFullObject) {
        const foot = stampFullObject(
          project,
          map,
          owner,
          tx,
          ty,
          argb === ITEM_DECO_OVERLAY_ARGB || argb === SHOP_DECO_OVERLAY_ARGB ? 0 : 1,
          occupied,
          ladderColumnTx,
          rng,
        );
        if (foot.length) {
          out.push(...foot);
          return;
        }
        continue;
      }
      tileId = pick;
    }
  }
  if (!tileId) tileId = pickFallbackTileForArgb(fallback, argb);
  if (!tileId || !project.cell(tileId)) return;
  occupied.add(key);
  out.push({
    tx,
    ty,
    tileId,
    channel: argb === AMBIENT_DECO_ARGB_BLUE ? 1 : 0,
    groundHugging: proceduralDecoEligibleGroundCell(map, tx, ty),
  });
}

function pickFallbackTileForArgb(fallback: DecoClusterFallback, argb: number): string | null {
  switch (argb) {
    case AMBIENT_DECO_ARGB_RED:
      return fallback.red || null;
    case AMBIENT_DECO_ARGB_BLUE:
      return fallback.blue || null;
    case ITEM_DECO_OVERLAY_ARGB:
      return fallback.itemBlob ?? fallback.red ?? null;
    case SHOP_DECO_OVERLAY_ARGB:
      return fallback.shopBlob ?? fallback.red ?? null;
    default:
      return fallback.red || null;
  }
}

function expandDecoPoolTileIds(
  project: TilesetProject,
  pool: Array<{ objectId: string; weight: number }>,
  floorOrdinal: number,
  poolMembers: Set<string>,
  roomKind: RoomKind,
): string[] {
  const groundScatter = project.groundScatterTileIds();
  const out: string[] = [];
  for (const entry of pool) {
    const count = Math.max(0, Math.round(entry.weight * 10));
    if (count <= 0) continue;
    const obj = project.objectById.get(entry.objectId);
    if (obj && !objectAllowedInRoomKind(obj, roomKind)) continue;
    if (obj?.isFullObject) {
      const anchor = obj.anchorTileId || obj.tileIds[0];
      if (anchor && tileEligibleForAmbient(project, anchor, groundScatter, floorOrdinal, poolMembers, roomKind)) {
        for (let i = 0; i < count; i++) out.push(anchor);
      }
      continue;
    }
    if (obj?.tileIds.length) {
      for (const mid of obj.tileIds) {
        if (!tileEligibleForAmbient(project, mid, groundScatter, floorOrdinal, poolMembers, roomKind)) continue;
        for (let i = 0; i < count; i++) out.push(mid);
      }
      continue;
    }
    if (
      project.cell(entry.objectId) &&
      tileEligibleForAmbient(project, entry.objectId, groundScatter, floorOrdinal, poolMembers, roomKind)
    ) {
      for (let i = 0; i < count; i++) out.push(entry.objectId);
    }
  }
  return out;
}

function tryStampStatuePedestalCompanion(
  project: TilesetProject,
  map: TileMap,
  out: DecoStamp[],
  occupied: Set<string>,
  anchorTx: number,
  anchorTy: number,
  channel: 0 | 1,
  layoutAnchorTileId: string,
  stamp: FootprintCell[],
  rng: JavaRandom,
): void {
  const secretStatue =
    layoutAnchorTileId === SECRET_STATUE_FEET_TILE_ID ||
    stamp.some((c) => c.tileId === SECRET_STATUE_FEET_TILE_ID);
  if (!secretStatue) return;

  const candidates: Array<[number, number]> = [
    [anchorTx + 1, anchorTy],
    [anchorTx, anchorTy],
    [anchorTx + 1, anchorTy + 1],
  ];
  for (const [baseTx, baseTy] of candidates) {
    if (baseTx <= 1 || baseTy <= 1 || baseTx >= map.getWidth() - 1 || baseTy >= map.getHeight() - 1) {
      continue;
    }
    if (out.some((d) => d.tx === baseTx && d.ty === baseTy && d.tileId === STATUE_PEDESTAL_TILE_ID)) {
      return;
    }
    if (occupied.has(`${baseTx},${baseTy}`)) continue;
    if (map.tileAt(baseTx, baseTy) !== TILE_EMPTY) continue;
    if (!map.isStandableFloorTile(baseTx, baseTy + 1)) continue;
    occupied.add(`${baseTx},${baseTy}`);
    out.push({
      tx: baseTx,
      ty: baseTy,
      tileId: STATUE_PEDESTAL_TILE_ID,
      channel,
      breakableDeco: rollBreakableDeco(project, STATUE_PEDESTAL_TILE_ID, rng),
      groundHugging: true,
    });
    return;
  }
}

function fullObjectGroundingRequired(obj: AutotileObject): boolean {
  return !obj.canSpawnInAir;
}

function buildGroundingRequiredByAnchor(project: TilesetProject): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const obj of project.objects) {
    if (!obj.isFullObject || !hasMultiCellMemberFootprint(obj) || obj.canSpawnInAir) continue;
    const anchor = (obj.anchorTileId || obj.tileIds[0] || "").trim();
    if (anchor) m.set(anchor, true);
    for (const tid of obj.tileIds) m.set(tid, true);
  }
  return m;
}

function mapCellIsOpenAirForDeco(map: TileMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.getWidth() || ty >= map.getHeight()) return false;
  const t = map.tileAt(tx, ty);
  return t === TILE_EMPTY || t === TILE_DOOR || t === TILE_LADDER;
}

function fullObjectStampCellsAllOpenAirOnMap(
  map: TileMap,
  anchorTx: number,
  anchorTy: number,
  stamp: FootprintCell[],
): boolean {
  for (const c of stamp) {
    if (!mapCellIsOpenAirForDeco(map, anchorTx + c.dTx, anchorTy + c.dTy)) return false;
  }
  return true;
}

function fullObjectStampRestsOnMapFloor(
  map: TileMap,
  anchorTx: number,
  anchorTy: number,
  stamp: FootprintCell[],
): boolean {
  let maxDy = Number.MIN_SAFE_INTEGER;
  for (const c of stamp) maxDy = Math.max(maxDy, c.dTy);
  for (const c of stamp) {
    if (c.dTy !== maxDy) continue;
    const ttx = anchorTx + c.dTx;
    const tty = anchorTy + c.dTy;
    const below = tty + 1;
    if (below >= map.getHeight()) return false;
    const t = map.tileAt(ttx, below);
    if (t !== TILE_SOLID && t !== TILE_BREAKABLE && t !== TILE_PLATFORM) return false;
  }
  return true;
}

function decoFootprintFitsBounds(
  map: TileMap,
  anchorTx: number,
  anchorTy: number,
  stamp: FootprintCell[],
  ladderColumnTx: number,
): boolean {
  const w = map.getWidth();
  const h = map.getHeight();
  for (const c of stamp) {
    const ttx = anchorTx + c.dTx;
    const tty = anchorTy + c.dTy;
    if (ttx <= 1 || ttx >= w - 1 || tty <= 1 || tty >= h - 1) return false;
    if (ladderColumnTx >= 0 && ttx === ladderColumnTx) return false;
  }
  return true;
}

function resolveGroundedAnchorTyFromMap(
  map: TileMap,
  anchorTx: number,
  anchorTy: number,
  stamp: FootprintCell[],
  ladderColumnTx: number,
): number {
  const w = map.getWidth();
  const h = map.getHeight();
  let maxDy = 0;
  for (const c of stamp) maxDy = Math.max(maxDy, c.dTy);
  const col = clampInt(anchorTx, 1, w - 2);
  const floorY = groundYFromMap(map)[col]!;
  let snappedTy = floorY - 1 - maxDy;
  if (
    snappedTy >= 1 &&
    decoFootprintFitsBounds(map, anchorTx, snappedTy, stamp, ladderColumnTx) &&
    fullObjectStampCellsAllOpenAirOnMap(map, anchorTx, snappedTy, stamp) &&
    fullObjectStampRestsOnMapFloor(map, anchorTx, snappedTy, stamp)
  ) {
    return snappedTy;
  }
  for (let footBelow = anchorTy + maxDy + 1; footBelow < h - 1; footBelow++) {
    snappedTy = footBelow - 1 - maxDy;
    if (snappedTy < 1) break;
    if (!decoFootprintFitsBounds(map, anchorTx, snappedTy, stamp, ladderColumnTx)) continue;
    if (!fullObjectStampCellsAllOpenAirOnMap(map, anchorTx, snappedTy, stamp)) continue;
    if (!fullObjectStampRestsOnMapFloor(map, anchorTx, snappedTy, stamp)) continue;
    return snappedTy;
  }
  return -1;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export type ScatterDecoContext = {
  placed?: PlacedRoomObject[];
  /** Biome/room terrain bridge — prefer-above matches display tile under cell (Java). */
  bridge?: TerrainTileBridge | null;
  roomKind?: RoomKind;
  floorOrdinal?: number;
  /** Room-kind deco pool for scatter eligibility (Java decoPoolMemberTileIdsForRoomKind). */
  decoPool?: Array<{ objectId: string; weight: number }>;
  /** Java exclusiveNormalPools — NORMAL biome overlay restricts scatter to pool members. */
  exclusiveNormalPools?: boolean;
};

/**
 * Scatter deco with scatterOnEligibleGround on every eligible floor cell
 * (Java DecoPlacementRules.scatterEligibleGroundDeco).
 * Prefer-above checks deco below, placed props, and terrain-bridge display art
 * (logs/stumps live in terrainBridgePool while placedPropsByRoomKind is empty in SoT).
 */
export function scatterEligibleGroundDeco(
  project: TilesetProject,
  map: TileMap,
  contentSeed: bigint,
  existing: DecoStamp[],
  ladderColumnTx: number,
  floorOrdinal: number,
  ctx: ScatterDecoContext | PlacedRoomObject[] = {},
): DecoStamp[] {
  const opts: ScatterDecoContext = Array.isArray(ctx) ? { placed: ctx } : ctx;
  const placed = opts.placed ?? [];
  const bridge = opts.bridge ?? null;
  const roomKind = opts.roomKind ?? RoomKind.NORMAL;
  const floor = opts.floorOrdinal ?? floorOrdinal;
  const kindName = RoomKind[roomKind] ?? "NORMAL";
  const decoPool =
    opts.decoPool ?? project.decoPoolsByRoomKind.get(kindName) ?? [];
  const poolMembers = project.decoPoolMemberTileIds(decoPool);
  const groundScatter = project.groundScatterTileIds();
  const restrictToPool =
    (opts.exclusiveNormalPools ?? false) && roomKind === RoomKind.NORMAL;

  const scatterRules: Array<[string, DecoPlacementRule]> = [];
  for (const [tid, rule] of project.decoPlacementRules) {
    if (rule.scatterOnEligibleGround) scatterRules.push([tid, rule]);
  }
  if (!scatterRules.length) return existing;

  const occupied = new Set(existing.map((s) => `${s.tx},${s.ty}`));
  const out = existing.slice();
  const w = map.getWidth();
  const h = map.getHeight();
  const tileAllowed = (id: string) => project.tileAllowed(id, floor, roomKind);

  for (const [tileId, rule] of scatterRules) {
    if (!project.cell(tileId)) continue;
    const owner = project.objectByTileId.get(tileId);
    if (restrictToPool && !tileOrOwnerInDecoPoolMembers(tileId, owner, poolMembers)) continue;
    if (
      !proceduralDecoTileEligibleForRoomKind(
        project,
        tileId,
        roomKind,
        floor,
        poolMembers,
        groundScatter,
      )
    ) {
      continue;
    }
    for (let ty = 1; ty < h - 1; ty++) {
      for (let tx = 1; tx < w - 1; tx++) {
        if (ladderColumnTx >= 0 && tx === ladderColumnTx) continue;
        const key = `${tx},${ty}`;
        if (occupied.has(key)) continue;
        if (!proceduralDecoEligibleGroundCell(map, tx, ty)) continue;

        const abovePreferred = preferAboveMatches(
          project,
          map,
          out,
          placed,
          bridge,
          roomKind,
          contentSeed,
          tileAllowed,
          tx,
          ty,
          rule,
        );
        const spawnMix =
          contentSeed ^
          (BigInt(tx) * 0x1b873593n) ^
          (BigInt(ty) * 0x85ebca6bn) ^
          (BigInt(javaStringHash(tileId)) * 0xc2b2ae3dn);
        const preferMix =
          contentSeed ^ (BigInt(tx) * 0xc2b2ae3dn) ^ (BigInt(ty) * 0x165667b1n);
        if (!passesDecoPlacementRolls(rule, abovePreferred, spawnMix, preferMix)) continue;

        occupied.add(key);
        out.push({
          tx,
          ty,
          tileId,
          channel: 0,
          breakableDeco: false,
          groundHugging: true,
        });
      }
    }
  }
  return out;
}

/** Java DecoPlacementRules.proceduralDecoEligibleGroundCell. */
export function proceduralDecoEligibleGroundCell(map: TileMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.getWidth() || ty >= map.getHeight()) return false;
  if (map.tileAt(tx, ty) !== TILE_EMPTY) return false;
  const sy = ty + 1;
  if (sy >= map.getHeight() || !map.isStandableFloorTile(tx, sy)) return false;
  const support = map.tileAt(tx, sy);
  if (support === TILE_BREAKABLE || support === TILE_PLATFORM) return true;
  if (tx > 0 && map.isStandableFloorTile(tx - 1, sy)) return true;
  if (tx + 1 < map.getWidth() && map.isStandableFloorTile(tx + 1, sy)) return true;
  return sy + 1 >= map.getHeight() || !map.isStandableFloorTile(tx, sy + 1);
}

/**
 * Java DecoPlacementRules.objectRefIdOnPlacedPropAtTile — logs/stumps are placed props.
 */
export function objectRefIdOnPlacedPropAtTile(
  project: TilesetProject,
  placed: PlacedRoomObject[],
  tx: number,
  ty: number,
): string | null {
  if (!placed.length) return null;
  for (const p of placed) {
    const ref = p.objectRefId?.trim();
    if (ref) {
      if (placedPropFootprintCoversTile(project, p, ref, tx, ty)) return ref;
      continue;
    }
    const tid = p.tileId?.trim();
    if (!tid) continue;
    const ptx = Math.floor(p.xPx / TILE_SIZE);
    const pty = Math.floor(p.yPx / TILE_SIZE);
    if (ptx === tx && pty === ty) {
      const owner = project.objectByTileId.get(tid);
      if (owner?.id) return owner.id;
    }
  }
  return null;
}

function placedPropFootprintCoversTile(
  project: TilesetProject,
  p: PlacedRoomObject,
  objectRefId: string,
  tx: number,
  ty: number,
): boolean {
  const obj = project.objectById.get(objectRefId);
  const anchorTx = Math.floor(p.xPx / TILE_SIZE);
  const anchorTy = Math.floor(p.yPx / TILE_SIZE);
  if (!obj) return anchorTx === tx && anchorTy === ty;
  const foot = footprintDeltasFromObject(obj);
  if (!foot.length) return anchorTx === tx && anchorTy === ty;
  for (const c of foot) {
    if (anchorTx + c.dTx === tx && anchorTy + c.dTy === ty) return true;
  }
  return false;
}

/** Local footprint deltas — avoids importing placeProceduralPlacedProps (cycle via javaStringHash). */
function footprintDeltasFromObject(obj: AutotileObject): Array<{ dTx: number; dTy: number }> {
  const mems = obj.tileIds;
  if (!mems.length) return [];
  const layout = obj.memberGraphLayout;
  if (!layout?.cells.length) return [{ dTx: 0, dTy: 0 }];
  const anchor = obj.anchorTileId || mems[0]!;
  const allow = new Set(mems);
  const pos = new Map<string, { x: number; y: number }>();
  for (const c of layout.cells) {
    if (!c.tileId || !allow.has(c.tileId) || c.x < 0 || c.y < 0) continue;
    if (!pos.has(c.tileId)) pos.set(c.tileId, { x: c.x, y: c.y });
  }
  const ap = pos.get(anchor);
  if (!ap) return [{ dTx: 0, dTy: 0 }];
  const out: Array<{ dTx: number; dTy: number }> = [];
  for (const [, p] of pos) {
    out.push({ dTx: p.x - ap.x, dTy: p.y - ap.y });
  }
  return out.length ? out : [{ dTx: 0, dTy: 0 }];
}

function preferAboveMatches(
  project: TilesetProject,
  map: TileMap,
  stamps: DecoStamp[],
  placed: PlacedRoomObject[],
  bridge: TerrainTileBridge | null,
  roomKind: RoomKind,
  displaySalt: bigint,
  tileAllowed: (id: string) => boolean,
  tx: number,
  ty: number,
  rule: DecoPlacementRule,
): boolean {
  const preferredObjects = rule.preferredAboveObjectIds;
  const preferredTiles = rule.preferredAboveTileIds;
  if (!preferredObjects.length && !preferredTiles.length) return true;

  const belowTy = ty + 1;
  if (belowTy >= map.getHeight()) return false;

  // Java displayTileIdBelowDecoCell: deco stamp below first, else terrain bridge art.
  const belowStamp = stamps.find((s) => s.tx === tx && s.ty === belowTy);
  if (belowStamp) {
    if (preferredTiles.includes(belowStamp.tileId)) return true;
    const owner = project.objectByTileId.get(belowStamp.tileId);
    if (owner && preferredObjects.includes(owner.id)) return true;
    if (preferredObjects.includes(belowStamp.tileId)) return true;
  }

  if (bridge) {
    const belowTerrain = map.tileAt(tx, belowTy);
    const belowDisp = bridge.displayTileIdForRoomKind(
      belowTerrain,
      tx,
      belowTy,
      displaySalt,
      roomKind,
      tileAllowed,
    );
    if (belowDisp) {
      if (preferredTiles.includes(belowDisp)) return true;
      const owner = project.objectByTileId.get(belowDisp);
      if (owner && preferredObjects.includes(owner.id)) return true;
    }
  }

  const belowRef = objectRefIdOnPlacedPropAtTile(project, placed, tx, belowTy);
  if (belowRef && preferredObjects.includes(belowRef)) return true;

  return false;
}

/** Java DecoPlacementRules.passesDecoPlacementRolls two-step (spawn then prefer-above). */
function passesDecoPlacementRolls(
  rule: DecoPlacementRule,
  abovePreferred: boolean,
  spawnMix: bigint,
  preferMix: bigint,
): boolean {
  return (
    passesSpawnWeightRoll(rule, spawnMix) &&
    passesPreferAboveRoll(rule, abovePreferred, preferMix)
  );
}

function passesSpawnWeightRoll(rule: DecoPlacementRule, spawnMix: bigint): boolean {
  const spawnW = clamp01(rule.spawnWeight);
  if (spawnW >= 1 - 1e-9) return true;
  return new JavaRandom(spawnMix).nextDouble() < spawnW;
}

function passesPreferAboveRoll(
  rule: DecoPlacementRule,
  abovePreferred: boolean,
  preferMix: bigint,
): boolean {
  if (!rule.preferredAboveObjectIds.length && !rule.preferredAboveTileIds.length) {
    return true;
  }
  if (abovePreferred) return true;
  // Thin cells not on prefer-above: keep with probability (1 - preferAboveWeight).
  const keepProb = 1 - clamp01(rule.preferAboveWeight);
  return new JavaRandom(preferMix).nextDouble() < keepProb;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Java String.hashCode for deco loot / placement salts. */
export function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
