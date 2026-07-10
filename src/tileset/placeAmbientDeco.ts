import { JavaRandom } from "../util/JavaRandom";
import type { TileMap } from "../world/TileMap";
import { TILE_BREAKABLE, TILE_EMPTY, TILE_PLATFORM } from "../world/TileMap";
import type { BiomeResolution } from "./NormalRoomBiomes";
import type { AutotileObject, DecoPlacementRule, TilesetProject } from "./TilesetProject";

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
 * Ambient deco clusters (Java RoomGenerator ellipse blobs) + ground-scatter post-pass.
 * Full-object packages stamp their member-graph footprint as a unit.
 */
export function placeAmbientDeco(
  project: TilesetProject,
  map: TileMap,
  contentSeed: bigint,
  biome: BiomeResolution,
  ladderColumnTx: number,
  floorOrdinal = 1,
): DecoStamp[] {
  const w = map.getWidth();
  const h = map.getHeight();
  const rng = new JavaRandom(contentSeed ^ 0xdec07een);
  let cmin = biome.decoClusterCountMin;
  let cmax = biome.decoClusterCountMax;
  if (cmax < cmin) [cmin, cmax] = [cmax, cmin];
  const clusters = cmin + (cmax > cmin ? rng.nextInt(cmax - cmin + 1) : 0);

  const groundScatter = project.groundScatterTileIds();
  const poolRed = expandDecoPoolEntries(
    project,
    biome.decoPool,
    biome.decoClusterFallback,
    "red",
    groundScatter,
    floorOrdinal,
  );
  const poolBlue = expandDecoPoolEntries(
    project,
    biome.decoPool,
    biome.decoClusterFallback,
    "blue",
    groundScatter,
    floorOrdinal,
  );
  if (!poolRed.length && !poolBlue.length) {
    return scatterEligibleGroundDeco(
      project,
      map,
      contentSeed,
      [],
      ladderColumnTx,
      floorOrdinal,
    );
  }

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

  return scatterEligibleGroundDeco(
    project,
    map,
    contentSeed,
    stamps,
    ladderColumnTx,
    floorOrdinal,
  );
}

/**
 * Thin reground: drop ground-hugging stamps that lost standable support after
 * seams/keyblocks (Java DecoPlacementRules.regroundToFinalTerrain subset).
 */
export function regroundDecoStampsToFinalTerrain(
  stamps: DecoStamp[],
  map: TileMap,
  ladderColumnTx: number,
): DecoStamp[] {
  return stamps.filter((s) => {
    if (ladderColumnTx >= 0 && s.tx === ladderColumnTx) return false;
    if (s.tx <= 0 || s.ty <= 0 || s.tx >= map.getWidth() - 1 || s.ty >= map.getHeight() - 1) {
      return false;
    }
    if (map.tileAt(s.tx, s.ty) !== TILE_EMPTY) return false;
    if (s.groundHugging) {
      return proceduralDecoEligibleGroundCell(map, s.tx, s.ty);
    }
    return true;
  });
}

type PoolEntry =
  | { kind: "tile"; tileId: string }
  | { kind: "full"; obj: AutotileObject; tileId: string };

function expandDecoPoolEntries(
  project: TilesetProject,
  pool: Array<{ objectId: string; weight: number }>,
  fallback: { red: string; blue: string },
  channel: "red" | "blue",
  groundScatter: Set<string>,
  floorOrdinal: number,
): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const entry of pool) {
    const count = Math.max(0, Math.round(entry.weight * 10));
    if (count <= 0) continue;
    const obj = project.objectById.get(entry.objectId);
    if (obj?.isFullObject && obj.memberGraphLayout && obj.tileIds.length) {
      if (!objectMatchesChannel(obj, channel)) continue;
      const anchor = obj.tileIds[0]!;
      if (!tileEligibleForAmbient(project, anchor, groundScatter, floorOrdinal)) continue;
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
        if (!tileEligibleForAmbient(project, mid, groundScatter, floorOrdinal)) continue;
        for (let i = 0; i < count; i++) out.push({ kind: "tile", tileId: mid });
      }
      continue;
    }
    if (project.cell(entry.objectId)) {
      const ch = project.decoBlobChannelForTile(entry.objectId);
      if (ch !== "all" && ch !== channel) continue;
      if (!tileEligibleForAmbient(project, entry.objectId, groundScatter, floorOrdinal)) continue;
      for (let i = 0; i < count; i++) out.push({ kind: "tile", tileId: entry.objectId });
    }
  }
  if (!out.length) {
    const fb = channel === "red" ? fallback.red : fallback.blue;
    if (tileEligibleForAmbient(project, fb, groundScatter, floorOrdinal)) {
      out.push({ kind: "tile", tileId: fb });
    }
  }
  return out;
}

function objectMatchesChannel(obj: AutotileObject, channel: "red" | "blue"): boolean {
  return obj.decoBlobClusterChannel === "all" || obj.decoBlobClusterChannel === channel;
}

