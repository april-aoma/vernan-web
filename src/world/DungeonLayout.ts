import { JavaRandom, toJavaLong } from "../util/JavaRandom";
import { javaShuffle } from "../util/javaCollections";
import {
  cellKey,
  graphDegree,
  RoomKind,
  type RoomNode,
} from "./DungeonTypes";
import { insertSecrets, meetsTargets } from "./SecretRoomGraphPlacer";

const SPECIAL_ROOM_ATTEMPTS = 256;
const LEAF_BIAS = 0.65;
const GOLDEN = 0x9e3779b97f4a7c15n;

/**
 * Pre-generated graph of rooms (Java DungeonLayout).
 */
export class DungeonLayout {
  private readonly rooms: RoomNode[];
  private readonly cellToId: Map<string, number>;

  constructor(rooms: RoomNode[], cellToId: Map<string, number>) {
    this.rooms = rooms;
    this.cellToId = cellToId;
  }

  roomCount(): number {
    return this.rooms.length;
  }

  room(id: number): RoomNode {
    return this.rooms[id]!;
  }

  roomIdAt(gridX: number, gridY: number): number {
    return this.cellToId.get(cellKey(gridX, gridY)) ?? -1;
  }

  neighborWest(roomId: number): number {
    const r = this.rooms[roomId]!;
    return this.roomIdAt(r.gridX - 1, r.gridY);
  }

  neighborEast(roomId: number): number {
    const r = this.rooms[roomId]!;
    return this.roomIdAt(r.gridX + 1, r.gridY);
  }

  neighborNorth(roomId: number): number {
    const r = this.rooms[roomId]!;
    return this.roomIdAt(r.gridX, r.gridY - 1);
  }

  neighborSouth(roomId: number): number {
    const r = this.rooms[roomId]!;
    return this.roomIdAt(r.gridX, r.gridY + 1);
  }

  allRooms(): RoomNode[] {
    return this.rooms.slice();
  }

  static generate(
    runSeed: bigint,
    targetRooms: number,
    roomWidthTiles: number,
    bonusSecretRooms = 0,
    bonusSuperSecretRooms = 0,
  ): DungeonLayout {
    const w = Math.max(24, roomWidthTiles);
    const n = clampInt(targetRooms, 6, 24);
    const targetSecrets = 1 + Math.max(0, bonusSecretRooms);
    const targetSuperSecrets = 1 + Math.max(0, bonusSuperSecretRooms);

    for (let attempt = 0; attempt < SPECIAL_ROOM_ATTEMPTS; attempt++) {
      const salt = toJavaLong(runSeed ^ (BigInt(attempt) * GOLDEN));
      const rng = new JavaRandom(toJavaLong(salt ^ 0xc0ffeeb00babn));
      const g = buildGraph(rng, n, w, runSeed);
      if (!canPlaceSpecialRooms(g.rooms)) continue;
      assignSpecialRoomKinds(g.rooms, rng);
      const laid = tryInsertSecrets(
        new DungeonLayout(g.rooms.map(cloneNode), new Map(g.cellToId)),
        rng,
        w,
        targetSecrets,
        targetSuperSecrets,
      );
      if (laid) return laid;
    }

    for (let attempt = 0; attempt < SPECIAL_ROOM_ATTEMPTS; attempt++) {
      const salt = toJavaLong(runSeed ^ 0xdeadbeefn ^ (BigInt(attempt) * GOLDEN));
      const rng = new JavaRandom(toJavaLong(salt ^ 0xc0ffeeb00babn));
      const g = buildGraph(rng, n, w, runSeed);
      assignSpecialRoomKindsRelaxed(g.rooms, rng);
      const laid = tryInsertSecrets(
        new DungeonLayout(g.rooms.map(cloneNode), new Map(g.cellToId)),
        rng,
        w,
        targetSecrets,
        targetSuperSecrets,
      );
      if (laid) return laid;
    }

    const salt = toJavaLong(runSeed ^ 0xdeadbeefdeadbeefn);
    const rng = new JavaRandom(toJavaLong(salt ^ 0xc0ffeeb00babn));
    const g = buildGraph(rng, n, w, runSeed);
    assignSpecialRoomKindsRelaxed(g.rooms, rng);
    const result = insertSecrets(
      new DungeonLayout(g.rooms.map(cloneNode), new Map(g.cellToId)),
      rng,
      w,
      targetSecrets,
      targetSuperSecrets,
      (rooms, cell) => new DungeonLayout(rooms, cell),
    );
    return result.layout;
  }
}

function tryInsertSecrets(
  base: DungeonLayout,
  rng: JavaRandom,
  roomWidthTiles: number,
  targetSecrets: number,
  targetSuperSecrets: number,
): DungeonLayout | null {
  const result = insertSecrets(
    base,
    rng,
    roomWidthTiles,
    targetSecrets,
    targetSuperSecrets,
    (rooms, cell) => new DungeonLayout(rooms, cell),
  );
  if (meetsTargets(result, targetSecrets, targetSuperSecrets)) return result.layout;
  return null;
}

