import { isOneScreenRoomKind, RoomKind } from "./DungeonTypes";
import type { DungeonLayout } from "./DungeonLayout";
import type { GeneratedRoom } from "./RoomGenerator";
import {
  alignLeftDoorTopY,
  alignRightDoorTopY,
  carveHorizontalFace,
  refreshRoomGroundY,
  syncGroundYAlongRunway,
} from "./SecretRoomMapBuild";
import {
  hasXorSecretWiden,
  needsUnconnectedEastPadding,
  needsUnconnectedWestPadding,
  unconnectedWestPaddingCameraTuckTiles,
} from "./SecretRoomLayoutPlanner";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_KEYBLOCK,
  TILE_KEYBLOCK_CONNECTOR,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "./TileMap";
import * as VerticalSeamGeometry from "./VerticalSeamGeometry";
import { TILE_SIZE } from "../specs";

/** Mirror SpawnKind numeric values without importing roomTransition (ownership boundary). */
export const SPAWN_FROM_WEST = 1;
export const SPAWN_FROM_EAST = 2;
export const SPAWN_FROM_ABOVE = 3;
export const SPAWN_FROM_BELOW = 4;

const ROLE_BREAKABLE = 0;
const ROLE_HIDDEN_BUFFER = 1;
const ROLE_HIDDEN_BUFFER_WEST = 2;
const ROLE_HIDDEN_BUFFER_EAST = 3;

export enum SeamKind {
  HORIZONTAL_DOOR = 0,
  VERTICAL_LADDER = 1,
}

export enum SeamTraverseDir {
  HORIZONTAL_FROM_WEST = 0,
  HORIZONTAL_FROM_EAST = 1,
  VERTICAL_FROM_ABOVE = 2,
  VERTICAL_FROM_BELOW = 3,
}

/** Map SpawnKind → seam traverse dir (Java GamePanel.seamTraverseDirFor). */
export function seamTraverseDirFor(spawnKind: number): SeamTraverseDir | null {
  switch (spawnKind) {
    case SPAWN_FROM_WEST:
      return SeamTraverseDir.HORIZONTAL_FROM_WEST;
    case SPAWN_FROM_EAST:
      return SeamTraverseDir.HORIZONTAL_FROM_EAST;
    case SPAWN_FROM_ABOVE:
      return SeamTraverseDir.VERTICAL_FROM_ABOVE;
    case SPAWN_FROM_BELOW:
      return SeamTraverseDir.VERTICAL_FROM_BELOW;
    default:
      return null;
  }
}

/**
 * Post-swap hook for movement / mount: open the entered-room seam face.
 * Export lives here so Player / roomFade / transition guts stay untouched.
 */
export function onRoomEntered(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  seams: SecretSeam[] | null | undefined,
  fromRoom: number,
  toRoom: number,
  spawnKind: number,
): void {
  if (fromRoom < 0 || fromRoom === toRoom) return;
  const dir = seamTraverseDirFor(spawnKind);
  if (dir == null) return;
  openEnteredFaceForTransition(layout, rooms, seams, fromRoom, toRoom, dir);
}

export function openEnteredFaceForTransition(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  seams: SecretSeam[] | null | undefined,
  fromRoom: number,
  toRoom: number,
  dir: SeamTraverseDir,
): void {
  if (seams == null) return;
  const seam = findSeamForTransition(seams, fromRoom, toRoom, dir);
  if (seam != null && !seam.isDone()) {
    seam.openRoomFaceInstant(layout, rooms, toRoom);
  }
}

/**
 * True when this room has at least one horizontal secret exit whose face buffers are revealed
 * (Java SecretEntrancePlacer.roomHasOpenedHorizontalSecretExit).
 */
export function roomHasOpenedHorizontalSecretExit(
  seams: SecretSeam[] | null | undefined,
  roomId: number,
  gen: GeneratedRoom | null | undefined,
): boolean {
  if (!seams || !gen) return false;
  for (const seam of seams) {
    if (seam.kind !== SeamKind.HORIZONTAL_DOOR) continue;
    if (seam.roomA === roomId && gen.rightDoorTileX >= 0 && seam.isEastFaceBufferRevealed(roomId)) {
      return true;
    }
    if (seam.roomB === roomId && gen.leftDoorTileX >= 0 && seam.isWestFaceBufferRevealed(roomId)) {
      return true;
    }
  }
  return false;
}

export function findSeamForTransition(
  seams: SecretSeam[],
  fromRoom: number,
  toRoom: number,
  dir: SeamTraverseDir,
): SecretSeam | null {
  for (const seam of seams) {
    if (seam.isDone() || !seam.linksRooms(fromRoom, toRoom)) continue;
    if (seamMatchesTraverseDir(seam, fromRoom, toRoom, dir)) return seam;
  }
  return null;
}

