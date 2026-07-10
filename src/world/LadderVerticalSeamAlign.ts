import type { DungeonLayout } from "./DungeonLayout";
import { stripSpuriousLaddersFromMap } from "./DungeonVerticalShaftRules";
import {
  maxVerticalReachTilesForGridY,
  resolvedLadderShaftFootRowAt,
  type GeneratedRoom,
  type RoomConnectivity,
} from "./RoomGenerator";
import {
  clearStrayLadderPlatforms,
  enforceInteriorPlayFloorSteps,
  enforceRunwayCellAtShaft,
  fillShaftColumnGaps,
  finalizeLadderShaft,
  restoreConnectedDoorRunwayFloors,
  stripShaftFlankSolidPillars,
} from "./SecretRoomMapBuild";
import {
  isNorthRoomSouthFaceSealed,
  reapplyVerticalSeamTerrain,
  type SecretSeam,
} from "./SecretEntrancePlacer";
import { RoomKind } from "./DungeonTypes";
import type { TileMap } from "./TileMap";

/**
 * LADDER-MOUTH-2: after terrain is final, place south mouth and shaft rungs in column L
 * (Java LadderVerticalSeamAlign subset — no LadderSafetyPlatforms / TerrainSolidConnectivity).
 */
export function applyAll(layout: DungeonLayout, rooms: GeneratedRoom[]): void {
  const n = layout.roomCount();
  for (let southId = 0; southId < n; southId++) {
    const northId = layout.neighborNorth(southId);
    if (northId < 0 || southId >= rooms.length || northId >= rooms.length) continue;
    const north = rooms[northId];
    const south = rooms[southId];
    if (!north || !south) continue;
    alignNorthSouthPair(layout, northId, southId, north, south);
  }
  for (let id = 0; id < n; id++) {
    if (id >= rooms.length || !rooms[id]) continue;
    const node = layout.room(id);
    if (!node.ladderNorth && !node.ladderSouth) continue;
    const layoutL = node.ladderColumnTx;
    if (layoutL < 0) continue;
    const map = rooms[id]!.map;
    const l = clampLadderColumn(map.getWidth(), layoutL);
    const conn = connectivity(layout, id, map.getWidth(), l);
    const footRow = resolvedLadderShaftFootRowAt(map, l, conn.ladderSouth);
    const room = rooms[id]!;
    clearStrayLadderPlatforms(map, l, footRow, conn.ladderSouth);
    finalizeLadderShaft(map, l, footRow, conn, room.leftDoorTileX, room.rightDoorTileX);
    stripSpuriousLaddersFromMap(map, l, footRow);
  }
  for (let id = 0; id < n; id++) {
    if (id >= rooms.length || !rooms[id]) continue;
    const g = rooms[id]!;
    restoreConnectedDoorRunwayFloors(
      g.map,
      g.leftDoorTileX,
      g.leftDoorTopTileY,
      g.rightDoorTileX,
      g.rightDoorTopTileY,
      g.ladderColumnTx,
    );
    const node = layout.room(id);
    if (node.ladderNorth || node.ladderSouth) {
      const layoutL = node.ladderColumnTx;
      if (layoutL >= 0) {
        const l = clampLadderColumn(g.map.getWidth(), layoutL);
        enforceInteriorPlayFloorSteps(
          g.map,
          g.leftDoorTileX,
          g.rightDoorTileX,
          l,
          maxVerticalReachTilesForGridY(node.gridY),
        );
      }
    }
  }
}

/**
 * Final shaft pass after SecretEntrancePlacer — re-finalize mouths stale after strike lanes.
 * Subset of Java applyFinalShaftPass (no keyblocks / full terrain connectivity).
 */
export function applyFinalShaftPass(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  seams: SecretSeam[],
): void {
  applyAll(layout, rooms);
  reapplyVerticalSeamTerrain(layout, rooms, seams);
  enforceRunwayCellsAfterSeams(layout, rooms, seams);
  enforceInteriorPlayFloorStepsAfterSeams(layout, rooms);
  fillShaftColumnGapsAfterSeams(layout, rooms);
  stripSpuriousVerticalShafts(layout, rooms);
}

function alignNorthSouthPair(
  layout: DungeonLayout,
  northId: number,
  southId: number,
  north: GeneratedRoom,
  south: GeneratedRoom,
): void {
  const northNode = layout.room(northId);
  const southNode = layout.room(southId);
  if (!northNode.ladderSouth || !southNode.ladderNorth) return;
  let layoutL = northNode.ladderColumnTx;
  if (layoutL < 0) layoutL = southNode.ladderColumnTx;
  if (layoutL < 0) return;
  const ladderNorth = clampLadderColumn(north.map.getWidth(), layoutL);
  const ladderSouth = clampLadderColumn(south.map.getWidth(), layoutL);
  const connNorth = connectivity(layout, northId, north.map.getWidth(), ladderNorth);
  const connSouth = connectivity(layout, southId, south.map.getWidth(), ladderSouth);
  const footNorth = resolvedLadderShaftFootRowAt(north.map, ladderNorth, connNorth.ladderSouth);
  const footSouth = resolvedLadderShaftFootRowAt(south.map, ladderSouth, connSouth.ladderSouth);
  clearStrayLadderPlatforms(north.map, ladderNorth, footNorth, connNorth.ladderSouth);
  clearStrayLadderPlatforms(south.map, ladderSouth, footSouth, false);
  finalizeLadderShaft(
    north.map,
    ladderNorth,
    footNorth,
    connNorth,
    north.leftDoorTileX,
    north.rightDoorTileX,
  );
  finalizeLadderShaft(
    south.map,
    ladderSouth,
    footSouth,
    connSouth,
    south.leftDoorTileX,
    south.rightDoorTileX,
  );
}

