import type { Aabb } from "../combat/CombatMath";
import { TILE_SIZE } from "../specs";

export const PEDESTAL_BOB_AMP = 3;
export const PEDESTAL_BOB_OMEGA = 2.4 * Math.PI;
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

/** Bobbing item AABB for touch pickup. */
export function pedestalItemAabb(p: ItemPedestal, timeSec: number): Aabb | null {
  if (p.collected || !p.itemId) return null;
  const bob = Math.sin(timeSec * PEDESTAL_BOB_OMEGA) * PEDESTAL_BOB_AMP;
  const top = p.groundTop - PEDESTAL_DRAW_H - ITEM_PICKUP_H + bob;
  return {
    x: p.anchorX - ITEM_PICKUP_W * 0.5,
    y: top,
    w: ITEM_PICKUP_W,
    h: ITEM_PICKUP_H,
  };
}

export function resolvePedestalTileX(
  w: number,
  preferred: number,
  ladderTx: number,
  leftDoorTx: number,
  rightDoorTx: number,
): number {
  let cx = Math.max(2, Math.min(w - 3, preferred));
  const blocked = (tx: number) =>
    (ladderTx >= 0 && Math.abs(tx - ladderTx) <= 1) ||
    (leftDoorTx >= 0 && Math.abs(tx - leftDoorTx) <= 1) ||
    (rightDoorTx >= 0 && Math.abs(tx - rightDoorTx) <= 1);
  if (!blocked(cx)) return cx;
  for (let d = 1; d < w; d++) {
    for (const sign of [-1, 1]) {
      const t = cx + sign * d;
      if (t >= 2 && t <= w - 3 && !blocked(t)) return t;
    }
  }
  return cx;
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