function tileEligibleForAmbient(
  project: TilesetProject,
  tileId: string,
  groundScatter: Set<string>,
  floorOrdinal: number,
): boolean {
  if (!project.cell(tileId)) return false;
  if (groundScatter.has(tileId)) return false;
  if (project.backgroundSceneTileIds.has(tileId)) return false;
  if (!project.emptyMapTerrainTileIds.has(tileId)) return false;
  if (!project.tileAllowedOnFloor(tileId, floorOrdinal)) return false;
  return true;
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
  const foot = obj.islands[0]?.cells;
  const cells =
    foot && foot.length
      ? foot
      : obj.tileIds.map((tileId, i) => ({ tileId, dTx: 0, dTy: i }));
  for (const c of cells) {
    const tx = anchorTx + c.dTx;
    const ty = anchorTy + c.dTy;
    if (tx <= 0 || ty <= 0 || tx >= map.getWidth() - 1 || ty >= map.getHeight() - 1) {
      return [];
    }
    if (ladderColumnTx >= 0 && tx === ladderColumnTx) return [];
    if (map.tileAt(tx, ty) !== TILE_EMPTY) return [];
    if (occupied.has(`${tx},${ty}`)) return [];
    if (!project.cell(c.tileId)) return [];
  }
  const out: DecoStamp[] = [];
  for (const c of cells) {
    const tx = anchorTx + c.dTx;
    const ty = anchorTy + c.dTy;
    occupied.add(`${tx},${ty}`);
    out.push({
      tx,
      ty,
      tileId: c.tileId,
      channel,
      breakableDeco: rollBreakableDeco(project, c.tileId, rng),
      groundHugging: false,
    });
  }
  return out;
}

/**
 * Scatter deco with scatterOnEligibleGround on every eligible floor cell
 * (Java DecoPlacementRules.scatterEligibleGroundDeco thin).
 */
export function scatterEligibleGroundDeco(
  project: TilesetProject,
  map: TileMap,
  contentSeed: bigint,
  existing: DecoStamp[],
  ladderColumnTx: number,
  floorOrdinal: number,
): DecoStamp[] {
  const scatterRules: Array<[string, DecoPlacementRule]> = [];
  for (const [tid, rule] of project.decoPlacementRules) {
    if (rule.scatterOnEligibleGround) scatterRules.push([tid, rule]);
  }
  if (!scatterRules.length) return existing;

  const occupied = new Set(existing.map((s) => `${s.tx},${s.ty}`));
  const out = existing.slice();
  const w = map.getWidth();
  const h = map.getHeight();

  for (const [tileId, rule] of scatterRules) {
    if (!project.cell(tileId)) continue;
    if (!project.tileAllowedOnFloor(tileId, floorOrdinal)) continue;
    if (project.backgroundSceneTileIds.has(tileId)) continue;
    const hasPrefer = rule.preferredAboveObjectIds.length > 0;
    for (let ty = 1; ty < h - 1; ty++) {
      for (let tx = 1; tx < w - 1; tx++) {
        if (ladderColumnTx >= 0 && tx === ladderColumnTx) continue;
        const key = `${tx},${ty}`;
        if (occupied.has(key)) continue;
        if (!proceduralDecoEligibleGroundCell(map, tx, ty)) continue;

        const abovePreferred =
          hasPrefer && preferAboveMatches(project, map, out, tx, ty, rule.preferredAboveObjectIds);
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

function preferAboveMatches(
  project: TilesetProject,
  map: TileMap,
  stamps: DecoStamp[],
  tx: number,
  ty: number,
  preferredObjectIds: string[],
): boolean {
  const belowTy = ty + 1;
  if (belowTy >= map.getHeight()) return false;
  const belowStamp = stamps.find((s) => s.tx === tx && s.ty === belowTy);
  if (belowStamp) {
    const owner = project.objectByTileId.get(belowStamp.tileId);
    if (owner && preferredObjectIds.includes(owner.id)) return true;
    if (preferredObjectIds.includes(belowStamp.tileId)) return true;
  }
  // Also accept solid/breakable terrain under preferred object names via object id match only.
  void map;
  return false;
}

/** Java DecoPlacementRules.passesDecoPlacementRolls two-step (spawn then prefer-above thin). */
function passesDecoPlacementRolls(
  rule: DecoPlacementRule,
  abovePreferred: boolean,
  spawnMix: bigint,
  preferMix: bigint,
): boolean {
  const spawnW = rule.spawnWeight;
  if (spawnW < 1 - 1e-9) {
    if (unit01(spawnMix) >= spawnW) return false;
  }
  if (abovePreferred) return true;
  const preferW = rule.preferAboveWeight;
  if (preferW >= 1 - 1e-9) return true;
  // Thin cells not on prefer-above with probability (1 - preferAboveWeight).
  return unit01(preferMix) < preferW;
}

function unit01(mix: bigint): number {
  const u = BigInt.asUintN(64, mix);
  // Map to [0,1) via high bits (stable, Java Random-ish).
  return Number((u >> 11n) & 0x1fffffffffffffn) / Number(0x1fffffffffffffn + 1n);
}

/** Java String.hashCode for deco loot / placement salts. */
export function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
