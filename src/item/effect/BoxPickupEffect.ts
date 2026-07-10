import type { ItemEffect } from "./ItemEffect";
import type { ItemPickupHost } from "./ItemPickupHost";
import { PickupKind } from "../../world/BreakableLootRoll";

export class BoxPickupEffect implements ItemEffect {
  private static readonly COINS = 5;
  private static readonly KEYS = 5;

  itemId(): string {
    return "BOX";
  }

  onPickup(host: ItemPickupHost): void {
    host.startHudResourceGain(BoxPickupEffect.COINS, BoxPickupEffect.KEYS);
    host.playPickupCollectFxAtPlayer(PickupKind.COIN_1, BoxPickupEffect.COINS);
    host.playPickupCollectFxAtPlayer(PickupKind.KEY, BoxPickupEffect.KEYS);
  }
}
