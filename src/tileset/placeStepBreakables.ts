import { JavaRandom } from "../util/JavaRandom";
import { RoomKind } from "../world/DungeonTypes";
import {
  TILE_BREAKABLE,
  TILE_EMPTY,
  TILE_SOLID,
  type TileMap,
} from "../world/TileMap";
import { groundYFromMap } from "../world/SecretRoomMapBuild";

/** Java RoomGenerator.MAX_PROCEDURAL_BREAKABLES. */
const MAX_PROCEDURAL_BREAKABLES = 6;

/**
 * Place up to 6 breakables on cliff step faces (Java placeBreakablesOnStepFaces thin).
 * NORMAL / BOSS only; uses groundY mesa faces + reachability after break.
 */
export function placeStepBreakables(
  map: TileMap,
  contentSeed: bigint,
  kind: RoomKind,
  opts: {
    leftDoorX?: number;
    rightDoorX?: number;
    leftDoorTopY?: number;
    rightDoorTopY?: number;
    ladderTx?: number;
    maxReach?: number;
    max?: number;
  } = {},
): number {
  if (kind !== RoomKind.NORMAL && kind !== RoomKind.BOSS) return 0;
  const max = opts.max ?? MAX_PROCEDURAL_BREAKABLES;
  const maxReach = opts.maxReach ?? 3;
  const leftDoorX = opts.leftDoorX ?? -1;
  const rightDoorX = opts.rightDoorX ?? -1;
  const leftDoorTopY = opts.leftDoorTopY ?? -1;
  const rightDoorTopY = opts.rightDoorTopY ?? -1;
  const ladderTx = opts.ladderTx ?? -1;

  const rng = new JavaRandom(contentSeed ^ 0x62ea6a61n);
  const w = map.getWidth();
  const h = map.getHeight();
  const groundY = groundYFromMap(map);
  const cands: Array<{ tx: number; ty: number }> = [];
  const usedFaceColumns = new Set<number>();

  // Right-facing cliff: platform at x higher than x-1; face borders air on the left.
  for (let x = 2; x < w - 2; x++) {
    if (ladderTx >= 0 && x === ladderTx) continue;
    if (groundY[x]! >= groundY[x - 1]!) continue;
    if (groundY[x - 1]! - groundY[x]! > maxReach) continue;
    if (usedFaceColumns.has(x)) continue;
    const yLo = groundY[x]!;
    const yHi = Math.min(yLo + maxReach - 1, groundY[x - 1]! - 1);
    for (let y = yLo; y <= yHi; y++) {
      if (y < 1 || y >= h - 1) continue;
      if (map.tileAt(x, y) !== TILE_SOLID || map.tileAt(x - 1, y) !== TILE_EMPTY) continue;
      if (!hasSolidSupportBelow(map, x, y)) continue;
      if (isDoorCell(x, y, leftDoorX, rightDoorX, leftDoorTopY, rightDoorTopY)) continue;
      if (!breakableFaceReachableAfterBreak(x, y, groundY, true, maxReach)) continue;
      cands.push({ tx: x, ty: y });
      break;
    }
  }

  // Left-facing cliff: platform at x higher than x+1; face borders air on the right.
  for (let x = 2; x < w - 2; x++) {
    if (ladderTx >= 0 && x === ladderTx) continue;
    if (groundY[x]! >= groundY[x + 1]!) continue;
    if (groundY[x + 1]! - groundY[x]! > maxReach) continue;
    if (usedFaceColumns.has(x)) continue;
    const yLo = groundY[x]!;
    const yHi = Math.min(yLo + maxReach - 1, groundY[x + 1]! - 1);
    for (let y = yLo; y <= yHi; y++) {
      if (y < 1 || y >= h - 1) continue;
      if (map.tileAt(x, y) !== TILE_SOLID || map.tileAt(x + 1, y) !== TILE_EMPTY) continue;
      if (!hasSolidSupportBelow(map, x, y)) continue;
      if (isDoorCell(x, y, leftDoorX, rightDoorX, leftDoorTopY, rightDoorTopY)) continue;
      if (!breakableFaceReachableAfterBreak(x, y, groundY, false, maxReach)) continue;
      cands.push({ tx: x, ty: y });
      break;
    }
  }

  // Shuffle
  for (let i = cands.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = cands[i]!;
    cands[i] = cands[j]!;
    cands[j] = tmp;
  }

  let placed = 0;
  for (const c of cands) {
    if (placed >= max) break;
    if (ladderTx >= 0 && c.tx === ladderTx) continue;
    if (usedFaceColumns.has(c.tx)) continue;
    if (map.tileAt(c.tx, c.ty) !== TILE_SOLID) continue;
    map.setTile(c.tx, c.ty, TILE_BREAKABLE);
    usedFaceColumns.add(c.tx);
    placed++;
  }
  return placed;
}

function hasSolidSupportBelow(map: TileMap, x: number, y: number): boolean {
  const h = map.getHeight();
  for (let yy = y + 1; yy < h - 1; yy++) {
    const t = map.tileAt(x, yy);
    if (t === TILE_SOLID || t === TILE_BREAKABLE) return true;
    if (t !== TILE_EMPTY) break;
  }
  return false;
}

function isDoorCell(
  x: number,
  y: number,
  leftDoorX: number,
  rightDoorX: number,
  leftDoorTopY: number,
  rightDoorTopY: number,
): boolean {
  if (mapTileIsDoorColumn(x, y, leftDoorX, leftDoorTopY)) return true;
  if (mapTileIsDoorColumn(x, y, rightDoorX, rightDoorTopY)) return true;
  return false;
}

function mapTileIsDoorColumn(x: number, y: number, doorX: number, doorTopY: number): boolean {
  if (doorX < 0 || doorTopY < 0) return false;
  return x === doorX && (y === doorTopY || y === doorTopY + 1);
}

function breakableFaceReachableAfterBreak(
  faceX: number,
  faceY: number,
  groundY: number[],
  mesaRaisedAtFaceX: boolean,
  maxReach: number,
): boolean {
  const lowSideX = mesaRaisedAtFaceX ? faceX - 1 : faceX + 1;
  if (lowSideX < 1 || lowSideX >= groundY.length - 1) return false;
  const scanLo = mesaRaisedAtFaceX ? Math.max(1, lowSideX - 2) : lowSideX;
  const scanHi = mesaRaisedAtFaceX ? lowSideX : Math.min(groundY.length - 2, lowSideX + 2);
  let lowFloor = groundY[scanLo]!;
  for (let x = scanLo + 1; x <= scanHi; x++) lowFloor = Math.max(lowFloor, groundY[x]!);
  const riseTiles = lowFloor - faceY;
  if (riseTiles <= 0) return true;
  return riseTiles <= maxReach;
}

