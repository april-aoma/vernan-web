import { TILE_SIZE } from "../specs";
import { JavaRandom } from "../util/JavaRandom";
import { RoomKind, type RoomNode } from "./DungeonTypes";
import type { EnemySpawn } from "./EnemySpawnBudget";
import {
  makeItemPedestal,
  pedestalWorldFromColumn,
  resolvePedestalTileX,
  type ItemPedestal,
} from "./pedestal";
import type { NeighborSecretFaces, SecretRoomSeams } from "./SecretHorizontalSeamSpec";
import {
  alignAsciiGroundYToSeams,
  finishSecretRoomMap,
} from "./SecretRoomMapBuild";
import { TileMap } from "./TileMap";
import type { TerrainTileBridge } from "../tileset/TerrainTileBridge";

const PLAYER_STAND_SPAWN_H = 18;
const GOLDEN = 0x9e3779b97f4a7c15n;

/** Options for SecretRoomMapBuild.finish (Java SecretGenFinishOptions). */
export type SecretGenFinishOptions = {
  secretSeams?: SecretRoomSeams | null;
  neighborFaces?: NeighborSecretFaces | null;
};

export type RoomConnectivity = {
  doorWest: boolean;
  doorEast: boolean;
  ladderNorth: boolean;
  ladderSouth: boolean;
  ladderColumnTx: number;
};

export type RoomArtData = {
  biomeId: string;
  sheetId: string;
  decoStamps: Array<{ tx: number; ty: number; tileId: string; channel: 0 | 1 }>;
  /** Cached biome terrain bridge for draw (Phase C+). */
  bridge: TerrainTileBridge;
};

export type GeneratedRoom = {
  map: TileMap;
  kind: RoomKind;
  leftDoorTileX: number;
  leftDoorTopTileY: number;
  rightDoorTileX: number;
  rightDoorTopTileY: number;
  groundY: number[];
  ladderColumnTx: number;
  /** World spawn when entering from the room above (FROM_ABOVE); -1 if unused. */
  ladderFromNorthSpawnX: number;
  ladderFromNorthSpawnY: number;
  /** World spawn when entering from the room below (FROM_BELOW); -1 if unused. */
  ladderFromSouthSpawnX: number;
  ladderFromSouthSpawnY: number;
  enemySpawns: EnemySpawn[];
  /** ITEM rooms: deferred item id (null until decks resolve). */
  itemPedestal: ItemPedestal | null;
  /** Phase C+: biome + deco (filled when tileset loads). */
  art?: RoomArtData;
};

/**
 * ASCII shell generator: frame, padding, ground, doors, entry pad + SecretRoomMapBuild.finish.
 * Biomes/deco attached later via enrichDungeonArt (Phase C+).
 */
