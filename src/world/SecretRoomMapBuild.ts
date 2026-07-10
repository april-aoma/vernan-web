import { RoomKind } from "./DungeonTypes";
import type { GeneratedRoom, RoomConnectivity } from "./RoomGenerator";
import { hasDualHorizontalSeams, runwayFloorsConnected } from "./SecretDualSeamNav";
import type { NeighborSecretFaces, SecretRoomSeams } from "./SecretHorizontalSeamSpec";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_KEYBLOCK,
  TILE_KEYBLOCK_CONNECTOR,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "./TileMap";

/** Java SecretRoomMapBuild.RUNWAY_TILES. */
export const DOOR_RUNWAY_TILES = 8;

/** Java SecretRoomMapBuild.MAX_SECRET_STEP_HEIGHT_TILES. */
export const MAX_SECRET_STEP_HEIGHT_TILES = 3;

/** Default max contiguous solid/breakable above play floor (Java INTERIOR_PILLAR_DEFAULT_CAP). */
const INTERIOR_PILLAR_DEFAULT_CAP = 2;

/** Play-floor row under a 2-tile door (GEO-SEAM-1). */
export function seamPlayFloorRow(neighborDoorTopY: number, mapHeight: number): number {
  return Math.min(mapHeight - 2, neighborDoorTopY + 2);
}

/**
 * Before ASCII ground fill on secret rooms: align groundY[] to neighbor door tops.
 */
export function alignAsciiGroundYToSeams(
  groundY: number[],
  w: number,
  h: number,
  seams: SecretRoomSeams | null | undefined,
): void {
  if (!seams || seams.edges.length === 0) return;
  let maxFloor = -1;
  for (const e of seams.edges) {
    const floor = seamPlayFloorRow(e.neighborDoorTopY, h);
    maxFloor = maxFloor < 0 ? floor : Math.max(maxFloor, floor);
    const doorX = e.secretEastFace ? w - 2 : 1;
    const runwayLo = e.secretEastFace ? Math.max(1, doorX - DOOR_RUNWAY_TILES) : doorX;
    const runwayHi = e.secretEastFace ? doorX : Math.min(w - 2, doorX + DOOR_RUNWAY_TILES);
    for (let x = runwayLo; x <= runwayHi; x++) {
      if (x >= 0 && x < w) groundY[x] = floor;
    }
  }
  if (seams.superSecretFlatArena && maxFloor >= 0) {
    groundY.fill(maxFloor);
  }
}

/**
 * Finishes generate output for secret-adjacent neighbors and secret rooms
 * (Java SecretRoomMapBuild.finish — shells, padding seal, SUPER flat unify).
 */
export function finishSecretRoomMap(
  room: GeneratedRoom,
  kind: RoomKind,
  conn: RoomConnectivity,
  secretSeams: SecretRoomSeams | null | undefined,
  neighborFaces: NeighborSecretFaces | null | undefined,
  maxStep = MAX_SECRET_STEP_HEIGHT_TILES,
  pillarThinSeed = 0n,
): void {
  const map = room.map;
  const ladderTx = room.ladderColumnTx;

  let appliedNeighborFace = false;
  if (neighborFaces) {
    if (neighborFaces.finishEastFace && conn.doorEast) {
      const doorX = room.rightDoorTileX;
      const doorTop = room.rightDoorTopTileY;
      if (doorX >= 0 && doorTop >= 0) {
        carveHorizontalFace(map, doorX, doorTop, true, ladderTx, true);
        room.rightDoorTopTileY = doorTop;
        syncGroundYAlongRunway(room, doorX, doorTop, true);
        appliedNeighborFace = true;
      }
    }
    if (neighborFaces.finishWestFace && conn.doorWest) {
      const doorX = room.leftDoorTileX;
      const doorTop = room.leftDoorTopTileY;
      if (doorX >= 0 && doorTop >= 0) {
        carveHorizontalFace(map, doorX, doorTop, false, ladderTx, true);
        room.leftDoorTopTileY = doorTop;
        syncGroundYAlongRunway(room, doorX, doorTop, false);
        appliedNeighborFace = true;
      }
    }
  }
  // PROP-TRAV: runway flatten can leave an unjumpable cliff into the interior.
  if (appliedNeighborFace && kind !== RoomKind.SECRET) {
    enforceInteriorPlayFloorSteps(
      map,
      room.leftDoorTileX,
      room.rightDoorTileX,
      ladderTx,
      maxStep,
    );
  }

  if (secretSeams) {
    for (const edge of secretSeams.edges) {
      let doorX = edge.secretEastFace
        ? conn.doorEast
          ? room.rightDoorTileX
          : -1
        : conn.doorWest
          ? room.leftDoorTileX
          : -1;
      if (doorX < 0) doorX = edge.secretEastFace ? map.getWidth() - 2 : 1;
      const doorTop = clampDoorTop(map, edge.neighborDoorTopY);
      carveHorizontalFace(map, doorX, doorTop, edge.secretEastFace, -1, true);
      if (edge.secretEastFace) {
        room.rightDoorTileX = doorX;
        room.rightDoorTopTileY = doorTop;
        syncGroundYAlongRunway(room, doorX, doorTop, true);
      } else {
        room.leftDoorTileX = doorX;
        room.leftDoorTopTileY = doorTop;
        syncGroundYAlongRunway(room, doorX, doorTop, false);
      }
    }
    if (secretSeams.superSecretFlatArena) {
      unifySuperSecretFlatInterior(map, room, ladderTx);
    }
    // Wide SECRET dead-ends: seal interior padding (x=1 / x=w-2). SUPER skips.
    if (kind === RoomKind.SECRET) {
      sealUnusedHorizontalEdges(map, conn);
    }
    frameConnectedDoorColumns(map, room, conn, ladderTx);
    if (kind === RoomKind.SECRET) {
      bridgeDualSeamHeights(map, room, ladderTx, maxStep);
      enforceInteriorPlayFloorSteps(
        map,
        room.leftDoorTileX,
        room.rightDoorTileX,
        ladderTx,
        maxStep,
      );
    }
    if (
      kind === RoomKind.SECRET ||
      kind === RoomKind.NORMAL ||
      kind === RoomKind.BOSS
    ) {
      capInteriorSolidPillarsOnMap(
        map,
        ladderTx,
        room.leftDoorTileX,
        room.rightDoorTileX,
        pillarThinSeed,
        maxStep,
      );
    }
  }
  refreshRoomGroundY(room);
}

