import type { Player } from "../entity/Player";
import type { Input } from "../input/Input";
import { Crawler } from "../entity/Crawler";
import { GoldenRoach } from "../entity/GoldenRoach";
import { Mouse } from "../entity/Mouse";
import { Penisman } from "../entity/Penisman";
import { Possessed } from "../entity/Possessed";
import { Nephilim } from "../entity/Nephilim";
import type { CombatEnemy } from "../entity/CombatEnemy";
import type { ShopKeeper } from "../entity/ShopKeeper";
import { aabbOverlap } from "../combat/CombatMath";
import { CLIMB_ANIM_FPS, VERNAN_CLIMB_FRAMES } from "../config/AnimStats";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { PedestalItemDecks } from "../item/PedestalItemDecks";
import { ItemEffects } from "../item/effect/ItemEffects";
import type { ItemPickupHost } from "../item/effect/ItemPickupHost";
import type { BrickChunk } from "../fx/BrickChunk";
import { CAMERA_ZOOM, FIXED_DT, HUD_HEIGHT, INTERNAL_HEIGHT, TILE_SIZE } from "../specs";
import type { WorldCamera } from "../camera/WorldCamera";
import { buildDungeon, type BuiltDungeon } from "./buildDungeon";
import { clustersForRoom } from "./EnemySpawnBudget";
import {
  makeItemPedestal,
  pedestalItemAabb,
  resolvePedestalTileX,
  type ItemPedestal,
} from "./pedestal";
import {
  defaultSpawnPx,
  horizontalDoorSpawnPx,
  levelEntrySpawnPx,
  PLAYER_STAND_SPAWN_H,
  type GeneratedRoom,
} from "./RoomGenerator";
import {
  beginFadeInAfterAscend,
  beginFadeInAfterSwap,
  beginLevelLoadBlack,
  createRoomTransitionState,
  isRoomTransitionActive,
  markLevelAscendFloorApplied,
  startHorizontalDoorTransition,
  startNextLevelAscend,
  startVerticalRoomTransition,
  tickRoomTransition,
  type RoomTransitionState,
} from "./roomFade";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_KEYBLOCK,
  TILE_KEYBLOCK_CONNECTOR,
  TILE_LADDER,
  TILE_SOLID,
  type TileMap,
} from "./TileMap";
import { RoomKind } from "./DungeonTypes";
import { BossDoorSealAnim, packCell } from "./BossDoorSealAnim";
import { injectBossExitLadder } from "./BossAscend";
import {
  bossRoomHasPossessed,
  pickPossessedSpecialReward,
} from "../item/possessedBossReward";
import { clearEntrancesOnItemOrShopEnter } from "./KeyblockBypass";
import {
  createKeyblockTickState,
  type KeyblockTickState,
} from "./KeyblockTick";
import { onRoomEntered } from "./SecretEntrancePlacer";
import { resolvedLadderRunwayRowAt } from "./VerticalSeamGeometry";

export enum SpawnKind {
  INITIAL = 0,
  FROM_WEST = 1,
  FROM_EAST = 2,
  FROM_ABOVE = 3,
  FROM_BELOW = 4,
}

/** North edge: bbox top within one tile of map top (Java LADDER_TRANSITION_NORTH_EDGE_PX). */
const LADDER_TRANSITION_NORTH_EDGE_PX = TILE_SIZE;

