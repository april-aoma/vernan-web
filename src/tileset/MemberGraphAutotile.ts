import type { TileMap } from "../world/TileMap";
import { TILE_BREAKABLE, TILE_SOLID } from "../world/TileMap";
import type { RoomKind } from "../world/DungeonTypes";
import type { TerrainTileBridge } from "./TerrainTileBridge";
import {
  isHorizontalStripFootprint,
  isVerticalStripFootprint,
  type AutotileObject,
  type MemberFootprintCell,
  type MemberGraphIsland,
  type TilesetProject,
} from "./TilesetProject";

export type AutotileMassContext = {
  object: AutotileObject;
  bridge: TerrainTileBridge;
  displaySalt: bigint;
  roomKind: RoomKind;
  /** Floor gate for neighbor bridge picks (Java tileAllowedOnFloor). */
  floorOrdinal?: number;
  project?: TilesetProject;
};

type GridPickResult = { tileId: string; score: number; exact: boolean };

enum ComponentShape {
  SINGLETON = "SINGLETON",
  HORIZONTAL_STRIP = "HORIZONTAL_STRIP",
  VERTICAL_STRIP = "VERTICAL_STRIP",
  BLOB = "BLOB",
}

/**
 * Java MemberGraphAutotile — pick strip/blob member from live map neighbors.
 * Simplified: no overlay strip, no autotileConnectGroups (uses layout adjacency).
 */
export function resolveTerrainDisplayTileId(
  project: TilesetProject,
  pooledDisplayId: string,
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  massCtx: AutotileMassContext | null,
): string {
  if (!pooledDisplayId) return pooledDisplayId;
  const obj = project.objectByTileId.get(pooledDisplayId);
  if (!obj?.usesMemberGraph || obj.isFullObject) return pooledDisplayId;
  const islands = obj.islands;
  if (!islands.length) return pooledDisplayId;
  let totalCells = 0;
  for (const isl of islands) totalCells += isl.cells.length;
  if (totalCells < 2) return pooledDisplayId;

  if (islands.length === 1) {
    return (
      resolveForIsland(project, islands[0]!, map, tx, ty, terrainCode, massCtx) ||
      pooledDisplayId
    );
  }

  if (stackableTerrain(terrainCode)) {
    const corner = tryNineSliceCornerPick(project, islands, map, tx, ty, terrainCode, massCtx);
    if (corner) return corner;
  }

  const shape = stackableTerrain(terrainCode)
    ? componentShapeAt(map, tx, ty, terrainCode, massCtx, project)
    : null;
  let candidates = islandsMatchingShape(islands, shape);
  if (!candidates.length) candidates = islands;

  let bestId: string | null = null;
  let bestScore = -1;
  let bestExact = false;
  let bestIslandSize = Number.POSITIVE_INFINITY;

  for (const island of candidates) {
    const picked = resolveForIsland(project, island, map, tx, ty, terrainCode, massCtx);
    if (!picked) continue;
    const scored =
      stackableTerrain(terrainCode) && island.cells.length > 1
        ? scoreTerrainLayoutMember(map, tx, ty, terrainCode, island.cells, picked, massCtx, project)
        : { tileId: picked, score: 1, exact: true };
    const islandSize = island.cells.length;
    if (
      scored.exact &&
      (!bestExact ||
        scored.score > bestScore ||
        (scored.score === bestScore && islandSize < bestIslandSize))
    ) {
      bestExact = true;
      bestScore = scored.score;
      bestId = scored.tileId;
      bestIslandSize = islandSize;
    } else if (
      !bestExact &&
      (scored.score > bestScore || (scored.score === bestScore && islandSize < bestIslandSize))
    ) {
      bestScore = scored.score;
      bestId = scored.tileId;
      bestIslandSize = islandSize;
    }
  }
  return bestId || pooledDisplayId;
}