function unifySuperSecretFlatInterior(
  map: TileMap,
  g: GeneratedRoom,
  ladderTx: number,
): void {
  const w = map.getWidth();
  const h = map.getHeight();
  const floorRow = resolveSuperSecretFloorRow(g, map);
  const leftX = g.leftDoorTileX;
  const leftY = g.leftDoorTopTileY;
  const rightX = g.rightDoorTileX;
  const rightY = g.rightDoorTopTileY;
  for (let x = 1; x < w - 1; x++) {
    for (let y = 1; y < h - 1; y++) {
      if (isPreservedGameplayCell(map, x, y, leftX, leftY, rightX, rightY, ladderTx)) {
        continue;
      }
      const t = map.tileAt(x, y);
      if (y >= floorRow) {
        if (t !== TILE_SOLID) map.setTile(x, y, TILE_SOLID);
      } else if (t === TILE_SOLID || t === TILE_BREAKABLE) {
        map.setTile(x, y, TILE_EMPTY);
      }
    }
  }
  for (let x = 1; x < w - 1; x++) g.groundY[x] = floorRow;
}

function resolveSuperSecretFloorRow(g: GeneratedRoom, map: TileMap): number {
  const h = map.getHeight();
  if (g.leftDoorTileX >= 0 && g.leftDoorTopTileY >= 0) {
    return Math.min(h - 2, g.leftDoorTopTileY + 2);
  }
  if (g.rightDoorTileX >= 0 && g.rightDoorTopTileY >= 0) {
    return Math.min(h - 2, g.rightDoorTopTileY + 2);
  }
  const gy = groundYFromMap(map);
  let floor = gy[Math.min(2, gy.length - 1)]!;
  for (let x = 1; x < gy.length - 1; x++) floor = Math.max(floor, gy[x]!);
  return floor;
}

function isPreservedGameplayCell(
  map: TileMap,
  x: number,
  y: number,
  leftX: number,
  leftY: number,
  rightX: number,
  rightY: number,
  ladderTx: number,
): boolean {
  if (leftX >= 0 && leftY >= 0 && x === leftX && (y === leftY || y === leftY + 1)) return true;
  if (rightX >= 0 && rightY >= 0 && x === rightX && (y === rightY || y === rightY + 1)) return true;
  if (ladderTx >= 0 && x === ladderTx) {
    const t = map.tileAt(x, y);
    return t === TILE_LADDER || t === TILE_DOOR || t === TILE_BREAKABLE;
  }
  return false;
}

function sealUnusedHorizontalEdges(map: TileMap, conn: RoomConnectivity): void {
  const w = map.getWidth();
  const h = map.getHeight();
  if (!conn.doorWest) sealColumn(map, 1, h);
  if (!conn.doorEast) sealColumn(map, w - 2, h);
}

function sealColumn(map: TileMap, edgeX: number, h: number): void {
  for (let y = 1; y < h - 1; y++) map.setTile(edgeX, y, TILE_SOLID);
}

function frameConnectedDoorColumns(
  map: TileMap,
  g: GeneratedRoom,
  conn: RoomConnectivity,
  ladderTx: number,
): void {
  frameDoorColumnWall(map, g.leftDoorTileX, g.leftDoorTopTileY, ladderTx, conn.doorWest);
  frameDoorColumnWall(map, g.rightDoorTileX, g.rightDoorTopTileY, ladderTx, conn.doorEast);
}

