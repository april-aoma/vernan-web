import { TILE_SIZE } from "../specs";
import { BossKind, pickBossForFloor } from "../boss/BossRegistry";
import { JavaRandom } from "../util/JavaRandom";
import { placeStepBreakables } from "../tileset/placeStepBreakables";
import { PickupKind } from "./BreakableLootRoll";
import { isOneScreenRoomKind, RoomKind, type RoomNode } from "./DungeonTypes";
import type { DungeonLayout } from "./DungeonLayout";
import {
  MAX_PROCEDURAL_LADDER_RUNGS,
  stripSpuriousLaddersFromGrid,
  stripSpuriousLaddersFromMap,
} from "./DungeonVerticalShaftRules";
import {
  applyLadderSafetyPlatforms,
  stripPlatformsOnRow,
} from "./LadderSafetyPlatforms";
import type { EnemySpawn } from "./EnemySpawnBudget";
import {
  makeItemPedestal,
  pedestalWorldFromColumn,
  resolvePedestalTileX,
  type ItemPedestal,
} from "./pedestal";
import {
  auditAndStripIllegalBreakables,
  type ExitSpec,
} from "./ProceduralBreakableNav";
import type { NeighborSecretFaces, SecretRoomSeams } from "./SecretHorizontalSeamSpec";
import {
  alignAsciiGroundYToSeams,
  capInteriorSolidPillarsOnMap,
  enforceInteriorPlayFloorSteps,
  finishSecretRoomMap,
  groundYFromMap,
} from "./SecretRoomMapBuild";
import { enforceOnGrid, enforceOnMap } from "./TerrainSolidConnectivity";
import { shouldExpandWest } from "./SecretRoomLayoutPlanner";
import { TILE_DOOR, TILE_EMPTY, TILE_KEYBLOCK, TILE_KEYBLOCK_CONNECTOR, TILE_SOLID, TileMap } from "./TileMap";
import type { TerrainTileBridge } from "../tileset/TerrainTileBridge";
import type { ContextThemeRule } from "../tileset/ContextThemeSubstitution";
import {
  resolvedLadderMouthRowAt,
  resolvedLadderRunwayRowAt,
} from "./VerticalSeamGeometry";
import type { PlacedRoomObject } from "./PlacedRoomObject";
import { WorldPickup } from "./WorldPickup";
import type { DecoStamp } from "../tileset/placeAmbientDeco";
import { placeAmbientDecoClusters } from "../tileset/placeAmbientDeco";
import { resolveBiome } from "../tileset/NormalRoomBiomes";
import type { TilesetProject } from "../tileset/TilesetProject";

export const PLAYER_STAND_SPAWN_H = 18;
const GOLDEN = 0x9e3779b97f4a7c15n;
const SECRET_CONTENT_SEED_SALT = 0x517cc1b727220a95n;

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
  decoStamps: Array<{
    tx: number;
    ty: number;
    tileId: string;
    channel: 0 | 1;
    /** Procedural ARGB tag — required for AmbientClusterMap (red/blue blobs). */
    argb?: number;
    breakableDeco?: boolean;
    groundHugging?: boolean;
  }>;
  /** Pixel-placed props from placedPropsByRoomKind (Java placedRoomObjects). */
  placedRoomObjects: PlacedRoomObject[];
  /** Cached biome terrain bridge for draw (Phase C+). */
  bridge: TerrainTileBridge;
  /** Parsed context theme rules for this room's biome. */
  contextThemeRules?: ContextThemeRule[];
};

/** Deferred secret-room floor loot (spawned on room enter). */
export type DeferredFloorPickup = {
  kind: PickupKind;
  feetCenterX: number;
  feetY: number;
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
  genAmbientDecoStamps?: DecoStamp[];
  /** ITEM / secret pedestal rooms: deferred item id (null until decks resolve). */
  itemPedestal: ItemPedestal | null;
  /** SECRET / SUPER_SECRET deferred floor pickups (spawned on enter; cleared when mounted). */
  deferredFloorPickups: DeferredFloorPickup[];
  /** Phase C+: biome + deco (filled when tileset loads). */
  art?: RoomArtData;
};

