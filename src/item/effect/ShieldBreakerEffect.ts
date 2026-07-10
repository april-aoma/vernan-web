import type { ItemEffect } from "./ItemEffect";

/** SHIELD_BREAKER: shield penetration handled in ShieldBreakerCombat. */
export class ShieldBreakerEffect implements ItemEffect {
  itemId(): string {
    return "SHIELD_BREAKER";
  }
}
