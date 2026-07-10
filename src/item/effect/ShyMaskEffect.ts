import type { PlayerItemInventory } from "../PlayerItemInventory";
import type { PlayerStats } from "../../entity/PlayerStats";
import { SHY_MASK_GRAVITY_MULT } from "../../config/Physics";
import type { ItemEffect } from "./ItemEffect";

export class ShyMaskEffect implements ItemEffect {
  itemId(): string {
    return "SHY_MASK";
  }

  contributeStats(inv: PlayerItemInventory, stats: PlayerStats): void {
    const stacks = inv.stacksOf("SHY_MASK");
    stats.shyMaskStacks = stacks;
    stats.shyMaskGravityMult = stacks > 0 ? SHY_MASK_GRAVITY_MULT : 1;
  }
}