/** {@code gridY} below this uses easy 2-tile reach; at/above uses standard 3. */
export const STANDARD_TERRAIN_REACH_FROM_GRID_Y = 4;
export const EASY_TERRAIN_MAX_VERTICAL_REACH_TILES = 2;
export const STANDARD_TERRAIN_MAX_VERTICAL_REACH_TILES = 3;
export const UNKNOWN_DUNGEON_GRID_Y = Number.MAX_SAFE_INTEGER;

/** Max adjacent-column play-floor step for procedural terrain on this dungeon floor. */
export function maxVerticalReachTilesForGridY(gridY: number): number {
  return gridY < STANDARD_TERRAIN_REACH_FROM_GRID_Y
    ? EASY_TERRAIN_MAX_VERTICAL_REACH_TILES
    : STANDARD_TERRAIN_MAX_VERTICAL_REACH_TILES;
}

/** Foot row for shaft finalize — flank runway (not column L). */
export function resolvedLadderShaftFootRowAt(
  map: TileMap,
  ladderTx: number,
  ladderSouth: boolean,
): number {
  return resolvedLadderRunwayRowAt(map, ladderTx, ladderSouth);
}

/**
 * ASCII shell + interior terrain: maxReach steps, GEN-LADDER-1 / platforms,
 * step breakables, pillar/play-floor caps, softlock nav (Java generate subset).
 */