function seamMatchesTraverseDir(
  seam: SecretSeam,
  fromRoom: number,
  toRoom: number,
  dir: SeamTraverseDir,
): boolean {
  switch (dir) {
    case SeamTraverseDir.HORIZONTAL_FROM_WEST:
      return seam.kind === SeamKind.HORIZONTAL_DOOR && seam.roomA === fromRoom && seam.roomB === toRoom;
    case SeamTraverseDir.HORIZONTAL_FROM_EAST:
      return seam.kind === SeamKind.HORIZONTAL_DOOR && seam.roomA === toRoom && seam.roomB === fromRoom;
    case SeamTraverseDir.VERTICAL_FROM_ABOVE:
      return seam.kind === SeamKind.VERTICAL_LADDER && seam.roomA === fromRoom && seam.roomB === toRoom;
    case SeamTraverseDir.VERTICAL_FROM_BELOW:
      return seam.kind === SeamKind.VERTICAL_LADDER && seam.roomA === toRoom && seam.roomB === fromRoom;
  }
}

function isSecretKind(k: RoomKind): boolean {
  return k === RoomKind.SECRET || k === RoomKind.SUPER_SECRET;
}

/** Place hidden breakable shells on secret/super-secret edges (Java SecretEntrancePlacer.place). */
export function placeSecretEntrances(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
): SecretSeam[] {
  const out: SecretSeam[] = [];
  const n = layout.roomCount();
  const horizontalEdges = new Set<string>();
  const verticalEdges = new Set<string>();
  for (let id = 0; id < n; id++) {
    if (!isSecretKind(layout.room(id).kind)) continue;
    const e = layout.neighborEast(id);
    if (e >= 0 && horizontalEdges.add(edgeKey(id, e))) {
      tryAddHorizontalSeam(layout, rooms, out, id, e);
    }
    const w = layout.neighborWest(id);
    if (w >= 0 && horizontalEdges.add(edgeKey(w, id))) {
      tryAddHorizontalSeam(layout, rooms, out, w, id);
    }
    const north = layout.neighborNorth(id);
    if (north >= 0 && verticalEdges.add(edgeKey(north, id))) {
      tryAddVerticalSeam(layout, rooms, out, north, id);
    }
    const south = layout.neighborSouth(id);
    if (south >= 0 && verticalEdges.add(edgeKey(id, south))) {
      tryAddVerticalSeam(layout, rooms, out, id, south);
    }
  }
  // Java place() vertical pass order.
  for (const seam of out) {
    if (seam.kind === SeamKind.VERTICAL_LADDER) {
      applyVerticalSealedSolids(layout, rooms, seam);
      applyVerticalNorthSealedSolids(layout, rooms, seam);
    }
  }
  for (const seam of out) {
    if (seam.kind === SeamKind.VERTICAL_LADDER) {
      carveVerticalStrikeLanes(layout, rooms, seam);
    }
  }
  for (const seam of out) {
    if (seam.kind === SeamKind.VERTICAL_LADDER) {
      reseatNorthRoomSouthFaceSeal(layout, rooms, seam);
    }
  }
  enforceVerticalSouthSealedBands(layout, rooms, out);

  const refresh = new Set<number>();
  for (const seam of out) {
    refresh.add(seam.roomA);
    refresh.add(seam.roomB);
  }
  for (let id = 0; id < n; id++) {
    if (isSecretKind(layout.room(id).kind)) refresh.add(id);
  }
  for (const id of refresh) {
    refreshRoomGroundY(rooms[id]!);
  }
  return out;
}

function edgeKey(a: number, b: number): string {
  return `${a}:${b}`;
}

function clearKeyblockAt(map: TileMap, tx: number, ty: number): void {
  const t = map.tileAt(tx, ty);
  if (t === TILE_KEYBLOCK || t === TILE_KEYBLOCK_CONNECTOR) {
    map.setTile(tx, ty, TILE_EMPTY);
  }
}

function stampSeamBreakable(map: TileMap, tx: number, ty: number): void {
  clearKeyblockAt(map, tx, ty);
  map.setTile(tx, ty, TILE_BREAKABLE);
}

function isHorizontalDoorCell(map: TileMap, x: number, y: number): boolean {
  const t = map.tileAt(x, y);
  return t === TILE_DOOR || t === TILE_BREAKABLE;
}

/**
 * Ensure both faces share doorTop, with full runway + SEC-SHELL-COL-1 carve
 * (Java align* + carveHorizontalFace). Always re-carve both sides so shells exist
 * even when tops already matched (web has no SecretRoomMapBuild.finish at gen).
 */
