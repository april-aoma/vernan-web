/**
 * Thin port of Java ProceduralRoomGen.placeProceduralPlacedProps +
 * tryPlacePlacedPropCandidate + evictDecoOverlappingPlacedProps.
 *
 * HVST strip-width widening is out of scope (thin-first).
 */
import { TILE_SIZE } from "../specs";
import { JavaRandom, toJavaLong } from "../util/JavaRandom";
import { packCell } from "../world/BossDoorSealAnim";
import { RoomKind } from "../world/DungeonTypes";
import {
  fromObjectRef,
  fromTileId,
  type PlacedRoomObject,
} from "../world/PlacedRoomObject";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "../world/TileMap";
import { javaStringHash } from "./placeAmbientDeco";
import type {
  AutotileObject,
  MemberFootprintCell,
  TilesetProject,
} from "./TilesetProject";

type PlacedPropCandidate = {
  objectId: string;
  weight: number;
  z: number;
  solidsOnly: boolean;
  obj: AutotileObject;
  fullMems: string[];
  anchorTileId: string;
  placeHeightPx: number;
};

type DecoLike = { tx: number; ty: number };

/**
 * Place grounded props from placedPropsByRoomKind. Skips START.
 * Mutates map when stamping SOLID/PLATFORM substrate.
 */
export function placeProceduralPlacedProps(
  project: TilesetProject,
  map: TileMap,
  kind: RoomKind,
  roomContentSeed: bigint,
  ladderColumnTx: number,
  floorOrdinal: number = 1,
): PlacedRoomObject[] {
  if (kind === RoomKind.START) return [];
  const entries = project.placedPropsByRoomKind.get(RoomKind[kind] ?? "") ?? [];
  if (!entries.length) return [];

  const pool: PlacedPropCandidate[] = [];
  for (const entry of entries) {
    const obj = project.objectById.get(entry.objectId);
    if (!obj || !obj.tileIds.length) continue;
    if (!objectAllowedOnFloor(project, obj, floorOrdinal)) continue;
    const weight = entry.weight;
    if (weight <= 0) continue;
    const z = entry.z ?? 0;
    const solidsOnly = entry.solidsOnly === true;
    const fullMems = allTileIdsInObject(obj);
    if (!fullMems.length) continue;
    if (!objectUsableForKind(project, kind, fullMems, solidsOnly)) continue;
    const anchorTileId = fullMems[0]!;
    const placeHeightPx = Math.max(TILE_SIZE, stampFootprintHeightPx(project, anchorTileId));
    pool.push({
      objectId: entry.objectId,
      weight,
      z,
      solidsOnly,
      obj,
      fullMems,
      anchorTileId,
      placeHeightPx,
    });
  }
  if (!pool.length) return [];

  let weightSum = 0;
  for (const c of pool) weightSum += c.weight;
  const slots = Math.max(1, Math.round(weightSum));
  const out: PlacedRoomObject[] = [];
  for (let slot = 0; slot < slots; slot++) {
    const pick = pickPlacedPropWeighted(pool, roomContentSeed, slot);
    const salt =
      toJavaLong(roomContentSeed) ^
      (BigInt(slot) << 48n) ^
      toJavaLong(BigInt(javaStringHash(pick.objectId)) * 0xc6a4a7935bd1e995n);
    tryPlacePlacedPropCandidate(project, map, pick, ladderColumnTx, salt, out);
  }
  return out;
}

/** Remove deco stamps on cells claimed by expanded placed props (tileId members). */
export function evictDecoOverlappingPlacedProps(
  deco: DecoLike[],
  placed: PlacedRoomObject[],
): void {
  if (!deco.length || !placed.length) return;
  const cells = new Set<number>();
  for (const p of placed) {
    if (!p.tileId) continue;
    cells.add(packCell(Math.floor(p.xPx / TILE_SIZE), Math.floor(p.yPx / TILE_SIZE)));
  }
  if (!cells.size) return;
  for (let i = deco.length - 1; i >= 0; i--) {
    const d = deco[i]!;
    if (cells.has(packCell(d.tx, d.ty))) deco.splice(i, 1);
  }
}

