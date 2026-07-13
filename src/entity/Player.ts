import {
  freezeFrames,
  type Aabb,
  type MeleeHitVfxTag,
  type WeaponStrike,
} from "../combat/CombatMath";
import { applyBlackHeartBursts } from "../combat/BlackHeartBurstCombat";
import {
  blackHeartOverlayAlpha as computeBlackHeartOverlayAlpha,
  type BlackHeartRetaliation,
  BLACK_HEART_RETALIATION_NONE,
  blackHeartRetaliationActive,
  resolveBlackHeartRetaliation,
  sampleBlackHeartScreenShake,
} from "../combat/BlackHeartDepletionBeat";
import { enemyIntersectsMelee } from "../combat/MeleeIntersection";
import type { AfterimageSpawnSnapshot } from "../combat/AfterimageGhost";
import { KuriboStompFx } from "../combat/KuriboStompFx";
import { WhipSim } from "../combat/whip/WhipSim";
import { WhipAimInput } from "../combat/whip/WhipAimInput";
import { WhipAnchorValues, type WhipAnchorStrip } from "../combat/whip/WhipAnchorValues";
import { WhipTuningValues } from "../combat/whip/WhipTuningValues";
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
  PROJECTILE_LEMON_SHOT_PIVOT_X,
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
  SCARF_FLOAT_GRAVITY_SCALE,
  SCARF_GLIDE_AIR_SPEED_BONUS,
  SCARF_AIR_CONTROL_MULT,
  PONCHO_FLAP_HEIGHT_PX,
  PONCHO_FLAP_FALLING_HEIGHT_PX,
  PONCHO_FLAP_COOLDOWN_FRAMES,
  PONCHO_FLAP_STRETCH_Y,
  PONCHO_FLAP_STRETCH_RECOVER_FRAMES,
  ponchoFlapUpwardVy,
  KURIBO_STOMP_BOUNCE_JUMP_FRAC,
  KURIBO_STOMP_BOUNCE_JUMP_HELD_FRAC,
  KURIBO_STOMP_HITSTUN_MULT,
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
import { DiscMechanics, HEAVY_ATTACK_DAMAGE_MULT, type DiscMechanicsHost } from "./DiscMechanics";
import { HeelysMechanics, SKATE_STEER_STRIDE_HOLD_MULT } from "./HeelysMechanics";
import type { LemonShotHost } from "./LemonShotHost";
import { swordKnockbackKind, swordMeleeHitboxPose, shieldAttackWindupHitboxPose, shieldBlockHitboxPose } from "./WeaponHitbox";
import { FrisbeeAimSnapshot } from "./FrisbeeAimSnapshot";
import type { GardeningGlovesHost } from "../carry/GardeningGlovesHost";
import type { IceBlock } from "../entity/IceBlock";
import { feetOnIce, intersectsAnyIce, landingDeckTopY } from "../combat/IceBlockSupport";
import { ICE_TRACTION_MULT } from "../combat/IceBlockFx";
import { PlayerCarry, type PluckInstantPreview } from "../carry/PlayerCarry";
import type { CarryPayload } from "../carry/CarryPayload";
import { PlayerStats } from "./PlayerStats";
import type { SubweaponHost } from "./SubweaponHost";
import { SquashStretch } from "../render/SquashStretch";
import type { VernanPosePack } from "../vernan/VernanPosePack";
import { posePackAnimKey } from "../vernan/VernanPosePack";
import {
  vernanAnimCueApplyVx,
  vernanAnimCueApplyVy,
  type VernanAnimCue,
} from "../vernan/VernanAnimCue";
import { VernanAnimCueRuntime } from "../vernan/VernanAnimCueRuntime";
import {
  DEFAULT_SHAKE_AMPLITUDE_PX,
  HURT_TINT_PEAK_ALPHA,
  HURT_TINT_SECONDS,
  sampleShake,
} from "../combat/HitlagState";