export type RoomSession = {
  dungeon: BuiltDungeon;
  roomId: number;
  enemies: CombatEnemy[];
  catalog: ItemCatalog;
  decks: PedestalItemDecks;
  /** Per-room: combat clear already processed (no respawn). */
  roomCombatCleared: boolean[];
  /** Enemies that counted for clear when this room was last spawned. */
  roomSpawnEnemyCount: number;
  /** BOSS clear reward pedestals (separate from ITEM room pedestals). */
  bossClearPedestals: (ItemPedestal | null)[];
  /** SHOP priced pedestals (lazy-resolved; separate from free ITEM/boss). */
  shopPedestals: (ItemPedestal[] | null)[];
  /** SHOP cat shopkeep (lazy with pedestals). */
  shopKeepers: (ShopKeeper | null)[];
  /** Sealed door cells per room (packCell keys). */
  bossDoorSealedCells: (Set<number> | null)[];
  /** Ascend ladder column per room (-1 = none). */
  bossAscendLadderTx: number[];
  activeBossDoorSealAnim: BossDoorSealAnim | null;
  /** Shared fade / door-pose machine. */
  transition: RoomTransitionState;
  /** Keyblock seal runtimes + unlock freeze (Java roomKeyblockRuntimes). */
  keyblocks: KeyblockTickState;
  /** Sim time for pedestal bob. */
  timeSec: number;
  lastPickupName: string | null;
  lastPickupTimer: number;
  /** Per-room brick debris persistence (Java roomPersistedBrickChunks). */
  roomPersistedBrickChunks: (BrickChunk[] | null)[];
};

export function createSession(
  dungeon: BuiltDungeon,
  catalog: ItemCatalog,
  decks: PedestalItemDecks,
): RoomSession {
  const n = dungeon.layout.roomCount();
  return {
    dungeon,
    roomId: 0,
    enemies: [],
    catalog,
    decks,
    roomCombatCleared: new Array(n).fill(false),
    roomSpawnEnemyCount: 0,
    bossClearPedestals: new Array(n).fill(null),
    shopPedestals: new Array(n).fill(null),
    shopKeepers: new Array(n).fill(null),
    bossDoorSealedCells: new Array(n).fill(null),
    bossAscendLadderTx: new Array(n).fill(-1),
    activeBossDoorSealAnim: null,
    transition: createRoomTransitionState(),
    keyblocks: createKeyblockTickState(dungeon.roomKeyblockSeals, n),
    timeSec: 0,
    lastPickupName: null,
    lastPickupTimer: 0,
    roomPersistedBrickChunks: new Array(n).fill(null),
  };
}

export function persistRoomBrickChunks(
  session: RoomSession,
  fromRoomId: number,
  chunks: BrickChunk[],
): void {
  if (fromRoomId < 0 || fromRoomId >= session.roomPersistedBrickChunks.length) return;
  session.roomPersistedBrickChunks[fromRoomId] = [...chunks];
}

export function loadRoomBrickChunks(session: RoomSession, roomId: number): BrickChunk[] {
  if (roomId < 0 || roomId >= session.roomPersistedBrickChunks.length) return [];
  const saved = session.roomPersistedBrickChunks[roomId];
  return saved ? [...saved] : [];
}

/** Rebuild session arrays for a new floor dungeon (keeps decks / catalog). */
export function rebindSessionToDungeon(session: RoomSession, dungeon: BuiltDungeon): void {
  const n = dungeon.layout.roomCount();
  session.dungeon = dungeon;
  session.roomId = 0;
  session.enemies = [];
  session.roomCombatCleared = new Array(n).fill(false);
  session.roomSpawnEnemyCount = 0;
  session.bossClearPedestals = new Array(n).fill(null);
  session.shopPedestals = new Array(n).fill(null);
  session.shopKeepers = new Array(n).fill(null);
  session.bossDoorSealedCells = new Array(n).fill(null);
  session.bossAscendLadderTx = new Array(n).fill(-1);
  session.activeBossDoorSealAnim = null;
  session.transition = createRoomTransitionState();
  session.keyblocks = createKeyblockTickState(dungeon.roomKeyblockSeals, n);
  session.decks.beginDungeonLevel();
  session.roomPersistedBrickChunks = new Array(n).fill(null);
}

