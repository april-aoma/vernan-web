import { isOneScreenRoomKind, RoomKind } from "./DungeonTypes";
import type { DungeonLayout } from "./DungeonLayout";

/**
 * Final map width/height per room before generate (xor widen + SECRET unconnected-face padding).
 * Java SecretRoomLayoutPlanner.
 */
export function plannedWidths(
  layout: DungeonLayout,
  wideWidthTiles: number,
  oneScreenWidthTiles: number,
): number[] {
  const n = layout.roomCount();
  const out = new Array<number>(n);
  for (let id = 0; id < n; id++) {
    out[id] = plannedWidth(layout, id, wideWidthTiles, oneScreenWidthTiles);
  }
  return out;
}

export function plannedHeights(
  layout: DungeonLayout,
  wideHeightTiles: number,
  oneScreenHeightTiles: number,
): number[] {
  const n = layout.roomCount();
  const out = new Array<number>(n);
  for (let id = 0; id < n; id++) {
    out[id] = plannedHeight(layout, id, wideHeightTiles, oneScreenHeightTiles);
  }
  return out;
}

export function plannedWidth(
  layout: DungeonLayout,
  roomId: number,
  wideWidthTiles: number,
  oneScreenWidthTiles: number,
): number {
  let w = baseWidth(layout, roomId, wideWidthTiles, oneScreenWidthTiles);
  if (shouldExpandWest(layout, roomId) || needsUnconnectedWestPadding(layout, roomId)) w++;
  if (shouldExpandEast(layout, roomId) || needsUnconnectedEastPadding(layout, roomId)) w++;
  return w;
}

export function plannedHeight(
  layout: DungeonLayout,
  roomId: number,
  wideHeightTiles: number,
  oneScreenHeightTiles: number,
): number {
  let h = baseHeight(layout, roomId, wideHeightTiles, oneScreenHeightTiles);
  if (shouldExpandNorth(layout, roomId)) h++;
  if (shouldExpandSouth(layout, roomId)) h++;
  return h;
}

function baseWidth(
  layout: DungeonLayout,
  roomId: number,
  wideWidthTiles: number,
  oneScreenWidthTiles: number,
): number {
  if (layout.room(roomId).kind === RoomKind.SECRET) return wideWidthTiles;
  return isOneScreenRoomKind(layout.room(roomId).kind) ? oneScreenWidthTiles : wideWidthTiles;
}

function baseHeight(
  layout: DungeonLayout,
  roomId: number,
  wideHeightTiles: number,
  oneScreenHeightTiles: number,
): number {
  if (layout.room(roomId).kind === RoomKind.SECRET) return wideHeightTiles;
  return isOneScreenRoomKind(layout.room(roomId).kind) ? oneScreenHeightTiles : wideHeightTiles;
}

function isSecretKind(k: RoomKind): boolean {
  return k === RoomKind.SECRET || k === RoomKind.SUPER_SECRET;
}

/** +1 west column when this room borders a secret on the west (xor widen). */
export function shouldExpandWest(layout: DungeonLayout, roomId: number): boolean {
  return shouldExpandToward(layout, roomId, layout.neighborWest(roomId));
}

export function shouldExpandEast(layout: DungeonLayout, roomId: number): boolean {
  return shouldExpandToward(layout, roomId, layout.neighborEast(roomId));
}

function shouldExpandNorth(layout: DungeonLayout, roomId: number): boolean {
  return shouldExpandToward(layout, roomId, layout.neighborNorth(roomId));
}

function shouldExpandSouth(layout: DungeonLayout, roomId: number): boolean {
  return shouldExpandToward(layout, roomId, layout.neighborSouth(roomId));
}

function shouldExpandToward(
  layout: DungeonLayout,
  roomId: number,
  neighborId: number,
): boolean {
  if (neighborId < 0) return false;
  return isSecretKind(layout.room(roomId).kind) !== isSecretKind(layout.room(neighborId).kind);
}

/** Wide SECRET with no west door: padding wall at x=1. SUPER_SECRET skips. */
export function needsUnconnectedWestPadding(layout: DungeonLayout, roomId: number): boolean {
  return layout.room(roomId).kind === RoomKind.SECRET && !layout.room(roomId).doorWest;
}

export function needsUnconnectedEastPadding(layout: DungeonLayout, roomId: number): boolean {
  return layout.room(roomId).kind === RoomKind.SECRET && !layout.room(roomId).doorEast;
}

/** One-screen room with at least one xor secret widen column (CAM-XOR-1). */
export function hasXorSecretWiden(layout: DungeonLayout, roomId: number): boolean {
  if (!isOneScreenRoomKind(layout.room(roomId).kind)) return false;
  return shouldExpandWest(layout, roomId) || shouldExpandEast(layout, roomId);
}

/** Camera tuck tiles for west padding (border 0 + pad 1 → interior from 2). */
export function unconnectedWestPaddingCameraTuckTiles(
  layout: DungeonLayout,
  roomId: number,
): number {
  return needsUnconnectedWestPadding(layout, roomId) ? 2 : 0;
}
