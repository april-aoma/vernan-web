import {
  freezeFrames,
  placePolygonAabb,
  type Aabb,
  type KnockbackKind,
  type WeaponStrike,
} from "../combat/CombatMath";
import {
  ATTACK_ACTIVE_FRAMES,
  ATTACK_RECOVER_EARLY_FRAMES,
  ATTACK_RECOVER_LATE_FRAMES,
  ATTACK_WINDUP_FRAMES,
  CROUCH_ATTACK_RECOVER_EARLY_FRAMES_DELTA,
  CROUCH_ATTACK_RECOVER_LATE_FRAMES_DELTA,
  CROUCH_ATTACK_WINDUP_FRAMES_DELTA,
} from "../config/CombatStats";
import {
  HEADBAND_CROUCH_ATTACK1_ACTIVE_LOCAL,
  HEADBAND_CROUCH_ATTACK1_ACTIVE_PIVOT_X,
  HEADBAND_SIDE_ATTACK0_ACTIVE_A_LOCAL,
  HEADBAND_SIDE_ATTACK0_ACTIVE_A_PIVOT_X,
  HEADBAND_SIDE_ATTACK0_ACTIVE_B_LOCAL,
  HEADBAND_SIDE_ATTACK0_ACTIVE_B_PIVOT_X,
  HEADBAND_SIDE_ATTACK0_SETUP_LOCAL,
  HEADBAND_SIDE_ATTACK0_SETUP_PIVOT_X,
  HEADBAND_UP_ATTACK0_ACTIVE_LOCAL,
  HEADBAND_UP_ATTACK0_ACTIVE_PIVOT_X,
} from "../config/HitboxValues";
import type { Input } from "../input/Input";
import { AutismCombat } from "../item/effect/AutismCombat";
import { contactBetweenHurtAndEnemy } from "../item/effect/FuzzyHatContactEffect";
import { KaleidoscopeEyeCombat } from "../item/effect/kaleidoscope/KaleidoscopeEyeCombat";
import { ShieldBreakerCombat } from "../item/effect/ShieldBreakerCombat";
import type { PlayerItemInventory } from "../item/PlayerItemInventory";
import { FIXED_STEP_HZ } from "../specs";
import type { CombatEnemy } from "./CombatEnemy";
import type { PlayerStats } from "./PlayerStats";

/** HEADBAND exclusive attacks (Java HeadbandAttackKind). */
export type HeadbandAttackKind = "none" | "crouch_kick" | "up_attack" | "side_attack";

/** Side-attack chord buffer (Java Player.CHORD_BUFFER). */
const CHORD_BUFFER = 0.18;

const HEADBAND_CROUCH_ATTACK1_TICKS = [6, 4, 6, 6] as const;
const HEADBAND_CROUCH_ATTACK1_HIT_FRAME = 1;
const HEADBAND_CROUCH_ATTACK1_LATE_RECOVER_FRAME = 3;

const HEADBAND_UP_ATTACK0_TICKS = [6, 6, 4, 8, 8, 6, 6] as const;
const HEADBAND_UP_ATTACK0_HIT_FRAME = 2;
const HEADBAND_UP_ATTACK0_LATE_RECOVER_FRAME = 5;

const HEADBAND_SIDE_ATTACK0_TICKS = [10, 10, 10, 10, 10, 10] as const;
const HEADBAND_SIDE_ATTACK0_HIT_FRAME_SETUP = 0;
const HEADBAND_SIDE_ATTACK0_HIT_FRAME_A = 2;
const HEADBAND_SIDE_ATTACK0_HIT_FRAME_B = 5;

const HEADBAND_STAND_WINDUP_REF = ATTACK_WINDUP_FRAMES;
const HEADBAND_ATTACK_ACTIVE_REF = ATTACK_ACTIVE_FRAMES;
const HEADBAND_STAND_RECOVER_EARLY_REF = ATTACK_RECOVER_EARLY_FRAMES;
const HEADBAND_STAND_RECOVER_LATE_REF = ATTACK_RECOVER_LATE_FRAMES;
const HEADBAND_CROUCH_WINDUP_REF = ATTACK_WINDUP_FRAMES + CROUCH_ATTACK_WINDUP_FRAMES_DELTA;
const HEADBAND_CROUCH_RECOVER_EARLY_REF =
  ATTACK_RECOVER_EARLY_FRAMES + CROUCH_ATTACK_RECOVER_EARLY_FRAMES_DELTA;
const HEADBAND_CROUCH_RECOVER_LATE_REF =
  ATTACK_RECOVER_LATE_FRAMES + CROUCH_ATTACK_RECOVER_LATE_FRAMES_DELTA;