function frameDoorColumnWall(
  map: TileMap,
  doorX: number,
  doorTopY: number,
  ladderTx: number,
  connected: boolean,
): void {
  if (!connected || doorX < 0 || doorTopY < 1) return;
  for (let y = 1; y < doorTopY; y++) {
    if (ladderTx >= 0 && doorX === ladderTx) continue;
    map.setTile(doorX, y, TILE_SOLID);
  }
}

/** Clamp door top so BB + play floor (doorTop+2) fit (Java clampDoorTop → h−4). */
export function clampDoorTop(map: TileMap, targetTopY: number): number {
  const h = map.getHeight();
  return Math.max(1, Math.min(h - 4, targetTopY));
}

/**
 * Re-stamp a left-door seam column to a neighbor's right-door top Y
 * (Java SecretRoomMapBuild.alignLeftDoorTopY).
 */
export function alignLeftDoorTopY(
  room: GeneratedRoom,
  doorX: number,
  neighborRightDoorTopY: number,
): void {
  if (doorX < 0 || neighborRightDoorTopY < 0) return;
  const doorTop = clampDoorTop(room.map, neighborRightDoorTopY);
  carveHorizontalFace(room.map, doorX, doorTop, false, room.ladderColumnTx, true);
  room.leftDoorTopTileY = doorTop;
  syncGroundYAlongRunway(room, doorX, doorTop, false);
}

/** Symmetric for a west room's right-door column. */
export function alignRightDoorTopY(
  room: GeneratedRoom,
  doorX: number,
  neighborLeftDoorTopY: number,
): void {
  if (doorX < 0 || neighborLeftDoorTopY < 0) return;
  const doorTop = clampDoorTop(room.map, neighborLeftDoorTopY);
  carveHorizontalFace(room.map, doorX, doorTop, true, room.ladderColumnTx, true);
  room.rightDoorTopTileY = doorTop;
  syncGroundYAlongRunway(room, doorX, doorTop, true);
}

/**
 * Full horizontal face carve: runway flatten + BB + SEC-SHELL-COL-1
 * (Java SecretRoomMapBuild.carveHorizontalFace).
 */
export function carveHorizontalFace(
  map: TileMap,
  doorX: number,
  doorTopY: number,
  eastFace: boolean,
  ladderTx: number,
  breakableDoor: boolean,
): void {
  const w = map.getWidth();
  const h = map.getHeight();
  const doorTop = clampDoorTop(map, doorTopY);
  const groundY = Math.min(h - 2, doorTop + 2);
  const runwayLo = eastFace ? Math.max(1, doorX - DOOR_RUNWAY_TILES) : doorX;
  const runwayHi = eastFace ? doorX : Math.min(w - 2, doorX + DOOR_RUNWAY_TILES);
  flattenDoorRunway(map, doorX, doorTop, groundY, runwayLo, runwayHi, ladderTx);
  const doorTile = breakableDoor ? TILE_BREAKABLE : TILE_DOOR;
  map.setTile(doorX, doorTop, doorTile);
  map.setTile(doorX, doorTop + 1, doorTile);
  if (breakableDoor) {
    // SEC-SHELL-COL-1: # on door column above/below BB (skip ladder col).
    for (let y = 1; y < h - 1; y++) {
      if (y === doorTop || y === doorTop + 1) continue;
      if (ladderTx >= 0 && doorX === ladderTx) continue;
      map.setTile(doorX, y, TILE_SOLID);
    }
  } else {
    for (let y = 1; y < doorTop; y++) {
      if (ladderTx >= 0 && doorX === ladderTx) continue;
      map.setTile(doorX, y, TILE_SOLID);
    }
  }
}

function flattenDoorRunway(
  map: TileMap,
  doorX: number,
  doorTopY: number,
  groundY: number,
  colLo: number,
  colHi: number,
  skipColumnTx: number,
): void {
  const h = map.getHeight();
  for (let x = colLo; x <= colHi; x++) {
    if (skipColumnTx >= 0 && x === skipColumnTx) continue;
    for (let y = 1; y < h - 1; y++) {
      if (x === doorX) {
        if (y === doorTopY || y === doorTopY + 1) continue;
        if (y < doorTopY) continue;
      }
      if (y >= groundY) {
        map.setTile(x, y, TILE_SOLID);
      } else if (x !== doorX) {
        const t = map.tileAt(x, y);
        if (t === TILE_SOLID || t === TILE_BREAKABLE) {
          map.setTile(x, y, TILE_EMPTY);
        }
      }
    }
  }
}

/** Keep GeneratedRoom.groundY in sync with play floor under the door (doorTop+2). */
export function syncGroundYAlongRunway(
  room: GeneratedRoom,
  doorX: number,
  doorTop: number,
  eastFace: boolean,
): void {
  const w = room.map.getWidth();
  const h = room.map.getHeight();
  const floor = Math.min(h - 2, doorTop + 2);
  const lo = eastFace ? Math.max(1, doorX - DOOR_RUNWAY_TILES) : doorX;
  const hi = eastFace ? doorX : Math.min(w - 2, doorX + DOOR_RUNWAY_TILES);
  for (let x = lo; x <= hi; x++) {
    if (room.ladderColumnTx >= 0 && x === room.ladderColumnTx) continue;
    room.groundY[x] = floor;
  }
}

