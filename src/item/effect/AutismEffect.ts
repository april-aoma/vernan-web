import type { ItemEffect } from "./ItemEffect";

/** Passive hook for AUTISM; damage floaters via AutismCombat (HUD stubbed on web). */
export class AutismEffect implements ItemEffect {
  itemId(): string {
    return "AUTISM";
  }
}