function alignAndCarveHorizontalFaces(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  westRoomId: number,
  eastRoomId: number,
): { ry: number; ly: number } | null {
  const gW = rooms[westRoomId]!;
  const gE = rooms[eastRoomId]!;
  const rx = gW.rightDoorTileX;
  let ry = gW.rightDoorTopTileY;
  const lx = gE.leftDoorTileX;
  let ly = gE.leftDoorTopTileY;
  if (rx < 0 || ry < 0 || lx < 0 || ly < 0) return null;

  if (ry !== ly) {
    const westSecret = isSecretKind(layout.room(westRoomId).kind);
    const eastSecret = isSecretKind(layout.room(eastRoomId).kind);
    if (westSecret && !eastSecret) {
      alignLeftDoorTopY(gE, lx, ry);
      ly = gE.leftDoorTopTileY;
    } else if (eastSecret && !westSecret) {
      alignRightDoorTopY(gW, rx, ly);
      ry = gW.rightDoorTopTileY;
    } else {
      alignLeftDoorTopY(gE, lx, ry);
      ly = gE.leftDoorTopTileY;
    }
  }
  if (ry !== ly) return null;

  // Re-carve both faces at the agreed top (shells + runway + play floor).
  carveHorizontalFace(gW.map, rx, ry, true, gW.ladderColumnTx, true);
  syncGroundYAlongRunway(gW, rx, ry, true);
  gW.rightDoorTopTileY = ry;
  carveHorizontalFace(gE.map, lx, ly, false, gE.ladderColumnTx, true);
  syncGroundYAlongRunway(gE, lx, ly, false);
  gE.leftDoorTopTileY = ly;
  return { ry, ly };
}

function tryAddHorizontalSeam(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  out: SecretSeam[],
  westRoomId: number,
  eastRoomId: number,
): void {
  const aligned = alignAndCarveHorizontalFaces(layout, rooms, westRoomId, eastRoomId);
  if (!aligned) return;
  const gW = rooms[westRoomId]!;
  const gE = rooms[eastRoomId]!;
  const rx = gW.rightDoorTileX;
  const lx = gE.leftDoorTileX;
  const { ry, ly } = aligned;

  const mW = gW.map;
  const mE = gE.map;
  if (!isHorizontalDoorCell(mW, rx, ry) || !isHorizontalDoorCell(mE, lx, ly)) return;

  const b = new SeamBuilder(SeamKind.HORIZONTAL_DOOR, -1, westRoomId, eastRoomId);
  applyHorizontalShell(b, westRoomId, mW, rx, true);
  applyHorizontalShell(b, eastRoomId, mE, lx, false);
  for (let dy = 0; dy <= 1; dy++) {
    b.addBreakable(westRoomId, rx, ry + dy, TILE_DOOR);
    b.addBreakable(eastRoomId, lx, ly + dy, TILE_DOOR);
    stampSeamBreakable(mW, rx, ry + dy);
    stampSeamBreakable(mE, lx, ly + dy);
  }
  const seam = b.build();
  if (seam) out.push(seam);
}

function applyHorizontalShell(
  b: SeamBuilder,
  roomId: number,
  map: TileMap,
  doorX: number,
  eastFace: boolean,
): void {
  const w = map.getWidth();
  const h = map.getHeight();
  const exteriorX = eastFace ? Math.min(w - 1, doorX + 1) : Math.max(0, doorX - 1);
  const bufferRole = eastFace ? ROLE_HIDDEN_BUFFER_EAST : ROLE_HIDDEN_BUFFER_WEST;
  for (let y = 1; y < h - 1; y++) {
    b.addHiddenBuffer(roomId, exteriorX, y, bufferRole);
  }
}

function tryAddVerticalSeam(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  out: SecretSeam[],
  northRoomId: number,
  southRoomId: number,
): void {
  const northNode = layout.room(northRoomId);
  const southNode = layout.room(southRoomId);
  if (!northNode.ladderSouth || !southNode.ladderNorth) return;
  const gN = rooms[northRoomId];
  const gS = rooms[southRoomId];
  if (!gN || !gS) return;

  let layoutL = northNode.ladderColumnTx;
  if (layoutL < 0) layoutL = southNode.ladderColumnTx;
  if (layoutL < 0) return;

  const mN = gN.map;
  const mS = gS.map;
  const lN = clampLadderColumn(mN.getWidth(), layoutL);
  const lS = clampLadderColumn(mS.getWidth(), layoutL);
  const hN = mN.getHeight();

  const b = new SeamBuilder(SeamKind.VERTICAL_LADDER, layoutL, northRoomId, southRoomId);
  applyVerticalShell(b, northRoomId, mN, lN, hN - 1, true, northNode.kind);
  applyVerticalShell(b, southRoomId, mS, lS, 0, false, southNode.kind);

  const northSouthY = VerticalSeamGeometry.northRoomSouthSealY(mN, lN);
  const southNorthY = VerticalSeamGeometry.southRoomNorthSealY();
  if (!addVerticalFaceBreakable(b, northRoomId, lN, northSouthY, mN)) return;
  if (!addVerticalFaceBreakable(b, southRoomId, lS, southNorthY, mS)) return;

  if (southNode.ladderNorth) {
    const t0 = mS.tileAt(lS, 0);
    if (t0 !== TILE_DOOR && t0 !== TILE_BREAKABLE) {
      mS.setTile(lS, 0, TILE_EMPTY);
    }
  }

  const seam = b.build();
  if (seam) out.push(seam);
}