export function generateRoomShell(
  seed: bigint,
  widthTiles: number,
  heightTiles: number,
  conn: RoomConnectivity,
  kind: RoomKind,
  finishOpts?: SecretGenFinishOptions | null,
  gridY: number = UNKNOWN_DUNGEON_GRID_Y,
  decoCtx?: { project: TilesetProject; floorOrdinal: number } | null,
): GeneratedRoom {
  const largeArena = kind === RoomKind.NORMAL || kind === RoomKind.SECRET;
  const w = Math.max(largeArena ? 24 : 10, widthTiles);
  const h = Math.max(largeArena ? 12 : 8, heightTiles);
  const maxReach = maxVerticalReachTilesForGridY(gridY);
  const rng = new JavaRandom(seed ^ GOLDEN);

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

  // PROP-TRAV-1: cap adjacent groundY steps (skip SECRET / SUPER / SHOP).
  if (
    kind !== RoomKind.SECRET &&
    kind !== RoomKind.SUPER_SECRET &&
    kind !== RoomKind.SHOP
  ) {
    enforceMaxWalkableGroundYStep(groundY, maxReach);
  }

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

  // GEN-LADDER-1 / GEN-PLATFORM: random H + floating `-` before dungeon shaft.
  let dungeonLadderTx = conn.ladderColumnTx;
  if (dungeonLadderTx >= 0) dungeonLadderTx = Math.max(3, Math.min(dungeonLadderTx, w - 4));
  const placeRandomLadders = kind === RoomKind.NORMAL;
  const bossEntry = kind === RoomKind.BOSS ? pickBossForFloor(1, seed) : null;
  const possessedBossArena = kind === RoomKind.BOSS && bossEntry?.kind === BossKind.POSSESSED;
  const placeRandomPlatforms = kind === RoomKind.NORMAL || possessedBossArena;
  const dungeonVerticalLink =
    dungeonLadderTx >= 0 && (conn.ladderNorth || conn.ladderSouth);

  for (let x = 3; x < w - 3; x++) {
    if (x === leftDoorX || x === rightDoorX) continue;
    if (dungeonLadderTx >= 0 && x === dungeonLadderTx) continue;
    if (placeRandomLadders) {
      if (rng.nextInt(10) === 0) {
        const gy = clampInt(groundY[x]!, 2, h - 2);
        const ladderH = 3 + rng.nextInt(MAX_PROCEDURAL_LADDER_RUNGS - 2); // 3..6
        for (let y = Math.max(1, gy - ladderH); y <= gy - 1; y++) {
          if (grid[y]![x] === ".") grid[y]![x] = "H";
        }
      }
    }
    if (placeRandomPlatforms) {
      if (rng.nextInt(7) === 0) {
        const gy = clampInt(groundY[x]!, 4, h - 2);
        let py: number;
        if (possessedBossArena) {
          const rise = 1 + rng.nextInt(maxReach);
          py = gy - rise;
        } else {
          py = clampInt(gy - (3 + rng.nextInt(5)), 2, h - 4); // 3..7 above ground
        }
        if (py < 2 || py >= gy - 1) continue;
        const len = rng.nextInt(5) === 0 ? 2 : 3 + rng.nextInt(3);
        const sx = clampInt(x - rng.nextInt(2), 2, w - 3);
        for (let dx = 0; dx < len; dx++) {
          const tx = sx + dx;
          if (tx <= 1 || tx >= w - 2) continue;
          if (dungeonLadderTx >= 0 && tx === dungeonLadderTx) continue;
          if (
            possessedBossArena &&
            !platformReachableFromFloor(tx, py, groundY, w, maxReach)
          ) {
            continue;
          }
          if (grid[py]![tx] === ".") grid[py]![tx] = "-";
        }
      }
    }
  }

  // Optional dungeon ladder shaft — Mega Man–style seam through N/S borders when linked.
  let ladderTx = dungeonLadderTx;
  let ladderFromNorthSpawnX = -1;
  let ladderFromNorthSpawnY = -1;
  let ladderFromSouthSpawnX = -1;
  let ladderFromSouthSpawnY = -1;
  let dungeonLadderFloorRow = -1;
  if (ladderTx >= 0 && (conn.ladderNorth || conn.ladderSouth)) {
    const mouthRow = resolvedLadderRunwayRowOnGrid(
      groundY,
      ladderTx,
      conn.ladderSouth,
    );
    dungeonLadderFloorRow = mouthRow;
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
      // Mouth deck placed later by LadderVerticalSeamAlign (LADDER-MOUTH-2).
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
    stripSpuriousLaddersFromGrid(grid, w, h, ladderTx, groundY);
  }

  // Java: ambient deco on ascii grid before enforce / step breakables, continuing room rng.
  let genAmbientDecoStamps: DecoStamp[] | undefined;
  if (decoCtx?.project) {
    const earlyMap = TileMap.fromAscii(grid.map((row) => row.join("")));
    const biome = resolveBiome(decoCtx.project, kind, seed, decoCtx.floorOrdinal);
    genAmbientDecoStamps = placeAmbientDecoClusters(
      decoCtx.project,
      earlyMap,
      seed,
      biome,
      ladderTx >= 0 ? ladderTx : -1,
      decoCtx.floorOrdinal,
      kind,
      rng,
    );
  }

  if (kind === RoomKind.NORMAL || kind === RoomKind.BOSS || kind === RoomKind.ITEM) {
    enforceOnGrid(grid, w, h, groundY);
  }

  const rows = grid.map((row) => row.join(""));
  const map = TileMap.fromAscii(rows);

  if (kind === RoomKind.NORMAL || kind === RoomKind.BOSS || kind === RoomKind.ITEM) {
    capInteriorSolidPillarsOnMap(
      map,
      ladderTx >= 0 ? ladderTx : -1,
      conn.doorWest ? leftDoorX : -1,
      conn.doorEast ? rightDoorX : -1,
      seed,
      maxReach,
    );
  }

  // Java: only skip mouth platforms when secret seam edges are non-empty (not mere neighborFaces).
  const secretWillFinish = !!(
    finishOpts?.secretSeams && finishOpts.secretSeams.edges.length > 0
  );
  applyLadderSafetyPlatforms(
    map,
    secretWillFinish,
    ladderTx >= 0 ? ladderTx : -1,
    dungeonLadderFloorRow,
    dungeonVerticalLink,
  );

  if (dungeonVerticalLink && ladderTx >= 0) {
    stripSpuriousLaddersFromMap(map, ladderTx, dungeonLadderFloorRow);
  } else if (kind === RoomKind.NORMAL || kind === RoomKind.BOSS) {
    stripSpuriousLaddersFromMap(map, -1);
  }

  enforceOnMap(map);

  // Step-face breakables in generate (not enrich) — NORMAL / BOSS.
  let proceduralBreakables: Array<{ tx: number; ty: number }> = [];
  if (kind === RoomKind.NORMAL || kind === RoomKind.BOSS) {
    proceduralBreakables = placeStepBreakables(map, seed, kind, {
      leftDoorX: conn.doorWest ? leftDoorX : -1,
      rightDoorX: conn.doorEast ? rightDoorX : -1,
      leftDoorTopY,
      rightDoorTopY,
      ladderTx: ladderTx >= 0 ? ladderTx : -1,
      maxReach,
    });
    // Sync grid chars for softlock audit.
    for (const c of proceduralBreakables) {
      if (c.ty >= 0 && c.ty < h && c.tx >= 0 && c.tx < w) {
        grid[c.ty]![c.tx] = "B";
      }
    }
    const groundYFinal = groundYFromMap(map);
    const exitSpec: ExitSpec = {
      doorWest: conn.doorWest,
      doorEast: conn.doorEast,
      leftDoorX,
      rightDoorX,
      leftDoorTopY,
      rightDoorTopY,
      ladderTx: ladderTx >= 0 ? ladderTx : -1,
      ladderFloorRow: dungeonLadderFloorRow,
    };
    proceduralBreakables = auditAndStripIllegalBreakables(
      grid,
      w,
      h,
      groundYFinal,
      exitSpec,
      proceduralBreakables,
      maxReach,
      (tx, ty) => map.setTile(tx, ty, TILE_SOLID),
    );
    void proceduralBreakables;
    capInteriorSolidPillarsOnMap(
      map,
      ladderTx >= 0 ? ladderTx : -1,
      conn.doorWest ? leftDoorX : -1,
      conn.doorEast ? rightDoorX : -1,
      seed,
      maxReach,
    );
    enforceInteriorPlayFloorSteps(
      map,
      conn.doorWest ? leftDoorX : -1,
      conn.doorEast ? rightDoorX : -1,
      ladderTx >= 0 ? ladderTx : -1,
      maxReach,
    );
  }

  if (kind === RoomKind.ITEM) {
    enforceInteriorPlayFloorSteps(
      map,
      conn.doorWest ? leftDoorX : -1,
      conn.doorEast ? rightDoorX : -1,
      ladderTx >= 0 ? ladderTx : -1,
      maxReach,
    );
    const pedestalTx = resolvePedestalTileX(
      w,
      Math.floor(w / 2),
      ladderTx >= 0 ? ladderTx : -1,
      conn.doorWest ? leftDoorX : -1,
      conn.doorEast ? rightDoorX : -1,
    );
    ensureItemPedestalReachable(
      map,
      w,
      h,
      conn,
      ladderTx >= 0 ? ladderTx : -1,
      pedestalTx,
      maxReach,
    );
  }

  const finalGroundY = groundYFromMap(map);
  for (let i = 0; i < finalGroundY.length && i < groundY.length; i++) {
    groundY[i] = finalGroundY[i]!;
  }

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
    genAmbientDecoStamps,
    itemPedestal,
    deferredFloorPickups: [],
  };

  // Java SecretRoomMapBuild.finish — SEC-SHELL-COL-1, padding seal, SUPER flat unify.
  if (finishOpts?.secretSeams || finishOpts?.neighborFaces) {
    finishSecretRoomMap(
      room,
      kind,
      conn,
      finishOpts.secretSeams ?? null,
      finishOpts.neighborFaces ?? null,
      maxReach,
      seed,
    );
    // Post-finish safety: gap-fill / top caps only — mouth deck from reconcile.
    const vertLink = conn.ladderNorth || conn.ladderSouth;
    const lCol = room.ladderColumnTx;
    const liveMouth = lCol >= 0 ? resolvedLadderMouthRowAt(room.map, lCol) : -1;
    applyLadderSafetyPlatforms(room.map, true, lCol, liveMouth, vertLink);
    if (vertLink && lCol >= 0) {
      stripSpuriousLaddersFromMap(room.map, lCol, resolvedLadderMouthRowAt(room.map, lCol));
    } else if (kind === RoomKind.NORMAL || kind === RoomKind.BOSS) {
      stripSpuriousLaddersFromMap(room.map, -1);
    }
    stripPlatformsOnRow(room.map, 1);
    enforceOnMap(room.map);
  }

  return room;
}

