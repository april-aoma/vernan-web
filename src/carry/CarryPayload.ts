import { CarryKind } from "./CarryKind";
import type { IceBlockLoot } from "../entity/IceBlockLoot";

export type CarryPayload = {
  kind: CarryKind;
  fruitVariantIndex: number;
  breakableOriginTx: number;
  breakableOriginTy: number;
  breakableHiddenShell: boolean;
  breakableTileSnap: HTMLCanvasElement | null;
  iceLoot: readonly IceBlockLoot[];
  iceMirrorSourceX: boolean;
};

export function isTileBreakableCarry(kind: CarryKind): boolean {
  return kind === CarryKind.BREAKABLE_BLOCK || kind === CarryKind.ICE_BLOCK;
}

export function fruitPayload(variantIndex: number): CarryPayload {
  return {
    kind: CarryKind.FRUIT,
    fruitVariantIndex: variantIndex,
    breakableOriginTx: -1,
    breakableOriginTy: -1,
    breakableHiddenShell: false,
    breakableTileSnap: null,
    iceLoot: [],
    iceMirrorSourceX: false,
  };
}

export function breakableBlockPayload(
  tx: number,
  ty: number,
  hiddenShell: boolean,
  snap: HTMLCanvasElement | null,
): CarryPayload {
  return {
    kind: CarryKind.BREAKABLE_BLOCK,
    fruitVariantIndex: 0,
    breakableOriginTx: tx,
    breakableOriginTy: ty,
    breakableHiddenShell: hiddenShell,
    breakableTileSnap: snap,
    iceLoot: [],
    iceMirrorSourceX: false,
  };
}

export function iceBlockPayload(
  holdSnap: HTMLCanvasElement | null,
  loot: readonly IceBlockLoot[],
  mirrorSourceX: boolean,
): CarryPayload {
  return {
    kind: CarryKind.ICE_BLOCK,
    fruitVariantIndex: 0,
    breakableOriginTx: -1,
    breakableOriginTy: -1,
    breakableHiddenShell: false,
    breakableTileSnap: holdSnap,
    iceLoot: [...loot],
    iceMirrorSourceX: mirrorSourceX,
  };
}