export function applyRoomAndSpawn(
  session: RoomSession,
  roomId: number,
  spawnKind: SpawnKind,
  player: Player,
): void {
  session.roomId = roomId;
  const g = session.dungeon.rooms[roomId]!;
  const layout = session.dungeon.layout;
  resolvePedestal(session, g);
  // Spawn helpers return player top-left (groundTop − standH), matching Java player.x/y.
  if (spawnKind === SpawnKind.FROM_WEST) {
    const spawn = horizontalDoorSpawnPx(g, true);
    player.spawnAt(spawn.x, spawn.y + PLAYER_STAND_SPAWN_H);
  } else if (spawnKind === SpawnKind.FROM_EAST) {
    const spawn = horizontalDoorSpawnPx(g, false);
    player.spawnAt(spawn.x, spawn.y + PLAYER_STAND_SPAWN_H);
  } else if (spawnKind === SpawnKind.FROM_ABOVE) {
    if (g.ladderFromNorthSpawnX >= 0) {
      player.spawnAtWorld(g.ladderFromNorthSpawnX, g.ladderFromNorthSpawnY, true);
    } else {
      const spawn = defaultSpawnPx(g, layout, roomId);
      player.spawnAt(spawn.x, spawn.y + PLAYER_STAND_SPAWN_H);
    }
  } else if (spawnKind === SpawnKind.FROM_BELOW) {
    if (g.ladderFromSouthSpawnX >= 0) {
      player.spawnAtWorld(g.ladderFromSouthSpawnX, g.ladderFromSouthSpawnY, true);
    } else {
      const spawn = defaultSpawnPx(g, layout, roomId);
      player.spawnAt(spawn.x, spawn.y + PLAYER_STAND_SPAWN_H);
    }
  } else {
    // INITIAL: floor 2+ start room uses center level-entry pad (Java spawnPlayerAtDefault).
    const spawn =
      session.dungeon.floorOrdinal > 1 && roomId === 0
        ? levelEntrySpawnPx(g)
        : defaultSpawnPx(g, layout, roomId);
    player.spawnAt(spawn.x, spawn.y + PLAYER_STAND_SPAWN_H);
  }
  session.enemies = spawnEnemiesForRoom(session);
  maybeBeginBossDoorSealAnim(session);
}

function resolvePedestal(
  session: RoomSession,
  g: { itemPedestal: { itemId: string | null; collected: boolean } | null },
): void {
  const p = g.itemPedestal;
  if (!p || p.collected) return;
  if (p.itemId == null) {
    const kind = session.dungeon.layout.room(session.roomId).kind;
    p.itemId =
      kind === RoomKind.SECRET || kind === RoomKind.SUPER_SECRET
        ? session.decks.drawSecret()
        : session.decks.drawItemRoom();
  }
}

function spawnEnemiesForRoom(session: RoomSession): CombatEnemy[] {
  session.roomSpawnEnemyCount = 0;
  const roomId = session.roomId;
  if (session.roomCombatCleared[roomId]) {
    return [];
  }
  const g = session.dungeon.rooms[roomId]!;
  const node = session.dungeon.layout.room(roomId);
  const clusters = clustersForRoom(g, node.contentSeed);
  const out: CombatEnemy[] = [];
  for (const s of g.enemySpawns) {
    if (s.countsForRoomClear) session.roomSpawnEnemyCount++;
    if (s.kind === "crawler") {
      out.push(new Crawler(s.xPx, s.yPx, s.maxHealth));
    } else if (s.kind === "mouse") {
      out.push(new Mouse(s.xPx, s.yPx, s.maxHealth));
    } else if (s.kind === "penisman") {
      out.push(new Penisman(s.xPx, s.yPx, s.maxHealth));
    } else if (s.kind === "golden_roach") {
      out.push(new GoldenRoach(s.xPx, s.yPx, s.maxHealth, clusters));
    } else if (s.kind === "possessed") {
      const boss = new Possessed(s.xPx, s.yPx, s.maxHealth, s.variantId);
      boss.bindRoom(g.map);
      out.push(boss);
    } else if (s.kind === "nephilim") {
      const boss = new Nephilim(s.xPx, s.yPx, s.maxHealth);
      boss.bindRoom(g.map);
      out.push(boss);
    }
  }
  return out;
}

