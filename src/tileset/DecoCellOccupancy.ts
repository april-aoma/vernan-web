import { JavaRandom } from "../util/JavaRandom";
import type { AutotileObject, TilesetProject } from "./TilesetProject";

/** Minimal deco cell for occupancy (structurally compatible with DecoStamp). */
export type DecoOccupancyStamp = {
  tx: number;
  ty: number;
  tileId: string;
  channel?: 0 | 1;
  argb?: number;
  breakableDeco?: boolean;
  groundHugging?: boolean;
};
/**
 * Procedural deco overlap policy (Java DecoCellOccupancy): at most one deco stamp
 * per grid cell; room seed picks when a placement conflicts. Full-object
 * footprints evict singles on their cells before stamping.
 *
 * Candle tile ids are classified (pool / draw hooks) but do not currently get a
 * stacking exception — {@link ensureCandlesDrawOnTop} is a no-op, matching Java.
 */

export type DecoOccupancyClassifiers = {
  candleTileIds: ReadonlySet<string>;
  fullObjectMemberTileIds: ReadonlySet<string>;
  fullObjectMemberToAnchor: ReadonlyMap<string, string>;
  backdropTileIds: ReadonlySet<string>;
};

const enum LayerKind {
  Empty = 0,
  Occupied = 1,
}

function packCellKey(tx: number, ty: number): number {
  return ((ty & 0xffff) << 16) | (tx & 0xffff);
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
  return layout.length > 1;
}

function footprintCellsForObject(
  obj: AutotileObject,
): Array<{ tileId: string; dTx: number; dTy: number }> {
  const cells = obj.islands[0]?.cells;
  if (cells?.length) {
    return cells.map((c) => ({ tileId: c.tileId, dTx: c.dTx, dTy: c.dTy }));
  }
  return [];
}

/** Build classifiers once per tileset (Java classifiersFromObjects / FromRuntime). */
export function classifiersFromProject(project: TilesetProject): DecoOccupancyClassifiers {
  const candleTileIds = new Set<string>();
  const fullObjectMemberTileIds = new Set<string>();
  const fullObjectMemberToAnchor = new Map<string, string>();
  const backdropTileIds = new Set<string>();

  for (const obj of project.objects) {
    const memberIds = obj.tileIds;
    if (!memberIds.length) continue;
    const anchor = (obj.anchorTileId || memberIds[0] || "").trim();
    if (obj.objectType.toLowerCase() === "candle") {
      for (const tid of memberIds) candleTileIds.add(tid);
    }
    if (obj.isFullObject && hasMultiCellMemberFootprint(obj)) {
      const foot = footprintCellsForObject(obj);
      const cells =
        foot.length > 0
          ? foot
          : memberIds.map((tileId, i) => ({
              tileId,
              dTx: i === 0 ? 0 : i,
              dTy: 0,
            }));
      for (const c of cells) {
        fullObjectMemberTileIds.add(c.tileId);
        fullObjectMemberToAnchor.set(c.tileId, anchor);
      }
    }
    if (obj.id.toLowerCase().startsWith("background tiles")) {
      for (const tid of memberIds) backdropTileIds.add(tid);
    }
  }

  for (const tid of project.backgroundSceneTileIds) {
    backdropTileIds.add(tid);
  }

  return {
    candleTileIds,
    fullObjectMemberTileIds,
    fullObjectMemberToAnchor,
    backdropTileIds,
  };
}

export function isCandleTile(
  classifiers: DecoOccupancyClassifiers | null | undefined,
  tileId: string | null | undefined,
): boolean {
  if (!classifiers || !tileId) return false;
  const tid = tileId.trim();
  return tid.length > 0 && classifiers.candleTileIds.has(tid);
}

export class DecoCellOccupancy {
  private readonly roomSeed: bigint;
  private readonly classifiers: DecoOccupancyClassifiers;
  private readonly layerByCell = new Map<number, LayerKind>();
  private readonly fullObjectAnchorByCell = new Map<number, string>();

  constructor(roomSeed: bigint | number, classifiers: DecoOccupancyClassifiers) {
    this.roomSeed = typeof roomSeed === "bigint" ? roomSeed : BigInt(roomSeed);
    this.classifiers = classifiers;
  }

  /**
   * @param overlayEmptyOnly when true (ITEM/SHOP overlay), only places on cells
   *   with no deco layers yet.
   */
  tryPlaceSingle(
    deco: DecoOccupancyStamp[],
    tx: number,
    ty: number,
    tile: DecoOccupancyStamp,
    overlayEmptyOnly: boolean,
  ): boolean {
    if (overlayEmptyOnly && this.layerKind(tx, ty) !== LayerKind.Empty) {
      return false;
    }
    return this.placeSingle(deco, tx, ty, tile);
  }

