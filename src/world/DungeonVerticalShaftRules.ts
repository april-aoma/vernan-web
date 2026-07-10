import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "./TileMap";
import {
  arenaLipRowAt,
  arenaLipRowOnGrid,
  groundYFromMap,
} from "./SecretRoomMapBuild";

/** Java DungeonVerticalShaftRules.MAX_PROCEDURAL_LADDER_RUNGS. */
export const MAX_PROCEDURAL_LADDER_RUNGS = 6;
/** Same cap for post-pass enforcement outside L. */
export const MAX_TRAVERSAL_LADDER_RUNGS = MAX_PROCEDURAL_LADDER_RUNGS;
/** Java MAX_SAFETY_LADDER_GAP_FILL — safety gap-fill cap. */
export const MAX_SAFETY_LADDER_GAP_FILL = MAX_PROCEDURAL_LADDER_RUNGS + 2;
/** H outside L: no rung in rows y < this (y=0,1 ceiling band; y=2 may hold top rung). */
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
 * GEN-LADDER-1: clamp procedural H columns (not dungeon shaft L).
 * Java DungeonVerticalShaftRules.stripSpuriousLaddersFromMap — includes traversal deck caps.
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
    enforceTraversalColumnOnGrid(grid, w, h, tx, groundY);
  }
}

function enforceTraversalColumnOnGrid(
  grid: string[][],
  w: number,
  h: number,
  tx: number,
  groundY: number[],
): void {
  const lipRow = arenaLipRowOnGrid(grid, w, h, tx, groundY);
  stripLaddersBelowPlayFloorOnGrid(grid, h, tx, lipRow);
  sealTraversalPlayFloorPlatformsOnGrid(grid, h, tx, lipRow);
  for (let y = 0; y < MAX_TRAVERSAL_LADDER_TOP_ROW && y < h; y++) {
    if (grid[y]![tx] !== "H") continue;
    if (y === 0) {
      grid[y]![tx] = "#";
    } else {
      clearRemovedLadderOnGrid(grid, tx, y, lipRow);
    }
  }
  removeFauxPitMouthPlatformsOnGrid(grid, h, tx, lipRow);
  truncateLadderRunsOnGrid(grid, h, tx, lipRow);
  capTraversalDecksOnGrid(grid, h, tx, lipRow);
  sealTraversalCeilingRowOnGrid(grid, tx);
}

function enforceTraversalColumnOnMap(
  map: TileMap,
  tx: number,
  _groundY: number[],
  h: number,
): void {
  const lipRow = arenaLipRowAt(map, tx);
  stripLaddersBelowPlayFloorOnMap(map, tx, h, lipRow);
  sealTraversalPlayFloorPlatformsOnMap(map, tx, h, lipRow);
  for (let y = 0; y < MAX_TRAVERSAL_LADDER_TOP_ROW && y < h; y++) {
    if (!map.isLadderTile(tx, y)) continue;
    if (y === 0) {
      map.setTile(tx, y, TILE_SOLID);
    } else {
      clearRemovedLadderOnMap(map, tx, y, lipRow);
    }
  }
  removeFauxPitMouthPlatformsOnMap(map, tx, h, lipRow);
  truncateLadderRunsOnMap(map, tx, h, lipRow);
  capTraversalDecksOnMap(map, tx, h, lipRow);
  sealTraversalCeilingRowOnMap(map, tx);
}

function sealTraversalCeilingRowOnGrid(grid: string[][], tx: number): void {
  if (grid[0]![tx] === "D") return;
  if (grid[0]![tx] === "." || grid[0]![tx] === "H") grid[0]![tx] = "#";
}

function sealTraversalCeilingRowOnMap(map: TileMap, tx: number): void {
  const t = map.tileAt(tx, 0);
  if (t === TILE_DOOR || t === TILE_BREAKABLE) return;
  if (t === TILE_EMPTY || map.isLadderTile(tx, 0)) {
    map.setTile(tx, 0, TILE_SOLID);
  }
}

function sealTraversalPlayFloorPlatformsOnGrid(
  grid: string[][],
  h: number,
  tx: number,
  floorRow: number,
): void {
  if (floorRow >= 1 && floorRow < h - 1 && grid[floorRow]![tx] === "-") {
    grid[floorRow]![tx] = "#";
  }
}