function enforceInteriorPlayFloorStepsAfterSeams(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
): void {
  const n = layout.roomCount();
  for (let id = 0; id < n; id++) {
    if (id >= rooms.length || !rooms[id]) continue;
    const node = layout.room(id);
    if (
      node.kind !== RoomKind.SECRET &&
      node.kind !== RoomKind.NORMAL &&
      node.kind !== RoomKind.BOSS
    ) {
      continue;
    }
    const map = rooms[id]!.map;
    let ladderTx = node.ladderColumnTx;
    if (ladderTx >= 0 && (node.ladderNorth || node.ladderSouth)) {
      ladderTx = clampLadderColumn(map.getWidth(), ladderTx);
    } else {
      ladderTx = -1;
    }
    const g = rooms[id]!;
    enforceInteriorPlayFloorSteps(
      map,
      g.leftDoorTileX,
      g.rightDoorTileX,
      ladderTx,
      maxVerticalReachTilesForGridY(node.gridY),
    );
  }
}

function enforceRunwayCellsAfterSeams(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  seams: SecretSeam[],
): void {
  const n = layout.roomCount();
  for (let id = 0; id < n; id++) {
    if (id >= rooms.length || !rooms[id]) continue;
    const node = layout.room(id);
    if (!node.ladderNorth && !node.ladderSouth) continue;
    const map = rooms[id]!.map;
    const l = clampLadderColumn(map.getWidth(), node.ladderColumnTx);
    if (l < 0) continue;
    const footRow = resolvedLadderShaftFootRowAt(map, l, node.ladderSouth);
    const sealed = isNorthRoomSouthFaceSealed(layout, seams, id, l);
    enforceRunwayCellAtShaft(map, l, footRow, node.ladderSouth, node.ladderNorth, sealed);
  }
}

function fillShaftColumnGapsAfterSeams(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
): void {
  const n = layout.roomCount();
  for (let id = 0; id < n; id++) {
    if (id >= rooms.length || !rooms[id]) continue;
    const node = layout.room(id);
    if (!node.ladderNorth && !node.ladderSouth) continue;
    const map = rooms[id]!.map;
    const l = clampLadderColumn(map.getWidth(), node.ladderColumnTx);
    const conn = connectivity(layout, id, map.getWidth(), l);
    const footRow = resolvedLadderShaftFootRowAt(map, l, conn.ladderSouth);
    fillShaftColumnGaps(map, l, footRow, conn);
    const g = rooms[id]!;
    stripShaftFlankSolidPillars(map, l, footRow, g.leftDoorTileX, g.rightDoorTileX);
  }
}

function stripSpuriousVerticalShafts(layout: DungeonLayout, rooms: GeneratedRoom[]): void {
  const n = layout.roomCount();
  for (let id = 0; id < n; id++) {
    if (id >= rooms.length || !rooms[id]) continue;
    const node = layout.room(id);
    if (!node.ladderNorth && !node.ladderSouth) continue;
    const layoutL = node.ladderColumnTx;
    if (layoutL < 0) continue;
    const map = rooms[id]!.map;
    const l = Math.max(3, Math.min(layoutL, map.getWidth() - 4));
    const mouthRow = resolvedLadderShaftFootRowAt(map, l, node.ladderSouth);
    stripSpuriousLaddersFromMap(map, l, mouthRow);
  }
}

function clampLadderColumn(mapWidthTiles: number, layoutL: number): number {
  return Math.max(3, Math.min(layoutL, mapWidthTiles - 4));
}

function connectivity(
  layout: DungeonLayout,
  roomId: number,
  mapWidthTiles: number,
  ladderTx: number,
): RoomConnectivity {
  const node = layout.room(roomId);
  let L = ladderTx;
  if (node.ladderNorth || node.ladderSouth) {
    L = Math.max(3, Math.min(ladderTx, mapWidthTiles - 4));
  }
  return {
    doorWest: node.doorWest,
    doorEast: node.doorEast,
    ladderNorth: node.ladderNorth,
    ladderSouth: node.ladderSouth,
    ladderColumnTx: L,
  };
}

/** Exported for tests / callers that need shaft column clamp. */
export function clampLadderColumnForMap(map: TileMap, layoutL: number): number {
  return clampLadderColumn(map.getWidth(), layoutL);
}
