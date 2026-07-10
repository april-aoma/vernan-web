import { groundYFromMap } from "./SecretRoomMapBuild";
import {
  TILE_BREAKABLE,
  TILE_EMPTY,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "./TileMap";

/**
 * GEN-TERRAIN-1/2: floating #/B must stack to floor; no - on playFloorRow - 1.
 * (Java TerrainSolidConnectivity)
 */
export function enforceOnGrid(
  grid: string[][],
  w: number,
  h: number,
  playFloorRow: number[],
): void {
  removeFloatingSolidsOnGrid(grid, w, h);
  stripPlatformsOneRowAbovePlayFloorOnGrid(grid, w, h, playFloorRow);
}

export function enforceOnMap(map: TileMap): void {
  removeFloatingSolids(map);
  stripPlatformsOneRowAbovePlayFloorOnMap(map, groundYFromMap(map));
}

function removeFloatingSolids(map: TileMap): void {
  const w = map.getWidth();
  const h = map.getHeight();
  if (w < 3 || h < 4) return;
  const grounded: boolean[][] = Array.from({ length: h }, () => new Array(w).fill(false));
  for (let x = 0; x < w; x++) {
    if (isStackSolid(map.tileAt(x, h - 1))) grounded[h - 1]![x] = true;
  }
  for (let y = h - 2; y >= 1; y--) {
    for (let x = 1; x < w - 1; x++) {
      if (!isStackSolid(map.tileAt(x, y))) continue;
      if (isSupportedFromBelow(map, x, y + 1, grounded)) grounded[y]![x] = true;
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (map.tileAt(x, y) !== TILE_SOLID || grounded[y]![x]) continue;
      map.setTile(x, y, TILE_EMPTY);
    }
  }
}

function removeFloatingSolidsOnGrid(grid: string[][], w: number, h: number): void {
  if (w < 3 || h < 4) return;
  const grounded: boolean[][] = Array.from({ length: h }, () => new Array(w).fill(false));
  for (let x = 0; x < w; x++) {
    if (isStackSolidChar(grid[h - 1]![x]!)) grounded[h - 1]![x] = true;
  }
  for (let y = h - 2; y >= 1; y--) {
    for (let x = 1; x < w - 1; x++) {
      if (!isStackSolidChar(grid[y]![x]!)) continue;
      if (isSupportedFromBelowOnGrid(grid, x, y + 1, grounded)) grounded[y]![x] = true;
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!isStackSolidChar(grid[y]![x]!) || grounded[y]![x]) continue;
      grid[y]![x] = ".";
    }
  }
}

function stripPlatformsOneRowAbovePlayFloorOnGrid(
  grid: string[][],
  w: number,
  h: number,
  playFloorRow: number[],
): void {
  for (let tx = 1; tx < w - 1 && tx < playFloorRow.length; tx++) {
    const floor = playFloorRow[tx]!;
    if (floor < 2) continue;
    const deckRow = floor - 1;
    if (deckRow < 1 || deckRow >= h - 1) continue;
    if (grid[deckRow]![tx] === "-") grid[deckRow]![tx] = ".";
  }
}

function stripPlatformsOneRowAbovePlayFloorOnMap(map: TileMap, playFloorRow: number[]): void {
  const w = map.getWidth();
  const h = map.getHeight();
  for (let tx = 1; tx < w - 1 && tx < playFloorRow.length; tx++) {
    const floor = playFloorRow[tx]!;
    if (floor < 2) continue;
    const deckRow = floor - 1;
    if (deckRow < 1 || deckRow >= h - 1) continue;
    if (map.isPlatformTile(tx, deckRow)) map.setTile(tx, deckRow, TILE_EMPTY);
  }
}

function isSupportedFromBelowOnGrid(
  grid: string[][],
  x: number,
  y: number,
  grounded: boolean[][],
): boolean {
  if (y >= grid.length) return false;
  const below = grid[y]![x]!;
  if (below === "-") {
    const under = y + 1;
    return under < grid.length && !!grounded[under]![x];
  }
  if (isStackSolidChar(below)) return !!grounded[y]![x];
  return false;
}

function isSupportedFromBelow(
  map: TileMap,
  x: number,
  y: number,
  grounded: boolean[][],
): boolean {
  if (y >= map.getHeight()) return false;
  const below = map.tileAt(x, y);
  if (below === TILE_PLATFORM) {
    const under = y + 1;
    return under < map.getHeight() && !!grounded[under]![x];
  }
  if (isStackSolid(below)) return !!grounded[y]![x];
  return false;
}

function isStackSolid(t: number): boolean {
  return t === TILE_SOLID || t === TILE_BREAKABLE;
}

function isStackSolidChar(c: string): boolean {
  return c === "#" || c === "B";
}
