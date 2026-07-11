import type { WeaponStrike } from "./CombatMath";

/** Stores knockback deferred until the global black-heart beat ends (Java BlackHeartBeatDeferral). */
export class BlackHeartBeatDeferral {
  private locked = false;
  private knockVx = 0;
  private knockVy = 0;
  private pendingCorpseStrike: WeaponStrike | null = null;

  isLocked(): boolean {
    return this.locked;
  }

  beginLivingKnock(vx: number, vy: number): void {
    this.locked = true;
    this.knockVx = vx;
    this.knockVy = vy;
    this.pendingCorpseStrike = null;
  }

  beginCorpseKnock(strike: WeaponStrike): void {
    this.locked = true;
    this.pendingCorpseStrike = strike;
    this.knockVx = 0;
    this.knockVy = 0;
  }

  knockVxValue(): number {
    return this.knockVx;
  }

  knockVyValue(): number {
    return this.knockVy;
  }

  pendingCorpseStrikeValue(): WeaponStrike | null {
    return this.pendingCorpseStrike;
  }

  hasCorpseStrike(): boolean {
    return this.pendingCorpseStrike != null;
  }

  clear(): void {
    this.locked = false;
    this.pendingCorpseStrike = null;
    this.knockVx = 0;
    this.knockVy = 0;
  }
}
