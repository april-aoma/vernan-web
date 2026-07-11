import type { ItemCatalog } from "../item/ItemCatalog";
import type { PlayerItemInventory } from "../item/PlayerItemInventory";
import { ItemEffects } from "../item/effect/ItemEffects";
import { KaleidoscopeEyeState } from "../item/effect/kaleidoscope/KaleidoscopeEyeState";
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

/** Rolled once when MYSTERY_GIFT is picked up (Java PlayerStats.MysteryGiftRoll). */
export enum MysteryGiftRoll {
  NONE = 0,
  DAMAGE = 1,
  WINDUP = 2,
  JUMPSQUAT = 3,
  LUCK = 4,
}

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
  luck = 0;
  /** Coins (Java PlayerStats.money). Stub start value set at run boot until coin drops exist. */
  money = 0;
  /** Keys (Java PlayerStats.keys). */
  keys = 0;

  mysteryGiftRoll = MysteryGiftRoll.NONE;
  /** PLUG: temporary damage bonus after landing. */
  plugDamageBonus = 0;
  plugBonusFramesRemaining = 0;
  /** LEOTARD: cumulative damage bonus from taking hits. */
  leotardDamageBonus = 0;
  /** SKIRT: averaged ground accel/brake/friction baseline set at pickup (0 = unset). */
  skirtGroundTraction = 0;
  /** IRON_LUNG: room clears toward the next bonus soul heart. */
  ironLungRoomsCleared = 0;
  /** KALEIDOSCOPE_EYE: 1.0 = default gravity; lower = weaker fall. */
  kaleidoscopeGravityMult = 1;
  /** SHY_MASK: 1.0 = default gravity; higher = heavier fall. */
  shyMaskGravityMult = 1;
  shyMaskStacks = 0;
  /** HEART_OF_DARKNESS: retaliate on every hit (burst when black HP empties). */
  heartOfDarknessStacks = 0;
  /** DISC01–04 ability discs. */
  disc01SlideStacks = 0;
  disc02WalljumpStacks = 0;
  disc03AirDodgeStacks = 0;
  disc04HeavyStacks = 0;
  slideDistancePx = 0;
  slideSpeedMult = 0;
  slideKickDamageFixed = 0;
  slideKickDamageUsesAttackStat = false;
  slideKickDamageAttackStatBonus = 0;
  /** HEELIES: coasting ground movement (see HeelysMechanics). */
  heelysStacks = 0;
  /** PINK_SCARF: hold-jump float / air control. */
  pinkScarfStacks = 0;
  /** PONCHO: mid-air jump flap. */
  ponchoStacks = 0;
  /** KURIBO_SHOE: falling stomp. */
  kuriboShoeStacks = 0;
  /** AFTERIMAGE: lingering sword smear hitboxes. */
  afterimageStacks = 0;
  readonly kaleidoscopeEye = new KaleidoscopeEyeState();

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
    this.luck = 0;
    this.kaleidoscopeGravityMult = 1;
    this.shyMaskGravityMult = 1;
    this.shyMaskStacks = 0;
    this.heartOfDarknessStacks = 0;

    let groundFrictionFramesBonus = 0;
    let groundAccelFramesBonus = 0;
    let groundBrakeFramesBonus = 0;
    let redMaxBonus = 0;

    for (const id of inv.ownedIds()) {
      const def = catalog.def(id);
      if (def.subweapon) continue;
      const s = inv.stacksOf(id);
      this.attackDamage += s * def.damageBonusPerStack;
      this.luck += s * def.luckPerStack;
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

    let groundFrictionBaseFrames = (MAX_GROUND_SPEED * FIXED_STEP_HZ) / GROUND_FRICTION;
    let groundAccelBaseFrames = (MAX_GROUND_SPEED * FIXED_STEP_HZ) / GROUND_ACCEL;
    let groundBrakeBaseFrames = (MAX_GROUND_SPEED * FIXED_STEP_HZ) / GROUND_BRAKE;
    if (inv.stacksOf("SKIRT") > 0 && this.skirtGroundTraction > 0) {
      const skirtBaseFrames =
        (this.maxGroundSpeed * FIXED_STEP_HZ) / this.skirtGroundTraction;
      groundFrictionBaseFrames = skirtBaseFrames;
      groundAccelBaseFrames = skirtBaseFrames;
      groundBrakeBaseFrames = skirtBaseFrames;
    }
    this.groundFriction =
      (this.maxGroundSpeed * FIXED_STEP_HZ) /
      Math.max(1, groundFrictionBaseFrames + groundFrictionFramesBonus);
    this.groundAccel =
      (this.maxGroundSpeed * FIXED_STEP_HZ) /
      Math.max(1, groundAccelBaseFrames + groundAccelFramesBonus);
    this.groundBrake =
      (this.maxGroundSpeed * FIXED_STEP_HZ) /
      Math.max(1, groundBrakeBaseFrames + groundBrakeFramesBonus);

    ItemEffects.contributeStats(inv, this);
    this.heartOfDarknessStacks = inv.stacksOf("HEART_OF_DARKNESS");
    this.disc01SlideStacks = inv.stacksOf("DISC01_SLIDE");
    this.disc02WalljumpStacks = inv.stacksOf("DISC02_WALLJUMP");
    this.disc03AirDodgeStacks = inv.stacksOf("DISC03_AIRDODGE");
    this.disc04HeavyStacks = inv.stacksOf("DISC04_HEAVY");
    this.heelysStacks = inv.stacksOf("HEELIES");
    this.pinkScarfStacks = inv.stacksOf("PINK_SCARF");
    this.ponchoStacks = inv.stacksOf("PONCHO");
    this.kuriboShoeStacks = inv.stacksOf("KURIBO_SHOE");
    this.afterimageStacks = inv.stacksOf("AFTERIMAGE");
    if (this.disc01SlideStacks > 0) {
      const slideDef = catalog.def("DISC01_SLIDE");
      this.slideDistancePx = slideDef.slideDistancePx;
      this.slideSpeedMult = slideDef.slideSpeedMult;
      this.slideKickDamageFixed = slideDef.slideKickDamageFixed;
      this.slideKickDamageUsesAttackStat = slideDef.slideKickDamageUsesAttackStat;
      this.slideKickDamageAttackStatBonus = slideDef.slideKickDamageAttackStatBonus;
    } else {
      this.slideDistancePx = 0;
      this.slideSpeedMult = 0;
      this.slideKickDamageFixed = 0;
      this.slideKickDamageUsesAttackStat = false;
      this.slideKickDamageAttackStatBonus = 0;
    }
  }
}