function anyEnemyBlocksRoomClear(session: RoomSession): boolean {
  for (const e of session.enemies) {
    if (e.blocksRoomClear()) return true;
  }
  return false;
}

function maybeBeginBossDoorSealAnim(session: RoomSession): void {
  const roomId = session.roomId;
  const node = session.dungeon.layout.room(roomId);
  if (node.kind !== RoomKind.BOSS) return;
  if (session.roomCombatCleared[roomId]) return;
  const existing = session.bossDoorSealedCells[roomId];
  if (existing && existing.size > 0) return;
  if (session.activeBossDoorSealAnim?.roomId === roomId) return;
  const g = session.dungeon.rooms[roomId]!;
  const anim = BossDoorSealAnim.begin(
    roomId,
    g.leftDoorTileX,
    g.leftDoorTopTileY,
    g.rightDoorTileX,
    g.rightDoorTopTileY,
  );
  if (!anim) return;
  session.activeBossDoorSealAnim = anim;
  if (!session.bossDoorSealedCells[roomId]) {
    session.bossDoorSealedCells[roomId] = new Set();
  }
}

/** Advance seal stagger (call once per fixed step while in boss room). */
export function tickBossDoorSealAnim(session: RoomSession): void {
  const anim = session.activeBossDoorSealAnim;
  if (!anim || anim.roomId !== session.roomId) return;
  let sealed = session.bossDoorSealedCells[session.roomId];
  if (!sealed) {
    sealed = new Set();
    session.bossDoorSealedCells[session.roomId] = sealed;
  }
  if (anim.tick(sealed)) {
    session.activeBossDoorSealAnim = null;
  }
}

function releaseBossDoorSealIfRoomClear(session: RoomSession): void {
  const roomId = session.roomId;
  const node = session.dungeon.layout.room(roomId);
  if (node.kind !== RoomKind.BOSS) return;
  if (anyEnemyBlocksRoomClear(session)) return;
  const sealed = session.bossDoorSealedCells[roomId];
  if (!sealed || sealed.size === 0) return;
  sealed.clear();
  if (session.activeBossDoorSealAnim?.roomId === roomId) {
    session.activeBossDoorSealAnim = null;
  }
}

function isBossExitDoorSealed(session: RoomSession, doorTx: number): boolean {
  const roomId = session.roomId;
  const sealed = session.bossDoorSealedCells[roomId];
  if (!sealed || sealed.size === 0 || doorTx < 0) return false;
  const g = session.dungeon.rooms[roomId]!;
  return BossDoorSealAnim.isDoorColumnSealed(
    sealed,
    doorTx,
    g.leftDoorTileX,
    g.leftDoorTopTileY,
    g.rightDoorTileX,
    g.rightDoorTopTileY,
  );
}

/** True if (tx,ty) is currently sealed for draw. */
export function isBossDoorCellSealed(session: RoomSession, tx: number, ty: number): boolean {
  const sealed = session.bossDoorSealedCells[session.roomId];
  if (!sealed) return false;
  return sealed.has(packCell(tx, ty));
}

/** Mark room cleared + spawn BOSS_CLEAR pedestal when appropriate. */
export function tryProcessRoomClear(session: RoomSession, player: Player): void {
  const roomId = session.roomId;
  if (anyEnemyBlocksRoomClear(session)) return;
  if (session.roomCombatCleared[roomId]) {
    tryGrantBossRoomClearLoot(session, player);
    return;
  }
  if (session.roomSpawnEnemyCount <= 0) return;
  session.roomCombatCleared[roomId] = true;
  ItemEffects.onRoomCleared({ player }, player.inventory);
  tryGrantBossRoomClearLoot(session, player);
}

function tryGrantBossRoomClearLoot(session: RoomSession, player: Player): void {
  const roomId = session.roomId;
  const node = session.dungeon.layout.room(roomId);
  if (node.kind !== RoomKind.BOSS) return;
  if (anyEnemyBlocksRoomClear(session)) return;
  releaseBossDoorSealIfRoomClear(session);
  if (session.bossAscendLadderTx[roomId]! >= 0) {
    if (!session.bossClearPedestals[roomId]) {
      spawnBossRoomClearPedestal(session, player, false);
    }
    return;
  }
  spawnBossRoomClearPedestal(session, player, true);
}

