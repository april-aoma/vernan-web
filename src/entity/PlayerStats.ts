import type { ItemCatalog } from "../item/ItemCatalog";
import type { PlayerItemInventory } from "../item/PlayerItemInventory";
import {
  ATTACK_ACTIVE_FRAMES,
  ATTACK_DAMAGE,
  ATTACK_RECOVER_EARLY_FRAMES,
  ATTACK_RECOVER_LATE_FRAMES,
  ATTACK_WINDUP_FRAMES,
  MAX_HEALTH,
} from "../config/CombatStats";
import {
  AIR_ACCEL,
  AIR_BRAKE,
  CLIMB_SPEED,
  GROUND_ACCEL,
  GROUND_BRAKE,
  GROUND_FRICTION,
  JUMP_SQUAT_FRAMES,
  JUMP_VEL,
  MAX_AIR_SPEED,
  MAX_GROUND_SPEED,
} from "../config/Physics";
import { FIXED_STEP_HZ } from "../specs";

/**
 * Mutable Vernan stats (Java PlayerStats subset + applyItemPassives).
 */
export class PlayerStats {
  maxHealth = MAX_HEALTH;
  attackDamage = ATTACK_DAMAGE;
  maxGroundSpeed = MAX_GROUND_SPEED;
  maxAirSpeed = MAX_AIR_SPEED;
  climbSpeed = CLIMB_SPEED;
  groundAccel = GROUND_ACCEL;
  groundBrake = GROUND_BRAKE;
  groundFriction = GROUND_FRICTION;
  airAccel = AIR_ACCEL;
  airBrake = AIR_BRAKE;
  jumpVel = JUMP_VEL;
  jumpSquatFrames = JUMP_SQUAT_FRAMES;
  attackWindupFrames = ATTACK_WINDUP_FRAMES;
  attackActiveFrames = ATTACK_ACTIVE_FRAMES;
  attackRecoverEarlyFrames = ATTACK_RECOVER_EARLY_FRAMES;
  attackRecoverLateFrames = ATTACK_RECOVER_LATE_FRAMES;
  damageMultiplierBonus = 0;
  /** Coins (Java PlayerStats.money). Stub start value set at run boot until coin drops exist. */
  money = 0;
  /** Keys (Java PlayerStats.keys). */
  keys = 0;

  get attackRecoverFrames(): number {
    return this.attackRecoverEarlyFrames + this.attackRecoverLateFrames;
  }

  /** Outgoing sword damage after bonuses. */
  outgoingDamage(): number {
    return this.attackDamage * (1 + this.damageMultiplierBonus);
  }

  applyItemPassives(inv: PlayerItemInventory, catalog: ItemCatalog): void {
    this.maxHealth = MAX_HEALTH;
    this.attackDamage = ATTACK_DAMAGE;
    this.maxGroundSpeed = MAX_GROUND_SPEED;
    this.maxAirSpeed = MAX_AIR_SPEED;
    this.climbSpeed = CLIMB_SPEED;
    this.jumpSquatFrames = JUMP_SQUAT_FRAMES;
    this.attackWindupFrames = ATTACK_WINDUP_FRAMES;
    this.attackActiveFrames = ATTACK_ACTIVE_FRAMES;
    this.attackRecoverEarlyFrames = ATTACK_RECOVER_EARLY_FRAMES;
    this.attackRecoverLateFrames = ATTACK_RECOVER_LATE_FRAMES;
    this.damageMultiplierBonus = 0;

    let groundFrictionFramesBonus = 0;
    let groundAccelFramesBonus = 0;
    let groundBrakeFramesBonus = 0;
    let redMaxBonus = 0;

    for (const id of inv.ownedIds()) {
      const def = catalog.def(id);
      if (def.subweapon) continue;
      const s = inv.stacksOf(id);
      this.attackDamage += s * def.damageBonusPerStack;
      this.maxGroundSpeed += s * def.groundSpeedBonusPerStack;
      this.maxAirSpeed += s * def.airSpeedBonusPerStack;
      this.climbSpeed += s * def.climbSpeedBonusPerStack;
      this.attackWindupFrames += s * def.attackWindupFramesBonusPerStack;
      this.attackActiveFrames += s * def.attackActiveFramesBonusPerStack;
      this.attackRecoverEarlyFrames += s * def.attackRecoverEarlyFramesBonusPerStack;
      this.attackRecoverLateFrames += s * def.attackRecoverLateFramesBonusPerStack;
      this.jumpSquatFrames += s * def.jumpSquatFramesBonusPerStack;
      groundFrictionFramesBonus += s * def.groundFrictionFramesBonusPerStack;
      groundAccelFramesBonus += s * def.groundAccelFramesBonusPerStack;
      groundBrakeFramesBonus += s * def.groundBrakeFramesBonusPerStack;
      redMaxBonus += s * def.redMaxBonusPerStack;
      if (def.damageMultiplierPerStack !== 1) {
        this.damageMultiplierBonus += s * (def.damageMultiplierPerStack - 1);
      }
    }

    this.attackWindupFrames = Math.max(1, this.attackWindupFrames);
    this.attackActiveFrames = Math.max(1, this.attackActiveFrames);
    this.attackRecoverEarlyFrames = Math.max(0, this.attackRecoverEarlyFrames);
    this.attackRecoverLateFrames = Math.max(0, this.attackRecoverLateFrames);
    this.jumpSquatFrames = Math.max(1, this.jumpSquatFrames);

    // Heart containers: +2 HP units per redMaxBonus stack (Java syncHealthCapFromItems).
    this.maxHealth = MAX_HEALTH + redMaxBonus * 2;

    const baseFrictionFrames = (MAX_GROUND_SPEED * FIXED_STEP_HZ) / GROUND_FRICTION;
    const baseAccelFrames = (MAX_GROUND_SPEED * FIXED_STEP_HZ) / GROUND_ACCEL;
    const baseBrakeFrames = (MAX_GROUND_SPEED * FIXED_STEP_HZ) / GROUND_BRAKE;
    this.groundFriction =
      (this.maxGroundSpeed * FIXED_STEP_HZ) /
      Math.max(1, baseFrictionFrames + groundFrictionFramesBonus);
    this.groundAccel =
      (this.maxGroundSpeed * FIXED_STEP_HZ) /
      Math.max(1, baseAccelFrames + groundAccelFramesBonus);
    this.groundBrake =
      (this.maxGroundSpeed * FIXED_STEP_HZ) /
      Math.max(1, baseBrakeFrames + groundBrakeFramesBonus);
  }
}
