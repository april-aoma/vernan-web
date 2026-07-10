import {
  freezeFrames,
  type Aabb,
  type WeaponStrike,
} from "../combat/CombatMath";
import type { SwordProfile } from "../combat/SwordProfile";
import type { SwordVisual } from "../combat/SwordVisual";
import { Health } from "../combat/Health";
import {
  ATTACK_BUFFER,
  ATTACK_LANDING_LOCK_FRAMES,
  CONTACT_DAMAGE_IFRAMES,
  CROUCH_ATTACK_DAMAGE_MULT,
  CROUCH_ATTACK_RECOVER_EARLY_FRAMES_DELTA,
  CROUCH_ATTACK_RECOVER_LATE_FRAMES_DELTA,
  CROUCH_ATTACK_WINDUP_FRAMES_DELTA,
} from "../config/CombatStats";
import {
  AIR_STEER_FRAC,
  CLIMB_ANIM_FPS,
  EXTENDED_FALL_DELAY,
  GETUP_LOCK_FRAMES,
  HURT_AIR_ANIM_FPS,
  HURT_AIR_SHEET_FRAMES,
  JUMP_ASCENT_VY_THRESHOLD_FRAC,
  LADDER_JUMP_NEUTRAL_FRAC,
  LADDER_JUMP_SIDE_FRAC,
  LADDER_MOUTH_DOUBLE_TAP_FRAMES,
  LADDER_MOUTH_LATCH_MIN_OVERLAP_PX,
  LANDING_LOCK_MAX,
  VERNAN_CLIMB_FRAMES,
  WALK_ANIM_FPS_AT_MAX,
  WALK_OFF_AIR_CAP_FRAC,
  WALK_OFF_LANDING_LOCK_FRAMES,
  WALK_SPEED_THRESHOLD,
} from "../config/AnimStats";
import { HitboxPose } from "../collision/HitboxPose";
import * as JumpFoot from "../collision/JumpFootProbe";
import * as StandSurfaceQuery from "../collision/StandSurfaceQuery";
import { clipVelocityDelta, clipWorldDelta } from "../combat/KnockbackCollision";
import {
  PLAYER_JUMP_HITBOX_H,
  PLAYER_JUMP_LEAD_FOOT_LOCAL_X,
  PLAYER_JUMP_LOCAL,
  PLAYER_JUMP_PIVOT_X,
  PLAYER_JUMP_STAND_HITBOX_H,
  PLAYER_JUMP_TRAIL_FOOT_LOCAL_X,
  PLAYER_HURT_LOCAL,
  PLAYER_HURT_PIVOT_X,
  PLAYER_PIVOT_LOCAL_X,
  PLAYER_STAND_HITBOX_H,
  PLAYER_STAND_LOCAL,
  HURT_DI_COLLISION_PROBE_PX,
  HURT_DI_MAX_FRAC,
  HURT_KNOCKBACK_X,
  HURT_KNOCKBACK_Y,
} from "../config/HitboxValues";
import { FIXED_STEP_HZ, TILE_SIZE } from "../specs";
import {
  COYOTE_TIME,
  GRAVITY,
  GRAVITY_RELEASE_MULT,
  HIGH_SPEED_JUMP_VEL_MULT,
  JUMP_BUFFER,
  MAX_FALL,
  PLATFORM_DECK_SLACK_PX,
  PLAYER_CROUCH_H,
  PLAYER_STAND_H,
  PLAYER_W,
  SHY_MASK_CHARGE_RELEASE_RECOVER_FRAMES,
  SHY_MASK_SUPER_JUMP_STRETCH_Y,
  SHY_MASK_SUPER_JUMP_VEL,
  TILE_SEPARATION_ITERATIONS,
  FLINT_SPARK_BASE_CHANCE,
  FLINT_SPARK_LUCK_MULT,
  GEM_SWORD_HITSTUN_MULT,
  ARCING_ENEMY_BULLET_PLAYER_DAMAGE,
} from "../config/Physics";
import type { ItemCatalog } from "../item/ItemCatalog";
import { PlayerItemInventory } from "../item/PlayerItemInventory";
import { AutismCombat } from "../item/effect/AutismCombat";
import { ItemEffects } from "../item/effect/ItemEffects";
import type { ItemPickupHost } from "../item/effect/ItemPickupHost";
import {
  contactBetweenHurtAndEnemy,
  FuzzyHatContactEffect,
} from "../item/effect/FuzzyHatContactEffect";
import { KaleidoscopeEyeCombat } from "../item/effect/kaleidoscope/KaleidoscopeEyeCombat";
import { LeotardCombat } from "../item/effect/LeotardCombat";
import { ShieldBreakerCombat } from "../item/effect/ShieldBreakerCombat";
import { ShyMaskChargeState } from "../item/effect/shymask/ShyMaskChargeState";
import type { Input } from "../input/Input";
import { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { HeadbandCombat } from "./HeadbandCombat";
import type { LemonShotHost } from "./LemonShotHost";
import { swordKnockbackKind, swordMeleeHitboxPose, shieldAttackWindupHitboxPose, shieldBlockHitboxPose } from "./WeaponHitbox";
import { FrisbeeAimSnapshot } from "./FrisbeeAimSnapshot";
import { PlayerStats } from "./PlayerStats";
import type { SubweaponHost } from "./SubweaponHost";
import { SquashStretch } from "../render/SquashStretch";
import {
  DEFAULT_SHAKE_AMPLITUDE_PX,
  HURT_TINT_PEAK_ALPHA,
  HURT_TINT_SECONDS,
  sampleShake,
} from "../combat/HitlagState";

/**
 * Vernan: walk / crouch / jumpsquat jump / climb / sword attack.
 * Hitbox anchor (x,y) is top-left of the collision AABB (Java Player).
 */
export class Player {
  x = 0;
  y = 0;
  w = PLAYER_W;
  h = PLAYER_STAND_H;
  vx = 0;
  vy = 0;
  onGround = false;
  climbing = false;
  facing = 1; // 1 right, -1 left
  readonly health = new Health(6);
  readonly inventory = new PlayerItemInventory();
  readonly stats = new PlayerStats();
  readonly squash = new SquashStretch();
  private readonly shyMaskCharge = new ShyMaskChargeState();
  /** Per-tick pedestal one-way deck rects (Java tickPedestalOneWayPlatforms). */
  private tickPedestalPlatforms: Aabb[] | null = null;
  private tickStandSegments: StandSurfaceQuery.Segment[] = [];
  /** Pedestal deck contact this tick / previous tick (Java ramp touchdown). */
  private tickPedestalGroundContact = false;
  private prevPedestalGroundContact = false;
  /** Down held this tick (for shy-mask charge squash draw). */
  private duckHeld = false;

  /** 0 idle, 1 windup, 2 active, 3 recover. */
  attackPhase = 0;
  attackTimer = 0;
  attackHitLanded = false;
  attackStartedOnGround = false;
  /** Latched at swing begin: crouch / air-down sword variant (Java groundCrouchAttack). */
  groundCrouchAttack = false;
  landingLockFrames = 0;
  hitlagFrames = 0;
  /** True when crouch height is active (for art). */
  crouching = false;

  /** Subweapon throw anim (Java subweaponAnimPhase / frame ticks). */
  private subweaponAnimPhase = 0;
  private subweaponFrameIndex = 0;
  private subweaponFrameTimeLeft = 0;
  private subweaponSpawnFired = false;
  private subweaponStartedOnGround = true;
  private readonly frisbeeAimSnapshot = new FrisbeeAimSnapshot();
  private static readonly SUBWEAPON_SPECIAL_FRAME_TICKS = [6, 6, 4, 10, 10];
  private static readonly SUBWEAPON_SPAWN_OFF_X = 3;
  private static readonly SUBWEAPON_SPAWN_OFF_Y = 5;
  private static readonly LEMON_SPAWN_OFF_Y_CROUCH = -7;
  private static readonly LEMON_SPAWN_OFF_Y_STAND = -7;

  readonly headband = new HeadbandCombat();
  swordVisual: SwordVisual = "default";
  private swordDamageMult = 1;
  private swordTimingScale = 1;
  gemSwordStacks = 0;
  shieldStacks = 0;
  attackStickFrameW = 48;
  private flintIgniteCallback: ((enemy: CombatEnemy) => void) | null = null;
  private gemSwordHitCallback: ((enemy: CombatEnemy) => void) | null = null;
  lemonPoseSecondsRemaining = 0;
  private lemonRefireCooldown = 0;

  /** Jump started from crouch — keep crouch hull in air (Java crouchJumpMode). */
  crouchJumpMode = false;
  /**
   * True from standing/ladder {@code NORMAL} jump lift-off until ground contact.
   * Gates {@link HitboxValues} PLAYER_JUMP hull (not walk-off / hurt / crouch-jump).
   */
  normalJumpAirborne = false;
  /** Walked off a ledge (not jumped); freezes walk art + weak air steer. */
  walkOffLedgeActive = false;
  /** Climb shaft column (-1 none). */
  climbShaftTx = -1;
  /** Megaman getup pose lock (mouth mount / ladder top). */
  private getupLockFrames = 0;
  private getupKind: "none" | "ladder_mount" | "ladder_top" = "none";
  private getupLandX = 0;
  private getupLandY = 0;
  private getupMouthCol = -1;
  private getupMouthDeckTy = -1;
  private getupMouthRungTy = -1;
  private getupLatchDown = false;
  private getupLatchUp = false;
  /** Draw getup one more frame after LADDER_TOP finishes (Java getupRenderHold). */
  private getupRenderHold = false;
  /** Frames left to accept second Down for mouth mount. */
  private ladderMouthDownTapFrames = 0;
  /** Knockback + control lock until land (Java hurtLocked). */
  hurtLocked = false;
  /**
   * Defensive hitstun seconds after taking damage, before knockback
   * (Java defensiveHitstunTimeRemaining). Separate from offensive {@link #hitlagFrames}.
   */
  private defensiveHitstunRemaining = 0;
  /** Horizontal knockaway sign latched for {@link #startHurtReaction} after hitstun. */
  private pendingHurtKnockSign = 0;
  /** Halve hurt knock when hit while crouching on ground (Java pendingHurtKnockbackHalved). */
  private pendingHurtKnockbackHalved = false;

  /** Defensive hitstun sprite shake (world px); resampled each freeze tick. */
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  /** Solid red SrcAtop while in defensive hitstun. */
  hitlagSolidRed = false;
  /** Fade hurt tint after knock starts (seconds remaining). */
  private hurtTintRemaining = 0;
  private wasCrouching = false;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private attackBufferTimer = 0;
  private jumpSquatRemaining = 0;
  private jumpSquatMaxAbsVx = 0;
  private jumpHeld = false;
  private wasOnGround = false;
  private crouchQueuedFromLanding = false;
  private walkAnimAccum = 0;
  private walkAnimFrame = 0;
  private walkOffFrozenFrame = 0;
  private climbAnimAccum = 0;
  private climbAnimFrame = 0;
  /** Seconds of fall since apex (vy >= 0); resets on ground / ascent (Java fallPhaseTimer). */
  private fallPhaseTimer = 0;
  /**
   * 60Hz ticks spent in extended fall (after {@link EXTENDED_FALL_DELAY}).
   * Drives variable landing lock: `(extendedFallFrames / 5) * 2` capped at {@link LANDING_LOCK_MAX}.
   */
  private extendedFallFrames = 0;
  /** True on the tick we set a landing lock — skip decrement that same tick (Java justLanded). */
  private justLanded = false;
  /** Set true on the physics tick Vernan touches ground from air; cleared by consumeLandedThisTick. */
  private landedThisTick = false;
  private hurtAirAnimAccum = 0;
  private hurtAirFrame = 0;

  /** Nephilim grab hold — movement/attack skipped while true. */
  private grabHeld = false;
  private grabAnimFrame = 0;
  private grabAnimAccum = 0;
  private static readonly GRAB_ANIM_FRAMES = 4;
  private static readonly GRAB_ANIM_SLOW_FPS = 3.5;
  private static readonly GRAB_ANIM_MASH_FPS = 13.0;

  spawnAt(worldX: number, groundTopWorldY: number): void {
    this.w = PLAYER_W;
    this.h = PLAYER_STAND_H;
    this.x = worldX;
    this.y = groundTopWorldY - PLAYER_STAND_H;
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.wasOnGround = true;
    this.climbing = false;
    this.climbShaftTx = -1;
    this.cancelGetup();
    this.ladderMouthDownTapFrames = 0;
    this.crouching = false;
    this.crouchJumpMode = false;
    this.normalJumpAirborne = false;
    this.walkOffLedgeActive = false;
    this.hurtLocked = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.attackBufferTimer = 0;
    this.jumpSquatRemaining = 0;
    this.jumpSquatMaxAbsVx = 0;
    this.cancelAttack();
    this.landingLockFrames = 0;
    this.hitlagFrames = 0;
    this.crouchQueuedFromLanding = false;
    this.walkAnimAccum = 0;
    this.walkAnimFrame = 0;
    this.walkOffFrozenFrame = 0;
    this.climbAnimAccum = 0;
    this.climbAnimFrame = 0;
    this.fallPhaseTimer = 0;
    this.extendedFallFrames = 0;
    this.justLanded = false;
    this.hurtAirAnimAccum = 0;
    this.hurtAirFrame = 0;
    this.defensiveHitstunRemaining = 0;
    this.pendingHurtKnockSign = 0;
    this.squash.reset();
    this.shyMaskCharge.reset();
    this.duckHeld = false;
    this.hitlagShakeX = 0;
    this.hitlagShakeY = 0;
    this.hitlagSolidRed = false;
    this.hurtTintRemaining = 0;
    this.wasCrouching = false;
    this.pendingHurtKnockbackHalved = false;
  }

  /**
   * Place Vernan at an absolute world position (ladder room entries).
   * When {@code airborne}, leaves {@code onGround=false} like Java FROM_ABOVE/FROM_BELOW.
   */
  spawnAtWorld(worldX: number, worldY: number, airborne: boolean): void {
    this.spawnAt(worldX, worldY + PLAYER_STAND_H);
    this.x = worldX;
    this.y = worldY;
    if (airborne) {
      this.onGround = false;
      this.wasOnGround = false;
      this.climbing = true;
      this.climbShaftTx = Math.floor((worldX + this.w * 0.5) / TILE_SIZE);
    }
  }

  left(): number {
    return this.x;
  }
  right(): number {
    return this.x + this.w;
  }
  top(): number {
    return this.y;
  }
  /** Collision hull bottom (jump hull is shorter than {@link #h}). */
  bottom(): number {
    return this.y + this.collisionH();
  }

  /**
   * Active solid collision height. Stand/crouch use {@link #h}; normal jump uses PLAYER_JUMP AABB (13).
   * Sprite feet stay at {@code y + h} while jumping (Java renderSpriteFeetWorldY).
   */
  collisionH(): number {
    return this.usesJumpCollisionHull() ? PLAYER_JUMP_HITBOX_H : this.h;
  }

  /** Java usesJumpCollisionHull — normal jump only. */
  usesJumpCollisionHull(): boolean {
    return this.normalJumpAirborne && !this.climbing && !this.crouchJumpMode;
  }

  isInDefensiveHitstun(): boolean {
    return this.defensiveHitstunRemaining > 0;
  }

  /** Fade hurt tint alpha 0–255 for draw (Java HURT_TINT). */
  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SECONDS));
  }

  shyMaskFlashRgb(): number {
    if (this.shyMaskChargeSuppressed()) return 0;
    return this.shyMaskCharge.flashRgb();
  }

  shyMaskFlashAlpha(): number {
    if (this.shyMaskChargeSuppressed()) return 0;
    return this.shyMaskCharge.flashAlpha();
  }

  /** Draw squash: prefer shy-mask charge crouch when active and no juice squash. */
  renderSquashScaleX(): number {
    if (
      this.stats.shyMaskStacks > 0 &&
      !this.shyMaskChargeSuppressed() &&
      this.shyMaskCharge.chargeSquashVisible(this.duckHeld) &&
      !this.squash.active()
    ) {
      return this.shyMaskCharge.chargeScaleX();
    }
    return this.squash.scaleX();
  }

  renderSquashScaleY(): number {
    if (
      this.stats.shyMaskStacks > 0 &&
      !this.shyMaskChargeSuppressed() &&
      this.shyMaskCharge.chargeSquashVisible(this.duckHeld) &&
      !this.squash.active()
    ) {
      return this.shyMaskCharge.chargeScaleY();
    }
    return this.squash.scaleY();
  }

  private shyMaskChargeSuppressed(): boolean {
    return this.hurtLocked || this.defensiveHitstunRemaining > 0;
  }

  private tickHurtTint(dt: number): void {
    if (this.hurtTintRemaining > 0) {
      this.hurtTintRemaining = Math.max(0, this.hurtTintRemaining - dt);
    }
  }

  /** Current world collision pose (PLAYER or PLAYER_JUMP). */
  hitboxPose(): HitboxPose {
    return this.collisionPoseAt(this.x, this.y);
  }

  collisionPoseAt(anchorX: number, anchorY: number): HitboxPose {
    if (this.usesJumpCollisionHull()) {
      return this.jumpCollisionPoseAt(anchorX, anchorY);
    }
    return new HitboxPose(
      PLAYER_STAND_LOCAL,
      anchorX,
      anchorY,
      this.facing,
      PLAYER_PIVOT_LOCAL_X,
      this.h / PLAYER_STAND_HITBOX_H,
    );
  }

  /** Air collision hull at anchor — same parts as {@link hitboxPose} while jump strip is active. */
  private jumpCollisionPoseAt(anchorX: number, anchorY: number): HitboxPose {
    return new HitboxPose(
      PLAYER_JUMP_LOCAL,
      anchorX,
      anchorY,
      this.facing,
      PLAYER_JUMP_PIVOT_X,
      this.h / PLAYER_JUMP_STAND_HITBOX_H,
    );
  }

  /** Floor probe Y: jump uses max(lead, trail) feet; stand uses AABB bottom. */
  private collisionFootWorldY(pose: HitboxPose = this.hitboxPose()): number {
    return JumpFoot.footProbeSupportY(JumpFoot.jumpFootProbeFrom(pose));
  }

  /** Camera horizontal follow: hitbox center X. */
  cameraAnchorX(): number {
    return this.x + this.w * 0.5;
  }

  /** Camera vertical follow: feet − standH/2 (Java cameraAnchorY). */
  cameraAnchorY(): number {
    return this.y + this.h - PLAYER_STAND_H * 0.5;
  }

  /**
   * While sim is frozen (timestop / zero substeps), still prime jump/attack buffers
   * from press edges so taps during a hitch aren't lost (Java primeLagInputBuffers).
   */
  primeLagInputBuffers(input: Input): void {
    if (input.jumpPressed) this.jumpBufferTimer = JUMP_BUFFER;
    if (input.attackPressed) this.attackBufferTimer = ATTACK_BUFFER;
  }

  update(
    dt: number,
    input: Input,
    map: TileMap,
    subweaponHost: SubweaponHost | null = null,
    pedestalPlatforms: Aabb[] | null = null,
    enemies: readonly CombatEnemy[] = [],
  ): void {
    this.tickPedestalPlatforms = pedestalPlatforms;
    this.health.update(dt);
    this.tickHurtTint(dt);
    this.squash.tick(dt);

    // Buffer jump / attack even during hitlag so presses aren't eaten.
    if (input.jumpPressed) this.jumpBufferTimer = JUMP_BUFFER;
    if (input.attackPressed) this.attackBufferTimer = ATTACK_BUFFER;

    // Offensive hitlag (sword land): freeze player; still allow contact to queue defensive stun.
    // No shake/red on offensive hitlag (Java HitlagState).
    if (this.hitlagFrames > 0) {
      this.hitlagFrames--;
      return;
    }

    this.prevPedestalGroundContact = this.tickPedestalGroundContact;
    this.wasOnGround = this.onGround;
    this.justLanded = false;
    this.landedThisTick = false;

    // Hurt knockback lock: gravity + collide only until land (Java hurtLocked early return).
    if (this.hurtLocked) {
      this.hitlagSolidRed = false;
      this.hitlagShakeX = 0;
      this.hitlagShakeY = 0;
      this.updateHurtLocked(dt, map);
      this.tickHurtAirAnim(dt);
      return;
    }

    // Defensive hitstun: freeze in place + shake/red, then knockback+DI when timer ends.
    if (this.defensiveHitstunRemaining > 0) {
      this.hitlagSolidRed = true;
      this.hitlagShakeX = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
      this.hitlagShakeY = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
      const prev = this.defensiveHitstunRemaining;
      this.defensiveHitstunRemaining = Math.max(0, this.defensiveHitstunRemaining - dt);
      if (prev > 0 && this.defensiveHitstunRemaining <= 0 && this.pendingHurtKnockSign !== 0) {
        const sign = this.pendingHurtKnockSign;
        this.pendingHurtKnockSign = 0;
        this.hitlagSolidRed = false;
        this.hitlagShakeX = 0;
        this.hitlagShakeY = 0;
        this.startHurtReaction(sign, input, map);
      }
      this.tickHurtAirAnim(dt);
      return;
    }
    this.hitlagSolidRed = false;
    this.hitlagShakeX = 0;
    this.hitlagShakeY = 0;

    // Getup pose: freeze movement; count down then finish mount/dismount.
    if (this.getupLockFrames > 0) {
      this.vx = 0;
      this.vy = 0;
      this.climbing = false;
      this.getupLockFrames--;
      if (this.getupLockFrames === 0) {
        this.finishGetup(map);
      }
      this.tickAnim(dt);
      return;
    }
    if (this.getupRenderHold) {
      this.getupRenderHold = false;
    }

    if (this.tickEnemyGrab(dt, input, enemies, map)) {
      this.tickAnim(dt);
      return;
    }

    const landingLocked = this.landingLockFrames > 0;
    const downRaw = input.down && !input.up;
    if (landingLocked && this.onGround && downRaw) this.crouchQueuedFromLanding = true;
    if (!landingLocked && !downRaw) this.crouchQueuedFromLanding = false;
    // Suppress Down during landing lock; apply queued crouch once lock ends.
    let crouchHeld =
      (!landingLocked && downRaw) ||
      (!landingLocked && this.crouchQueuedFromLanding && this.onGround);

    // Mouth double-tap Down → mount getup (before crouch height).
    this.tickMouthDoubleTapMount(input, map, landingLocked);

    // Single Down on a mouth deck crouches; getup owns the drop (don't fall through).
    // One-ways stay solid while crouching — only mouth+walk-off uses dropsThroughOneWayPlatformTile (Java).
    this.jumpHeld = input.jump;
    this.duckHeld = downRaw;

    this.updateAttack(dt, input);
    this.headband.tryBeginFromInput(input, this.headbandHost());
    this.headband.update(dt, input, this.headbandHost());
    this.updateLemonShot(dt, input, subweaponHost);
    this.updateSubweaponAnim(dt, input, subweaponHost);

    // Ladder jump-off before movement (Java): immediate exit, no jumpsquat.
    this.tryLadderJumpOff(input);

    // SHY_MASK charge (Java shyMaskCharge.tick before jump).
    const shyMaskCanCharge =
      this.stats.shyMaskStacks > 0 &&
      this.attackPhase === 0 &&
      !this.isSubweaponAnimating() &&
      !this.climbing &&
      this.getupLockFrames === 0 &&
      !this.shyMaskChargeSuppressed();
    this.shyMaskCharge.tick(
      this.stats.shyMaskStacks > 0,
      this.onGround,
      downRaw,
      shyMaskCanCharge,
    );
    if (this.stats.shyMaskStacks > 0) {
      const recoverX = this.shyMaskCharge.consumeSquashRecoverScaleX();
      if (recoverX > 1 + 1e-9) {
        this.squash.applyStretchX(recoverX, SHY_MASK_CHARGE_RELEASE_RECOVER_FRAMES);
      }
    }

    if (this.climbing) {
      this.cancelAttack();
      this.cancelSubweaponAnim();
      this.updateClimbMove(dt, input, map);
    } else {
      this.applyHorizontalIntent(dt, input, crouchHeld, landingLocked);
      this.applyJumpLogic(dt, crouchHeld);
      this.applyGravity(dt);
    }

    this.moveAndCollide(dt, map);
    // Latch/clear uses post-collide pose (Java).
    this.updateClimbLatch(input, map);
    this.afterGroundTimers(dt);

    if (
      !this.wasOnGround &&
      this.onGround &&
      !this.crouchJumpMode &&
      !this.climbing &&
      !(
        this.prevPedestalGroundContact &&
        this.extendedFallFrames === 0 &&
        !this.normalJumpAirborne &&
        this.jumpSquatRemaining === 0
      ) &&
      this.normalJumpAirborne
    ) {
      this.finishJumpLandingCollision(map);
    }

    this.cancelAttackOnLeaveGround();
    this.detectWalkOff();
    this.finishJumpSquat(map, dt);
    this.tickExtendedFall(dt);
    this.applyLandingFromTouchdown();
    if (this.justLanded) {
      const recover = Math.max(1, this.landingLockFrames || SquashStretch.DEFAULT_RECOVER_FRAMES);
      this.squash.applyStretchX(1.2, recover);
    }
    if (!this.climbing) {
      // Input-driven crouch before height resolve (Java: crouching = onGround && down).
      if (this.normalJumpAirborne && !this.crouchJumpMode) {
        this.crouching = false;
      } else {
        this.crouching = this.onGround && crouchHeld;
      }
      this.applyCrouchHeight(crouchHeld, map);
      if (this.crouchJumpMode && !this.onGround) {
        this.crouching = true;
      }
    } else {
      this.crouching = false;
    }
    if (this.crouching && !this.wasCrouching) {
      this.squash.applyStretchX(1.1, 4);
    }
    this.wasCrouching = this.crouching;
    this.tickLandingLock();
    this.tickAnim(dt);
    this.tickHurtAirAnim(dt);
  }

  /** Gravity + collide while hurt-locked; unlock on land. */
  private updateHurtLocked(dt: number, map: TileMap): void {
    this.cancelAttack();
    this.jumpSquatRemaining = 0;
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;
    this.moveAndCollide(dt, map);
    // Java: depenetrate every hurt-lock tick when already embedded (vx often 0 after wall hit).
    if (this.overlapsSolid(map, this.collisionPoseAt(this.x, this.y))) {
      this.nudgeCollisionPoseOutOfSolids(map);
    }
    if (!this.wasOnGround && this.onGround) {
      if (this.normalJumpAirborne && !this.crouchJumpMode && !this.climbing) {
        this.finishJumpLandingCollision(map);
      }
      this.normalJumpAirborne = false;
      this.hurtLocked = false;
      this.hurtAirAnimAccum = 0;
      this.hurtAirFrame = 0;
    }
  }

  /**
   * Small horizontal/vertical depenetration when already inside solids
   * (Java nudgeCollisionPoseOutOfSolids). Horizontal first (±2/±4), else y -= 1.
   */
  private nudgeCollisionPoseOutOfSolids(map: TileMap): void {
    for (let i = 0; i < 24 && this.overlapsSolid(map, this.collisionPoseAt(this.x, this.y)); i++) {
      let moved = false;
      for (const dx of [-2, 2, -4, 4]) {
        const clipped = clipWorldDelta(
          map,
          (ax, ay) => this.collisionPoseAt(ax, ay),
          this.x,
          this.y,
          dx,
          0,
          HURT_DI_COLLISION_PROBE_PX,
        );
        if (Math.abs(clipped.dx) > 0.5) {
          this.x += clipped.dx;
          moved = true;
          break;
        }
      }
      if (!moved) this.y -= 1;
    }
  }

  private standHullAt(anchorX: number, anchorY: number, hullH: number): HitboxPose {
    return new HitboxPose(
      PLAYER_STAND_LOCAL,
      anchorX,
      anchorY,
      this.facing,
      PLAYER_PIVOT_LOCAL_X,
      hullH / PLAYER_STAND_HITBOX_H,
    );
  }

  private standCollisionPoseAt(anchorX: number, anchorY: number): HitboxPose {
    return this.standHullAt(anchorX, anchorY, this.h);
  }

  /**
   * Stand hull for thin-deck / wall-lip probes while jump strip is active (Java poseForFeetSupport).
   * Airborne floor resolve still uses {@link #hitboxPose()} (PLAYER_JUMP).
   */
  private poseForFeetSupport(): HitboxPose {
    if (this.usesJumpCollisionHull()) {
      return this.standCollisionPoseAt(this.x, this.y);
    }
    return this.hitboxPose();
  }

  /** Mouth ladder drop-through only — not every one-way while walk-off (Java). */
  private dropsThroughOneWayPlatformTile(map: TileMap, tx: number, ty: number): boolean {
    return this.walkOffLedgeActive && ladderShaftInColumnFromRow(map, tx, ty + 1);
  }

  private tickHurtAirAnim(dt: number): void {
    if (this.hurtLocked && !this.onGround) {
      this.hurtAirAnimAccum += dt;
      const frameSec = 1 / HURT_AIR_ANIM_FPS;
      while (this.hurtAirAnimAccum >= frameSec && this.hurtAirFrame < HURT_AIR_SHEET_FRAMES - 1) {
        this.hurtAirAnimAccum -= frameSec;
        this.hurtAirFrame++;
      }
    } else if (!this.hurtLocked) {
      this.hurtAirAnimAccum = 0;
      this.hurtAirFrame = 0;
    }
  }

  /** World Y of sprite feet — always field {@code y+h} (not jump hull bottom). */
  spriteFeetWorldY(): number {
    return this.y + this.h;
  }

  /**
   * Draw-top Y for crouch-pose visuals (jumpsquat / landing lock / crouch-jump).
   * Collision {@link #h} stays stand height; art shortens with feet planted (Java renderY).
   */
  renderSpriteTopWorldY(): number {
    if (
      this.jumpSquatRemaining > 0 ||
      (this.landingLockFrames > 0 && this.onGround) ||
      (this.crouchJumpMode && !this.onGround)
    ) {
      return this.y + (this.h - PLAYER_CROUCH_H);
    }
    return this.y;
  }

  /**
   * Attack sheet frame: 0 windup, 1 active, 2 early recover, 3 late recover.
   */
  attackAnimFrameIndex(): number {
    if (this.attackPhase === 1) return 0;
    if (this.attackPhase === 2) return 1;
    if (this.attackPhase === 3) {
      const early = this.attackRecoverEarlyFramesThisSwing() / 60;
      const total = this.attackRecoverFramesThisSwing() / 60;
      return this.attackTimer > total - early ? 2 : 3;
    }
    return 0;
  }

  /** True when this swing uses crouch attack art / hitbox (Java isGroundCrouchAttack). */
  isGroundCrouchAttack(): boolean {
    return this.groundCrouchAttack;
  }

  /** Air / rising attack strip (Java: not ground-only swing, or airborne after jumpsquat X). */
  attackUsesAirStrip(): boolean {
    return this.isAttacking() && (!this.attackStartedOnGround || !this.onGround);
  }

  walkFrame(): number {
    return this.walkOffLedgeActive ? this.walkOffFrozenFrame : this.walkAnimFrame;
  }

  climbFrame(): number {
    return this.climbAnimFrame;
  }

  /** Hurt-air strip frame (0..5); advances while hurt-locked airborne. */
  hurtAirFrameIndex(): number {
    return this.hurtAirFrame;
  }

  isHurtLocked(): boolean {
    return this.hurtLocked;
  }

  /** Jump sheet: 0–1 ascent, 2 early fall, 3 extended fall (Java jumpAirSpriteIndex). */
  jumpFrame(): number {
    if (this.vy >= 0) {
      return this.fallPhaseTimer >= EXTENDED_FALL_DELAY ? 3 : 2;
    }
    const ascentThresh =
      -this.stats.jumpVel * HIGH_SPEED_JUMP_VEL_MULT * JUMP_ASCENT_VY_THRESHOLD_FRAC;
    return this.vy < ascentThresh ? 0 : 1;
  }

  isJumpSquatting(): boolean {
    return this.jumpSquatRemaining > 0;
  }

  isLandingLocked(): boolean {
    return this.landingLockFrames > 0;
  }

  /** True while mount/dismount getup pose is active (or one-frame render hold). */
  isGetupLocked(): boolean {
    return this.getupLockFrames > 0 || this.getupRenderHold;
  }

  /** Getup sheet frame 0..n-1 from remaining lock (Java draw path). */
  getupAnimFrameIndex(frameCount: number): number {
    if (frameCount <= 1) return 0;
    if (this.getupRenderHold) return frameCount - 1;
    const elapsed = GETUP_LOCK_FRAMES - this.getupLockFrames;
    return Math.max(0, Math.min(frameCount - 1, elapsed));
  }

  isAttacking(): boolean {
    return this.attackPhase !== 0 || this.headband.isActive();
  }

  isLemonPoseActive(): boolean {
    return this.lemonPoseSecondsRemaining > 0;
  }

  usesLemonBuster(): boolean {
    return this.swordVisual === "lemon";
  }

  applySwordProfile(profile: SwordProfile, gemStacks: number, shieldStacks = 0): void {
    this.swordVisual = profile.visual;
    this.swordDamageMult = profile.damageMult;
    this.swordTimingScale = profile.timingScale;
    this.gemSwordStacks = Math.max(0, gemStacks);
    this.shieldStacks = Math.max(0, shieldStacks);
  }

  /** Which shield player.png frame applies for passive block (Java shieldOverlaySheetIndex subset). */
  shieldBlockFrameIndex(): 0 | 1 | -1 {
    if (this.shieldStacks <= 0) return -1;
    if (this.attackPhase !== 0 || this.headband.isActive()) return -1;
    if (this.crouching || this.isCrouchJumpMode() || this.isJumpSquatting() || this.isLandingLocked()) {
      return 1;
    }
    return 0;
  }

  /** shield player.png frame for draw (-1 = hidden). Includes climb frames 2–3. */
  shieldOverlayFrameIndex(climbAnimMod2 = 0): number {
    if (this.shieldStacks <= 0) return -1;
    if (this.attackPhase !== 0 || this.headband.isActive()) return -1;
    if (this.climbing) return 2 + (climbAnimMod2 & 1);
    if (
      this.crouching ||
      this.isCrouchJumpMode() ||
      this.isJumpSquatting() ||
      this.isLandingLocked()
    ) {
      return 1;
    }
    return 0;
  }

  hasShieldEquipped(): boolean {
    return this.shieldStacks > 0;
  }

  /** Shield arm windup hull during attack phase 1 (Java attackShieldWindupPose). */
  attackShieldWindupHitbox(): Aabb | null {
    const pose = this.attackShieldWindupHitboxPose();
    return pose ? pose.bounds() : null;
  }

  attackShieldWindupHitboxPose(): HitboxPose | null {
    if (this.shieldStacks <= 0 || this.attackPhase !== 1) return null;
    if (this.headband.isActive()) return null;
    return shieldAttackWindupHitboxPose({
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h,
      facing: this.facing,
      groundCrouchAttack: this.groundCrouchAttack,
    });
  }

  /** Passive shield block hull when not attacking (Java shieldBlockHitboxPose). */
  shieldBlockHitbox(): Aabb | null {
    const pose = this.shieldBlockHitboxPose();
    return pose ? pose.bounds() : null;
  }

  shieldBlockHitboxPose(): HitboxPose | null {
    const idx = this.shieldBlockFrameIndex();
    if (idx < 0) return null;
    return shieldBlockHitboxPose({
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h,
      facing: this.facing,
      frameIndex: idx as 0 | 1,
    });
  }

  swordVisualId(): SwordVisual {
    return this.swordVisual;
  }

  attackTimingScale(): number {
    return this.swordTimingScale;
  }

  outgoingDamageMultiplier(): number {
    return this.swordDamageMult + this.stats.damageMultiplierBonus;
  }

  effectiveOutgoingDamage(base: number): number {
    return base * this.outgoingDamageMultiplier();
  }

  setFlintIgniteCallback(cb: ((enemy: CombatEnemy) => void) | null): void {
    this.flintIgniteCallback = cb;
  }

  setGemSwordHitCallback(cb: ((enemy: CombatEnemy) => void) | null): void {
    this.gemSwordHitCallback = cb;
  }

  get offensiveHitlagRemaining(): number {
    return this.hitlagFrames / 60;
  }

  private headbandHost(): import("./HeadbandCombat").HeadbandCombatHost {
    return {
      onGround: this.onGround,
      crouching: this.crouching,
      facing: this.facing,
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h,
      landingLockFrames: this.landingLockFrames,
      getupLockFrames: this.getupLockFrames,
      climbing: this.climbing,
      attackPhase: this.attackPhase,
      stats: this.stats,
      attackTimingScale: () => this.attackTimingScale(),
      isSubweaponAnimating: () => this.isSubweaponAnimating(),
      swordVisual: this.swordVisual,
      inventory: this.inventory,
      offensiveHitlagRemaining: this.offensiveHitlagRemaining,
    };
  }

  private applySwordHitItemProcs(enemy: CombatEnemy): void {
    if (this.flintIgniteCallback) {
      const sparkChance = Math.min(
        1,
        Math.max(0, FLINT_SPARK_BASE_CHANCE + this.stats.luck * FLINT_SPARK_LUCK_MULT),
      );
      if (Math.random() < sparkChance) {
        this.flintIgniteCallback(enemy);
      }
    }
    this.gemSwordHitCallback?.(enemy);
  }

  private scaleOutgoingHitstun(frames: number): number {
    let f = frames;
    if (this.gemSwordStacks > 0) {
      f = Math.ceil(f * GEM_SWORD_HITSTUN_MULT);
    }
    return f;
  }

  isWalkOffLedgeActive(): boolean {
    return this.walkOffLedgeActive;
  }

  isCrouchJumpMode(): boolean {
    return this.crouchJumpMode;
  }

  /** Ground reverse-skid pose (Java turn detection). */
  isTurningPose(): boolean {
    if (!this.onGround || this.crouching || this.attackPhase !== 0) return false;
    if (Math.abs(this.vx) <= 1 || Math.abs(this.vx) > WALK_SPEED_THRESHOLD) return false;
    return this.vx * this.facing < 0;
  }

  /** Sword / headband active AABB, or null when not swinging. */
  attackHitbox(): Aabb | null {
    const pose = this.attackHitboxPose();
    return pose ? pose.bounds() : null;
  }

  /** Sword / headband active polygon pose, or null when not swinging. */
  attackHitboxPose(): HitboxPose | null {
    const hb = this.headband.attackHitboxPose(this.headbandHost());
    if (hb) return hb;
    if (this.attackPhase !== 2 || this.usesLemonBuster()) return null;
    return swordMeleeHitboxPose({
      visual: this.swordVisual,
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h,
      facing: this.facing,
      groundCrouchAttack: this.groundCrouchAttack,
      stickFrameW: this.attackStickFrameW,
    });
  }

  /**
   * Incoming damage / enemy overlap (PLAYER_HURT).
   * Tiles and most world overlap use {@link #hitboxPose()}.
   */
  hurtboxPose(): HitboxPose {
    return new HitboxPose(
      PLAYER_HURT_LOCAL,
      this.x,
      this.y,
      this.facing,
      PLAYER_HURT_PIVOT_X,
      this.h / PLAYER_STAND_HITBOX_H,
    );
  }

  hurtbox(): Aabb {
    return this.hurtboxPose().bounds();
  }

  isGrabHeld(): boolean {
    return this.grabHeld;
  }

  /**
   * Nephilim drink sip — half-heart steal (can kill). Defensive hitstun, no i-frames.
   */
  applyGrabDrinkSteal(halfHearts: number, freezeFrameCount: number): boolean {
    if (this.health.isDead || halfHearts <= 0) return false;
    if (!this.health.tryDamageIgnoringInvuln(halfHearts)) return false;
    this.beginDefensiveHitstun(freezeFrameCount, 0);
    return true;
  }

  /**
   * Nephilim grab-box: latch on reach, clamp through grab_0, punish on release.
   * @returns true when Vernan is held this tick (movement/attack skipped).
   */
  tickEnemyGrab(
    dt: number,
    input: Input,
    enemies: readonly CombatEnemy[],
    map: TileMap,
  ): boolean {
    this.grabHeld = false;
    if (this.health.isDead) {
      this.resetGrabAnim();
      return false;
    }
    if (this.hurtLocked) {
      this.resetGrabAnim();
      return false;
    }
    const vernanHurt = this.hurtboxPose();
    if (!this.hurtLocked) {
      for (const e of enemies) {
        e.tryGrabLatch?.(vernanHurt);
      }
    }
    for (const e of enemies) {
      if (!e.isGrabHoldingPlayer?.()) continue;
      const box = e.grabHoldBoxPose?.();
      if (!box) continue;
      this.applyGrabBoxHold(box, map);
      if (this.overlapsSolid(map, this.collisionPoseAt(this.x, this.y))) {
        e.flipGrabHoldFacing?.();
        const turnedBox = e.grabHoldBoxPose?.();
        if (turnedBox) {
          this.resolveGrabHoldPosition(turnedBox, map);
        }
      }
      e.applyGrabDrinkStealIfDue?.(this);
      this.tickGrabStruggleAnim(dt, input);
      return true;
    }
    this.resetGrabAnim();
    for (const e of enemies) {
      if (e.consumeGrabReleasePunish?.()) {
        this.applyGrabReleasePunish(e, map);
      }
    }
    return false;
  }

  private tickGrabStruggleAnim(dt: number, input: Input): void {
    const fps = anyStrugglePressed(input) ? Player.GRAB_ANIM_MASH_FPS : Player.GRAB_ANIM_SLOW_FPS;
    this.grabAnimAccum += dt;
    const frameSec = 1 / fps;
    while (this.grabAnimAccum >= frameSec) {
      this.grabAnimAccum -= frameSec;
      this.grabAnimFrame = (this.grabAnimFrame + 1) % Player.GRAB_ANIM_FRAMES;
    }
  }

  private resetGrabAnim(): void {
    this.grabAnimAccum = 0;
    this.grabAnimFrame = 0;
  }

  private applyGrabBoxHold(box: HitboxPose, map: TileMap): void {
    void map;
    this.grabHeld = true;
    this.vx = 0;
    this.vy = 0;
    this.climbing = false;
    this.crouching = false;
    this.jumpSquatRemaining = 0;
    this.cancelAttack();
    this.cancelSubweaponAnim();
    const b = box.bounds();
    const hurt = this.hurtbox();
    const halfW = hurt.w * 0.5;
    const halfH = hurt.h * 0.5;
    const cx = hurt.x + halfW;
    const cy = hurt.y + halfH;
    const minCx = b.x + halfW;
    const maxCx = b.x + b.w - halfW;
    const minCy = b.y + halfH;
    const maxCy = b.y + b.h - halfH;
    const targetCx =
      minCx > maxCx ? b.x + b.w * 0.5 : Math.max(minCx, Math.min(maxCx, cx));
    const targetCy =
      minCy > maxCy ? b.y + b.h * 0.5 : Math.max(minCy, Math.min(maxCy, cy));
    this.x += targetCx - cx;
    this.y += targetCy - cy;
    this.onGround = true;
  }

  /** Keep hurt center inside the grab hull, then slide off adjacent walls when corner-pinned. */
  private resolveGrabHoldPosition(box: HitboxPose, map: TileMap): void {
    const xy = this.anchorClampedInsideGrabBox(box, this.x, this.y);
    this.x = xy[0];
    this.y = xy[1];
    if (!this.overlapsSolid(map, this.collisionPoseAt(this.x, this.y))) return;
    for (const dx of [2, -2, 4, -4, 6, -6, 8, -8, 10, -10]) {
      const clipped = clipWorldDelta(map, this.collisionPoseAt.bind(this), this.x, this.y, dx, 0);
      if (Math.abs(clipped.dx) < 0.5) continue;
      const next = this.anchorClampedInsideGrabBox(box, this.x + clipped.dx, this.y);
      if (!this.overlapsSolid(map, this.collisionPoseAt(next[0], next[1]))) {
        this.x = next[0];
        this.y = next[1];
        return;
      }
    }
    this.nudgeCollisionPoseOutOfSolids(map);
  }

  private anchorClampedInsideGrabBox(box: HitboxPose, anchorX: number, anchorY: number): [number, number] {
    const b = box.bounds();
    const hurt = this.hurtBoundsAt(anchorX, anchorY);
    const halfW = hurt.w * 0.5;
    const halfH = hurt.h * 0.5;
    const cx = hurt.x + halfW;
    const cy = hurt.y + halfH;
    const minCx = b.x + halfW;
    const maxCx = b.x + b.w - halfW;
    const minCy = b.y + halfH;
    const maxCy = b.y + b.h - halfH;
    const targetCx = minCx > maxCx ? b.x + b.w * 0.5 : Math.max(minCx, Math.min(maxCx, cx));
    const targetCy = minCy > maxCy ? b.y + b.h * 0.5 : Math.max(minCy, Math.min(maxCy, cy));
    return [anchorX + targetCx - cx, anchorY + targetCy - cy];
  }

  private hurtBoundsAt(anchorX: number, anchorY: number): Aabb {
    return new HitboxPose(
      PLAYER_HURT_LOCAL,
      anchorX,
      anchorY,
      this.facing,
      PLAYER_HURT_PIVOT_X,
      this.h / PLAYER_STAND_HITBOX_H,
    ).bounds();
  }

  private applyGrabReleasePunish(e: CombatEnemy, map: TileMap): void {
    void map;
    if (this.health.isDead) return;
    const dmg = e.grabReleaseDamageToPlayer?.() ?? e.contactDamageToPlayer();
    if (!this.health.tryDamage(dmg, CONTACT_DAMAGE_IFRAMES)) return;
    const er = e.rect();
    const ecx = er.x + er.w * 0.5;
    const px = this.x + this.w * 0.5;
    const away = px < ecx ? -1 : 1;
    this.beginDefensiveHitstun(freezeFrames(dmg), away);
  }

  /**
   * Arcing enemy projectile overlap (Java Player.hitArcingEnemyBullet).
   * Stick active frame reflects; hurtbox overlap damages Vernan.
   */
  hitArcingEnemyBullet(
    bulletPose: HitboxPose,
    bulletCenterX: number,
  ): "miss" | "player_hit" | "stick_reflect" | "shield_destroy" {
    if (
      this.health.isDead ||
      this.health.isInvulnerable ||
      this.isHurtLocked() ||
      this.isInDefensiveHitstun()
    ) {
      return "miss";
    }
    if (this.shieldStacks > 0) {
      if (this.isAttacking()) {
        const windup = this.attackShieldWindupHitboxPose();
        if (windup?.intersects(bulletPose)) {
          return "shield_destroy";
        }
      } else {
        const blockIdx = this.shieldBlockFrameIndex();
        if (blockIdx >= 0) {
          const shieldPose = this.shieldBlockHitboxPose();
          if (shieldPose?.intersects(bulletPose)) {
            return "shield_destroy";
          }
        }
      }
    }
    if (this.swordVisual === "stick") {
      const stick = this.attackHitboxPose();
      if (stick?.intersects(bulletPose)) {
        return "stick_reflect";
      }
    }
    if (!bulletPose.intersects(this.hurtboxPose())) return "miss";
    const scaled = ARCING_ENEMY_BULLET_PLAYER_DAMAGE * KaleidoscopeEyeCombat.playerDamageMultiplier();
    if (!this.health.tryDamage(scaled, CONTACT_DAMAGE_IFRAMES)) return "miss";
    KaleidoscopeEyeCombat.notifyPlayerDamageApplied();
    LeotardCombat.notifyPlayerDamageApplied(scaled);
    let away = this.x + this.w * 0.5 >= bulletCenterX ? 1 : -1;
    if (Math.abs(this.x + this.w * 0.5 - bulletCenterX) < 1e-4) away = -this.facing;
    this.beginDefensiveHitstun(Math.max(1, Math.ceil(freezeFrames(scaled) * 0.85)), away);
    return "player_hit";
  }

  /** Grant item, apply passives, sync HP cap, ItemEffects.onPickup, red heal. */
  collectItem(id: string, catalog: ItemCatalog, host: ItemPickupHost): void {
    this.inventory.add(id, 1);
    const def = catalog.def(id);
    if (def.subweapon) {
      this.inventory.setEquippedSubweapon(id);
      if (this.inventory.hasBackpack()) {
        this.inventory.registerBackpackSubweapon(id);
      }
    }
    this.stats.applyItemPassives(this.inventory, catalog);
    // Java syncHealthCapFromItems: raise/lower red cap without auto-heal.
    this.health.max = this.stats.maxHealth;
    ItemEffects.onPickup(id, host, catalog);
    if (def.redHeartsHealOnPickup > 0) {
      this.health.heal(def.redHeartsHealOnPickup);
    }
    // Re-apply after onPickup (mystery gift roll, skirt traction, etc.).
    this.stats.applyItemPassives(this.inventory, catalog);
    this.health.max = this.stats.maxHealth;
  }

  /** True if Vernan touched ground from air this tick (Java consumeLandedThisTick). */
  consumeLandedThisTick(): boolean {
    const v = this.landedThisTick;
    this.landedThisTick = false;
    return v;
  }

  /**
   * Sword vs enemies: hit every overlapping foe on first contact (Java applyAttackHits).
   * Does not latch {@link #attackHitLanded} — mount latches after breakables so both can connect same frame.
   * @returns max freeze frames from hits, or 0 if none / already latched.
   * When {@code onHit} is provided, it is called for each successful strike (HitVfx spawn).
   */
  applyAttackHits(
    enemies: CombatEnemy[],
    onHit?: (
      enemy: CombatEnemy,
      strike: WeaponStrike,
      sword: Aabb,
      vfx: "slash" | "shield_break" | "shield_block",
    ) => void,
  ): number {
    if (this.headband.isActive()) {
      return this.headband.applyHits(this.headbandHost(), enemies, onHit);
    }
    const sword = this.attackHitbox();
    if (!sword || this.attackHitLanded || this.usesLemonBuster()) return 0;
    const baseDmg = this.stats.outgoingDamage();
    const dmg =
      this.effectiveOutgoingDamage(baseDmg) *
      (this.groundCrouchAttack ? CROUCH_ATTACK_DAMAGE_MULT : 1);
    const knockKind = swordKnockbackKind(this.swordVisual, this.groundCrouchAttack);
    let any = false;
    let maxFreeze = 0;
    for (const e of enemies) {
      if (e.isDead()) continue;
      if (e.attackBlockedByShield(sword)) {
        const er = e.rect();
        const contact = contactBetweenHurtAndEnemy(sword, er);
        const pen = ShieldBreakerCombat.tryMeleeShieldPenetration(
          e,
          sword,
          dmg,
          this.x,
          this.w,
          this.facing,
          knockKind,
          contact,
        );
        if (pen >= 0) {
          any = true;
          const ff = this.scaleOutgoingHitstun(pen);
          maxFreeze = Math.max(maxFreeze, ff);
          const strike: WeaponStrike = {
            damage: ShieldBreakerCombat.scaleShieldContactDamage(dmg),
            freezeFrames: ff,
            attackerX: this.x,
            attackerW: this.w,
            facing: this.facing,
            knockKind,
            contactWorldX: contact.x,
            contactWorldY: contact.y,
          };
          AutismCombat.notifyPlayerDamageDealt(e, strike.damage);
          KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, strike.damage);
          this.applySwordHitItemProcs(e);
          onHit?.(e, strike, sword, "shield_break");
        } else {
          const ff = this.scaleOutgoingHitstun(freezeFrames(dmg));
          const strike: WeaponStrike = {
            damage: 0,
            freezeFrames: ff,
            attackerX: this.x,
            attackerW: this.w,
            facing: this.facing,
            knockKind,
            contactWorldX: contact.x,
            contactWorldY: contact.y,
          };
          e.applyShieldBlockStrike(strike);
          any = true;
          maxFreeze = Math.max(maxFreeze, ff);
          onHit?.(e, strike, sword, "shield_block");
        }
        continue;
      }
      if (!e.intersectsAttack(sword)) continue;
      const ff = this.scaleOutgoingHitstun(freezeFrames(dmg));
      const strike: WeaponStrike = {
        damage: dmg,
        freezeFrames: ff,
        attackerX: this.x,
        attackerW: this.w,
        facing: this.facing,
        knockKind,
      };
      const hit = e.applyWeaponStrike(strike);
      if (hit) {
        any = true;
        maxFreeze = Math.max(maxFreeze, ff);
        AutismCombat.notifyPlayerDamageDealt(e, dmg);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, dmg);
        this.applySwordHitItemProcs(e);
        onHit?.(e, strike, sword, "slash");
      }
    }
    if (any) this.hitlagFrames = Math.max(this.hitlagFrames, maxFreeze);
    return maxFreeze;
  }

  /** Latch sword swing after enemy + breakable pass (Java attackHitLanded). */
  latchAttackHit(freezeFrames: number): void {
    this.attackHitLanded = true;
    this.hitlagFrames = Math.max(this.hitlagFrames, freezeFrames);
  }

  applyEnemyContacts(
    enemies: CombatEnemy[],
    onElectrocution?: (
      enemy: CombatEnemy,
      strike: WeaponStrike,
      contact: { x: number; y: number },
    ) => void,
  ): void {
    if (this.health.isDead || this.health.isInvulnerable) return;
    if (this.hurtLocked) return;
    if (this.defensiveHitstunRemaining > 0) return;
    const hurt = this.hurtbox();
    const fuzzyStacks = this.inventory.stacksOf("FUZZY_HAT");
    for (const e of enemies) {
      if (!e.hurtsPlayer(hurt)) continue;
      if (fuzzyStacks > 0) {
        const contact = contactBetweenHurtAndEnemy(hurt, e.rect());
        const strike = FuzzyHatContactEffect.applyBodyContactElectrocution(
          fuzzyStacks,
          e,
          this,
          contact,
        );
        if (strike) {
          AutismCombat.notifyPlayerDamageDealt(e, strike.damage);
          KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, strike.damage);
          onElectrocution?.(e, strike, contact);
        }
      }
      const dmg =
        e.contactDamageToPlayer() * KaleidoscopeEyeCombat.playerDamageMultiplier();
      if (!this.health.tryDamage(dmg, CONTACT_DAMAGE_IFRAMES)) return;
      KaleidoscopeEyeCombat.notifyPlayerDamageApplied();
      LeotardCombat.notifyPlayerDamageApplied(dmg);
      const away =
        this.x + this.w * 0.5 >= e.rect().x + e.rect().w * 0.5 ? 1 : -1;
      this.beginDefensiveHitstun(freezeFrames(dmg), away);
      return;
    }
  }

  /**
   * Freeze in place after damage; knockback+DI start when the timer ends
   * (Java beginDefensiveHitstun → startHurtReaction).
   */
  beginDefensiveHitstun(freezeFrameCount: number, hurtKnockHorizontalSign: number): void {
    const sec = freezeFrameCount / FIXED_STEP_HZ;
    this.defensiveHitstunRemaining = Math.max(this.defensiveHitstunRemaining, sec);
    this.pendingHurtKnockSign = hurtKnockHorizontalSign;
    this.pendingHurtKnockbackHalved = this.onGround && this.crouching;
    this.cancelAttack();
    this.jumpSquatRemaining = 0;
  }

  /**
   * Knockback + control lock until land (Java startHurtReaction) with clip + one-shot DI.
   */
  startHurtReaction(horizontalSign: number, input?: Input, map?: TileMap): void {
    this.defensiveHitstunRemaining = 0;
    this.pendingHurtKnockSign = 0;

    this.hurtLocked = true;
    this.cancelAttack();
    this.cancelGetup();
    this.jumpSquatRemaining = 0;
    this.landingLockFrames = 0;
    this.justLanded = false;
    this.crouchQueuedFromLanding = false;
    this.crouching = false;
    this.climbing = false;
    this.climbShaftTx = -1;
    this.walkOffLedgeActive = false;
    this.crouchJumpMode = false;
    this.normalJumpAirborne = false;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    this.hitlagSolidRed = false;
    this.hitlagShakeX = 0;
    this.hitlagShakeY = 0;

    const kbScale = this.pendingHurtKnockbackHalved ? 0.5 : 1;
    this.pendingHurtKnockbackHalved = false;
    let kbX = Math.sign(horizontalSign || 1) * HURT_KNOCKBACK_X * kbScale;
    let kbY = HURT_KNOCKBACK_Y * kbScale;

    if (map) {
      const clipped = clipVelocityDelta(
        map,
        (ax, ay) => this.collisionPoseAt(ax, ay),
        this.x,
        this.y,
        kbX,
        kbY,
        HURT_DI_COLLISION_PROBE_PX,
      );
      kbX = clipped.vx;
      kbY = clipped.vy;
      this.vx = kbX;
      this.vy = kbY;
      if (input) this.applyKnockbackDirectionalInfluence(input, map, kbX, kbY);
    } else {
      this.vx = kbX;
      this.vy = kbY;
    }
    this.onGround = false;
    this.hurtAirAnimAccum = 0;
    this.hurtAirFrame = 0;
  }

  /** Smash-style one-shot DI on knockback frame 1 (Java applyKnockbackDirectionalInfluence). */
  private applyKnockbackDirectionalInfluence(
    input: Input,
    map: TileMap,
    kbX: number,
    kbY: number,
  ): void {
    const di = directionalInfluence(input);
    if (!di) return;
    const mag = Math.hypot(kbX, kbY);
    if (mag < 1e-6) return;
    const maxDelta = mag * HURT_DI_MAX_FRAC;
    const clipped = clipVelocityDelta(
      map,
      (ax, ay) => this.collisionPoseAt(ax, ay),
      this.x,
      this.y,
      di.dx * maxDelta,
      di.dy * maxDelta,
      HURT_DI_COLLISION_PROBE_PX,
    );
    this.vx += clipped.vx;
    this.vy += clipped.vy;
  }

  cancelAttack(): void {
    this.attackPhase = 0;
    this.attackTimer = 0;
    this.attackHitLanded = false;
    this.attackStartedOnGround = false;
    this.groundCrouchAttack = false;
  }

  private cancelSubweaponAnim(): void {
    this.subweaponAnimPhase = 0;
    this.subweaponFrameIndex = 0;
    this.subweaponFrameTimeLeft = 0;
    this.subweaponSpawnFired = false;
    this.frisbeeAimSnapshot.reset();
  }

  /** Clears subweapon wind-up (e.g. room change). */
  resetSubweaponAnim(): void {
    this.cancelSubweaponAnim();
  }

  isSubweaponAnimating(): boolean {
    return this.subweaponAnimPhase !== 0;
  }

  /** Special-attack strip frame while throwing (Java subweaponAnimFrameIndex). */
  subweaponAnimFrameIndex(): number {
    if (!this.isSubweaponAnimating()) return 0;
    const ticks = Player.SUBWEAPON_SPECIAL_FRAME_TICKS;
    return Math.min(this.subweaponFrameIndex, ticks.length - 1);
  }

  /** Air throw uses air special strip (Java subweaponUsesAirSpecialStrip). */
  subweaponUsesAirSpecialStrip(): boolean {
    return this.isSubweaponAnimating() && !this.subweaponStartedOnGround;
  }

  private updateSubweaponAnim(dt: number, input: Input, host: SubweaponHost | null): void {
    if (!host) return;
    const eq = host.equippedSubweapon();
    if (eq !== "FRISBEE" && eq !== "PSYCHIC_SPOON") {
      this.cancelSubweaponAnim();
      return;
    }
    const frameTicks = Player.SUBWEAPON_SPECIAL_FRAME_TICKS;
    if (this.subweaponAnimPhase === 0) {
      if (
        input.subweaponPressed &&
        host.subweaponCooldownReady() &&
        !this.isAttacking() &&
        !this.climbing &&
        this.landingLockFrames === 0 &&
        this.getupLockFrames === 0
      ) {
        this.subweaponAnimPhase = 1;
        this.subweaponFrameIndex = 0;
        this.subweaponFrameTimeLeft = frameTicks[0]! / FIXED_STEP_HZ;
        this.subweaponSpawnFired = false;
        this.subweaponStartedOnGround = this.onGround;
        if (eq === "FRISBEE") this.frisbeeAimSnapshot.reset();
      }
      return;
    }
    if (eq === "FRISBEE" && this.subweaponFrameIndex <= 1) {
      this.frisbeeAimSnapshot.sampleTapWindup(input);
    }
    this.subweaponFrameTimeLeft -= dt;
    if (this.subweaponFrameTimeLeft > 0) return;
    if (this.subweaponFrameIndex === 1 && !this.subweaponSpawnFired) {
      if (eq === "FRISBEE") {
        const sx = this.x + this.w * 0.5 + this.facing * Player.SUBWEAPON_SPAWN_OFF_X;
        const sy = this.y + Player.SUBWEAPON_SPAWN_OFF_Y;
        this.frisbeeAimSnapshot.finalizeHoldAtSpawn(input);
        host.spawnFrisbee(sx, sy, this.facing, this.frisbeeAimSnapshot);
      } else if (eq === "PSYCHIC_SPOON") {
        host.activatePsychicSpoon();
      }
      host.onSubweaponFired();
      this.subweaponSpawnFired = true;
    }
    this.subweaponFrameIndex++;
    if (this.subweaponFrameIndex >= frameTicks.length) {
      this.cancelSubweaponAnim();
      return;
    }
    this.subweaponFrameTimeLeft = frameTicks[this.subweaponFrameIndex]! / FIXED_STEP_HZ;
  }

  private attackWindupFramesThisSwing(): number {
    const base = this.stats.attackWindupFrames;
    const frames = this.groundCrouchAttack
      ? base + CROUCH_ATTACK_WINDUP_FRAMES_DELTA
      : base;
    return Math.max(1, Math.round(frames * this.swordTimingScale));
  }

  private attackRecoverEarlyFramesThisSwing(): number {
    const base = this.stats.attackRecoverEarlyFrames;
    const frames = this.groundCrouchAttack
      ? base + CROUCH_ATTACK_RECOVER_EARLY_FRAMES_DELTA
      : base;
    return Math.max(1, Math.round(frames * this.swordTimingScale));
  }

  private attackRecoverLateFramesThisSwing(): number {
    const base = this.stats.attackRecoverLateFrames;
    const frames = this.groundCrouchAttack
      ? base + CROUCH_ATTACK_RECOVER_LATE_FRAMES_DELTA
      : base;
    return Math.max(1, Math.round(frames * this.swordTimingScale));
  }

  private attackRecoverFramesThisSwing(): number {
    return this.attackRecoverEarlyFramesThisSwing() + this.attackRecoverLateFramesThisSwing();
  }

  private tryBeginAttackFromBuffer(downHeld: boolean): void {
    if (this.attackPhase !== 0) return;
    if (this.headband.isActive()) return;
    if (this.isSubweaponAnimating()) return;
    if (this.usesLemonBuster()) return;
    if (this.swordVisual === "fists") return;
    if (this.attackBufferTimer <= 0) return;
    if (this.landingLockFrames > 0 || this.climbing) return;
    this.attackBufferTimer = 0;
    this.attackPhase = 1;
    this.attackHitLanded = false;
    this.attackStartedOnGround = this.onGround;
    this.groundCrouchAttack =
      (this.onGround && this.crouching) ||
      (!this.onGround && !this.crouchJumpMode && downHeld);
    this.attackTimer = this.attackWindupFramesThisSwing() / 60;
  }

  private updateLemonShot(dt: number, input: Input, host: LemonShotHost | null): void {
    this.lemonPoseSecondsRemaining = Math.max(0, this.lemonPoseSecondsRemaining - dt);
    this.lemonRefireCooldown = Math.max(0, this.lemonRefireCooldown - dt);
    if (!this.usesLemonBuster() || !host?.hasLemonShooter()) return;
    if (this.hurtLocked || this.landingLockFrames > 0 || this.getupLockFrames > 0) return;
    if (this.isSubweaponAnimating() || this.climbing) return;
    const attackEdge = input.attackPressed;
    const attackHeld = input.attack;
    if (attackHeld || attackEdge) {
      this.lemonPoseSecondsRemaining = Math.max(
        this.lemonPoseSecondsRemaining,
        host.lemonShotRefireSeconds(),
      );
    }
    if (!attackEdge && !attackHeld) return;
    const eligible =
      this.onGround ||
      this.isWalkOffLedgeActive() ||
      this.usesJumpCollisionHull() ||
      this.crouching ||
      this.isCrouchJumpMode() ||
      this.isLandingLocked();
    if (!eligible) return;
    if (host.lemonShotsOnScreen() >= 3) return;
    const fireNow = attackEdge || (attackHeld && this.lemonRefireCooldown <= 0);
    if (!fireNow) return;
    const crouchMuzzle =
      this.isJumpSquatting() ||
      this.crouching ||
      this.isCrouchJumpMode() ||
      this.isLandingLocked() ||
      this.isGroundCrouchAttack();
    const sx =
      this.x + this.w * 0.5 + this.facing * Player.SUBWEAPON_SPAWN_OFF_X - 4;
    let sy = this.y + (crouchMuzzle ? Player.LEMON_SPAWN_OFF_Y_CROUCH : Player.LEMON_SPAWN_OFF_Y_STAND);
    sy = Math.min(sy, this.y + this.h - 6);
    host.spawnLemonShot(sx, sy, this.facing, host.lemonShotDamage());
    this.lemonRefireCooldown = host.lemonShotRefireSeconds();
  }

  private updateAttack(dt: number, input: Input): void {
    this.attackBufferTimer = Math.max(0, this.attackBufferTimer - dt);
    const downHeld = input.down && !input.up;
    if (this.attackPhase === 0) {
      this.tryBeginAttackFromBuffer(downHeld);
      return;
    }
    this.attackTimer -= dt;
    if (this.attackTimer > 0) return;
    if (this.attackPhase === 1) {
      this.attackPhase = 2;
      this.attackTimer = this.stats.attackActiveFrames / 60;
    } else if (this.attackPhase === 2) {
      this.attackPhase = 3;
      this.attackTimer = this.attackRecoverFramesThisSwing() / 60;
    } else {
      this.cancelAttack();
      // Chain immediately if X was buffered during recover.
      this.tryBeginAttackFromBuffer(downHeld);
    }
  }

  private tickAnim(dt: number): void {
    if (this.climbing) {
      this.walkAnimAccum = 0;
      this.walkAnimFrame = 0;
      if (Math.abs(this.vy) > 2) {
        this.climbAnimAccum += dt;
        const frameSec = 1 / CLIMB_ANIM_FPS;
        while (this.climbAnimAccum >= frameSec) {
          this.climbAnimAccum -= frameSec;
          this.climbAnimFrame = (this.climbAnimFrame + 1) % VERNAN_CLIMB_FRAMES;
        }
      } else {
        this.climbAnimAccum = 0;
      }
      return;
    }
    this.climbAnimAccum = 0;
    this.climbAnimFrame = 0;

    if (this.walkOffLedgeActive) return;

    const speed = Math.abs(this.vx);
    const walking =
      this.onGround &&
      !this.crouching &&
      this.attackPhase === 0 &&
      !this.isSubweaponAnimating() &&
      speed > WALK_SPEED_THRESHOLD;
    if (!walking) {
      this.walkAnimAccum = 0;
      this.walkAnimFrame = 0;
      return;
    }
    const t = Math.min(1, speed / Math.max(1e-6, this.stats.maxGroundSpeed));
    this.walkAnimAccum += dt;
    const frameSeconds = 1 / WALK_ANIM_FPS_AT_MAX / Math.max(0.05, t);
    while (this.walkAnimAccum >= frameSeconds) {
      this.walkAnimAccum -= frameSeconds;
      this.walkAnimFrame = (this.walkAnimFrame + 1) % 4;
    }
  }

  private tickLandingLock(): void {
    // Don't consume the land pose on the same tick we land (Java !justLanded).
    if (
      this.landingLockFrames > 0 &&
      this.onGround &&
      this.jumpSquatRemaining === 0 &&
      !this.justLanded
    ) {
      this.landingLockFrames--;
    }
  }

  private detectWalkOff(): void {
    if (
      this.wasOnGround &&
      !this.onGround &&
      this.jumpSquatRemaining === 0 &&
      this.vy >= 0
    ) {
      this.walkOffLedgeActive = true;
      this.walkOffFrozenFrame = this.walkAnimFrame;
    }
  }

  /** Ground-started sword cancels when leaving the ground (Java). */
  private cancelAttackOnLeaveGround(): void {
    if (this.attackPhase === 0) return;
    if (this.wasOnGround && !this.onGround && this.attackStartedOnGround) {
      this.cancelAttack();
    }
  }

  /**
   * Accumulate extended-fall 60Hz ticks after apex + delay (Java Player block ~3557).
   * Formula uses these for landing lock: `(extendedFallFrames / 5) * 2`.
   */
  private tickExtendedFall(dt: number): void {
    if (this.climbing) {
      this.extendedFallFrames = 0;
      this.fallPhaseTimer = 0;
      return;
    }
    if (this.onGround || this.vy < 0) {
      this.fallPhaseTimer = 0;
      return;
    }
    this.fallPhaseTimer += dt;
    if (this.fallPhaseTimer >= EXTENDED_FALL_DELAY) {
      this.extendedFallFrames++;
    }
  }

  /**
   * On touchdown: variable landing lock from extended-fall airtime, or fixed attack land lock.
   * Java: `landingLockFrames = (extendedFallFrames / 5) * 2` (+ walk-off floor 5, cap 20).
   */
  private applyLandingFromTouchdown(): void {
    if (this.wasOnGround || !this.onGround) return;

    this.landedThisTick = true;
    this.crouchJumpMode = false;

    const pedestalRampTouchdown =
      (this.prevPedestalGroundContact || this.tickPedestalGroundContact) &&
      this.extendedFallFrames === 0 &&
      !this.normalJumpAirborne &&
      this.jumpSquatRemaining === 0;
    if (pedestalRampTouchdown) {
      this.normalJumpAirborne = false;
      this.walkOffLedgeActive = false;
      this.extendedFallFrames = 0;
      this.fallPhaseTimer = 0;
      return;
    }

    this.normalJumpAirborne = false;

    // Any in-progress swing landing from air cancels with fixed lock (Java ATTACK_LANDING_LOCK_FRAMES).
    // Includes true air swings and jumpsquat X rising attacks (ground-latched but airborne).
    if (this.attackPhase !== 0) {
      this.cancelAttack();
      this.landingLockFrames = ATTACK_LANDING_LOCK_FRAMES;
      this.extendedFallFrames = 0;
      this.fallPhaseTimer = 0;
      this.justLanded = true;
      this.walkOffLedgeActive = false;
      this.climbing = false;
      this.climbShaftTx = -1;
      return;
    }

    // Air frisbee throw cancels on landing (Java).
    if (this.isSubweaponAnimating() && !this.subweaponStartedOnGround) {
      this.cancelSubweaponAnim();
    }

    let lock = Math.floor(this.extendedFallFrames / 5) * 2;
    if (this.walkOffLedgeActive) {
      lock = Math.max(lock, WALK_OFF_LANDING_LOCK_FRAMES);
    }
    lock = Math.min(lock, LANDING_LOCK_MAX);
    this.landingLockFrames = lock;
    this.extendedFallFrames = 0;
    this.fallPhaseTimer = 0;
    this.justLanded = lock > 0;
    this.walkOffLedgeActive = false;
    // Don't clear climbing here — climb latch may re-grab on same tick; floor land already
    // cleared climb in resolveVertical when solid foot contact ends climb.
  }

  /**
   * After landing with jump collision active: align stand feet to jump feet, then
   * resolve stand overlap (Java finishJumpLandingCollision).
   * Must test the stand hull explicitly — hitboxPose() is still the jump strip this tick.
   */
  private finishJumpLandingCollision(map: TileMap): void {
    const jumpPose = this.jumpCollisionPoseAt(this.x, this.y);
    const bottomJump = this.jumpHullStandAlignFootY(jumpPose, map);
    const standPose = this.standCollisionPoseAt(this.x, this.y);
    const bottomStand = standPose.bounds().y + standPose.bounds().h;
    this.y += bottomJump - bottomStand;
    if (this.overlapsSolid(map, this.standCollisionPoseAt(this.x, this.y))) {
      const yCrouch = this.y + (PLAYER_STAND_H - PLAYER_CROUCH_H);
      if (!this.overlapsSolid(map, this.standHullAt(this.x, yCrouch, PLAYER_CROUCH_H))) {
        this.y = yCrouch;
        this.h = PLAYER_CROUCH_H;
        this.crouching = true;
        return;
      }
    }
    this.pushStandHullOutOfSolids(map);
  }

  /** Stand-feet align Y after jump strip: supported foot on deck, not the dangling vertex (Java). */
  private jumpHullStandAlignFootY(jumpPose: HitboxPose, map: TileMap): number {
    const leadY = JumpFoot.jumpLeadFootWorldY(jumpPose);
    const trailY = JumpFoot.jumpTrailFootWorldY(jumpPose);
    const leadX = JumpFoot.jumpFootLocalWorldX(jumpPose, PLAYER_JUMP_LEAD_FOOT_LOCAL_X);
    const trailX = JumpFoot.jumpFootLocalWorldX(jumpPose, PLAYER_JUMP_TRAIL_FOOT_LOCAL_X);
    const leadDeck = this.jumpFootOverSupportedDeck(map, leadX, leadY);
    const trailDeck = this.jumpFootOverSupportedDeck(map, trailX, trailY);
    if (leadDeck && trailDeck) return Math.max(leadY, trailY);
    if (leadDeck) return leadY;
    if (trailDeck) return trailY;
    return Math.max(leadY, trailY);
  }

  private jumpFootOverSupportedDeck(map: TileMap, footX: number, footY: number): boolean {
    const tx = Math.floor(footX / TILE_SIZE);
    const tyCenter = Math.floor((footY - 1e-3) / TILE_SIZE);
    for (let dty = -1; dty <= 1; dty++) {
      const ty = tyCenter + dty;
      if (ty < 0 || ty >= map.height) continue;
      const deckTop = ty * TILE_SIZE;
      if (!StandSurfaceQuery.footNearDeck(footY, deckTop) || !JumpFoot.footXOverTile(footX, tx)) {
        continue;
      }
      if (map.isSolidTile(tx, ty)) return true;
      if (map.isPlatformTile(tx, ty) && !this.dropsThroughOneWayPlatformTile(map, tx, ty)) {
        return true;
      }
    }
    return false;
  }

  /** Move y up until stand hull clears solids (capped at 1 tile). Java pushStandHullOutOfSolids. */
  private pushStandHullOutOfSolids(map: TileMap): void {
    const startY = this.y;
    for (let i = 0; i < 64 && this.overlapsSolid(map, this.standCollisionPoseAt(this.x, this.y)); i++) {
      if (startY - this.y >= TILE_SIZE) break;
      this.y -= 1;
    }
  }

  private afterGroundTimers(dt: number): void {
    if (this.onGround) this.coyoteTimer = COYOTE_TIME;
    else if (this.jumpSquatRemaining === 0) {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
  }

  private applyCrouchHeight(crouchHeld: boolean, map: TileMap): void {
    if (this.climbing) return;
    let targetH = PLAYER_STAND_H;
    if (this.jumpSquatRemaining > 0) {
      targetH = this.crouchJumpMode ? PLAYER_CROUCH_H : PLAYER_STAND_H;
    } else if (this.crouchJumpMode && !this.onGround) {
      targetH = PLAYER_CROUCH_H;
    } else if (crouchHeld && this.onGround) {
      targetH = PLAYER_CROUCH_H;
    }
    this.applyHitboxHeight(targetH, map);
    // Jumpsquat at STAND_H no-ops applyHitboxHeight; force crouch under a 1-tile ceiling (Java).
    if (
      this.jumpSquatRemaining > 0 &&
      this.onGround &&
      this.h >= PLAYER_STAND_H - 1e-6 &&
      this.overlapsSolid(map, this.standHullAt(this.x, this.y, PLAYER_STAND_H))
    ) {
      this.applyHitboxHeight(PLAYER_CROUCH_H, map);
      this.crouching = true;
    }
  }

  /** Feet-anchored height change; reverts grow into solids (Java applyHitboxHeight). */
  private applyHitboxHeight(newH: number, map: TileMap): void {
    if (Math.abs(newH - this.h) < 1e-6) return;
    const oldH = this.h;
    this.h = newH;
    this.y += oldH - newH;
    if (newH > oldH && this.overlapsSolid(map)) {
      this.y -= oldH - newH;
      this.h = oldH;
      this.crouching = true;
    }
  }

  private applyHorizontalIntent(
    dt: number,
    input: Input,
    crouchHeld: boolean,
    landingLocked: boolean,
  ): void {
    const st = this.stats;
    const commitLock = this.attackPhase >= 2;
    const subweaponFacingLocked = this.isSubweaponAnimating() && this.subweaponFrameIndex > 0;
    const grounded = this.onGround || this.jumpSquatRemaining > 0;

    // Active/recover: lock facing; grounded brakes to stop, airborne freezes vx (Java moveLocked).
    if (commitLock) {
      if (grounded) {
        this.vx = approach(this.vx, 0, st.groundBrake * dt);
      }
      // Air: leave vx alone — momentum lock, not kill.
      return;
    }

    let dir = 0;
    if (!(crouchHeld && this.jumpSquatRemaining === 0 && this.onGround)) {
      if (input.left) dir -= 1;
      if (input.right) dir += 1;
    }
    if (dir !== 0 && !subweaponFacingLocked) this.facing = dir;

    if (grounded && crouchHeld && this.jumpSquatRemaining === 0) {
      this.vx = approach(this.vx, 0, st.groundBrake * dt);
      return;
    }

    if (grounded) {
      const cap = landingLocked ? st.maxAirSpeed : st.maxGroundSpeed;
      if (dir !== 0) {
        const target = dir * cap;
        const reversing = Math.sign(this.vx) !== 0 && Math.sign(this.vx) !== dir;
        const rate = reversing ? st.groundBrake : st.groundAccel;
        this.vx = approach(this.vx, target, rate * dt);
      } else {
        this.vx = approach(this.vx, 0, st.groundFriction * dt);
      }
      this.vx = Math.max(-cap, Math.min(cap, this.vx));
    } else {
      const cap = this.walkOffLedgeActive
        ? st.maxAirSpeed * WALK_OFF_AIR_CAP_FRAC
        : st.maxAirSpeed;
      this.applyAirHorizontal(dt, dir, cap);
    }
  }

  /** Weak air steer; preserve vx when neutral (Java applyAirHorizontal). */
  private applyAirHorizontal(dt: number, dir: number, maxSpeed: number): void {
    const st = this.stats;
    if (dir !== 0) {
      const target = dir * maxSpeed;
      const airAccel = st.airAccel * AIR_STEER_FRAC;
      const airBrake = st.airBrake * AIR_STEER_FRAC;
      const reversing = Math.sign(this.vx) !== 0 && Math.sign(this.vx) !== dir;
      this.vx = approach(this.vx, target, (reversing ? airBrake : airAccel) * dt);
    }
    this.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.vx));
  }

  private applyJumpLogic(_dt: number, crouchHeld: boolean): void {
    // Getup clears jumpsquat. Sword does not — X during squat starts a rising attack (Java).
    if (this.getupLockFrames > 0) {
      if (this.jumpSquatRemaining > 0) {
        this.jumpSquatRemaining = 0;
        this.shyMaskCharge.cancelSuperJumpWindup();
      }
      return;
    }

    if (this.jumpSquatRemaining > 0) {
      this.vy = 0;
      this.jumpSquatMaxAbsVx = Math.max(this.jumpSquatMaxAbsVx, Math.abs(this.vx));
      return;
    }

    // Block starting a new jumpsquat while swinging; existing wind-up already handled above.
    if (this.attackPhase !== 0) return;

    const canJump = this.onGround || this.coyoteTimer > 0;
    // Allow jump during landing lock (clears it) — Java's only landing-lock cancel.
    // Crouch jump: Down held while grounded still starts jumpsquat.
    // SHY_MASK: block jump while charging (not yet fully charged).
    if (
      this.jumpBufferTimer > 0 &&
      canJump &&
      !(
        this.stats.shyMaskStacks > 0 &&
        this.shyMaskCharge.blocksGroundJumpWhileDownHeld(this.onGround, crouchHeld)
      )
    ) {
      this.jumpSquatRemaining = this.stats.jumpSquatFrames;
      this.jumpSquatMaxAbsVx = Math.abs(this.vx);
      this.jumpBufferTimer = 0;
      this.vy = 0;
      this.shyMaskCharge.latchSuperJumpWindup();
      this.crouchJumpMode =
        this.onGround &&
        crouchHeld &&
        !(this.stats.shyMaskStacks > 0 && this.shyMaskCharge.charged());
      this.landingLockFrames = 0;
      this.crouchQueuedFromLanding = false;
      this.walkOffLedgeActive = false;
      this.climbing = false;
      this.climbShaftTx = -1;
    }
  }

  /** Ground/coyote support for jumpsquat lift-off (Java standsOnFullWavedashSupport, minus wavedash). */
  private standsOnJumpSupport(): boolean {
    return this.onGround || this.coyoteTimer > 0;
  }

  /**
   * Decrement jumpsquat after collide/walk-off, then apply impulse + first vertical step (Java ~3714).
   */
  private finishJumpSquat(map: TileMap, dt: number): void {
    if (this.jumpSquatRemaining <= 0) return;
    this.jumpSquatRemaining--;
    if (this.jumpSquatRemaining !== 0) return;
    if (!this.standsOnJumpSupport()) return;

    const shyMaskSuperJump = this.shyMaskCharge.consumeSuperJumpAtLiftOff();
    let vel = shyMaskSuperJump ? SHY_MASK_SUPER_JUMP_VEL : this.stats.jumpVel;
    this.jumpSquatMaxAbsVx = Math.max(this.jumpSquatMaxAbsVx, Math.abs(this.vx));
    const speedGate = Math.max(this.stats.maxGroundSpeed, this.stats.maxAirSpeed) * 0.99;
    if (!shyMaskSuperJump && this.jumpSquatMaxAbsVx >= speedGate) {
      vel *= HIGH_SPEED_JUMP_VEL_MULT;
    }
    this.vy = -vel;
    this.onGround = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.walkOffLedgeActive = false;

    if (this.crouchJumpMode) {
      this.applyHitboxHeight(PLAYER_CROUCH_H, map);
    }

    if (shyMaskSuperJump) {
      this.crouchJumpMode = false;
      this.normalJumpAirborne = true;
      this.squash.applyStretchY(
        SHY_MASK_SUPER_JUMP_STRETCH_Y,
        SquashStretch.DEFAULT_RECOVER_FRAMES,
      );
    } else {
      this.normalJumpAirborne = !this.crouchJumpMode;
      this.squash.applyStretchY(1.2, SquashStretch.DEFAULT_RECOVER_FRAMES);
    }

    this.vx = Math.max(
      -this.stats.maxAirSpeed,
      Math.min(this.stats.maxAirSpeed, this.vx),
    );

    const beforeImpulse = this.hitboxPose();
    const prevFeet = JumpFoot.jumpFootProbeFrom(beforeImpulse);
    const prevTop = beforeImpulse.bounds().y;
    this.y += this.vy * dt;
    this.onGround = false;
    this.resolveVertical(map, prevFeet, prevTop);
  }

  private applyGravity(dt: number): void {
    let g = GRAVITY;
    g *= this.stats.shyMaskGravityMult * this.stats.kaleidoscopeGravityMult;
    if (this.vy < 0 && !this.jumpHeld) {
      g *= GRAVITY_RELEASE_MULT;
    } else if (this.walkOffLedgeActive && this.vy >= 0) {
      // Walk-off: max gravity while falling so stepping down feels snappy (Java).
      g *= GRAVITY_RELEASE_MULT;
    }
    this.vy += g * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;
  }

  private tryLadderJumpOff(input: Input): void {
    if (!this.climbing) return;
    if (!input.jumpPressed) return;
    if (this.attackPhase !== 0) return;
    if (this.getupLockFrames > 0) return;
    if (this.jumpSquatRemaining > 0) return;
    if (this.landingLockFrames > 0) return;

    this.climbing = false;
    this.climbShaftTx = -1;
    this.jumpBufferTimer = 0;
    let jumpVel = this.stats.jumpVel;
    if (Math.abs(this.vx) >= this.stats.maxGroundSpeed * 0.99) {
      jumpVel *= HIGH_SPEED_JUMP_VEL_MULT;
    }
    this.vy = -jumpVel;
    const hj = this.stats.maxAirSpeed * LADDER_JUMP_SIDE_FRAC;
    if (input.left && !input.right) this.vx = -hj;
    else if (input.right && !input.left) this.vx = hj;
    else this.vx = this.facing * this.stats.maxAirSpeed * LADDER_JUMP_NEUTRAL_FRAC;
    this.vx = Math.max(-this.stats.maxAirSpeed, Math.min(this.stats.maxAirSpeed, this.vx));
    this.onGround = false;
    this.landingLockFrames = 0;
    this.crouchJumpMode = false;
    this.normalJumpAirborne = true;
    this.walkOffLedgeActive = false;
    this.coyoteTimer = 0;
    this.jumpHeld = true;
    this.squash.applyStretchY(1.2, SquashStretch.DEFAULT_RECOVER_FRAMES);
  }

  /**
   * Sticky climb latch after collide (Java Player post-step block).
   * Stays climbing without requiring rung overlap every frame; Up/Down mount rules;
   * mouth decks use double-tap getup (not direct Down latch).
   */
  private updateClimbLatch(input: Input, map: TileMap): void {
    if (this.getupLockFrames > 0) return;

    let upHeld = input.up;
    let down = input.down && !input.up;
    // Post-getup latch: keep direction for one follow-through frame (Java getupPostLatchFrames).
    // (Handled inside finishGetup via immediate climb vy; latch flags cleared there.)

    const onLadderNow = this.overlapsLadderOrPlatformShaftBelow(map);

    if (this.climbing && this.onGround && this.feetOnPlatformDeckOnly(map) && !this.overlapsLadder(map)) {
      if (!this.canStepOffLadderTop(map)) {
        this.climbing = false;
      }
    }

    // Clear when off shaft unless holding Down through a gap, or ascending into a mouth deck.
    if (
      !onLadderNow &&
      !(this.climbing && down) &&
      !this.preserveClimbAscentToDeck(map, upHeld)
    ) {
      this.climbing = false;
      this.climbShaftTx = -1;
    } else {
      const onMouthWithShaftBelow =
        this.onGround && this.feetOnPlatformDeckOnly(map) && this.ladderShaftBelowFeetPlatform(map);
      const upClimbAboveMouth =
        onMouthWithShaftBelow && this.mouthDeckLadderContinuesAbove(map);
      // Airborne Up only grabs while falling (vy > 0), not while jumping past a shaft.
      const latchUp =
        upHeld &&
        (!onMouthWithShaftBelow || upClimbAboveMouth) &&
        (this.preserveClimbAscentToDeck(map, upHeld) ||
          ((this.onGround || this.vy > 0) && this.overlapsLadder(map)));
      // Direct Down latch blocked on resting mouth decks — double-tap getup owns those.
      const latchDown =
        down &&
        onLadderNow &&
        (!this.onGround || this.feetOnPlatformDeckOnly(map)) &&
        !this.mouthPlatformDropThroughPending(map);
      if (latchUp || latchDown) {
        if (!this.climbing) {
          this.captureActiveClimbShaft(map);
          this.vx = 0;
          this.vy = 0;
          this.onGround = false;
          this.jumpSquatRemaining = 0;
          this.crouchJumpMode = false;
          this.normalJumpAirborne = false;
        }
        this.climbing = true;
        this.walkOffLedgeActive = false;
        // Constrain after collide next tick (Java latch does not center here).
      }
    }

    if (!this.climbing) {
      this.climbShaftTx = -1;
    } else if (this.climbShaftTx < 0) {
      this.captureActiveClimbShaft(map);
    }
  }

  private updateClimbMove(dt: number, input: Input, map: TileMap): void {
    const upHeld = input.up;
    const down = input.down && !input.up;
    // Shaft centering runs after collide (Java moveAndCollide) — not here.
    this.vx = approach(this.vx, 0, this.stats.airBrake * dt);

    if (down) {
      this.vy = this.stats.climbSpeed;
    } else if (upHeld) {
      if (this.canStepOffLadderTop(map)) {
        this.beginGetup("ladder_top", map, false, true);
        this.vy = 0;
      } else {
        this.vy = -this.stats.climbSpeed;
      }
    } else {
      this.vy = 0;
    }

    let dir = 0;
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
    if (dir !== 0) this.facing = dir;
  }

  /**
   * Grounded mouth: first Down starts tap window (crouch); second Down within window → mount getup.
   */
  private tickMouthDoubleTapMount(input: Input, map: TileMap, landingLocked: boolean): void {
    if (landingLocked || this.getupLockFrames > 0) {
      this.ladderMouthDownTapFrames = 0;
      return;
    }
    if (!this.standingOnMouthDeckForMount(map)) {
      this.ladderMouthDownTapFrames = 0;
    } else if (this.ladderMouthDownTapFrames > 0) {
      this.ladderMouthDownTapFrames--;
    }

    if (!input.downPressed) return;

    let doubleTap = false;
    if (this.ladderMouthDownTapFrames > 0 && this.standingOnMouthDeckForMount(map)) {
      doubleTap = true;
      this.ladderMouthDownTapFrames = 0;
    } else if (this.standingOnMouthDeckForMount(map)) {
      this.ladderMouthDownTapFrames = LADDER_MOUTH_DOUBLE_TAP_FRAMES;
    }

    if (
      doubleTap &&
      this.onGround &&
      this.standingOnMouthDeckForMount(map) &&
      !this.climbing &&
      this.attackPhase === 0
    ) {
      this.crouching = false;
      this.walkOffLedgeActive = false;
      this.beginGetup("ladder_mount", map, true, false);
    }
  }

  private beginGetup(
    kind: "ladder_mount" | "ladder_top",
    map: TileMap,
    latchDown: boolean,
    latchUp: boolean,
  ): void {
    this.getupKind = kind;
    this.getupLockFrames = GETUP_LOCK_FRAMES;
    this.getupLatchDown = latchDown;
    this.getupLatchUp = latchUp;
    this.getupRenderHold = false;
    this.climbing = false;
    this.vx = 0;
    this.vy = 0;
    this.walkOffLedgeActive = false;
    this.cancelAttack();
    this.jumpSquatRemaining = 0;

    if (kind === "ladder_top") {
      this.captureGetupMouthShaftFromClimb(map);
      this.computeGetupLandPlatform(map);
      this.x = this.getupLandX;
      this.y = this.getupLandY;
      this.onGround = true;
    } else {
      this.captureGetupMouthShaftFromFeet(map);
      if (this.getupMouthCol < 0 || this.getupMouthRungTy < 0) {
        this.cancelGetup();
        return;
      }
      this.computeGetupMountLadderPosition();
      this.x = this.getupLandX;
    }
  }

  private cancelGetup(): void {
    this.getupLockFrames = 0;
    this.getupKind = "none";
    this.getupMouthCol = -1;
    this.getupMouthDeckTy = -1;
    this.getupMouthRungTy = -1;
    this.getupLatchDown = false;
    this.getupLatchUp = false;
    this.getupRenderHold = false;
  }

  private finishGetup(map: TileMap): void {
    const finished = this.getupKind;
    if (finished === "ladder_mount") {
      if (this.getupMouthCol >= 0 && this.getupMouthRungTy >= 0) {
        this.climbShaftTx = this.getupMouthCol;
        this.climbing = true;
        this.onGround = false;
        this.vx = 0;
        this.vy = this.getupLatchDown ? this.stats.climbSpeed : 0;
        this.x = this.getupLandX;
        this.y = this.getupLandY;
        this.applyHitboxHeight(PLAYER_STAND_H, map);
        this.crouching = false;
        this.normalJumpAirborne = false;
        this.crouchJumpMode = false;
      }
    } else if (finished === "ladder_top") {
      this.x = this.getupLandX;
      this.y = this.getupLandY;
      this.climbing = false;
      this.climbShaftTx = -1;
      this.vx = 0;
      this.vy = 0;
      this.applyHitboxHeight(PLAYER_STAND_H, map);
      this.onGround = this.isGrounded(map);
      this.walkOffLedgeActive = false;
      // Latch-up was held through the pose; no post-frame climb (we're on the deck).
      void this.getupLatchUp;
    }
    this.getupRenderHold = finished === "ladder_top";
    this.getupKind = "none";
    this.getupLatchDown = false;
    this.getupLatchUp = false;
  }

  private computeGetupMountLadderPosition(): void {
    this.getupLandX = this.getupMouthCol * TILE_SIZE + (TILE_SIZE - this.w) * 0.5;
    this.getupLandY = this.getupMouthRungTy * TILE_SIZE - PLAYER_STAND_H;
  }

  private captureGetupMouthShaftFromFeet(map: TileMap): void {
    this.getupMouthCol = -1;
    this.getupMouthDeckTy = -1;
    this.getupMouthRungTy = -1;
    const col = this.mouthShaftColumnFromStrictFeet(map);
    if (col < 0) return;
    const deckTy = this.mouthDeckRowUnderFeet(map, col);
    if (deckTy < 0) return;
    const rungTy = mouthRungRowBelowDeck(map, col, deckTy);
    if (rungTy < 0) return;
    this.getupMouthCol = col;
    this.getupMouthDeckTy = deckTy;
    this.getupMouthRungTy = rungTy;
  }

  private captureGetupMouthShaftFromClimb(map: TileMap): void {
    this.getupMouthCol = -1;
    this.getupMouthDeckTy = -1;
    this.getupMouthRungTy = -1;
    let col = this.climbShaftColumn(map);
    if (col < 0) return;
    let rungTy = this.topIntersectedLadderRowInColumn(map, col);
    let deckTy = -1;
    if (rungTy >= 0) deckTy = mouthDeckRowAboveRung(map, col, rungTy);
    if (deckTy < 0) {
      const mouthTy = this.mouthPlatformRowHullIntersects(map, col);
      if (mouthTy >= 0) {
        deckTy = mouthTy;
        rungTy = mouthRungRowBelowDeck(map, col, mouthTy);
      }
    }
    if (deckTy < 0 || rungTy < 0) return;
    this.getupMouthCol = col;
    this.getupMouthDeckTy = deckTy;
    this.getupMouthRungTy = rungTy;
  }

  private computeGetupLandPlatform(map: TileMap): void {
    if (this.getupMouthCol >= 0 && this.getupMouthDeckTy >= 0) {
      this.getupLandX = this.getupMouthCol * TILE_SIZE + (TILE_SIZE - this.w) * 0.5;
      this.getupLandY = this.getupMouthDeckTy * TILE_SIZE - PLAYER_STAND_H;
      return;
    }
    const col = this.climbShaftColumn(map);
    if (col < 0) {
      this.getupLandX = this.x;
      this.getupLandY = this.y;
      return;
    }
    let deckTy = this.feetStandableDeckRowInColumn(map, col);
    if (deckTy < 0) {
      let topRungTy = this.topIntersectedLadderRowInColumn(map, col);
      if (topRungTy >= 0) deckTy = mouthDeckRowAboveRung(map, col, topRungTy);
      if (deckTy < 0) deckTy = this.mouthPlatformRowHullIntersects(map, col);
    }
    if (deckTy < 0) {
      this.getupLandX = this.x;
      this.getupLandY = this.y;
      return;
    }
    this.getupLandX = col * TILE_SIZE + (TILE_SIZE - this.w) * 0.5;
    this.getupLandY = deckTy * TILE_SIZE - PLAYER_STAND_H;
  }

  private captureActiveClimbShaft(map: TileMap): void {
    const col = this.resolveClimbShaftColumn(map);
    if (col >= 0) this.climbShaftTx = col;
  }

  private constrainClimbingShaftColumn(map: TileMap): void {
    const col = this.climbShaftColumn(map);
    if (col < 0) return;
    const targetX = col * TILE_SIZE + (TILE_SIZE - this.w) * 0.5;
    if (Math.abs(this.x - targetX) > 1e-3) {
      this.x = targetX;
      this.vx = 0;
    }
  }

  private climbShaftColumn(map: TileMap): number {
    if (this.climbShaftTx >= 0 && this.activeClimbShaftStillValid(map, this.climbShaftTx)) {
      return this.climbShaftTx;
    }
    if (this.getupMouthCol >= 0 && this.activeClimbShaftStillValid(map, this.getupMouthCol)) {
      return this.getupMouthCol;
    }
    const col = this.resolveClimbShaftColumn(map);
    if (col >= 0 && this.climbing) this.climbShaftTx = col;
    return col;
  }

  private activeClimbShaftStillValid(map: TileMap, columnTx: number): boolean {
    if (this.overlapsLadderColumn(map, columnTx)) return true;
    if (this.mouthPlatformRowHullIntersects(map, columnTx) >= 0) return true;
    return this.ladderShaftBelowFeetPlatformInColumn(map, columnTx);
  }

  private resolveClimbShaftColumn(map: TileMap): number {
    const near = this.nearestIntersectingLadderColumn(map);
    if (near >= 0) return near;
    const mouth = this.mouthShaftColumnFromStrictFeet(map);
    if (mouth >= 0) return mouth;
    const centerX = this.x + this.w * 0.5;
    const centerTx = Math.floor(centerX / TILE_SIZE);
    const scanLo = Math.max(0, centerTx - 1);
    const scanHi = Math.min(map.width - 1, centerTx + 1);
    let bestTx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let tx = scanLo; tx <= scanHi; tx++) {
      if (!this.hullIntersectsPlatformInColumn(map, tx)) continue;
      if (this.mouthPlatformRowHullIntersects(map, tx) < 0) continue;
      const colCenter = (tx + 0.5) * TILE_SIZE;
      const dist = Math.abs(centerX - colCenter);
      if (dist < bestDist) {
        bestDist = dist;
        bestTx = tx;
      }
    }
    return bestTx;
  }

  private nearestIntersectingLadderColumn(map: TileMap): number {
    const centerX = this.x + this.w * 0.5;
    const leftTile = Math.floor((this.left() + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((this.right() - 0.001) / TILE_SIZE);
    const topTile = Math.floor((this.top() + 0.001) / TILE_SIZE);
    const bottomTile = Math.floor((this.bottom() - 0.001) / TILE_SIZE);
    let bestTx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let ty = topTile; ty <= bottomTile; ty++) {
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!map.isLadderTile(tx, ty) || !this.aabbOverlapsTile(tx, ty)) continue;
        const colCenter = (tx + 0.5) * TILE_SIZE;
        const dist = Math.abs(centerX - colCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestTx = tx;
        }
      }
    }
    return bestTx;
  }

  /** Hitbox on ladder tiles, or feet on one-way with shaft below. */
  private overlapsLadderOrPlatformShaftBelow(map: TileMap): boolean {
    if (this.overlapsLadder(map)) return true;
    return this.ladderShaftBelowFeetPlatform(map);
  }

  private feetOnPlatformDeckOnly(map: TileMap): boolean {
    // Stand feet while jump hull active (Java poseForFeetSupport).
    const feet = this.poseForFeetSupport().bounds();
    const leftTile = Math.floor((feet.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((feet.x + feet.w - 0.001) / TILE_SIZE);
    const footBottom = feet.y + feet.h;
    const tyCenter = Math.floor((footBottom - 1e-3) / TILE_SIZE);
    const scanLo = Math.max(0, leftTile - 1);
    const scanHi = Math.min(map.width - 1, rightTile + 1);
    for (let dty = -1; dty <= 1; dty++) {
      const ty = tyCenter + dty;
      if (ty < 0 || ty >= map.height) continue;
      for (let tx = scanLo; tx <= scanHi; tx++) {
        if (!map.isPlatformTile(tx, ty)) continue;
        const tileLeft = tx * TILE_SIZE;
        const tileRight = (tx + 1) * TILE_SIZE;
        if (feet.x + feet.w <= tileLeft + 1e-6 || feet.x >= tileRight - 1e-6) continue;
        const deckTop = ty * TILE_SIZE;
        if (footBottom >= deckTop - 1e-3 && footBottom <= deckTop + PLATFORM_DECK_SLACK_PX) {
          return true;
        }
      }
    }
    return false;
  }

  private ladderShaftBelowFeetPlatform(map: TileMap): boolean {
    if (!this.feetOnPlatformDeckOnly(map)) return false;
    const leftTile = Math.floor((this.left() + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((this.right() - 0.001) / TILE_SIZE);
    const scanLo = Math.max(0, leftTile - 1);
    const scanHi = Math.min(map.width - 1, rightTile + 1);
    for (let tx = scanLo; tx <= scanHi; tx++) {
      if (this.ladderShaftBelowFeetPlatformInColumn(map, tx)) return true;
    }
    return false;
  }

  private ladderShaftBelowFeetPlatformInColumn(map: TileMap, columnTx: number): boolean {
    if (!this.feetOnPlatformDeckOnly(map)) return false;
    const leftTile = Math.floor((this.left() + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((this.right() - 0.001) / TILE_SIZE);
    const scanLo = Math.max(0, leftTile - 1);
    const scanHi = Math.min(map.width - 1, rightTile + 1);
    if (columnTx < scanLo || columnTx > scanHi) return false;
    const tyCenter = Math.floor((this.bottom() - 1e-3) / TILE_SIZE);
    for (let dty = -1; dty <= 1; dty++) {
      const feetTy = tyCenter + dty;
      if (feetTy < 0 || feetTy >= map.height) continue;
      if (!map.isPlatformTile(columnTx, feetTy)) continue;
      const deckTop = feetTy * TILE_SIZE;
      if (this.bottom() < deckTop - 1e-3 || this.bottom() > deckTop + PLATFORM_DECK_SLACK_PX) {
        continue;
      }
      if (ladderShaftInColumnFromRow(map, columnTx, feetTy + 1)) return true;
    }
    return false;
  }

  private mouthPlatformDropThroughPending(map: TileMap): boolean {
    // Block direct Down latch on resting mouth decks — double-tap mount getup owns those.
    if (this.getupLockFrames > 0 || !this.onMouthPlatformForMountGetup(map)) return false;
    if (this.climbing) return false;
    // Descending past the mouth (not resting): allow re-grab.
    if (!this.onGround && this.vy > 0) return false;
    return true;
  }

  /** On a one-way mouth with shaft below — getup owns drop-through. */
  private onMouthPlatformForMountGetup(map: TileMap): boolean {
    return this.feetOnPlatformDeckOnly(map) && this.ladderShaftBelowFeetPlatform(map);
  }

  /** Feet rest on a mouth `-` deck (strict; used for double-tap mount). */
  private standingOnMouthDeckForMount(map: TileMap): boolean {
    return this.mouthShaftColumnFromStrictFeet(map) >= 0;
  }

  private mouthDeckLadderContinuesAbove(map: TileMap): boolean {
    const col = this.mouthShaftColumnFromStrictFeet(map);
    if (col < 0) return false;
    const deckTy = this.mouthDeckRowUnderFeet(map, col);
    if (deckTy < 0) return false;
    return ladderContinuesAboveDeck(map, col, deckTy);
  }

  private mouthShaftColumnFromStrictFeet(map: TileMap): number {
    const centerX = this.x + this.w * 0.5;
    const leftTile = Math.floor((this.left() + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((this.right() - 0.001) / TILE_SIZE);
    const scanLo = Math.max(0, leftTile - 1);
    const scanHi = Math.min(map.width - 1, rightTile + 1);
    let bestTx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let tx = scanLo; tx <= scanHi; tx++) {
      if (this.mouthDeckRowUnderFeet(map, tx) < 0) continue;
      const colCenter = (tx + 0.5) * TILE_SIZE;
      const dist = Math.abs(centerX - colCenter);
      if (dist < bestDist) {
        bestDist = dist;
        bestTx = tx;
      }
    }
    return bestTx;
  }

  private mouthDeckRowUnderFeet(map: TileMap, columnTx: number): number {
    const tyCenter = Math.floor((this.bottom() - 1e-3) / TILE_SIZE);
    for (let dty = -1; dty <= 1; dty++) {
      const ty = tyCenter + dty;
      if (ty < 0 || ty >= map.height) continue;
      if (!map.isPlatformTile(columnTx, ty)) continue;
      if (mouthRungRowBelowDeck(map, columnTx, ty) < 0) continue;
      const deckTop = ty * TILE_SIZE;
      if (this.bottom() < deckTop - 1e-3) continue;
      if (this.bottom() > deckTop + PLATFORM_DECK_SLACK_PX) continue;
      const tileLeft = columnTx * TILE_SIZE;
      const tileRight = (columnTx + 1) * TILE_SIZE;
      const overlap = Math.min(this.right(), tileRight) - Math.max(this.left(), tileLeft);
      if (overlap + 1e-6 < LADDER_MOUTH_LATCH_MIN_OVERLAP_PX) continue;
      return ty;
    }
    return -1;
  }

  private preserveClimbAscentToDeck(map: TileMap, upHeld: boolean): boolean {
    if (!this.climbing || !upHeld) return false;
    const col = this.climbShaftColumn(map);
    if (col < 0) return false;
    if (this.feetStandableDeckRowInColumn(map, col) >= 0) return false;
    let topRungTy = this.topIntersectedLadderRowInColumn(map, col);
    if (topRungTy < 0) {
      const mouthTy = this.mouthPlatformRowHullIntersects(map, col);
      if (mouthTy >= 0) topRungTy = mouthRungRowBelowDeck(map, col, mouthTy);
    }
    if (topRungTy < 0) return false;
    const deckTy = mouthDeckRowAboveRung(map, col, topRungTy);
    if (deckTy < 0) return false;
    if (ladderContinuesAboveDeck(map, col, deckTy)) return false;
    if (this.overlapsLadderTilesDirect(map)) return false;
    const deckTop = deckTy * TILE_SIZE;
    const topRungTop = topRungTy * TILE_SIZE;
    if (this.bottom() <= deckTop + PLATFORM_DECK_SLACK_PX) return false;
    if (this.bottom() > topRungTop + 1e-3) return false;
    const centerTx = Math.floor((this.x + this.w * 0.5) / TILE_SIZE);
    if (centerTx < col - 1 || centerTx > col + 1) return false;
    return this.hullIntersectsPlatformInColumn(map, col);
  }

  private canStepOffLadderTop(map: TileMap): boolean {
    if (!this.climbing) return false;
    const col = this.climbShaftColumn(map);
    if (col < 0) return false;
    // North room-edge band: getup disabled — jump-off / room fade own exit (Java).
    if (this.top() <= TILE_SIZE) return false;
    let deckTy = this.feetStandableDeckRowInColumn(map, col);
    let topRungTy = deckTy >= 0 ? mouthRungRowBelowDeck(map, col, deckTy) : -1;
    if (deckTy < 0) {
      topRungTy = this.topIntersectedLadderRowInColumn(map, col);
      if (topRungTy >= 0) deckTy = mouthDeckRowAboveRung(map, col, topRungTy);
      if (deckTy < 0) {
        const mouthTy = this.mouthPlatformRowHullIntersects(map, col);
        if (mouthTy >= 0) {
          deckTy = mouthTy;
          topRungTy = mouthRungRowBelowDeck(map, col, mouthTy);
        }
      }
      if (deckTy < 0 || topRungTy < 0) return false;
      // Rising through the mouth one-way: lower body in the platform tile, feet not on the deck band yet.
      if (this.overlapsLadderTilesDirect(map)) return false;
      if (!this.hullIntersectsPlatformInColumn(map, col)) return false;
      const topRungTop = topRungTy * TILE_SIZE;
      if (this.bottom() > topRungTop + 1e-3) return false;
    }
    if (ladderContinuesAboveDeck(map, col, deckTy)) return false;
    return true;
  }

  private feetStandableDeckRowInColumn(map: TileMap, columnTx: number): number {
    const tyCenter = Math.floor((this.bottom() - 1e-3) / TILE_SIZE);
    for (let dty = -1; dty <= 1; dty++) {
      const ty = tyCenter + dty;
      if (ty < 0 || ty >= map.height) continue;
      if (!map.isPlatformTile(columnTx, ty) && !map.isSolidTile(columnTx, ty)) continue;
      const deckTop = ty * TILE_SIZE;
      if (this.bottom() >= deckTop - 1e-3 && this.bottom() <= deckTop + PLATFORM_DECK_SLACK_PX) {
        return ty;
      }
    }
    return -1;
  }

  private topIntersectedLadderRowInColumn(map: TileMap, columnTx: number): number {
    const leftTile = Math.floor((this.left() + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((this.right() - 0.001) / TILE_SIZE);
    if (columnTx < leftTile || columnTx > rightTile) return -1;
    const topTile = Math.floor((this.top() + 0.001) / TILE_SIZE);
    const bottomTile = Math.floor((this.bottom() - 0.001) / TILE_SIZE);
    let bestTy = Number.POSITIVE_INFINITY;
    for (let ty = topTile; ty <= bottomTile; ty++) {
      if (map.isLadderTile(columnTx, ty) && this.aabbOverlapsTile(columnTx, ty)) {
        bestTy = Math.min(bestTy, ty);
      }
    }
    return Number.isFinite(bestTy) ? bestTy : -1;
  }

  private mouthPlatformRowHullIntersects(map: TileMap, columnTx: number): number {
    const topTile = Math.floor((this.top() + 0.001) / TILE_SIZE);
    const bottomTile = Math.floor((this.bottom() - 0.001) / TILE_SIZE);
    let bestTy = Number.POSITIVE_INFINITY;
    for (let ty = topTile; ty <= bottomTile; ty++) {
      if (!map.isPlatformTile(columnTx, ty) || !this.aabbOverlapsTile(columnTx, ty)) continue;
      if (mouthRungRowBelowDeck(map, columnTx, ty) >= 0) bestTy = Math.min(bestTy, ty);
    }
    return Number.isFinite(bestTy) ? bestTy : -1;
  }

  private hullIntersectsPlatformInColumn(map: TileMap, columnTx: number): boolean {
    const topTile = Math.floor((this.top() + 0.001) / TILE_SIZE);
    const bottomTile = Math.floor((this.bottom() - 0.001) / TILE_SIZE);
    for (let ty = topTile; ty <= bottomTile; ty++) {
      if (map.isPlatformTile(columnTx, ty) && this.aabbOverlapsTile(columnTx, ty)) return true;
    }
    return false;
  }

  private overlapsLadderTilesDirect(map: TileMap): boolean {
    const leftTile = Math.floor((this.left() + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((this.right() - 0.001) / TILE_SIZE);
    const topTile = Math.floor((this.top() + 0.001) / TILE_SIZE);
    const bottomTile = Math.floor((this.bottom() - 0.001) / TILE_SIZE);
    for (let ty = topTile; ty <= bottomTile; ty++) {
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (map.isLadderTile(tx, ty) && this.aabbOverlapsTile(tx, ty)) return true;
      }
    }
    return false;
  }

  private overlapsLadder(map: TileMap): boolean {
    if (this.overlapsLadderTilesDirect(map)) return true;
    return this.overlapsMergedMouthTopRung(map);
  }

  /** Climbing up through mouth "-": lower band below deck lip counts as ladder. */
  private overlapsMergedMouthTopRung(map: TileMap): boolean {
    if (!this.climbing) return false;
    const col = this.climbShaftColumn(map);
    if (col < 0) return false;
    let topRungTy = this.topIntersectedLadderRowInColumn(map, col);
    let mouthTy = -1;
    if (topRungTy >= 0) mouthTy = mouthDeckRowAboveRung(map, col, topRungTy);
    if (mouthTy < 0) {
      mouthTy = this.mouthPlatformRowHullIntersects(map, col);
      if (mouthTy >= 0) topRungTy = mouthRungRowBelowDeck(map, col, mouthTy);
    }
    if (mouthTy < 0 || topRungTy < 0) return false;
    const mouthDeckTop = mouthTy * TILE_SIZE;
    const topRungTop = topRungTy * TILE_SIZE;
    if (this.bottom() <= mouthDeckTop + PLATFORM_DECK_SLACK_PX) return false;
    if (this.bottom() > topRungTop + 1e-3) return false;
    return (
      this.hullIntersectsPlatformInColumn(map, col) || this.aabbOverlapsTile(col, topRungTy)
    );
  }

  private rebuildStandSegments(): void {
    this.tickStandSegments = StandSurfaceQuery.collectPedestalSegments(this.tickPedestalPlatforms);
  }

  /** Snap feet down along pedestal exit feathers while grounded (Java followPedestalDeckWhileGrounded). */
  private followPedestalDeckWhileGrounded(): void {
    this.tickPedestalGroundContact = false;
    if (!this.onGround || this.climbing || this.vy < -1e-3 || !this.tickPedestalPlatforms) return;
    const feet = this.poseForFeetSupport().bounds();
    if (
      !StandSurfaceQuery.feetOverlapPedestalHull(
        feet.x,
        feet.x + feet.w,
        this.tickPedestalPlatforms,
      )
    ) {
      return;
    }
    this.rebuildStandSegments();
    const footY = this.collisionFootWorldY();
    const deck = StandSurfaceQuery.floorYUnderFeet(
      feet.x,
      feet.x + feet.w,
      footY,
      this.tickStandSegments,
      this.tickPedestalPlatforms,
    );
    if (!StandSurfaceQuery.footNearDeck(footY, deck)) return;
    if (footY < deck - 1e-3) return;
    this.snapFootToFloorY(deck);
    this.tickPedestalGroundContact = true;
    if (!this.climbing && this.vy >= -1e-3) {
      this.onGround = true;
    }
  }

  private moveAndCollide(dt: number, map: TileMap): void {
    const poseBefore = this.hitboxPose();
    const prevStepFeet = JumpFoot.jumpFootProbeFrom(poseBefore);
    const prevTop = poseBefore.bounds().y;
    this.rebuildStandSegments();
    const predictedStepFeet = JumpFoot.jumpFootProbeFrom(
      this.collisionPoseAt(this.x + this.vx * dt, this.y + this.vy * dt),
    );

    const xBefore = this.x;
    this.x += this.vx * dt;
    this.resolveHorizontal(map, xBefore, prevStepFeet, predictedStepFeet);

    const feetBeforeVertical = JumpFoot.jumpFootProbeFrom(this.hitboxPose());
    this.rebuildStandSegments();
    this.y += this.vy * dt;
    this.onGround = false;
    this.resolveVertical(map, feetBeforeVertical, prevTop);
    if (!this.onGround && !this.usesJumpCollisionHull()) {
      this.onGround = this.isGrounded(map);
    }
    this.followPedestalDeckWhileGrounded();
    // Java moveAndCollide post-step: floor depenetration while climbing down, then shaft center.
    this.correctClimbingFloorPenetration(map);
    if (this.climbing && this.getupLockFrames === 0) {
      this.constrainClimbingShaftColumn(map);
    }
  }

  /** While climbing down, never leave feet embedded in solid floor (Java correctClimbingFloorPenetration). */
  private correctClimbingFloorPenetration(map: TileMap): void {
    if (!this.climbing || this.vy < 0) return;
    const pose = this.hitboxPose();
    const b = pose.bounds();
    const leftTile = Math.floor((b.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
    const feetTy = Math.floor((b.y + b.h - 1e-3) / TILE_SIZE);
    let bestFloorY = Number.POSITIVE_INFINITY;
    for (let ty = feetTy; ty <= feetTy + 1; ty++) {
      if (ty < 0 || ty >= map.height) continue;
      const floorY = ty * TILE_SIZE;
      if (b.y + b.h <= floorY + 1e-3) continue;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!map.isSolidTile(tx, ty)) continue;
        const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
        if (!pose.intersectsRect(tile)) continue;
        bestFloorY = Math.min(bestFloorY, floorY);
      }
    }
    if (Number.isFinite(bestFloorY)) {
      this.snapFootToFloorY(bestFloorY);
      this.vy = 0;
      this.climbing = false;
      this.climbShaftTx = -1;
      this.onGround = true;
    }
  }

  private resolveHorizontal(
    map: TileMap,
    xBefore: number,
    prevFeet: JumpFoot.JumpFootProbe,
    predictedFeet: JumpFoot.JumpFootProbe,
  ): void {
    if (this.vx === 0) return;
    if (
      !this.polygonOverlapsHorizontalBlockingSolids(
        this.collisionPoseAt(this.x, this.y),
        map,
        this.vx,
        prevFeet,
        predictedFeet,
      )
    ) {
      return;
    }

    if (this.vx > 0) {
      let lo = Math.min(xBefore, this.x);
      let hi = Math.max(xBefore, this.x);
      for (let i = 0; i < TILE_SEPARATION_ITERATIONS; i++) {
        const mid = (lo + hi) * 0.5;
        if (
          this.polygonOverlapsHorizontalBlockingSolids(
            this.collisionPoseAt(mid, this.y),
            map,
            this.vx,
            prevFeet,
            predictedFeet,
          )
        ) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      this.x = lo;
    } else {
      let lo = Math.min(xBefore, this.x);
      let hi = Math.max(xBefore, this.x);
      for (let i = 0; i < TILE_SEPARATION_ITERATIONS; i++) {
        const mid = (lo + hi) * 0.5;
        if (
          this.polygonOverlapsHorizontalBlockingSolids(
            this.collisionPoseAt(mid, this.y),
            map,
            this.vx,
            prevFeet,
            predictedFeet,
          )
        ) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      this.x = hi;
    }
    this.vx = 0;
  }

  private resolveVertical(map: TileMap, prevFeet: JumpFoot.JumpFootProbe, prevTop: number): void {
    const pose = this.hitboxPose();
    const b = pose.bounds();
    const nextFeet = JumpFoot.jumpFootProbeFrom(pose);
    const jumpHull = JumpFoot.isJumpHullPose(pose);

    if (this.vy >= 0) {
      const landing = JumpFoot.createLandingSnapState();
      const leftTile = Math.floor((b.x + 0.001) / TILE_SIZE);
      const rightTile = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
      const tyLo = JumpFoot.footProbeTySpanLoWith(prevFeet, nextFeet);
      const tyHi = JumpFoot.footProbeTySpanHiWith(prevFeet, nextFeet);
      const platScanLo = leftTile - 1;
      const platScanHi = rightTile + 1;
      const feetSpan = this.poseForFeetSupport().bounds();
      const onPedestalHull = StandSurfaceQuery.feetOverlapPedestalHull(
        feetSpan.x,
        feetSpan.x + feetSpan.w,
        this.tickPedestalPlatforms,
      );
      this.rebuildStandSegments();
      const pedestalSupportY = onPedestalHull
        ? StandSurfaceQuery.floorYUnderFeet(
            feetSpan.x,
            feetSpan.x + feetSpan.w,
            JumpFoot.footProbeSupportY(nextFeet),
            this.tickStandSegments,
            this.tickPedestalPlatforms,
          )
        : Number.NaN;

      for (let ty = tyLo; ty <= tyHi; ty++) {
        const floorY = ty * TILE_SIZE;
        if (JumpFoot.footProbeAllPrevBelowFloor(prevFeet, floorY)) continue;
        if (JumpFoot.footProbeAllNextAboveFloor(nextFeet, floorY)) continue;
        if (onPedestalHull && !Number.isNaN(pedestalSupportY) && floorY >= pedestalSupportY - 1e-3) {
          continue;
        }

        for (let tx = leftTile; tx <= rightTile; tx++) {
          const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
          if (!pose.intersectsRect(tile) || !map.isSolidTile(tx, ty)) continue;
          const leadHit = JumpFoot.footDescendsOntoFloor(
            prevFeet.leadY,
            nextFeet.leadY,
            ty,
            floorY,
            0,
          );
          const trailHit = JumpFoot.footDescendsOntoFloor(
            prevFeet.trailY,
            nextFeet.trailY,
            ty,
            floorY,
            0,
          );
          if (leadHit || trailHit) {
            JumpFoot.noteLandingFloor(floorY, leadHit, trailHit, landing);
          }
        }

        if (!this.climbing && !onPedestalHull) {
          const leadFootX = JumpFoot.jumpFootLocalWorldX(pose, PLAYER_JUMP_LEAD_FOOT_LOCAL_X);
          const trailFootX = JumpFoot.jumpFootLocalWorldX(pose, PLAYER_JUMP_TRAIL_FOOT_LOCAL_X);
          for (let tx = platScanLo; tx <= platScanHi; tx++) {
            const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
            if (!pose.intersectsRect(tile)) continue;
            if (!map.isPlatformTile(tx, ty) || this.dropsThroughOneWayPlatformTile(map, tx, ty)) {
              continue;
            }
            if (!jumpHull) {
              if (
                JumpFoot.footLandsOrRestsOnDeck(
                  prevFeet.leadY,
                  nextFeet.leadY,
                  ty,
                  floorY,
                  PLATFORM_DECK_SLACK_PX,
                ) &&
                JumpFoot.feetSpanOverlapsTileColumn(feetSpan.x, feetSpan.x + feetSpan.w, tx)
              ) {
                JumpFoot.noteLandingFloor(floorY, true, true, landing);
              }
              continue;
            }
            const leadHit =
              JumpFoot.footLandsOrRestsOnDeck(
                prevFeet.leadY,
                nextFeet.leadY,
                ty,
                floorY,
                PLATFORM_DECK_SLACK_PX,
              ) && JumpFoot.footXOverTile(leadFootX, tx);
            const trailHit =
              JumpFoot.footLandsOrRestsOnDeck(
                prevFeet.trailY,
                nextFeet.trailY,
                ty,
                floorY,
                PLATFORM_DECK_SLACK_PX,
              ) && JumpFoot.footXOverTile(trailFootX, tx);
            if (leadHit || trailHit) {
              JumpFoot.noteLandingFloor(floorY, leadHit, trailHit, landing);
            }
          }
        }
      }

      const pedestalDeckLead = StandSurfaceQuery.landingPedestalFloorY(
        prevFeet.leadY,
        nextFeet.leadY,
        feetSpan.x,
        feetSpan.x + feetSpan.w,
        this.vy,
        this.tickPedestalPlatforms,
      );
      const pedestalDeckTrail = StandSurfaceQuery.landingPedestalFloorY(
        prevFeet.trailY,
        nextFeet.trailY,
        feetSpan.x,
        feetSpan.x + feetSpan.w,
        this.vy,
        this.tickPedestalPlatforms,
      );
      if (!Number.isNaN(pedestalDeckLead)) {
        JumpFoot.noteLandingFloor(pedestalDeckLead, true, false, landing);
      }
      if (!Number.isNaN(pedestalDeckTrail)) {
        JumpFoot.noteLandingFloor(pedestalDeckTrail, false, true, landing);
      }

      if (Number.isFinite(landing.bestFloorY)) {
        this.snapFootToFloorY(landing.bestFloorY, landing.snapLead, landing.snapTrail);
        this.vy = 0;
        this.onGround = true;
        if (this.climbing) {
          this.climbing = false;
          this.climbShaftTx = -1;
        }
      }
    } else {
      const leftTile = Math.floor((b.x + 0.001) / TILE_SIZE);
      const rightTile = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
      const topTile = Math.floor((b.y + 1e-4) / TILE_SIZE);
      const ceilingBottomY = (topTile + 1) * TILE_SIZE;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!map.isSolidTile(tx, topTile)) continue;
        const tile = { x: tx * TILE_SIZE, y: topTile * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
        if (!pose.intersectsRect(tile)) continue;
        if (prevTop >= ceilingBottomY - 1e-3 && b.y <= ceilingBottomY + 1e-3) {
          this.y = ceilingBottomY;
          this.vy = 0;
        }
        break;
      }
    }
  }

  private snapFootToFloorY(floorY: number, snapLead = true, snapTrail = true): void {
    const pose = this.hitboxPose();
    if (JumpFoot.isJumpHullPose(pose)) {
      const lead = JumpFoot.jumpLeadFootWorldY(pose);
      const trail = JumpFoot.jumpTrailFootWorldY(pose);
      let snapFoot: number;
      if (snapLead && snapTrail) snapFoot = Math.max(lead, trail);
      else if (snapLead) snapFoot = lead;
      else if (snapTrail) snapFoot = trail;
      else snapFoot = Math.max(lead, trail);
      this.y += floorY - snapFoot;
      return;
    }
    const foot = pose.bounds().y + pose.bounds().h;
    this.y += floorY - foot;
  }

  private isGrounded(map: TileMap): boolean {
    if (this.vy < 0) return false;
    const pose = this.hitboxPose();
    const b = pose.bounds();
    const footProbe = JumpFoot.jumpFootProbeFrom(pose);
    const jumpHull = JumpFoot.isJumpHullPose(pose);
    const feetSpan = this.poseForFeetSupport().bounds();
    this.rebuildStandSegments();
    if (
      StandSurfaceQuery.isGroundedUnderFeet(
        feetSpan.x,
        feetSpan.x + feetSpan.w,
        footProbe.leadY,
        this.vy,
        this.tickStandSegments,
        this.tickPedestalPlatforms,
      )
    ) {
      return true;
    }
    if (
      StandSurfaceQuery.isGroundedUnderFeet(
        feetSpan.x,
        feetSpan.x + feetSpan.w,
        footProbe.trailY,
        this.vy,
        this.tickStandSegments,
        this.tickPedestalPlatforms,
      )
    ) {
      return true;
    }
    const onPedestalHull = StandSurfaceQuery.feetOverlapPedestalHull(
      feetSpan.x,
      feetSpan.x + feetSpan.w,
      this.tickPedestalPlatforms,
    );
    const leftTile = Math.floor((b.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
    const tyCenterLo = Math.floor((JumpFoot.footProbeHighestY(footProbe) - 1e-3) / TILE_SIZE);
    const tyCenterHi = Math.floor((JumpFoot.footProbeSupportY(footProbe) - 1e-3) / TILE_SIZE);
    const scanLo = Math.max(0, leftTile - 1);
    const scanHi = Math.min(map.getWidth() - 1, rightTile + 1);
    for (let ty = tyCenterLo - 1; ty <= tyCenterHi + 1; ty++) {
      if (ty < 0 || ty >= map.getHeight()) continue;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
        if (!pose.intersectsRect(tile)) continue;
        if (map.isSolidTile(tx, ty)) {
          return true;
        }
      }
      if (!this.climbing && !onPedestalHull) {
        for (let tx = scanLo; tx <= scanHi; tx++) {
          if (!map.isPlatformTile(tx, ty)) continue;
          if (this.dropsThroughOneWayPlatformTile(map, tx, ty)) continue;
          const deckTop = ty * TILE_SIZE;
          if (jumpHull) {
            if (JumpFoot.jumpHullEitherFootOnPlatformTile(pose, tx, deckTop)) return true;
            continue;
          }
          const tileLeft = tx * TILE_SIZE;
          const tileRight = (tx + 1) * TILE_SIZE;
          if (b.x + b.w <= tileLeft + 1e-6 || b.x >= tileRight - 1e-6) continue;
          const supportY = JumpFoot.footProbeSupportY(footProbe);
          if (supportY >= deckTop - 1e-3 && supportY <= deckTop + PLATFORM_DECK_SLACK_PX) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Leading-column solids that stop horizontal motion, with deck-top exemptions so landing
   * does not zero vx before vertical resolve (Java polygonOverlapsHorizontalBlockingSolids).
   */
  private polygonOverlapsHorizontalBlockingSolids(
    pose: HitboxPose,
    map: TileMap,
    vx: number,
    prevFeet: JumpFoot.JumpFootProbe,
    predictedFeet: JumpFoot.JumpFootProbe,
  ): boolean {
    const pb = pose.bounds();
    const topTile = Math.floor((pb.y + 0.001) / TILE_SIZE);
    const bottomTile = Math.floor((pb.y + pb.h - 0.001) / TILE_SIZE);
    if (vx > 0) {
      const col0 = Math.floor((pb.x + pb.w) / TILE_SIZE);
      for (const c of [col0, col0 + 1]) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (!map.isSolidTile(c, ty)) continue;
          const tile = { x: c * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
          if (!pose.intersectsRect(tile)) continue;
          if (this.solidTileBlocksHorizontalWall(pose, map, c, ty, prevFeet, predictedFeet)) {
            return true;
          }
        }
      }
    } else if (vx < 0) {
      const col0 = Math.floor(pb.x / TILE_SIZE);
      for (const c of [col0, col0 - 1]) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (!map.isSolidTile(c, ty)) continue;
          const tile = { x: c * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
          if (!pose.intersectsRect(tile)) continue;
          if (this.solidTileBlocksHorizontalWall(pose, map, c, ty, prevFeet, predictedFeet)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** One-way deck the feet will land on this step — horizontal must defer. */
  private tileIsVerticalDeckContactThisStep(
    map: TileMap,
    tx: number,
    ty: number,
    prevFeet: JumpFoot.JumpFootProbe,
    predictedFeet: JumpFoot.JumpFootProbe,
  ): boolean {
    if (this.vy < 0) return false;
    if (!map.isPlatformTile(tx, ty) || this.dropsThroughOneWayPlatformTile(map, tx, ty)) {
      return false;
    }
    const deckTop = ty * TILE_SIZE;
    return (
      JumpFoot.footDescendsOntoFloor(
        prevFeet.leadY,
        predictedFeet.leadY,
        ty,
        deckTop,
        PLATFORM_DECK_SLACK_PX,
      ) ||
      JumpFoot.footDescendsOntoFloor(
        prevFeet.trailY,
        predictedFeet.trailY,
        ty,
        deckTop,
        PLATFORM_DECK_SLACK_PX,
      )
    );
  }

  private solidTileFloorContactThisStep(
    map: TileMap,
    tx: number,
    ty: number,
    prevFeet: JumpFoot.JumpFootProbe,
    nextFeet: JumpFoot.JumpFootProbe,
  ): boolean {
    if (!map.isSolidTile(tx, ty)) return false;
    const floorY = ty * TILE_SIZE;
    return (
      JumpFoot.footLandsOrRestsOnDeck(prevFeet.leadY, nextFeet.leadY, ty, floorY, 0) ||
      JumpFoot.footLandsOrRestsOnDeck(prevFeet.trailY, nextFeet.trailY, ty, floorY, 0)
    );
  }

  private tileIsSolidFloorLandingThisStep(
    map: TileMap,
    tx: number,
    ty: number,
    prevFeet: JumpFoot.JumpFootProbe,
    predictedFeet: JumpFoot.JumpFootProbe,
  ): boolean {
    if (this.vy < 0) return false;
    if (!this.solidTileFloorContactThisStep(map, tx, ty, prevFeet, predictedFeet)) {
      return false;
    }
    const deckTop = ty * TILE_SIZE;
    return (
      this.footIsNewSolidLanding(prevFeet.leadY, predictedFeet.leadY, ty, deckTop) ||
      this.footIsNewSolidLanding(prevFeet.trailY, predictedFeet.trailY, ty, deckTop)
    );
  }

  private footIsNewSolidLanding(
    prevFootY: number,
    nextFootY: number,
    ty: number,
    deckTop: number,
  ): boolean {
    const prevFootTile = Math.floor((prevFootY - 1e-4) / TILE_SIZE);
    const alreadyGroundedOnDeck =
      prevFootY >= deckTop - 1e-3 && prevFootY <= deckTop + PLATFORM_DECK_SLACK_PX;
    const descendingOntoDeck = nextFootY > prevFootY + 1e-3;
    const fromAirTileRow = prevFootTile < ty;
    if (alreadyGroundedOnDeck && !descendingOntoDeck && !fromAirTileRow) {
      return false;
    }
    return true;
  }

  private solidTileBlocksHorizontalWall(
    pose: HitboxPose,
    map: TileMap,
    tx: number,
    ty: number,
    prevFeet: JumpFoot.JumpFootProbe,
    predictedFeet: JumpFoot.JumpFootProbe,
  ): boolean {
    if (this.tileIsVerticalDeckContactThisStep(map, tx, ty, prevFeet, predictedFeet)) {
      return false;
    }
    if (this.tileIsSolidFloorLandingThisStep(map, tx, ty, prevFeet, predictedFeet)) {
      return false;
    }
    const deckTop = ty * TILE_SIZE;
    const feet = this.poseForFeetSupport().bounds();
    if (feet.y + feet.h >= deckTop - 1e-3 && feet.y + feet.h <= deckTop + PLATFORM_DECK_SLACK_PX) {
      return false;
    }
    if (map.isPlatformTile(tx, ty) && !this.dropsThroughOneWayPlatformTile(map, tx, ty)) {
      if (JumpFoot.eitherJumpFootNearDeck(pose, deckTop)) {
        return false;
      }
    }
    const pb = pose.bounds();
    const feetOnDeck =
      this.vy >= 0 &&
      pb.y + pb.h >= deckTop - 1e-3 &&
      pb.y + pb.h <= deckTop + PLATFORM_DECK_SLACK_PX + 1e-3;
    return !feetOnDeck;
  }

  private overlapsSolid(map: TileMap, pose: HitboxPose = this.hitboxPose()): boolean {
    const b = pose.bounds();
    const leftTile = Math.floor((b.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
    const topTile = Math.floor((b.y + 0.001) / TILE_SIZE);
    const bottomTile = Math.floor((b.y + b.h - 0.001) / TILE_SIZE);
    for (let ty = topTile; ty <= bottomTile; ty++) {
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!map.isSolidTile(tx, ty)) continue;
        const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
        if (pose.intersectsRect(tile)) return true;
      }
    }
    return false;
  }

  /** True if hitbox overlaps the given ladder column (for boss ascend / room transition). */
  overlapsLadderColumn(map: TileMap, columnTx: number): boolean {
    if (columnTx < 0) return false;
    if (this.ladderShaftBelowFeetPlatformInColumn(map, columnTx)) return true;
    if (!this.aabbOverlapsTileX(columnTx)) return false;
    const topTile = Math.floor((this.top() + 0.001) / TILE_SIZE);
    const bottomTile = Math.floor((this.bottom() - 0.001) / TILE_SIZE);
    for (let ty = topTile; ty <= bottomTile; ty++) {
      if (map.isLadderTile(columnTx, ty) && this.aabbOverlapsTile(columnTx, ty)) return true;
    }
    return false;
  }

  private aabbOverlapsTile(tx: number, ty: number): boolean {
    const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
    return this.hitboxPose().intersectsRect(tile);
  }

  private aabbOverlapsTileX(tx: number): boolean {
    const rx = tx * TILE_SIZE;
    const b = this.hitboxPose().bounds();
    return b.x + b.w > rx && b.x < rx + TILE_SIZE;
  }
}

/** Smash-style DI axis; diagonals normalized (Java PlayerControls.directionalInfluence). */
function directionalInfluence(input: Input): { dx: number; dy: number } | null {
  let dx = 0;
  let dy = 0;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0) {
    const s = 1 / Math.SQRT2;
    dx *= s;
    dy *= s;
  }
  return { dx, dy };
}

function mouthRungRowBelowDeck(map: TileMap, columnTx: number, mouthDeckTy: number): number {
  if (mouthDeckTy < 0 || !map.isPlatformTile(columnTx, mouthDeckTy)) return -1;
  const rungTy = mouthDeckTy + 1;
  if (rungTy < map.height && map.isLadderTile(columnTx, rungTy)) return rungTy;
  return -1;
}

function mouthDeckRowAboveRung(map: TileMap, columnTx: number, rungTy: number): number {
  if (rungTy <= 0 || !map.isLadderTile(columnTx, rungTy)) return -1;
  const deckTy = rungTy - 1;
  if (map.isPlatformTile(columnTx, deckTy)) return deckTy;
  return -1;
}

function ladderContinuesAboveDeck(map: TileMap, columnTx: number, deckTy: number): boolean {
  for (let ty = deckTy - 1; ty >= 0; ty--) {
    if (map.isLadderTile(columnTx, ty)) return true;
    if (map.isSolidTile(columnTx, ty) || map.isPlatformTile(columnTx, ty)) return false;
  }
  return false;
}

function ladderShaftInColumnFromRow(map: TileMap, columnTx: number, startTy: number): boolean {
  if (columnTx < 0 || columnTx >= map.width) return false;
  for (let ty = startTy; ty < map.height; ty++) {
    if (map.isLadderTile(columnTx, ty)) return true;
    if (map.isSolidTile(columnTx, ty) || map.isDoorTile(columnTx, ty)) break;
    if (map.isPlatformTile(columnTx, ty)) break;
  }
  return false;
}

function anyStrugglePressed(input: Input): boolean {
  return (
    input.jump ||
    input.attack ||
    input.subweapon ||
    input.up ||
    input.wasPressed("ArrowLeft") ||
    input.wasPressed("KeyA") ||
    input.wasPressed("ArrowRight") ||
    input.wasPressed("KeyD") ||
    input.wasPressed("ArrowDown") ||
    input.wasPressed("KeyS")
  );
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}