/** Re-seat ITEM/secret pedestal on finalized floor height (Java RoomGenerator.regroundItemPedestal). */
export function regroundItemPedestal(g: GeneratedRoom): GeneratedRoom {
  const ped = g.itemPedestal;
  if (!ped) return g;
  const map = g.map;
  const w = map.getWidth();
  const tx = clampInt(Math.floor(ped.anchorX / TILE_SIZE), 1, w - 2);
  const groundY = groundYFromMap(map);
  const groundTop = groundY[tx]! * TILE_SIZE;
  if (Math.abs(groundTop - ped.groundTop) < 0.5) return g;
  g.itemPedestal = {
    ...ped,
    groundTop,
  };
  return g;
}

/**
 * ITEM rooms: west/east door approaches must reach the pedestal column with ≤ maxReach play-floor steps.
 * (Java RoomGenerator.ensureItemPedestalReachable)
 */
function ensureItemPedestalReachable(
  map: TileMap,
  w: number,
  h: number,
  conn: RoomConnectivity,
  ladderTx: number,
  pedestalTx: number,
  maxReach: number,
): void {
  for (let pass = 0; pass < w; pass++) {
    if (itemPedestalReachableFromDoors(map, conn, w, pedestalTx, maxReach)) return;
    const floor = groundYFromMap(map);
    const next = floor.slice();
    enforceMaxWalkableGroundYStep(next, maxReach);
    let changed = false;
    for (let x = 1; x < w - 1; x++) {
      if (next[x] === floor[x]) continue;
      if (ladderTx >= 0 && x === ladderTx) continue;
      applyInteriorPlayFloorColumn(map, x, next[x]!, h);
      changed = true;
    }
    if (!changed) break;
  }
}