export function generateRoomShell(
  seed: bigint,
  widthTiles: number,
  heightTiles: number,
  conn: RoomConnectivity,
  kind: RoomKind,
  finishOpts?: SecretGenFinishOptions | null,
): GeneratedRoom {
  const largeArena = kind === RoomKind.NORMAL || kind === RoomKind.SECRET;
  const w = Math.max(largeArena ? 24 : 10, widthTiles);
  const h = Math.max(largeArena ? 12 : 8, heightTiles);
  void new JavaRandom(seed ^ GOLDEN);

  const noise = valueNoise1D(seed, w, 8);
  const groundY = new Array<number>(w).fill(0);
  const base = Math.min(h - 2, Math.round(h * 0.75));
  const minY = Math.max(4, h - 12);
  const maxY = h - 2;

  // Java: only START is initially flat; SHOP/SUPER flatten after entry pad; ITEM/BOSS use noise.
  if (kind === RoomKind.START) {
    const flatY = clampInt(base, minY, maxY);
    groundY.fill(flatY);
  } else {
    let prev = clampInt(Math.round(base - noise[0]! * 4.0), minY, maxY);
    groundY[0] = prev;
    let flatRun = 0;
    for (let x = 1; x < w; x++) {
      let target = clampInt(Math.round(base - noise[x]! * 4.0), minY, maxY);
      const dy = target - prev;
      if (dy > 1) target = prev + 1;
      if (dy < -1) target = prev - 1;
      const bigUp = target < prev - 1 ? 1 : 0;
      if (bigUp === 1 && flatRun < 2) target = prev;
      if (target === prev) flatRun++;
      else flatRun = 0;
      prev = target;
      groundY[x] = prev;
    }
  }

  // Secret rooms: align groundY to neighbor door tops before fill (Java alignAsciiGroundYToSeams).
  if (finishOpts?.secretSeams) {
    alignAsciiGroundYToSeams(groundY, w, h, finishOpts.secretSeams);
  }

  const grid: string[][] = [];
  for (let y = 0; y < h; y++) {
    grid[y] = [];
    for (let x = 0; x < w; x++) grid[y]![x] = ".";
  }
  // Outer frame shells (x=0 / x=w-1 / y=0 / y=h-1).
  for (let x = 0; x < w; x++) {
    grid[0]![x] = "#";
    grid[h - 1]![x] = "#";
  }
  for (let y = 0; y < h; y++) {
    grid[y]![0] = "#";
    grid[y]![w - 1] = "#";
  }

  // Wide SECRET no west door: padding column x=1 (second wall / planner padding).
  if (kind === RoomKind.SECRET && !conn.doorWest) {
    for (let y = 1; y < h - 1; y++) grid[y]![1] = "#";
  }

  const entryPadStartX = entryPadStartColumn(kind, conn);
  const entryX = Math.min(entryPadStartX + 1, w - 2);
  const entryY = groundY[entryX]!;
  const entryPadEndX = Math.min(entryPadStartX + 5, w - 2);
  for (let x = entryPadStartX; x <= entryPadEndX; x++) {
    groundY[x] = entryY;
  }
  // Shops (and SUPER) flat for press-to-buy UX — Java Arrays.fill after entry pad.
  if (kind === RoomKind.SHOP || kind === RoomKind.SUPER_SECRET) {
    groundY.fill(entryY);
  }

  const leftDoorX = 1;
  const rightDoorX = w - 2;

  if (conn.doorWest) {
    const leftAdjX = 2;
    groundY[leftDoorX] = groundY[Math.min(leftAdjX, w - 2)]!;
    groundY[Math.min(leftAdjX, w - 2)] = groundY[leftDoorX]!;
    flattenGroundRun(groundY, entryPadStartX, Math.min(3, w - 2));
  }
  if (conn.doorEast) {
    const rightAdjX = w - 3;
    groundY[rightDoorX] = groundY[Math.max(1, Math.min(rightAdjX, w - 2))]!;
    groundY[Math.max(1, Math.min(rightAdjX, w - 2))] = groundY[rightDoorX]!;
    const eastHi = w - 2;
    const eastLo = Math.max(7, eastHi - 3);
    if (eastLo <= eastHi) flattenGroundRun(groundY, eastLo, eastHi);
  }

  // Prefer seam-aligned door tops when secret finish edges exist.
  let leftDoorTopY = -1;
  let rightDoorTopY = -1;
  if (finishOpts?.secretSeams) {
    for (const e of finishOpts.secretSeams.edges) {
      const top = clampInt(e.neighborDoorTopY, 1, h - 4);
      if (e.secretEastFace) rightDoorTopY = top;
      else leftDoorTopY = top;
    }
  }
  if (conn.doorWest && leftDoorTopY < 0) {
    leftDoorTopY = clampInt(groundY[Math.min(leftDoorX, w - 2)]! - 2, 1, h - 4);
  }
  if (conn.doorEast && rightDoorTopY < 0) {
    rightDoorTopY = clampInt(groundY[Math.min(rightDoorX, w - 2)]! - 2, 1, h - 4);
  }
  if (!conn.doorWest) leftDoorTopY = -1;
  if (!conn.doorEast) rightDoorTopY = -1;

  for (let x = 1; x < w - 1; x++) {
    // Preserve SECRET west padding column stamped above.
    if (kind === RoomKind.SECRET && !conn.doorWest && x === 1) continue;
    const gy = clampInt(groundY[x]!, 1, h - 2);
    for (let y = 1; y < h - 1; y++) grid[y]![x] = ".";
    for (let y = gy; y < h - 1; y++) grid[y]![x] = "#";
  }

  if (conn.doorWest && leftDoorTopY >= 0) {
    grid[leftDoorTopY]![leftDoorX] = "D";
    grid[leftDoorTopY + 1]![leftDoorX] = "D";
  }
  if (conn.doorEast && rightDoorTopY >= 0) {
    grid[rightDoorTopY]![rightDoorX] = "D";
    grid[rightDoorTopY + 1]![rightDoorX] = "D";
  }

  // Optional dungeon ladder shaft — Mega Man–style seam through N/S borders when linked.
  let ladderTx = conn.ladderColumnTx;
  if (ladderTx >= 0) ladderTx = Math.max(3, Math.min(ladderTx, w - 4));
  let ladderFromNorthSpawnX = -1;
  let ladderFromNorthSpawnY = -1;
  let ladderFromSouthSpawnX = -1;
  let ladderFromSouthSpawnY = -1;
  if (ladderTx >= 0 && (conn.ladderNorth || conn.ladderSouth)) {
    const mouthRow = clampInt(groundY[ladderTx]!, 2, h - 2);
    const y1 = mouthRow - 1;
    let y0: number;
    if (conn.ladderNorth && conn.ladderSouth) {
      y0 = 1;
    } else if (conn.ladderSouth) {
      y0 = Math.max(1, mouthRow - 14);
    } else {
      y0 = 1;
    }
    for (let y = y0; y <= y1; y++) {
      if (y < 1 || y >= h - 1) continue;
      if (grid[y]![ladderTx] === "D") continue;
      grid[y]![ladderTx] = "H";
    }
    const L = ladderTx;
    if (conn.ladderSouth) {
      // Mouth deck at runway; shaft continues through bottom seam.
      if (mouthRow >= 1 && mouthRow < h - 1 && grid[mouthRow]![L] !== "D") {
        grid[mouthRow]![L] = "-";
      }
      for (let y = mouthRow + 1; y < h - 1; y++) {
        if (grid[y]![L] === "D") continue;
        grid[y]![L] = "H";
      }
      if (grid[h - 1]![L] !== "D") grid[h - 1]![L] = "H";
    } else {
      // North-only dead-end: solid floor cap under the shaft.
      if (grid[mouthRow]![L] !== "D") grid[mouthRow]![L] = "#";
      for (let y = mouthRow + 1; y < h - 1; y++) {
        if (grid[y]![L] === "D") continue;
        grid[y]![L] = "#";
      }
    }
    if (grid[0]![L] !== "D") {
      grid[0]![L] = conn.ladderNorth ? "." : "#";
    }
    const lSpawnX = L * TILE_SIZE + Math.floor(TILE_SIZE / 2) - 5;
    if (conn.ladderNorth) {
      ladderFromNorthSpawnX = lSpawnX;
      ladderFromNorthSpawnY = Math.min(y0 + 2, y1) * TILE_SIZE - 32;
    }
    if (conn.ladderSouth) {
      ladderFromSouthSpawnX = lSpawnX;
      ladderFromSouthSpawnY = h * TILE_SIZE - 32;
    }
  }

  const rows = grid.map((row) => row.join(""));
  const map = TileMap.fromAscii(rows);

  let itemPedestal: ItemPedestal | null = null;
  if (kind === RoomKind.ITEM) {
    const cx = resolvePedestalTileX(
      w,
      Math.floor(w / 2),
      ladderTx >= 0 ? ladderTx : -1,
      conn.doorWest ? leftDoorX : -1,
      conn.doorEast ? rightDoorX : -1,
    );
    const groundTop = map.groundTopWorldYAtColumn(cx);
    const pos = pedestalWorldFromColumn(w, cx, groundTop);
    itemPedestal = makeItemPedestal(null, pos.anchorX, pos.groundTop);
  }

  const room: GeneratedRoom = {
    map,
    kind,
    leftDoorTileX: conn.doorWest ? leftDoorX : -1,
    leftDoorTopTileY: leftDoorTopY,
    rightDoorTileX: conn.doorEast ? rightDoorX : -1,
    rightDoorTopTileY: rightDoorTopY,
    groundY,
    ladderColumnTx: ladderTx >= 0 ? ladderTx : -1,
    ladderFromNorthSpawnX,
    ladderFromNorthSpawnY,
    ladderFromSouthSpawnX,
    ladderFromSouthSpawnY,
    enemySpawns: [],
    itemPedestal,
  };

  // Java SecretRoomMapBuild.finish — SEC-SHELL-COL-1, padding seal, SUPER flat unify.
  if (finishOpts?.secretSeams || finishOpts?.neighborFaces) {
    finishSecretRoomMap(
      room,
      kind,
      conn,
      finishOpts.secretSeams ?? null,
      finishOpts.neighborFaces ?? null,
    );
  }

  return room;
}

