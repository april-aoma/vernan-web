import type { PlayerItemInventory } from "../PlayerItemInventory";
import type { PlayerStats } from "../../entity/PlayerStats";
import type { ItemEffect } from "./ItemEffect";

export class LeotardEffect implements ItemEffect {
  /** Additive attack damage per half-heart of incoming damage while leotard is owned (per stack). */
  static readonly DAMAGE_PER_DAMAGE_PER_STACK = 0.1;

  itemId(): string {
    return "LEOTARD";
  }

  contributeStats(_inv: PlayerItemInventory, stats: PlayerStats): void {
    if (stats.leotardDamageBonus > 0) {
      stats.attackDamage += stats.leotardDamageBonus;
    }
  }
}