const HEADBAND_CROUCH_DAMAGE_MULT = 0.3;
const HEADBAND_UP_DAMAGE_MULT = 1.2;
const HEADBAND_SIDE_ATTACK_DAMAGE_MULT = 0.5;
const HEADBAND_SIDE_ATTACK_SETUP_DAMAGE_MULT = 0.75;

export const HEADBAND_SIDE_ATTACK_SETUP_PULL_AHEAD_PX = 20;
const HEADBAND_SIDE_ATTACK_SPEED_LAUNCH_MULT = 0.25;
const HEADBAND_SIDE_ATTACK_SPEED_PEAK_MULT = 1.1;
const HEADBAND_SIDE_ATTACK_SPEED_END_MULT = 0.75;
export const HEADBAND_SIDE_ATTACK_GRAVITY_MULT = 0.25;

const HEADBAND_SIDE_ATTACK_MAX_FULL_LOOPS = 2;
const HEADBAND_SIDE_ATTACK_MIN_FULL_LOOPS = 1;
const HEADBAND_SIDE_ATTACK_END_LOOP = 2;

const HEADBAND_ATTACK_BODY_SPRITE_H = 32;
const HEADBAND_HITSTUN_MULT = 1.8;

export interface HeadbandCombatHost {
  onGround: boolean;
  crouching: boolean;
  facing: number;
  x: number;
  y: number;
  w: number;
  h: number;
  landingLockFrames: number;
  getupLockFrames: number;
  climbing: boolean;
  attackPhase: number;
  stats: Pick<
    PlayerStats,
    | "attackWindupFrames"
    | "attackActiveFrames"
    | "attackRecoverEarlyFrames"
    | "attackRecoverLateFrames"
    | "maxGroundSpeed"
  > & {
    outgoingDamage(): number;
  };
  attackTimingScale(): number;
  isSubweaponAnimating(): boolean;
  /** Must be {@code "fists"} for headband attacks (Java SwordVisual.FISTS). */
  swordVisual: string;
  inventory: Pick<PlayerItemInventory, "stacksOf">;
  /** Blocks side-attack re-hits during offensive hitlag (Java offensiveHitlagTimeRemaining). */
  offensiveHitlagRemaining: number;
}

/**
 * HEADBAND / fists exclusive attacks (Java Player headband fields + updateHeadbandAttack).
 */
export class HeadbandCombat {
  private kind_: HeadbandAttackKind = "none";
  private frameIndex_ = 0;
  private frameTimeLeft = 0;
  private hitLanded = false;
  /** Enemy took damage this swing — enables late-recover / side-chain cancel on X. */
  private damageConfirmed = false;
  private startedOnGround = true;
  private sideAttackLoop = 0;
  private sideAttackFullLoops = HEADBAND_SIDE_ATTACK_MAX_FULL_LOOPS;
  private sideLatchedFacing = 1;
  private readonly sideHitEnemiesIndex0 = new Set<CombatEnemy>();
  private readonly sideHitEnemiesIndex2 = new Set<CombatEnemy>();
  private readonly sideHitEnemiesIndex5 = new Set<CombatEnemy>();

  private horizontalChordBufferTimer = 0;
  private attackChordBufferTimer = 0;
  private horizontalChordDir = 0;
  private sideAttackOppositeChordTapped = false;

  isActive(): boolean {
    return this.kind_ !== "none";
  }

  kind(): HeadbandAttackKind {
    return this.kind_;
  }

  frameIndex(): number {
    if (this.kind_ === "none") return 0;
    const ticks = this.frameTicks();
    return Math.min(this.frameIndex_, ticks.length - 1);
  }

  get headbandAttackDamageConfirmed(): boolean {
    return this.damageConfirmed;
  }

  attackHitLanded(): boolean {
    return this.hitLanded;
  }

  isCrouchKick(): boolean {
    return this.kind_ === "crouch_kick";
  }

  isUpAttack(): boolean {
    return this.kind_ === "up_attack";
  }

  isSideAttack(): boolean {
    return this.kind_ === "side_attack";
  }

  sideAttackLatchedFacing(): number {
    return this.sideLatchedFacing;
  }

  attackStartedOnGround(): boolean {
    return this.startedOnGround;
  }

  sideAttackGravityMult(): number {
    return this.isSideAttack() ? HEADBAND_SIDE_ATTACK_GRAVITY_MULT : 1;
  }