function clampLadderColumn(mapWidthTiles: number, layoutL: number): number {
  return Math.max(3, Math.min(layoutL, mapWidthTiles - 4));
}

function addVerticalFaceBreakable(
  b: SeamBuilder,
  roomId: number,
  ladderTx: number,
  y: number,
  map: TileMap,
): boolean {
  if (y < 1 || y >= map.getHeight() - 1) return false;
  const restore = map.tileAt(ladderTx, y) === TILE_PLATFORM ? TILE_PLATFORM : TILE_LADDER;
  b.addBreakable(roomId, ladderTx, y, restore);
  stampSeamBreakable(map, ladderTx, y);
  return true;
}

function applyVerticalShell(
  b: SeamBuilder,
  roomId: number,
  map: TileMap,
  ladderTx: number,
  edgeRow: number,
  edgeIsSouthFace: boolean,
  roomKind: RoomKind,
): void {
  const w = map.getWidth();
  const h = map.getHeight();
  const oneScreen = isOneScreenRoomKind(roomKind);
  const bufferRow = oneScreen ? (edgeIsSouthFace ? h - 1 : 0) : edgeRow;
  for (let x = 1; x < w - 1; x++) {
    if (x === ladderTx) continue;
    b.addHiddenBuffer(roomId, x, bufferRow, ROLE_HIDDEN_BUFFER);
  }
}

function applyVerticalSealedSolids(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  seam: SecretSeam,
): void {
  if (seam.kind !== SeamKind.VERTICAL_LADDER) return;
  const northId = seam.roomA;
  const northNode = layout.room(northId);
  if (!northNode.ladderSouth) return;
  const gN = rooms[northId];
  const lN = seam.ladderTxInRoom(northId);
  if (!gN || lN < 0) return;
  const mN = gN.map;
  const h = mN.getHeight();
  const mouthRow = VerticalSeamGeometry.mouthRow(mN, lN);
  const sealY = seam.southFaceSealY(northId, lN, mouthRow);
  const bandStart = VerticalSeamGeometry.southSealedBandStartY(mouthRow);
  for (let y = bandStart; y < h; y++) {
    if (y === sealY) continue;
    const t = mN.tileAt(lN, y);
    if (t === TILE_DOOR || t === TILE_BREAKABLE) continue;
    mN.setTile(lN, y, TILE_SOLID);
  }
  if (mN.tileAt(lN, h - 1) !== TILE_DOOR && mN.tileAt(lN, h - 1) !== TILE_BREAKABLE) {
    mN.setTile(lN, h - 1, TILE_SOLID);
  }
}

function applyVerticalNorthSealedSolids(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  seam: SecretSeam,
): void {
  if (seam.kind !== SeamKind.VERTICAL_LADDER) return;
  const southId = seam.roomB;
  if (!layout.room(southId).ladderNorth) return;
  const gS = rooms[southId];
  const lS = seam.ladderTxInRoom(southId);
  if (!gS || lS < 0) return;
  const t0 = gS.map.tileAt(lS, 0);
  if (t0 !== TILE_DOOR && t0 !== TILE_BREAKABLE) {
    gS.map.setTile(lS, 0, TILE_EMPTY);
  }
}

function carveVerticalStrikeLanes(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  seam: SecretSeam,
): void {
  const northId = seam.roomA;
  if (layout.room(northId).ladderSouth) {
    const gN = rooms[northId];
    const lN = seam.ladderTxInRoom(northId);
    if (gN && lN >= 0) {
      const sealY = VerticalSeamGeometry.northRoomSouthSealY(gN.map, lN);
      VerticalSeamGeometry.carveStrikeLaneBesideSeal(gN.map, lN, sealY);
    }
  }
  const southId = seam.roomB;
  if (layout.room(southId).ladderNorth) {
    const gS = rooms[southId];
    const lS = seam.ladderTxInRoom(southId);
    if (gS && lS >= 0) {
      VerticalSeamGeometry.carveStrikeLaneBesideSeal(
        gS.map,
        lS,
        VerticalSeamGeometry.southRoomNorthSealY(),
      );
    }
  }
}

function reseatNorthRoomSouthFaceSeal(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  seam: SecretSeam,
): void {
  if (seam.kind !== SeamKind.VERTICAL_LADDER) return;
  const northId = seam.roomA;
  if (!layout.room(northId).ladderSouth) return;
  const gN = rooms[northId];
  const lN = seam.ladderTxInRoom(northId);
  if (!gN || lN < 0) return;
  const map = gN.map;
  const sealY = VerticalSeamGeometry.northRoomSouthSealY(map, lN);
  const idx = seam.southFaceBreakableIndex(northId, lN);
  if (idx < 0) return;
  const oldY = seam.tyAt(idx);
  if (oldY === sealY) {
    applyVerticalSealedSolids(layout, rooms, seam);
    return;
  }
  const restore = seam.restoreAt(idx);
  if (oldY >= 1 && oldY < map.getHeight() - 1 && map.tileAt(lN, oldY) === TILE_BREAKABLE) {
    map.setTile(lN, oldY, restore);
  }
  seam.setTyAt(idx, sealY);
  stampSeamBreakable(map, lN, sealY);
  applyVerticalSealedSolids(layout, rooms, seam);
}

