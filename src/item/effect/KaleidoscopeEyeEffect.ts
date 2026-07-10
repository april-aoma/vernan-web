import type { PlayerItemInventory } from "../PlayerItemInventory";
import type { PlayerStats } from "../../entity/PlayerStats";
import type { ItemEffect } from "./ItemEffect";

export class KaleidoscopeEyeEffect implements ItemEffect {
  itemId(): string {
    return "KALEIDOSCOPE_EYE";
  }

  contributeStats(inv: PlayerItemInventory, stats: PlayerStats): void {
    const stacks = inv.stacksOf("KALEIDOSCOPE_EYE");
    if (stacks <= 0) {
      stats.kaleidoscopeGravityMult = 1;
      return;
    }
    stats.kaleidoscopeEye.contribute(stats, stacks);
  }
}
