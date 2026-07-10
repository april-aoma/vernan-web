import { JavaRandom, toJavaLong } from "../util/JavaRandom";
import { javaShuffle } from "../util/javaCollections";
import {
  cellKey,
  RoomKind,
  type RoomNode,
} from "./DungeonTypes";
import type { DungeonLayout } from "./DungeonLayout";

const SECRET_PREFERRED_MIN_DEGREE = 2;

export type PlacementResult = {
  layout: DungeonLayout;
  secretsPlaced: number;
  superSecretsPlaced: number;
};

export function meetsTargets(
  result: PlacementResult,
  targetSecrets: number,
  targetSuperSecrets: number,
): boolean {
  return (
    result.secretsPlaced >= targetSecrets &&
    result.superSecretsPlaced >= targetSuperSecrets
  );
}

/**
 * Insert SECRET / SUPER_SECRET cells (Java SecretRoomGraphPlacer).
 * Candidate enumeration sorts keys before expanding so HashSet order does not
 * break cross-runtime parity after shuffle.
 */
export function insertSecrets(
  base: DungeonLayout,
  rng: JavaRandom,
  roomWidthTiles: number,
  targetSecrets: number,
  targetSuperSecrets: number,
  makeLayout: (rooms: RoomNode[], cell: Map<string, number>) => DungeonLayout,
): PlacementResult {
  const list: RoomNode[] = [];
  for (let i = 0; i < base.roomCount(); i++) list.push({ ...base.room(i) });
  const cell = new Map<string, number>();
  for (const r of list) cell.set(cellKey(r.gridX, r.gridY), r.id);

  let secretsPlaced = 0;
  for (let n = 0; n < targetSecrets; n++) {
    if (!placeOneSecret(list, cell, roomWidthTiles, rng)) break;
    secretsPlaced++;
  }

  let superSecretsPlaced = 0;
  for (let n = 0; n < targetSuperSecrets; n++) {
    if (!placeOneSuperSecret(list, cell, roomWidthTiles, rng)) break;
    superSecretsPlaced++;
  }

  return {
    layout: makeLayout(list, cell),
    secretsPlaced,
    superSecretsPlaced,
  };
}

function placeOneSecret(
  list: RoomNode[],
  cell: Map<string, number>,
  roomWidthTiles: number,
  rng: JavaRandom,
): boolean {
  const candidates = rankedSecretCandidates(cell, rng);
  if (tryPlaceSecretAtDegree(list, cell, roomWidthTiles, rng, candidates, SECRET_PREFERRED_MIN_DEGREE)) {
    return true;
  }
  return tryPlaceSecretAtDegree(list, cell, roomWidthTiles, rng, candidates, 1);
}

function rankedSecretCandidates(cell: Map<string, number>, rng: JavaRandom): number[][] {
  const secretCandidates = emptyAdjacentCandidates(cell);
  javaShuffle(secretCandidates, rng);
  secretCandidates.sort((a, b) => {
    const db = degree(cell, b[0]!, b[1]!);
    const da = degree(cell, a[0]!, a[1]!);
    if (db !== da) return db < da ? -1 : db > da ? 1 : 0;
    return 0;
  });
  return secretCandidates;
}

function tryPlaceSecretAtDegree(
  list: RoomNode[],
  cell: Map<string, number>,
  roomWidthTiles: number,
  rng: JavaRandom,
  candidates: number[][],
  minDegree: number,
): boolean {
  for (const c of candidates) {
    const gx = c[0]!;
    const gy = c[1]!;
    if (degree(cell, gx, gy) < minDegree) continue;
    if (okSecret(list, cell, gx, gy)) {
      addRoom(list, cell, gx, gy, RoomKind.SECRET, roomWidthTiles, rng);
      return true;
    }
  }
  return false;
}

function placeOneSuperSecret(
  list: RoomNode[],
  cell: Map<string, number>,
  roomWidthTiles: number,
  rng: JavaRandom,
): boolean {
  const superCandidates = emptyAdjacentCandidates(cell);
  javaShuffle(superCandidates, rng);
  for (const c of superCandidates) {
    const gx = c[0]!;
    const gy = c[1]!;
    if (okSuperSecret(list, cell, gx, gy)) {
      addRoom(list, cell, gx, gy, RoomKind.SUPER_SECRET, roomWidthTiles, rng);
      return true;
    }
  }
  return false;
}

function degree(cell: Map<string, number>, gx: number, gy: number): number {
  let d = 0;
  if (cell.has(cellKey(gx - 1, gy))) d++;
  if (cell.has(cellKey(gx + 1, gy))) d++;
  if (cell.has(cellKey(gx, gy - 1))) d++;
  if (cell.has(cellKey(gx, gy + 1))) d++;
  return d;
}

