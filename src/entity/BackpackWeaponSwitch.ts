import type { Player } from "./Player";

/** Pending Shift+X / Shift+C cycles deferred until attack / subweapon / lemon poses finish. */
export class BackpackWeaponSwitch {
  private pendingPrimaryCycles = 0;
  private pendingSubweaponCycles = 0;

  reset(): void {
    this.pendingPrimaryCycles = 0;
    this.pendingSubweaponCycles = 0;
  }

  pendingPrimaryCyclesCount(): number {
    return this.pendingPrimaryCycles;
  }

  pendingSubweaponCyclesCount(): number {
    return this.pendingSubweaponCycles;
  }

  addPendingPrimaryCycle(): void {
    this.pendingPrimaryCycles++;
  }

  addPendingSubweaponCycle(): void {
    this.pendingSubweaponCycles++;
  }

  clearPendingPrimary(): void {
    this.pendingPrimaryCycles = 0;
  }

  clearPendingSubweapon(): void {
    this.pendingSubweaponCycles = 0;
  }

  static canApplyNow(player: Player): boolean {
    return !player.isAttacking() && !player.isSubweaponAnimating() && !player.isLemonPoseActive();
  }
}