/**
 * Bottom-up play-floor row per column (Java RoomGenerator.groundYFromMap:
 * SOLID / PLATFORM with empty-ish above).
 */
export function groundYFromMap(map: TileMap): number[] {
  const w = map.getWidth();
  const h = map.getHeight();
  const groundY = new Array<number>(w);
  for (let x = 0; x < w; x++) {
    groundY[x] = h - 2;
    for (let y = h - 2; y >= 1; y--) {
      if (isFloorSurface(map, x, y)) {
        groundY[x] = y;
        break;
      }
    }
  }
  return groundY;
}

/**
 * Topmost walkable floor in column tx (mesa lip / arena deck).
 * Used to strip H in pits below the lip — not groundYFromMap bottom-up (pit floor).
 */
export function arenaLipRowAt(map: TileMap, tx: number): number {
  const w = map.getWidth();
  const h = map.getHeight();
  const x = Math.max(1, Math.min(tx, w - 2));
  for (let y = 1; y < h - 1; y++) {
    if (isFloorSurface(map, x, y)) return y;
  }
  const groundY = groundYFromMap(map);
  return flankPlayFloorRowFromGroundY(groundY, x);
}

/** Grid-phase counterpart to arenaLipRowAt. */
export function arenaLipRowOnGrid(
  grid: string[][],
  w: number,
  h: number,
  tx: number,
  groundY: number[],
): number {
  const x = Math.max(1, Math.min(tx, w - 2));
  for (let y = 1; y < h - 1; y++) {
    if (isFloorSurfaceOnGrid(grid, h, x, y)) return y;
  }
  return flankPlayFloorRowFromGroundY(groundY, x);
}

function flankPlayFloorRowFromGroundY(groundY: number[], flankTx: number): number {
  if (groundY.length === 0) return 1;
  const col = Math.max(1, Math.min(flankTx, groundY.length - 2));
  return groundY[col]!;
}

function isFloorSurface(map: TileMap, x: number, y: number): boolean {
  const t = map.tileAt(x, y);
  if (t !== TILE_SOLID && t !== TILE_PLATFORM) return false;
  if (t === TILE_PLATFORM && hasArenaFloorBelow(map, x, y)) return false;
  const above = map.tileAt(x, y - 1);
  return (
    above === TILE_EMPTY ||
    above === TILE_DOOR ||
    above === TILE_LADDER ||
    above === TILE_BREAKABLE ||
    above === TILE_PLATFORM
  );
}

function isFloorSurfaceOnGrid(grid: string[][], h: number, x: number, y: number): boolean {
  if (y < 1 || y >= h - 1) return false;
  const c = grid[y]![x];
  if (c !== "#" && c !== "-") return false;
  if (c === "-" && hasArenaFloorBelowOnGrid(grid, h, x, y)) return false;
  const above = grid[y - 1]![x];
  return above === "." || above === "D" || above === "H" || above === "B" || above === "-";
}

function hasArenaFloorBelow(map: TileMap, x: number, y: number): boolean {
  const h = map.getHeight();
  for (let below = y + 1; below < h - 1; below++) {
    const bt = map.tileAt(x, below);
    if (bt === TILE_SOLID || bt === TILE_BREAKABLE) return true;
    if (bt !== TILE_EMPTY && bt !== TILE_LADDER) return false;
  }
  return false;
}

function hasArenaFloorBelowOnGrid(grid: string[][], h: number, x: number, y: number): boolean {
  for (let below = y + 1; below < h - 1; below++) {
    const bt = grid[below]![x];
    if (bt === "#" || bt === "B") return true;
    if (bt !== "." && bt !== "H") return false;
  }
  return false;
}

/**
 * Trim solids stacked above play floor when they exceed legal step/climb height
 * (Java SecretRoomMapBuild.capInteriorSolidPillarsOnMap / enforceInteriorTraversalTerrain).
 */
export function capInteriorSolidPillarsOnMap(
  map: TileMap,
  ladderTx: number,
  leftDoorX: number,
  rightDoorX: number,
  pillarThinSeed: bigint,
  maxStep = MAX_SECRET_STEP_HEIGHT_TILES,
): void {
  const w = map.getWidth();
  const floor = groundYFromMap(map);
  for (let x = 2; x < w - 2; x++) {
    if (isStepColumnExcluded(x, leftDoorX, rightDoorX, ladderTx)) continue;
    const maxAbove = maxAllowedInteriorSolidRun(
      map,
      w,
      floor,
      x,
      pillarThinSeed,
      maxStep,
    );
    const f = floor[x]!;
    let above = 0;
    for (let y = f - 1; y >= 1; y--) {
      const t = map.tileAt(x, y);
      if (t !== TILE_SOLID && t !== TILE_BREAKABLE) break;
      above++;
      if (above > maxAbove && t !== TILE_BREAKABLE) {
        map.setTile(x, y, TILE_EMPTY);
      }
    }
  }
}

