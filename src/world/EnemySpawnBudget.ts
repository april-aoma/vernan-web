import { pickBossPhase5a } from "../boss/BossRegistry";
import {
  possessedHpForVariant,
  rollPossessedVariant,
} from "../combat/EnemyVariantRegistry";
import { JavaRandom } from "../util/JavaRandom";
import { CRAWLER_MAX_HP, CRAWLER_SPAWN_H } from "../config/CombatStats";
import { TILE_SIZE } from "../specs";
import { RoomKind } from "./DungeonTypes";
import type { GeneratedRoom } from "./RoomGenerator";
import { TileMap } from "./TileMap";

export type EnemySpawnKind = "crawler" | "possessed";

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
const ENEMY_CONTENT_SEED_SALT = 0xa24baed4963ee407n;

/**
 * Spawn budget for NORMAL / SECRET / BOSS rooms.
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
  if (kind === RoomKind.SECRET) {
    const gate = new JavaRandom(contentSeed ^ ENEMY_CONTENT_SEED_SALT);
    if (gate.nextDouble() >= SECRET_ROOM_ENEMY_CHANCE) return [];
  }

  const rng = new JavaRandom(contentSeed ^ 0x5deece66dn);
  const budget = rng.nextInt(Math.max(0, dungeonFloorOrdinal) * 4 + 1);
  if (budget <= 0) return [];

  const out: EnemySpawn[] = [];
  let remaining = budget;
  let attempts = 0;
  while (remaining > 0 && attempts < MAX_PLACE_ATTEMPTS) {
    attempts++;
    const site = tryFloorColumn(g.map, g, rng);
    if (!site) continue;
    out.push({
      xPx: Math.round(site.x),
      yPx: Math.round(site.y),
      maxHealth: CRAWLER_MAX_HP,
      kind: "crawler",
      countsForRoomClear: kind !== RoomKind.SECRET,
    });
    remaining -= 1;
  }
  return out;
}

function rollBossSpawns(g: GeneratedRoom, contentSeed: bigint): EnemySpawn[] {
  const map = g.map;
  const w = map.getWidth();
  const h = map.getHeight();
  const midX = Math.max(2, Math.min(w - 3, Math.floor(w / 2)));
  // Center of boss (Java RoomGenerator bossAnchor).
  const bossAnchorX = midX * TILE_SIZE + TILE_SIZE * 0.5;
  const bossAnchorY = h * TILE_SIZE * 0.4;
  const entry = pickBossPhase5a(1, contentSeed);
  const variantId = rollPossessedVariant(contentSeed);
  const maxHealth = possessedHpForVariant(variantId, entry.maxHealth);
  return [
    {
      xPx: Math.round(bossAnchorX),
      yPx: Math.round(bossAnchorY),
      maxHealth,
      kind: "possessed",
      countsForRoomClear: true,
      variantId,
    },
  ];
}

function tryFloorColumn(
  map: TileMap,
  g: GeneratedRoom,
  rng: JavaRandom,
): { x: number; y: number } | null {
  const w = map.getWidth();
  const margin = Math.min(8, Math.max(2, Math.floor(w / 5)));
  const ladderTx = g.ladderColumnTx;
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = margin + rng.nextInt(Math.max(1, w - margin * 2));
    if (ladderTx >= 0 && Math.abs(x - ladderTx) <= 1) continue;
    if (isDoorColumn(g, x)) continue;
    if (!canSpawnEnemyAt(map, x)) continue;
    const groundTop = map.groundTopWorldYAtColumn(x);
    return {
      x: x * TILE_SIZE,
      y: groundTop - CRAWLER_SPAWN_H,
    };
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
