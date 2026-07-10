import type { PlayerItemInventory } from "../PlayerItemInventory";
import type { PlayerStats } from "../../entity/PlayerStats";
import { MysteryGiftRoll } from "../../entity/PlayerStats";
import type { ItemEffect } from "./ItemEffect";
import type { ItemPickupHost } from "./ItemPickupHost";

export class MysteryGiftPickupEffect implements ItemEffect {
  itemId(): string {
    return "MYSTERY_GIFT";
  }

  onPickup(host: ItemPickupHost): void {
    const rollOnce = host.rngForItem("MYSTERY_GIFT").nextInt(4);
    const chosen =
      rollOnce === 0
        ? MysteryGiftRoll.DAMAGE
        : rollOnce === 1
          ? MysteryGiftRoll.WINDUP
          : rollOnce === 2
            ? MysteryGiftRoll.JUMPSQUAT
            : MysteryGiftRoll.LUCK;
    host.stats().mysteryGiftRoll = chosen;
    host.showPickupMessage(
      chosen === MysteryGiftRoll.DAMAGE
        ? "+1 attack"
        : chosen === MysteryGiftRoll.WINDUP
          ? "quicker attack"
          : chosen === MysteryGiftRoll.JUMPSQUAT
            ? "quicker jump"
            : "+3 luck",
    );
  }

  contributeStats(inv: PlayerItemInventory, stats: PlayerStats): void {
    if (inv.stacksOf("MYSTERY_GIFT") <= 0) return;
    switch (stats.mysteryGiftRoll) {
      case MysteryGiftRoll.DAMAGE:
        stats.attackDamage += 1;
        break;
      case MysteryGiftRoll.WINDUP:
        stats.attackWindupFrames = Math.max(1, stats.attackWindupFrames - 3);
        break;
      case MysteryGiftRoll.JUMPSQUAT:
        stats.jumpSquatFrames = Math.max(1, stats.jumpSquatFrames - 3);
        break;
      case MysteryGiftRoll.LUCK:
        stats.luck += 3;
        break;
      default:
        break;
    }
  }
}