function spawnBossRoomClearPedestal(
  session: RoomSession,
  player: Player,
  injectLadder: boolean,
): void {
  const roomId = session.roomId;
  const g = session.dungeon.rooms[roomId]!;
  const map = g.map;
  const w = map.getWidth();
  const playerCx = player.x + player.w * 0.5;
  const roomMid = w * TILE_SIZE * 0.5;
  const preferTx = Math.floor(
    (playerCx < roomMid ? roomMid + w * TILE_SIZE * 0.25 : roomMid - w * TILE_SIZE * 0.25) /
      TILE_SIZE,
  );
  const tx = resolvePedestalTileX(
    w,
    preferTx,
    g.ladderColumnTx,
    g.leftDoorTileX,
    g.rightDoorTileX,
  );
  const groundTop = map.groundTopWorldYAtColumn(tx);
  const anchorX = tx * TILE_SIZE + TILE_SIZE * 0.5;
  if (!session.bossClearPedestals[roomId]) {
    let itemId: string | null = null;
    if (bossRoomHasPossessed(g.enemySpawns)) {
      const node = session.dungeon.layout.room(roomId);
      itemId = pickPossessedSpecialReward(player.inventory, node.contentSeed);
      if (itemId) {
        // Reserve on decks (Java commitAssigned); collect path markAcquired.
        session.decks.commitAssigned(itemId);
      }
    }
    if (!itemId) itemId = session.decks.drawBossClear();
    session.bossClearPedestals[roomId] = makeItemPedestal(itemId, anchorX, groundTop);
  }
  if (injectLadder) {
    session.bossAscendLadderTx[roomId] = injectBossExitLadder(
      map,
      tx,
      g.ladderColumnTx,
      g.leftDoorTileX,
      g.rightDoorTileX,
      session.bossAscendLadderTx[roomId]!,
    );
  }
}

/** Active pedestal for current room (ITEM or boss-clear). */
export function activePedestal(session: RoomSession): ItemPedestal | null {
  const boss = session.bossClearPedestals[session.roomId];
  if (boss) return boss;
  return session.dungeon.rooms[session.roomId]!.itemPedestal;
}

/**
 * Touch-collect free pedestal (ITEM room or boss clear).
 * @returns collected item id, or null.
 */
export function tryCollectPedestal(
  session: RoomSession,
  player: Player,
  host: ItemPickupHost,
): string | null {
  const p = activePedestal(session);
  if (!p || p.collected || !p.itemId) return null;
  const itemBox = pedestalItemAabb(p, session.timeSec);
  if (!itemBox) return null;
  if (!aabbOverlap(player.hurtbox(), itemBox)) return null;

  const id = p.itemId;
  player.collectItem(id, session.catalog, host);
  session.decks.markAcquired(id);
  p.collected = true;
  return id;
}

export type AscendFloorHooks = {
  /** After next floor is built + spawned (during blackout). */
  onFloorApplied?: () => void;
  /** Device-space feet Y / center X for level-trans overlay anchors. */
  screenAnchor: (player: Player, camera: WorldCamera) => { feetY: number; centerX: number };
};

/**
 * Advance fade / ascend machine one fixed tick.
 * Returns true while the player/enemies should stay frozen.
 */