/** First column for left entry pad (SECRET west padding starts pad at x=2). */
function entryPadStartColumn(kind: RoomKind, conn: RoomConnectivity): number {
  if (kind === RoomKind.SECRET && !conn.doorWest) return 2;
  return 1;
}

export function connectivityFromNode(node: RoomNode, roomW: number): RoomConnectivity {
  let ladderTx = node.ladderColumnTx;
  if (ladderTx >= 0) ladderTx = Math.max(3, Math.min(ladderTx, roomW - 4));
  return {
    doorWest: node.doorWest,
    doorEast: node.doorEast,
    ladderNorth: node.ladderNorth,
    ladderSouth: node.ladderSouth,
    ladderColumnTx: ladderTx,
  };
}

export function spawnPxAtFloorColumn(map: TileMap, spawnTx: number): { x: number; y: number } {
  const tx = Math.max(0, Math.min(spawnTx, map.getWidth() - 1));
  const groundTop = map.groundTopWorldYAtColumn(tx);
  return {
    x: tx * TILE_SIZE,
    y: Math.round(groundTop - PLAYER_STAND_SPAWN_H),
  };
}

export function defaultSpawnPx(g: GeneratedRoom): { x: number; y: number } {
  const w = g.map.getWidth();
  const spawnTx = Math.min(2, Math.max(1, w - 3));
  return spawnPxAtFloorColumn(g.map, spawnTx);
}