function resolveForIsland(
  project: TilesetProject,
  island: MemberGraphIsland,
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  massCtx: AutotileMassContext | null,
): string | null {
  const foot = island.cells;
  if (!foot.length) return null;
  if (foot.length === 1) return foot[0]!.tileId;

  const horizontal = isHorizontalStripFootprint(foot);
  const verticalStrip = !horizontal && isVerticalStripFootprint(foot);
  const sorted = sortedStripMembers(foot, horizontal);
  if (!sorted.length) return null;

  if (stackableTerrain(terrainCode) && (horizontal || verticalStrip)) {
    const fromRun = pickFromTerrainRun(
      map,
      tx,
      ty,
      terrainCode,
      sorted,
      horizontal,
      massCtx,
      project,
    );
    if (fromRun) return fromRun;
  }

  if (stackableTerrain(terrainCode) && !horizontal && !verticalStrip) {
    const fromLayout = pickMemberFromTerrainLayout(
      map,
      tx,
      ty,
      terrainCode,
      foot,
      island.memberIds,
      massCtx,
      project,
    );
    if (fromLayout) return fromLayout;
  }

  // Fallback: open-edge mask match on layout.
  const rn = terrainConnects(map, tx, ty - 1, terrainCode, massCtx, project);
  const re = terrainConnects(map, tx + 1, ty, terrainCode, massCtx, project);
  const rs = terrainConnects(map, tx, ty + 1, terrainCode, massCtx, project);
  const rw = terrainConnects(map, tx - 1, ty, terrainCode, massCtx, project);
  const mapOpenMask = massOpenEdgeMask(rn, re, rs, rw);
  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const cell of foot) {
    const dist = bitCount(mapOpenMask ^ layoutOpenEdgeMaskForTile(cell.tileId, foot));
    if (dist < bestDist) {
      bestDist = dist;
      best = cell.tileId;
    }
  }
  return best ?? island.memberIds[0] ?? null;
}

function pickMemberFromTerrainLayout(
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  islandFoot: MemberFootprintCell[],
  islandMembers: string[],
  massCtx: AutotileMassContext | null,
  project: TilesetProject,
): string | null {
  const rn = terrainConnects(map, tx, ty - 1, terrainCode, massCtx, project);
  const re = terrainConnects(map, tx + 1, ty, terrainCode, massCtx, project);
  const rs = terrainConnects(map, tx, ty + 1, terrainCode, massCtx, project);
  const rw = terrainConnects(map, tx - 1, ty, terrainCode, massCtx, project);
  const mapOpenMask = massOpenEdgeMask(rn, re, rs, rw);
  let bestId: string | null = null;
  let bestScore = -1;
  const perfect: string[] = [];
  for (const cell of islandFoot) {
    const scored = scoreTerrainLayoutMember(
      map,
      tx,
      ty,
      terrainCode,
      islandFoot,
      cell.tileId,
      massCtx,
      project,
    );
    if (scored.score > bestScore) {
      bestScore = scored.score;
      bestId = scored.tileId;
    }
    if (scored.score === 4) perfect.push(scored.tileId);
  }
  if (perfect.length === 1) return perfect[0]!;
  if (perfect.length > 1) {
    let bestCorner: string | null = null;
    let bestCornerDist = Number.POSITIVE_INFINITY;
    for (const tid of perfect) {
      const dist = bitCount(mapOpenMask ^ layoutOpenEdgeMaskForTile(tid, islandFoot));
      if (dist < bestCornerDist) {
        bestCornerDist = dist;
        bestCorner = tid;
      }
    }
    return bestCorner ?? perfect[0]!;
  }
  let bestMaskId: string | null = null;
  let bestMaskDist = Number.POSITIVE_INFINITY;
  for (const cell of islandFoot) {
    const dist = bitCount(mapOpenMask ^ layoutOpenEdgeMaskForTile(cell.tileId, islandFoot));
    if (dist < bestMaskDist) {
      bestMaskDist = dist;
      bestMaskId = cell.tileId;
    }
  }
  return bestMaskId ?? bestId ?? islandMembers[0] ?? null;
}

function scoreTerrainLayoutMember(
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  islandFoot: MemberFootprintCell[],
  tileId: string,
  massCtx: AutotileMassContext | null,
  project: TilesetProject,
): GridPickResult {
  for (const cell of islandFoot) {
    if (cell.tileId !== tileId) continue;
    const en = layoutHasCell(islandFoot, cell.dTx, cell.dTy - 1);
    const ee = layoutHasCell(islandFoot, cell.dTx + 1, cell.dTy);
    const es = layoutHasCell(islandFoot, cell.dTx, cell.dTy + 1);
    const ew = layoutHasCell(islandFoot, cell.dTx - 1, cell.dTy);
    const rn = terrainConnects(map, tx, ty - 1, terrainCode, massCtx, project);
    const re = terrainConnects(map, tx + 1, ty, terrainCode, massCtx, project);
    const rs = terrainConnects(map, tx, ty + 1, terrainCode, massCtx, project);
    const rw = terrainConnects(map, tx - 1, ty, terrainCode, massCtx, project);
    let score = 0;
    if (en === rn) score++;
    if (ee === re) score++;
    if (es === rs) score++;
    if (ew === rw) score++;
    return { tileId, score, exact: score === 4 };
  }
  return { tileId, score: 0, exact: false };
}

