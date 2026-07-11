import type { CarryPayload } from "./CarryPayload";
import { CarryKind } from "./CarryKind";
import { floorMod } from "../tileset/background/BackgroundPixelBuffers";

const FRUIT_DAMAGE_MUL = [3.0, 3.9, 1.0, 1.0, 1.6, 1.3];
const BREAKABLE_BLOCK_MUL = 5.2;

export function carryThrowDamage(payload: CarryPayload | null, baseThrowDamage: number): number {
  if (!payload) return baseThrowDamage;
  switch (payload.kind) {
    case CarryKind.FRUIT: {
      const i = floorMod(payload.fruitVariantIndex, FRUIT_DAMAGE_MUL.length);
      return baseThrowDamage * FRUIT_DAMAGE_MUL[i]!;
    }
    case CarryKind.BREAKABLE_BLOCK:
      return baseThrowDamage * BREAKABLE_BLOCK_MUL;
    case CarryKind.ICE_BLOCK:
      return baseThrowDamage * 2.35;
    default:
      return baseThrowDamage;
  }
}