/** Expand object-ref placements into per-member tile placements for draw. */
export function expandPlacedRoomObjectsForDraw(
  placed: PlacedRoomObject[],
  project: TilesetProject,
): PlacedRoomObject[] {
  if (!placed.length) return [];
  const out: PlacedRoomObject[] = [];
  for (const p of placed) {
    if (p.tileId) {
      out.push(p);
      continue;
    }
    const ref = p.objectRefId;
    if (!ref) {
      out.push(p);
      continue;
    }
    const obj = project.objectById.get(ref);
    if (!obj || !expandsMemberFootprintWhenPlaced(obj)) {
      out.push(p);
      continue;
    }
    const foot = fullObjectFootprintFromAnchor(obj);
    if (!hasMultiCellMemberFootprint(foot)) {
      out.push(p);
      continue;
    }
    const anchorTx = Math.floor(p.xPx / TILE_SIZE);
    const anchorTy = Math.floor(p.yPx / TILE_SIZE);
    const layoutSeed =
      toJavaLong(BigInt(anchorTx) * 0x85ebca77n) ^
      toJavaLong(BigInt(anchorTy) * 31n) ^
      toJavaLong(BigInt(javaStringHash(ref)) * 0xc2b2ae3dn);
    // Thin: no memberStyleVariants — use default footprint (pickFootprint falls back same).
    void layoutSeed;
    for (const c of foot) {
      out.push(
        fromTileId(c.tileId, p.xPx + c.dTx * TILE_SIZE, p.yPx + c.dTy * TILE_SIZE, p.zOrder),
      );
    }
  }
  return out;
}

/** Filter expanded props that fail ground / ladder / door draw gates. */
export function filterPlacedPropsForGroundSupport(
  placed: PlacedRoomObject[],
  project: TilesetProject,
  map: TileMap,
): PlacedRoomObject[] {
  if (!placed.length) return [];
  const out: PlacedRoomObject[] = [];
  for (const p of placed) {
    let tid = p.tileId;
    if (!tid && p.objectRefId) {
      const obj = project.objectById.get(p.objectRefId);
      tid = obj?.tileIds[0] ?? "";
    }
    if (!tid || shouldDrawPlacedPropTile(project, map, tid, p.xPx, p.yPx)) {
      out.push(p);
    }
  }
  return out;
}

export function shouldDrawPlacedPropTile(
  project: TilesetProject,
  map: TileMap,
  tileId: string,
  xPx: number,
  yPx: number,
): boolean {
  if (!tileId) return true;
  const tx = Math.floor(xPx / TILE_SIZE);
  const ty = Math.floor(yPx / TILE_SIZE);
  if (!placedPropCellAllowsDraw(map, tx, ty)) return false;
  const obj = project.objectByTileId.get(tileId.trim());
  if (!obj || !obj.isHorizontalStripAutotile) return true;
  const foot = fullObjectFootprintFromAnchor(obj);
  const tid = tileId.trim();
  for (const cell of foot) {
    if (cell.tileId === tid) {
      const ax = xPx - cell.dTx * TILE_SIZE;
      const ay = yPx - cell.dTy * TILE_SIZE;
      return horizontalStripHasFloorSupport(map, ax, ay, foot);
    }
  }
  return horizontalStripHasFloorSupport(map, xPx, yPx, foot);
}

/** Resolve draw tile id from a placed prop (object ref → first member). */
export function resolvePlacedTileId(
  p: PlacedRoomObject,
  project: TilesetProject,
): string {
  if (p.tileId) return p.tileId;
  if (!p.objectRefId) return "";
  const obj = project.objectById.get(p.objectRefId);
  return obj?.tileIds[0] ?? "";
}

/** Cells owned by expanded placed props (for deco blit skip). */
export function placedPropOwnedCells(placedExpanded: PlacedRoomObject[]): Set<number> {
  const out = new Set<number>();
  for (const p of placedExpanded) {
    if (!p.tileId && !p.objectRefId) continue;
    out.add(packCell(Math.floor(p.xPx / TILE_SIZE), Math.floor(p.yPx / TILE_SIZE)));
  }
  return out;
}

