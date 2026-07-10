import type { PlayerItemInventory } from "../PlayerItemInventory";
import type { PlayerStats } from "../../entity/PlayerStats";
import type { ItemEffect } from "./ItemEffect";
import type { ItemLandContext } from "./ItemLandContext";

/** Matches Player LANDING_LOCK_MAX. */
const LANDING_LOCK_MAX = 20;
const BONUS_FRAMES = 45;
const BONUS_NORMAL = 0.2;
const BONUS_MAX_LANDING = 0.45;

export class PlugLandEffect implements ItemEffect {
  itemId(): string {
    return "PLUG";
  }

  onPlayerLanded(ctx: ItemLandContext, inv: PlayerItemInventory): void {
    const stacks = inv.stacksOf("PLUG");
    if (stacks <= 0) return;
    const add =
      ctx.landingLockFrames >= LANDING_LOCK_MAX ? BONUS_MAX_LANDING : BONUS_NORMAL;
    ctx.stats.plugDamageBonus += add * stacks;
    ctx.stats.plugBonusFramesRemaining = BONUS_FRAMES;
  }

  contributeStats(_inv: PlayerItemInventory, stats: PlayerStats): void {
    if (stats.plugBonusFramesRemaining > 0) {
      stats.attackDamage += stats.plugDamageBonus;
    }
  }
}