function sealTraversalPlayFloorPlatformsOnMap(
  map: TileMap,
  tx: number,
  h: number,
  floorRow: number,
): void {
  if (floorRow >= 1 && floorRow < h - 1 && map.isPlatformTile(tx, floorRow)) {
    map.setTile(tx, floorRow, TILE_SOLID);
  }
}

function stripLaddersBelowPlayFloorOnGrid(
  grid: string[][],
  h: number,
  tx: number,
  lipRow: number,
): void {
  for (let y = lipRow + 1; y < h - 1; y++) {
    if (grid[y]![tx] === "H") grid[y]![tx] = "#";
  }
  if (h > 1 && grid[h - 1]![tx] === "H") grid[h - 1]![tx] = "#";
}

function stripLaddersBelowPlayFloorOnMap(
  map: TileMap,
  tx: number,
  h: number,
  lipRow: number,
): void {
  for (let y = lipRow + 1; y < h - 1; y++) {
    if (map.isLadderTile(tx, y)) map.setTile(tx, y, TILE_SOLID);
  }
  if (h > 1 && map.isLadderTile(tx, h - 1)) {
    map.setTile(tx, h - 1, TILE_SOLID);
  }
}

function removeFauxPitMouthPlatformsOnGrid(
  grid: string[][],
  h: number,
  tx: number,
  floorRow: number,
): void {
  if (floorRow < 1 || floorRow >= h - 1) return;
  if (grid[floorRow]![tx] === "-" && grid[floorRow + 1]![tx] === "H") {
    grid[floorRow]![tx] = "#";
  }
  if (
    floorRow > 1 &&
    grid[floorRow - 1]![tx] === "-" &&
    grid[floorRow]![tx] === "H" &&
    hasLadderBelowPlayFloorOnGrid(grid, tx, floorRow, h)
  ) {
    grid[floorRow - 1]![tx] = "#";
  }
}

function removeFauxPitMouthPlatformsOnMap(
  map: TileMap,
  tx: number,
  h: number,
  floorRow: number,
): void {
  if (floorRow < 1 || floorRow >= h - 1) return;
  if (map.isPlatformTile(tx, floorRow) && map.isLadderTile(tx, floorRow + 1)) {
    map.setTile(tx, floorRow, TILE_SOLID);
  }
  const deckY = floorRow - 1;
  if (
    deckY >= 2 &&
    map.isPlatformTile(tx, deckY) &&
    map.isLadderTile(tx, floorRow) &&
    hasLadderBelowPlayFloorOnMap(map, tx, floorRow, h)
  ) {
    map.setTile(tx, deckY, TILE_SOLID);
  }
}

function hasLadderBelowPlayFloorOnGrid(
  grid: string[][],
  tx: number,
  floorRow: number,
  h: number,
): boolean {
  for (let y = floorRow + 1; y < h - 1; y++) {
    if (grid[y]![tx] === "H") return true;
  }
  return false;
}

function hasLadderBelowPlayFloorOnMap(
  map: TileMap,
  tx: number,
  floorRow: number,
  h: number,
): boolean {
  for (let y = floorRow + 1; y < h - 1; y++) {
    if (map.isLadderTile(tx, y)) return true;
  }
  return false;
}

/** Keep the bottom MAX_TRAVERSAL_LADDER_RUNGS of each run (Java truncate). */
function truncateLadderRunsOnGrid(
  grid: string[][],
  h: number,
  tx: number,
  floorRow: number,
): void {
  let y = 1;
  while (y < h - 1) {
    while (y < h - 1 && grid[y]![tx] !== "H") y++;
    if (y >= h - 1) break;
    const runTop = y;
    while (y < h - 1 && grid[y]![tx] === "H") y++;
    const runBottom = y - 1;
    const rungs = runBottom - runTop + 1;
    if (rungs > MAX_TRAVERSAL_LADDER_RUNGS) {
      const keepFrom = runBottom - MAX_TRAVERSAL_LADDER_RUNGS + 1;
      for (let ry = runTop; ry < keepFrom; ry++) {
        clearRemovedLadderOnGrid(grid, tx, ry, floorRow);
      }
    }
  }
}