function tryPlacePlacedPropCandidate(
  project: TilesetProject,
  map: TileMap,
  pick: PlacedPropCandidate,
  ladderColumnTx: number,
  salt: bigint,
  out: PlacedRoomObject[],
): void {
  const rng = new JavaRandom(salt);
  for (let tries = 0; tries < 72; tries++) {
    const w = map.getWidth();
    if (w <= 4) return;
    const tx = 2 + rng.nextInt(Math.max(1, w - 4));
    if (ladderColumnTx >= 0 && Math.abs(tx - ladderColumnTx) <= 1) continue;
    if (columnHasDoor(map, tx)) continue;
    const groundTop = map.groundTopWorldYAtColumn(tx);
    if (groundTop <= TILE_SIZE) continue;
    const groundInt = Math.round(groundTop);
    const rawTop = groundInt - pick.placeHeightPx;
    const yPx = Math.floor(rawTop / TILE_SIZE) * TILE_SIZE;
    const xPx = tx * TILE_SIZE;

    if (expandsMemberFootprintWhenPlaced(pick.obj)) {
      const layoutSeed =
        toJavaLong(salt) ^
        toJavaLong(BigInt(tx) * 0x85ebca77n) ^
        toJavaLong(BigInt(Math.floor(yPx / TILE_SIZE)) * 31n) ^
        toJavaLong(BigInt(javaStringHash(pick.objectId)) * 0xc2b2ae3dn);
      void layoutSeed;
      let foot = fullObjectFootprintFromAnchor(pick.obj);
      if (!foot.length) continue;
      if (!fullObjectFootprintPassesPlacementChecks(map, xPx, yPx, foot, project, pick.obj)) {
        continue;
      }
      if (
        footprintOverlapsForbiddenCells(map, xPx, yPx, foot) ||
        footprintOverlapsLadderColumn(xPx, foot, ladderColumnTx)
      ) {
        continue;
      }
      const hStrip = pick.obj.isHorizontalStripAutotile;
      for (const cell of foot) {
        out.push(
          fromTileId(
            cell.tileId,
            xPx + cell.dTx * TILE_SIZE,
            yPx + cell.dTy * TILE_SIZE,
            pick.z,
          ),
        );
      }
      if (hStrip) {
        stampHorizontalStripGameplayTerrain(map, xPx, yPx, foot, project);
      } else {
        for (const cell of foot) {
          const mxPx = xPx + cell.dTx * TILE_SIZE;
          const myPx = yPx + cell.dTy * TILE_SIZE;
          stampGameplayTerrainForPlacedProp(map, mxPx, myPx, cell.tileId, project);
        }
      }
      return;
    }

    if (
      anchorGameplayFootprintTileBounds(xPx, yPx, pick.anchorTileId, project) != null &&
      !footprintHasSolidOrPlatformSubstrate(map, xPx, yPx, pick.anchorTileId, project) &&
      !placedPropHasColumnGroundSupport(map, tx, yPx, pick.placeHeightPx)
    ) {
      continue;
    }
    const ty = Math.floor(yPx / TILE_SIZE);
    if (!placedPropCellAllowsDraw(map, tx, ty)) continue;
    out.push(fromObjectRef(pick.objectId, xPx, yPx, pick.z));
    stampGameplayTerrainForPlacedProp(map, xPx, yPx, pick.anchorTileId, project);
    return;
  }
}

function pickPlacedPropWeighted(
  pool: PlacedPropCandidate[],
  roomContentSeed: bigint,
  slot: number,
): PlacedPropCandidate {
  let total = 0;
  for (const c of pool) total += c.weight;
  const seed =
    toJavaLong(roomContentSeed) ^
    (BigInt(slot) << 32n) ^
    doubleToLongBits(total);
  const rng = new JavaRandom(seed);
  let r = rng.nextDouble() * total;
  for (const c of pool) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return pool[pool.length - 1]!;
}

/** IEEE-754 double → long bits (Java Double.doubleToLongBits). */
function doubleToLongBits(v: number): bigint {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, v, false);
  const view = new DataView(buf);
  const hi = BigInt(view.getUint32(0, false));
  const lo = BigInt(view.getUint32(4, false));
  return toJavaLong((hi << 32n) | lo);
}

function objectAllowedOnFloor(
  project: TilesetProject,
  obj: AutotileObject,
  floorOrdinal: number,
): boolean {
  for (const tid of obj.tileIds) {
    if (project.tileAllowedOnFloor(tid, floorOrdinal)) return true;
  }
  return false;
}

