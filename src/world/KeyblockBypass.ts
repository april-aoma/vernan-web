import type { DungeonLayout } from "./DungeonLayout";
import { RoomKind } from "./DungeonTypes";
import type { KeyblockSealSpec } from "./KeyblockSealSpec";
import type { KeyblockSealRuntime } from "./KeyblockSealRuntime";
import type { GeneratedRoom } from "./RoomGenerator";
import { TILE_LADDER, type TileMap } from "./TileMap";
import { operationalSouthMouthRow, southRoomNorthSealY } from "./VerticalSeamGeometry";

/**
 * Clears ITEM/SHOP entrance keyblock seals (floor ≥ 2) when Vernan enters the
 * special room — e.g. via a secret bypass — without spending a key.
 * (Java KeyblockBypass)
 */
export function clearEntrancesOnItemOrShopEnter(
  layout: DungeonLayout,
  specsByRoom: (KeyblockSealSpec[] | null)[],
  runtimesByRoom: (KeyblockSealRuntime[] | null)[],
  rooms: GeneratedRoom[],
  destRoomId: number,
  dungeonFloorOrdinal: number,
): void {
  if (dungeonFloorOrdinal < 2) return;
  if (destRoomId < 0 || destRoomId >= layout.roomCount()) return;
  const destK = layout.room(destRoomId).kind;
  if (destK !== RoomKind.ITEM && destK !== RoomKind.SHOP) return;
  for (const neighborId of orthogonalNeighbors(layout, destRoomId)) {
    clearSealsFacingChild(layout, specsByRoom, runtimesByRoom, rooms, neighborId, destRoomId);
  }
}

function orthogonalNeighbors(d: DungeonLayout, roomId: number): number[] {
  const out: number[] = [];
  const w = d.neighborWest(roomId);
  const e = d.neighborEast(roomId);
  const n = d.neighborNorth(roomId);
  const s = d.neighborSouth(roomId);
  if (w >= 0) out.push(w);
  if (e >= 0) out.push(e);
  if (n >= 0) out.push(n);
  if (s >= 0) out.push(s);
  return out;
}

function clearSealsFacingChild(
  layout: DungeonLayout,
  specsByRoom: (KeyblockSealSpec[] | null)[],
  runtimesByRoom: (KeyblockSealRuntime[] | null)[],
  rooms: GeneratedRoom[],
  parentRoomId: number,
  childRoomId: number,
): void {
  if (parentRoomId < 0 || childRoomId < 0) return;
  const specs = parentRoomId < specsByRoom.length ? specsByRoom[parentRoomId] : null;
  const runtimes = parentRoomId < runtimesByRoom.length ? runtimesByRoom[parentRoomId] : null;
  const gen = rooms[parentRoomId];
  if (!specs || !runtimes || !gen) return;
  const map = gen.map;
  for (let i = 0; i < specs.length && i < runtimes.length; i++) {
    const spec = specs[i]!;
    if (!sealFacesChild(layout, parentRoomId, childRoomId, gen, spec)) continue;
    const rt = runtimes[i]!;
    rt.timeline = 7;
    for (let s = 0; s < spec.slots.length; s++) {
      const slot = spec.slots[s]!;
      map.setTile(slot.tx, slot.ty, slot.restoreTileId);
      rt.slotTileCleared[s] = true;
    }
  }
}

function sealFacesChild(
  layout: DungeonLayout,
  parentRoomId: number,
  childRoomId: number,
  gen: GeneratedRoom,
  spec: KeyblockSealSpec,
): boolean {
  if (layout.neighborEast(parentRoomId) === childRoomId) {
    return sealMatchesDoorColumn(spec, gen.rightDoorTileX, gen.rightDoorTopTileY);
  }
  if (layout.neighborWest(parentRoomId) === childRoomId) {
    return sealMatchesDoorColumn(spec, gen.leftDoorTileX, gen.leftDoorTopTileY);
  }
  if (layout.neighborSouth(parentRoomId) === childRoomId) {
    return sealMatchesSouthLadder(gen, spec);
  }
  if (layout.neighborNorth(parentRoomId) === childRoomId) {
    return sealMatchesNorthLadder(gen, spec);
  }
  return false;
}

function sealMatchesDoorColumn(spec: KeyblockSealSpec, doorX: number, doorTopY: number): boolean {
  if (doorX < 0 || doorTopY < 0) return false;
  for (const s of spec.slots) {
    if (s.tx === doorX && (s.ty === doorTopY || s.ty === doorTopY + 1)) return true;
  }
  return false;
}

function sealMatchesNorthLadder(gen: GeneratedRoom, spec: KeyblockSealSpec): boolean {
  const L = gen.ladderColumnTx;
  if (L < 1) return false;
  const map = gen.map;
  let row = southRoomNorthSealY();
  const h = map.getHeight();
  if (row < 1 || row >= h - 1) {
    row = firstLadderRowFromTop(map, L);
  }
  if (row < 1) return false;
  for (const s of spec.slots) {
    if (s.tx === L && s.ty === row) return true;
  }
  return false;
}

function sealMatchesSouthLadder(gen: GeneratedRoom, spec: KeyblockSealSpec): boolean {
  const L = gen.ladderColumnTx;
  if (L < 1) return false;
  const mouth = operationalSouthMouthRow(gen.map, L);
  for (const s of spec.slots) {
    if (s.tx === L && s.ty === mouth) return true;
  }
  return false;
}

function firstLadderRowFromTop(map: TileMap, ladderTx: number): number {
  for (let y = 1; y < map.getHeight() - 1; y++) {
    if (map.tileAt(ladderTx, y) === TILE_LADDER) return y;
  }
  return -1;
}
