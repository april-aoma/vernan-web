import {
  freezeFrames,
  type Aabb,
  type WeaponStrike,
} from "../../combat/CombatMath";
import type { CombatEnemy } from "../../entity/CombatEnemy";
import type { Player } from "../../entity/Player";

/**
 * FUZZY_HAT: body-contact electrocution (hurtbox overlap).
 * Java FuzzyHatContactEffect (stomp path deferred — no Kuribo shoe yet).
 */
export class FuzzyHatContactEffect {
  static readonly ELECTROCUTION_DAMAGE_PER_STACK = 1.5;
  /** Enemy-only: multiplier on freezeFrames for electrocution hitstun. */
  static readonly ELECTROCUTION_HITSTUN_MULT = 5;

  static electrocutionFreezeFrames(): number {
    return freezeFrames(1, 1) * FuzzyHatContactEffect.ELECTROCUTION_HITSTUN_MULT;
  }

  static electrocutionDamage(fuzzyHatStacks: number): number {
    return FuzzyHatContactEffect.ELECTROCUTION_DAMAGE_PER_STACK * Math.max(0, fuzzyHatStacks);
  }

  /**
   * Vernan hurtbox touching an enemy (not sword hits).
   * Applies scaled damage + extended enemy hitstun. Does not extend Vernan's hitlag.
   * @returns strike if applied, else null
   */
  static applyBodyContactElectrocution(
    fuzzyHatStacks: number,
    enemy: CombatEnemy,
    player: Player,
    contact: { x: number; y: number },
  ): WeaponStrike | null {
    if (fuzzyHatStacks <= 0 || enemy.isDead()) return null;
    const strike: WeaponStrike = {
      damage: FuzzyHatContactEffect.electrocutionDamage(fuzzyHatStacks),
      freezeFrames: FuzzyHatContactEffect.electrocutionFreezeFrames(),
      attackerX: player.x,
      attackerW: player.w,
      facing: player.facing,
      knockKind: "sword_stand",
      contactWorldX: contact.x,
      contactWorldY: contact.y,
    };
    if (!enemy.applyWeaponStrike(strike)) return null;
    return strike;
  }
}

/** Midpoint of two AABBs for VFX (Java CombatHitVfx.contactBetween approx). */
export function contactBetweenHurtAndEnemy(hurt: Aabb, enemy: Aabb): { x: number; y: number } {
  const ax0 = hurt.x;
  const ay0 = hurt.y;
  const ax1 = hurt.x + hurt.w;
  const ay1 = hurt.y + hurt.h;
  const bx0 = enemy.x;
  const by0 = enemy.y;
  const bx1 = enemy.x + enemy.w;
  const by1 = enemy.y + enemy.h;
  const x0 = Math.max(ax0, bx0);
  const y0 = Math.max(ay0, by0);
  const x1 = Math.min(ax1, bx1);
  const y1 = Math.min(ay1, by1);
  if (x1 > x0 && y1 > y0) {
    return { x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5 };
  }
  return {
    x: (hurt.x + hurt.w * 0.5 + enemy.x + enemy.w * 0.5) * 0.5,
    y: (hurt.y + hurt.h * 0.5 + enemy.y + enemy.h * 0.5) * 0.5,
  };
}