function enforceVerticalSouthSealedBands(
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  seams: SecretSeam[],
): void {
  for (const seam of seams) {
    if (seam.kind === SeamKind.VERTICAL_LADDER) {
      applyVerticalSealedSolids(layout, rooms, seam);
    }
  }
}

class SeamBuilder {
  private readonly roomIds: number[] = [];
  private readonly xs: number[] = [];
  private readonly ys: number[] = [];
  private readonly restores: number[] = [];
  private readonly roles: number[] = [];

  constructor(
    readonly kind: SeamKind,
    readonly ladderTx: number,
    readonly roomA: number,
    readonly roomB: number,
  ) {}

  addBreakable(roomId: number, x: number, y: number, restore: number): void {
    this.roomIds.push(roomId);
    this.xs.push(x);
    this.ys.push(y);
    this.restores.push(restore);
    this.roles.push(ROLE_BREAKABLE);
  }

  addHiddenBuffer(roomId: number, x: number, y: number, role: number): void {
    this.roomIds.push(roomId);
    this.xs.push(x);
    this.ys.push(y);
    this.restores.push(TILE_SOLID);
    this.roles.push(role);
  }

  build(): SecretSeam | null {
    let breakables = 0;
    for (const r of this.roles) if (r === ROLE_BREAKABLE) breakables++;
    if (breakables === 0) return null;
    return new SecretSeam(
      this.kind,
      this.roomIds.slice(),
      this.xs.slice(),
      this.ys.slice(),
      this.restores.slice(),
      this.roles.slice(),
      this.ladderTx,
      this.roomA,
      this.roomB,
      breakables,
    );
  }
}

export class SecretSeam {
  private readonly cleared: boolean[];
  private readonly bufferRevealed: boolean[];
  private breakablesRemaining: number;

  constructor(
    readonly kind: SeamKind,
    private readonly roomId: number[],
    private readonly tx: number[],
    private readonly ty: number[],
    private readonly restoreTileId: number[],
    private readonly cellRole: number[],
    private readonly ladderTx: number,
    readonly roomA: number,
    readonly roomB: number,
    breakablesRemaining: number,
  ) {
    this.cleared = new Array(roomId.length).fill(false);
    this.bufferRevealed = new Array(roomId.length).fill(false);
    this.breakablesRemaining = breakablesRemaining;
  }

  get cellCount(): number {
    return this.roomId.length;
  }

  roomIdAt(i: number): number {
    return this.roomId[i]!;
  }

  txAt(i: number): number {
    return this.tx[i]!;
  }

  tyAt(i: number): number {
    return this.ty[i]!;
  }

  cellRoleAt(i: number): number {
    return this.cellRole[i]!;
  }

  isDone(): boolean {
    return this.breakablesRemaining < 0;
  }

  linksRooms(a: number, b: number): boolean {
    return (this.roomA === a && this.roomB === b) || (this.roomA === b && this.roomB === a);
  }

  isHiddenBreakable(rid: number, x: number, y: number): boolean {
    for (let i = 0; i < this.roomId.length; i++) {
      if (
        this.cellRole[i] === ROLE_BREAKABLE &&
        this.roomId[i] === rid &&
        this.tx[i] === x &&
        this.ty[i] === y
      ) {
        return true;
      }
    }
    return false;
  }

  ladderTxInRoom(rid: number): number {
    for (let i = 0; i < this.roomId.length; i++) {
      if (this.cellRole[i] === ROLE_BREAKABLE && this.roomId[i] === rid) {
        return this.tx[i]!;
      }
    }
    return this.ladderTx;
  }

  roomWestId(): number {
    return this.roomA;
  }

  roomEastId(): number {
    return this.roomB;
  }

  breakableCount(): number {
    let n = 0;
    for (const r of this.cellRole) if (r === ROLE_BREAKABLE) n++;
    return n;
  }

  breakableIndexIsInRoom(index: number, rid: number): boolean {
    let k = 0;
    for (let i = 0; i < this.cellRole.length; i++) {
      if (this.cellRole[i] !== ROLE_BREAKABLE) continue;
      if (k === index) return this.roomId[i] === rid;
      k++;
    }
    return false;
  }

  breakableTx(index: number): number {
    return this.breakableCoord(index)[0]!;
  }

  breakableTy(index: number): number {
    return this.breakableCoord(index)[1]!;
  }