  /**
   * Stamps a full-object footprint after evicting single-tile deco on those cells.
   * Rejects when any footprint cell is already part of a different full object.
   */
  tryPlaceFootprint(
    deco: DecoOccupancyStamp[],
    anchorTx: number,
    anchorTy: number,
    anchorTileId: string,
    stamp: ReadonlyArray<{ tileId: string; dTx: number; dTy: number }>,
    cellsToAdd: DecoOccupancyStamp[],
  ): boolean {
    if (!stamp.length || !cellsToAdd.length) return false;
    const anchor = (anchorTileId ?? "").trim();
    for (const c of stamp) {
      const ttx = anchorTx + c.dTx;
      const tty = anchorTy + c.dTy;
      const existing = this.fullObjectAnchorByCell.get(packCellKey(ttx, tty));
      if (existing != null && existing !== anchor) {
        return false;
      }
    }
    for (const c of stamp) {
      const ttx = anchorTx + c.dTx;
      const tty = anchorTy + c.dTy;
      const key = packCellKey(ttx, tty);
      this.evictAllDecoAt(deco, ttx, tty);
      this.fullObjectAnchorByCell.set(key, anchor);
      this.layerByCell.set(key, LayerKind.Occupied);
    }
    for (const t of cellsToAdd) {
      deco.push(t);
    }
    return true;
  }

  /** True when tileId is a non-anchor segment of a packaged full object. */
  isOrphanFullObjectMemberTile(tileId: string | null | undefined): boolean {
    if (!tileId) return false;
    const tid = tileId.trim();
    if (!tid) return false;
    const anchor = this.classifiers.fullObjectMemberToAnchor.get(tid);
    return anchor != null && anchor !== tid;
  }

  isOccupied(tx: number, ty: number): boolean {
    return this.layerKind(tx, ty) !== LayerKind.Empty;
  }

  /**
   * Rebuild layer + full-object anchor maps from an existing stamp list without
   * mutating it (used when overlays continue after ambient in a later pass).
   */
  seedFromExistingStamps(stamps: readonly DecoOccupancyStamp[]): void {
    this.layerByCell.clear();
    this.fullObjectAnchorByCell.clear();
    for (const s of stamps) {
      const tid = s.tileId?.trim() ?? "";
      const key = packCellKey(s.tx, s.ty);
      this.layerByCell.set(key, LayerKind.Occupied);
      if (!tid) continue;
      const anchor = this.classifiers.fullObjectMemberToAnchor.get(tid);
      if (anchor) {
        this.fullObjectAnchorByCell.set(key, anchor);
      }
    }
  }

  private placeSingle(
    deco: DecoOccupancyStamp[],
    tx: number,
    ty: number,
    tile: DecoOccupancyStamp,
  ): boolean {
    const key = packCellKey(tx, ty);
    if (this.fullObjectAnchorByCell.has(key)) {
      return false;
    }
    if (this.layerKind(tx, ty) !== LayerKind.Empty) {
      const existing = findDecoAt(deco, tx, ty);
      if (!existing) return false;
      if (this.seedKeepExisting(tx, ty)) {
        return false;
      }
      this.evictAllDecoAt(deco, tx, ty);
    }
    this.layerByCell.set(key, LayerKind.Occupied);
    deco.push(tile);
    return true;
  }

  private layerKind(tx: number, ty: number): LayerKind {
    return this.layerByCell.get(packCellKey(tx, ty)) ?? LayerKind.Empty;
  }

  private seedKeepExisting(tx: number, ty: number): boolean {
    const mix =
      this.roomSeed ^
      (BigInt(tx) * 0x1b873593n) ^
      (BigInt(ty) * 0x85ebca6bn);
    return new JavaRandom(mix).nextBoolean();
  }

  private evictAllDecoAt(deco: DecoOccupancyStamp[], tx: number, ty: number): void {
    const key = packCellKey(tx, ty);
    this.fullObjectAnchorByCell.delete(key);
    for (let i = deco.length - 1; i >= 0; i--) {
      const d = deco[i]!;
      if (d.tx === tx && d.ty === ty) deco.splice(i, 1);
    }
    this.layerByCell.delete(key);
  }
}

/** Legacy hook; strict one-deco-per-cell needs no reorder (Java no-op). */
export function ensureCandlesDrawOnTop(
  _deco: DecoOccupancyStamp[],
  _classifiers: DecoOccupancyClassifiers | null | undefined,
): void {}

/** Drops duplicate deco stamps per cell (one winner via room seed). */
export function compactDecoList(
  deco: DecoOccupancyStamp[],
  roomSeed: bigint | number,
  _classifiers?: DecoOccupancyClassifiers | null,
): void {
  if (deco.length < 2) return;
  const seed = typeof roomSeed === "bigint" ? roomSeed : BigInt(roomSeed);
  const indicesByCell = new Map<number, number[]>();
  for (let i = 0; i < deco.length; i++) {
    const d = deco[i]!;
    const key = packCellKey(d.tx, d.ty);
    let idxs = indicesByCell.get(key);
    if (!idxs) {
      idxs = [];
      indicesByCell.set(key, idxs);
    }
    idxs.push(i);
  }
  const drop = new Set<number>();
  for (const idxs of indicesByCell.values()) {
    if (idxs.length < 2) continue;
    const first = deco[idxs[0]!]!;
    const mix =
      seed ^ (BigInt(first.tx) * 0x1b873593n) ^ (BigInt(first.ty) * 0x85ebca6bn);
    const winner = idxs[new JavaRandom(mix).nextInt(idxs.length)]!;
    for (const i of idxs) {
      if (i !== winner) drop.add(i);
    }
  }
  if (!drop.size) return;
  const sorted = [...drop].sort((a, b) => b - a);
  for (const i of sorted) {
    deco.splice(i, 1);
  }
}

function findDecoAt(
  deco: DecoOccupancyStamp[],
  tx: number,
  ty: number,
): DecoOccupancyStamp | null {
  for (const d of deco) {
    if (d.tx === tx && d.ty === ty) return d;
  }
  return null;
}
