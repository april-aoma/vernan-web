import { BossKind, pickBossForFloor } from "../boss/BossRegistry";
import { getNephilimRig } from "../boss/NephilimRig";
import { Nephilim } from "../entity/Nephilim";
import {
  possessedHpForVariant,
  rollPossessedVariant,
} from "../combat/EnemyVariantRegistry";
import {
  baseMaxHealth,
  eligibleForNormalRoom,
  eligibleForSecretRoom,
  pickWeighted,
  spawnCost,
  spawnPlacement,
  type ChallengeSpawnKind,
} from "../combat/EnemyChallengeRegistry";
import { JavaRandom } from "../util/JavaRandom";
import {
  CRAWLER_MAX_HP,
  CRAWLER_SPAWN_H,
  GOLDEN_ROACH_SPAWN_H,
  GOLDEN_ROACH_SPAWN_W,
  JACK_BLUE_SPAWN_H,
  MULTILIMBER_SPAWN_H,
  MOUSE_SPAWN_H,
  PENISMAN_SPAWN_H,
  ROLLING_HEAD_SPAWN_H,
} from "../config/CombatStats";
import { TILE_SIZE } from "../specs";
import { AmbientClusterMap } from "./AmbientClusterMap";
import { RoomKind } from "./DungeonTypes";
import type { GeneratedRoom } from "./RoomGenerator";
import { TileMap } from "./TileMap";

export type BossSpawnKind = "possessed" | "nephilim";
export type EnemySpawnKind = ChallengeSpawnKind | BossSpawnKind;

export type EnemySpawn = {
  xPx: number;
  yPx: number;
  maxHealth: number;
  kind: EnemySpawnKind;
  countsForRoomClear: boolean;
  /** Optional variant id (e.g. Possessed NORMAL|SHINY). */
  variantId?: string;
};

const MAX_PLACE_ATTEMPTS = 160;
const SECRET_ROOM_ENEMY_CHANCE = 0.08;
const BOSS_SIDE_ENEMY_CHANCE = 0.5;
const ENEMY_CONTENT_SEED_SALT = 0xa24baed4963ee407n;

/**
 * Spawn budget for NORMAL / SECRET / BOSS rooms (Java EnemySpawnBudget + challenge registry).
 */
export function rollEnemySpawns(
  g: GeneratedRoom,
  contentSeed: bigint,
  kind: RoomKind,
  dungeonFloorOrdinal: number,
): EnemySpawn[] {
  if (kind === RoomKind.BOSS) {
    return rollBossSpawns(g, contentSeed);
  }
  if (kind !== RoomKind.NORMAL && kind !== RoomKind.SECRET) return [];
  const secretRoom = kind === RoomKind.SECRET;
  if (secretRoom) {
    const gate = new JavaRandom(contentSeed ^ ENEMY_CONTENT_SEED_SALT);
    if (gate.nextDouble() >= SECRET_ROOM_ENEMY_CHANCE) return [];
  }

  const eligible = secretRoom
    ? eligibleForSecretRoom(dungeonFloorOrdinal)
    : eligibleForNormalRoom(dungeonFloorOrdinal);
  if (eligible.length === 0) return [];

  const rng = new JavaRandom(contentSeed ^ 0x5deece66dn);
  const budget = rng.nextInt(Math.max(0, dungeonFloorOrdinal) * 4 + 1);
  if (budget <= 0) return [];

  const pickedTypes = pickDistinctTypes(rng, eligible, secretRoom);
  const clusters = clustersForRoom(g, contentSeed);
  const out: EnemySpawn[] = [];
  let remaining = budget;
  let attempts = 0;
  while (remaining > 0 && attempts < MAX_PLACE_ATTEMPTS) {
    attempts++;
    const spawnKind = pickedTypes[rng.nextInt(pickedTypes.length)]!;
    const cost = spawnCost(spawnKind);
    if (cost > remaining) continue;
    const site = tryPlace(g.map, g, clusters, rng, spawnKind);
    if (!site) continue;
    out.push({
      xPx: Math.round(site.x),
      yPx: Math.round(site.y),
      maxHealth: baseMaxHealth(spawnKind),
      kind: spawnKind,
      countsForRoomClear: !secretRoom,
    });
    remaining -= cost;
  }
  return out;
}

/** Cluster map for golden roach — prefers stamped deco, falls back to predicted cells. */
export function clustersForRoom(g: GeneratedRoom, contentSeed: bigint): AmbientClusterMap {
  if (g.art?.decoStamps?.length) {
    return AmbientClusterMap.buildFromDeco(g.map, g.art.decoStamps);
  }
  return AmbientClusterMap.buildPredicted(g.map, contentSeed, g.ladderColumnTx);
}

