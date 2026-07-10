import { TILE_SIZE, WORLD_VIEWPORT_H, WORLD_VIEWPORT_W } from "../specs";
import { DungeonLayout } from "./DungeonLayout";
import { RoomKind, type RoomNode } from "./DungeonTypes";
import { rollEnemySpawns } from "./EnemySpawnBudget";
import {
  connectivityFromNode,
  generateRoomShell,
  type GeneratedRoom,
  type SecretGenFinishOptions,
} from "./RoomGenerator";
import { floorLayoutSeed, targetRoomCount } from "./RunSeed";
import { neighborFaces, secretRoomSeams } from "./SecretHorizontalSeamSpec";
import { placeSecretEntrances, type SecretSeam } from "./SecretEntrancePlacer";
import { plannedHeights, plannedWidths } from "./SecretRoomLayoutPlanner";

export type BuiltDungeon = {
  runSeed: bigint;
  layoutSeed: bigint;
  layout: DungeonLayout;
  rooms: GeneratedRoom[];
  /** Secret entrance seams (breakable shells between NORMAL↔SECRET). */
  secretSeams: SecretSeam[];
  combatW: number;
  combatH: number;
  oneScreenW: number;
  oneScreenH: number;
  floorOrdinal: number;
};

/**
 * Mirror GamePanel.buildDungeonContent order:
 * layout → planned W/H → Pass A (non-secret + neighborFaces) →
 * Pass B (secret/super + secretRoomSeams) → placeSecretEntrances → enemies last.
 */
export function buildDungeon(runSeed: bigint, floorOrdinal = 1): BuiltDungeon {
  const layoutSeed = floorLayoutSeed(runSeed, floorOrdinal);
  const targetRooms = targetRoomCount(layoutSeed);
  const combatW = Math.max(64, Math.floor(WORLD_VIEWPORT_W / TILE_SIZE));
  const combatH = Math.max(12, Math.floor(WORLD_VIEWPORT_H / TILE_SIZE));
  const oneScreenW = Math.max(10, Math.ceil(WORLD_VIEWPORT_W / TILE_SIZE));
  const oneScreenH = Math.max(8, Math.ceil(WORLD_VIEWPORT_H / TILE_SIZE));

  const layout = DungeonLayout.generate(layoutSeed, targetRooms, combatW, 0, 0);
  const n = layout.roomCount();
  const plannedW = plannedWidths(layout, combatW, oneScreenW);
  const plannedH = plannedHeights(layout, combatH, oneScreenH);

  const rooms: (GeneratedRoom | null)[] = new Array(n).fill(null);

  // Pass A — non-SECRET/SUPER (neighbor faces get SEC-SHELL at finish).
  for (let i = 0; i < n; i++) {
    const node = layout.room(i);
    if (node.kind === RoomKind.SECRET || node.kind === RoomKind.SUPER_SECRET) continue;
    const finish: SecretGenFinishOptions = {
      neighborFaces: neighborFaces(layout, i),
    };
    rooms[i] = generateForNode(node, plannedW[i]!, plannedH[i]!, finish);
  }

  // Pass B — SECRET/SUPER (door tops from Pass A neighbors).
  for (let i = 0; i < n; i++) {
    const node = layout.room(i);
    if (node.kind !== RoomKind.SECRET && node.kind !== RoomKind.SUPER_SECRET) continue;
    const finish: SecretGenFinishOptions = {
      secretSeams: secretRoomSeams(layout, i, rooms),
    };
    rooms[i] = generateForNode(node, plannedW[i]!, plannedH[i]!, finish);
  }

  const filled = rooms as GeneratedRoom[];
  const secretSeams = placeSecretEntrances(layout, filled);

  // Enemies after terrain final (Java applyPostGenerationEnemies).
  for (let i = 0; i < n; i++) {
    const node = layout.room(i);
    filled[i]!.enemySpawns = rollEnemySpawns(
      filled[i]!,
      node.contentSeed,
      node.kind,
      floorOrdinal,
    );
  }

  return {
    runSeed,
    layoutSeed,
    layout,
    rooms: filled,
    secretSeams,
    combatW,
    combatH,
    oneScreenW,
    oneScreenH,
    floorOrdinal,
  };
}

function generateForNode(
  node: RoomNode,
  rw: number,
  rh: number,
  finish: SecretGenFinishOptions,
): GeneratedRoom {
  const conn = connectivityFromNode(node, rw);
  return generateRoomShell(node.contentSeed, rw, rh, conn, node.kind, finish);
}

export function roomKindLabel(kind: RoomKind): string {
  switch (kind) {
    case RoomKind.START:
      return "START";
    case RoomKind.NORMAL:
      return "NORMAL";
    case RoomKind.ITEM:
      return "ITEM";
    case RoomKind.SHOP:
      return "SHOP";
    case RoomKind.BOSS:
      return "BOSS";
    case RoomKind.SECRET:
      return "SECRET";
    case RoomKind.SUPER_SECRET:
      return "SUPER";
    default:
      return "?";
  }
}