  breakableRestore(index: number): number {
    return this.breakableCoord(index)[2]!;
  }

  private breakableCoord(index: number): [number, number, number] {
    let k = 0;
    for (let i = 0; i < this.cellRole.length; i++) {
      if (this.cellRole[i] !== ROLE_BREAKABLE) continue;
      if (k === index) return [this.tx[i]!, this.ty[i]!, this.restoreTileId[i]!];
      k++;
    }
    return [-1, -1, TILE_EMPTY];
  }

  /** South room (roomB) north-edge shell B. */
  isNorthFaceBreakable(_mapHeight: number, rid: number, tx: number, ty: number): boolean {
    if (this.kind !== SeamKind.VERTICAL_LADDER || rid !== this.roomB) return false;
    return this.isHiddenBreakable(rid, tx, ty);
  }

  /** North room (roomA) south-edge shell B. */
  isSouthFaceBreakable(_mapHeight: number, rid: number, tx: number, ty: number): boolean {
    if (this.kind !== SeamKind.VERTICAL_LADDER || rid !== this.roomA) return false;
    return this.isHiddenBreakable(rid, tx, ty);
  }

  /** Index of north-room south-face shell breakable at L, or -1. */
  southFaceBreakableIndex(northRoomId: number, ladderTx: number): number {
    if (this.kind !== SeamKind.VERTICAL_LADDER || northRoomId !== this.roomA) return -1;
    for (let i = 0; i < this.roomId.length; i++) {
      if (
        this.cellRole[i] === ROLE_BREAKABLE &&
        this.roomId[i] === northRoomId &&
        this.tx[i] === ladderTx
      ) {
        return i;
      }
    }
    return -1;
  }

  /** Stamped south-face seal Y, or mouth−1 fallback. */
  southFaceSealY(northRoomId: number, ladderTx: number, mouthRow: number): number {
    if (this.kind !== SeamKind.VERTICAL_LADDER || northRoomId !== this.roomA) {
      return Math.max(1, mouthRow - 1);
    }
    const idx = this.southFaceBreakableIndex(northRoomId, ladderTx);
    return idx >= 0 ? this.ty[idx]! : Math.max(1, mouthRow - 1);
  }

  restoreAt(index: number): number {
    return this.restoreTileId[index] ?? TILE_EMPTY;
  }

  /** Mutable ty for reseat (Java seam.ty[idx] = sealY). */
  setTyAt(index: number, y: number): void {
    if (index >= 0 && index < this.ty.length) this.ty[index] = y;
  }

  /** Mark one shell breakable cleared without finishing the seam (animation step). */
  markBreakableCleared(rid: number, cellX: number, cellY: number): void {
    for (let i = 0; i < this.roomId.length; i++) {
      if (
        this.cellRole[i] !== ROLE_BREAKABLE ||
        this.cleared[i] ||
        this.roomId[i] !== rid ||
        this.tx[i] !== cellX ||
        this.ty[i] !== cellY
      ) {
        continue;
      }
      this.cleared[i] = true;
      this.breakablesRemaining--;
      return;
    }
  }

  /** End of SEAM-ANIM strip in animRoomId. */
  completeAnimatedOpen(
    _layout: DungeonLayout,
    rooms: GeneratedRoom[],
    animRoomId: number,
    unlockSouthLadderShaft: boolean,
  ): void {
    if (unlockSouthLadderShaft && this.kind === SeamKind.VERTICAL_LADDER) {
      finalizeNorthSouthMouth(rooms[animRoomId]!, this.ladderTxInRoom(animRoomId));
    }
    this.revealBuffersForRoom(rooms, animRoomId);
    if (this.breakablesRemaining === 0) this.finishOpen(rooms);
  }

  openRoomFaceInstant(layout: DungeonLayout, rooms: GeneratedRoom[], rid: number): void {
    for (let i = 0; i < this.roomId.length; i++) {
      if (this.cellRole[i] !== ROLE_BREAKABLE || this.cleared[i] || this.roomId[i] !== rid) {
        continue;
      }
      this.cleared[i] = true;
      this.breakablesRemaining--;
      rooms[rid]!.map.setTile(this.tx[i]!, this.ty[i]!, this.restoreTileId[i]!);
    }
    if (this.kind === SeamKind.VERTICAL_LADDER && layout.room(rid).ladderNorth) {
      const g = rooms[rid]!;
      const l = this.ladderTxInRoom(rid);
      if (l >= 0) {
        const t0 = g.map.tileAt(l, 0);
        if (t0 !== TILE_DOOR && t0 !== TILE_BREAKABLE) {
          g.map.setTile(l, 0, TILE_LADDER);
        }
      }
    }
    if (
      this.kind === SeamKind.VERTICAL_LADDER &&
      rid === this.roomA &&
      layout.room(rid).ladderSouth
    ) {
      finalizeNorthSouthMouth(rooms[rid]!, this.ladderTxInRoom(rid));
    }
    this.revealBuffersForRoom(rooms, rid);
    if (this.breakablesRemaining === 0) this.finishOpen(rooms);
  }

