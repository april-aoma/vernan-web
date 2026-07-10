import type { DungeonLayout } from "./DungeonLayout";
import { RoomKind } from "./DungeonTypes";
import { makeKeyblockSealSpec, type KeyblockSealSpec } from "./KeyblockSealSpec";
import type { KeyblockSlot } from "./KeyblockSlot";
import type { GeneratedRoom } from "./RoomGenerator";
import {
  TILE_DOOR,
  TILE_EMPTY,
  TILE_KEYBLOCK,
  TILE_KEYBLOCK_CONNECTOR,
  TILE_LADDER,
  TILE_PLATFORM,
  type TileMap,
} from "./TileMap";
import { operationalSouthMouthRow, southRoomNorthSealY } from "./VerticalSeamGeometry";

enum Side {
  WEST,
  EAST,
  NORTH,
  SOUTH,
}

/**
 * Places keyblock seals in rooms adjacent to ITEM/SHOP (BFS parent), on the edge
 * that leads into the special room. Floor ordinal ≥ 2 only.
 * (Java KeyblockEntrancePlacer)
 */
export function placeKeyblockEntrances(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  dungeonFloorOrdinal: number,
): (KeyblockSealSpec[] | null)[] {
  const n = layout.roomCount();
  const out: (KeyblockSealSpec[] | null)[] = new Array(n).fill(null);
  if (dungeonFloorOrdinal < 2) return out;

  const byRoom: KeyblockSealSpec[][] = Array.from({ length: n }, () => []);
  const parent = bfsParents(layout);
  for (let r = 0; r < n; r++) {
    const k = layout.room(r).kind;
    if (k !== RoomKind.ITEM && k !== RoomKind.SHOP) continue;
    if (r === 0) continue;
    const p = parent[r]!;
    if (p < 0) continue;
    const parentKind = layout.room(p).kind;
    if (parentKind === RoomKind.SECRET || parentKind === RoomKind.SUPER_SECRET) continue;
    const side = sideTowardChild(layout, p, r);
    if (side == null) continue;
    const spec = tryPlaceSeal(layout.room(p), rooms[p]!, side);
    if (spec) byRoom[p]!.push(spec);
  }
  for (let i = 0; i < n; i++) {
    if (byRoom[i]!.length > 0) out[i] = byRoom[i]!;
  }
  return out;
}

/** Removes any K/k tiles left on secret-room maps (no keyblocks in secrets). */
export function stripKeyblocksFromSecretRooms(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
): void {
  for (let id = 0; id < layout.roomCount(); id++) {
    const room = rooms[id];
    if (!room) continue;
    const k = layout.room(id).kind;
    if (k !== RoomKind.SECRET && k !== RoomKind.SUPER_SECRET) continue;
    const map = room.map;
    const w = map.getWidth();
    const h = map.getHeight();
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = map.tileAt(tx, ty);
        if (t === TILE_KEYBLOCK || t === TILE_KEYBLOCK_CONNECTOR) {
          map.setTile(tx, ty, TILE_EMPTY);
        }
      }
    }
  }
}

export function bfsParents(d: DungeonLayout): number[] {
  const n = d.roomCount();
  const vis = new Array(n).fill(false);
  const parent = new Array(n).fill(-1);
  const q: number[] = [0];
  vis[0] = true;
  while (q.length > 0) {
    const c = q.shift()!;
    const nb = [d.neighborWest(c), d.neighborEast(c), d.neighborNorth(c), d.neighborSouth(c)];
    for (const v of nb) {
      if (v >= 0 && !vis[v]) {
        vis[v] = true;
        parent[v] = c;
        q.push(v);
      }
    }
  }
  return parent;
}

function sideTowardChild(d: DungeonLayout, parentRoomId: number, childRoomId: number): Side | null {
  if (d.neighborEast(parentRoomId) === childRoomId) return Side.EAST;
  if (d.neighborWest(parentRoomId) === childRoomId) return Side.WEST;
  if (d.neighborSouth(parentRoomId) === childRoomId) return Side.SOUTH;
  if (d.neighborNorth(parentRoomId) === childRoomId) return Side.NORTH;
  return null;
}

function tryPlaceSeal(
  node: { doorWest: boolean; doorEast: boolean; ladderNorth: boolean; ladderSouth: boolean },
  gen: GeneratedRoom,
  side: Side,
): KeyblockSealSpec | null {
  switch (side) {
    case Side.WEST:
      return placeWest(node, gen);
    case Side.EAST:
      return placeEast(node, gen);
    case Side.NORTH:
      return placeNorth(node, gen);
    case Side.SOUTH:
      return placeSouth(node, gen);
  }
}

