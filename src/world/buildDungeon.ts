import { TILE_SIZE, WORLD_VIEWPORT_H, WORLD_VIEWPORT_W } from "../specs";
import { DungeonLayout } from "./DungeonLayout";
import { RoomKind, type RoomNode } from "./DungeonTypes";
import { rollEnemySpawns } from "./EnemySpawnBudget";
import {
  placeKeyblockEntrances,
  stripKeyblocksFromSecretRooms,
} from "./KeyblockEntrancePlacer";
import type { KeyblockSealSpec } from "./KeyblockSealSpec";
import { applyAll as ladderAlignApplyAll, applyFinalShaftPass, applyPostDungeonPasses } from "./LadderVerticalSeamAlign";
import {
  applySecretPostGenerationContent,
  connectivityFromNode,
  generateRoomShell,
  regroundItemPedestal,
  type GeneratedRoom,
  type SecretGenFinishOptions,
} from "./RoomGenerator";
import { floorLayoutSeed, targetRoomCount } from "./RunSeed";
import { neighborFaces, secretRoomSeams } from "./SecretHorizontalSeamSpec";
import {
  placeSecretEntrances,
  reconcileKeyblocksWithSeams,
  type SecretSeam,
} from "./SecretEntrancePlacer";
import { plannedHeights, plannedWidths } from "./SecretRoomLayoutPlanner";

export type BuiltDungeon = {
  runSeed: bigint;
  layoutSeed: bigint;
  layout: DungeonLayout;
  rooms: GeneratedRoom[];
  /** Secret entrance seams (breakable shells between NORMAL↔SECRET). */
  secretSeams: SecretSeam[];
  /** Per-room keyblock seal specs (floor ≥ 2 ITEM/SHOP entrances). */
  roomKeyblockSeals: (KeyblockSealSpec[] | null)[];
  combatW: number;
  combatH: number;
  oneScreenW: number;
  oneScreenH: number;
  floorOrdinal: number;
};

/**
 * Mirror GamePanel.buildDungeonContent / Java GEN-ORDER-1:
 * layout → planned W/H → Pass A → Pass B → secret content → ladder align →
 * placeSecretEntrances → final shaft → keyblocks → enemies last.
 */
export function buildDungeon(
  runSeed: bigint,
  floorOrdinal = 1,
  eyeOfRaStacks = 0,
): BuiltDungeon {
  const layoutSeed = floorLayoutSeed(runSeed, floorOrdinal);
  const targetRooms = targetRoomCount(layoutSeed);
  const combatW = Math.max(64, Math.floor(WORLD_VIEWPORT_W / TILE_SIZE));
  const combatH = Math.max(12, Math.floor(WORLD_VIEWPORT_H / TILE_SIZE));
  const oneScreenW = Math.max(10, Math.ceil(WORLD_VIEWPORT_W / TILE_SIZE));
  const oneScreenH = Math.max(8, Math.ceil(WORLD_VIEWPORT_H / TILE_SIZE));

  const layout = DungeonLayout.generate(
    layoutSeed,
    targetRooms,
    combatW,
    Math.max(0, eyeOfRaStacks | 0),
    0,
  );
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

  // Secret loot / pedestals before ladder align (Java applySecretPostGenerationContent).
  applySecretPostGenerationContent(layout, filled);

  // LADDER-MOUTH-2 first pass (before seam strike lanes change flank groundY).
  ladderAlignApplyAll(layout, filled);
  applyPostDungeonPasses(layout, filled);

  const secretSeams = placeSecretEntrances(layout, filled);

  // Re-finalize shafts after seams (mouth rows may be stale).
  applyFinalShaftPass(layout, filled, secretSeams);

  // Keyblocks after final shaft geometry (Java KeyblockEntrancePlacer).
  let roomKeyblockSeals = placeKeyblockEntrances(layout, filled, floorOrdinal);
  stripKeyblocksFromSecretRooms(layout, filled);
  roomKeyblockSeals = reconcileKeyblocksWithSeams(roomKeyblockSeals, secretSeams);

  // Java DecoPlacementRules.regroundToFinalTerrain (pedestal half; deco regrounds in enrichDungeonArt).
  for (let i = 0; i < n; i++) {
    regroundItemPedestal(filled[i]!);
  }

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
    roomKeyblockSeals,
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
  return generateRoomShell(node.contentSeed, rw, rh, conn, node.kind, finish, node.gridY);
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
      return "SUPER_SECRET";
    default:
      return "UNKNOWN";
  }
}
