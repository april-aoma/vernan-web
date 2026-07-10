import { groundYFromMap } from "./SecretRoomMapBuild";
import {
  MAX_SAFETY_LADDER_GAP_FILL,
  isTraversalLadderRowAllowed,
} from "./DungeonVerticalShaftRules";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "./TileMap";

/**
 * Cap open ladder tops, bridge deck→rung gaps, place mouth platforms.
 * (Java LadderSafetyPlatforms)
 */
export function applyLadderSafetyPlatforms(
  map: TileMap,
  skipShaftMouthPlatforms = false,
  dungeonLadderTx = -1,
  dungeonMouthRow = -1,
  dungeonVerticalLink = false,
): void {
  const w = map.getWidth();
  const h = map.getHeight();
  const shaftColumnOnly = dungeonVerticalLink && dungeonLadderTx >= 1;
  for (let tx = 1; tx < w - 1; tx++) {
    if (shaftColumnOnly && tx !== dungeonLadderTx) continue;
    let ty = 1;
    while (ty < h - 1) {
      while (ty < h - 1 && !map.isLadderTile(tx, ty)) ty++;
      if (ty >= h - 1) break;
      const top = ty;
      while (ty < h - 1 && map.isLadderTile(tx, ty)) ty++;
      maybeCapLadderTop(map, tx, top, dungeonLadderTx, dungeonMouthRow);
    }
  }
  fillGapsBelowPlatformsDownToLadderTops(map, dungeonLadderTx, dungeonMouthRow, shaftColumnOnly);
  if (!skipShaftMouthPlatforms && !dungeonVerticalLink) {
    addShaftMouthPlatforms(map, dungeonLadderTx, dungeonMouthRow);
  }
}

/** ASCII-PLATFORM-MIN-Y: remove decks on border row y=1. */
export function stripPlatformsOnRow(map: TileMap, rowY: number): void {
  if (rowY < 1) return;
  const w = map.getWidth();
  const h = map.getHeight();
  if (rowY >= h - 1) return;
  for (let x = 1; x < w - 1; x++) {
    if (map.isPlatformTile(x, rowY)) map.setTile(x, rowY, TILE_EMPTY);
  }
}

export function stripShaftColumnPlatforms(
  map: TileMap,
  dungeonLadderTx: number,
  dungeonMouthRow: number,
  keepMouthDeck: boolean,
): void {
  if (dungeonLadderTx < 1 || dungeonMouthRow < 1) return;
  const h = map.getHeight();
  for (let y = 1; y < h - 1; y++) {
    if (keepMouthDeck && y === dungeonMouthRow) continue;
    if (map.isPlatformTile(dungeonLadderTx, y)) map.setTile(dungeonLadderTx, y, TILE_EMPTY);
  }
}

export function stripFlankingMouthDecks(
  map: TileMap,
  dungeonLadderTx: number,
  dungeonMouthRow: number,
): void {
  if (dungeonLadderTx < 1 || dungeonMouthRow < 2) return;
  const w = map.getWidth();
  const h = map.getHeight();
  for (let dx = -1; dx <= 1; dx += 2) {
    const x = dungeonLadderTx + dx;
    if (x < 1 || x >= w - 1) continue;
    for (let dy = -1; dy <= 0; dy++) {
      const y = dungeonMouthRow + dy;
      if (y < 1 || y >= h - 1) continue;
      if (map.isPlatformTile(x, y)) map.setTile(x, y, TILE_EMPTY);
    }
  }
}

function fillGapsBelowPlatformsDownToLadderTops(
  map: TileMap,
  dungeonLadderTx: number,
  dungeonMouthRow: number,
  shaftColumnOnly: boolean,
): void {
  const w = map.getWidth();
  const h = map.getHeight();
  for (let tx = 1; tx < w - 1; tx++) {
    if (shaftColumnOnly && tx !== dungeonLadderTx) continue;
    let ty = 1;
    while (ty < h - 1) {
      while (ty < h - 1 && !map.isLadderTile(tx, ty)) ty++;
      if (ty >= h - 1) break;
      const top = ty;
      while (ty < h - 1 && map.isLadderTile(tx, ty)) ty++;
      if (!isBesideDungeonMouth(map, tx, top, dungeonLadderTx, dungeonMouthRow)) {
        bridgeGapAboveRun(map, tx, top, dungeonLadderTx);
      }
    }
  }
}

function bridgeGapAboveRun(map: TileMap, tx: number, top: number, dungeonShaftTx: number): void {
  let y = top - 1;
  while (y >= 1 && map.tileAt(tx, y) === TILE_EMPTY) y--;
  if (y < 1 || map.tileAt(tx, y) !== TILE_PLATFORM) return;
  const gap = top - (y + 1);
  if (gap > MAX_SAFETY_LADDER_GAP_FILL) return;
  for (let r = y + 1; r < top; r++) {
    if (!isTraversalLadderRowAllowed(tx, r, dungeonShaftTx)) continue;
    if (map.tileAt(tx, r) === TILE_EMPTY) map.setTile(tx, r, TILE_LADDER);
  }
}