export function horizontalDoorSpawnPx(g: GeneratedRoom, fromWest: boolean): { x: number; y: number } {
  // Java refreshDoorSpawnPads: feet on doorTop+2 play floor.
  if (fromWest) {
    if (g.leftDoorTileX >= 0 && g.leftDoorTopTileY >= 0) {
      return {
        x: (g.leftDoorTileX + 1) * TILE_SIZE,
        y: (g.leftDoorTopTileY + 2) * TILE_SIZE - 32,
      };
    }
  } else if (g.rightDoorTileX >= 0 && g.rightDoorTopTileY >= 0) {
    return {
      x: (g.rightDoorTileX - 1) * TILE_SIZE,
      y: (g.rightDoorTopTileY + 2) * TILE_SIZE - 32,
    };
  }
  return defaultSpawnPx(g);
}

function flattenGroundRun(groundY: number[], lo: number, hi: number): void {
  if (lo > hi) return;
  let floor = groundY[lo]!;
  for (let x = lo; x <= hi; x++) floor = Math.max(floor, groundY[x]!);
  for (let x = lo; x <= hi; x++) groundY[x] = floor;
}

function valueNoise1D(seed: bigint, n: number, periodTiles: number): number[] {
  const r = new JavaRandom(seed);
  const period = Math.max(2, periodTiles);
  const points = Math.floor(n / period) + 3;
  const knots = new Array<number>(points);
  for (let i = 0; i < points; i++) knots[i] = r.nextDouble() * 2.0 - 1.0;
  const out = new Array<number>(n);
  for (let x = 0; x < n; x++) {
    const t = x / period;
    const i0 = Math.floor(t);
    const f = t - i0;
    const a = knots[i0]!;
    const b = knots[i0 + 1]!;
    const s = f * f * (3.0 - 2.0 * f);
    out[x] = a + (b - a) * s;
  }
  return out;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