  sideAttackSpeed(host: HeadbandCombatHost): number {
    if (!this.isSideAttack()) return 0;
    const frameDur = this.sideAttackFrameSeconds(host, this.frameIndex_);
    const frameFrac = frameDur > 1e-9 ? 1 - this.frameTimeLeft / frameDur : 1;
    const steps = this.sideAttackLoop * 6 + this.frameIndex_ + frameFrac;
    const launchEndStep = 1;
    const attackEndStep = this.sideAttackFullLoops * 6 + 2;
    let mult: number;
    if (steps < launchEndStep) {
      const t = steps / launchEndStep;
      mult =
        HEADBAND_SIDE_ATTACK_SPEED_LAUNCH_MULT +
        (HEADBAND_SIDE_ATTACK_SPEED_PEAK_MULT - HEADBAND_SIDE_ATTACK_SPEED_LAUNCH_MULT) * t;
    } else {
      const t = Math.min(1, (steps - launchEndStep) / (attackEndStep - launchEndStep));
      mult =
        HEADBAND_SIDE_ATTACK_SPEED_PEAK_MULT +
        (HEADBAND_SIDE_ATTACK_SPEED_END_MULT - HEADBAND_SIDE_ATTACK_SPEED_PEAK_MULT) * t;
    }
    return host.stats.maxGroundSpeed * mult;
  }

  isLateRecoverFrame(): boolean {
    switch (this.kind_) {
      case "crouch_kick":
        return this.frameIndex_ >= HEADBAND_CROUCH_ATTACK1_LATE_RECOVER_FRAME;
      case "up_attack":
        return this.frameIndex_ >= HEADBAND_UP_ATTACK0_LATE_RECOVER_FRAME;
      default:
        return false;
    }
  }

  headbandKnockbackKind(): KnockbackKind | null {
    switch (this.kind_) {
      case "crouch_kick":
        return this.frameIndex_ === HEADBAND_CROUCH_ATTACK1_HIT_FRAME
          ? "headband_crouch_kick"
          : null;
      case "up_attack":
        return this.frameIndex_ === HEADBAND_UP_ATTACK0_HIT_FRAME ? "headband_up_attack" : null;
      case "side_attack":
        if (this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_SETUP) {
          return "headband_side_attack_setup";
        }
        if (
          this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_A ||
          this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_B
        ) {
          return "headband_side_attack";
        }
        return null;
      default:
        return null;
    }
  }

  damageMult(): number {
    switch (this.kind_) {
      case "crouch_kick":
        return this.frameIndex_ === HEADBAND_CROUCH_ATTACK1_HIT_FRAME
          ? HEADBAND_CROUCH_DAMAGE_MULT
          : 1;
      case "up_attack":
        return this.frameIndex_ === HEADBAND_UP_ATTACK0_HIT_FRAME ? HEADBAND_UP_DAMAGE_MULT : 1;
      case "side_attack":
        if (this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_SETUP) {
          return HEADBAND_SIDE_ATTACK_SETUP_DAMAGE_MULT;
        }
        if (
          this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_A ||
          this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_B
        ) {
          return HEADBAND_SIDE_ATTACK_DAMAGE_MULT;
        }
        return 1;
      default:
        return 1;
    }
  }

  cancel(): void {
    this.kind_ = "none";
    this.frameIndex_ = 0;
    this.frameTimeLeft = 0;
    this.hitLanded = false;
    this.damageConfirmed = false;
    this.startedOnGround = false;
    this.sideAttackLoop = 0;
    this.sideAttackFullLoops = HEADBAND_SIDE_ATTACK_MAX_FULL_LOOPS;
    this.sideHitEnemiesIndex0.clear();
    this.sideHitEnemiesIndex2.clear();
    this.sideHitEnemiesIndex5.clear();
  }

  /** Sword active AABB for the current headband hit frame, or null. */
  attackHitbox(host: HeadbandCombatHost): Aabb | null {
    if (this.kind_ === "side_attack") {
      return this.sideAttackHitbox(host);
    }
    if (this.kind_ === "none") return null;
    if (this.frameIndex_ !== this.hitFrameIndex()) return null;
    const up = this.kind_ === "up_attack";
    const local = up ? HEADBAND_UP_ATTACK0_ACTIVE_LOCAL : HEADBAND_CROUCH_ATTACK1_ACTIVE_LOCAL;
    const pivot = up
      ? HEADBAND_UP_ATTACK0_ACTIVE_PIVOT_X
      : HEADBAND_CROUCH_ATTACK1_ACTIVE_PIVOT_X;
    return this.placeHeadbandPolygonForHost(
      local,
      pivot,
      host,
      host.y + host.h,
      host.facing,
    );
  }