function itemPedestalReachableFromDoors(
  map: TileMap,
  conn: RoomConnectivity,
  w: number,
  pedestalTx: number,
  maxReach: number,
): boolean {
  const floor = groundYFromMap(map);
  const westOk = !conn.doorWest || columnReachable(floor, w, 2, pedestalTx, maxReach);
  const eastOk = !conn.doorEast || columnReachable(floor, w, w - 3, pedestalTx, maxReach);
  return westOk && eastOk;
}

function columnReachable(
  floor: number[],
  w: number,
  fromTx: number,
  toTx: number,
  maxReach: number,
): boolean {
  if (fromTx < 1 || fromTx >= w - 1 || toTx < 1 || toTx >= w - 1) return false;
  const seen = new Array<boolean>(w).fill(false);
  const q: number[] = [fromTx];
  seen[fromTx] = true;
  while (q.length > 0) {
    const x = q.shift()!;
    if (x === toTx) return true;
    for (let nx = x - 1; nx <= x + 1; nx++) {
      if (nx < 1 || nx >= w - 1 || seen[nx]) continue;
      if (Math.abs(floor[nx]! - floor[x]!) > maxReach) continue;
      seen[nx] = true;
      q.push(nx);
    }
  }
  return false;
}

/** Rewrite one interior column to floorRow (Java applyInteriorPlayFloorColumn). */
function applyInteriorPlayFloorColumn(
  map: TileMap,
  x: number,
  floorRow: number,
  h: number,
): void {
  for (let y = 1; y < h - 1; y++) {
    const t = map.tileAt(x, y);
    if (t === TILE_DOOR || t === TILE_KEYBLOCK || t === TILE_KEYBLOCK_CONNECTOR) continue;
    map.setTile(x, y, y >= floorRow ? TILE_SOLID : TILE_EMPTY);
  }
}

