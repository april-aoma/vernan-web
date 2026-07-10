import { RoomKind } from "./DungeonTypes";
import type { DungeonLayout } from "./DungeonLayout";
import type { GeneratedRoom } from "./RoomGenerator";

/** true = secret room's east (right) face; false = west (left) face. */
export type SecretSeamEdge = {
  secretEastFace: boolean;
  neighborDoorTopY: number;
};

export type SecretRoomSeams = {
  edges: SecretSeamEdge[];
  superSecretFlatArena: boolean;
};

export type NeighborSecretFaces = {
  finishEastFace: boolean;
  finishWestFace: boolean;
};

function isSecretKind(k: RoomKind): boolean {
  return k === RoomKind.SECRET || k === RoomKind.SUPER_SECRET;
}

/** Per-edge horizontal seam data for secret rooms (from already-built neighbors). */
export function secretRoomSeams(
  layout: DungeonLayout,
  secretRoomId: number,
  rooms: (GeneratedRoom | null | undefined)[],
): SecretRoomSeams {
  const edges: SecretSeamEdge[] = [];
  const w = layout.neighborWest(secretRoomId);
  if (w >= 0 && rooms[w] && !isSecretKind(layout.room(w).kind)) {
    const topY = rooms[w]!.rightDoorTopTileY;
    if (topY >= 0) edges.push({ secretEastFace: false, neighborDoorTopY: topY });
  }
  const e = layout.neighborEast(secretRoomId);
  if (e >= 0 && rooms[e] && !isSecretKind(layout.room(e).kind)) {
    const topY = rooms[e]!.leftDoorTopTileY;
    if (topY >= 0) edges.push({ secretEastFace: true, neighborDoorTopY: topY });
  }
  return {
    edges,
    superSecretFlatArena: layout.room(secretRoomId).kind === RoomKind.SUPER_SECRET,
  };
}

/** Which faces of a non-secret room border a secret (carve SEC-SHELL at finish). */
export function neighborFaces(layout: DungeonLayout, roomId: number): NeighborSecretFaces {
  let finishEastFace = false;
  let finishWestFace = false;
  const e = layout.neighborEast(roomId);
  if (e >= 0 && isSecretKind(layout.room(e).kind)) finishEastFace = true;
  const w = layout.neighborWest(roomId);
  if (w >= 0 && isSecretKind(layout.room(w).kind)) finishWestFace = true;
  return { finishEastFace, finishWestFace };
}