export function tickSessionRoomTransition(
  session: RoomSession,
  player: Player,
  input: Input,
  camera: WorldCamera,
  onRoomSwapped?: () => void,
  ascendHooks?: AscendFloorHooks,
): boolean {
  if (!isRoomTransitionActive(session.transition)) return false;
  const t = session.transition;
  const result = tickRoomTransition(t, FIXED_DT, CLIMB_ANIM_FPS, VERNAN_CLIMB_FRAMES);

  if (result === "swap") {
    applyRoomAndSpawn(
      session,
      t.pendingRoomId,
      t.pendingSpawnKind as SpawnKind,
      player,
    );
    beginFadeInAfterSwap(t);
    input.clearHardwareStateForRoomTransition();
    onRoomSwapped?.();
  } else if (result === "ascend_black") {
    const live = ascendHooks?.screenAnchor(player, camera);
    if (live) {
      t.levelAscend.startFeetScreenY = live.feetY;
      t.levelAscend.startCenterScreenX = live.centerX;
    }
    beginLevelLoadBlack(t);
    input.clearHardwareStateForRoomTransition();
  } else if (result === "ascend_apply" && !t.levelAscend.newFloorApplied) {
    applyNextFloorAscend(session, player);
    // Java finalizeLevelEntrySpawn: face right for climb/strip draw.
    player.facing = 1;
    // Camera/art must refresh before end-screen anchors are sampled.
    ascendHooks?.onFloorApplied?.();
    const end = ascendHooks?.screenAnchor(player, camera) ?? {
      feetY: t.levelAscend.startFeetScreenY,
      centerX: t.levelAscend.startCenterScreenX,
    };
    markLevelAscendFloorApplied(t, end.feetY, end.centerX);
  } else if (result === "ascend_fade_in") {
    beginFadeInAfterAscend(t);
    input.clearHardwareStateForRoomTransition();
  }

  return isRoomTransitionActive(t);
}

/** Rebuild dungeon at next floor and spawn at INITIAL (boss ascend). */
export function applyNextFloorAscend(session: RoomSession, player: Player): void {
  // Preserve fade/blackout machine across rebind (Java keeps LEVEL_LOAD_BLACK).
  const savedTransition = session.transition;
  const nextFloor = session.dungeon.floorOrdinal + 1;
  const next = buildDungeon(session.dungeon.runSeed, nextFloor);
  rebindSessionToDungeon(session, next);
  session.transition = savedTransition;
  applyRoomAndSpawn(session, 0, SpawnKind.INITIAL, player);
  finalizeLevelEntrySpawn(session, player);
}

/**
 * Java finalizeLevelEntrySpawn — re-snap to center column + face right after next-floor apply.
 */
function finalizeLevelEntrySpawn(session: RoomSession, player: Player): void {
  const g = session.dungeon.rooms[0]!;
  const spawn = levelEntrySpawnPx(g);
  const map = g.map;
  const spawnTx = Math.max(0, Math.min(map.getWidth() - 1, Math.floor(spawn.x / TILE_SIZE)));
  const groundTop = map.groundTopWorldYAtColumn(spawnTx);
  player.spawnAt(spawnTx * TILE_SIZE, groundTop);
  player.facing = 1;
}

/** Try horizontal door (Up/W edge) — starts fade; does not swap immediately. */
export function tryDoorTransition(
  session: RoomSession,
  player: Player,
  input: Input,
): boolean {
  if (isRoomTransitionActive(session.transition)) return false;
  if (!player.onGround) return false;
  if (!input.wasPressed("ArrowUp") && !input.wasPressed("KeyW")) return false;

  const g = session.dungeon.rooms[session.roomId]!;
  const map = g.map;
  const layout = session.dungeon.layout;

  const leftTile = Math.floor((player.left() + 0.001) / TILE_SIZE);
  const rightTile = Math.floor((player.right() - 0.001) / TILE_SIZE);
  const topTile = Math.floor((player.top() + 0.001) / TILE_SIZE);
  const bottomTile = Math.floor((player.bottom() - 0.001) / TILE_SIZE);

  let hitLeft = false;
  let hitRight = false;
  for (let ty = topTile; ty <= bottomTile; ty++) {
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (map.tileAt(tx, ty) !== TILE_DOOR) continue;
      if (tx === g.leftDoorTileX || tx <= 1) hitLeft = true;
      if (tx === g.rightDoorTileX || tx >= map.getWidth() - 2) hitRight = true;
    }
  }

  if (hitRight) {
    if (isBossExitDoorSealed(session, g.rightDoorTileX)) return false;
    const east = layout.neighborEast(session.roomId);
    if (east >= 0) {
      input.consumePress("ArrowUp");
      input.consumePress("KeyW");
      input.clearHardwareStateForRoomTransition();
      startHorizontalDoorTransition(session.transition, east, SpawnKind.FROM_WEST);
      return true;
    }
  }
  if (hitLeft) {
    if (isBossExitDoorSealed(session, g.leftDoorTileX)) return false;
    const west = layout.neighborWest(session.roomId);
    if (west >= 0) {
      input.consumePress("ArrowUp");
      input.consumePress("KeyW");
      input.clearHardwareStateForRoomTransition();
      startHorizontalDoorTransition(session.transition, west, SpawnKind.FROM_EAST);
      return true;
    }
  }
  return false;
}