/**
 * Pickups and pedestals for secret rooms — after terrain post-processing, before enemies.
 * (Java RoomGenerator.applySecretPostGenerationContent)
 */
export function applySecretPostGenerationContent(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
): void {
  for (let id = 0; id < layout.roomCount(); id++) {
    const room = rooms[id];
    if (!room) continue;
    const kind = layout.room(id).kind;
    if (kind !== RoomKind.SECRET && kind !== RoomKind.SUPER_SECRET) continue;
    applySecretPostGenerationContentToRoom(room, layout.room(id).contentSeed, kind);
  }
}

function applySecretPostGenerationContentToRoom(
  g: GeneratedRoom,
  contentSeed: bigint,
  kind: RoomKind,
): void {
  const map = g.map;
  const w = map.getWidth();
  const groundY = groundYFromMap(map);
  const ladderTx = g.ladderColumnTx;
  const rng = new JavaRandom(contentSeed ^ SECRET_CONTENT_SEED_SALT);

  const deferred: DeferredFloorPickup[] = [];
  let itemPedestal: ItemPedestal | null = null;

  if (kind === RoomKind.SECRET) {
    const roll = rng.nextInt(4);
    if (roll === 0) {
      const cx = resolvePedestalTileX(
        w,
        Math.floor(w / 2),
        ladderTx,
        g.leftDoorTileX,
        g.rightDoorTileX,
      );
      const gyc = groundY[clampInt(cx, 1, w - 2)]!;
      const anchorX = cx * TILE_SIZE + TILE_SIZE * 0.5;
      const groundTop = gyc * TILE_SIZE;
      itemPedestal = makeItemPedestal(null, anchorX, groundTop);
    } else if (roll === 1) {
      addPickupCluster(deferred, rng, w, groundY, PickupKind.KEY, 3);
    } else if (roll === 2) {
      addPickupCluster(deferred, rng, w, groundY, PickupKind.HEART, 3);
    } else {
      addPickupCluster(deferred, rng, w, groundY, PickupKind.COIN_1, 10);
    }
  } else if (kind === RoomKind.SUPER_SECRET) {
    deferred.push(...rollSuperSecretLoot(rng, w, groundY));
  }

  g.deferredFloorPickups = deferred;
  if (itemPedestal) g.itemPedestal = itemPedestal;
}

function addPickupCluster(
  out: DeferredFloorPickup[],
  rng: JavaRandom,
  w: number,
  groundY: number[],
  kind: PickupKind,
  count: number,
): void {
  const mid = clampInt(Math.floor(w / 2), 4, w - 5);
  for (let i = 0; i < count; i++) {
    const x = clampInt(mid + (i - Math.floor(count / 2)) * 2 + rng.nextInt(3) - 1, 2, w - 3);
    const gy = groundY[x]!;
    out.push({
      kind,
      feetCenterX: x * TILE_SIZE + TILE_SIZE * 0.5,
      feetY: gy * TILE_SIZE,
    });
  }
}

