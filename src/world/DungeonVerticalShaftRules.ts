import {
  TILE_DOOR,
  TILE_EMPTY,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "./TileMap";
import { groundYFromMap } from "./SecretRoomMapBuild";

/** Java DungeonVerticalShaftRules.MAX_PROCEDURAL_LADDER_RUNGS. */
export const MAX_PROCEDURAL_LADDER_RUNGS = 6;
/** Java MAX_SAFETY_LADDER_GAP_FILL — safety gap-fill cap. */
export const MAX_SAFETY_LADDER_GAP_FILL = MAX_PROCEDURAL_LADDER_RUNGS + 2;
const MAX_TRAVERSAL_LADDER_TOP_ROW = 2;

export function isTraversalLadderRowAllowed(
  tx: number,
  y: number,
  shaftColumnL: number,
): boolean {
  if (shaftColumnL < 0 || tx === shaftColumnL) return true;
  return y >= MAX_TRAVERSAL_LADDER_TOP_ROW;
}

/**
 * Thin GEN-LADDER-1 strip: clamp procedural H columns (not dungeon shaft L).
 * Subset of Java DungeonVerticalShaftRules.stripSpuriousLaddersFromMap.
 */
export function stripSpuriousLaddersFromMap(
  map: TileMap,
  shaftColumnL: number,
  dungeonMouthRow = -1,
): void {
  const w = map.getWidth();
  const h = map.getHeight();
  const groundY = groundYFromMap(map);
  for (let tx = 1; tx < w - 1; tx++) {
    if (shaftColumnL >= 1 && tx === shaftColumnL) continue;
    enforceTraversalColumnOnMap(map, tx, groundY, h);
  }
  if (shaftColumnL >= 1 && dungeonMouthRow >= 1) {
    sealFlankDecksBesideDungeonMouth(map, shaftColumnL, dungeonMouthRow);
  }
}

/** After dungeon shaft carve on ASCII grid (before TileMap). */
export function stripSpuriousLaddersFromGrid(
  grid: string[][],
  w: number,
  h: number,
  shaftColumnL: number,
  groundY: number[],
): void {
  for (let tx = 1; tx < w - 1; tx++) {
    if (shaftColumnL >= 1 && tx === shaftColumnL) continue;
    enforceTraversalColumnOnGrid(grid, h, tx, groundY);
  }
}

function enforceTraversalColumnOnGrid(
  grid: string[][],
  h: number,
  tx: number,
  groundY: number[],
): void {
  const lipRow = arenaLipRow(groundY, tx);
  for (let y = lipRow + 1; y < h - 1; y++) {
    if (grid[y]![tx] === "H") grid[y]![tx] = "#";
  }
  if (h > 1 && grid[h - 1]![tx] === "H") grid[h - 1]![tx] = "#";
  if (lipRow >= 1 && lipRow < h - 1 && grid[lipRow]![tx] === "-") {
    grid[lipRow]![tx] = "#";
  }
  for (let y = 0; y < MAX_TRAVERSAL_LADDER_TOP_ROW && y < h; y++) {
    if (grid[y]![tx] !== "H") continue;
    grid[y]![tx] = y === 0 ? "#" : ".";
  }
  if (lipRow >= 1 && lipRow < h - 1 && grid[lipRow]![tx] === "-" && grid[lipRow + 1]![tx] === "H") {
    grid[lipRow]![tx] = "#";
  }
  truncateLadderRunsOnGrid(grid, h, tx, lipRow);
  const c0 = grid[0]![tx];
  if (c0 === "." || c0 === "H") grid[0]![tx] = "#";
}

function enforceTraversalColumnOnMap(
  map: TileMap,
  tx: number,
  groundY: number[],
  h: number,
): void {
  const lipRow = arenaLipRow(groundY, tx);
  for (let y = lipRow + 1; y < h - 1; y++) {
    if (map.tileAt(tx, y) === TILE_LADDER) map.setTile(tx, y, TILE_SOLID);
  }
  if (h > 1 && map.tileAt(tx, h - 1) === TILE_LADDER) {
    map.setTile(tx, h - 1, TILE_SOLID);
  }
  if (lipRow >= 1 && lipRow < h - 1 && map.tileAt(tx, lipRow) === TILE_PLATFORM) {
    map.setTile(tx, lipRow, TILE_SOLID);
  }
  for (let y = 0; y < MAX_TRAVERSAL_LADDER_TOP_ROW && y < h; y++) {
    if (map.tileAt(tx, y) !== TILE_LADDER) continue;
    map.setTile(tx, y, y === 0 ? TILE_SOLID : TILE_EMPTY);
  }
  if (
    lipRow >= 1 &&
    lipRow < h - 1 &&
    map.tileAt(tx, lipRow) === TILE_PLATFORM &&
    map.tileAt(tx, lipRow + 1) === TILE_LADDER
  ) {
    map.setTile(tx, lipRow, TILE_SOLID);
  }
  truncateLadderRunsOnMap(map, tx, h, lipRow);
  const t0 = map.tileAt(tx, 0);
  if (t0 !== TILE_DOOR && (t0 === TILE_EMPTY || t0 === TILE_LADDER)) {
    map.setTile(tx, 0, TILE_SOLID);
  }
}

function truncateLadderRunsOnGrid(grid: string[][], h: number, tx: number, lipRow: number): void {
  let run = 0;
  for (let y = 1; y < h - 1; y++) {
    if (grid[y]![tx] === "H") {
      run++;
      if (run > MAX_PROCEDURAL_LADDER_RUNGS || y >= lipRow) {
        grid[y]![tx] = ".";
        run = 0;
      }
    } else {
      run = 0;
    }
  }
}

function truncateLadderRunsOnMap(map: TileMap, tx: number, h: number, lipRow: number): void {
  let run = 0;
  for (let y = 1; y < h - 1; y++) {
    if (map.tileAt(tx, y) === TILE_LADDER) {
      run++;
      if (run > MAX_PROCEDURAL_LADDER_RUNGS || y >= lipRow) {
        map.setTile(tx, y, TILE_EMPTY);
        run = 0;
      }
    } else {
      run = 0;
    }
  }
}

function sealFlankDecksBesideDungeonMouth(
  map: TileMap,
  shaftColumnL: number,
  mouthRow: number,
): void {
  const w = map.getWidth();
  for (const dx of [-1, 1]) {
    const tx = shaftColumnL + dx;
    if (tx < 1 || tx >= w - 1) continue;
    if (map.tileAt(tx, mouthRow) === TILE_PLATFORM) {
      map.setTile(tx, mouthRow, TILE_SOLID);
    }
  }
}

function arenaLipRow(groundY: number[], tx: number): number {
  if (tx < 0 || tx >= groundY.length) return 1;
  return Math.max(1, groundY[tx]!);
}
