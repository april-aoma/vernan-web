import type { CombatEnemy } from "../../../entity/CombatEnemy";

/** Global bridge from combat into kaleidoscope handling (Java KaleidoscopeEyeCombat). */
export class KaleidoscopeEyeCombat {
  private static host: KaleidoscopeEyeCombatHost | null = null;

  static setHost(h: KaleidoscopeEyeCombatHost | null): void {
    KaleidoscopeEyeCombat.host = h;
  }

  static notifyEnemyHpLoss(enemy: CombatEnemy, amount: number): void {
    const h = KaleidoscopeEyeCombat.host;
    if (!h || !h.kaleidoscopeOwned() || amount <= 0) return;
    h.onEnemyDamaged(enemy);
  }

  static playerDamageMultiplier(): number {
    const h = KaleidoscopeEyeCombat.host;
    if (!h || !h.kaleidoscopeOwned()) return 1;
    return h.playerIncomingDamageMultiplier();
  }

  static notifyPlayerDamageApplied(): void {
    const h = KaleidoscopeEyeCombat.host;
    if (!h || !h.kaleidoscopeOwned()) return;
    h.onPlayerDamageApplied();
  }
}

export interface KaleidoscopeEyeCombatHost {
  kaleidoscopeOwned(): boolean;
  onEnemyDamaged(enemy: CombatEnemy): void;
  playerIncomingDamageMultiplier(): number;
  onPlayerDamageApplied(): void;
}
