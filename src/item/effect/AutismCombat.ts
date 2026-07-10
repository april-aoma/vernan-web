import type { CombatEnemy } from "../../entity/CombatEnemy";

/** Global bridge from combat into autism HUD handling (Java AutismCombat). */
export class AutismCombat {
  private static host: AutismCombatHost | null = null;

  static setHost(h: AutismCombatHost | null): void {
    AutismCombat.host = h;
  }

  static notifyPlayerDamageDealt(enemy: CombatEnemy, amount: number): void {
    const h = AutismCombat.host;
    if (!h || !h.autismOwned() || amount <= 0) return;
    h.onPlayerDamageFloater(enemy, amount);
  }

  /** Enemy HP / damage display: real value × 2; integer when whole, otherwise one decimal. */
  static formatNumber(value: number): string {
    const shown = Math.max(0, value * 2);
    if (Math.abs(shown - Math.round(shown)) < 1e-6) {
      return String(Math.round(shown));
    }
    return shown.toFixed(1);
  }
}

export interface AutismCombatHost {
  autismOwned(): boolean;
  onPlayerDamageFloater(enemy: CombatEnemy, damage: number): void;
}