function tryNineSliceCornerPick(
  project: TilesetProject,
  islands: MemberGraphIsland[],
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  massCtx: AutotileMassContext | null,
): string | null {
  const rn = terrainConnects(map, tx, ty - 1, terrainCode, massCtx, project);
  const re = terrainConnects(map, tx + 1, ty, terrainCode, massCtx, project);
  const rs = terrainConnects(map, tx, ty + 1, terrainCode, massCtx, project);
  const rw = terrainConnects(map, tx - 1, ty, terrainCode, massCtx, project);
  const mask = massOpenEdgeMask(rn, re, rs, rw);
  if (bitCount(mask) !== 2 || mask === 5 || mask === 10) return null;
  for (const island of islands) {
    if (!islandMatchesShape(island, ComponentShape.BLOB)) continue;
    const picked = pickMemberFromTerrainLayout(
      map,
      tx,
      ty,
      terrainCode,
      island.cells,
      island.memberIds,
      massCtx,
      project,
    );
    if (picked) return picked;
  }
  return null;
}

function pickFromTerrainRun(
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  sorted: string[],
  horizontal: boolean,
  massCtx: AutotileMassContext | null,
  project: TilesetProject,
): string | null {
  let runLen: number;
  let indexInRun: number;
  if (horizontal) {
    runLen = horizontalRunLength(map, tx, ty, terrainCode, massCtx, project);
    let runStart = tx;
    while (runStart > 0 && terrainConnects(map, runStart - 1, ty, terrainCode, massCtx, project)) {
      runStart--;
    }
    indexInRun = tx - runStart;
  } else {
    runLen = verticalRunLength(map, tx, ty, terrainCode, massCtx, project);
    let runStart = ty;
    while (runStart > 0 && terrainConnects(map, tx, runStart - 1, terrainCode, massCtx, project)) {
      runStart--;
    }
    indexInRun = ty - runStart;
  }
  return stripMemberForRunIndex(sorted, indexInRun, runLen);
}

export function stripMemberForRunIndex(
  sorted: string[],
  indexInRun: number,
  runLen: number,
): string {
  const n = sorted.length;
  if (!n || runLen <= 0 || indexInRun < 0 || indexInRun >= runLen) return sorted[0] ?? "";
  if (runLen === 1) return sorted[0]!;
  if (indexInRun === 0) return sorted[0]!;
  if (indexInRun === runLen - 1) return sorted[n - 1]!;
  if (n <= 2) return sorted[Math.min(indexInRun, n - 1)]!;
  const innerSlots = n - 2;
  const innerPos = 1 + Math.floor(((indexInRun - 1) * innerSlots) / Math.max(1, runLen - 2));
  return sorted[Math.min(n - 2, Math.max(1, innerPos))]!;
}

function horizontalRunLength(
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  massCtx: AutotileMassContext | null,
  project: TilesetProject,
): number {
  let len = 1;
  let x = tx - 1;
  while (x >= 0 && terrainConnects(map, x, ty, terrainCode, massCtx, project)) {
    len++;
    x--;
  }
  x = tx + 1;
  while (x < map.getWidth() && terrainConnects(map, x, ty, terrainCode, massCtx, project)) {
    len++;
    x++;
  }
  return len;
}

function verticalRunLength(
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  massCtx: AutotileMassContext | null,
  project: TilesetProject,
): number {
  let len = 1;
  let y = ty - 1;
  while (y >= 0 && terrainConnects(map, tx, y, terrainCode, massCtx, project)) {
    len++;
    y--;
  }
  y = ty + 1;
  while (y < map.getHeight() && terrainConnects(map, tx, y, terrainCode, massCtx, project)) {
    len++;
    y++;
  }
  return len;
}

