import { JavaRandom } from "../util/JavaRandom";
import type { TileMap } from "../world/TileMap";
import { TILE_EMPTY } from "../world/TileMap";
import type { BiomeResolution } from "./NormalRoomBiomes";
import type { AutotileObject, TilesetProject } from "./TilesetProject";

export type DecoStamp = {
  tx: number;
  ty: number;
  tileId: string;
  /** 0 = red channel tint hint, 1 = blue */
  channel: 0 | 1;
};

export { placeStepBreakables } from "./placeStepBreakables";

/**
 * Ambient deco clusters (Java RoomGenerator ellipse blobs).
 * Full-object packages stamp their member-graph footprint as a unit.
 */
export function placeAmbientDeco(
  project: TilesetProject,
  map: TileMap,
  contentSeed: bigint,
  biome: BiomeResolution,
  ladderColumnTx: number,
): DecoStamp[] {
  const w = map.getWidth();
  const h = map.getHeight();
  const rng = new JavaRandom(contentSeed ^ 0xdec07een);
  let cmin = biome.decoClusterCountMin;
  let cmax = biome.decoClusterCountMax;
  if (cmax < cmin) [cmin, cmax] = [cmax, cmin];
  const clusters = cmin + (cmax > cmin ? rng.nextInt(cmax - cmin + 1) : 0);

  const pool = expandDecoPoolEntries(project, biome.decoPool, biome.decoClusterFallback);
  if (!pool.length) return [];

  const stamps: DecoStamp[] = [];
  const occupied = new Set<string>();

  for (let i = 0; i < clusters; i++) {
    const red = rng.nextBoolean();
    const channel: 0 | 1 = red ? 0 : 1;
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
          );
          stamps.push(...placed);
        } else if (entry.tileId && project.cell(entry.tileId)) {
          occupied.add(key);
          stamps.push({ tx, ty, tileId: entry.tileId, channel });
        }
      }
    }
  }
  return stamps;
}

type PoolEntry =
  | { kind: "tile"; tileId: string }
  | { kind: "full"; obj: AutotileObject; tileId: string };

function expandDecoPoolEntries(
  project: TilesetProject,
  pool: Array<{ objectId: string; weight: number }>,
  fallback: { red: string; blue: string },
): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const entry of pool) {
    const count = Math.max(0, Math.round(entry.weight * 10));
    if (count <= 0) continue;
    const obj = project.objectById.get(entry.objectId);
    if (obj?.isFullObject && obj.memberGraphLayout && obj.tileIds.length) {
      for (let i = 0; i < count; i++) {
        out.push({ kind: "full", obj, tileId: obj.tileIds[0]! });
      }
      continue;
    }
    if (obj?.tileIds.length) {
      // tile+variations: every member equally; autotile/candle: first only.
      const members =
        obj.objectType === "tile+variations" || !obj.objectType
          ? obj.tileIds
          : [obj.tileIds[0]!];
      for (const mid of members) {
        if (!project.cell(mid)) continue;
        for (let i = 0; i < count; i++) out.push({ kind: "tile", tileId: mid });
      }
      continue;
    }
    if (project.cell(entry.objectId)) {
      for (let i = 0; i < count; i++) out.push({ kind: "tile", tileId: entry.objectId });
    }
  }
  if (!out.length) {
    if (project.cell(fallback.red)) out.push({ kind: "tile", tileId: fallback.red });
    if (project.cell(fallback.blue)) out.push({ kind: "tile", tileId: fallback.blue });
  }
  return out;
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
): DecoStamp[] {
  const foot = obj.islands[0]?.cells;
  const cells =
    foot && foot.length
      ? foot
      : obj.tileIds.map((tileId, i) => ({ tileId, dTx: 0, dTy: i }));
  // Dry-run: all cells must be empty and in bounds.
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
    out.push({ tx, ty, tileId: c.tileId, channel });
  }
  return out;
}