/**
 * Inter-room ladder transition (hold Up/Down at shaft edges).
 * Prefers boss ascend when that shaft is active.
 */
export function tryLadderTransition(
  session: RoomSession,
  player: Player,
  input: Input,
  camera: WorldCamera,
): boolean {
  if (isRoomTransitionActive(session.transition)) return false;

  // Boss ascend takes priority (Java tryBossAscendToNextLevel first).
  if (tryAscendTransition(session, player, input, camera)) return true;

  const roomId = session.roomId;
  const node = session.dungeon.layout.room(roomId);
  const g = session.dungeon.rooms[roomId]!;
  const L = g.ladderColumnTx;
  if (L < 0) return false;
  if (!player.overlapsLadderColumn(g.map, L)) return false;

  const wantDown = input.down && !input.up;
  const wantUp = input.up;

  if (wantDown && node.ladderSouth && playerNearRoomSouthEdge(player, camera)) {
    if (!southLadderMouthAllowsTransition(g, L)) return false;
    if (southLadderPathBlockedByKeyblock(g.map, L, player)) return false;
    const south = session.dungeon.layout.neighborSouth(roomId);
    if (south >= 0) {
      input.clearHardwareStateForRoomTransition();
      startVerticalRoomTransition(session.transition, south, SpawnKind.FROM_ABOVE);
      return true;
    }
  }
  if (wantUp && node.ladderNorth && playerNearRoomNorthEdge(player)) {
    if (!northLadderSeamOpenAtTop(g, L)) return false;
    if (northLadderPathBlockedByKeyblock(g.map, L, player)) return false;
    const north = session.dungeon.layout.neighborNorth(roomId);
    if (north >= 0) {
      input.clearHardwareStateForRoomTransition();
      startVerticalRoomTransition(session.transition, north, SpawnKind.FROM_BELOW);
      return true;
    }
  }
  return false;
}

function playerNearRoomNorthEdge(player: Player): boolean {
  return player.top() <= LADDER_TRANSITION_NORTH_EDGE_PX;
}

/** Feet in device space at/below HUD top (Java playerNearRoomSouthEdge). */
function playerNearRoomSouthEdge(player: Player, camera: WorldCamera): boolean {
  const feetWorldY = player.bottom();
  const feetDevY = Math.round(CAMERA_ZOOM * feetWorldY + camera.ty);
  const hudMinDeviceY = INTERNAL_HEIGHT - HUD_HEIGHT;
  return feetDevY >= hudMinDeviceY;
}

function northLadderSeamOpenAtTop(g: GeneratedRoom, L: number): boolean {
  const t = g.map.tileAt(L, 0);
  return t === TILE_EMPTY || t === TILE_LADDER;
}

function southLadderMouthAllowsTransition(g: GeneratedRoom, L: number): boolean {
  const h = g.map.getHeight();
  const runwayRow = resolvedLadderRunwayRowAt(g.map, L, true);
  if (runwayRow < 1 || runwayRow >= h - 1) return false;
  const t = g.map.tileAt(L, runwayRow);
  return (
    t !== TILE_SOLID &&
    t !== TILE_BREAKABLE &&
    t !== TILE_KEYBLOCK &&
    t !== TILE_KEYBLOCK_CONNECTOR
  );
}