  onTileOpened(
    rooms: GeneratedRoom[],
    rid: number,
    x: number,
    y: number,
    layout?: DungeonLayout | null,
  ): void {
    if (this.breakablesRemaining < 0) return;
    for (let i = 0; i < this.roomId.length; i++) {
      if (
        this.cellRole[i] !== ROLE_BREAKABLE ||
        this.cleared[i] ||
        this.roomId[i] !== rid ||
        this.tx[i] !== x ||
        this.ty[i] !== y
      ) {
        continue;
      }
      this.cleared[i] = true;
      this.breakablesRemaining--;
      rooms[rid]!.map.setTile(x, y, this.restoreTileId[i]!);
      if (
        layout &&
        this.kind === SeamKind.VERTICAL_LADDER &&
        rid === this.roomA &&
        layout.room(rid).ladderSouth &&
        this.allBreakablesClearedForRoom(rid)
      ) {
        finalizeNorthSouthMouth(rooms[rid]!, this.ladderTxInRoom(rid));
      }
      this.revealBuffersForRoom(rooms, rid);
      break;
    }
    if (this.breakablesRemaining === 0) this.finishOpen(rooms);
  }

  /** True when every east-face horizontal buffer for rid is revealed. */
  isEastFaceBufferRevealed(rid: number): boolean {
    let found = false;
    for (let i = 0; i < this.roomId.length; i++) {
      if (this.roomId[i] === rid && this.cellRole[i] === ROLE_HIDDEN_BUFFER_EAST) {
        found = true;
        if (!this.bufferRevealed[i]) return false;
      }
    }
    return found;
  }

  /** True when every west-face horizontal buffer for rid is revealed. */
  isWestFaceBufferRevealed(rid: number): boolean {
    let found = false;
    for (let i = 0; i < this.roomId.length; i++) {
      if (this.roomId[i] === rid && this.cellRole[i] === ROLE_HIDDEN_BUFFER_WEST) {
        found = true;
        if (!this.bufferRevealed[i]) return false;
      }
    }
    return found;
  }

  snapshotBufferRevealed(): boolean[] {
    return this.bufferRevealed.slice();
  }

  restoreBufferRevealed(snap: boolean[]): void {
    if (snap.length === this.bufferRevealed.length) {
      for (let i = 0; i < snap.length; i++) this.bufferRevealed[i] = snap[i]!;
    }
  }

  probeRevealEastBuffers(rid: number): void {
    for (let i = 0; i < this.roomId.length; i++) {
      if (this.roomId[i] === rid && this.cellRole[i] === ROLE_HIDDEN_BUFFER_EAST) {
        this.bufferRevealed[i] = true;
      }
    }
  }

  probeRevealWestBuffers(rid: number): void {
    for (let i = 0; i < this.roomId.length; i++) {
      if (this.roomId[i] === rid && this.cellRole[i] === ROLE_HIDDEN_BUFFER_WEST) {
        this.bufferRevealed[i] = true;
      }
    }
  }

  private revealBuffersForRoom(rooms: GeneratedRoom[], rid: number): void {
    if (!this.allBreakablesClearedForRoom(rid)) return;
    for (let i = 0; i < this.roomId.length; i++) {
      if (
        !isBufferRole(this.cellRole[i]!) ||
        this.roomId[i] !== rid ||
        this.bufferRevealed[i] ||
        !this.bufferRoleMatchesSeamKind(this.cellRole[i]!)
      ) {
        continue;
      }
      this.bufferRevealed[i] = true;
      const map = rooms[rid]!.map;
      if (map.tileAt(this.tx[i]!, this.ty[i]!) !== TILE_SOLID) {
        map.setTile(this.tx[i]!, this.ty[i]!, TILE_SOLID);
      }
    }
  }

  private bufferRoleMatchesSeamKind(role: number): boolean {
    if (this.kind === SeamKind.HORIZONTAL_DOOR) {
      return role === ROLE_HIDDEN_BUFFER_WEST || role === ROLE_HIDDEN_BUFFER_EAST;
    }
    return role === ROLE_HIDDEN_BUFFER;
  }

  private allBreakablesClearedForRoom(rid: number): boolean {
    for (let i = 0; i < this.roomId.length; i++) {
      if (this.cellRole[i] === ROLE_BREAKABLE && this.roomId[i] === rid && !this.cleared[i]) {
        return false;
      }
    }
    return true;
  }

  private finishOpen(rooms: GeneratedRoom[]): void {
    this.breakablesRemaining = -1;
    for (let i = 0; i < this.roomId.length; i++) {
      if (!isBufferRole(this.cellRole[i]!) || !this.bufferRoleMatchesSeamKind(this.cellRole[i]!)) {
        continue;
      }
      this.bufferRevealed[i] = true;
      this.cleared[i] = true;
      const map = rooms[this.roomId[i]!]!.map;
      if (map.tileAt(this.tx[i]!, this.ty[i]!) !== TILE_SOLID) {
        map.setTile(this.tx[i]!, this.ty[i]!, TILE_SOLID);
      }
    }
  }
}

