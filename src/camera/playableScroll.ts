import { CAMERA_EDGE_BUFFER_WORLD } from "../config/Physics";
import { TILE_SIZE, WORLD_VIEWPORT_W } from "../specs";
import type { DungeonLayout } from "../world/DungeonLayout";
import { isOneScreenRoomKind } from "../world/DungeonTypes";
import type { GeneratedRoom } from "../world/RoomGenerator";
import {
  computePlayableScrollX,
  roomHasOpenedHorizontalSecretExit,
  type PlayableScrollX,
  type SecretSeam,
} from "../world/SecretEntrancePlacer";
import {
  needsUnconnectedEastPadding,
  needsUnconnectedWestPadding,
  unconnectedWestPaddingCameraTuckTiles,
} from "../world/SecretRoomLayoutPlanner";
import type { TileMap } from "../world/TileMap";
import { WorldCamera, type CameraScrollBounds } from "./WorldCamera";

export type { PlayableScrollX };

/** One visible screen in tile units (Java specialRoomWidthTiles). */
export function specialRoomWidthTiles(): number {
  return Math.max(10, Math.ceil(WORLD_VIEWPORT_W / TILE_SIZE));
}

/**
 * CAM-W16-1 / CAM-XOR-1: map ≤ viewport, or one-screen room while H secret seams stay sealed.
 */
export function usesTierOneCamera(
  map: TileMap,
  layout: DungeonLayout,
  roomId: number,
  room: GeneratedRoom,
  seams: SecretSeam[] | null | undefined,
): boolean {
  const mapTiles = map.getWidth();
  if (mapTiles <= specialRoomWidthTiles()) return true;
  if (!isOneScreenRoomKind(layout.room(roomId).kind)) return false;
  return !roomHasOpenedHorizontalSecretExit(seams, roomId, room);
}

/**
 * Resolve playable X + camera anchor range for the current room
 * (Java GamePanel.horizontalCameraAnchorRange / tierOneHorizontalAnchorRange).
 */
export function resolveCameraScrollBounds(
  map: TileMap,
  layout: DungeonLayout,
  roomId: number,
  room: GeneratedRoom,
  seams: SecretSeam[] | null | undefined,
  playableOverride: PlayableScrollX | null = null,
): CameraScrollBounds {
  const { halfViewW, halfViewH } = WorldCamera.halfViews();
  const mapW = map.getWidth() * TILE_SIZE;
  const mapH = map.getHeight() * TILE_SIZE;
  const edge = CAMERA_EDGE_BUFFER_WORLD;

  const mapMinAx = halfViewW;
  const mapMaxAx = Math.max(halfViewW, mapW - halfViewW);

  const playable =
    playableOverride ??
    computePlayableScrollX(seams, roomId, room, mapW, layout);

  const tierOne = usesTierOneCamera(map, layout, roomId, room, seams);
  const [minAx, maxAx] = tierOne
    ? tierOneHorizontalAnchorRange(halfViewW, mapMinAx, mapMaxAx, playable, layout, roomId, map)
    : horizontalCameraAnchorRange(
        halfViewW,
        mapMinAx,
        mapMaxAx,
        playable,
        layout,
        roomId,
        mapW,
      );

  // Java cameraScrollBounds + cameraAnchorMinY/MaxY:
  // raw scroll = [halfViewH, mapH - halfViewH], then ± EDGE_BUFFER.
  // At minY the visible top is EDGE_BUFFER (8px) — half of the north barrier tile.
  const rawMinAy = halfViewH;
  const rawMaxAy = Math.max(halfViewH, mapH - halfViewH);
  let minAy = rawMinAy + edge;
  let maxAy = rawMaxAy - edge;
  if (minAy > maxAy) {
    minAy = rawMinAy;
    maxAy = rawMaxAy;
  }

  return {
    halfViewW,
    halfViewH,
    minAnchorX: minAx,
    maxAnchorX: maxAx,
    minAnchorY: minAy,
    maxAnchorY: maxAy,
    edgeBufferWorld: edge,
  };
}

/** Tier (1) fixed horizontal anchor (Java tierOneHorizontalAnchorRange). */
function tierOneHorizontalAnchorRange(
  halfViewW: number,
  mapMinAx: number,
  mapMaxAx: number,
  playable: PlayableScrollX,
  layout: DungeonLayout,
  roomId: number,
  map: TileMap,
): [number, number] {
  const viewportTiles = specialRoomWidthTiles();
  const mapTiles = map.getWidth();
  if (mapTiles <= viewportTiles) {
    return [mapMinAx, mapMaxAx];
  }
  const tile = TILE_SIZE;
  let anchor: number;
  if (needsUnconnectedWestPadding(layout, roomId)) {
    const tuck = unconnectedWestPaddingCameraTuckTiles(layout, roomId);
    anchor = tuck * tile - tile * 0.5 + halfViewW;
  } else if (playable.westEdgeTight) {
    anchor = halfViewW + tile;
  } else {
    anchor = halfViewW;
  }
  return [anchor, anchor];
}