function rollSuperSecretLoot(
  rng: JavaRandom,
  w: number,
  groundY: number[],
): DeferredFloorPickup[] {
  const out: DeferredFloorPickup[] = [];
  const v = rng.nextInt(8);
  const mid = clampInt(Math.floor(w / 2), 4, w - 5);
  const gy = groundY[mid]!;
  const baseX = mid * TILE_SIZE + TILE_SIZE * 0.5;
  const baseY = gy * TILE_SIZE;
  switch (v) {
    case 0:
      addPickupCluster(out, rng, w, groundY, PickupKind.HEART, 6);
      break;
    case 1:
      addPickupCluster(out, rng, w, groundY, PickupKind.HEART, 3);
      break;
    case 2:
      out.push({ kind: PickupKind.HEART, feetCenterX: baseX, feetY: baseY });
      break;
    case 3:
      addPickupCluster(out, rng, w, groundY, PickupKind.COIN_10, 3);
      break;
    case 4:
      addPickupCluster(out, rng, w, groundY, PickupKind.COIN_1, 6);
      break;
    case 5:
      out.push({ kind: PickupKind.KEY, feetCenterX: baseX, feetY: baseY });
      break;
    case 6:
      addPickupCluster(out, rng, w, groundY, PickupKind.HEART, 3);
      out.push({ kind: PickupKind.KEY, feetCenterX: baseX + 24, feetY: baseY });
      break;
    default:
      out.push({ kind: PickupKind.HEART, feetCenterX: baseX - 16, feetY: baseY });
      out.push({ kind: PickupKind.KEY, feetCenterX: baseX, feetY: baseY });
      addPickupCluster(out, rng, w, groundY, PickupKind.COIN_1, 5);
      break;
  }
  return out;
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

/** Grounded spawn with feet on an explicit floor tile row (Java spawnPxAtFloorRow). */
export function spawnPxAtFloorRow(
  map: TileMap,
  spawnTx: number,
  floorTy: number,
): { x: number; y: number } {
  const tx = Math.max(0, Math.min(spawnTx, map.getWidth() - 1));
  const ty = Math.max(1, Math.min(floorTy, map.getHeight() - 2));
  const groundTop = ty * TILE_SIZE;
  return {
    x: tx * TILE_SIZE,
    y: Math.round(groundTop - PLAYER_STAND_SPAWN_H),
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

/**
 * Safe spawn for INITIAL / missing door metadata (Java defaultSpawnPx).
 * Optional layout: +1 tile east when a one-screen room was xor-widened west toward a secret.
 */
export function defaultSpawnPx(
  g: GeneratedRoom,
  layout?: DungeonLayout | null,
  roomId = -1,
): { x: number; y: number } {
  const w = g.map.getWidth();
  let spawnTx = Math.min(2, Math.max(1, w - 3));
  if (layout != null && roomId >= 0 && wantsSpawnEastOfWestSecretDoor(layout, roomId, g)) {
    spawnTx = Math.min(spawnTx + 1, w - 3);
  }
  return spawnPxAtFloorColumn(g.map, spawnTx);
}

/**
 * Center-of-room grounded spawn for ascending to a new dungeon level
 * (Java levelEntrySpawnPx / finalizeLevelEntrySpawn).
 */
export function levelEntrySpawnPx(g: GeneratedRoom): { x: number; y: number } {
  const w = g.map.getWidth();
  const spawnTx = Math.max(1, Math.min(w - 2, Math.floor(w / 2)));
  return spawnPxAtFloorColumn(g.map, spawnTx);
}

/** Grounded spawn inside a horizontal door frame (Java horizontalDoorSpawnPx). */
export function horizontalDoorSpawnPx(g: GeneratedRoom, fromWest: boolean): { x: number; y: number } {
  if (fromWest) {
    if (g.leftDoorTileX >= 0 && g.leftDoorTopTileY >= 0) {
      return doorFrameSpawnPx(g.map, g.leftDoorTileX, g.leftDoorTopTileY);
    }
  } else if (g.rightDoorTileX >= 0 && g.rightDoorTopTileY >= 0) {
    return doorFrameSpawnPx(g.map, g.rightDoorTileX, g.rightDoorTopTileY);
  }
  return defaultSpawnPx(g);
}

/** Feet on doorTop+2 play floor, X = door column (Java doorFrameSpawnPx). */
function doorFrameSpawnPx(
  map: TileMap,
  doorTileX: number,
  doorTopTileY: number,
): { x: number; y: number } {
  if (doorTopTileY >= 0) {
    const floorRow = Math.min(doorTopTileY + 2, map.getHeight() - 2);
    return spawnPxAtFloorRow(map, doorTileX, floorRow);
  }
  return spawnPxAtFloorColumn(map, doorTileX);
}

/** Java wantsSpawnEastOfWestSecretDoor — INITIAL pad shifts east of xor-widened west secret door. */
function wantsSpawnEastOfWestSecretDoor(
  layout: DungeonLayout,
  roomId: number,
  g: GeneratedRoom,
): boolean {
  if (!isOneScreenRoomKind(layout.room(roomId).kind)) return false;
  if (!layout.room(roomId).doorWest || g.leftDoorTileX < 0) return false;
  if (!shouldExpandWest(layout, roomId)) return false;
  const westId = layout.neighborWest(roomId);
  if (westId < 0) return false;
  const wk = layout.room(westId).kind;
  return wk === RoomKind.SECRET || wk === RoomKind.SUPER_SECRET;
}

/** PROP-TRAV-1 / ASCII-TRAV-1: no column may jump more than maxStep tiles. */
function enforceMaxWalkableGroundYStep(groundY: number[], maxStep: number): void {
  const w = groundY.length;
  for (let pass = 0; pass < w; pass++) {
    let changed = false;
    for (let x = 1; x < w; x++) {
      if (groundY[x]! - groundY[x - 1]! > maxStep) {
        groundY[x] = groundY[x - 1]! + maxStep;
        changed = true;
      }
      if (groundY[x - 1]! - groundY[x]! > maxStep) {
        groundY[x - 1] = groundY[x]! + maxStep;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function platformReachableFromFloor(
  tx: number,
  py: number,
  groundY: number[],
  w: number,
  maxReach: number,
): boolean {
  const lo = Math.max(1, tx - 1);
  const hi = Math.min(w - 2, tx + 1);
  for (let c = lo; c <= hi; c++) {
    const floor = groundY[c]!;
    if (floor - py >= 1 && floor - py <= maxReach) return true;
  }
  return false;
}

function resolvedLadderRunwayRowOnGrid(
  groundY: number[],
  ladderTx: number,
  ladderSouth: boolean,
): number {
  if (ladderTx < 1) return 1;
  const l = Math.max(1, Math.min(ladderTx, groundY.length - 2));
  const left = flankPlayFloorRow(groundY, l - 1);
  const right = flankPlayFloorRow(groundY, l + 1);
  if (left !== right) {
    return ladderSouth ? Math.max(left, right) : Math.min(left, right);
  }
  return left;
}

function flankPlayFloorRow(groundY: number[], flankTx: number): number {
  if (groundY.length === 0) return 1;
  const col = Math.max(1, Math.min(flankTx, groundY.length - 2));
  return groundY[col]!;
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

/**
 * Thin mount hook: push deferred secret floor pickups into the live world list on room enter.
 * Pedestal is already on GeneratedRoom.itemPedestal (resolved via existing resolvePedestal).
 * Call after worldPickups is cleared for the new room.
 */
export function mountDeferredRoomPickups(
  room: GeneratedRoom,
  worldPickups: WorldPickup[],
): void {
  for (const d of room.deferredFloorPickups) {
    worldPickups.push(WorldPickup.createFromDeferred(d.kind, d.feetCenterX, d.feetY));
  }
  room.deferredFloorPickups = [];
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
