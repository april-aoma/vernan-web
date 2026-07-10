import type { PlayerItemInventory } from "../PlayerItemInventory";
import type { PlayerStats } from "../../entity/PlayerStats";
import type { ItemLandContext } from "./ItemLandContext";
import type { ItemPickupHost } from "./ItemPickupHost";
import type { RoomClearContext } from "./RoomClearContext";

/** Per-item gameplay hook; JSON stat columns are applied separately in PlayerStats.applyItemPassives. */
export interface ItemEffect {
  itemId(): string;

  onPickup?(host: ItemPickupHost): void;

  contributeStats?(inv: PlayerItemInventory, stats: PlayerStats): void;

  onPlayerLanded?(ctx: ItemLandContext, inv: PlayerItemInventory): void;

  onRoomCleared?(ctx: RoomClearContext, inv: PlayerItemInventory): void;
}