function playableTuckAnchorRange(
  halfViewW: number,
  playable: PlayableScrollX,
  layout: DungeonLayout,
  roomId: number,
  mapW: number,
): [number, number] {
  const tile = TILE_SIZE;
  const half = tile * 0.5;
  let lo = playable.minX + halfViewW;
  if (!playable.westEdgeTight) lo += CAMERA_EDGE_BUFFER_WORLD;
  let hi = playable.maxX - halfViewW;
  if (!playable.eastEdgeTight) hi -= CAMERA_EDGE_BUFFER_WORLD;

  if (needsUnconnectedWestPadding(layout, roomId)) {
    const tuck = unconnectedWestPaddingCameraTuckTiles(layout, roomId);
    lo = tuck * tile - half + halfViewW;
  }
  if (needsUnconnectedEastPadding(layout, roomId)) {
    hi = mapW - 2 * tile + half - halfViewW;
  }
  return [lo, hi];
}

function playableAdmitsHorizontalScroll(
  playable: PlayableScrollX,
  halfViewW: number,
): boolean {
  return playable.maxX - playable.minX > 2 * halfViewW + 0.5;
}

function collapsedHorizontalAnchorRange(
  mapMinAx: number,
  mapMaxAx: number,
  playable: PlayableScrollX,
  tuck: [number, number],
  layout: DungeonLayout,
  roomId: number,
): [number, number] {
  const westTuck =
    playable.westEdgeTight || needsUnconnectedWestPadding(layout, roomId);
  const eastTuck =
    playable.eastEdgeTight || needsUnconnectedEastPadding(layout, roomId);
  let anchor: number;
  if (westTuck && eastTuck) {
    anchor = (playable.minX + playable.maxX) * 0.5;
  } else if (eastTuck) {
    anchor = tuck[1];
  } else if (westTuck) {
    anchor = tuck[0];
  } else {
    anchor = (mapMinAx + mapMaxAx) * 0.5;
  }
  return [anchor, anchor];
}

/** Java GamePanel.horizontalCameraAnchorRange. */
function horizontalCameraAnchorRange(
  halfViewW: number,
  mapMinAx: number,
  mapMaxAx: number,
  playable: PlayableScrollX,
  layout: DungeonLayout,
  roomId: number,
  mapW: number,
): [number, number] {
  const tuck = playableTuckAnchorRange(halfViewW, playable, layout, roomId, mapW);
  if (playableAdmitsHorizontalScroll(playable, halfViewW)) {
    if (tuck[0] <= tuck[1]) return tuck;
    return collapsedHorizontalAnchorRange(
      mapMinAx,
      mapMaxAx,
      playable,
      tuck,
      layout,
      roomId,
    );
  }
  let lo = mapMinAx;
  let hi = mapMaxAx;
  if (playable.westEdgeTight || needsUnconnectedWestPadding(layout, roomId)) {
    lo = Math.max(lo, tuck[0]);
  }
  if (playable.eastEdgeTight || needsUnconnectedEastPadding(layout, roomId)) {
    hi = Math.min(hi, tuck[1]);
  }
  if (lo <= hi) return [lo, hi];
  return collapsedHorizontalAnchorRange(
    mapMinAx,
    mapMaxAx,
    playable,
    tuck,
    layout,
    roomId,
  );
}

/** Probe-reveal one horizontal face and recompute playable (Java playableScrollXIfFaceOpened). */
export function playableScrollXIfFaceOpened(
  seams: SecretSeam[],
  seam: SecretSeam,
  roomId: number,
  room: GeneratedRoom,
  mapW: number,
  layout: DungeonLayout,
): PlayableScrollX {
  const snap = seam.snapshotBufferRevealed();
  try {
    if (roomId === seam.roomWestId()) seam.probeRevealEastBuffers(roomId);
    else if (roomId === seam.roomEastId()) seam.probeRevealWestBuffers(roomId);
    return computePlayableScrollX(seams, roomId, room, mapW, layout);
  } finally {
    seam.restoreBufferRevealed(snap);
  }
}

export function highestLadderRow(map: TileMap, tx: number): number {
  for (let ty = 1; ty < map.getHeight() - 1; ty++) {
    if (map.isLadderTile(tx, ty)) return ty;
  }
  return -1;
}

export function lowestLadderRow(map: TileMap, tx: number): number {
  let lo = -1;
  for (let ty = 1; ty < map.getHeight() - 1; ty++) {
    if (map.isLadderTile(tx, ty)) lo = ty;
  }
  return lo;
}