function objectUsableForKind(
  project: TilesetProject,
  kind: RoomKind,
  memberIds: string[],
  solidsOnly: boolean,
): boolean {
  for (const tid of memberIds) {
    if (!project.tileAllowedInRoomKind(tid, kind)) continue;
    if (!solidsOnly) return true;
    const mt = (project.tileMapTerrain.get(tid) ?? "").toUpperCase();
    if (mt === "SOLID") return true;
  }
  return false;
}

function allTileIdsInObject(obj: AutotileObject): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tid of obj.tileIds) {
    if (!tid || seen.has(tid)) continue;
    seen.add(tid);
    out.push(tid);
  }
  if (obj.memberGraphLayout) {
    for (const c of obj.memberGraphLayout.cells) {
      if (!c.tileId || seen.has(c.tileId)) continue;
      seen.add(c.tileId);
      out.push(c.tileId);
    }
  }
  return out;
}

function expandsMemberFootprintWhenPlaced(obj: AutotileObject): boolean {
  const t = obj.objectType;
  const packaged = obj.isFullObject || t === "full object" || t === "fullobject";
  const autotile = t === "autotile";
  if (!packaged && !autotile) return false;
  return hasMultiCellMemberFootprint(fullObjectFootprintFromAnchor(obj));
}

function hasMultiCellMemberFootprint(foot: MemberFootprintCell[]): boolean {
  return foot.length > 1 || foot.some((c) => c.dTx !== 0 || c.dTy !== 0);
}

function fullObjectFootprintFromAnchor(obj: AutotileObject): MemberFootprintCell[] {
  const mems = obj.tileIds;
  if (!mems.length) return [];
  const layout = obj.memberGraphLayout;
  if (!layout?.cells.length) {
    return [{ tileId: mems[0]!, dTx: 0, dTy: 0 }];
  }
  const anchor = obj.anchorTileId || mems[0]!;
  const allow = new Set(mems);
  const pos = new Map<string, { x: number; y: number }>();
  for (const c of layout.cells) {
    if (!c.tileId || !allow.has(c.tileId) || c.x < 0 || c.y < 0) continue;
    if (!pos.has(c.tileId)) pos.set(c.tileId, { x: c.x, y: c.y });
  }
  const ap = pos.get(anchor);
  if (!ap) return [{ tileId: anchor, dTx: 0, dTy: 0 }];
  const out: MemberFootprintCell[] = [];
  for (const [tid, p] of pos) {
    out.push({ tileId: tid, dTx: p.x - ap.x, dTy: p.y - ap.y });
  }
  return out.length ? out : [{ tileId: anchor, dTx: 0, dTy: 0 }];
}

function stampFootprintHeightPx(project: TilesetProject, tileId: string): number {
  const def = project.tileDef(tileId);
  let hbY = 0;
  let hbH = TILE_SIZE;
  const hb = def?.hitbox;
  if (hb && typeof hb === "object") {
    const hbm = hb as Record<string, unknown>;
    hbY = typeof hbm.y === "number" ? hbm.y : 0;
    hbH = Math.max(TILE_SIZE, typeof hbm.h === "number" ? hbm.h : TILE_SIZE);
  }
  return hbH + hbY;
}

function gameplayTileFromMapTerrain(raw: string | undefined): number {
  if (!raw) return TILE_EMPTY;
  const t = raw.trim().toUpperCase();
  if (!t || t === "EMPTY") return TILE_EMPTY;
  switch (t) {
    case "SOLID":
      return TILE_SOLID;
    case "DOOR":
      return TILE_DOOR;
    case "PLATFORM":
      return TILE_PLATFORM;
    case "LADDER":
      return TILE_LADDER;
    case "BREAKABLE":
      return TILE_BREAKABLE;
    case "KEYBLOCK":
      return 6;
    case "KEYBLOCK_CONNECTOR":
      return 7;
    default:
      return TILE_EMPTY;
  }
}