function truncateLadderRunsOnMap(
  map: TileMap,
  tx: number,
  h: number,
  floorRow: number,
): void {
  let y = 1;
  while (y < h - 1) {
    while (y < h - 1 && !map.isLadderTile(tx, y)) y++;
    if (y >= h - 1) break;
    const runTop = y;
    while (y < h - 1 && map.isLadderTile(tx, y)) y++;
    const runBottom = y - 1;
    const rungs = runBottom - runTop + 1;
    if (rungs > MAX_TRAVERSAL_LADDER_RUNGS) {
      const keepFrom = runBottom - MAX_TRAVERSAL_LADDER_RUNGS + 1;
      for (let ry = runTop; ry < keepFrom; ry++) {
        clearRemovedLadderOnMap(map, tx, ry, floorRow);
      }
    }
  }
}

/** Traversal ladder tops: `-` on the row above the top rung. */
function capTraversalDecksOnGrid(
  grid: string[][],
  h: number,
  tx: number,
  floorRow: number,
): void {
  let y = 1;
  while (y < h - 1) {
    while (y < h - 1 && grid[y]![tx] !== "H") y++;
    if (y >= h - 1) break;
    const top = y;
    while (y < h - 1 && grid[y]![tx] === "H") y++;
    placeTraversalDeckOnGrid(grid, tx, top, floorRow, h);
  }
}

function capTraversalDecksOnMap(
  map: TileMap,
  tx: number,
  h: number,
  floorRow: number,
): void {
  let y = 1;
  while (y < h - 1) {
    while (y < h - 1 && !map.isLadderTile(tx, y)) y++;
    if (y >= h - 1) break;
    const top = y;
    while (y < h - 1 && map.isLadderTile(tx, y)) y++;
    placeTraversalDeckOnMap(map, tx, top, floorRow, h);
  }
}

function placeTraversalDeckOnGrid(
  grid: string[][],
  tx: number,
  top: number,
  floorRow: number,
  h: number,
): void {
  const deckY = top - 1;
  // GEN-TERRAIN-2: no traversal deck on playFloorRow-1 (floating shelf above arena lip).
  if (deckY < 2 || deckY >= h - 1 || deckY >= floorRow - 1) return;
  const c = grid[deckY]![tx];
  if (c === "." || c === "#") grid[deckY]![tx] = "-";
}

function placeTraversalDeckOnMap(
  map: TileMap,
  tx: number,
  top: number,
  floorRow: number,
  h: number,
): void {
  const deckY = top - 1;
  if (deckY < 2 || deckY >= h - 1 || deckY >= floorRow - 1) return;
  if (map.isLadderTile(tx, deckY)) return;
  const t = map.tileAt(tx, deckY);
  if (t === TILE_EMPTY || t === TILE_SOLID || t === TILE_BREAKABLE) {
    map.setTile(tx, deckY, TILE_PLATFORM);
  }
}

function clearRemovedLadderOnGrid(
  grid: string[][],
  tx: number,
  y: number,
  lipRow: number,
): void {
  grid[y]![tx] = y > lipRow ? "#" : ".";
}

function clearRemovedLadderOnMap(
  map: TileMap,
  tx: number,
  y: number,
  lipRow: number,
): void {
  map.setTile(tx, y, y > lipRow ? TILE_SOLID : TILE_EMPTY);
}

/** No authored mouth decks on L±1 — only L carries the transition mouth. */
function sealFlankDecksBesideDungeonMouth(
  map: TileMap,
  shaftColumnL: number,
  dungeonMouthRow: number,
): void {
  const w = map.getWidth();
  const h = map.getHeight();
  for (const dx of [-1, 1]) {
    const tx = shaftColumnL + dx;
    if (tx < 1 || tx >= w - 1) continue;
    for (let dy = -1; dy <= 0; dy++) {
      const y = dungeonMouthRow + dy;
      if (y < 1 || y >= h - 1) continue;
      if (map.isPlatformTile(tx, y)) map.setTile(tx, y, TILE_SOLID);
    }
  }
}