function isBufferRole(role: number): boolean {
  return (
    role === ROLE_HIDDEN_BUFFER ||
    role === ROLE_HIDDEN_BUFFER_WEST ||
    role === ROLE_HIDDEN_BUFFER_EAST
  );
}

/** Thin south-mouth reopen after north-room face opens (Java finalizeLadderShaft subset). */
function finalizeNorthSouthMouth(room: GeneratedRoom, ladderTx: number): void {
  if (ladderTx < 0) return;
  const map = room.map;
  const h = map.getHeight();
  const mouthRow = Math.max(
    1,
    Math.min(VerticalSeamGeometry.operationalSouthMouthRow(map, ladderTx), h - 2),
  );
  if (map.tileAt(ladderTx, mouthRow) !== TILE_DOOR && map.tileAt(ladderTx, mouthRow) !== TILE_BREAKABLE) {
    map.setTile(ladderTx, mouthRow, TILE_PLATFORM);
  }
  for (let y = mouthRow + 1; y < h - 1; y++) {
    if (map.tileAt(ladderTx, y) === TILE_DOOR || map.tileAt(ladderTx, y) === TILE_BREAKABLE) continue;
    map.setTile(ladderTx, y, TILE_LADDER);
  }
  if (map.tileAt(ladderTx, h - 1) !== TILE_DOOR && map.tileAt(ladderTx, h - 1) !== TILE_BREAKABLE) {
    map.setTile(ladderTx, h - 1, TILE_LADDER);
  }
  room.groundY[ladderTx] = mouthRow;
}

/** World-space horizontal view interval for camera clamping (Java PlayableScrollX). */
export type PlayableScrollX = {
  minX: number;
  maxX: number;
  westSeamBound: boolean;
  eastSeamBound: boolean;
  westStructuralBound: boolean;
  eastStructuralBound: boolean;
  westEdgeTight: boolean;
  eastEdgeTight: boolean;
};

/**
 * Playable X interval: sealed buffers stay off-camera; opened faces reveal half a buffer column.
 * Java SecretSeam.computePlayableScrollX.
 */
export function computePlayableScrollX(
  seams: SecretSeam[] | null | undefined,
  roomId: number,
  gen: GeneratedRoom,
  mapWidthPx: number,
  layout: DungeonLayout,
): PlayableScrollX {
  let minX = 0;
  let maxX = mapWidthPx;
  let westSeam = false;
  let eastSeam = false;
  let westStructural = false;
  let eastStructural = false;
  const half = TILE_SIZE * 0.5;
  const tierOneXorSealed = hasXorSecretWiden(layout, roomId);

  if (seams) {
    for (const seam of seams) {
      if (seam.kind !== SeamKind.HORIZONTAL_DOOR) continue;
      if (seam.roomA === roomId) {
        const doorX = gen.rightDoorTileX;
        if (doorX >= 0) {
          let bound: number;
          if (seam.isEastFaceBufferRevealed(roomId)) {
            bound = (doorX + 1) * TILE_SIZE + half;
          } else if (tierOneXorSealed) {
            bound = (doorX + 1) * TILE_SIZE;
          } else {
            bound = doorX * TILE_SIZE + half;
          }
          maxX = Math.min(maxX, Math.min(mapWidthPx, bound));
          eastSeam = true;
        }
      }
      if (seam.roomB === roomId) {
        const doorX = gen.leftDoorTileX;
        if (doorX >= 0) {
          let bound: number;
          if (seam.isWestFaceBufferRevealed(roomId)) {
            bound = Math.max(0, doorX * TILE_SIZE - half);
          } else if (tierOneXorSealed) {
            bound = doorX * TILE_SIZE;
          } else {
            bound = doorX * TILE_SIZE + half;
          }
          minX = Math.max(minX, bound);
          westSeam = true;
        }
      }
    }
  }

  if (needsUnconnectedWestPadding(layout, roomId)) {
    const tuck = unconnectedWestPaddingCameraTuckTiles(layout, roomId);
    minX = Math.max(minX, tuck * TILE_SIZE - half);
    westStructural = true;
  }
  if (needsUnconnectedEastPadding(layout, roomId)) {
    maxX = Math.min(maxX, mapWidthPx - 2 * TILE_SIZE + half);
    eastStructural = true;
  }

  return {
    minX,
    maxX,
    westSeamBound: westSeam,
    eastSeamBound: eastSeam,
    westStructuralBound: westStructural,
    eastStructuralBound: eastStructural,
    westEdgeTight: westSeam || westStructural,
    eastEdgeTight: eastSeam || eastStructural,
  };
}