function componentShapeAt(
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  massCtx: AutotileMassContext | null,
  project: TilesetProject,
): ComponentShape {
  const hRun = horizontalRunLength(map, tx, ty, terrainCode, massCtx, project);
  const vRun = verticalRunLength(map, tx, ty, terrainCode, massCtx, project);
  if (hRun <= 1 && vRun <= 1) return ComponentShape.SINGLETON;
  if (hRun >= 2 && vRun <= 1) return ComponentShape.HORIZONTAL_STRIP;
  if (vRun >= 2 && hRun <= 1) return ComponentShape.VERTICAL_STRIP;
  return ComponentShape.BLOB;
}

function islandsMatchingShape(
  islands: MemberGraphIsland[],
  shape: ComponentShape | null,
): MemberGraphIsland[] {
  if (!shape) return islands;
  const matched = islands.filter((i) => islandMatchesShape(i, shape));
  return matched.length ? matched : islands;
}

function islandMatchesShape(island: MemberGraphIsland, shape: ComponentShape): boolean {
  const foot = island.cells;
  switch (shape) {
    case ComponentShape.SINGLETON:
      return foot.length === 1;
    case ComponentShape.HORIZONTAL_STRIP:
      return isHorizontalStripFootprint(foot);
    case ComponentShape.VERTICAL_STRIP:
      return isVerticalStripFootprint(foot);
    case ComponentShape.BLOB:
      return (
        foot.length > 1 &&
        !isHorizontalStripFootprint(foot) &&
        !isVerticalStripFootprint(foot)
      );
  }
}

function terrainConnects(
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  massCtx: AutotileMassContext | null,
  project: TilesetProject,
): boolean {
  if (tx < 0 || ty < 0 || tx >= map.getWidth() || ty >= map.getHeight()) return false;
  if (map.tileAt(tx, ty) !== terrainCode) return false;
  if (!massCtx) return true;
  const floor = massCtx.floorOrdinal ?? 1;
  const tileAllowed = (id: string) => project.tileAllowedOnFloor(id, floor);
  const neighborPick = massCtx.bridge.displayTileIdForRoomKind(
    terrainCode,
    tx,
    ty,
    massCtx.displaySalt,
    massCtx.roomKind,
    tileAllowed,
  );
  return sameAutotilePackage(massCtx.object, neighborPick, project);
}

export function sameAutotilePackage(
  selfObj: AutotileObject,
  neighborTileId: string | null,
  project: TilesetProject,
): boolean {
  if (!neighborTileId) return false;
  const nb = project.objectByTileId.get(neighborTileId);
  if (nb === selfObj) return true;
  if (selfObj.tileIds.includes(neighborTileId)) return true;
  if (selfObj.memberGraphLayout?.cells.some((c) => c.tileId === neighborTileId)) return true;
  return false;
}

function massOpenEdgeMask(n: boolean, e: boolean, s: boolean, w: boolean): number {
  let mask = 0;
  if (!n) mask |= 1;
  if (!e) mask |= 2;
  if (!s) mask |= 4;
  if (!w) mask |= 8;
  return mask;
}

function layoutOpenEdgeMaskForTile(tileId: string, foot: MemberFootprintCell[]): number {
  for (const cell of foot) {
    if (cell.tileId !== tileId) continue;
    return massOpenEdgeMask(
      layoutHasCell(foot, cell.dTx, cell.dTy - 1),
      layoutHasCell(foot, cell.dTx + 1, cell.dTy),
      layoutHasCell(foot, cell.dTx, cell.dTy + 1),
      layoutHasCell(foot, cell.dTx - 1, cell.dTy),
    );
  }
  return 0;
}

function layoutHasCell(foot: MemberFootprintCell[], dTx: number, dTy: number): boolean {
  return foot.some((c) => c.dTx === dTx && c.dTy === dTy);
}

function sortedStripMembers(foot: MemberFootprintCell[], horizontal: boolean): string[] {
  const sorted = foot.slice().sort((a, b) => (horizontal ? a.dTx - b.dTx : a.dTy - b.dTy));
  return sorted.map((c) => c.tileId);
}

function stackableTerrain(code: number): boolean {
  return code === TILE_SOLID || code === TILE_BREAKABLE;
}

function bitCount(n: number): number {
  let c = 0;
  let x = n >>> 0;
  while (x) {
    c += x & 1;
    x >>>= 1;
  }
  return c;
}