function emptyAdjacentCandidates(cell: Map<string, number>): number[][] {
  const seen = new Set<string>();
  const out: number[][] = [];
  // Stabilize vs Java HashSet: sort occupied keys before expanding neighbors.
  const keys = [...cell.keys()].sort();
  for (const k of keys) {
    const comma = k.indexOf(",");
    const gx = Number(k.slice(0, comma));
    const gy = Number(k.slice(comma + 1));
    for (const d of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nx = gx + d[0];
      const ny = gy + d[1];
      if (Math.abs(nx) > 7 || Math.abs(ny) > 7) continue;
      const nk = cellKey(nx, ny);
      if (cell.has(nk)) continue;
      if (!seen.has(nk)) {
        seen.add(nk);
        out.push([nx, ny]);
      }
    }
  }
  return out;
}

function neighborRoomIds(cell: Map<string, number>, gx: number, gy: number): number[] {
  const out: number[] = [];
  const w = cell.get(cellKey(gx - 1, gy));
  if (w !== undefined) out.push(w);
  const e = cell.get(cellKey(gx + 1, gy));
  if (e !== undefined) out.push(e);
  const n = cell.get(cellKey(gx, gy - 1));
  if (n !== undefined) out.push(n);
  const s = cell.get(cellKey(gx, gy + 1));
  if (s !== undefined) out.push(s);
  return out;
}

function okSecret(rooms: RoomNode[], cell: Map<string, number>, gx: number, gy: number): boolean {
  if (degree(cell, gx, gy) < 1) return false;
  for (const id of neighborRoomIds(cell, gx, gy)) {
    const k = rooms[id]!.kind;
    if (k === RoomKind.BOSS || k === RoomKind.SUPER_SECRET) return false;
  }
  return true;
}

function okSuperSecret(rooms: RoomNode[], cell: Map<string, number>, gx: number, gy: number): boolean {
  if (degree(cell, gx, gy) !== 1) return false;
  for (const id of neighborRoomIds(cell, gx, gy)) {
    const k = rooms[id]!.kind;
    if (k !== RoomKind.NORMAL && k !== RoomKind.START) return false;
  }
  return true;
}

function addRoom(
  rooms: RoomNode[],
  cell: Map<string, number>,
  gx: number,
  gy: number,
  kind: RoomKind,
  roomWidthTiles: number,
  rng: JavaRandom,
): void {
  const nw = cell.get(cellKey(gx - 1, gy));
  const ne = cell.get(cellKey(gx + 1, gy));
  const nn = cell.get(cellKey(gx, gy - 1));
  const ns = cell.get(cellKey(gx, gy + 1));

  const doorW = nw !== undefined;
  const doorE = ne !== undefined;
  const ladN = nn !== undefined;
  const ladS = ns !== undefined;

  const wTiles = Math.max(24, roomWidthTiles);
  const ladderTx = pickLadderTx(rooms, nn, ns, wTiles, rng, ladN || ladS);

  const newId = rooms.length;
  const contentSeed = toJavaLong(
    rng.nextLong() ^
      BigInt(gx) * 0x51c3n ^
      BigInt(gy) * 0x1b873593n ^
      BigInt(kind) * 0x9e3779b97f4a7c15n,
  );

  rooms.push({
    id: newId,
    gridX: gx,
    gridY: gy,
    contentSeed,
    doorWest: doorW,
    doorEast: doorE,
    ladderNorth: ladN,
    ladderSouth: ladS,
    ladderColumnTx: ladderTx,
    kind,
  });
  cell.set(cellKey(gx, gy), newId);

  if (nw !== undefined) rooms[nw] = { ...rooms[nw]!, doorEast: true };
  if (ne !== undefined) rooms[ne] = { ...rooms[ne]!, doorWest: true };
  if (nn !== undefined) {
    rooms[nn] = {
      ...rooms[nn]!,
      ladderSouth: true,
      ladderColumnTx: ladderTx >= 0 ? ladderTx : rooms[nn]!.ladderColumnTx,
    };
  }
  if (ns !== undefined) {
    rooms[ns] = {
      ...rooms[ns]!,
      ladderNorth: true,
      ladderColumnTx: ladderTx >= 0 ? ladderTx : rooms[ns]!.ladderColumnTx,
    };
  }
}

function pickLadderTx(
  rooms: RoomNode[],
  nn: number | undefined,
  ns: number | undefined,
  wTiles: number,
  rng: JavaRandom,
  needLadder: boolean,
): number {
  if (!needLadder) return -1;
  const cand: number[] = [];
  if (nn !== undefined) {
    const L = rooms[nn]!.ladderColumnTx;
    if (L >= 0) cand.push(L);
  }
  if (ns !== undefined) {
    const L = rooms[ns]!.ladderColumnTx;
    if (L >= 0) cand.push(L);
  }
  let L: number;
  if (cand.length === 0) {
    const ladderMin = 8;
    const ladderMaxExcl = Math.max(ladderMin + 1, wTiles - 8);
    const span = ladderMaxExcl - ladderMin;
    L = ladderMin + (span > 0 ? rng.nextInt(span) : 0);
  } else {
    let sum = 0;
    for (const v of cand) sum += v;
    L = Math.round(sum / cand.length);
  }
  return Math.max(3, Math.min(L, wTiles - 4));
}