function pickDistinctTypes(
  rng: JavaRandom,
  eligible: ChallengeSpawnKind[],
  secretRoom: boolean,
): ChallengeSpawnKind[] {
  const want = 1 + rng.nextInt(Math.min(3, eligible.length));
  const pool = [...eligible];
  const picked: ChallengeSpawnKind[] = [];
  while (picked.length < want && pool.length > 0) {
    const k = pickWeighted(rng, pool, secretRoom);
    picked.push(k);
    const idx = pool.indexOf(k);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return picked;
}

function rollBossSpawns(g: GeneratedRoom, contentSeed: bigint): EnemySpawn[] {
  const map = g.map;
  const w = map.getWidth();
  const h = map.getHeight();
  const midX = clampInt(Math.floor(w / 2), 2, w - 3);
  const bossAnchorX = midX * TILE_SIZE + TILE_SIZE * 0.5;
  const entry = pickBossForFloor(1, contentSeed);
  const enemies: EnemySpawn[] = [];

  if (entry.kind === BossKind.NEPHILIM) {
    const groundTop = map.groundTopWorldYAtColumn(midX);
    const bossAnchorY = Nephilim.anchorYOnGround(groundTop, getNephilimRig());
    enemies.push({
      xPx: Math.round(bossAnchorX),
      yPx: Math.round(bossAnchorY),
      maxHealth: entry.maxHealth,
      kind: "nephilim",
      countsForRoomClear: true,
    });
  } else {
    const bossAnchorY = h * TILE_SIZE * 0.4;
    const variantId = rollPossessedVariant(contentSeed);
    const maxHealth = possessedHpForVariant(variantId, entry.maxHealth);
    enemies.push({
      xPx: Math.round(bossAnchorX),
      yPx: Math.round(bossAnchorY),
      maxHealth,
      kind: "possessed",
      countsForRoomClear: true,
      variantId,
    });
  }

  enemies.push(...rollBossSideCrawlers(map, w, midX, contentSeed));
  return enemies;
}

/** Two optional flank crawlers (Java RoomGenerator.rollPostGenerationEnemies BOSS branch). */
function rollBossSideCrawlers(
  map: TileMap,
  w: number,
  midX: number,
  contentSeed: bigint,
): EnemySpawn[] {
  const rng = new JavaRandom(contentSeed ^ ENEMY_CONTENT_SEED_SALT);
  if (rng.nextDouble() >= BOSS_SIDE_ENEMY_CHANCE) return [];

  const minSide = Math.max(2, Math.floor(w / 6));
  if (w <= minSide * 2 + 4) return [];

  const flank = Math.max(3, Math.floor(w / 5));
  const ox = clampInt(midX - flank, minSide, w - minSide - 1);
  const ox2 = clampInt(midX + flank, minSide, w - minSide - 1);
  const out: EnemySpawn[] = [];

  if (ox !== midX && canSpawnEnemyAt(map, ox)) {
    out.push({
      xPx: ox * TILE_SIZE - 2,
      yPx: enemySpawnAnchorYPx(map, ox),
      maxHealth: CRAWLER_MAX_HP,
      kind: "crawler",
      countsForRoomClear: true,
    });
  }
  if (ox2 !== midX && canSpawnEnemyAt(map, ox2)) {
    out.push({
      xPx: ox2 * TILE_SIZE - 2,
      yPx: enemySpawnAnchorYPx(map, ox2),
      maxHealth: CRAWLER_MAX_HP,
      kind: "crawler",
      countsForRoomClear: true,
    });
  }
  return out;
}

function enemySpawnAnchorYPx(map: TileMap, tx: number): number {
  return Math.round(map.groundTopWorldYAtColumn(tx) - CRAWLER_SPAWN_H);
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function tryPlace(
  map: TileMap,
  g: GeneratedRoom,
  clusters: AmbientClusterMap,
  rng: JavaRandom,
  kind: ChallengeSpawnKind,
): { x: number; y: number } | null {
  if (spawnPlacement(kind) === "ambient_cluster") {
    return tryAmbientCluster(clusters, rng);
  }
  return tryFloorColumn(map, g, rng, kind);
}

function tryFloorColumn(
  map: TileMap,
  g: GeneratedRoom,
  rng: JavaRandom,
  kind: ChallengeSpawnKind,
): { x: number; y: number } | null {
  const w = map.getWidth();
  const margin = Math.min(8, Math.max(2, Math.floor(w / 5)));
  const ladderTx = g.ladderColumnTx;
  const spawnH =
    kind === "mouse"
      ? MOUSE_SPAWN_H
      : kind === "penisman"
        ? PENISMAN_SPAWN_H
        : kind === "jack_blue"
          ? JACK_BLUE_SPAWN_H
          : kind === "rolling_head"
            ? ROLLING_HEAD_SPAWN_H
            : kind === "multilimber"
              ? MULTILIMBER_SPAWN_H
              : CRAWLER_SPAWN_H;
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = margin + rng.nextInt(Math.max(1, w - margin * 2));
    if (ladderTx >= 0 && Math.abs(x - ladderTx) <= 1) continue;
    if (isDoorColumn(g, x)) continue;
    if (!canSpawnEnemyAt(map, x)) continue;
    const groundTop = map.groundTopWorldYAtColumn(x);
    return {
      x: x * TILE_SIZE,
      y: groundTop - spawnH,
    };
  }
  return null;
}

function tryAmbientCluster(
  clusters: AmbientClusterMap,
  rng: JavaRandom,
): { x: number; y: number } | null {
  if (clusters.isEmpty()) return null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const cid = clusters.pickRandomClusterId(rng);
    const pt = clusters.randomPointInCluster(rng, cid);
    if (!pt) continue;
    const anchor = AmbientClusterMap.spawnAnchorForCellCenter(
      pt[0],
      pt[1],
      GOLDEN_ROACH_SPAWN_W,
      GOLDEN_ROACH_SPAWN_H,
    );
    return { x: anchor[0], y: anchor[1] };
  }
  return null;
}

function isDoorColumn(g: GeneratedRoom, tx: number): boolean {
  return tx === g.leftDoorTileX || tx === g.rightDoorTileX;
}

function canSpawnEnemyAt(map: TileMap, tx: number): boolean {
  if (tx <= 0 || tx >= map.getWidth() - 1) return false;
  const groundTop = map.groundTopWorldYAtColumn(tx);
  const footTy = Math.floor(groundTop / TILE_SIZE);
  if (!map.isStandableFloorTile(tx, footTy) && !map.isSolidTile(tx, footTy)) return false;
  if (map.isSolidTile(tx, footTy - 1)) return false;
  return true;
}