function anchorGameplayFootprintTileBounds(
  xPx: number,
  yPx: number,
  tileId: string,
  project: TilesetProject,
): [number, number, number, number, number] | null {
  const mt = project.tileMapTerrain.get(tileId) ?? "EMPTY";
  const mapVal = gameplayTileFromMapTerrain(mt);
  if (mapVal === TILE_EMPTY) return null;
  const def = project.tileDef(tileId);
  let hbX = 0;
  let hbY = 0;
  let hbW = TILE_SIZE;
  let hbH = TILE_SIZE;
  const hb = def?.hitbox;
  if (hb && typeof hb === "object") {
    const hbm = hb as Record<string, unknown>;
    hbX = typeof hbm.x === "number" ? hbm.x : 0;
    hbY = typeof hbm.y === "number" ? hbm.y : 0;
    hbW = Math.max(TILE_SIZE, typeof hbm.w === "number" ? hbm.w : TILE_SIZE);
    hbH = Math.max(TILE_SIZE, typeof hbm.h === "number" ? hbm.h : TILE_SIZE);
  }
  // Thin: skip HVST horizontal-strip width expansion from connectsWithTileIds.
  const x0 = xPx + hbX;
  const y0 = yPx + hbY;
  const x1 = x0 + hbW - 1;
  const y1 = y0 + hbH - 1;
  return [
    Math.floor(x0 / TILE_SIZE),
    Math.floor(y0 / TILE_SIZE),
    Math.floor(x1 / TILE_SIZE),
    Math.floor(y1 / TILE_SIZE),
    mapVal,
  ];
}

function stampGameplayTerrainForPlacedProp(
  map: TileMap,
  xPx: number,
  yPx: number,
  tileId: string,
  project: TilesetProject,
): void {
  const b = anchorGameplayFootprintTileBounds(xPx, yPx, tileId, project);
  if (!b) return;
  const [tx0, ty0, tx1, ty1, mapVal] = b;
  if (mapVal === TILE_EMPTY) return;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= map.getWidth() || ty >= map.getHeight()) continue;
      const cur = map.tileAt(tx, ty);
      if (cur !== TILE_SOLID && cur !== TILE_PLATFORM) continue;
      map.setTile(tx, ty, mapVal);
    }
  }
}

function stampHorizontalStripGameplayTerrain(
  map: TileMap,
  anchorXPx: number,
  anchorYPx: number,
  foot: MemberFootprintCell[],
  project: TilesetProject,
): void {
  for (const cell of foot) {
    const mxPx = anchorXPx + cell.dTx * TILE_SIZE;
    const myPx = anchorYPx + cell.dTy * TILE_SIZE;
    stampMemberCellGameplayTerrain(map, mxPx, myPx, cell.tileId, project);
  }
}

function stampMemberCellGameplayTerrain(
  map: TileMap,
  xPx: number,
  yPx: number,
  tileId: string,
  project: TilesetProject,
): void {
  const mapVal = gameplayTileFromMapTerrain(project.tileMapTerrain.get(tileId));
  if (mapVal === TILE_EMPTY) return;
  const tx = Math.floor(xPx / TILE_SIZE);
  const ty = Math.floor(yPx / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= map.getWidth() || ty >= map.getHeight()) return;
  const cur = map.tileAt(tx, ty);
  if (cur !== TILE_EMPTY && cur !== TILE_SOLID && cur !== TILE_PLATFORM) return;
  map.setTile(tx, ty, mapVal);
}

function fullObjectFootprintPassesPlacementChecks(
  map: TileMap,
  anchorXPx: number,
  anchorYPx: number,
  foot: MemberFootprintCell[],
  project: TilesetProject,
  obj: AutotileObject,
): boolean {
  if (foot.length && obj.isHorizontalStripAutotile) {
    return horizontalStripHasFloorSupport(map, anchorXPx, anchorYPx, foot);
  }
  let anyGameplayFootprint = false;
  for (const cell of foot) {
    const mx = anchorXPx + cell.dTx * TILE_SIZE;
    const my = anchorYPx + cell.dTy * TILE_SIZE;
    if (anchorGameplayFootprintTileBounds(mx, my, cell.tileId, project) != null) {
      anyGameplayFootprint = true;
      if (!footprintHasSolidOrPlatformSubstrate(map, mx, my, cell.tileId, project)) {
        return false;
      }
    }
  }
  if (anyGameplayFootprint) return true;
  const anchorId = foot[0]?.tileId ?? "";
  return (
    !anchorId ||
    anchorGameplayFootprintTileBounds(anchorXPx, anchorYPx, anchorId, project) == null ||
    footprintHasSolidOrPlatformSubstrate(map, anchorXPx, anchorYPx, anchorId, project)
  );
}