type BuiltGraph = { rooms: RoomNode[]; cellToId: Map<string, number> };

function buildGraph(rng: JavaRandom, n: number, w: number, runSeed: bigint): BuiltGraph {
  const cells: number[][] = [];
  const index = new Map<string, number>();
  cells.push([0, 0]);
  index.set(cellKey(0, 0), 0);
  if (n >= 2) {
    cells.push([0, 1]);
    index.set(cellKey(0, 1), 1);
  }

  const dirs: number[][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (cells.length < n) {
    const pick = pickExpansionCell(cells, index, rng);
    const gx = cells[pick]![0]!;
    const gy = cells[pick]![1]!;
    const shuffled = dirs.map((d) => d.slice());
    javaShuffle(shuffled, rng);

    let added = false;
    for (const d of shuffled) {
      const nx = gx + d[0]!;
      const ny = gy + d[1]!;
      if (Math.abs(nx) > 6 || Math.abs(ny) > 6) continue;
      const k = cellKey(nx, ny);
      if (index.has(k)) continue;
      index.set(k, cells.length);
      cells.push([nx, ny]);
      added = true;
      break;
    }
    if (!added) {
      let any = false;
      for (let attempt = 0; attempt < cells.length * 4; attempt++) {
        const j = rng.nextInt(cells.length);
        const cx = cells[j]![0]!;
        const cy = cells[j]![1]!;
        const d = dirs[rng.nextInt(4)]!;
        const nx = cx + d[0]!;
        const ny = cy + d[1]!;
        if (Math.abs(nx) > 6 || Math.abs(ny) > 6) continue;
        const k = cellKey(nx, ny);
        if (index.has(k)) continue;
        index.set(k, cells.length);
        cells.push([nx, ny]);
        any = true;
        break;
      }
      if (!any) break;
    }
  }

  const count = cells.length;
  const doorW = new Array<boolean>(count).fill(false);
  const doorE = new Array<boolean>(count).fill(false);
  const ladN = new Array<boolean>(count).fill(false);
  const ladS = new Array<boolean>(count).fill(false);
  const ladderTx = new Array<number>(count).fill(-1);

  for (let i = 0; i < count; i++) {
    const gx = cells[i]![0]!;
    const gy = cells[i]![1]!;
    if (index.has(cellKey(gx - 1, gy))) doorW[i] = true;
    if (index.has(cellKey(gx + 1, gy))) doorE[i] = true;
    if (index.has(cellKey(gx, gy - 1))) ladN[i] = true;
    if (index.has(cellKey(gx, gy + 1))) ladS[i] = true;
  }

  const ladderMin = 8;
  const ladderMaxExcl = Math.max(ladderMin + 1, w - 8);
  const ladderSpan = ladderMaxExcl - ladderMin;
  for (let i = 0; i < count; i++) {
    if (!ladS[i]) continue;
    const gx = cells[i]![0]!;
    const gy = cells[i]![1]!;
    const jObj = index.get(cellKey(gx, gy + 1));
    if (jObj === undefined) continue;
    const j = jObj;
    let L: number;
    if (ladderTx[i]! >= 0) L = ladderTx[i]!;
    else if (ladderTx[j]! >= 0) L = ladderTx[j]!;
    else L = ladderMin + (ladderSpan > 0 ? rng.nextInt(ladderSpan) : 0);
    ladderTx[i] = L;
    ladderTx[j] = L;
  }

  for (let i = 0; i < count; i++) {
    if (!ladN[i] && !ladS[i]) continue;
    if (ladderTx[i]! >= 0) continue;
    const gx = cells[i]![0]!;
    const gy = cells[i]![1]!;
    let L = ladderMin + (ladderSpan > 0 ? rng.nextInt(ladderSpan) : 0);
    if (ladS[i]) {
      const jObj = index.get(cellKey(gx, gy + 1));
      if (jObj !== undefined) {
        const j = jObj;
        ladderTx[i] = L;
        ladderTx[j] = L;
      }
    } else if (ladN[i]) {
      const jObj = index.get(cellKey(gx, gy - 1));
      if (jObj !== undefined) {
        const j = jObj;
        if (ladderTx[j]! >= 0) L = ladderTx[j]!;
        ladderTx[i] = L;
        ladderTx[j] = L;
      }
    }
  }

  const out: RoomNode[] = [];
  for (let i = 0; i < count; i++) {
    const gx = cells[i]![0]!;
    const gy = cells[i]![1]!;
    const contentSeed = toJavaLong(
      runSeed + BigInt(i) * GOLDEN + BigInt(gx) * 0x51c3n + BigInt(gy) * 0x1b873593n,
    );
    out.push({
      id: i,
      gridX: gx,
      gridY: gy,
      contentSeed,
      doorWest: doorW[i]!,
      doorEast: doorE[i]!,
      ladderNorth: ladN[i]!,
      ladderSouth: ladS[i]!,
      ladderColumnTx: ladderTx[i]!,
      kind: RoomKind.NORMAL,
    });
  }

  const cellToId = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    cellToId.set(cellKey(cells[i]![0]!, cells[i]![1]!), i);
  }
  return { rooms: out, cellToId };
}

