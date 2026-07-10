import { freezeFrames } from "../../combat/CombatMath";
import type { Aabb, WeaponStrike } from "../../combat/CombatMath";
import type { CombatEnemy } from "../../entity/CombatEnemy";

/**
 * SHIELD_BREAKER: attacks that overlap an enemy shield deal HP at stacks+1
 * instead of being blocked (Java ShieldBreakerCombat).
 */
export class ShieldBreakerCombat {
  private static stacks = 0;

  /** Melee shield contacts: Vernan offensive hitlag and enemy hitstun (not projectiles). */
  static readonly MELEE_SHIELD_CONTACT_HITSTUN_MULT = 2;

  static setStacks(shieldBreakerStacks: number): void {
    ShieldBreakerCombat.stacks = Math.max(0, shieldBreakerStacks);
  }

  static getStacks(): number {
    return ShieldBreakerCombat.stacks;
  }

  static active(): boolean {
    return ShieldBreakerCombat.stacks > 0;
  }

  /** stacks + 1 when equipped. */
  static shieldContactMultiplier(): number {
    return ShieldBreakerCombat.stacks + 1;
  }

  static scaleShieldContactDamage(baseDamage: number): number {
    return baseDamage * ShieldBreakerCombat.shieldContactMultiplier();
  }

  static scaleMeleeShieldContactHitstun(frames: number): number {
    return frames * ShieldBreakerCombat.MELEE_SHIELD_CONTACT_HITSTUN_MULT;
  }

  static meleeShieldContactHitstunFrames(shieldContactDamage: number, freezeMult = 1): number {
    return ShieldBreakerCombat.scaleMeleeShieldContactHitstun(
      freezeFrames(shieldContactDamage, freezeMult),
    );
  }

  /**
   * Melee shield penetration with doubled hitstun.
   * @returns freeze frames applied, or -1 if no penetration
   */
  static tryMeleeShieldPenetration(
    enemy: CombatEnemy,
    attackAabb: Aabb,
    baseDamage: number,
    attackerOriginX: number,
    attackerWidth: number,
    attackerFacing: number,
    knockKind: WeaponStrike["knockKind"],
    contact: { x: number; y: number },
  ): number {
    if (!ShieldBreakerCombat.active() || !enemy.attackBlockedByShield(attackAabb)) {
      return -1;
    }
    const damage = ShieldBreakerCombat.scaleShieldContactDamage(baseDamage);
    const ff = ShieldBreakerCombat.meleeShieldContactHitstunFrames(damage);
    const strike: WeaponStrike = {
      damage,
      freezeFrames: ff,
      attackerX: attackerOriginX,
      attackerW: attackerWidth,
      facing: attackerFacing,
      knockKind,
      contactWorldX: contact.x,
      contactWorldY: contact.y,
    };
    if (!enemy.applyWeaponStrike(strike)) return -1;
    return ff;
  }
}