function footprintHasSolidOrPlatformSubstrate(
  map: TileMap,
  xPx: number,
  yPx: number,
  tileId: string,
  project: TilesetProject,
): boolean {
  const b = anchorGameplayFootprintTileBounds(xPx, yPx, tileId, project);
  if (!b) return false;
  const [tx0, ty0, tx1, ty1] = b;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= map.getWidth() || ty >= map.getHeight()) continue;
      const cur = map.tileAt(tx, ty);
      if (cur === TILE_SOLID || cur === TILE_PLATFORM) return true;
    }
  }
  return false;
}

function placedPropHasColumnGroundSupport(
  map: TileMap,
  tx: number,
  anchorTopPx: number,
  footprintHeightPx: number,
): boolean {
  if (tx < 0 || tx >= map.getWidth()) return false;
  const groundTop = map.groundTopWorldYAtColumn(tx);
  if (groundTop <= TILE_SIZE) return false;
  const groundTy = Math.max(0, Math.floor((groundTop - 1.0) / TILE_SIZE));
  if (groundTy >= map.getHeight()) return false;
  const groundCode = map.tileAt(tx, groundTy);
  if (
    groundCode !== TILE_SOLID &&
    groundCode !== TILE_PLATFORM &&
    groundCode !== TILE_BREAKABLE
  ) {
    return false;
  }
  const anchorBottomPx = anchorTopPx + footprintHeightPx;
  const groundPx = Math.round(groundTop);
  return (
    anchorBottomPx >= groundPx - TILE_SIZE && anchorBottomPx <= groundPx + TILE_SIZE
  );
}

function placedPropCellAllowsDraw(map: TileMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.getWidth() || ty >= map.getHeight()) return false;
  const t = map.tileAt(tx, ty);
  return t !== TILE_LADDER && t !== TILE_DOOR && t !== TILE_BREAKABLE;
}

function placedFloorPropTileHasSolidBelow(map: TileMap, tx: number, ty: number): boolean {
  const underTy = ty + 1;
  if (underTy < 0 || underTy >= map.getHeight()) return false;
  if (tx < 0 || tx >= map.getWidth()) return false;
  const below = map.tileAt(tx, underTy);
  return below === TILE_SOLID || below === TILE_PLATFORM || below === TILE_BREAKABLE;
}

function horizontalStripHasFloorSupport(
  map: TileMap,
  anchorXPx: number,
  anchorYPx: number,
  foot: MemberFootprintCell[],
): boolean {
  for (const cell of foot) {
    const tx = Math.floor((anchorXPx + cell.dTx * TILE_SIZE) / TILE_SIZE);
    const ty = Math.floor((anchorYPx + cell.dTy * TILE_SIZE) / TILE_SIZE);
    if (placedFloorPropTileHasSolidBelow(map, tx, ty)) return true;
  }
  return false;
}

function columnHasDoor(m: TileMap, tx: number): boolean {
  for (let ty = 0; ty < m.getHeight(); ty++) {
    if (m.isDoorTile(tx, ty)) return true;
  }
  return false;
}

function footprintOverlapsForbiddenCells(
  map: TileMap,
  anchorXPx: number,
  anchorYPx: number,
  foot: MemberFootprintCell[],
): boolean {
  for (const cell of foot) {
    const tx = Math.floor((anchorXPx + cell.dTx * TILE_SIZE) / TILE_SIZE);
    const ty = Math.floor((anchorYPx + cell.dTy * TILE_SIZE) / TILE_SIZE);
    if (!placedPropCellAllowsDraw(map, tx, ty)) return true;
  }
  return false;
}

function footprintOverlapsLadderColumn(
  anchorXPx: number,
  foot: MemberFootprintCell[],
  ladderColumnTx: number,
): boolean {
  if (ladderColumnTx < 0) return false;
  for (const cell of foot) {
    const tx = Math.floor((anchorXPx + cell.dTx * TILE_SIZE) / TILE_SIZE);
    if (tx === ladderColumnTx) return true;
  }
  return false;
}