function addShaftMouthPlatforms(
  map: TileMap,
  dungeonLadderTx: number,
  dungeonMouthRow: number,
): void {
  const h = map.getHeight();
  const w = map.getWidth();
  const groundY = groundYFromMap(map);
  for (let tx = 1; tx < w - 1; tx++) {
    if (dungeonLadderTx >= 0 && tx === dungeonLadderTx) continue;
    if (dungeonLadderTx >= 0 && Math.abs(tx - dungeonLadderTx) <= 1) continue;
    const mouthRow = proceduralSafetyMouthRow(groundY, tx);
    if (mouthRow < 1 || mouthRow >= h - 1) continue;
    if (isBesideDungeonMouth(map, tx, mouthRow, dungeonLadderTx, dungeonMouthRow)) continue;
    if (!map.isStandableFloorTile(tx - 1, mouthRow) || !map.isStandableFloorTile(tx + 1, mouthRow)) {
      continue;
    }
    if (mouthRow + 1 >= h - 1 || !map.isLadderTile(tx, mouthRow + 1)) continue;
    if (map.isPlatformTile(tx, mouthRow + 1)) continue;
    if (mouthRow > 0 && map.tileAt(tx, mouthRow - 1) === TILE_PLATFORM) continue;
    if (mouthRow > 0 && map.tileAt(tx, mouthRow - 1) === TILE_LADDER) continue;
    if (map.tileAt(tx, mouthRow) !== TILE_LADDER) continue;
    map.setTile(tx, mouthRow, TILE_PLATFORM);
  }
}

function proceduralSafetyMouthRow(groundY: number[], tx: number): number {
  const left = flankPlayFloorRow(groundY, tx - 1);
  const right = flankPlayFloorRow(groundY, tx + 1);
  if (left !== right) return Math.min(left, right);
  return left;
}

function flankPlayFloorRow(groundY: number[], flankTx: number): number {
  if (groundY.length === 0) return 1;
  const col = Math.max(1, Math.min(flankTx, groundY.length - 2));
  return groundY[col]!;
}

function maybeCapLadderTop(
  map: TileMap,
  tx: number,
  top: number,
  dungeonLadderTx: number,
  dungeonMouthRow: number,
): void {
  if (dungeonLadderTx >= 0 && tx === dungeonLadderTx) return;
  if (isBesideDungeonMouth(map, tx, top, dungeonLadderTx, dungeonMouthRow)) return;
  const py = top - 1;
  if (py < 2) return;
  const floor = groundYFromMap(map);
  if (tx >= 1 && tx < floor.length && py === floor[tx]! - 1) return;
  const flanked = flankedAtTopRung(map, tx, top);
  if (py >= 2 && py < map.getHeight() - 1 && isOpenAboveTopRung(map, tx, top)) {
    placeDeckRowWhereEmpty(map, tx, py, dungeonLadderTx, dungeonMouthRow);
  }
  if (flanked && py >= 2 && py < map.getHeight() - 1) {
    const t = map.tileAt(tx, py);
    if (t === TILE_SOLID || t === TILE_BREAKABLE) map.setTile(tx, py, TILE_PLATFORM);
  }
}

function isBesideDungeonMouth(
  _map: TileMap,
  tx: number,
  ty: number,
  dungeonLadderTx: number,
  dungeonMouthRow: number,
): boolean {
  if (dungeonLadderTx < 0 || dungeonMouthRow < 1) return false;
  if (Math.abs(tx - dungeonLadderTx) > 1) return false;
  return ty === dungeonMouthRow - 1 || ty === dungeonMouthRow;
}

function flankedAtTopRung(map: TileMap, tx: number, top: number): boolean {
  if (top < 1 || top >= map.getHeight() - 1) return false;
  return map.isStandableFloorTile(tx - 1, top) && map.isStandableFloorTile(tx + 1, top);
}

function placeDeckRowWhereEmpty(
  map: TileMap,
  tx: number,
  py: number,
  dungeonLadderTx: number,
  dungeonMouthRow: number,
): void {
  if (py < 2) return;
  if (isBesideDungeonMouth(map, tx, py, dungeonLadderTx, dungeonMouthRow)) return;
  let placed = false;
  for (let dx = -1; dx <= 1; dx++) {
    const sx = tx + dx;
    if (sx < 1 || sx >= map.getWidth() - 1) continue;
    if (isBesideDungeonMouth(map, sx, py, dungeonLadderTx, dungeonMouthRow)) continue;
    if (map.tileAt(sx, py) === TILE_EMPTY) {
      map.setTile(sx, py, TILE_PLATFORM);
      placed = true;
    }
  }
  if (!placed && map.tileAt(tx, py) === TILE_EMPTY) {
    map.setTile(tx, py, TILE_PLATFORM);
  }
}

function isOpenAboveTopRung(map: TileMap, tx: number, top: number): boolean {
  if (top < 1) return false;
  const above = top - 1;
  const t = map.tileAt(tx, above);
  return t !== TILE_SOLID && t !== TILE_BREAKABLE && t !== TILE_DOOR;
}
