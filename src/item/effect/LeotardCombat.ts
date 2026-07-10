/** Global bridge from player damage into leotard handling (Java LeotardCombat). */
export class LeotardCombat {
  private static host: LeotardCombatHost | null = null;

  static setHost(h: LeotardCombatHost | null): void {
    LeotardCombat.host = h;
  }

  static notifyPlayerDamageApplied(damageDealt: number): void {
    const h = LeotardCombat.host;
    if (!h || !h.leotardOwned() || damageDealt <= 0) return;
    h.onPlayerDamageApplied(damageDealt);
  }
}

export interface LeotardCombatHost {
  leotardOwned(): boolean;
  onPlayerDamageApplied(damageDealt: number): void;
}