function maxAllowedInteriorSolidRun(
  map: TileMap,
  w: number,
  floor: number[],
  x: number,
  pillarThinSeed: bigint,
  maxStep: number,
): number {
  let maxRun = INTERIOR_PILLAR_DEFAULT_CAP;
  const f = floor[x]!;
  let maxNeighborStep = 0;
  for (let dx = -1; dx <= 1; dx += 2) {
    const nx = x + dx;
    if (nx < 1 || nx >= w - 1) continue;
    const step = Math.abs(f - floor[nx]!);
    maxNeighborStep = Math.max(maxNeighborStep, step);
    if (step > maxStep) {
      if (hasLocalClimbInStepBand(map, f, floor[nx]!, x, nx)) {
        maxRun = Math.max(maxRun, step);
      } else {
        maxRun = Math.max(maxRun, maxStep);
      }
    } else {
      maxRun = Math.max(maxRun, step);
    }
  }
  maxRun = Math.max(1, maxRun);
  if (
    pillarThinSeed !== 0n &&
    maxStep >= MAX_SECRET_STEP_HEIGHT_TILES &&
    maxRun >= MAX_SECRET_STEP_HEIGHT_TILES &&
    maxNeighborStep === MAX_SECRET_STEP_HEIGHT_TILES &&
    shouldThinThreeHighInteriorPillar(pillarThinSeed, x, f)
  ) {
    maxRun = INTERIOR_PILLAR_DEFAULT_CAP;
  }
  return maxRun;
}

function shouldThinThreeHighInteriorPillar(
  seed: bigint,
  columnX: number,
  floorRow: number,
): boolean {
  const mix =
    seed ^ BigInt(columnX) * 0x9e3779b97n ^ BigInt(floorRow) * 0x85ebca6bn;
  return (mix & 3n) !== 0n;
}

/** Thin climb check: ladder/platform in the step band on either column. */
function hasLocalClimbInStepBand(
  map: TileMap,
  floorX: number,
  floorN: number,
  x: number,
  nx: number,
): boolean {
  if (floorX === floorN) return true;
  const lo = Math.min(floorX, floorN);
  const hi = Math.max(floorX, floorN);
  for (const col of [x, nx]) {
    for (let y = lo; y < hi; y++) {
      const t = map.tileAt(col, y);
      if (t === TILE_LADDER || t === TILE_PLATFORM) return true;
    }
  }
  return false;
}

/**
 * Lower interior mesas so no adjacent play-floor step exceeds maxStep
 * (Java SecretRoomMapBuild.enforceInteriorPlayFloorSteps).
 */