/** Uncleared K/k between room top and player top blocks climbing north. */
function northLadderPathBlockedByKeyblock(map: TileMap, ladderTx: number, player: Player): boolean {
  if (ladderTx < 0) return false;
  let maxTy = Math.floor(player.hitboxPose().bounds().y / TILE_SIZE);
  maxTy = Math.min(Math.max(maxTy, 1), map.getHeight() - 2);
  for (let ty = 1; ty <= maxTy; ty++) {
    const t = map.tileAt(ladderTx, ty);
    if (t === TILE_KEYBLOCK || t === TILE_KEYBLOCK_CONNECTOR) return true;
  }
  return false;
}

/** Uncleared K/k from player feet down the shaft blocks dropping south. */
function southLadderPathBlockedByKeyblock(map: TileMap, ladderTx: number, player: Player): boolean {
  if (ladderTx < 0) return false;
  const b = player.hitboxPose().bounds();
  let minTy = Math.floor((b.y + b.h) / TILE_SIZE);
  minTy = Math.min(Math.max(minTy, 1), map.getHeight() - 2);
  for (let ty = minTy; ty <= map.getHeight() - 2; ty++) {
    const t = map.tileAt(ladderTx, ty);
    if (t === TILE_KEYBLOCK || t === TILE_KEYBLOCK_CONNECTOR) return true;
  }
  return false;
}

/**
 * After a room swap completes: open secret seam face + free ITEM/SHOP keyblock bypass.
 */
export function onRoomEnteredWithKeyblockBypass(
  session: RoomSession,
  fromRoom: number,
  toRoom: number,
  spawnKind: number,
): void {
  onRoomEntered(
    session.dungeon.layout,
    session.dungeon.rooms,
    session.dungeon.secretSeams,
    fromRoom,
    toRoom,
    spawnKind,
  );
  clearEntrancesOnItemOrShopEnter(
    session.dungeon.layout,
    session.dungeon.roomKeyblockSeals,
    session.keyblocks.runtimesByRoom,
    session.dungeon.rooms,
    toRoom,
    session.dungeon.floorOrdinal,
  );
}

/**
 * Climb boss ascend shaft near the ceiling → start fade + blackout cinematic.
 * Does not rebuild the floor immediately (Java startNextLevelAscend).
 */
export function tryAscendTransition(
  session: RoomSession,
  player: Player,
  input: Input,
  camera: WorldCamera,
): boolean {
  if (isRoomTransitionActive(session.transition)) return false;
  const roomId = session.roomId;
  const node = session.dungeon.layout.room(roomId);
  if (node.kind !== RoomKind.BOSS) return false;
  const exitTx = session.bossAscendLadderTx[roomId] ?? -1;
  if (exitTx < 0) return false;
  if (!input.up) return false;
  const map = session.dungeon.rooms[roomId]!.map;
  if (!player.overlapsLadderColumn(map, exitTx)) return false;
  // Near north edge (Java playerNearRoomNorthEdge ≤ TILE_SIZE).
  if (player.top() > LADDER_TRANSITION_NORTH_EDGE_PX) return false;

  const feetY = Math.round(CAMERA_ZOOM * player.spriteFeetWorldY() + camera.ty);
  const centerX = Math.round(CAMERA_ZOOM * (player.x + player.w * 0.5) + camera.tx);
  input.clearHardwareStateForRoomTransition();
  startNextLevelAscend(session.transition, feetY, centerX);
  return true;
}

export {
  DoorTransitionPose,
  TransitionPhase,
  drawRoomFade,
  isRoomTransitionActive,
  roomFadeAlpha,
  levelAscendDrawAnchor,
  levelAscendUsesClimbDraw,
  levelTransStripHandoffAdjustDevY,
  LEVEL_TRANS_FEET_ROW_WORLD_PX,
  LEVEL_TRANS_SHEET_FRAMES,
} from "./roomFade";
export type { RoomTransitionState };