  /**
   * Headband vs enemies: overlapping foes on active hit frames (Java applyHeadbandAttackHits /
   * applyHeadbandSideAttackHits). Does not latch {@link #hitLanded} for side swings.
   */
  applyHits(
    host: HeadbandCombatHost,
    enemies: CombatEnemy[],
    onHit?: (
      enemy: CombatEnemy,
      strike: WeaponStrike,
      hitbox: Aabb,
      vfx: "slash" | "shield_break",
    ) => void,
  ): number {
    if (this.kind_ === "side_attack") {
      return this.applySideAttackHits(host, enemies, onHit);
    }
    const hitbox = this.attackHitbox(host);
    if (!hitbox || this.hitLanded) return 0;
    const kb = this.headbandKnockbackKind();
    if (!kb) return 0;
    const dmg = host.stats.outgoingDamage() * this.damageMult();
    let any = false;
    let maxFreeze = 0;
    for (const e of enemies) {
      if (e.isDead()) continue;
      if (e.attackBlockedByShield(hitbox)) {
        const er = e.rect();
        const contact = contactBetweenHurtAndEnemy(hitbox, er);
        const pen = ShieldBreakerCombat.tryMeleeShieldPenetration(
          e,
          hitbox,
          dmg,
          host.x,
          host.w,
          host.facing,
          kb,
          contact,
        );
        if (pen >= 0) {
          any = true;
          maxFreeze = Math.max(maxFreeze, pen);
          this.damageConfirmed = true;
          const strike: WeaponStrike = {
            damage: ShieldBreakerCombat.scaleShieldContactDamage(dmg),
            freezeFrames: pen,
            attackerX: host.x,
            attackerW: host.w,
            facing: host.facing,
            knockKind: kb,
            contactWorldX: contact.x,
            contactWorldY: contact.y,
          };
          AutismCombat.notifyPlayerDamageDealt(e, strike.damage);
          KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, strike.damage);
          onHit?.(e, strike, hitbox, "shield_break");
        } else {
          const ff = this.scaleOutgoingHitstun(host, freezeFrames(dmg));
          e.applyShieldBlockStrike({
            damage: 0,
            freezeFrames: ff,
            attackerX: host.x,
            attackerW: host.w,
            facing: host.facing,
            knockKind: kb,
          });
          any = true;
          maxFreeze = Math.max(maxFreeze, ff);
        }
        continue;
      }
      if (!e.intersectsAttack(hitbox)) continue;
      const ff = this.scaleOutgoingHitstun(host, freezeFrames(dmg));
      const strike: WeaponStrike = {
        damage: dmg,
        freezeFrames: ff,
        attackerX: host.x,
        attackerW: host.w,
        facing: host.facing,
        knockKind: kb,
      };
      const hit = e.applyWeaponStrike(strike);
      if (hit) {
        any = true;
        maxFreeze = Math.max(maxFreeze, ff);
        this.damageConfirmed = true;
        AutismCombat.notifyPlayerDamageDealt(e, dmg);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, dmg);
        onHit?.(e, strike, hitbox, "slash");
      }
    }
    if (any) this.hitLanded = true;
    return maxFreeze;
  }

  update(dt: number, input: Input, host: HeadbandCombatHost): void {
    this.tickChordBuffers(dt, input);
    if (!this.headbandOwned(host)) return;
    if (host.isSubweaponAnimating()) return;

    if (this.kind_ !== "none") {
      if (this.kind_ === "side_attack") {
        if (this.tryCancelSideAttackChain(input)) {
          // Fall through — same tick may chain another attack.
        } else {
          this.frameTimeLeft -= dt;
          if (this.frameTimeLeft > 0) return;
          this.advanceSideAttackFrame(host);
          return;
        }
      } else if (this.kind_ === "crouch_kick" && !host.onGround) {
        this.cancel();
      } else if (this.tryCancelLateRecoverOnAttack(input)) {
        // Fall through — same tick may chain another swing.
      } else {
        this.frameTimeLeft -= dt;
        if (this.frameTimeLeft > 0) return;
        const ticks = this.frameTicks();
        this.frameIndex_++;
        if (this.frameIndex_ >= ticks.length) {
          this.cancel();
        } else {
          this.frameTimeLeft = this.attackFrameSeconds(host, this.frameIndex_);
        }
        return;
      }
    }
    this.tryBeginFromInput(input, host);
  }

  /** Begin crouch / up / side headband attacks from buffered chord + X (Java tryBeginHeadbandAttackFromInput). */
  tryBeginFromInput(input: Input, host: HeadbandCombatHost): boolean {
    if (!this.headbandOwned(host)) return false;
    if (this.tryBeginSideAttackFromInput(input, host)) return true;
    if (this.kind_ !== "none") return false;
    if (host.attackPhase !== 0) return false;
    if (host.swordVisual !== "fists") return false;
    if (host.isSubweaponAnimating()) return false;
    if (
      input.attackPressed &&
      host.onGround &&
      host.landingLockFrames === 0 &&
      host.getupLockFrames === 0 &&
      !host.climbing
    ) {
      const downHeld = input.down && !input.up;
      if (downHeld) {
        this.beginAttack("crouch_kick", host);
        return true;
      }
      if (input.up) {
        this.beginAttack("up_attack", host);
        return true;
      }
    }
    return false;
  }

  private applySideAttackHits(
    host: HeadbandCombatHost,
    enemies: CombatEnemy[],
    onHit?: (
      enemy: CombatEnemy,
      strike: WeaponStrike,
      hitbox: Aabb,
      vfx: "slash" | "shield_break",
    ) => void,
  ): number {
    if (host.offensiveHitlagRemaining > 0) return 0;
    const hitbox = this.sideAttackHitbox(host);
    if (!hitbox) return 0;
    const kb = this.headbandKnockbackKind();
    if (!kb) return 0;
    const hitSet = this.sideHitSetForFrame();
    if (!hitSet) return 0;
    const dmg = host.stats.outgoingDamage() * this.damageMult();
    const strikeFacing = this.sideLatchedFacing;
    const setupHit = kb === "headband_side_attack_setup";
    const setupLaneX =
      host.x + host.w * 0.5 + strikeFacing * HEADBAND_SIDE_ATTACK_SETUP_PULL_AHEAD_PX;
    const setupLaneY = host.y + host.h * 0.5;
    let anyEnemyHit = false;
    let anyShieldBlock = false;
    let maxFreeze = 0;
    for (const e of enemies) {
      if (e.isDead() || hitSet.has(e)) continue;
      if (e.attackBlockedByShield(hitbox)) {
        const er = e.rect();
        const contact = contactBetweenHurtAndEnemy(hitbox, er);
        const pen = ShieldBreakerCombat.tryMeleeShieldPenetration(
          e,
          hitbox,
          dmg,
          host.x,
          host.w,
          strikeFacing,
          kb,
          contact,
        );
        if (pen >= 0) {
          const strike: WeaponStrike = setupHit
            ? {
                damage: ShieldBreakerCombat.scaleShieldContactDamage(dmg),
                freezeFrames: pen,
                attackerX: host.x,
                attackerW: host.w,
                facing: strikeFacing,
                knockKind: kb,
                contactWorldX: setupLaneX,
                contactWorldY: setupLaneY,
              }
            : {
                damage: ShieldBreakerCombat.scaleShieldContactDamage(dmg),
                freezeFrames: pen,
                attackerX: host.x,
                attackerW: host.w,
                facing: strikeFacing,
                knockKind: kb,
                contactWorldX: contact.x,
                contactWorldY: contact.y,
              };
          e.applyWeaponStrike(strike);
          hitSet.add(e);
          anyEnemyHit = true;
          maxFreeze = Math.max(maxFreeze, pen);
          AutismCombat.notifyPlayerDamageDealt(e, strike.damage);
          KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, strike.damage);
          onHit?.(e, strike, hitbox, "shield_break");
        } else {
          const ff = this.scaleOutgoingHitstun(host, freezeFrames(dmg));
          e.applyShieldBlockStrike({
            damage: 0,
            freezeFrames: ff,
            attackerX: host.x,
            attackerW: host.w,
            facing: strikeFacing,
            knockKind: kb,
            contactWorldX: contact.x,
            contactWorldY: contact.y,
          });
          hitSet.add(e);
          anyShieldBlock = true;
          maxFreeze = Math.max(maxFreeze, ff);
        }
        continue;
      }
      if (!e.intersectsAttack(hitbox)) continue;
      const ff = this.scaleOutgoingHitstun(host, freezeFrames(dmg));
      const er = e.rect();
      const contact = contactBetweenHurtAndEnemy(hitbox, er);
      const strike: WeaponStrike = setupHit
        ? {
            damage: dmg,
            freezeFrames: ff,
            attackerX: host.x,
            attackerW: host.w,
            facing: strikeFacing,
            knockKind: kb,
            contactWorldX: setupLaneX,
            contactWorldY: setupLaneY,
          }
        : {
            damage: dmg,
            freezeFrames: ff,
            attackerX: host.x,
            attackerW: host.w,
            facing: strikeFacing,
            knockKind: kb,
            contactWorldX: contact.x,
            contactWorldY: contact.y,
          };
      const hit = e.applyWeaponStrike(strike);
      hitSet.add(e);
      if (hit) {
        anyEnemyHit = true;
        maxFreeze = Math.max(maxFreeze, ff);
        AutismCombat.notifyPlayerDamageDealt(e, dmg);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, dmg);
        onHit?.(e, strike, hitbox, "slash");
      }
    }
    if (anyEnemyHit || anyShieldBlock) {
      if (anyEnemyHit) this.damageConfirmed = true;
    }
    return maxFreeze;
  }

  private beginAttack(kind: Exclude<HeadbandAttackKind, "none" | "side_attack">, host: HeadbandCombatHost): void {
    this.kind_ = kind;
    this.frameIndex_ = 0;
    this.hitLanded = false;
    this.damageConfirmed = false;
    this.startedOnGround = host.onGround;
    this.frameTimeLeft = this.attackFrameSeconds(host, 0);
  }

  private beginSideAttack(latchedFacing: number, fullLoops: number, host: HeadbandCombatHost): void {
    this.kind_ = "side_attack";
    this.frameIndex_ = 0;
    this.sideAttackLoop = 0;
    this.sideAttackFullLoops = Math.max(
      HEADBAND_SIDE_ATTACK_MIN_FULL_LOOPS,
      Math.min(HEADBAND_SIDE_ATTACK_MAX_FULL_LOOPS, fullLoops),
    );
    this.hitLanded = false;
    this.damageConfirmed = false;
    this.startedOnGround = host.onGround;
    this.sideLatchedFacing = latchedFacing >= 0 ? 1 : -1;
    host.facing = this.sideLatchedFacing;
    this.sideHitEnemiesIndex0.clear();
    this.sideHitEnemiesIndex2.clear();
    this.sideHitEnemiesIndex5.clear();
    this.frameTimeLeft = this.sideAttackFrameSeconds(host, 0);
  }

  private tryBeginSideAttackFromInput(input: Input, host: HeadbandCombatHost): boolean {
    if (!this.canBeginSideAttack(host)) return false;
    if (!this.sideAttackChordCompletedThisFrame(input)) return false;
    if (input.down && !input.up) return false;
    if (input.up) return false;
    const dir = this.resolveSideAttackChordDirection(input, host);
    if (dir === 0) return false;
    const fullLoops = this.sideAttackOppositeChordTapped
      ? HEADBAND_SIDE_ATTACK_MIN_FULL_LOOPS
      : HEADBAND_SIDE_ATTACK_MAX_FULL_LOOPS;
    this.consumeSideAttackChordInput(input);
    this.beginSideAttack(dir, fullLoops, host);
    return true;
  }

  private canBeginSideAttack(host: HeadbandCombatHost): boolean {
    if (!this.headbandOwned(host)) return false;
    if (this.kind_ !== "none") return false;
    if (host.attackPhase !== 0) return false;
    if (host.swordVisual !== "fists") return false;
    if (host.isSubweaponAnimating()) return false;
    if (
      host.landingLockFrames > 0 ||
      host.getupLockFrames > 0 ||
      host.climbing
    ) {
      return false;
    }
    return true;
  }

  private sideAttackChordCompletedThisFrame(input: Input): boolean {
    return (
      (input.attackPressed && this.horizontalChordBufferTimer > 0) ||
      ((input.leftPressed || input.rightPressed) && this.attackChordBufferTimer > 0)
    );
  }

  private resolveSideAttackChordDirection(input: Input, host: HeadbandCombatHost): number {
    if (input.left && !input.right) return -1;
    if (input.right && !input.left) return 1;
    if (this.horizontalChordDir !== 0) return this.horizontalChordDir;
    return host.facing;
  }

  private consumeSideAttackChordInput(input: Input): void {
    input.consumePress("KeyX");
    input.consumePress("ArrowLeft");
    input.consumePress("ArrowRight");
    input.consumePress("KeyA");
    input.consumePress("KeyD");
    this.horizontalChordBufferTimer = 0;
    this.attackChordBufferTimer = 0;
    this.horizontalChordDir = 0;
    this.sideAttackOppositeChordTapped = false;
  }

  private tickChordBuffers(dt: number, input: Input): void {
    if (input.attackPressed) {
      this.attackChordBufferTimer = CHORD_BUFFER;
    }
    if (input.leftPressed && input.rightPressed) {
      this.sideAttackOppositeChordTapped = false;
      this.horizontalChordDir = 1;
      this.horizontalChordBufferTimer = CHORD_BUFFER;
    } else if (input.leftPressed) {
      this.handleHorizontalChordPress(-1);
    } else if (input.rightPressed) {
      this.handleHorizontalChordPress(1);
    }
    this.attackChordBufferTimer = Math.max(0, this.attackChordBufferTimer - dt);
    this.horizontalChordBufferTimer = Math.max(0, this.horizontalChordBufferTimer - dt);
    if (this.horizontalChordBufferTimer <= 0 && this.attackChordBufferTimer <= 0) {
      this.sideAttackOppositeChordTapped = false;
    }
  }

  private handleHorizontalChordPress(newDir: number): void {
    if (
      this.horizontalChordBufferTimer > 0 &&
      this.horizontalChordDir !== 0 &&
      newDir !== this.horizontalChordDir
    ) {
      this.sideAttackOppositeChordTapped = true;
      this.horizontalChordBufferTimer = CHORD_BUFFER;
      return;
    }
    if (this.horizontalChordBufferTimer <= 0) {
      this.sideAttackOppositeChordTapped = false;
    }
    this.horizontalChordDir = newDir;
    this.horizontalChordBufferTimer = CHORD_BUFFER;
  }

  private tryCancelLateRecoverOnAttack(input: Input): boolean {
    if (!this.damageConfirmed || !this.isLateRecoverFrame()) return false;
    if (!input.attackPressed) return false;
    this.cancel();
    return true;
  }

  private tryCancelSideAttackChain(input: Input): boolean {
    if (!this.damageConfirmed || !this.isSideAttackChainFrame()) return false;
    if (!input.attackPressed) return false;
    this.cancel();
    return true;
  }

  private isSideAttackChainFrame(): boolean {
    return (
      this.kind_ === "side_attack" &&
      this.sideAttackLoop === HEADBAND_SIDE_ATTACK_END_LOOP &&
      (this.frameIndex_ === 0 || this.frameIndex_ === 1)
    );
  }

  private advanceSideAttackFrame(host: HeadbandCombatHost): void {
    if (
      this.sideAttackLoop === HEADBAND_SIDE_ATTACK_END_LOOP &&
      this.frameIndex_ >= 1
    ) {
      this.cancel();
      return;
    }
    this.frameIndex_++;
    if (this.frameIndex_ > 5) {
      if (this.sideAttackLoop + 1 < this.sideAttackFullLoops) {
        this.sideAttackLoop++;
        this.frameIndex_ = 0;
        this.clearSideAttackLoopHits();
      } else if (this.sideAttackLoop < HEADBAND_SIDE_ATTACK_END_LOOP) {
        this.sideAttackLoop = HEADBAND_SIDE_ATTACK_END_LOOP;
        this.frameIndex_ = 0;
        this.clearSideAttackLoopHits();
      } else {
        this.cancel();
        return;
      }
    }
    this.frameTimeLeft = this.sideAttackFrameSeconds(host, this.frameIndex_);
  }

  private clearSideAttackLoopHits(): void {
    this.sideHitEnemiesIndex2.clear();
    this.sideHitEnemiesIndex5.clear();
  }

  private sideAttackHitbox(host: HeadbandCombatHost): Aabb | null {
    if (!this.isSideAttack()) return null;
    if (
      this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_SETUP &&
      this.sideAttackLoop !== 0
    ) {
      return null;
    }
    let local: number[] | null = null;
    let pivot = 16;
    switch (this.frameIndex_) {
      case HEADBAND_SIDE_ATTACK0_HIT_FRAME_SETUP:
        local = HEADBAND_SIDE_ATTACK0_SETUP_LOCAL;
        pivot = HEADBAND_SIDE_ATTACK0_SETUP_PIVOT_X;
        break;
      case HEADBAND_SIDE_ATTACK0_HIT_FRAME_A:
        local = HEADBAND_SIDE_ATTACK0_ACTIVE_A_LOCAL;
        pivot = HEADBAND_SIDE_ATTACK0_ACTIVE_A_PIVOT_X;
        break;
      case HEADBAND_SIDE_ATTACK0_HIT_FRAME_B:
        local = HEADBAND_SIDE_ATTACK0_ACTIVE_B_LOCAL;
        pivot = HEADBAND_SIDE_ATTACK0_ACTIVE_B_PIVOT_X;
        break;
      default:
        return null;
    }
    return this.placeHeadbandPolygonForHost(
      local,
      pivot,
      host,
      host.y + host.h,
      this.sideLatchedFacing,
    );
  }

  private sideHitSetForFrame(): Set<CombatEnemy> | null {
    if (this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_SETUP) {
      return this.sideAttackLoop === 0 ? this.sideHitEnemiesIndex0 : null;
    }
    if (this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_A) {
      return this.sideHitEnemiesIndex2;
    }
    if (this.frameIndex_ === HEADBAND_SIDE_ATTACK0_HIT_FRAME_B) {
      return this.sideHitEnemiesIndex5;
    }
    return null;
  }

  private placeHeadbandPolygonForHost(
    local: number[],
    pivot: number,
    host: HeadbandCombatHost,
    feetWorldY: number,
    facing: number,
  ): Aabb {
    const bodyLeft = host.x + host.w * 0.5 - pivot;
    const bodyTop = feetWorldY - HEADBAND_ATTACK_BODY_SPRITE_H;
    return placePolygonAabb(local, pivot, bodyLeft, bodyTop, facing);
  }

  private frameTicks(): readonly number[] {
    switch (this.kind_) {
      case "up_attack":
        return HEADBAND_UP_ATTACK0_TICKS;
      case "side_attack":
        return HEADBAND_SIDE_ATTACK0_TICKS;
      default:
        return HEADBAND_CROUCH_ATTACK1_TICKS;
    }
  }

  private hitFrameIndex(): number {
    return this.kind_ === "up_attack"
      ? HEADBAND_UP_ATTACK0_HIT_FRAME
      : HEADBAND_CROUCH_ATTACK1_HIT_FRAME;
  }

  private attackFrameSeconds(host: HeadbandCombatHost, frameIndex: number): number {
    const scale = host.attackTimingScale();
    const hz = FIXED_STEP_HZ;
    if (this.kind_ === "crouch_kick") {
      if (frameIndex < 0 || frameIndex >= HEADBAND_CROUCH_ATTACK1_TICKS.length) return 0;
      const authored = HEADBAND_CROUCH_ATTACK1_TICKS[frameIndex]!;
      let statFrames = 1;
      let ref = 1;
      switch (frameIndex) {
        case 0:
          statFrames = this.crouchAttackWindupFrames(host);
          ref = HEADBAND_CROUCH_WINDUP_REF;
          break;
        case 1:
          statFrames = host.stats.attackActiveFrames;
          ref = HEADBAND_ATTACK_ACTIVE_REF;
          break;
        case 2:
          statFrames = this.crouchAttackRecoverEarlyFrames(host);
          ref = HEADBAND_CROUCH_RECOVER_EARLY_REF;
          break;
        case 3:
          statFrames = this.crouchAttackRecoverLateFrames(host);
          ref = HEADBAND_CROUCH_RECOVER_LATE_REF;
          break;
      }
      return ((authored * statFrames) / ref) * scale / hz;
    }
    if (frameIndex < 0 || frameIndex >= HEADBAND_UP_ATTACK0_TICKS.length) return 0;
    const authoredUp = HEADBAND_UP_ATTACK0_TICKS[frameIndex]!;
    let statFramesUp = 1;
    let refUp = 1;
    switch (frameIndex) {
      case 0:
      case 1:
        statFramesUp = host.stats.attackWindupFrames;
        refUp = HEADBAND_STAND_WINDUP_REF;
        break;
      case 2:
        statFramesUp = host.stats.attackActiveFrames;
        refUp = HEADBAND_ATTACK_ACTIVE_REF;
        break;
      case 3:
      case 4:
        statFramesUp = host.stats.attackRecoverEarlyFrames;
        refUp = HEADBAND_STAND_RECOVER_EARLY_REF;
        break;
      case 5:
      case 6:
        statFramesUp = host.stats.attackRecoverLateFrames;
        refUp = HEADBAND_STAND_RECOVER_LATE_REF;
        break;
    }
    return ((authoredUp * statFramesUp) / refUp) * scale / hz;
  }

  private sideAttackFrameSeconds(host: HeadbandCombatHost, frameIndex: number): number {
    const scale = host.attackTimingScale();
    const hz = FIXED_STEP_HZ;
    if (this.sideAttackLoop === HEADBAND_SIDE_ATTACK_END_LOOP) {
      if (frameIndex === 0) {
        return (host.stats.attackRecoverEarlyFrames * scale) / hz;
      }
      if (frameIndex === 1) {
        return (host.stats.attackRecoverLateFrames * scale) / hz;
      }
    }
    return (host.stats.attackActiveFrames * scale) / hz;
  }

  private crouchAttackWindupFrames(host: HeadbandCombatHost): number {
    return Math.max(1, host.stats.attackWindupFrames + CROUCH_ATTACK_WINDUP_FRAMES_DELTA);
  }

  private crouchAttackRecoverEarlyFrames(host: HeadbandCombatHost): number {
    return Math.max(
      1,
      host.stats.attackRecoverEarlyFrames + CROUCH_ATTACK_RECOVER_EARLY_FRAMES_DELTA,
    );
  }

  private crouchAttackRecoverLateFrames(host: HeadbandCombatHost): number {
    return Math.max(
      1,
      host.stats.attackRecoverLateFrames + CROUCH_ATTACK_RECOVER_LATE_FRAMES_DELTA,
    );
  }

  private headbandOwned(host: HeadbandCombatHost): boolean {
    return host.inventory.stacksOf("HEADBAND") > 0;
  }

  private scaleOutgoingHitstun(host: HeadbandCombatHost, frames: number): number {
    if (host.inventory.stacksOf("HEADBAND") <= 0) return frames;
    return Math.ceil(frames * HEADBAND_HITSTUN_MULT);
  }
}
