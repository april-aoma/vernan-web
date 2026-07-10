import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_KEYBLOCK,
  TILE_KEYBLOCK_CONNECTOR,
  TILE_LADDER,
  type TileMap,
} from "./TileMap";
import { resolvePedestalTileX } from "./pedestal";

/** Full-height ascension shaft (Java carveBossAscensionShaft). */
export function carveBossAscensionShaft(map: TileMap, tx: number): void {
  const h = map.getHeight();
  for (let ty = 1; ty < h - 1; ty++) {
    const t = map.tileAt(tx, ty);
    if (
      t === TILE_DOOR ||
      t === TILE_BREAKABLE ||
      t === TILE_KEYBLOCK ||
      t === TILE_KEYBLOCK_CONNECTOR
    ) {
      continue;
    }
    if (map.isSolidTile(tx, ty)) continue;
    map.setTile(tx, ty, TILE_LADDER);
  }
  const top = map.tileAt(tx, 0);
  if (top !== TILE_DOOR && top !== TILE_BREAKABLE) {
    map.setTile(tx, 0, TILE_EMPTY);
  }
}

function isBossAscendColumnBlocked(
  tx: number,
  pedestalTileX: number,
  dungeonL: number,
  doorTxs: number[],
): boolean {
  if (tx === pedestalTileX || Math.abs(tx - pedestalTileX) <= 1) return true;
  if (dungeonL >= 0 && (tx === dungeonL || Math.abs(tx - dungeonL) <= 1)) return true;
  for (const d of doorTxs) {
    if (d === tx) return true;
  }
  return false;
}

function scoreBossAscendColumn(map: TileMap, tx: number): number {
  let score = 0;
  for (let ty = 1; ty < map.getHeight() - 1; ty++) {
    const t = map.tileAt(tx, ty);
    if (
      t === TILE_DOOR ||
      t === TILE_BREAKABLE ||
      t === TILE_KEYBLOCK ||
      t === TILE_KEYBLOCK_CONNECTOR
    ) {
      continue;
    }
    if (!map.isSolidTile(tx, ty)) score++;
  }
  return score;
}

function pickBossAscendColumnWithShaft(
  map: TileMap,
  first: number,
  pedestalTileX: number,
  dungeonL: number,
  doorTxs: number[],
): number {
  const firstScore = scoreBossAscendColumn(map, first);
  if (firstScore >= 3) return first;
  const w = map.getWidth();
  let best = first;
  let bestScore = firstScore;
  for (let tx = 3; tx <= w - 4; tx++) {
    if (isBossAscendColumnBlocked(tx, pedestalTileX, dungeonL, doorTxs)) continue;
    const score = scoreBossAscendColumn(map, tx);
    if (score > bestScore) {
      bestScore = score;
      best = tx;
    }
  }
  return best;
}

/**
 * Place ascend ladder opposite the pedestal (Java injectBossExitLadderAfterPedestal).
 * @returns ladder column tx, or -1 if already placed / invalid
 */
export function injectBossExitLadder(
  map: TileMap,
  pedestalTileX: number,
  dungeonLadderTx: number,
  leftDoorTx: number,
  rightDoorTx: number,
  alreadyTx: number,
): number {
  if (alreadyTx >= 0) return alreadyTx;
  const w = map.getWidth();
  const doorTxs = [leftDoorTx, rightDoorTx].filter((x) => x >= 0);
  let prefer = pedestalTileX < w / 2 ? w - 4 : 3;
  let tx = resolvePedestalTileX(w, prefer, dungeonLadderTx, leftDoorTx, rightDoorTx);
  if (Math.abs(tx - pedestalTileX) <= 2) {
    prefer =
      pedestalTileX < w / 2
        ? Math.min(w - 3, pedestalTileX + 6)
        : Math.max(2, pedestalTileX - 6);
    tx = resolvePedestalTileX(w, prefer, dungeonLadderTx, leftDoorTx, rightDoorTx);
  }
  tx = pickBossAscendColumnWithShaft(map, tx, pedestalTileX, dungeonLadderTx, doorTxs);
  carveBossAscensionShaft(map, tx);
  return tx;
}
