import type { PickupKind } from "../world/BreakableLootRoll";

/** Pickup sealed in a frozen block; released on shatter (Java IceBlockLoot). */
export type IceBlockLoot = {
  kind: PickupKind;
};
