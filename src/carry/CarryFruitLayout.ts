import { TILE_SIZE } from "../specs";
import { CarryKind } from "./CarryKind";

/** Shared overhead fruit anchor for hold, throw release, and draw (Java CarryFruitLayout). */
export const HELD_ABOVE_FEET = 28;
export const SPRITE_W = 16;
export const SPRITE_H = 32;
export const FRUIT_FRAME_COUNT = 6;

export function carryTopLeftRelease(
  playerX: number,
  playerW: number,
  feetWorld: number,
  facing: number,
  kind: CarryKind,
): [number, number] {
  if (kind === CarryKind.BREAKABLE_BLOCK) {
    const center = playerX + playerW * 0.5 + facing * 4;
    return [center - TILE_SIZE * 0.5, feetWorld - HELD_ABOVE_FEET - TILE_SIZE];
  }
  const center = playerX + playerW * 0.5 + facing * 4;
  return [center - SPRITE_W * 0.5, feetWorld - HELD_ABOVE_FEET - SPRITE_H];
}

export function carryTopLeftOneCellAhead(
  playerX: number,
  playerW: number,
  feetWorld: number,
  facing: number,
  kind: CarryKind,
): [number, number] {
  const sign = facing >= 0 ? 1 : -1;
  const feetCx = playerX + playerW * 0.5;
  const frontTx = Math.floor(feetCx / TILE_SIZE) + sign;
  const top = carryTopLeftRelease(playerX, playerW, feetWorld, facing, kind)[1];
  if (kind === CarryKind.BREAKABLE_BLOCK) {
    return [frontTx * TILE_SIZE + (TILE_SIZE - TILE_SIZE) * 0.5, top];
  }
  return [frontTx * TILE_SIZE + (TILE_SIZE - SPRITE_W) * 0.5, top];
}