export function enforceInteriorPlayFloorSteps(
  map: TileMap,
  leftDoorX: number,
  rightDoorX: number,
  ladderTx: number,
  maxStep = MAX_SECRET_STEP_HEIGHT_TILES,
): void {
  const w = map.getWidth();
  const floor = groundYFromMap(map);
  for (let pass = 0; pass < w; pass++) {
    let changed = false;
    for (let x = 1; x < w - 2; x++) {
      const fa = floor[x]!;
      const fb = floor[x + 1]!;
      const step = Math.abs(fa - fb);
      if (step <= maxStep) continue;
      if (hasLocalClimbInStepBand(map, fa, fb, x, x + 1)) continue;
      if (fa < fb) {
        const target = fb - maxStep;
        if (!isStepColumnExcluded(x, leftDoorX, rightDoorX, ladderTx) && target > fa) {
          reseatColumnPlayFloor(map, x, target, fa);
          floor[x] = target;
          changed = true;
        } else if (!isStepColumnExcluded(x + 1, leftDoorX, rightDoorX, ladderTx)) {
          const raise = fa + maxStep;
          if (raise < fb) {
            reseatColumnPlayFloor(map, x + 1, raise, fb);
            floor[x + 1] = raise;
            changed = true;
          }
        }
      } else {
        const target = fa - maxStep;
        if (!isStepColumnExcluded(x + 1, leftDoorX, rightDoorX, ladderTx) && target > fb) {
          reseatColumnPlayFloor(map, x + 1, target, fb);
          floor[x + 1] = target;
          changed = true;
        } else if (!isStepColumnExcluded(x, leftDoorX, rightDoorX, ladderTx)) {
          const raise = fb + maxStep;
          if (raise < fa) {
            reseatColumnPlayFloor(map, x, raise, fa);
            floor[x] = raise;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * When a SECRET has west+east seams at different play-floor heights, grade the
 * interior so both entrances stay reachable (SEC-DUAL-1 / Java bridgeDualSeamHeights).
 */
export function bridgeDualSeamHeights(
  map: TileMap,
  g: GeneratedRoom,
  _ladderTx: number,
  maxStep = MAX_SECRET_STEP_HEIGHT_TILES,
): void {
  if (!hasDualHorizontalSeams(g)) return;
  if (runwayFloorsConnected(map, g, maxStep)) return;
  const leftX = g.leftDoorTileX;
  const rightX = g.rightDoorTileX;
  const h = map.getHeight();
  const westFloor = seamPlayFloorRow(g.leftDoorTopTileY, h);
  const eastFloor = seamPlayFloorRow(g.rightDoorTopTileY, h);
  const bridgeLo = leftX + 1;
  const bridgeHi = rightX - 1;
  if (bridgeLo > bridgeHi) return;
  applyGradedFloorBridge(map, bridgeLo, bridgeHi, westFloor, eastFloor, maxStep);
  capBridgeSpanStepHeights(map, bridgeLo, bridgeHi, maxStep);
  setColumnPlayFloorRow(map, leftX + 1, westFloor);
  setColumnPlayFloorRow(map, rightX - 1, eastFloor);
  capBridgeSpanStepHeights(map, bridgeLo, bridgeHi, maxStep);
}

function capBridgeSpanStepHeights(
  map: TileMap,
  bridgeLo: number,
  bridgeHi: number,
  maxStep: number,
): void {
  const floor = groundYFromMap(map);
  for (let pass = 0; pass <= bridgeHi - bridgeLo; pass++) {
    let changed = false;
    for (let x = bridgeLo + 1; x <= bridgeHi; x++) {
      const left = floor[x - 1]!;
      const f = floor[x]!;
      if (f - left > maxStep) {
        const target = left + maxStep;
        setColumnPlayFloorRow(map, x, target);
        floor[x] = target;
        changed = true;
      }
      if (left - f > maxStep) {
        const target = f + maxStep;
        setColumnPlayFloorRow(map, x - 1, target);
        floor[x - 1] = target;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function applyGradedFloorBridge(
  map: TileMap,
  bridgeLo: number,
  bridgeHi: number,
  westFloor: number,
  eastFloor: number,
  maxStep: number,
): void {
  const floor = groundYFromMap(map);
  const cols = bridgeHi - bridgeLo;
  let prev = westFloor;
  for (let i = 0; i <= cols; i++) {
    const x = bridgeLo + i;
    let target =
      cols === 0 ? eastFloor : westFloor + Math.floor(((eastFloor - westFloor) * i) / cols);
    target = clampFloorStep(prev, target, maxStep);
    if (floor[x]! !== target) {
      setColumnPlayFloorRow(map, x, target);
      floor[x] = target;
    }
    prev = target;
  }
}

function clampFloorStep(fromFloor: number, toFloor: number, maxStep: number): number {
  if (toFloor > fromFloor + maxStep) return fromFloor + maxStep;
  if (toFloor < fromFloor - maxStep) return fromFloor - maxStep;
  return toFloor;
}

/** Set play-floor row for one column (air above floorRow, solid from floorRow down). */
function setColumnPlayFloorRow(map: TileMap, x: number, floorRow: number): void {
  const h = map.getHeight();
  for (let y = 1; y < h - 1; y++) {
    if (isPreservedForFloorReshape(map.tileAt(x, y))) continue;
    map.setTile(x, y, TILE_EMPTY);
  }
  for (let y = floorRow; y < h - 1; y++) {
    if (isPreservedForFloorReshape(map.tileAt(x, y))) continue;
    map.setTile(x, y, TILE_SOLID);
  }
}

/** Doors/keyblocks only — ladder rungs restored by shaft reconcile after the bridge. */
function isPreservedForFloorReshape(t: number): boolean {
  return t === TILE_DOOR || t === TILE_KEYBLOCK || t === TILE_KEYBLOCK_CONNECTOR;
}

function isStepColumnExcluded(
  x: number,
  leftDoorX: number,
  rightDoorX: number,
  ladderTx: number,
): boolean {
  if (ladderTx >= 0 && x === ladderTx) return true;
  if (leftDoorX >= 0 && (x === leftDoorX || x === leftDoorX - 1 || x === leftDoorX + 1)) {
    return true;
  }
  if (rightDoorX >= 0 && (x === rightDoorX || x === rightDoorX - 1 || x === rightDoorX + 1)) {
    return true;
  }
  return false;
}

function isGameplayPreservedTile(t: number): boolean {
  return (
    t === TILE_DOOR ||
    t === TILE_LADDER ||
    t === TILE_KEYBLOCK ||
    t === TILE_KEYBLOCK_CONNECTOR
  );
}

/** Lower or raise a column play floor (GEO-AXIS-1: larger y is deeper). */
function reseatColumnPlayFloor(
  map: TileMap,
  x: number,
  newFloorRow: number,
  oldFloorRow: number,
): void {
  if (newFloorRow === oldFloorRow) return;
  if (newFloorRow > oldFloorRow) {
    const h = map.getHeight();
    for (let y = oldFloorRow; y < newFloorRow; y++) {
      if (!isGameplayPreservedTile(map.tileAt(x, y))) {
        map.setTile(x, y, TILE_EMPTY);
      }
    }
    for (let y = newFloorRow; y < h - 1; y++) {
      const t = map.tileAt(x, y);
      if (isGameplayPreservedTile(t)) continue;
      if (t === TILE_EMPTY || t === TILE_LADDER) {
        map.setTile(x, y, TILE_SOLID);
      }
    }
    return;
  }
  // Raise floor (shallower): clear solids above new floor, solidify at new row.
  for (let y = newFloorRow; y < oldFloorRow; y++) {
    const t = map.tileAt(x, y);
    if (isGameplayPreservedTile(t)) continue;
    if (y === newFloorRow) {
      if (t === TILE_EMPTY || t === TILE_LADDER) map.setTile(x, y, TILE_SOLID);
    } else if (t === TILE_SOLID || t === TILE_BREAKABLE) {
      map.setTile(x, y, TILE_EMPTY);
    }
  }
}

/** Sync room.groundY from live map (after vertical seal passes). */
export function refreshRoomGroundY(room: GeneratedRoom): void {
  const gy = groundYFromMap(room.map);
  for (let i = 0; i < gy.length && i < room.groundY.length; i++) {
    room.groundY[i] = gy[i]!;
  }
}

/** SEC-LADDER-2: remove procedural mouth platforms in the shaft before reconcile. */
export function clearStrayLadderPlatforms(
  map: TileMap,
  ladderTx: number,
  mouthRow: number,
  keepMouthAtFloorRow: boolean,
): void {
  const h = map.getHeight();
  for (let y = 1; y < h - 1; y++) {
    if (keepMouthAtFloorRow && y === mouthRow) continue;
    if (map.tileAt(ladderTx, y) === TILE_PLATFORM) {
      map.setTile(ladderTx, y, TILE_EMPTY);
    }
  }
}

/**
 * LADDER-MOUTH-2: rungs through floorRow−1, mouth deck at floorRow when ladderSouth.
 * Java SecretRoomMapBuild.finalizeLadderShaft / reconcileLadderShaftToFloorRow.
 */
export function finalizeLadderShaft(
  map: TileMap,
  ladderTx: number,
  floorRow: number,
  conn: RoomConnectivity,
  leftDoorX = -1,
  rightDoorX = -1,
): void {
  reconcileLadderShaftToFloorRow(map, ladderTx, floorRow, conn, leftDoorX, rightDoorX);
}

/** GEO-DOOR-2: re-stamp solid under connected D doors after shaft flank clears. */
export function restoreConnectedDoorRunwayFloors(
  map: TileMap,
  leftDoorX: number,
  leftDoorTopY: number,
  rightDoorX: number,
  rightDoorTopY: number,
  ladderTx: number,
): void {
  restoreConnectedDoorRunwayFloor(map, leftDoorX, leftDoorTopY, ladderTx);
  restoreConnectedDoorRunwayFloor(map, rightDoorX, rightDoorTopY, ladderTx);
}

function restoreConnectedDoorRunwayFloor(
  map: TileMap,
  doorX: number,
  doorTopY: number,
  ladderTx: number,
): void {
  if (doorX < 1 || doorTopY < 1) return;
  if (ladderTx >= 0 && doorX === ladderTx) return;
  if (map.tileAt(doorX, doorTopY) !== TILE_DOOR || map.tileAt(doorX, doorTopY + 1) !== TILE_DOOR) {
    return;
  }
  const floorRow = Math.min(map.getHeight() - 2, doorTopY + 2);
  const t = map.tileAt(doorX, floorRow);
  if (t === TILE_EMPTY || t === TILE_LADDER) {
    map.setTile(doorX, floorRow, TILE_SOLID);
  }
}

/**
 * LADDER-MOUTH-SOUTH-1 / LADDER-DEAD-END-NORTH-ONLY: south mouth is `-` at runway when
 * ladderSouth and not secret-sealed; north-only dead-end is `#` at runway.
 */
export function enforceRunwayCellAtShaft(
  map: TileMap,
  ladderTx: number,
  runwayRow: number,
  ladderSouth: boolean,
  _ladderNorth: boolean,
  southFaceSecretSealed: boolean,
): void {
  if (ladderTx < 1 || runwayRow < 1 || runwayRow >= map.getHeight() - 1) return;
  if (ladderSouth && !southFaceSecretSealed) {
    if (!isShaftMouthCellPreserved(map.tileAt(ladderTx, runwayRow))) {
      map.setTile(ladderTx, runwayRow, TILE_PLATFORM);
    }
  } else if (!ladderSouth) {
    if (!isShaftMouthCellPreserved(map.tileAt(ladderTx, runwayRow))) {
      map.setTile(ladderTx, runwayRow, TILE_SOLID);
    }
    if (map.tileAt(ladderTx, runwayRow) === TILE_LADDER) {
      map.setTile(ladderTx, runwayRow, TILE_SOLID);
    }
    sealSouthDeadEndBelowFoot(map, ladderTx, runwayRow);
  }
}

/** GEN-LADDER-L-1: never leave open air in column L at y != 0. */
export function fillShaftColumnGaps(
  map: TileMap,
  ladderTx: number,
  footRow: number,
  conn: RoomConnectivity,
): void {
  if (ladderTx < 1) return;
  const h = map.getHeight();
  for (let y = 1; y < h - 1; y++) {
    if (map.tileAt(ladderTx, y) !== TILE_EMPTY) continue;
    if (y === footRow) {
      map.setTile(ladderTx, y, conn.ladderSouth ? TILE_PLATFORM : TILE_SOLID);
      continue;
    }
    if (conn.ladderSouth || y < footRow) {
      carveLadderRung(map, ladderTx, y);
    } else {
      map.setTile(ladderTx, y, TILE_SOLID);
    }
  }
}

/** GEN-SHAFT-FLANK-1: clear tall stacks in L±2 (never door/shell columns). */
export function stripShaftFlankSolidPillars(
  map: TileMap,
  ladderTx: number,
  footRow: number,
  leftDoorX = -1,
  rightDoorX = -1,
): void {
  if (ladderTx < 1 || footRow < 2) return;
  const w = map.getWidth();
  const l = Math.max(1, Math.min(ladderTx, w - 2));
  const radius = 2;
  for (let dx = -radius; dx <= radius; dx++) {
    if (dx === 0) continue;
    const tx = l + dx;
    if (tx < 1 || tx >= w - 1) continue;
    if (isStepColumnExcluded(tx, leftDoorX, rightDoorX, ladderTx)) continue;
    for (let y = 1; y < footRow; y++) {
      const t = map.tileAt(tx, y);
      if (isShaftMouthCellPreserved(t)) continue;
      if (t === TILE_SOLID || t === TILE_BREAKABLE) {
        map.setTile(tx, y, TILE_EMPTY);
      }
    }
  }
}

function reconcileLadderShaftToFloorRow(
  map: TileMap,
  ladderTx: number,
  footRow: number,
  conn: RoomConnectivity,
  leftDoorX: number,
  rightDoorX: number,
): void {
  const h = map.getHeight();
  if (conn.ladderSouth) {
    for (let y = 1; y < footRow; y++) carveLadderRung(map, ladderTx, y);
    if (!isShaftMouthCellPreserved(map.tileAt(ladderTx, footRow))) {
      map.setTile(ladderTx, footRow, TILE_PLATFORM);
    }
    for (let y = footRow + 1; y < h - 1; y++) carveLadderRung(map, ladderTx, y);
    if (
      map.tileAt(ladderTx, h - 1) !== TILE_DOOR &&
      map.tileAt(ladderTx, h - 1) !== TILE_BREAKABLE
    ) {
      map.setTile(ladderTx, h - 1, TILE_LADDER);
    }
  } else {
    for (let y = 1; y < footRow; y++) carveLadderRung(map, ladderTx, y);
    if (!isShaftMouthCellPreserved(map.tileAt(ladderTx, footRow))) {
      map.setTile(ladderTx, footRow, TILE_SOLID);
    }
    for (let y = footRow + 1; y < h - 1; y++) {
      const t = map.tileAt(ladderTx, y);
      if (t === TILE_DOOR || t === TILE_BREAKABLE) continue;
      map.setTile(ladderTx, y, TILE_SOLID);
    }
  }
  if (conn.ladderNorth || conn.ladderSouth) {
    if (
      map.tileAt(ladderTx, 0) !== TILE_DOOR &&
      map.tileAt(ladderTx, 0) !== TILE_BREAKABLE
    ) {
      map.setTile(ladderTx, 0, conn.ladderNorth ? TILE_EMPTY : TILE_SOLID);
    }
  }
  enforceRunwayCellAtShaft(
    map,
    ladderTx,
    footRow,
    conn.ladderSouth,
    conn.ladderNorth,
    false,
  );
  if (!conn.ladderSouth) {
    sealSouthDeadEndBelowFoot(map, ladderTx, footRow);
  }
  stripShaftFlankSolidPillars(map, ladderTx, footRow, leftDoorX, rightDoorX);
  fillShaftColumnGaps(map, ladderTx, footRow, conn);
}

function sealSouthDeadEndBelowFoot(map: TileMap, ladderTx: number, footRow: number): void {
  const h = map.getHeight();
  for (let y = footRow + 1; y < h - 1; y++) {
    if (isShaftMouthCellPreserved(map.tileAt(ladderTx, y))) continue;
    map.setTile(ladderTx, y, TILE_SOLID);
  }
}

function isShaftMouthCellPreserved(t: number): boolean {
  return (
    t === TILE_DOOR ||
    t === TILE_BREAKABLE ||
    t === TILE_KEYBLOCK ||
    t === TILE_KEYBLOCK_CONNECTOR
  );
}

function carveLadderRung(map: TileMap, ladderTx: number, y: number): void {
  const t = map.tileAt(ladderTx, y);
  if (
    t === TILE_BREAKABLE ||
    t === TILE_KEYBLOCK ||
    t === TILE_KEYBLOCK_CONNECTOR
  ) {
    return;
  }
  if (t === TILE_SOLID || t === TILE_PLATFORM) {
    map.setTile(ladderTx, y, TILE_EMPTY);
  }
  if (map.tileAt(ladderTx, y) === TILE_EMPTY) {
    map.setTile(ladderTx, y, TILE_LADDER);
  }
}
