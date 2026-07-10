import type { DungeonLayout } from "./DungeonLayout";
import { RoomKind } from "./DungeonTypes";
import type { GeneratedRoom } from "./RoomGenerator";
import { packCell } from "./BossDoorSealAnim";

/**
 * Picks door visuals for a doorway. objects[].roomKinds on door objects means
 * "leads to / belongs to" ITEM, SHOP, or BOSS.
 * (Java DoorDestinationResolver)
 */
export function destinationKindForDoorColumn(
  layout: DungeonLayout | null | undefined,
  roomId: number,
  doorTx: number,
  leftDoorTileX: number,
  rightDoorTileX: number,
): RoomKind {
  if (!layout || roomId < 0 || doorTx < 0) return RoomKind.NORMAL;
  const sourceKind = layout.room(roomId).kind;
  if (isSecretKind(sourceKind)) return RoomKind.NORMAL;
  const neighborKind = neighborKindAcrossDoorColumn(
    layout,
    roomId,
    doorTx,
    leftDoorTileX,
    rightDoorTileX,
  );
  if (isSecretKind(neighborKind)) return RoomKind.NORMAL;
  if (isThemedSpecialRoom(sourceKind)) return sourceKind;
  if (neighborKind != null && isThemedSpecialRoom(neighborKind)) return neighborKind;
  return RoomKind.NORMAL;
}

/**
 * Maps each horizontal door-column cell (top + bottom) to the room-kind key for door art.
 * Uses door metadata so themed art still applies when cells are temporarily keyblocks.
 */
export function destKindByDoorCell(
  layout: DungeonLayout,
  roomId: number,
  room: GeneratedRoom | null | undefined,
): Map<number, RoomKind> {
  const out = new Map<number, RoomKind>();
  if (!room) return out;
  const leftX = room.leftDoorTileX;
  const rightX = room.rightDoorTileX;
  putDoorColumnKinds(out, layout, roomId, leftX, room.leftDoorTopTileY, leftX, rightX);
  putDoorColumnKinds(out, layout, roomId, rightX, room.rightDoorTopTileY, leftX, rightX);
  return out;
}

function putDoorColumnKinds(
  out: Map<number, RoomKind>,
  layout: DungeonLayout,
  roomId: number,
  doorTx: number,
  doorTopY: number,
  leftDoorTileX: number,
  rightDoorTileX: number,
): void {
  if (doorTx < 0 || doorTopY < 0) return;
  const kind = destinationKindForDoorColumn(
    layout,
    roomId,
    doorTx,
    leftDoorTileX,
    rightDoorTileX,
  );
  out.set(packCell(doorTx, doorTopY), kind);
  out.set(packCell(doorTx, doorTopY + 1), kind);
}

function neighborKindAcrossDoorColumn(
  layout: DungeonLayout,
  roomId: number,
  doorTx: number,
  leftDoorTileX: number,
  rightDoorTileX: number,
): RoomKind | null {
  if (leftDoorTileX >= 0 && doorTx === leftDoorTileX) {
    const west = layout.neighborWest(roomId);
    if (west >= 0) return layout.room(west).kind;
  }
  if (rightDoorTileX >= 0 && doorTx === rightDoorTileX) {
    const east = layout.neighborEast(roomId);
    if (east >= 0) return layout.room(east).kind;
  }
  return null;
}

function isThemedSpecialRoom(k: RoomKind): boolean {
  return k === RoomKind.ITEM || k === RoomKind.SHOP || k === RoomKind.BOSS;
}

function isSecretKind(k: RoomKind | null | undefined): boolean {
  return k === RoomKind.SECRET || k === RoomKind.SUPER_SECRET;
}
