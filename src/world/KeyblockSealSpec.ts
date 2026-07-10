import type { KeyblockSlot } from "./KeyblockSlot";

/** Immutable seal geometry after placement into a TileMap. */
export type KeyblockSealSpec = {
  slots: readonly KeyblockSlot[];
};

export function makeKeyblockSealSpec(slots: KeyblockSlot[]): KeyblockSealSpec {
  return { slots: slots.slice() };
}