function doorColumnLooks(map: TileMap, doorX: number, topY: number): boolean {
  return map.tileAt(doorX, topY) === TILE_DOOR || map.tileAt(doorX, topY + 1) === TILE_DOOR;
}

function placeWest(
  node: { doorWest: boolean },
  gen: GeneratedRoom,
): KeyblockSealSpec | null {
  if (!node.doorWest) return null;
  const map = gen.map;
  const w = map.getWidth();
  const h = map.getHeight();
  const lx = gen.leftDoorTileX;
  const ly = gen.leftDoorTopTileY;
  if (lx < 0 || ly < 0 || ly + 1 >= h || lx >= w - 1) return null;
  if (!doorColumnLooks(map, lx, ly)) return null;
  const slots: KeyblockSlot[] = [
    { tx: lx, ty: ly, primary: true, restoreTileId: TILE_DOOR },
    { tx: lx, ty: ly + 1, primary: false, restoreTileId: TILE_DOOR },
  ];
  writeSealTiles(map, slots);
  return makeKeyblockSealSpec(slots);
}

function placeEast(
  node: { doorEast: boolean },
  gen: GeneratedRoom,
): KeyblockSealSpec | null {
  if (!node.doorEast) return null;
  const map = gen.map;
  const w = map.getWidth();
  const h = map.getHeight();
  const rx = gen.rightDoorTileX;
  const ry = gen.rightDoorTopTileY;
  if (rx < 0 || ry < 0 || ry + 1 >= h || rx >= w || rx < 1) return null;
  if (!doorColumnLooks(map, rx, ry)) return null;
  const slots: KeyblockSlot[] = [
    { tx: rx, ty: ry, primary: true, restoreTileId: TILE_DOOR },
    { tx: rx, ty: ry + 1, primary: false, restoreTileId: TILE_DOOR },
  ];
  writeSealTiles(map, slots);
  return makeKeyblockSealSpec(slots);
}

function placeNorth(
  node: { ladderNorth: boolean },
  gen: GeneratedRoom,
): KeyblockSealSpec | null {
  if (!node.ladderNorth) return null;
  const L = gen.ladderColumnTx;
  if (L < 1) return null;
  const map = gen.map;
  const h = map.getHeight();
  let row = southRoomNorthSealY();
  if (
    row < 1 ||
    row >= h - 1 ||
    (map.tileAt(L, row) !== TILE_LADDER && map.tileAt(L, row) !== TILE_EMPTY)
  ) {
    row = firstLadderRowFromTop(map, L);
  }
  if (row < 1 || row >= h - 1) return null;
  const restore = map.tileAt(L, row) === TILE_LADDER ? TILE_LADDER : TILE_EMPTY;
  const slots: KeyblockSlot[] = [{ tx: L, ty: row, primary: true, restoreTileId: restore }];
  writeSealTiles(map, slots);
  return makeKeyblockSealSpec(slots);
}

function placeSouth(
  node: { ladderSouth: boolean },
  gen: GeneratedRoom,
): KeyblockSealSpec | null {
  if (!node.ladderSouth) return null;
  const L = gen.ladderColumnTx;
  if (L < 1) return null;
  const map = gen.map;
  const h = map.getHeight();
  const mouth = operationalSouthMouthRow(map, L);
  if (mouth < 1 || mouth >= h - 1) return null;
  const t = map.tileAt(L, mouth);
  const restore =
    t === TILE_PLATFORM ? TILE_PLATFORM : t === TILE_LADDER ? TILE_LADDER : TILE_PLATFORM;
  const slots: KeyblockSlot[] = [{ tx: L, ty: mouth, primary: true, restoreTileId: restore }];
  writeSealTiles(map, slots);
  return makeKeyblockSealSpec(slots);
}

function firstLadderRowFromTop(map: TileMap, L: number): number {
  for (let y = 1; y < map.getHeight() - 1; y++) {
    if (map.tileAt(L, y) === TILE_LADDER) return y;
  }
  return -1;
}

function writeSealTiles(map: TileMap, slots: KeyblockSlot[]): void {
  for (const s of slots) {
    map.setTile(s.tx, s.ty, s.primary ? TILE_KEYBLOCK : TILE_KEYBLOCK_CONNECTOR);
  }
}