function pickExpansionCell(
  cells: number[][],
  index: Map<string, number>,
  rng: JavaRandom,
): number {
  const leafIdx: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const gx = cells[i]![0]!;
    const gy = cells[i]![1]!;
    let deg = 0;
    if (index.has(cellKey(gx - 1, gy))) deg++;
    if (index.has(cellKey(gx + 1, gy))) deg++;
    if (index.has(cellKey(gx, gy - 1))) deg++;
    if (index.has(cellKey(gx, gy + 1))) deg++;
    if (deg === 1) leafIdx.push(i);
  }
  if (leafIdx.length > 0 && rng.nextDouble() < LEAF_BIAS) {
    return leafIdx[rng.nextInt(leafIdx.length)]!;
  }
  return rng.nextInt(cells.length);
}

function isAdjacentOnGrid(a: RoomNode, b: RoomNode): boolean {
  const dx = Math.abs(a.gridX - b.gridX);
  const dy = Math.abs(a.gridY - b.gridY);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

function isAdjacentToStart(rooms: RoomNode[], roomId: number): boolean {
  return isAdjacentOnGrid(rooms[0]!, rooms[roomId]!);
}

function canPlaceSpecialRooms(rooms: RoomNode[]): boolean {
  let leaves = 0;
  let bossOkApartFromStart = 0;
  for (let id = 1; id < rooms.length; id++) {
    const r = rooms[id]!;
    if (graphDegree(r) === 1) leaves++;
    const horiz = (r.doorWest ? 1 : 0) + (r.doorEast ? 1 : 0);
    if (horiz === 1 && !r.ladderNorth && !r.ladderSouth && !isAdjacentToStart(rooms, id)) {
      bossOkApartFromStart++;
    }
  }
  return bossOkApartFromStart >= 1 && leaves >= 3;
}

function assignSpecialRoomKinds(rooms: RoomNode[], rng: JavaRandom): void {
  const n = rooms.length;
  const kinds = new Array<RoomKind>(n).fill(RoomKind.NORMAL);
  kinds[0] = RoomKind.START;

  const leaves: number[] = [];
  const bossEligible: number[] = [];
  for (let id = 1; id < n; id++) {
    const r = rooms[id]!;
    if (graphDegree(r) === 1) leaves.push(id);
    const horiz = (r.doorWest ? 1 : 0) + (r.doorEast ? 1 : 0);
    if (horiz === 1 && !r.ladderNorth && !r.ladderSouth && !isAdjacentToStart(rooms, id)) {
      bossEligible.push(id);
    }
  }
  javaShuffle(leaves, rng);
  javaShuffle(bossEligible, rng);

  const bossId = bossEligible[0]!;
  kinds[bossId] = RoomKind.BOSS;

  let itemId = -1;
  for (const id of leaves) {
    if (id !== bossId) {
      itemId = id;
      kinds[id] = RoomKind.ITEM;
      break;
    }
  }
  for (const id of leaves) {
    if (id !== bossId && id !== itemId) {
      kinds[id] = RoomKind.SHOP;
      break;
    }
  }

  for (let i = 0; i < n; i++) {
    rooms[i] = { ...rooms[i]!, kind: kinds[i]! };
  }
}

function assignSpecialRoomKindsRelaxed(rooms: RoomNode[], rng: JavaRandom): void {
  const n = rooms.length;
  const kinds = new Array<RoomKind>(n).fill(RoomKind.NORMAL);
  kinds[0] = RoomKind.START;

  const pool: number[] = [];
  for (let id = 1; id < n; id++) pool.push(id);
  javaShuffle(pool, rng);

  const bossEligible: number[] = [];
  const bossEligibleNearStart: number[] = [];
  for (let id = 1; id < n; id++) {
    const r = rooms[id]!;
    const horiz = (r.doorWest ? 1 : 0) + (r.doorEast ? 1 : 0);
    if (horiz === 1 && !r.ladderNorth && !r.ladderSouth) {
      if (isAdjacentToStart(rooms, id)) bossEligibleNearStart.push(id);
      else bossEligible.push(id);
    }
  }
  javaShuffle(bossEligible, rng);
  javaShuffle(bossEligibleNearStart, rng);
  if (bossEligible.length > 0) kinds[bossEligible[0]!] = RoomKind.BOSS;
  else if (bossEligibleNearStart.length > 0) kinds[bossEligibleNearStart[0]!] = RoomKind.BOSS;
  else if (pool.length > 0) kinds[pool[0]!] = RoomKind.BOSS;

  for (const id of pool) {
    if (kinds[id] === RoomKind.NORMAL) {
      kinds[id] = RoomKind.ITEM;
      break;
    }
  }
  for (const id of pool) {
    if (kinds[id] === RoomKind.NORMAL) {
      kinds[id] = RoomKind.SHOP;
      break;
    }
  }

  for (let i = 0; i < n; i++) {
    rooms[i] = { ...rooms[i]!, kind: kinds[i]! };
  }
}

function cloneNode(r: RoomNode): RoomNode {
  return { ...r };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