const BORED_SQUASH_X = 1.2;
const BORED_SQUASH_RECOVER_FRAMES = 10;
const BORED_ENTER_IDLE_SEC = 5;
const BORED_ANIM_FPS = 6;
const BORED_PACK_SWAP_SEC = 8;
const IDLE_BLINK_FRAMES = 8;
const IDLE_BLINK_COOLDOWN_MIN_SEC = 2.2;
const IDLE_BLINK_COOLDOWN_MAX_SEC = 5.5;

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
  private tickIceBlocks: readonly IceBlock[] = [];
  private tickFeetOnIce = false;
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
  /** Late-recover phase cue fires once when sheet frame reaches 3 (Java attackLateRecoverCueFired). */
  private attackLateRecoverCueFired = false;
  landingLockFrames = 0;
  hitlagFrames = 0;
  /** True when crouch height is active (for art). */
  crouching = false;

  /** Sit / leg-swing idle (Java boredPoseActive). */
  private boredPoseActive = false;
  private boredPosePackId: VernanPosePack = "A";
  private boredAnimPhaseSec = 0;
  private boredPackSwapSec = 0;
  private boredIdleAccumSec = 0;
  private idleBlinkFramesLeft = 0;
  private idleBlinkCooldownSec = 3;

  /** Subweapon throw anim (Java subweaponAnimPhase / frame ticks). */
  private subweaponAnimPhase = 0;
  private subweaponFrameIndex = 0;
  private subweaponFrameTimeLeft = 0;
  private subweaponSpawnFired = false;
  private subweaponStartedOnGround = true;
  private subweaponAttack0Strip = false;
  private kCandyWhiteFlashSec = 0;
  private readonly frisbeeAimSnapshot = new FrisbeeAimSnapshot();
  private readonly carry = new PlayerCarry();
  private tickGardeningHost: GardeningGlovesHost | null = null;
  private static readonly SUBWEAPON_SPECIAL_FRAME_TICKS = [6, 6, 4, 10, 10];
  private static readonly SUBWEAPON_ATTACK0_FRAME_TICKS = [6, 4, 10, 6];
  private static readonly SUBWEAPON_SPAWN_OFF_X = 3;
  private static readonly SUBWEAPON_SPAWN_OFF_Y = 5;
  private static readonly LEMON_SPAWN_OFF_Y_CROUCH = -7;
  private static readonly LEMON_SPAWN_OFF_Y_STAND = -7;

  readonly headband = new HeadbandCombat();
  readonly disc = new DiscMechanics();
  readonly heelys = new HeelysMechanics();
  readonly whipSim = new WhipSim();
  private readonly whipAimInput = new WhipAimInput();
  private whipWiggleActive = false;
  /** Per-enemy wiggle hit cooldown (Java IdentityHashMap). */
  private readonly whipWiggleHitCooldown = new Map<CombatEnemy, number>();
  private kuriboStompAllowed = true;
  private kuriboHopClearedSinceStomp = false;
  private kuriboStompAwaitingApexAfterBounce = false;
  private pendingKuriboBounce = false;
  /** Leftover air-dodge i-frames banked on stomp; applied after bounce (Java pendingKuriboMigratedIFrames). */
  private pendingKuriboMigratedIFrames = 0;
  private kuriboMigratedIFrames = 0;
  private kuriboMigratedFlashFrame = 0;
  /** PONCHO mid-air flap cooldown (frames). */
  private ponchoFlapCooldown = 0;
  /** CRAWLER_HAT: blocks jump / poncho while mounted (set by mount). */
  crawlerHatBlockJump = false;
  swordVisual: SwordVisual = "default";
  private swordDamageMult = 1;
  private swordTimingScale = 1;
  gemSwordStacks = 0;
  shieldStacks = 0;
  attackStickFrameW = 48;
  private flintIgniteCallback: ((enemy: CombatEnemy) => void) | null = null;
  private smokePuffCallback: ((enemy: CombatEnemy) => void) | null = null;
  private afterimageSpawnHost: ((snap: AfterimageSpawnSnapshot) => void) | null = null;
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
  /** One follow-through frame after finish keeping latch direction (Java getupPostLatchFrames). */
  private getupPostLatchFrames = 0;
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
  /** Black-heart break: full-screen shake + overlay fade (Java blackHeartBeatFramesRemaining). */
  private blackHeartBeatFramesRemaining = 0;
  private blackHeartBeatFrameTotal = 0;
  private blackHeartShakeDeviceX = 0;
  private blackHeartShakeDeviceY = 0;
  private tickCombatEnemies: readonly CombatEnemy[] = [];
  /** Optional callback when black-heart bursts land (mount spawns HitVfx). */
  onBlackHeartBurstHit?: (enemy: CombatEnemy, strike: WeaponStrike) => void;
  /** Per-frame combat hooks from mount (HitVfx / breakables); cleared each tick. */
  private frameMeleeHit:
    | ((
        enemy: CombatEnemy,
        strike: WeaponStrike,
        sword: Aabb,
        vfx: MeleeHitVfxTag,
      ) => void)
    | null = null;
  private frameElectrocution:
    | ((
        enemy: CombatEnemy,
        strike: WeaponStrike,
        contact: { x: number; y: number },
      ) => void)
    | null = null;
  /** World strike (breakables + ice); returns freeze frames. */
  private frameWorldStrike: (() => number) | null = null;

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
  /** Left/right held this tick (Java horizontalSteerHeld) — coast walk pose + jump speed. */
  private horizontalSteerHeld = false;
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
  private pendingLandingDustQueue = false;
  private pendingLandingDustPuffCount: number | null = null;
  private pendingLandingDustBehindX: number | null = null;
  private pendingLandingDustBehindY: number | null = null;
  private hurtAirAnimAccum = 0;
  private hurtAirFrame = 0;

  /** Nephilim grab hold — movement/attack skipped while true. */
  private grabHeld = false;
  /** Set when horizontal resolve zeros vx against a wall this step (disc02 wall slide). */
  horizontalWallContactResolvedThisStep = false;
  horizontalWallContactSide = 0;
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
    this.cancelBoredPose();
    this.idleBlinkFramesLeft = 0;
    this.idleBlinkCooldownSec = 3;
    this.shyMaskCharge.reset();
    this.heelys.reset();
    this.ponchoFlapCooldown = 0;
    this.crawlerHatBlockJump = false;
    this.duckHeld = false;
    this.hitlagShakeX = 0;
    this.hitlagShakeY = 0;
    this.hitlagSolidRed = false;
    this.hurtTintRemaining = 0;
    this.wasCrouching = false;
    this.pendingHurtKnockbackHalved = false;
    this.pendingKuriboBounce = false;
    this.pendingKuriboMigratedIFrames = 0;
    this.kuriboMigratedIFrames = 0;
    this.kuriboMigratedFlashFrame = 0;
    this.clearBlackHeartBeat();
  }

  /** Screen-space shake while black-heart depletion juice is active (device px). */
  blackHeartScreenShakeDeviceX(): number {
    return this.blackHeartShakeDeviceX;
  }

  blackHeartScreenShakeDeviceY(): number {
    return this.blackHeartShakeDeviceY;
  }

  blackHeartOverlayAlpha(): number {
    return computeBlackHeartOverlayAlpha(
      this.blackHeartBeatFramesRemaining,
      this.blackHeartBeatFrameTotal,
    );
  }

  private beginBlackHeartBeat(frameCount: number): void {
    this.blackHeartBeatFramesRemaining = Math.max(this.blackHeartBeatFramesRemaining, frameCount);
    this.blackHeartBeatFrameTotal = Math.max(this.blackHeartBeatFrameTotal, frameCount);
  }

  private tickBlackHeartBeat(enemies: readonly CombatEnemy[]): void {
    if (this.blackHeartBeatFramesRemaining <= 0) {
      this.blackHeartShakeDeviceX = 0;
      this.blackHeartShakeDeviceY = 0;
      return;
    }
    const shake = sampleBlackHeartScreenShake(
      this.blackHeartBeatFramesRemaining,
      this.blackHeartBeatFrameTotal,
    );
    this.blackHeartShakeDeviceX = shake.x;
    this.blackHeartShakeDeviceY = shake.y;
    this.blackHeartBeatFramesRemaining--;
    if (this.blackHeartBeatFramesRemaining <= 0) {
      this.blackHeartShakeDeviceX = 0;
      this.blackHeartShakeDeviceY = 0;
      this.blackHeartBeatFrameTotal = 0;
      this.releaseBlackHeartBeatKnockbacks(enemies);
    }
  }

  private releaseBlackHeartBeatKnockbacks(enemies: readonly CombatEnemy[]): void {
    for (const enemy of enemies) {
      enemy.releaseBlackHeartBeatKnockback?.();
    }
  }

  private clearBlackHeartBeat(): void {
    this.blackHeartBeatFramesRemaining = 0;
    this.blackHeartBeatFrameTotal = 0;
    this.blackHeartShakeDeviceX = 0;
    this.blackHeartShakeDeviceY = 0;
  }

  private dispatchBlackHeartRetaliation(): BlackHeartRetaliation {
    const blackHeartsLost = this.health.consumeBlackHeartsEmptied();
    const retaliation = resolveBlackHeartRetaliation(
      blackHeartsLost,
      this.stats.heartOfDarknessStacks > 0,
    );
    if (blackHeartRetaliationActive(retaliation) && this.tickCombatEnemies.length > 0) {
      applyBlackHeartBursts(
        retaliation.burstCount,
        retaliation.config,
        this.tickCombatEnemies,
        this.x,
        this.w,
        this.facing,
        this.onBlackHeartBurstHit,
      );
    }
    return retaliation;
  }

  private notifyItemEffectsOnPlayerDamageApplied(damageDealt: number): void {
    KaleidoscopeEyeCombat.notifyPlayerDamageApplied();
    LeotardCombat.notifyPlayerDamageApplied(damageDealt);
  }

  private applyPlayerHealthDamage(
    amount: number,
    invulnSeconds: number,
  ): { applied: boolean; retaliation: BlackHeartRetaliation } {
    if (!this.health.tryDamage(amount, invulnSeconds)) {
      return { applied: false, retaliation: BLACK_HEART_RETALIATION_NONE };
    }
    if (this.health.isDead) {
      this.carry.onHurtOrDeath(this, this.tickGardeningHost, true);
    }
    this.notifyItemEffectsOnPlayerDamageApplied(amount);
    return { applied: true, retaliation: this.dispatchBlackHeartRetaliation() };
  }

  private applyPlayerHealthDamageIgnoringInvuln(
    amount: number,
  ): { applied: boolean; retaliation: BlackHeartRetaliation } {
    if (!this.health.tryDamageIgnoringInvuln(amount)) {
      return { applied: false, retaliation: BLACK_HEART_RETALIATION_NONE };
    }
    if (this.health.isDead) {
      this.carry.onHurtOrDeath(this, this.tickGardeningHost, true);
    }
    this.notifyItemEffectsOnPlayerDamageApplied(amount);
    return { applied: true, retaliation: this.dispatchBlackHeartRetaliation() };
  }

  private beginDefensiveHitstunForDamage(
    baseFreezeFrames: number,
    hurtKnockSign: number,
    retaliation: BlackHeartRetaliation,
  ): void {
    this.shyMaskCharge.reset();
    if (blackHeartRetaliationActive(retaliation)) {
      const frames = retaliation.config.frameCount;
      this.beginDefensiveHitstun(frames, hurtKnockSign);
      this.beginBlackHeartBeat(frames);
    } else {
      this.beginDefensiveHitstun(baseFreezeFrames, hurtKnockSign);
    }
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

  /** Java usesJumpCollisionHull — normal jump + headband up/side airborne hull. */
  usesJumpCollisionHull(): boolean {
    if (this.headband.usesJumpCollisionHull() && !this.climbing && !this.crouchJumpMode) {
      return true;
    }
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

  private attackCommitLock(): boolean {
    return (
      this.attackPhase === 2 ||
      this.attackPhase === 3 ||
      this.headband.isActive() ||
      (this.disc.isHeavyActive() && this.disc.heavyFacingLocked())
    );
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
   * Mount registers HitVfx / world-strike callbacks for this sim tick
   * (Java applyAttackHits worldStrike + panel HitVfx).
   */
  bindFrameCombatHooks(hooks: {
    onMeleeHit?: (
      enemy: CombatEnemy,
      strike: WeaponStrike,
      sword: Aabb,
      vfx: MeleeHitVfxTag,
    ) => void;
    onElectrocution?: (
      enemy: CombatEnemy,
      strike: WeaponStrike,
      contact: { x: number; y: number },
    ) => void;
    tryWorldStrike?: () => number;
  } | null): void {
    this.frameMeleeHit = hooks?.onMeleeHit ?? null;
    this.frameElectrocution = hooks?.onElectrocution ?? null;
    this.frameWorldStrike = hooks?.tryWorldStrike ?? null;
  }

  /**
   * While sim is frozen (timestop / zero substeps), still prime jump/dodge buffers
   * from press edges so taps during a hitch aren't lost (Java primeLagInputBuffers).
   * Attack is edge-driven in updateAttack — not buffered here.
   */
  primeLagInputBuffers(input: Input): void {
    if (this.blocksJumpInput()) return;
    if (input.jumpPressed) this.jumpBufferTimer = JUMP_BUFFER;
    if (input.dodgePressed) this.disc.primeDodgeBufferFromLag();
  }

  /** Carry or headband currently blocks jump priming (Java blocksJumpInput). */
  private blocksJumpInput(): boolean {
    return this.carry.blocksJump() || this.headband.isActive();
  }

  update(
    dt: number,
    input: Input,
    map: TileMap,
    subweaponHost: SubweaponHost | null = null,
    pedestalPlatforms: Aabb[] | null = null,
    enemies: readonly CombatEnemy[] = [],
    gardeningHost: GardeningGlovesHost | null = null,
  ): void {
    this.tickPedestalPlatforms = pedestalPlatforms;
    this.tickCombatEnemies = enemies;
    this.tickGardeningHost = gardeningHost;
    this.horizontalWallContactResolvedThisStep = false;
    this.health.update(dt);
    this.tickHurtTint(dt);
    this.squash.tick(dt);
    this.tickBlackHeartBeat(enemies);
    this.tickKuriboMigratedIFrames();

    this.prevPedestalGroundContact = this.tickPedestalGroundContact;
    this.wasOnGround = this.onGround;
    this.justLanded = false;
    this.landedThisTick = false;

    // Offensive + defensive timers tick together while !hurtLocked (Java combat freeze).
    // No early-return on offensive alone — that stacked freezes and blocked grab/Kuribo.
    if (!this.hurtLocked) {
      const prevOff = this.hitlagFrames;
      const prevDef = this.defensiveHitstunRemaining;
      if (this.hitlagFrames > 0) this.hitlagFrames--;
      this.defensiveHitstunRemaining = Math.max(0, this.defensiveHitstunRemaining - dt);
      if (prevOff > 0 && this.hitlagFrames <= 0 && this.pendingKuriboBounce) {
        this.finishPendingKuriboBounce(input);
      }
      // Visual hitlag is only for getting hit (defensive), not hits Vernan lands.
      if (this.defensiveHitstunRemaining > 0) {
        this.hitlagSolidRed = true;
        this.hitlagShakeX = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
        this.hitlagShakeY = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
      } else {
        this.hitlagSolidRed = false;
        this.hitlagShakeX = 0;
        this.hitlagShakeY = 0;
      }
      if (
        prevDef > 0 &&
        this.defensiveHitstunRemaining <= 0 &&
        this.pendingHurtKnockSign !== 0
      ) {
        const sign = this.pendingHurtKnockSign;
        this.pendingHurtKnockSign = 0;
        this.hitlagSolidRed = false;
        this.hitlagShakeX = 0;
        this.hitlagShakeY = 0;
        this.startHurtReaction(sign, input, map);
      } else if (this.defensiveHitstunRemaining > 0) {
        this.tickHurtAirAnim(dt);
      }
    }

    // Hurt knockback lock: gravity + collide only until land (Java hurtLocked early return).
    if (this.hurtLocked) {
      this.hitlagSolidRed = false;
      this.hitlagShakeX = 0;
      this.hitlagShakeY = 0;
      this.updateHurtLocked(dt, map, input.jump);
      this.tickHurtAirAnim(dt);
      return;
    }

    // Clear one-frame render hold at tick start (Java); pose draw used the prior frame.
    if (this.getupRenderHold) {
      this.getupRenderHold = false;
    }

    // Grab hold runs even during drink-sip defensive hitstun (Java order).
    if (this.tickEnemyGrab(dt, input, enemies, map)) {
      this.tickAnim(dt);
      return;
    }

    // Shared combat freeze: offensive hitlag and/or defensive stun (Java combatFreeze).
    const combatFreeze =
      this.hitlagFrames > 0 || this.defensiveHitstunRemaining > 0;
    if (combatFreeze) {
      this.disc.tickDodgeBuffer(dt, input, this.discHost());
      this.disc.tickHeavyScreenShake();
      // Java still applies slide / headband-side hits during combat freeze.
      this.applyCombatFreezeHits();
      this.tickAnim(dt);
      return;
    }

    // Java: clear jump buffer/squat when carry/headband blocks jump.
    if (this.blocksJumpInput()) {
      if (this.jumpSquatRemaining > 0) {
        this.jumpSquatRemaining = 0;
        this.shyMaskCharge.cancelSuperJumpWindup();
      }
      this.jumpBufferTimer = 0;
    }

    const getupMoveLock = this.getupLockFrames > 0;
    const getupActionLock = getupMoveLock;
    const landingLocked =
      this.landingLockFrames > 0 && this.onGround && this.jumpSquatRemaining === 0;
    let downRaw = input.down && !input.up;
    let upHeld = input.up;
    // Latch direction held through pose + one follow-through frame (Java).
    if (this.getupLockFrames > 0 || this.getupPostLatchFrames > 0) {
      if (this.getupLatchDown) {
        downRaw = true;
        upHeld = false;
      }
      if (this.getupLatchUp) {
        upHeld = true;
        downRaw = false;
      }
    }
    if (landingLocked && this.onGround && downRaw) this.crouchQueuedFromLanding = true;
    if (!landingLocked && !downRaw) this.crouchQueuedFromLanding = false;
    // Suppress Down during landing lock; apply queued crouch once lock ends.
    let crouchHeld =
      (!landingLocked && downRaw && !this.carry.blocksCrouch()) ||
      (!landingLocked && this.crouchQueuedFromLanding && this.onGround);

    // Mouth double-tap Down → mount getup (before crouch height).
    const mouthMountedThisTick = this.tickMouthDoubleTapMount(
      input,
      map,
      landingLocked,
      getupActionLock,
    );

    // Single Down on a mouth deck crouches; getup owns the drop (don't fall through).
    // One-ways stay solid while crouching — only mouth+walk-off uses dropsThroughOneWayPlatformTile (Java).
    this.jumpHeld = input.jump;
    this.duckHeld = downRaw;
    if (input.jumpReleased) this.disc.slideJumpReleasedSinceLast = true;

    this.disc.tickChordBuffers(dt, input, this.discHost());
    this.disc.tickDodgeBuffer(dt, input, this.discHost());

    // Pre-move combat (Java): whip + melee hits, then advance attack anim.
    this.updateWhipSim(dt, input, map);
    this.applyPreMoveCombatHits();
    this.disc.updateHeavy(dt, input, this.discHost());
    this.disc.tickHeavyScreenShake();
    this.updateAttack(dt, input);
    this.headband.tryBeginFromInput(input, this.headbandHost());
    this.headband.update(dt, input, this.headbandHost());

    const left = input.left;
    const right = input.right;
    this.horizontalSteerHeld = left || right;
    if (input.jumpPressed && !getupActionLock) {
      this.disc.tryWallJumpOnPress(dt, left, right, this.discHost());
    }
    // Jump buffer primes only on the free (non-combat-freeze) path (Java).
    if (
      input.jumpPressed &&
      !this.crawlerHatBlockJump &&
      !this.disc.slideActive &&
      !this.disc.wallSlideActive &&
      !this.disc.airDodgeActionLock() &&
      !getupActionLock &&
      !this.blocksJumpInput()
    ) {
      this.jumpBufferTimer = JUMP_BUFFER;
    } else if (this.jumpSquatRemaining === 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }
    if (!getupActionLock) {
      this.disc.trySlideFromChord(input, map, left, right, landingLocked, this.discHost());
      this.disc.tryAirDodgeFromBuffer(dt, input, map, left, right, this.discHost());
    }

    this.updateLemonShot(dt, input, subweaponHost);
    this.updateSubweaponAnim(dt, input, subweaponHost);
    this.carry.update(dt, input, this, gardeningHost, subweaponHost);

    // Ladder jump-off before movement (Java): immediate exit, no jumpsquat.
    if (!getupActionLock) {
      this.tryLadderJumpOff(input);
    }

    // SHY_MASK charge (Java shyMaskCharge.tick before jump).
    const shyMaskCanCharge =
      this.stats.shyMaskStacks > 0 &&
      this.attackPhase === 0 &&
      !this.isSubweaponAnimating() &&
      !this.climbing &&
      !getupActionLock &&
      !this.disc.slideActive &&
      !this.attackCommitLock() &&
      !this.disc.airDodgeActive &&
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

    // Crouch height before move (Java applyHitboxHeight before integrate).
    if (!this.climbing) {
      if (mouthMountedThisTick) {
        this.crouching = false;
      } else if (this.normalJumpAirborne && !this.crouchJumpMode) {
        this.crouching = false;
      } else {
        this.crouching = this.onGround && crouchHeld;
      }
      this.applyCrouchHeight(map);
      if (this.crouchJumpMode && !this.onGround) {
        this.crouching = true;
      }
    } else {
      this.crouching = false;
    }
    if (this.crouching && !this.wasCrouching) {
      VernanAnimCueRuntime.applyOnEnter(
        this.squash,
        (cue) => this.applyAnimCueImpulse(cue),
        "crouch",
        this.onGround,
      );
    }
    this.wasCrouching = this.crouching;

    if (getupMoveLock) {
      this.vx = 0;
      this.vy = 0;
    } else if (this.climbing) {
      this.cancelAttack();
      this.disc.cancelHeavyAttack();
      this.cancelSubweaponAnim();
      this.updateClimbMove(dt, input, map, upHeld, downRaw);
    } else {
      const steerDir = (left ? -1 : 0) + (right ? 1 : 0);
      this.disc.reconcileFullWavedashGround();
      this.disc.applyFullWavedashPendingAerial(this.discHost());
      this.disc.applyMovementOverrides(this.discHost(), steerDir);
      this.applyHorizontalIntent(dt, input, crouchHeld, landingLocked);
      const groundJumpClaimsJump =
        this.jumpBufferTimer > 0 && (this.onGround || this.coyoteTimer > 0);
      this.applyJumpLogic(dt, crouchHeld, map, left, right);
      this.applyPonchoAndScarfAirMobility(input, groundJumpClaimsJump);
      if (!this.disc.shouldSkipGravity(this.discHost())) {
        this.applyGravity(dt);
      }
    }

    const xBeforeMove = this.x;
    const wasOnGroundPreMove = this.wasOnGround;
    if (getupMoveLock || this.getupLockFrames > 0) {
      // Pose lock: no integrate (Java getupMoveLock + live lock after mid-tick beginGetup).
      this.vx = 0;
      this.vy = 0;
    } else if (!this.disc.runAirDodgeMoveStep(dt, map, this.discHost())) {
      this.disc.tickFullWavedashAroundMove(map, this.discHost());
      this.moveAndCollide(dt, map);
      this.disc.afterFullWavedashMove(map, this.discHost());
    }
    this.heelys.syncPumpOnMomentumStop(this.stats.heelysStacks, this.vx, this.stats);
    if (this.stats.heelysStacks > 0 && Math.abs(this.vx) > 1e-6 && this.onGround) {
      this.heelys.syncCoastCapFromSpeed(this.stats.heelysStacks, Math.abs(this.vx), this.stats);
    }
    this.disc.afterMove(
      dt,
      map,
      wasOnGroundPreMove,
      downRaw,
      xBeforeMove,
      left,
      right,
      (left ? -1 : 0) + (right ? 1 : 0),
      this.discHost(),
    );
    // Latch/clear uses post-collide pose (Java).
    this.updateClimbLatch(input, map, upHeld, downRaw);
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
    if (this.tickGardeningHost && this.carry.isThrowing()) {
      if (
        (this.carry.throwStartedOnGround() && wasOnGroundPreMove && !this.onGround) ||
        (!this.carry.throwStartedOnGround() && !wasOnGroundPreMove && this.onGround)
      ) {
        this.carry.cancelThrowOnGroundChange(this, this.tickGardeningHost, input);
      }
    }
    this.disc.onLeaveGroundWhileHeavy(wasOnGroundPreMove, this.onGround);
    this.headband.syncAirborneLatch(wasOnGroundPreMove, this.headbandHost());
    this.detectWalkOff();
    this.finishJumpSquat(map, dt, input);
    this.disc.tryBeginPendingHeavyAfterJumpSquat(this.discHost());
    this.tickExtendedFall(dt);
    const landSteer = (left ? -1 : 0) + (right ? 1 : 0);
    this.applyLandingFromTouchdown(landSteer);
    if (this.pendingLandingDustQueue) {
      this.queueLandingDust();
      this.pendingLandingDustQueue = false;
    }
    if (this.justLanded) {
      const recover = Math.max(1, this.landingLockFrames || SquashStretch.DEFAULT_RECOVER_FRAMES);
      VernanAnimCueRuntime.applyOnEnter(
        this.squash,
        (cue) => this.applyAnimCueImpulse(cue),
        "land",
        true,
        recover,
      );
    }

    // Getup countdown before contacts (Java getup → contacts → landing lock).
    if (this.getupLockFrames > 0) {
      this.vx = 0;
      this.vy = 0;
      this.climbing = false;
      this.getupLockFrames--;
      if (this.getupLockFrames === 0) {
        this.finishGetup(map);
      }
    }
    if (this.getupPostLatchFrames > 0) {
      this.getupPostLatchFrames--;
      if (this.getupPostLatchFrames === 0) {
        this.getupLatchDown = false;
        this.getupLatchUp = false;
      }
    }

    // Post-move contacts (Java applyEnemyContacts).
    this.applyEnemyContacts(
      this.tickCombatEnemies as CombatEnemy[],
      this.frameElectrocution ?? undefined,
    );

    this.tickLandingLock();
    this.applyLandingLockCrouchAndSlide(map, input, left, right);

    this.tickAnim(dt);
    this.tickHurtAirAnim(dt);
  }


  private updateWhipSim(dt: number, input: Input, map: TileMap): void {
    if (!this.usesWhip()) {
      if (this.whipSim.isActive()) {
        this.whipSim.reset();
        this.whipAimInput.reset();
      }
      this.whipWiggleActive = false;
      return;
    }
    const attackWindow = this.attackPhase !== 0;
    const heavyWindow = this.disc.isHeavyActive();
    if (!attackWindow && !heavyWindow) {
      this.whipSim.reset();
      this.whipAimInput.reset();
      this.whipWiggleActive = false;
      return;
    }
    const strip = this.whipAnchorStrip();
    const frame = this.whipFrameIndex();
    const frameW = this.whipFrameW();
    const frameH = this.whipFrameH();
    const feetWorld = this.y + this.h;
    const hand = WhipAnchorValues.handleWorld(
      strip, frame, frameW, frameH, this.x, this.w, feetWorld, this.facing,
    );
    const tipRest = WhipAnchorValues.tipRestWorld(
      strip, frame, frameW, frameH, this.x, this.w, feetWorld, this.facing,
    );
    if (!this.whipSim.isActive()) {
      this.whipAimInput.reset();
      this.whipAimInput.latchInitial(input);
      this.whipSim.beginSwing(hand[0], hand[1], tipRest[0], tipRest[1], this.inventory.stacksOf("WHIP"));
    }
    this.whipAimInput.sample(input);
    const crackAim = this.whipAimInput.resolve(
      this.facing, input.up, input.down, input.left, input.right,
    );
    const wiggleAxes = this.whipAimInput.resolveHeldAxes(
      input.up, input.down, input.left, input.right,
    );
    const combatActive = this.whipCombatActive();
    const atOrPastCrack = frame >= WhipAnchorValues.crackFrameIndex(strip);
    if (atOrPastCrack) this.whipSim.queueCrackImpulse();
    this.whipSim.step(
      dt, map, hand[0], hand[1], tipRest[0], tipRest[1],
      crackAim[0], crackAim[1], wiggleAxes[0], wiggleAxes[1],
      atOrPastCrack, combatActive, this.whipSim.isDeployed(),
    );
  }

  private whipCombatActive(): boolean {
    if (this.disc.isHeavyActive()) return this.heavyAttackFrameIndex() === 2;
    return this.attackPhase === 2;
  }

  private whipAnchorStrip(): WhipAnchorStrip {
    if (this.disc.isHeavyActive()) return "ATTACK1";
    if (this.groundCrouchAttack) return "CROUCH_ATTACK0";
    return "ATTACK0";
  }

  private whipFrameIndex(): number {
    if (this.disc.isHeavyActive()) return this.heavyAttackFrameIndex();
    return this.attackAnimFrameIndex();
  }

  /** Body strip cell size (Java attackBodyW / heavyAttackBodyW) — not sword overlay width. */
  private whipFrameW(): number {
    // attack0 / crouchattack0: 128×32 → 4×32; attack1: 512×48 → 8×64
    return this.disc.isHeavyActive() ? 64 : 32;
  }

  private whipFrameH(): number {
    return this.disc.isHeavyActive() ? 48 : 32;
  }

  /** Authored handle rotation for the current attack frame (world radians). */
  whipHandleRotRad(): number {
    if (!this.usesWhip()) return 0;
    return this.mirrorWhipRotRad(
      WhipAnchorValues.handleRotDeg(this.whipAnchorStrip(), this.whipFrameIndex()),
    );
  }

  /** Coiled tip rotation — authored on wind-up, procedural on later frames (world radians). */
  whipCoiledTipRotRad(): number {
    if (!this.usesWhip()) return 0;
    return this.mirrorWhipRotRad(
      WhipAnchorValues.tipRestRotDeg(this.whipAnchorStrip(), this.whipFrameIndex()),
    );
  }

  private mirrorWhipRotRad(textureDeg: number): number {
    const deg = this.facing < 0 ? -textureDeg : textureDeg;
    return (deg * Math.PI) / 180;
  }

  /**
   * Hold-X recover wiggle hits only (Java applyWhipWiggleHits).
   * Crack damage goes through {@link applyAttackHits} via whip {@link attackHitboxPose}.
   */
  applyWhipHits(enemies: CombatEnemy[]): number {
    if (!this.usesWhip() || !this.whipWiggleActive || !this.whipSim.isActive()) return 0;
    const pose = this.whipSim.hitboxPose();
    if (!pose) return 0;
    const sword = pose.bounds();
    let maxFreeze = 0;
    const baseDmg =
      this.effectiveOutgoingDamage(this.stats.outgoingDamage()) *
      (this.groundCrouchAttack ? CROUCH_ATTACK_DAMAGE_MULT : 1) *
      WhipSim.WIGGLE_DAMAGE_MULT;
    const knockKind = swordKnockbackKind(this.swordVisual, this.groundCrouchAttack);
    for (const e of enemies) {
      if (e.isDead()) continue;
      const cd = this.whipWiggleHitCooldown.get(e);
      if (cd != null && cd > 0) continue;
      if (!enemyIntersectsMelee(e, pose)) continue;
      const region = this.whipSim.hitRegionAgainst(e);
      if (region === "NONE") continue;
      const dmg = region === "TIP" ? baseDmg * WhipSim.TIP_DAMAGE_MULT : baseDmg;
      let ff = this.scaleOutgoingHitstun(freezeFrames(dmg));
      if (region === "TIP") ff += WhipSim.TIP_HITLAG_BONUS_FRAMES;
      const contact = contactBetweenHurtAndEnemy(sword, e.rect());
      const strike: WeaponStrike = {
        damage: dmg,
        freezeFrames: ff,
        attackerX: this.x,
        attackerW: this.w,
        facing: this.facing,
        knockKind,
        contactWorldX: contact.x,
        contactWorldY: contact.y,
      };
      if (e.applyWeaponStrike(strike)) {
        maxFreeze = Math.max(maxFreeze, ff);
        AutismCombat.notifyPlayerDamageDealt(e, dmg);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, dmg);
        this.applySwordHitItemProcs(e);
        this.whipWiggleHitCooldown.set(e, WhipTuningValues.WIGGLE_HIT_COOLDOWN_SEC);
        this.frameMeleeHit?.(e, strike, sword, region === "TIP" ? "slash" : "fallback");
      }
    }
    if (maxFreeze > 0) this.hitlagFrames = Math.max(this.hitlagFrames, maxFreeze);
    const step = 1 / FIXED_STEP_HZ;
    for (const [e, cd] of this.whipWiggleHitCooldown) {
      const next = cd - step;
      if (next <= 0) this.whipWiggleHitCooldown.delete(e);
      else this.whipWiggleHitCooldown.set(e, next);
    }
    return maxFreeze;
  }

  /** Gravity + collide while hurt-locked; unlock on land. */
  private updateHurtLocked(dt: number, map: TileMap, jumpHeldHurt: boolean): void {
    this.cancelAttack();
    this.jumpSquatRemaining = 0;
    // Sample after knock forces airborne (Java local wasOnGround inside hurtLocked block).
    const wasOnGround = this.onGround;
    const scarfFloatLocked =
      this.stats.pinkScarfStacks > 0 && this.vy > 0 && jumpHeldHurt;
    const gLocked = GRAVITY * (scarfFloatLocked ? SCARF_FLOAT_GRAVITY_SCALE : 1);
    this.vy += gLocked * dt;
    const capLocked = MAX_FALL * (scarfFloatLocked ? SCARF_FLOAT_GRAVITY_SCALE : 1);
    if (this.vy > capLocked) this.vy = capLocked;
    this.moveAndCollide(dt, map);
    this.heelys.syncPumpOnMomentumStop(this.stats.heelysStacks, this.vx, this.stats);
    if (this.overlapsSolid(map, this.collisionPoseAt(this.x, this.y))) {
      this.nudgeCollisionPoseOutOfSolids(map);
    }
    if (!wasOnGround && this.onGround) {
      if (this.normalJumpAirborne && !this.crouchJumpMode && !this.climbing) {
        this.finishJumpLandingCollision(map);
      }
      this.normalJumpAirborne = false;
      this.hurtLocked = false;
      this.hurtAirAnimAccum = 0;
      this.hurtAirFrame = 0;
    }
    // Still take contact checks during hurt knockback (Java); iframes gate damage.
    this.applyEnemyContacts(
      this.tickCombatEnemies as CombatEnemy[],
      this.frameElectrocution ?? undefined,
    );
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
  /** Stand feet hull for ice / deck probes (Java poseForFeetSupport). */
  feetSupportBounds(): Aabb {
    return this.poseForFeetSupport().bounds();
  }

  private poseForFeetSupport(): HitboxPose {
    if (this.usesJumpCollisionHull()) {
      return this.standCollisionPoseAt(this.x, this.y);
    }
    return this.hitboxPose();
  }

  /** Mouth ladder drop-through only — not every one-way while walk-off (Java). */
  private dropsThroughOneWayPlatformTile(map: TileMap, tx: number, ty: number): boolean {
    if (this.carry.blocksOneWayDrop()) return false;
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
    return this.landingLockFrames > 0 && this.onGround && this.jumpSquatRemaining === 0;
  }

  /** True while mount/dismount getup movement lock is active (Java isGetupLocked). */
  isGetupLocked(): boolean {
    return this.getupLockFrames > 0;
  }

  /** True while the getup strip should draw (includes one post-finish hold frame). */
  isGetupPoseActive(): boolean {
    return this.getupLockFrames > 0 || this.getupRenderHold;
  }

  /** Getup sheet frame 0..n-1 from remaining lock (Java draw path). */
  getupAnimFrameIndex(frameCount: number): number {
    if (frameCount <= 1) return 0;
    const remaining =
      this.getupLockFrames > 0 ? this.getupLockFrames : this.getupRenderHold ? 1 : 0;
    const elapsed = GETUP_LOCK_FRAMES - remaining;
    return Math.max(0, Math.min(frameCount - 1, elapsed));
  }

  isAttacking(): boolean {
    return this.attackPhase !== 0 || this.headband.isActive() || this.disc.isHeavyActive();
  }

  isLemonPoseActive(): boolean {
    return this.lemonPoseSecondsRemaining > 0;
  }

  isBoredPoseActive(): boolean {
    return this.boredPoseActive;
  }

  boredPosePack(): VernanPosePack {
    return this.boredPosePackId;
  }

  boredAnimFrameIndex(frameCount: number): number {
    const count = Math.max(1, frameCount);
    const frame = Math.floor(this.boredAnimPhaseSec * BORED_ANIM_FPS) % count;
    return Math.max(0, frame);
  }

  beginBoredPose(pack: VernanPosePack = "A"): void {
    this.boredPoseActive = true;
    this.boredPosePackId = pack;
    this.boredAnimPhaseSec = 0;
    this.boredPackSwapSec = 0;
    this.boredIdleAccumSec = 0;
    this.squash.applyStretchX(BORED_SQUASH_X, BORED_SQUASH_RECOVER_FRAMES);
  }

  setBoredPosePack(pack: VernanPosePack): void {
    this.boredPosePackId = pack;
  }

  cancelBoredPose(): void {
    this.boredPoseActive = false;
    this.boredIdleAccumSec = 0;
    this.boredAnimPhaseSec = 0;
    this.boredPackSwapSec = 0;
  }

  /** Advance bored sit + idle blink (Java GamePanel tickBoredPose / tickIdleBlink). */
  tickBoredAndIdleBlink(
    dt: number,
    opts: {
      boredReady: boolean;
      idleBlinkReady: boolean;
      packBlinkReady: (packKey: string) => boolean;
      packReady: (pack: VernanPosePack) => boolean;
    },
  ): void {
    this.tickIdleBlink(dt, opts);
    this.tickBoredPose(dt, opts);
  }

  private tickIdleBlink(
    dt: number,
    opts: {
      idleBlinkReady: boolean;
      packBlinkReady: (packKey: string) => boolean;
    },
  ): void {
    if (this.idleBlinkFramesLeft > 0) {
      this.idleBlinkFramesLeft--;
      return;
    }
    if (!this.canIdleBlink()) return;
    this.idleBlinkCooldownSec -= dt;
    if (this.idleBlinkCooldownSec > 0) return;
    if (opts.idleBlinkReady) {
      this.idleBlinkFramesLeft = IDLE_BLINK_FRAMES;
    } else if (this.boredPoseActive) {
      const packKey = posePackAnimKey("bored", this.boredPosePackId);
      if (opts.packBlinkReady(packKey)) {
        this.idleBlinkFramesLeft = IDLE_BLINK_FRAMES;
      }
    }
    const span = IDLE_BLINK_COOLDOWN_MAX_SEC - IDLE_BLINK_COOLDOWN_MIN_SEC;
    this.idleBlinkCooldownSec = IDLE_BLINK_COOLDOWN_MIN_SEC + Math.random() * span;
  }

  private tickBoredPose(
    dt: number,
    opts: {
      boredReady: boolean;
      packReady: (pack: VernanPosePack) => boolean;
    },
  ): void {
    if (!opts.boredReady) {
      this.cancelBoredPose();
      return;
    }
    if (!this.canEnterOrHoldBoredPose()) {
      this.cancelBoredPose();
      return;
    }
    if (this.boredPoseActive) {
      this.boredAnimPhaseSec += dt;
      this.boredPackSwapSec += dt;
      if (this.boredPackSwapSec >= BORED_PACK_SWAP_SEC) {
        this.boredPackSwapSec = 0;
        const next: VernanPosePack = this.boredPosePackId === "A" ? "B" : "A";
        if (opts.packReady(next)) {
          this.boredPosePackId = next;
        }
      }
      return;
    }
    this.boredIdleAccumSec += dt;
    if (this.boredIdleAccumSec < BORED_ENTER_IDLE_SEC) return;
    let pack: VernanPosePack = "A";
    if (!opts.packReady("A") && opts.packReady("B")) pack = "B";
    if (!opts.packReady(pack) && !opts.boredReady) return;
    this.beginBoredPose(pack);
  }

  private canIdleBlink(): boolean {
    if (this.isGrabHeld()) return false;
    if (this.heelys.isGlidePoseHold()) return false;
    if (!this.onGround || this.crouching || this.isAttacking()) return false;
    if (this.climbing || this.isHurtLocked() || this.walkOffLedgeActive) return false;
    if (this.disc.wallSlideActive) return false;
    if (this.usesJumpCollisionHull()) return false;
    return Math.abs(this.vx) <= 8;
  }

  private canEnterOrHoldBoredPose(): boolean {
    if (!this.canIdleBlink()) return false;
    if (this.isLemonPoseActive()) return false;
    if (this.carryHoldOverhead() || this.isCarryHolding()) return false;
    if (this.isGetupPoseActive()) return false;
    return true;
  }

  idleBlinkFrameActive(costumeState: string): boolean {
    if (this.idleBlinkFramesLeft <= 0) return false;
    if (costumeState === "IDLE") return true;
    if (costumeState === "BORED") return true;
    return false;
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
    // Java: slide / air dodge / isAttacking (light, headband, or disc04 attack1 heavy).
    if (this.disc.slideActive || this.disc.airDodgeActive || this.isAttacking()) return -1;
    if (this.crouching || this.isCrouchJumpMode() || this.isJumpSquatting() || this.isLandingLocked()) {
      return 1;
    }
    return 0;
  }

  /** shield player.png frame for draw (-1 = hidden). Includes climb frames 2–3. */
  shieldOverlayFrameIndex(climbAnimMod2 = 0): number {
    if (this.shieldStacks <= 0) return -1;
    // Java: slide / air dodge / isAttacking (light, headband, or disc04 attack1 heavy).
    if (this.disc.slideActive || this.disc.airDodgeActive || this.isAttacking()) return -1;
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

  setSmokePuffCallback(cb: ((enemy: CombatEnemy) => void) | null): void {
    this.smokePuffCallback = cb;
  }

  setAfterimageSpawnHost(cb: ((snap: AfterimageSpawnSnapshot) => void) | null): void {
    this.afterimageSpawnHost = cb;
  }

  applySwordHitItemProcsPublic(enemy: CombatEnemy): void {
    this.applySwordHitItemProcs(enemy);
  }

  setGemSwordHitCallback(cb: ((enemy: CombatEnemy) => void) | null): void {
    this.gemSwordHitCallback = cb;
  }

  get offensiveHitlagRemaining(): number {
    return this.hitlagFrames / 60;
  }

  private headbandHost(): import("./HeadbandCombat").HeadbandCombatHost {
    const p = this;
    return {
      get onGround() { return p.onGround; },
      get crouching() { return p.crouching; },
      get facing() { return p.facing; },
      set facing(v: number) { p.facing = v; },
      get x() { return p.x; },
      get y() { return p.y; },
      get w() { return p.w; },
      get h() { return p.h; },
      get landingLockFrames() { return p.landingLockFrames; },
      get getupLockFrames() { return p.getupLockFrames; },
      get climbing() { return p.climbing; },
      get attackPhase() { return p.attackPhase; },
      get normalJumpAirborne() { return p.normalJumpAirborne; },
      set normalJumpAirborne(v: boolean) { p.normalJumpAirborne = v; },
      get crouchJumpMode() { return p.crouchJumpMode; },
      set crouchJumpMode(v: boolean) { p.crouchJumpMode = v; },
      get walkOffLedgeActive() { return p.walkOffLedgeActive; },
      set walkOffLedgeActive(v: boolean) { p.walkOffLedgeActive = v; },
      stats: this.stats,
      attackTimingScale: () => this.attackTimingScale(),
      isSubweaponAnimating: () => this.isSubweaponAnimating(),
      swordVisual: this.swordVisual,
      inventory: this.inventory,
      get offensiveHitlagRemaining() { return p.offensiveHitlagRemaining; },
      fireAnimCueStrip: (key, idx, prior, startedOnGround) =>
        p.fireAnimCueStrip(key, idx, prior, startedOnGround),
    };
  }

  private readonly landingLockMutable = { value: 0 };

  private discHost(): DiscMechanicsHost {
    const p = this;
    this.landingLockMutable.value = this.landingLockFrames;
    return {
      get x() { return p.x; },
      set x(v: number) { p.x = v; },
      get y() { return p.y; },
      set y(v: number) { p.y = v; },
      get w() { return p.w; },
      get h() { return p.h; },
      get vx() { return p.vx; },
      set vx(v: number) { p.vx = v; },
      get vy() { return p.vy; },
      set vy(v: number) { p.vy = v; },
      get facing() { return p.facing; },
      set facing(v: number) { p.facing = v; },
      get onGround() { return p.onGround; },
      set onGround(v: boolean) { p.onGround = v; },
      get crouching() { return p.crouching; },
      set crouching(v: boolean) { p.crouching = v; },
      get climbing() { return p.climbing; },
      set climbing(v: boolean) { p.climbing = v; },
      hurtLocked: p.hurtLocked,
      grabHeld: p.grabHeld,
      get landingLockFrames() { return p.landingLockFrames; },
      getupLockFrames: p.getupLockFrames,
      get jumpSquatRemaining() { return p.jumpSquatRemaining; },
      set jumpSquatRemaining(v: number) { p.jumpSquatRemaining = v; },
      get jumpBufferTimer() { return p.jumpBufferTimer; },
      set jumpBufferTimer(v: number) { p.jumpBufferTimer = v; },
      get coyoteTimer() { return p.coyoteTimer; },
      set coyoteTimer(v: number) { p.coyoteTimer = v; },
      attackPhase: p.attackPhase,
      get normalJumpAirborne() { return p.normalJumpAirborne; },
      set normalJumpAirborne(v: boolean) { p.normalJumpAirborne = v; },
      get crouchJumpMode() { return p.crouchJumpMode; },
      set crouchJumpMode(v: boolean) { p.crouchJumpMode = v; },
      get walkOffLedgeActive() { return p.walkOffLedgeActive; },
      set walkOffLedgeActive(v: boolean) { p.walkOffLedgeActive = v; },
      get jumpHeld() { return p.jumpHeld; },
      set jumpHeld(v: boolean) { p.jumpHeld = v; },
      get feetOnIce() { return p.tickFeetOnIce; },
      get crawlerHatBlockJump() { return p.crawlerHatBlockJump; },
      extendedFallFrames: p.extendedFallFrames,
      landingLockFramesMutable: p.landingLockMutable,
      get landedThisTick() { return p.landedThisTick; },
      set landedThisTick(v: boolean) { p.landedThisTick = v; },
      get justLanded() { return p.justLanded; },
      set justLanded(v: boolean) { p.justLanded = v; },
      swordVisual: p.swordVisual,
      stats: p.stats,
      attackTimingScale: () => p.attackTimingScale(),
      isSubweaponAnimating: () => p.isSubweaponAnimating(),
      headbandActive: () => p.headband.isActive(),
      carryHolding: () => p.carry.isHolding(),
      carryAnimating: () => p.carry.isThrowing() || p.carry.isPlucking(),
      carryThrowing: () => p.carry.isThrowing(),
      carryBlocksAttack: () => p.carry.blocksAttack(),
      offensiveHitlagRemaining: p.offensiveHitlagRemaining,
      scaleOutgoingHitstun: (ff) => p.scaleOutgoingHitstun(ff),
      effectiveOutgoingDamage: (base) => p.effectiveOutgoingDamage(base),
      applySquashStretchX: (s, f) => p.squash.applyStretchX(s, f),
      applySquashStretchYWallAnchored: (s, f, side) =>
        p.squash.applyStretchYWallAnchored(s, f, side),
      fireAnimCueStrip: (key, idx, prior, startedOnGround) =>
        p.fireAnimCueStrip(key, idx, prior, startedOnGround),
      cancelAttack: () => p.cancelAttack(),
      cancelSubweaponAnim: () => p.cancelSubweaponAnim(),
      cancelHeadbandAttack: () => p.headband.cancel(),
      dropCarryForAirDodge: (host) => p.carry.dropHeldGentleForAirDodge(p, host),
      collisionPoseAt: (ax, ay) => p.collisionPoseAt(ax, ay),
      poseForFeetSupport: () => p.poseForFeetSupport(),
      overlapsSolid: (map, pose) => p.overlapsSolid(map, pose),
      standHullAt: (ax, ay, hullH) => p.standHullAt(ax, ay, hullH),
      applyHitboxHeight: (newH, map) => p.applyHitboxHeight(newH, map),
      polygonOverlapsHorizontalBlockingSolids: (pose, map, vxProbe) =>
        p.polygonOverlapsHorizontalBlockingSolidsForDisc(pose, map, vxProbe),
      moveAndCollide: (dt, map) => p.moveAndCollide(dt, map),
      noteHorizontalWallContact: (side) => {
        p.horizontalWallContactResolvedThisStep = true;
        p.horizontalWallContactSide = side;
      },
      get horizontalWallContactResolvedThisStep() {
        return p.horizontalWallContactResolvedThisStep;
      },
      get horizontalWallContactSide() {
        return p.horizontalWallContactSide;
      },
      clearHorizontalWallContact: () => {
        p.horizontalWallContactResolvedThisStep = false;
        p.horizontalWallContactSide = 0;
      },
      standsOnWavedashSupport: (map) => p.standsOnWavedashSupport(map),
      wavedashDeckFromPlatformHullOverlap: (map) => p.wavedashDeckFromPlatformHullOverlap(map),
      snapFootToFloorY: (deckY) => p.snapFootToFloorY(deckY),
      gardeningHost: p.tickGardeningHost,
      fuzzyHatStacks: p.inventory.stacksOf("FUZZY_HAT"),
      headbandStacks: p.inventory.stacksOf("HEADBAND"),
      gemSwordStacks: p.gemSwordStacks,
      usesWhip: () => p.usesWhip(),
      whipHitboxPose: () => (p.whipSim.isDeployed() ? p.whipSim.hitboxPose() : null),
      whipHitRegionAgainst: (e) => p.whipSim.hitRegionAgainst(e),
      applySwordHitItemProcs: (e) => p.applySwordHitItemProcs(e),
      beginOffensiveHitlag: (frames) => {
        p.hitlagFrames = Math.max(p.hitlagFrames, frames);
      },
      get hitlagFrames() { return p.hitlagFrames; },
      set hitlagFrames(v: number) { p.hitlagFrames = v; },
      trySpawnHeavyAfterimage: () => p.trySpawnHeavyAfterimage(),
      clearAttackHitLanded: () => {
        p.attackHitLanded = false;
      },
      onHeelysAirDodgeLanding: (combinedVx) =>
        p.heelys.onAirDodgeLanding(p.stats.heelysStacks, combinedVx, p.stats),
      onHeelysSlideSpeedBase: () =>
        p.heelys.disc01SlideSpeedBase(p.stats.heelysStacks, p.vx, p.stats),
    };
  }

  /** Simplified horizontal block probe for disc wall-slide (no jump-foot deck exemption). */
  private polygonOverlapsHorizontalBlockingSolidsForDisc(
    pose: HitboxPose,
    map: TileMap,
    vxProbe: number,
  ): boolean {
    const prevFeet = JumpFoot.jumpFootProbeFrom(pose);
    const predictedFeet = prevFeet;
    return this.polygonOverlapsHorizontalBlockingSolids(pose, map, vxProbe, prevFeet, predictedFeet);
  }

  /** Ground / coyote / platform-or-pedestal deck for jumpsquat wavedash (Java standsOnFullWavedashSupport). */
  standsOnWavedashSupport(map: TileMap): boolean {
    if (this.onGround || this.coyoteTimer > 0) return true;
    return this.wavedashDeckFromPlatformHullOverlap(map) != null;
  }

  /**
   * Wavedash / coast: stand hull overlaps a platform tile's full cell (or pedestal extra),
   * with feet on that deck's surface (Java wavedashDeckFromPlatformHullOverlap).
   */
  wavedashDeckFromPlatformHullOverlap(map: TileMap): number | null {
    const pose = this.standCollisionPoseAt(this.x, this.y);
    const r = pose.bounds();
    const footY = r.y + r.h;
    const ts = TILE_SIZE;
    const leftTile = Math.floor((r.x + 0.001) / ts);
    const rightTile = Math.floor((r.x + r.w - 0.001) / ts);
    const topTile = Math.floor((r.y + 0.001) / ts);
    const bottomTile = Math.floor((r.y + r.h - 0.001) / ts);
    let best: number | null = null;
    for (let ty = topTile; ty <= bottomTile; ty++) {
      if (ty < 0 || ty >= map.height) continue;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!map.isPlatformTile(tx, ty)) continue;
        if (this.dropsThroughOneWayPlatformTile(map, tx, ty)) continue;
        const tile = { x: tx * ts, y: ty * ts, w: ts, h: ts };
        if (!pose.intersectsRect(tile)) continue;
        const deckTop = ty * ts;
        if (!this.wavedashFeetOnDeck(footY, deckTop)) continue;
        if (best == null || deckTop > best) best = deckTop;
      }
    }
    if (this.tickPedestalPlatforms) {
      for (const p of this.tickPedestalPlatforms) {
        const deckRect = { x: p.x, y: p.y, w: p.w, h: Math.max(1, p.h) };
        if (
          r.x + r.w <= deckRect.x + 1e-6 ||
          r.x >= deckRect.x + deckRect.w - 1e-6 ||
          r.y + r.h <= deckRect.y + 1e-6 ||
          r.y >= deckRect.y + deckRect.h - 1e-6
        ) {
          continue;
        }
        const deckTop = p.y;
        if (!this.wavedashFeetOnDeck(footY, deckTop)) continue;
        if (best == null || deckTop > best) best = deckTop;
      }
    }
    return best;
  }

  private wavedashFeetOnDeck(footY: number, deckTop: number): boolean {
    return footY >= deckTop - 1e-3 && footY <= deckTop + PLATFORM_DECK_SLACK_PX + 1e-3;
  }

  isPlayerDamageImmune(): boolean {
    return (
      this.disc.isPlayerDamageImmune() ||
      this.headband.isSideAttackInvulnerable() ||
      this.kuriboMigratedIFrames > 0
    );
  }

  heavyAttackScreenShakeDeviceX(): number {
    return this.disc.heavyScreenShakeDeviceX();
  }

  heavyAttackScreenShakeDeviceY(): number {
    return this.disc.heavyScreenShakeDeviceY();
  }

  isSlideActive(): boolean {
    return this.disc.slideActive;
  }

  isWallSlideActive(): boolean {
    return this.disc.wallSlideActive;
  }

  wallSlideSide(): number {
    return this.disc.wallSlideSide;
  }

  isAirDodgeActive(): boolean {
    return this.disc.airDodgeActive;
  }

  airDodgeCostumeFrameIndex(): number {
    return this.disc.airDodgeCostumeFrameIndex();
  }

  airDodgeIntangibleFlashAlpha(): number {
    if (this.kuriboMigratedIFrames > 0) {
      return this.disc.kuriboMigratedFlashAlpha(this.kuriboMigratedFlashFrame);
    }
    return this.disc.airDodgeIntangibleFlashAlpha();
  }

  isHeavyAttackActive(): boolean {
    return this.disc.isHeavyActive();
  }

  heavyAttackFrameIndex(): number {
    return this.disc.heavyFrameIndex();
  }

  heavyAttackFromAir(): boolean {
    return this.disc.heavyAttackFromAir();
  }

  consumeWallSlideLandFacingSnap(): boolean {
    return this.disc.consumeWallSlideLandFacingSnap();
  }

  /** Landing dust spawn request; cleared on consume. `[count, behindX, feetY]`. */
  consumeLandingDustSpawn(): [number, number, number] | null {
    if (this.pendingLandingDustPuffCount == null) return null;
    const out: [number, number, number] = [
      this.pendingLandingDustPuffCount,
      this.pendingLandingDustBehindX ?? this.x + this.w * 0.5,
      this.pendingLandingDustBehindY ?? this.y + this.h,
    ];
    this.pendingLandingDustPuffCount = null;
    this.pendingLandingDustBehindX = null;
    this.pendingLandingDustBehindY = null;
    return out;
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
    this.smokePuffCallback?.(enemy);
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
    const heavy = this.disc.heavyAttackHitboxPose(this.discHost());
    if (heavy) return heavy;
    const hb = this.headband.attackHitboxPose(this.headbandHost());
    if (hb) return hb;
    if (this.attackPhase !== 2 || this.usesLemonBuster()) return null;
    if (this.usesWhip()) {
      return this.whipSim.isDeployed() ? this.whipSim.hitboxPose() : null;
    }
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

  /** Frame index for {@code sprites/vernan/grabbed *.png} (0..3). */
  grabAnimFrameIndex(): number {
    return this.grabAnimFrame;
  }

  /**
   * Nephilim drink sip — half-heart steal (can kill). Defensive hitstun, no i-frames.
   */
  applyGrabDrinkSteal(halfHearts: number, freezeFrameCount: number): boolean {
    if (this.health.isDead || halfHearts <= 0) return false;
    const mult = KaleidoscopeEyeCombat.playerDamageMultiplier();
    const result = this.applyPlayerHealthDamageIgnoringInvuln(halfHearts * mult);
    if (!result.applied) return false;
    this.beginDefensiveHitstunForDamage(freezeFrameCount, 0, result.retaliation);
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
    if (this.disc.slideActive) {
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
    this.grabHeld = true;
    this.disc.cancelAirDodgeFromGrab();
    this.vx = 0;
    this.vy = 0;
    this.climbing = false;
    this.crouching = false;
    this.jumpSquatRemaining = 0;
    this.hitlagFrames = 0;
    this.cancelAttack();
    this.cancelSubweaponAnim();
    this.resolveGrabHoldPosition(box, map);
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
    const dmg =
      (e.grabReleaseDamageToPlayer?.() ?? e.contactDamageToPlayer()) *
      KaleidoscopeEyeCombat.playerDamageMultiplier();
    const result = this.applyPlayerHealthDamage(dmg, CONTACT_DAMAGE_IFRAMES);
    if (!result.applied) return;
    const er = e.rect();
    const ecx = er.x + er.w * 0.5;
    const px = this.x + this.w * 0.5;
    const away = px < ecx ? -1 : 1;
    const fz = freezeFrames(dmg);
    if (!blackHeartRetaliationActive(result.retaliation)) {
      e.applyOffensiveHitlag?.(fz);
    }
    this.beginDefensiveHitstunForDamage(fz, away, result.retaliation);
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
      this.isPlayerDamageImmune() ||
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
    const result = this.applyPlayerHealthDamage(scaled, CONTACT_DAMAGE_IFRAMES);
    if (!result.applied) return "miss";
    let away = this.x + this.w * 0.5 >= bulletCenterX ? 1 : -1;
    if (Math.abs(this.x + this.w * 0.5 - bulletCenterX) < 1e-4) away = -this.facing;
    this.beginDefensiveHitstunForDamage(
      Math.max(1, Math.ceil(freezeFrames(scaled) * 0.85)),
      away,
      result.retaliation,
    );
    return "player_hit";
  }

  collectItem(id: string, catalog: ItemCatalog, host: ItemPickupHost): void {
    this.inventory.add(id, 1);
    const def = catalog.def(id);
    if (def.subweapon) {
      this.inventory.setEquippedSubweapon(id);
      this.inventory.markSubweaponEverAcquired(id);
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

  carryPayload(): CarryPayload | null {
    return this.carry.carryPayload();
  }

  carryPluckPreview(): PluckInstantPreview | null {
    return this.carry.pluckInstantPreview();
  }

  beginCarryHold(payload: CarryPayload | null): void {
    this.carry.beginHold(payload);
  }

  setIceBlockCollisionContext(blocks: readonly IceBlock[], feetOnIceDeck: boolean): void {
    this.tickIceBlocks = blocks;
    this.tickFeetOnIce = feetOnIceDeck;
  }

  setCarryPluckPreview(preview: PluckInstantPreview | null): void {
    this.carry.setPluckPreview(preview);
  }

  isCarryPlucking(): boolean {
    return this.carry.isPlucking();
  }

  isCarryThrowing(): boolean {
    return this.carry.isThrowing();
  }

  carryPluckFrameIndex(): number {
    return this.carry.pluckFrameIndex();
  }

  carryThrowFrameIndex(): number {
    return this.carry.throwFrameIndex();
  }

  carryHoldOverhead(): boolean {
    return this.carry.holdOverhead();
  }

  isCarryHolding(): boolean {
    return this.carry.isHolding();
  }

  carryThrowStartedOnGround(): boolean {
    return this.carry.throwStartedOnGround();
  }

  dropCarryForSubweaponSwitch(): void {
    this.carry.dropHeldGentleForWeaponSwitch(this, this.tickGardeningHost);
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
      vfx: MeleeHitVfxTag,
    ) => void,
  ): number {
    if (this.headband.isActive()) {
      return this.headband.applyHits(this.headbandHost(), enemies, onHit);
    }
    if (this.disc.isHeavyActive()) {
      return this.disc.applyHeavyHits(this.discHost(), enemies, (e, strike, sword, vfx) =>
        onHit?.(e, strike, sword, vfx),
      );
    }
    const slideFreeze = this.disc.applySlideHits(this.discHost(), enemies, (e, strike, sword) =>
      onHit?.(e, strike, sword, "slash"),
    );
    if (slideFreeze > 0) return slideFreeze;
    const swordPose = this.attackHitboxPose();
    if (!swordPose || this.attackHitLanded || this.usesLemonBuster()) return 0;
    const sword = swordPose.bounds();
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
      if (!enemyIntersectsMelee(e, swordPose)) continue;
      if (this.usesWhip()) {
        const region = this.whipSim.hitRegionAgainst(e);
        if (region === "NONE") continue;
        const hitDmg = region === "TIP" ? dmg * WhipSim.TIP_DAMAGE_MULT : dmg;
        let ff = this.scaleOutgoingHitstun(freezeFrames(hitDmg));
        if (region === "TIP") ff += WhipSim.TIP_HITLAG_BONUS_FRAMES;
        const contact = contactBetweenHurtAndEnemy(sword, e.rect());
        const strike: WeaponStrike = {
          damage: hitDmg,
          freezeFrames: ff,
          attackerX: this.x,
          attackerW: this.w,
          facing: this.facing,
          knockKind,
          contactWorldX: contact.x,
          contactWorldY: contact.y,
        };
        const hit = e.applyWeaponStrike(strike);
        if (hit) {
          any = true;
          maxFreeze = Math.max(maxFreeze, ff);
          AutismCombat.notifyPlayerDamageDealt(e, hitDmg);
          KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, hitDmg);
          this.applySwordHitItemProcs(e);
          onHit?.(e, strike, sword, region === "TIP" ? "slash" : "fallback");
        }
        continue;
      }
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


  private trySpawnAfterimage(): void {
    if (!this.afterimageSpawnHost || this.stats.afterimageStacks <= 0) return;
    if (this.swordVisual === "fists" || this.swordVisual === "lemon" || this.usesWhip()) return;
    const pose = this.attackHitboxPose();
    if (!pose) return;
    const crouchMult = this.groundCrouchAttack ? CROUCH_ATTACK_DAMAGE_MULT : 1;
    const dmg = this.stats.outgoingDamage() * crouchMult * this.swordDamageMult;
    const kb = swordKnockbackKind(this.swordVisual, this.groundCrouchAttack);
    this.afterimageSpawnHost({
      originX: this.x,
      feetWorldY: this.y + this.h,
      attackerWidth: this.w,
      facing: this.facing,
      bodyW: this.w,
      hitboxPose: pose,
      damage: dmg,
      knockbackKind: kb,
      swordVisual: this.swordVisual,
      groundCrouchAttack: this.groundCrouchAttack,
      heavyAttack1Smear: false,
    });
  }

  /** disc04 heavy active-frame smear (Java Player.trySpawnHeavyAfterimage). */
  trySpawnHeavyAfterimage(): void {
    if (!this.afterimageSpawnHost || this.stats.afterimageStacks <= 0) return;
    if (this.swordVisual === "fists" || this.swordVisual === "lemon") return;
    const pose = this.disc.heavyAttackHitboxPose(this.discHost());
    if (!pose) return;
    const dmg = this.effectiveOutgoingDamage(
      this.stats.outgoingDamage() * HEAVY_ATTACK_DAMAGE_MULT,
    );
    const kb = swordKnockbackKind(this.swordVisual, false);
    this.afterimageSpawnHost({
      originX: this.x,
      feetWorldY: this.y + this.h,
      attackerWidth: this.w,
      facing: this.facing,
      bodyW: this.w,
      hitboxPose: pose,
      damage: dmg,
      knockbackKind: kb,
      swordVisual: this.swordVisual,
      groundCrouchAttack: false,
      heavyAttack1Smear: true,
    });
  }

  usesWhip(): boolean {
    return this.swordVisual === "whip" || this.inventory.stacksOf("WHIP") > 0;
  }

  /** Latch sword swing after enemy + breakable pass (Java attackHitLanded). */
  latchAttackHit(freezeFrames: number): void {
    this.attackHitLanded = true;
    this.hitlagFrames = Math.max(this.hitlagFrames, freezeFrames);
  }

  /**
   * Melee + whip wiggle + world strike before movement (Java pre-move combat).
   * Mount supplies HitVfx / breakables via {@link #bindFrameCombatHooks}.
   */
  private applyPreMoveCombatHits(): void {
    const enemies = this.tickCombatEnemies as CombatEnemy[];
    const onHit = this.frameMeleeHit ?? undefined;
    // Java order: heavy (enemies + world) → whip wiggle → sword/headband/slide, then world for light.
    if (this.disc.isHeavyActive()) {
      this.disc.applyHeavyHits(
        this.discHost(),
        enemies,
        (e, strike, sword, vfx) => onHit?.(e, strike, sword, vfx),
        () => this.frameWorldStrike?.() ?? 0,
      );
      return;
    }
    let maxFreeze = this.applyWhipHits(enemies);
    maxFreeze = Math.max(maxFreeze, this.applyAttackHits(enemies, onHit));
    const worldFreeze = this.frameWorldStrike?.() ?? 0;
    if (maxFreeze > 0 || worldFreeze > 0) {
      this.latchAttackHit(Math.max(maxFreeze, worldFreeze));
    }
  }

  /** Slide / headband-side hits while combat-frozen (Java combatFreeze body). */
  private applyCombatFreezeHits(): void {
    const enemies = this.tickCombatEnemies as CombatEnemy[];
    const onHit = this.frameMeleeHit ?? undefined;
    if (this.disc.slideActive) {
      const slideFreeze = this.disc.applySlideHits(this.discHost(), enemies, (e, strike, sword) =>
        onHit?.(e, strike, sword, "slash"),
      );
      if (slideFreeze > 0) this.latchAttackHit(slideFreeze);
    }
    if (this.headband.isSideAttack()) {
      const hbFreeze = this.headband.applyHits(this.headbandHost(), enemies, onHit);
      if (hbFreeze > 0) this.latchAttackHit(hbFreeze);
    }
  }

  private tickKuriboStompRearm(): void {
    if (this.kuriboStompAwaitingApexAfterBounce && this.vy >= 0) {
      this.kuriboStompAwaitingApexAfterBounce = false;
    }
    if (this.kuriboStompAllowed) return;
    if (this.vy <= 0) this.kuriboHopClearedSinceStomp = true;
    else if (this.kuriboHopClearedSinceStomp) this.kuriboStompAllowed = true;
  }

  private disarmKuriboStompUntilNextFall(): void {
    this.kuriboStompAllowed = false;
    this.kuriboHopClearedSinceStomp = false;
  }

  private tryKuriboStomp(
    e: CombatEnemy,
    vernanHurt: HitboxPose,
    fromAirDodge: boolean,
    onElectrocution?: (
      enemy: CombatEnemy,
      strike: WeaponStrike,
      contact: { x: number; y: number },
    ) => void,
  ): boolean {
    if (this.hurtLocked || this.stats.kuriboShoeStacks <= 0 || !this.kuriboStompAllowed) return false;
    if (!fromAirDodge && this.kuriboStompAwaitingApexAfterBounce && this.vy < 0) return false;
    if (!fromAirDodge && this.vy <= 0) return false;
    if (e.isDead() || e.isInCombatHitstun()) return false;
    if ((e as { isKuriboStompCorpseActive?: () => boolean }).isKuriboStompCorpseActive?.()) return false;
    if (e.kuriboStompOverlaps) {
      if (!e.kuriboStompOverlaps(vernanHurt)) return false;
    } else {
      const hurt = e.damageReceivePose();
      if (!vernanHurt.intersectsRect(hurt)) return false;
    }
    const enemyHurt = e.damageReceivePose();
    const pb = vernanHurt.bounds();
    const playerCy = pb.y + pb.h * 0.5;
    if (playerCy < enemyHurt.y || playerCy > enemyHurt.y + enemyHurt.h) return false;

    if (fromAirDodge) {
      const remaining = this.disc.remainingAirDodgeIntangibleFrames();
      if (remaining > 0) {
        this.pendingKuriboMigratedIFrames = Math.max(this.pendingKuriboMigratedIFrames, remaining);
      }
      this.disc.cancelAirDodgeForKuriboStomp();
    }

    const fuzzyStacks = this.inventory.stacksOf("FUZZY_HAT");
    const stompHitlagFrames = this.scaleOutgoingHitstun(
      Math.ceil(freezeFrames(1, 1) * KURIBO_STOMP_HITSTUN_MULT),
    );
    const contact = contactBetweenHurtAndEnemy(pb, e.rect());
    if (fuzzyStacks > 0) {
      const strike = FuzzyHatContactEffect.applyElectricStomp(fuzzyStacks, e, this, contact);
      if (strike) onElectrocution?.(e, strike, contact);
    } else {
      const strike: WeaponStrike = {
        damage: 1,
        freezeFrames: stompHitlagFrames,
        attackerX: this.x,
        attackerW: this.w,
        facing: this.facing,
        knockKind: "stomp",
        contactWorldX: contact.x,
        contactWorldY: contact.y,
      };
      e.applyWeaponStrike(strike);
      AutismCombat.notifyPlayerDamageDealt(e, 1);
      KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, 1);
    }
    this.squash.applyStretchX(KuriboStompFx.VERNAN_IMPACT_X, stompHitlagFrames);
    this.hitlagFrames = Math.max(this.hitlagFrames, stompHitlagFrames);
    this.pendingKuriboBounce = true;
    this.disarmKuriboStompUntilNextFall();
    return true;
  }

  private tickKuriboMigratedIFrames(): void {
    if (this.kuriboMigratedIFrames <= 0) return;
    this.kuriboMigratedFlashFrame++;
    this.kuriboMigratedIFrames--;
  }

  /** Call when offensive hitlag expires after a stomp (Java finishKuriboStompBounce). */
  finishPendingKuriboBounce(input: Input): void {
    if (!this.pendingKuriboBounce) return;
    this.pendingKuriboBounce = false;
    const frac = input.jump
      ? KURIBO_STOMP_BOUNCE_JUMP_HELD_FRAC
      : KURIBO_STOMP_BOUNCE_JUMP_FRAC;
    this.vy = -this.stats.jumpVel * frac;
    this.onGround = false;
    this.kuriboStompAwaitingApexAfterBounce = true;
    if (this.pendingKuriboMigratedIFrames > 0) {
      this.kuriboMigratedIFrames = this.pendingKuriboMigratedIFrames;
      this.kuriboMigratedFlashFrame = 0;
      this.pendingKuriboMigratedIFrames = 0;
    }
    this.walkOffLedgeActive = false;
    this.normalJumpAirborne = true;
    this.crouchJumpMode = false;
    this.squash.applyStretchY(
      KuriboStompFx.VERNAN_RELEASE_Y,
      KuriboStompFx.VERNAN_RELEASE_RECOVER_FRAMES,
    );
  }

  applyEnemyContacts(
    enemies: CombatEnemy[],
    onElectrocution?: (
      enemy: CombatEnemy,
      strike: WeaponStrike,
      contact: { x: number; y: number },
    ) => void,
  ): void {
    if (this.health.isDead) return;
    if (this.stats.kuriboShoeStacks > 0) this.tickKuriboStompRearm();
    const vernanHurt = this.hurtboxPose();
    const kuriboAirDodgeStomp =
      this.stats.kuriboShoeStacks > 0 &&
      this.disc.airDodgeActive &&
      this.disc.isAirDodgeIntangible();
    const kuriboFalling =
      this.stats.kuriboShoeStacks > 0 && (this.vy > 0 || kuriboAirDodgeStomp);
    if (kuriboFalling) {
      for (const e of enemies) {
        if (this.tryKuriboStomp(e, vernanHurt, kuriboAirDodgeStomp, onElectrocution)) {
          break;
        }
      }
      return;
    }
    if (this.isPlayerDamageImmune()) return;
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
      if (e.seesPlayer && !e.seesPlayer()) continue;
      const dmg =
        e.contactDamageToPlayer() * KaleidoscopeEyeCombat.playerDamageMultiplier();
      const result = this.applyPlayerHealthDamage(dmg, CONTACT_DAMAGE_IFRAMES);
      if (!result.applied) return;
      const fz = freezeFrames(dmg);
      if (!blackHeartRetaliationActive(result.retaliation)) {
        e.applyOffensiveHitlag?.(fz);
      }
      const away =
        this.x + this.w * 0.5 >= e.rect().x + e.rect().w * 0.5 ? 1 : -1;
      this.beginDefensiveHitstunForDamage(fz, away, result.retaliation);
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
    this.hitlagFrames = 0;
    this.defensiveHitstunRemaining = 0;
    this.pendingHurtKnockSign = 0;
    this.pendingKuriboBounce = false;
    this.pendingKuriboMigratedIFrames = 0;
    this.kuriboMigratedIFrames = 0;
    this.kuriboMigratedFlashFrame = 0;

    this.hurtLocked = true;
    this.cancelAttack();
    this.disc.cancelHeavyAttack();
    this.headband.cancel();
    this.cancelSubweaponAnim();
    this.cancelGetup();
    this.carry.onHurtOrDeath(this, this.tickGardeningHost, false);
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
    this.disc.cancelMovementStatesFromHurt();
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
    this.attackLateRecoverCueFired = false;
    this.whipWiggleActive = false;
    this.whipWiggleHitCooldown.clear();
    this.whipSim.reset();
    this.whipAimInput.reset();
  }

  private swordAttackCueKey(): string {
    return this.groundCrouchAttack ? "crouchattack0" : "attack0";
  }

  /** Stand {@code attack0} / subweapon strips share one cue sheet for ground and air. */
  private static isAirGroundSharedAnimCue(logicalKey: string): boolean {
    return logicalKey === "attack0" || logicalKey === "specialattack0";
  }

  private fireAnimCuePhase(logicalKey: string, phaseSlot: number, startedOnGround: boolean): void {
    const shared = Player.isAirGroundSharedAnimCue(logicalKey);
    VernanAnimCueRuntime.applyOnPhase(
      this.squash,
      (cue) => this.applyAnimCueImpulse(cue),
      logicalKey,
      phaseSlot,
      shared || startedOnGround,
      shared || !startedOnGround,
    );
  }

  private fireAnimCueStrip(
    logicalKey: string,
    stripIndex: number,
    priorStripIndex: number,
    startedOnGround: boolean,
  ): void {
    const shared = Player.isAirGroundSharedAnimCue(logicalKey);
    VernanAnimCueRuntime.applyOnStripIndex(
      this.squash,
      (cue) => this.applyAnimCueImpulse(cue),
      logicalKey,
      stripIndex,
      priorStripIndex,
      shared || startedOnGround,
      shared || !startedOnGround,
    );
  }

  /** Gardening gloves pluck / throw strip cues (Java fireAnimCueStripForCarry). */
  fireAnimCueStripForCarry(
    logicalKey: string,
    stripIndex: number,
    priorStripIndex = -1,
  ): void {
    VernanAnimCueRuntime.applyOnStripIndex(
      this.squash,
      (cue) => this.applyAnimCueImpulse(cue),
      logicalKey,
      stripIndex,
      priorStripIndex,
      this.onGround,
    );
  }

  /** Authored {@code vx} is facing-relative; {@code vy} is world-space (negative = up). */
  private applyAnimCueImpulse(cue: VernanAnimCue): void {
    this.vx = vernanAnimCueApplyVx(cue, this.vx, this.facing);
    this.vy = vernanAnimCueApplyVy(cue, this.vy);
  }

  private tickAttackAnimCues(): void {
    if (
      this.attackPhase === 3 &&
      !this.attackLateRecoverCueFired &&
      this.attackAnimFrameIndex() === 3
    ) {
      this.fireAnimCuePhase(this.swordAttackCueKey(), 3, this.attackStartedOnGround);
      this.attackLateRecoverCueFired = true;
    }
  }

  private cancelSubweaponAnim(): void {
    this.subweaponAnimPhase = 0;
    this.subweaponFrameIndex = 0;
    this.subweaponFrameTimeLeft = 0;
    this.subweaponSpawnFired = false;
    this.subweaponAttack0Strip = false;
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
    const ticks = this.subweaponAttack0Strip
      ? Player.SUBWEAPON_ATTACK0_FRAME_TICKS
      : Player.SUBWEAPON_SPECIAL_FRAME_TICKS;
    return Math.min(this.subweaponFrameIndex, ticks.length - 1);
  }

  /** Warp orb uses attack0 strip (Java subweaponUsesAttack0Strip). */
  subweaponUsesAttack0Strip(): boolean {
    return this.isSubweaponAnimating() && this.subweaponAttack0Strip;
  }

  /** Air throw uses air special strip (Java subweaponUsesAirSpecialStrip). */
  subweaponUsesAirSpecialStrip(): boolean {
    return this.isSubweaponAnimating() && !this.subweaponAttack0Strip && !this.subweaponStartedOnGround;
  }

  triggerKCandyWhiteFlash(durationSec: number): void {
    this.kCandyWhiteFlashSec = Math.max(this.kCandyWhiteFlashSec, durationSec);
  }

  kCandyWhiteFlashActive(): boolean {
    return this.kCandyWhiteFlashSec > 0;
  }

  tickCosmeticTimers(dt: number): void {
    this.kCandyWhiteFlashSec = Math.max(0, this.kCandyWhiteFlashSec - dt);
  }

  private updateSubweaponAnim(dt: number, input: Input, host: SubweaponHost | null): void {
    if (!host) return;
    const eq = host.equippedSubweapon();
    if (eq === "K_CANDY") {
      this.cancelSubweaponAnim();
      if (
        input.subweaponPressed &&
        host.kCandyCanFire() &&
        host.subweaponCooldownReady() &&
        !this.isAttacking() &&
        !this.climbing &&
        this.landingLockFrames === 0 &&
        this.getupLockFrames === 0
      ) {
        host.activateKCandy();
        host.onSubweaponFired();
      }
      return;
    }
    if (eq === "GARDENING_GLOVES") {
      this.cancelSubweaponAnim();
      return;
    }
    if (eq !== "FRISBEE" && eq !== "PSYCHIC_SPOON" && eq !== "WARP_ORB") {
      this.cancelSubweaponAnim();
      return;
    }
    const frameTicks = eq === "WARP_ORB" ? Player.SUBWEAPON_ATTACK0_FRAME_TICKS : Player.SUBWEAPON_SPECIAL_FRAME_TICKS;
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
        this.subweaponAttack0Strip = eq === "WARP_ORB";
        this.subweaponFrameTimeLeft = frameTicks[0]! / FIXED_STEP_HZ;
        this.subweaponSpawnFired = false;
        this.subweaponStartedOnGround = this.onGround;
        if (eq === "FRISBEE") this.frisbeeAimSnapshot.reset();
        this.fireAnimCueStrip(
          this.subweaponAttack0Strip ? "attack0" : "specialattack0",
          0,
          -1,
          this.subweaponStartedOnGround,
        );
      }
      return;
    }
    if (eq === "FRISBEE" && this.subweaponFrameIndex <= 1) {
      this.frisbeeAimSnapshot.sampleTapWindup(input);
    }
    this.subweaponFrameTimeLeft -= dt;
    if (this.subweaponFrameTimeLeft > 0) return;
    if (this.subweaponFrameIndex === 1 && !this.subweaponSpawnFired) {
      const fired = host.equippedSubweapon();
      if (fired === "FRISBEE") {
        const sx = this.x + this.w * 0.5 + this.facing * Player.SUBWEAPON_SPAWN_OFF_X;
        const sy = this.y + Player.SUBWEAPON_SPAWN_OFF_Y;
        this.frisbeeAimSnapshot.finalizeHoldAtSpawn(input);
        host.spawnFrisbee(sx, sy, this.facing, this.frisbeeAimSnapshot);
      } else if (fired === "PSYCHIC_SPOON") {
        host.activatePsychicSpoon();
      } else if (fired === "WARP_ORB") {
        const sx = this.x + this.w * 0.5 + this.facing * Player.SUBWEAPON_SPAWN_OFF_X;
        const sy = this.y + Player.SUBWEAPON_SPAWN_OFF_Y;
        host.spawnWarpOrb(sx, sy, this.facing, this.subweaponStartedOnGround);
      }
      host.onSubweaponFired();
      this.subweaponSpawnFired = true;
    }
    const prior = this.subweaponFrameIndex;
    this.subweaponFrameIndex++;
    if (this.subweaponFrameIndex >= frameTicks.length) {
      this.cancelSubweaponAnim();
      return;
    }
    this.fireAnimCueStrip(
      this.subweaponAttack0Strip ? "attack0" : "specialattack0",
      this.subweaponFrameIndex,
      prior,
      this.subweaponStartedOnGround,
    );
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
    if (this.carry.blocksAttack()) return;
    if (this.usesLemonBuster()) return;
    if (this.swordVisual === "fists") return;
    if (this.attackBufferTimer <= 0) return;
    if (this.landingLockFrames > 0 || this.climbing) return;
    this.attackBufferTimer = 0;
    this.attackPhase = 1;
    this.attackHitLanded = false;
    this.whipWiggleHitCooldown.clear();
    this.whipWiggleActive = false;
    this.attackStartedOnGround = this.onGround;
    this.groundCrouchAttack =
      (this.onGround && this.crouching) ||
      (!this.onGround && !this.crouchJumpMode && downHeld);
    this.attackTimer = this.attackWindupFramesThisSwing() / 60;
    this.attackLateRecoverCueFired = false;
    this.fireAnimCuePhase(this.swordAttackCueKey(), 0, this.attackStartedOnGround);
  }

  private updateLemonShot(dt: number, input: Input, host: LemonShotHost | null): void {
    this.lemonPoseSecondsRemaining = Math.max(0, this.lemonPoseSecondsRemaining - dt);
    this.lemonRefireCooldown = Math.max(0, this.lemonRefireCooldown - dt);
    if (!this.usesLemonBuster() || !host?.hasLemonShooter()) return;
    if (
      this.hurtLocked ||
      this.landingLockFrames > 0 ||
      this.getupLockFrames > 0 ||
      this.disc.slideActive ||
      this.disc.airDodgeLockedUntilLand
    ) {
      return;
    }
    if (
      this.isSubweaponAnimating() ||
      this.carry.isHolding() ||
      this.carry.isThrowing() ||
      this.carry.isPlucking()
    ) {
      return;
    }
    const attackEdge = input.attackPressed;
    const attackHeld = input.attack;
    // Visual: holding X uses lemon pose (incl. climb / wall-slide); after release linger for one refire period.
    if (attackHeld || attackEdge) {
      this.lemonPoseSecondsRemaining = Math.max(
        this.lemonPoseSecondsRemaining,
        host.lemonShotRefireSeconds(),
      );
    }
    if (!attackEdge && !attackHeld) return;
    // Only allow firing during actions that have lemon sprite equivalents (idle/walk/walk-off/jump/turn/climb/crouch).
    const crouchMuzzle =
      this.isJumpSquatting() ||
      this.crouching ||
      this.isCrouchJumpMode() ||
      this.isLandingLocked() ||
      this.isGroundCrouchAttack();
    const eligible =
      this.disc.wallSlideActive ||
      this.climbing ||
      this.usesJumpCollisionHull() ||
      this.isWalkOffLedgeActive() ||
      this.onGround ||
      crouchMuzzle;
    if (!eligible) return;
    if (host.lemonShotsOnScreen() >= 3) return;
    const fireNow = attackEdge || (attackHeld && this.lemonRefireCooldown <= 0);
    if (!fireNow) return;
    const wallSlide = this.disc.wallSlideActive;
    const side = wallSlide ? this.disc.wallSlideSide : this.facing;
    const sx =
      this.x + this.w * 0.5 + side * Player.SUBWEAPON_SPAWN_OFF_X - PROJECTILE_LEMON_SHOT_PIVOT_X;
    let sy = this.y + (crouchMuzzle ? Player.LEMON_SPAWN_OFF_Y_CROUCH : Player.LEMON_SPAWN_OFF_Y_STAND);
    sy = Math.min(sy, this.y + this.h - 6);
    const shotFacing = wallSlide ? -this.disc.wallSlideSide : this.facing;
    host.spawnLemonShot(sx, sy, shotFacing, host.lemonShotDamage());
    this.lemonRefireCooldown = host.lemonShotRefireSeconds();
  }

  private updateAttack(dt: number, input: Input): void {
    if (this.disc.isHeavyActive() || this.disc.airDodgeActionLock()) return;
    // Latch only while updateAttack runs (skipped during combat freeze — Java parity).
    if (input.attackPressed) this.attackBufferTimer = ATTACK_BUFFER;
    this.attackBufferTimer = Math.max(0, this.attackBufferTimer - dt);
    const downHeld = input.down && !input.up;
    if (this.attackPhase === 0) {
      this.tryBeginAttackFromBuffer(downHeld);
      return;
    }
    this.attackTimer -= dt;
    // Hold X during whip recover: loop early-recover and keep tip wiggle active (Java).
    if (this.attackPhase === 3 && this.usesWhip() && input.attack) {
      const earlySec =
        (this.attackRecoverEarlyFramesThisSwing() / 60) * WhipTuningValues.WIGGLE_RECOVER_EARLY_MULT;
      const totalSec = this.attackRecoverFramesThisSwing() / 60;
      const earlyThreshold = totalSec - earlySec;
      if (this.attackTimer <= earlyThreshold) {
        this.attackTimer = totalSec;
      }
      this.whipWiggleActive = this.attackTimer > earlyThreshold;
      this.tickAttackAnimCues();
      return;
    }
    this.whipWiggleActive = false;
    if (this.attackTimer > 0) {
      this.tickAttackAnimCues();
      return;
    }
    if (this.attackPhase === 1) {
      this.attackPhase = 2;
      this.attackTimer = this.stats.attackActiveFrames / 60;
      this.fireAnimCuePhase(this.swordAttackCueKey(), 1, this.attackStartedOnGround);
    } else if (this.attackPhase === 2) {
      this.trySpawnAfterimage();
      this.attackPhase = 3;
      this.attackTimer = this.attackRecoverFramesThisSwing() / 60;
      this.fireAnimCuePhase(this.swordAttackCueKey(), 2, this.attackStartedOnGround);
    } else {
      this.cancelAttack();
      // Chain immediately if X was buffered during recover.
      this.tryBeginAttackFromBuffer(downHeld);
    }
    this.tickAttackAnimCues();
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

    if (this.heelys.isGlidePoseHold()) return;

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
    let frameSeconds = 1 / WALK_ANIM_FPS_AT_MAX / Math.max(0.05, t);
    if (this.isHeelysSkateSteerHeld()) {
      frameSeconds *=
        this.walkAnimFrame === 0 || this.walkAnimFrame === 2
          ? SKATE_STEER_STRIDE_HOLD_MULT
          : 1;
    }
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

  /**
   * When landing lock ends with Down queued, crouch and maybe start pending slide
   * (Java landing-lock end block).
   */
  private applyLandingLockCrouchAndSlide(
    map: TileMap,
    input: Input,
    left: boolean,
    right: boolean,
  ): void {
    if (
      !this.onGround ||
      this.landingLockFrames !== 0 ||
      this.jumpSquatRemaining !== 0 ||
      !this.crouchQueuedFromLanding
    ) {
      return;
    }
    this.crouching = true;
    this.duckHeld = true;
    this.applyHitboxHeight(PLAYER_CROUCH_H, map);
    this.crouchQueuedFromLanding = false;
    this.disc.tryPendingSlideAfterLandingLock(map, input, left, right, this.discHost());
  }

  private detectWalkOff(): void {
    if (
      this.wasOnGround &&
      !this.onGround &&
      this.jumpSquatRemaining === 0 &&
      this.vy >= 0 &&
      !this.disc.suppressesWalkOffLatch() &&
      !this.tickPedestalGroundContact &&
      !this.headband.isUpAttack() &&
      !this.headband.isSideAttack()
    ) {
      this.walkOffLedgeActive = true;
      this.walkOffFrozenFrame = this.walkAnimFrame;
      this.disc.onWalkOff();
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
   * Also ends air-dodge / clears airDodgeLockedUntilLand (Java endAirDodgeOnLand on land edge).
   */
  private applyLandingFromTouchdown(steerDir: number): void {
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
      this.disc.onPedestalRampTouchdown();
      return;
    }

    const pinnedFullWavedashResume = this.disc.pinnedFullWavedashResume();
    const wavedashTouchdown = this.disc.endAirDodgeOnLandIfNeeded(steerDir, this.discHost());

    this.pendingLandingDustQueue = true;

    if (pinnedFullWavedashResume) {
      this.walkOffLedgeActive = false;
    } else {
      this.normalJumpAirborne = false;
    }

    // Air frisbee throw cancels on landing (Java).
    if (this.isSubweaponAnimating() && !this.subweaponStartedOnGround) {
      this.cancelSubweaponAnim();
    }

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
      this.disc.endWallSlide();
      return;
    }

    if (this.disc.isHeavyActive()) {
      this.disc.cancelHeavyAttack();
      this.landingLockFrames = ATTACK_LANDING_LOCK_FRAMES;
      this.extendedFallFrames = 0;
      this.fallPhaseTimer = 0;
      this.justLanded = true;
      this.walkOffLedgeActive = false;
      this.climbing = false;
      this.climbShaftTx = -1;
      this.disc.endWallSlide();
      return;
    }

    let lock = Math.floor(this.extendedFallFrames / 5) * 2;
    if (this.walkOffLedgeActive) {
      lock = Math.max(lock, WALK_OFF_LANDING_LOCK_FRAMES);
    }
    lock = Math.min(lock, LANDING_LOCK_MAX);
    // Java AIR_DODGE_FORCED_LANDING_LAG is currently unreachable (cleared in endAirDodgeOnLand
    // before the lag check) — match that order; do not re-apply here.
    this.landingLockFrames = lock;
    this.extendedFallFrames = 0;
    this.fallPhaseTimer = 0;
    this.justLanded = lock > 0;
    this.walkOffLedgeActive = false;
    this.climbing = false;
    this.disc.endWallSlide();

    if (wavedashTouchdown && this.attackPhase === 0) {
      this.landedThisTick = true;
      this.landingLockFrames = Math.max(this.landingLockFrames, 1);
      this.extendedFallFrames = 0;
      this.fallPhaseTimer = 0;
      this.justLanded = true;
    }
  }

  private queueLandingDust(): void {
    const count = this.landingLockFrames >= LANDING_LOCK_MAX ? 2 : 1;
    this.pendingLandingDustPuffCount = count;
    this.pendingLandingDustBehindX = this.x + this.w * 0.5 - this.facing * 6;
    this.pendingLandingDustBehindY = this.y + this.h;
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

  /** Warp orb arrival — preserves horizontal momentum (Java applyWarpOrbTeleport). */
  applyWarpOrbTeleport(
    orbCenterX: number,
    orbFeetWorldY: number,
    snapFeetToSurface: boolean,
    map: TileMap,
    extraOneWayPlatforms: readonly Aabb[] | null,
  ): void {
    const keepVx = this.vx;
    let keepVy = snapFeetToSurface ? 0 : this.vy;
    this.x = orbCenterX - this.w * 0.5;
    if (snapFeetToSurface) {
      this.applyHitboxHeight(PLAYER_STAND_H, map);
      const feetOffset = this.collisionPoseAt(this.x, this.y).bounds().y +
        this.collisionPoseAt(this.x, this.y).bounds().h -
        this.y;
      this.y = orbFeetWorldY - feetOffset;
      this.onGround = true;
    } else {
      this.y = orbFeetWorldY - this.h * 0.5;
      this.onGround = false;
    }
    this.clampWarpHullInsideMap(map);
    this.pushStandHullOutOfSolids(map);
    if (this.overlapsSolid(map, this.collisionPoseAt(this.x, this.y))) {
      const tx = this.warpColumnTx(map);
      const groundTop = map.groundTopWorldYAtColumn(tx);
      this.applyHitboxHeight(PLAYER_STAND_H, map);
      const feetOffset = this.collisionPoseAt(this.x, this.y).bounds().y +
        this.collisionPoseAt(this.x, this.y).bounds().h -
        this.y;
      this.y = groundTop - feetOffset;
      this.onGround = true;
      keepVy = 0;
    } else if (snapFeetToSurface && this.feetOnOneWayDeck(map, extraOneWayPlatforms)) {
      this.onGround = true;
      keepVy = 0;
    }
    this.clampWarpHullInsideMap(map);
    this.vx = keepVx;
    this.vy = keepVy;
  }

  private feetOnOneWayDeck(map: TileMap, extraOneWayPlatforms: readonly Aabb[] | null): boolean {
    if (this.feetOnPlatformDeckOnly(map)) return true;
    if (!extraOneWayPlatforms) return false;
    const r = this.collisionPoseAt(this.x, this.y).bounds();
    const feet = r.y + r.h;
    for (const deck of extraOneWayPlatforms) {
      if (feet >= deck.y - 1.5 && feet <= deck.y + 4.0 && r.x + r.w > deck.x + 1e-3 && r.x < deck.x + deck.w - 1e-3) {
        return true;
      }
    }
    return false;
  }

  private warpColumnTx(map: TileMap): number {
    const tx = Math.floor((this.x + this.w * 0.5) / TILE_SIZE);
    return Math.max(0, Math.min(map.width - 1, tx));
  }

  private clampWarpHullInsideMap(map: TileMap): void {
    const margin = 1;
    const mapW = map.width * TILE_SIZE;
    const mapH = map.height * TILE_SIZE;
    let r = this.collisionPoseAt(this.x, this.y).bounds();
    if (r.x < margin) this.x += margin - r.x;
    r = this.collisionPoseAt(this.x, this.y).bounds();
    if (r.x + r.w > mapW - margin) this.x -= r.x + r.w - (mapW - margin);
    r = this.collisionPoseAt(this.x, this.y).bounds();
    if (r.y < margin) this.y += margin - r.y;
    r = this.collisionPoseAt(this.x, this.y).bounds();
    if (r.y + r.h > mapH - margin) this.y -= r.y + r.h - (mapH - margin);
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
  }

  private applyCrouchHeight(map: TileMap): void {
    if (this.climbing) return;
    let targetH = PLAYER_STAND_H;
    // Short crouch-jump hitbox only after lift-off — not during jumpsquat (Java).
    if (this.crouchJumpMode && !this.onGround && this.jumpSquatRemaining === 0) {
      targetH = PLAYER_CROUCH_H;
    } else if (this.boredPoseActive && this.onGround) {
      // Sit uses crouch height without setting crouching (Down remains duck).
      targetH = PLAYER_CROUCH_H;
    } else if (this.headband.isCrouchKick() && this.onGround) {
      targetH = PLAYER_CROUCH_H;
    } else if (!this.onGround) {
      targetH = PLAYER_STAND_H;
    } else if (this.jumpSquatRemaining > 0 || (!this.onGround && this.vy < 0)) {
      targetH = PLAYER_STAND_H;
    } else {
      targetH = this.crouching ? PLAYER_CROUCH_H : PLAYER_STAND_H;
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
    const heelysOwned = st.heelysStacks > 0;
    const commitLock =
      this.attackPhase >= 2 ||
      this.disc.heavyFacingLocked() ||
      this.disc.slideMoveLock() ||
      this.disc.wallSlideMoveLock();
    const airDodgeMoveLock = this.disc.airDodgeMoveLock();
    const subweaponFacingLocked = this.isSubweaponAnimating() && this.subweaponFrameIndex > 0;
    const heavyFacingLocked = this.disc.heavyFacingLocked();
    const carryFacingLocked = this.carry.isThrowing() && this.carry.throwFrameIndex() > 0;
    const carryMoveLock = this.carry.blocksMovement();
    const grounded = this.onGround || this.jumpSquatRemaining > 0;
    const traction = this.tickFeetOnIce ? ICE_TRACTION_MULT : 1;

    let dir = 0;
    if (!(crouchHeld && this.jumpSquatRemaining === 0 && this.onGround)) {
      if (input.left) dir -= 1;
      if (input.right) dir += 1;
    }

    // Air-dodge sets vx/vy in applyMovementOverrides — do not brake or re-steer (Java moveLocked).
    if (airDodgeMoveLock) {
      this.finalizeHeelysPose(0);
      return;
    }

    // Post-dodge ground coast owns horizontal speed (Java airDodgeGroundCoast branch before ground accel).
    if (this.disc.airDodgeGroundCoast) {
      if (
        dir !== 0 &&
        !subweaponFacingLocked &&
        !carryFacingLocked &&
        !heavyFacingLocked &&
        !this.disc.wallSlideActive
      ) {
        this.facing = dir;
      }
      this.finalizeHeelysPose(dir);
      return;
    }

    if (commitLock) {
      if (grounded) {
        this.vx = heelysOwned
          ? this.heelys.applyBrake(dt, this.vx, st, traction)
          : approach(this.vx, 0, st.groundBrake * dt);
      }
      this.finalizeHeelysPose(0);
      return;
    }

    if (dir !== 0 && !subweaponFacingLocked && !carryFacingLocked && !heavyFacingLocked && !this.disc.wallSlideActive) {
      const facingBefore = this.facing;
      this.facing = dir;
      // Subweapon frame-0 B-reverse (Java).
      if (
        this.isSubweaponAnimating() &&
        this.subweaponFrameIndex === 0 &&
        this.facing !== facingBefore
      ) {
        this.vx = -this.vx;
      }
    }

    if (carryMoveLock) {
      this.vx = heelysOwned
        ? this.heelys.applyBrake(dt, this.vx, st, traction)
        : approach(this.vx, 0, st.groundBrake * dt);
      this.finalizeHeelysPose(dir);
      return;
    }

    if (this.carry.throwBrakesHorizontal()) {
      this.vx = heelysOwned
        ? this.heelys.applyBrake(dt, this.vx, st, traction)
        : approach(this.vx, 0, st.groundBrake * dt);
      this.finalizeHeelysPose(dir);
      return;
    }

    if (grounded && crouchHeld && this.jumpSquatRemaining === 0) {
      if (heelysOwned) {
        this.heelys.cancelPumpTap();
        this.vx = this.heelys.applyBrake(dt, this.vx, st, traction);
      } else {
        this.vx = approach(this.vx, 0, st.groundBrake * dt);
      }
      this.finalizeHeelysPose(dir);
      return;
    }

    if (grounded) {
      const cap = landingLocked ? st.maxAirSpeed : st.maxGroundSpeed;
      if (heelysOwned) {
        this.vx = this.heelys.applyGroundHorizontal(
          dt,
          dir,
          this.vx,
          cap,
          !landingLocked,
          st.heelysStacks,
          st,
          traction,
          (scaleX, frames) => this.squash.applyStretchX(scaleX, frames),
        );
        this.vx = this.heelys.clampGroundVx(this.vx, st.heelysStacks, cap, st, !landingLocked);
      } else if (dir !== 0) {
        const target = dir * cap;
        const reversing = Math.sign(this.vx) !== 0 && Math.sign(this.vx) !== dir;
        const rate = (reversing ? st.groundBrake : st.groundAccel) * traction;
        this.vx = approach(this.vx, target, rate * dt);
        this.vx = Math.max(-cap, Math.min(cap, this.vx));
      } else {
        this.vx = approach(this.vx, 0, st.groundFriction * traction * dt);
      }
    } else {
      let airCap = this.walkOffLedgeActive
        ? st.maxAirSpeed * WALK_OFF_AIR_CAP_FRAC
        : st.maxAirSpeed;
      if (st.pinkScarfStacks > 0 && this.jumpHeld) {
        airCap += SCARF_GLIDE_AIR_SPEED_BONUS;
      }
      if (heelysOwned) {
        airCap = this.heelys.airSpeedCap(st.heelysStacks, airCap, st);
      }
      this.applyAirHorizontal(dt, dir, airCap);
    }
    this.finalizeHeelysPose(dir);
  }

  private finalizeHeelysPose(steerDir: number): void {
    this.heelys.finalizePoseFlags(
      this.stats.heelysStacks,
      this.onGround,
      this.crouching,
      this.vx,
      this.stats.maxGroundSpeed,
      steerDir,
      this.disc.slideActive,
      this.climbing,
    );
  }

  isHeelysGlidePoseHold(): boolean {
    return this.heelys.isGlidePoseHold();
  }

  isHeelysSkatePose(): boolean {
    return this.heelys.isSkatePose(
      this.stats.heelysStacks,
      this.onGround,
      this.crouching,
      this.vx,
      this.stats.maxGroundSpeed,
    );
  }

  isHeelysSkateSteerHeld(): boolean {
    return this.heelys.isSkateSteerHeld();
  }

  /** Weak air steer; preserve vx when neutral (Java applyAirHorizontal). */
  private applyAirHorizontal(dt: number, dir: number, maxSpeed: number): void {
    const st = this.stats;
    const scarfMult =
      st.pinkScarfStacks > 0 && !this.climbing && !this.onGround ? SCARF_AIR_CONTROL_MULT : 1;
    if (dir !== 0) {
      const target = dir * maxSpeed;
      const airAccel = st.airAccel * AIR_STEER_FRAC * scarfMult;
      const airBrake = st.airBrake * AIR_STEER_FRAC * scarfMult;
      const reversing = Math.sign(this.vx) !== 0 && Math.sign(this.vx) !== dir;
      this.vx = approach(this.vx, target, (reversing ? airBrake : airAccel) * dt);
    }
    this.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.vx));
  }

  /**
   * PONCHO mid-air flap + PINK_SCARF jump-tap stall (Java ~3528–3583).
   * Poncho wins over scarf stall on the same tick.
   */
  private applyPonchoAndScarfAirMobility(
    input: Input,
    groundJumpClaimsJump: boolean,
  ): void {
    if (this.ponchoFlapCooldown > 0) this.ponchoFlapCooldown--;
    let ponchoFlapThisTick = false;
    if (
      this.stats.ponchoStacks > 0 &&
      input.jumpPressed &&
      !this.onGround &&
      !groundJumpClaimsJump &&
      this.jumpSquatRemaining === 0 &&
      this.coyoteTimer <= 0 &&
      !this.climbing &&
      !this.disc.slideActive &&
      !this.disc.wallSlideActive &&
      this.getupLockFrames <= 0 &&
      this.attackPhase === 0 &&
      !this.disc.airDodgeActionLock() &&
      !this.crawlerHatBlockJump &&
      !this.carry.blocksJump() &&
      this.ponchoFlapCooldown === 0
    ) {
      const fallingFlap = this.vy > 0;
      const flapHeight = fallingFlap ? PONCHO_FLAP_FALLING_HEIGHT_PX : PONCHO_FLAP_HEIGHT_PX;
      const flapVy = ponchoFlapUpwardVy(flapHeight);
      if (fallingFlap) this.vy = -flapVy;
      else this.vy -= flapVy;
      this.ponchoFlapCooldown = PONCHO_FLAP_COOLDOWN_FRAMES;
      this.jumpBufferTimer = 0;
      this.squash.applyStretchY(PONCHO_FLAP_STRETCH_Y, PONCHO_FLAP_STRETCH_RECOVER_FRAMES);
      ponchoFlapThisTick = true;
      this.walkOffLedgeActive = false;
    }

    if (
      !ponchoFlapThisTick &&
      this.stats.pinkScarfStacks > 0 &&
      !this.onGround &&
      !this.climbing &&
      this.jumpSquatRemaining === 0 &&
      !this.disc.airDodgeActionLock() &&
      this.attackPhase === 0 &&
      !this.carry.blocksJump() &&
      input.jumpPressed &&
      this.vy > 0
    ) {
      this.vy = 0;
      this.walkOffLedgeActive = false;
    }
  }

  isAirDodgeGroundCoast(): boolean {
    return this.disc.airDodgeGroundCoast;
  }

  isHorizontalSteerHeld(): boolean {
    return this.horizontalSteerHeld;
  }

  private applyJumpLogic(
    _dt: number,
    crouchHeld: boolean,
    map: TileMap,
    left: boolean,
    right: boolean,
  ): void {
    // Getup clears jumpsquat. Sword does not — X during squat starts a rising attack (Java).
    if (this.getupLockFrames > 0) {
      if (this.jumpSquatRemaining > 0) {
        this.jumpSquatRemaining = 0;
        this.shyMaskCharge.cancelSuperJumpWindup();
      }
      return;
    }
    if (this.carry.blocksJump()) return;

    if (this.jumpSquatRemaining > 0) {
      this.vy = 0;
      this.jumpSquatMaxAbsVx = Math.max(this.jumpSquatMaxAbsVx, Math.abs(this.vx));
      if (this.disc.airDodgeGroundCoast) {
        const steer = (left ? -1 : 0) + (right ? 1 : 0);
        this.jumpSquatMaxAbsVx = Math.max(
          this.jumpSquatMaxAbsVx,
          this.disc.airDodgeCoastCombinedAbsVx(steer),
        );
      }
      return;
    }

    // Block starting a new jumpsquat while swinging; existing wind-up already handled above.
    if (this.attackPhase !== 0) return;
    if (this.disc.isHeavyActive()) return;
    if (this.disc.airDodgeActionLock()) return;

    // Java standsOnFullWavedashSupport — ground, coyote, or platform/pedestal deck hull.
    const canJump = this.standsOnWavedashSupport(map);
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
      VernanAnimCueRuntime.applyOnEnter(
        this.squash,
        (cue) => this.applyAnimCueImpulse(cue),
        "jumpsquat",
        this.onGround,
      );
      this.jumpSquatMaxAbsVx = Math.abs(this.vx);
      if (this.disc.airDodgeGroundCoast) {
        const steer = (left ? -1 : 0) + (right ? 1 : 0);
        this.jumpSquatMaxAbsVx = Math.max(
          this.jumpSquatMaxAbsVx,
          this.disc.airDodgeCoastCombinedAbsVx(steer),
        );
      }
      this.jumpBufferTimer = 0;
      this.vy = 0;
      this.shyMaskCharge.latchSuperJumpWindup();
      this.crouchJumpMode =
        this.onGround &&
        crouchHeld &&
        !(this.stats.shyMaskStacks > 0 && this.shyMaskCharge.charged());
      this.landingLockFrames = 0;
      this.landedThisTick = false;
      this.crouchQueuedFromLanding = false;
      this.walkOffLedgeActive = false;
      this.climbing = false;
      this.climbShaftTx = -1;
    }
  }

  /** Ground / coyote / platform deck for jumpsquat start + lift-off (Java standsOnFullWavedashSupport). */
  private standsOnJumpSupport(map: TileMap): boolean {
    return this.standsOnWavedashSupport(map);
  }

  /**
   * Decrement jumpsquat after collide/walk-off, then apply impulse + first vertical step (Java ~3938).
   * Dodge buffer / pending during squat wins → full wavedash (no jump impulse).
   */
  private finishJumpSquat(map: TileMap, dt: number, input: Input): void {
    if (this.jumpSquatRemaining <= 0) return;
    this.jumpSquatRemaining--;
    if (this.jumpSquatRemaining !== 0) return;
    if (!this.standsOnJumpSupport(map)) return;

    const left = input.left;
    const right = input.right;
    const steerDir = (left ? -1 : 0) + (right ? 1 : 0);
    if (this.disc.tryJumpsquatCompletionAirDodge(input, map, left, right, this.discHost())) {
      return;
    }

    const jumpFromAirDodgeCoast = this.disc.airDodgeGroundCoast;
    if (jumpFromAirDodgeCoast) {
      this.disc.clearCoastForJumpLiftOff();
    }

    const shyMaskSuperJump = this.shyMaskCharge.consumeSuperJumpAtLiftOff();
    let vel = shyMaskSuperJump ? SHY_MASK_SUPER_JUMP_VEL : this.stats.jumpVel;
    this.jumpSquatMaxAbsVx = Math.max(this.jumpSquatMaxAbsVx, Math.abs(this.vx));
    if (jumpFromAirDodgeCoast) {
      this.jumpSquatMaxAbsVx = Math.max(
        this.jumpSquatMaxAbsVx,
        this.disc.airDodgeCoastCombinedAbsVx(steerDir),
      );
    }
    const highRunSpeed =
      !shyMaskSuperJump &&
      (this.jumpSquatMaxAbsVx >= this.stats.maxGroundSpeed * 0.99 ||
        (jumpFromAirDodgeCoast && Math.abs(this.vx) >= this.stats.maxGroundSpeed * 0.99));
    const highAirSpeed =
      !shyMaskSuperJump && this.jumpSquatMaxAbsVx >= this.stats.maxAirSpeed * 0.99;
    if (highRunSpeed || highAirSpeed) {
      vel *= HIGH_SPEED_JUMP_VEL_MULT;
    }
    this.vy = -vel;
    this.onGround = false;
    this.disc.airDodgeAvailable = true;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.walkOffLedgeActive = false;
    this.jumpHeld = true;

    if (this.crouchJumpMode) {
      this.applyHitboxHeight(PLAYER_CROUCH_H, map);
    }

    if (shyMaskSuperJump) {
      this.crouchJumpMode = false;
      this.squash.applyStretchY(
        SHY_MASK_SUPER_JUMP_STRETCH_Y,
        SquashStretch.DEFAULT_RECOVER_FRAMES,
      );
    } else {
      VernanAnimCueRuntime.applyOnStripIndex(
        this.squash,
        (cue) => this.applyAnimCueImpulse(cue),
        "jump",
        0,
        -1,
        false,
      );
    }

    // Coast jump keeps wavedash horizontal momentum; normal jump caps to air speed.
    if (!jumpFromAirDodgeCoast) {
      const jumpVxCap =
        this.stats.heelysStacks > 0
          ? this.heelys.airSpeedCap(this.stats.heelysStacks, this.stats.maxAirSpeed, this.stats)
          : this.stats.maxAirSpeed;
      this.vx = Math.max(-jumpVxCap, Math.min(jumpVxCap, this.vx));
    }

    // Stand hull before jump strip — prev feet must match grounded pose (Java poseBeforeLift).
    const beforeImpulse = this.hitboxPose();
    const prevFeet = JumpFoot.jumpFootProbeFrom(beforeImpulse);
    const prevTop = beforeImpulse.bounds().y;
    this.normalJumpAirborne = !this.crouchJumpMode;
    this.y += this.vy * dt;
    this.onGround = false;
    this.resolveVertical(map, prevFeet, prevTop);
  }

  private applyGravity(dt: number): void {
    let g = GRAVITY;
    g *= this.stats.shyMaskGravityMult * this.stats.kaleidoscopeGravityMult;
    if (this.disc.wallSlideActive) {
      g *= this.disc.wallSlideGravityMult();
    }
    if (this.vy < 0 && !this.jumpHeld) {
      g *= GRAVITY_RELEASE_MULT;
    } else if (this.walkOffLedgeActive && this.vy >= 0) {
      // Walk-off: max gravity while falling so stepping down feels snappy (Java).
      g *= GRAVITY_RELEASE_MULT;
    }
    const scarfFloat =
      this.stats.pinkScarfStacks > 0 &&
      !this.onGround &&
      !this.climbing &&
      this.vy > 0 &&
      this.jumpHeld;
    if (scarfFloat) {
      g *= SCARF_FLOAT_GRAVITY_SCALE;
      this.walkOffLedgeActive = false;
    }
    this.vy += g * dt;
    let vyCap = MAX_FALL;
    if (this.disc.wallSlideActive) {
      vyCap *= this.disc.wallSlideGravityMult();
    }
    if (scarfFloat) vyCap *= SCARF_FLOAT_GRAVITY_SCALE;
    if (this.vy > vyCap) this.vy = vyCap;
  }

  private tryLadderJumpOff(input: Input): void {
    if (!this.climbing) return;
    if (!input.jumpPressed) return;
    if (this.attackPhase !== 0) return;
    if (this.getupLockFrames > 0) return;
    if (this.jumpSquatRemaining > 0) return;
    // Java `landingLocked` — grounded lag only; airborne climb may jump off mid-lag.
    if (this.landingLockFrames > 0 && this.onGround) return;

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
    this.crouchQueuedFromLanding = false;
    this.crouchJumpMode = false;
    this.normalJumpAirborne = true;
    this.walkOffLedgeActive = false;
    this.coyoteTimer = 0;
    this.jumpHeld = true;
    VernanAnimCueRuntime.applyOnStripIndex(
      this.squash,
      (cue) => this.applyAnimCueImpulse(cue),
      "jump",
      0,
      -1,
      false,
    );
  }

  private updateClimbLatch(
    input: Input,
    map: TileMap,
    upHeldIn: boolean = input.up,
    downIn: boolean = input.down && !input.up,
  ): void {
    if (this.getupLockFrames > 0) return;
    if (this.carry.blocksClimb()) return;
    if (this.blocksLadderLatch()) return;

    let upHeld = upHeldIn;
    let down = downIn;

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
          this.noteLadderGrabbed();
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

  private updateClimbMove(
    dt: number,
    input: Input,
    map: TileMap,
    upHeldIn: boolean = input.up,
    downIn: boolean = input.down && !input.up,
  ): void {
    const upHeld = upHeldIn;
    const down = downIn;
    // Shaft centering runs after collide (Java moveAndCollide) — not here.
    this.vx = approach(this.vx, 0, this.stats.airBrake * dt);

    if (down) {
      this.vy = this.stats.climbSpeed;
    } else if (upHeld) {
      if (this.getupLockFrames === 0 && this.canStepOffLadderTop(map)) {
        this.beginGetup("ladder_top", map, false, true);
        this.vy = 0;
      } else if (this.getupLockFrames === 0) {
        this.vy = -this.stats.climbSpeed;
      } else {
        this.vy = 0;
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
   * @returns true when mount getup began this tick (Java mouthMountReady).
   */
  private tickMouthDoubleTapMount(
    input: Input,
    map: TileMap,
    landingLocked: boolean,
    getupActionLock: boolean,
  ): boolean {
    if (landingLocked || getupActionLock) {
      this.ladderMouthDownTapFrames = 0;
      return false;
    }
    if (!this.standingOnMouthDeckForMount(map)) {
      this.ladderMouthDownTapFrames = 0;
    } else if (this.ladderMouthDownTapFrames > 0) {
      this.ladderMouthDownTapFrames--;
    }

    if (!input.downPressed || getupActionLock) return false;

    let doubleTap = false;
    if (this.ladderMouthDownTapFrames > 0 && this.standingOnMouthDeckForMount(map)) {
      doubleTap = true;
      this.ladderMouthDownTapFrames = 0;
    } else if (this.standingOnMouthDeckForMount(map)) {
      this.ladderMouthDownTapFrames = LADDER_MOUTH_DOUBLE_TAP_FRAMES;
    }

    const droppableLadderMouth = this.ladderShaftBelowFeetPlatform(map);
    const groundedForLadderThrough =
      this.onGround ||
      (droppableLadderMouth &&
        this.vy >= 0 &&
        this.standPoseFeetOnSupportIgnoringClimb(map));
    const mouthMountReady =
      doubleTap &&
      groundedForLadderThrough &&
      !this.blocksLadderLatch() &&
      !this.carry.blocksOneWayDrop() &&
      this.standingOnMouthDeckForMount(map) &&
      !this.climbing &&
      !this.carry.blocksClimb() &&
      this.getupLockFrames === 0;

    if (mouthMountReady) {
      this.crouching = false;
      this.walkOffLedgeActive = false;
      this.beginGetup("ladder_mount", map, true, false);
      return true;
    }
    return false;
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
    this.getupPostLatchFrames = 0;
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
    this.getupPostLatchFrames = 0;
    this.getupRenderHold = false;
  }

  private finishGetup(map: TileMap): void {
    const finished = this.getupKind;
    if (finished === "ladder_mount") {
      if (this.getupMouthCol >= 0 && this.getupMouthRungTy >= 0) {
        this.climbShaftTx = this.getupMouthCol;
        this.climbing = true;
        this.noteLadderGrabbed();
        this.onGround = false;
        this.vx = 0;
        this.vy = this.getupLatchDown ? this.stats.climbSpeed : 0;
        // Height first, then land snap — Java finishGetup. Setting y while still crouched
        // then growing shifts feet by STAND_H - CROUCH_H (~6px) above the rung.
        this.applyHitboxHeight(PLAYER_STAND_H, map);
        this.x = this.getupLandX;
        this.y = this.getupLandY;
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
      if (this.onGround) {
        this.walkOffLedgeActive = false;
      }
    }
    if (this.getupLatchDown || this.getupLatchUp) {
      this.getupPostLatchFrames = 1;
    }
    // Mount enters climb on the shaft — hold would draw getup one more frame there (visible flicker).
    this.getupRenderHold = finished === "ladder_top";
    this.getupKind = "none";
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
    if (col < 0) col = this.primaryLadderColumn(map);
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
    let col = this.climbShaftColumn(map);
    if (col < 0) col = this.primaryLadderColumn(map);
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

  private primaryLadderColumn(map: TileMap): number {
    return this.nearestIntersectingLadderColumn(map);
  }

  private noteLadderGrabbed(): void {
    this.disc.refreshAirDodgeFromLadder();
  }

  /** Sword/heavy/headband/subweapon/slide/throw/air-dodge must finish before ladder latch or mount. */
  private blocksLadderLatch(): boolean {
    return (
      this.isAttacking() ||
      this.isSubweaponAnimating() ||
      this.carry.isThrowing() ||
      this.disc.slideActive ||
      this.disc.airDodgeBlocksLadderLatch()
    );
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
    // Crouch hull can flicker airborne while stand-feet still rest on the mouth — gate on stand support (Java).
    const restingOnMouthDeck =
      this.onGround || this.standPoseFeetOnSupportIgnoringClimb(map);
    if (!restingOnMouthDeck && this.vy > 0) return false;
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
    const r = this.standCollisionPoseAt(this.x, this.y).bounds();
    const centerX = r.x + r.w * 0.5;
    const leftTile = Math.floor((r.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((r.x + r.w - 0.001) / TILE_SIZE);
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
    const r = this.standCollisionPoseAt(this.x, this.y).bounds();
    const footBottom = r.y + r.h;
    const tyCenter = Math.floor((footBottom - 1e-3) / TILE_SIZE);
    for (let dty = -1; dty <= 1; dty++) {
      const ty = tyCenter + dty;
      if (ty < 0 || ty >= map.height) continue;
      if (!map.isPlatformTile(columnTx, ty)) continue;
      if (mouthRungRowBelowDeck(map, columnTx, ty) < 0) continue;
      const deckTop = ty * TILE_SIZE;
      if (footBottom < deckTop - 1e-3) continue;
      if (footBottom > deckTop + PLATFORM_DECK_SLACK_PX) continue;
      const tileLeft = columnTx * TILE_SIZE;
      const tileRight = (columnTx + 1) * TILE_SIZE;
      const overlap = Math.min(r.x + r.w, tileRight) - Math.max(r.x, tileLeft);
      if (overlap + 1e-6 < LADDER_MOUTH_LATCH_MIN_OVERLAP_PX) continue;
      return ty;
    }
    return -1;
  }

  /**
   * Standing hull on support even when crouch clears onGround (Java standPoseFeetOnSupportIgnoringClimb).
   * Used for mouth mount readiness and drop-through latch gating.
   */
  private standPoseFeetOnSupportIgnoringClimb(map: TileMap): boolean {
    if (this.vy < 0) return false;
    const pose = this.standCollisionPoseAt(this.x, this.y);
    const r = pose.bounds();
    const leftTile = Math.floor((r.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((r.x + r.w - 0.001) / TILE_SIZE);
    const footBottom = r.y + r.h;
    const tyCenter = Math.floor((footBottom - 1e-3) / TILE_SIZE);
    const scanLo = Math.max(0, leftTile - 1);
    const scanHi = Math.min(map.width - 1, rightTile + 1);
    for (let dty = -1; dty <= 1; dty++) {
      const ty = tyCenter + dty;
      if (ty < 0 || ty >= map.height) continue;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!pose.intersectsRect({ x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE })) {
          continue;
        }
        if (map.isSolidTile(tx, ty)) return true;
      }
      for (let tx = scanLo; tx <= scanHi; tx++) {
        if (!map.isPlatformTile(tx, ty)) continue;
        const tileLeft = tx * TILE_SIZE;
        const tileRight = (tx + 1) * TILE_SIZE;
        if (r.x + r.w <= tileLeft + 1e-6 || r.x >= tileRight - 1e-6) continue;
        const deckTop = ty * TILE_SIZE;
        if (footBottom >= deckTop - 1e-3 && footBottom <= deckTop + PLATFORM_DECK_SLACK_PX) {
          return true;
        }
      }
    }
    this.rebuildStandSegments();
    if (
      StandSurfaceQuery.isGroundedUnderFeet(
        r.x,
        r.x + r.w,
        footBottom,
        this.vy,
        this.tickStandSegments,
        this.tickPedestalPlatforms,
      )
    ) {
      return true;
    }
    return false;
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
    if (!this.climbing && this.vy >= -1e-3 && !this.disc.fullWavedashDefersGroundFlag()) {
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
    // Java: always probe both jump feet when vertical resolve did not land (not jump-hull gated).
    // Forced-aerial wavedash frame keeps onGround false until after-move re-pin.
    if (!this.onGround && !this.disc.fullWavedashDefersGroundFlag()) {
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
    const wallSide = this.vx > 0 ? 1 : -1;
    this.vx = 0;
    if (xBefore !== this.x) {
      this.horizontalWallContactResolvedThisStep = true;
      this.horizontalWallContactSide = wallSide;
    }
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

      // While X-overlapping a pedestal, prefer its deck over the solid floor under it —
      // but only while feet can still catch the deck. Past the slack window, solid floors
      // must catch again or a missed pedestal land tunnels into the void (jump-into-item /
      // pickup-overlay resume). Java suppresses unconditionally; this is the safety net.
      const footSupportY = JumpFoot.footProbeSupportY(nextFeet);
      const suppressSolidsUnderPedestal =
        onPedestalHull &&
        !Number.isNaN(pedestalSupportY) &&
        footSupportY <= pedestalSupportY + PLATFORM_DECK_SLACK_PX + 1e-3;

      for (let ty = tyLo; ty <= tyHi; ty++) {
        const floorY = ty * TILE_SIZE;
        if (JumpFoot.footProbeAllPrevBelowFloor(prevFeet, floorY)) continue;
        if (JumpFoot.footProbeAllNextAboveFloor(nextFeet, floorY)) continue;
        if (suppressSolidsUnderPedestal && floorY >= pedestalSupportY - 1e-3) {
          continue;
        }

        for (let tx = leftTile; tx <= rightTile; tx++) {
          const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
          if (!pose.intersectsRect(tile) || !map.isSolidTile(tx, ty)) continue;
          // Solids: crossed-from-above only (Java footDescendsOntoFloor) — not deck rest.
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
          JumpFoot.noteLandingFloor(floorY, leadHit, trailHit, landing);
        }

        // Java resolveVertical: platform scan is not gated on onPedestalHull (only
        // isGrounded skips one-ways while on the hull). The ty continue above already
        // skips decks at/below pedestal support while still catchable.
        if (!this.climbing) {
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
        if (!this.disc.fullWavedashDefersGroundFlag()) {
          this.onGround = true;
        }
        if (this.climbing) {
          this.climbing = false;
          this.climbShaftTx = -1;
        }
      } else if (this.tickIceBlocks.length > 0 && this.vy >= 0) {
        const prevBottom = Math.max(prevFeet.leadY, prevFeet.trailY);
        const nextBottom = Math.max(nextFeet.leadY, nextFeet.trailY);
        const iceDeck = landingDeckTopY(
          prevBottom,
          nextBottom,
          this.vy,
          b.x,
          b.x + b.w,
          this.tickIceBlocks,
        );
        if (Number.isFinite(iceDeck)) {
          this.snapFootToFloorY(iceDeck, true, true);
          this.vy = 0;
          if (!this.disc.fullWavedashDefersGroundFlag()) {
            this.onGround = true;
          }
        }
      }
    } else if (this.vy < 0) {
      // Rising — tile ceilings (Java resolveVertical) then ice bottoms (resolveVerticalIceSolids).
      const nextTop = b.y;
      const leftTile = Math.floor((b.x + 0.001) / TILE_SIZE);
      const rightTile = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
      const topTile = Math.floor((nextTop + 1e-4) / TILE_SIZE);
      const ceilingBottomY = (topTile + 1) * TILE_SIZE;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!map.isSolidTile(tx, topTile)) continue;
        const tile = { x: tx * TILE_SIZE, y: topTile * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
        if (!pose.intersectsRect(tile)) continue;
        const crossedIntoCeiling = prevTop >= ceilingBottomY - 1e-3;
        if (crossedIntoCeiling && nextTop <= ceilingBottomY + 1e-3) {
          this.y = ceilingBottomY;
          this.vy = 0;
        }
        break;
      }
      if (this.tickIceBlocks.length > 0 && this.vy < 0) {
        for (const block of this.tickIceBlocks) {
          const ice = block.rect();
          if (b.x >= ice.x + ice.w || b.x + b.w <= ice.x) continue;
          if (!pose.intersectsRect(ice)) continue;
          const iceCeilingBottomY = ice.y + ice.h;
          const crossedIntoCeiling = prevTop >= iceCeilingBottomY - 1e-3;
          if (crossedIntoCeiling && nextTop <= iceCeilingBottomY + 1e-3) {
            this.y = iceCeilingBottomY;
            this.vy = 0;
            break;
          }
        }
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
    if (this.tickIceBlocks.length > 0 && feetOnIce(this, this.tickIceBlocks)) {
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
          // Only floor-like solids (feet near/inside tile top). Flush ceiling contact after a
          // bonk must not count — inclusive SAT treats head-on-tile-bottom as overlap, unlike
          // Java Area, and that falsely grounded Vernan / triggered walk-off.
          const deckTop = ty * TILE_SIZE;
          const supportY = JumpFoot.footProbeSupportY(footProbe);
          const nearDeck =
            StandSurfaceQuery.footNearDeck(footProbe.leadY, deckTop) ||
            StandSurfaceQuery.footNearDeck(footProbe.trailY, deckTop);
          const embeddedInFloorSlab =
            supportY > deckTop + 1e-3 && supportY < deckTop + TILE_SIZE - 1e-3;
          if (nearDeck || embeddedInFloorSlab) {
            return true;
          }
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
    if (this.tickIceBlocks.length > 0 && intersectsAnyIce(this.tickIceBlocks, pose)) {
      return true;
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
