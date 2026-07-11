import type { Aabb } from "../combat/CombatMath";
import { PEDESTAL_DECK_ABOVE_GROUND_PX } from "../collision/StandSurfaceQuery";
import { TILE_SIZE } from "../specs";

export const PEDESTAL_BOB_AMP = 3;
export const PEDESTAL_BOB_OMEGA = 2.4 * Math.PI;
/** Slows phase advance near bob peaks (Java PEDESTAL_BOB_PEAK_DWELL). */
export const PEDESTAL_BOB_PEAK_DWELL = 0.42;
/** Volume-ish squash on bob peaks (Java PEDESTAL_SQUASH_Y). */
export const PEDESTAL_SQUASH_Y = 0.13;
export const PEDESTAL_STRETCH_X = 0.065;
export const PEDESTAL_ITEM_OUTLINE_ALPHA = 64;
export const PEDESTAL_ITEM_OUTLINE_ALPHA_THRESHOLD = 8;

/** Approximate item pickup cell (16×16) above pedestal top. */
export const ITEM_PICKUP_W = 16;
export const ITEM_PICKUP_H = 16;
export const PEDESTAL_DRAW_W = 16;
export const PEDESTAL_DRAW_H = 16;

export type ItemPedestal = {
  /** null until resolved on room enter / build. */
  itemId: string | null;
  /** World X of pedestal center. */
  anchorX: number;
  /** World Y of ground top under pedestal. */
  groundTop: number;
  collected: boolean;
  /** Shop price in coins; 0 / undefined = free (ITEM / boss-clear). */
  priceCoins?: number;
};

export function makeItemPedestal(
  itemId: string | null,
  anchorX: number,
  groundTop: number,
  priceCoins = 0,
): ItemPedestal {
  return { itemId, anchorX, groundTop, collected: false, priceCoins };
}

/** Advance accumulated bob phase (Java updateSimStep pedestalBobPhase). */
export function tickPedestalBobPhase(phase: number, dtSec: number): number {
  const s = Math.sin(phase);
  const sinSq = s * s;
  return phase + PEDESTAL_BOB_OMEGA * dtSec * (1.0 - PEDESTAL_BOB_PEAK_DWELL * sinSq);
}

/** Thin one-way deck rects for pedestal walk surfaces (Java itemPedestalPlatformWorldRects). */
export function pedestalPlatformRects(pedestals: ItemPedestal[]): Aabb[] {
  return pedestals.map((p) => ({
    x: p.anchorX - PEDESTAL_DRAW_W * 0.5,
    y: p.groundTop - PEDESTAL_DECK_ABOVE_GROUND_PX,
    w: PEDESTAL_DRAW_W,
    h: PEDESTAL_DECK_ABOVE_GROUND_PX,
  }));
}

/** Tight AABB on the bobbing item sprite only (Java itemPedestalPickupWorldRect). */
export function pedestalItemAabb(p: ItemPedestal): Aabb | null {
  if (p.collected || !p.itemId) return null;
  const pedestalTop = p.groundTop - PEDESTAL_DRAW_H;
  const bobAmp = PEDESTAL_BOB_AMP;
  const iyMin = pedestalTop - ITEM_PICKUP_H + 4.0 - bobAmp;
  return {
    x: p.anchorX - ITEM_PICKUP_W * 0.5 + 1,
    y: iyMin + 1,
    w: ITEM_PICKUP_W - 2,
    h: ITEM_PICKUP_H + 2 * bobAmp - 2,
  };
}

function isAllowedPedestalTileX(
  tx: number,
  ladderTx: number,
  leftDoorTx: number,
  rightDoorTx: number,
): boolean {
  if (leftDoorTx >= 0 && Math.abs(tx - leftDoorTx) <= 1) return false;
  if (rightDoorTx >= 0 && Math.abs(tx - rightDoorTx) <= 1) return false;
  if (ladderTx >= 0 && Math.abs(tx - ladderTx) <= 1) return false;
  return true;
}

/**
 * Door-aware pedestal anchor column (Java RoomGenerator.resolvePedestalTileX).
 * Picks the closest valid column to {@link preferred}.
 */
export function resolvePedestalTileX(
  w: number,
  preferred: number,
  ladderTx: number,
  leftDoorTx: number,
  rightDoorTx: number,
): number {
  const t = Math.max(2, Math.min(w - 3, preferred));
  if (isAllowedPedestalTileX(t, ladderTx, leftDoorTx, rightDoorTx)) return t;
  let best = t;
  let bestDist = Number.MAX_SAFE_INTEGER;
  const cands = [
    ladderTx + 2,
    ladderTx - 2,
    ladderTx + 3,
    ladderTx - 3,
    t + 2,
    t - 2,
    t + 3,
    t - 3,
    2,
    w - 3,
  ];
  for (const c0 of cands) {
    const c = Math.max(2, Math.min(w - 3, c0));
    if (!isAllowedPedestalTileX(c, ladderTx, leftDoorTx, rightDoorTx)) continue;
    const d = Math.abs(c - preferred);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  if (!isAllowedPedestalTileX(best, ladderTx, leftDoorTx, rightDoorTx)) {
    for (let c = 2; c <= w - 3; c++) {
      if (isAllowedPedestalTileX(c, ladderTx, leftDoorTx, rightDoorTx)) return c;
    }
  }
  return best;
}

export function pedestalWorldFromColumn(mapW: number, tx: number, groundTop: number): {
  anchorX: number;
  groundTop: number;
} {
  void mapW;
  return {
    anchorX: tx * TILE_SIZE + TILE_SIZE * 0.5,
    groundTop,
  };
}
