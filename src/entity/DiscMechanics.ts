import {
  freezeFrames,
  type Aabb,
  type KnockbackKind,
  type WeaponStrike,
} from "../combat/CombatMath";
import { HitboxPose } from "../collision/HitboxPose";
import {
  ATTACK_ACTIVE_FRAMES,
  ATTACK_RECOVER_EARLY_FRAMES,
  ATTACK_RECOVER_LATE_FRAMES,
  ATTACK_WINDUP_FRAMES,
} from "../config/CombatStats";
import { PLAYER_CROUCH_H, PLAYER_STAND_H, PLATFORM_DECK_SLACK_PX } from "../config/Physics";
import { SLIDE_KICK_ACTIVE_LOCAL, SLIDE_KICK_ACTIVE_PIVOT_X } from "../config/HitboxValues";
import { enemyIntersectsMelee } from "../combat/MeleeIntersection";
import type { Input } from "../input/Input";
import { AutismCombat } from "../item/effect/AutismCombat";
import { contactBetweenHurtAndEnemy } from "../item/effect/FuzzyHatContactEffect";
import { KaleidoscopeEyeCombat } from "../item/effect/kaleidoscope/KaleidoscopeEyeCombat";
import { ShieldBreakerCombat } from "../item/effect/ShieldBreakerCombat";
import type { GardeningGlovesHost } from "../carry/GardeningGlovesHost";
import { FIXED_STEP_HZ, TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import type { PlayerStats } from "./PlayerStats";
import {
  SLIDE_BODY_SPRITE_H,
  heavyAttackHitbox,
  swordKnockbackKind,
} from "./WeaponHitbox";
import type { SwordVisual } from "../combat/SwordVisual";
import { sampleShake } from "../combat/HitlagState";

/** Chord window for slide / heavy (Java Player.CHORD_BUFFER). */
const CHORD_BUFFER = 0.18;

const SLIDE_SQUASH_X = 1.1;
const SLIDE_SQUASH_RECOVER_FRAMES = 8;
const WALLSLIDE_ENTRY_STRETCH_Y = 1.2;
const WALLSLIDE_ENTRY_STRETCH_FRAMES = 10;
const WALLSLIDE_GRAVITY_MULT = 0.8;
const WALL_JUMP_AIR_PUSH_FRAMES = 10;
const WALL_CONTACT_PROBE_INSET_PX = 4;
const WALLSLIDE_DUST_INTERVAL_PX = 8;
const SLIDE_DUST_INTERVAL_PX = 8;
const WALLSLIDE_DUST_HAND_Y_FRAC = 0.38;
const WALLSLIDE_DUST_HAND_Y_OFFSET_PX = 8;
const SLIDE_DUST_HAND_LOCAL_X = 31;

const AIR_DODGE_TOTAL_FRAMES = 48;
const AIR_DODGE_POSE0_FRAMES = 6;
const AIR_DODGE_POSE2_START_FRAME = 30;
const AIR_DODGE_MOVE_START_FRAME = 0;
const AIR_DODGE_MOVE_END_FRAME = 7;
const AIR_DODGE_INTANGIBLE_START = 4;
const AIR_DODGE_INTANGIBLE_END = 29;
const AIR_DODGE_FORCED_LANDING_LAG = 20;
const AIR_DODGE_DISTANCE_PX = 20;
const AIR_DODGE_BUFFER = 0.18;
const AIR_DODGE_EASE_OUT_FRAC = 0.3;
const AIR_DODGE_GRAVITY_START_FRAMES = 3;
const AIR_DODGE_GRAVITY_END_FRAMES = 20;
const AIR_DODGE_FLASH_ALPHA_ON = 128;
const AIR_DODGE_FLASH_ALPHA_OFF = 64;

const HEAVY_ATTACK1_TICKS = [6, 6, 4, 4, 4, 4, 6, 6] as const;
const HEAVY_ATTACK1_HIT_FRAME = 2;
const HEAVY_ATTACK1_LATE_RECOVER_FRAME = 6;
const HEAVY_ATTACK_DAMAGE_MULT = 2.5;
const HEAVY_STAND_WINDUP_REF = ATTACK_WINDUP_FRAMES;
const HEAVY_ATTACK_ACTIVE_REF = ATTACK_ACTIVE_FRAMES;
const HEAVY_STAND_RECOVER_EARLY_REF = ATTACK_RECOVER_EARLY_FRAMES;
const HEAVY_STAND_RECOVER_LATE_REF = ATTACK_RECOVER_LATE_FRAMES;
const HEAVY_ATTACK_SCREEN_SHAKE_FRAMES = 4;
const HEAVY_ATTACK_SCREEN_SHAKE_AMP_DEVICE_PX = 4;

function airDodgeEasedProgress(t: number): number {
  t = Math.max(0, Math.min(1, t));
  const outStart = 1 - AIR_DODGE_EASE_OUT_FRAC;
  if (t >= outStart) {
    const u = (t - outStart) / AIR_DODGE_EASE_OUT_FRAC;
    const remaining = 1 - outStart;
    return outStart + remaining * (1 - (1 - u) * (1 - u));
  }
  return t;
}

function buildAirDodgeMoveDeltas(): number[] {
  const moveFrames = AIR_DODGE_MOVE_END_FRAME - AIR_DODGE_MOVE_START_FRAME + 1;
  const deltas: number[] = [];
  let prev = 0;
  for (let i = 0; i < moveFrames; i++) {
    const t = (i + 1) / moveFrames;
    const pos = airDodgeEasedProgress(t);
    deltas.push((pos - prev) * AIR_DODGE_DISTANCE_PX);
    prev = pos;
  }
  return deltas;
}

const AIR_DODGE_MOVE_DELTAS = buildAirDodgeMoveDeltas();

function directionalInfluence(input: Input): { x: number; y: number } | null {
  let dx = 0;
  let dy = 0;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0) {
    const s = 1 / Math.sqrt(2);
    dx *= s;
    dy *= s;
  }
  return { x: dx, y: dy };
}

export interface DiscMechanicsHost {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: number;
  onGround: boolean;
  crouching: boolean;
  climbing: boolean;
  hurtLocked: boolean;
  grabHeld: boolean;
  landingLockFrames: number;
  getupLockFrames: number;
  jumpSquatRemaining: number;
  jumpBufferTimer: number;
  coyoteTimer: number;
  attackPhase: number;
  normalJumpAirborne: boolean;
  crouchJumpMode: boolean;
  walkOffLedgeActive: boolean;
  jumpHeld: boolean;
  extendedFallFrames: number;
  landingLockFramesMutable: { value: number };
  landedThisTick: boolean;
  justLanded: boolean;
  swordVisual: string;
  stats: PlayerStats;
  attackTimingScale(): number;
  isSubweaponAnimating(): boolean;
  headbandActive(): boolean;
  carryHolding(): boolean;
  carryAnimating(): boolean;
  carryThrowing(): boolean;
  carryBlocksAttack(): boolean;
  offensiveHitlagRemaining: number;
  scaleOutgoingHitstun(ff: number): number;
  effectiveOutgoingDamage(base: number): number;
  applySquashStretchX(scale: number, frames: number): void;
  applySquashStretchYWallAnchored(scale: number, frames: number, wallSide: number): void;
  /** Authored anim-cue squash for disc04 heavy ({@code attack1}). */
  fireAnimCueStrip(
    logicalKey: string,
    stripIndex: number,
    priorStripIndex: number,
    startedOnGround: boolean,
  ): void;
  cancelAttack(): void;
  cancelSubweaponAnim(): void;
  cancelHeadbandAttack(): void;
  dropCarryForAirDodge(gardeningHost: GardeningGlovesHost | null): void;
  collisionPoseAt(ax: number, ay: number): HitboxPose;
  poseForFeetSupport(): HitboxPose;
  overlapsSolid(map: TileMap, pose: HitboxPose): boolean;
  standHullAt(ax: number, ay: number, hullH: number): HitboxPose;
  applyHitboxHeight(newH: number, map: TileMap): void;
  polygonOverlapsHorizontalBlockingSolids(
    pose: HitboxPose,
    map: TileMap,
    vxProbe: number,
  ): boolean;
  moveAndCollide(dt: number, map: TileMap): void;
  noteHorizontalWallContact(side: number): void;
  horizontalWallContactResolvedThisStep: boolean;
  horizontalWallContactSide: number;
  clearHorizontalWallContact(): void;
  standsOnWavedashSupport(map: TileMap): boolean;
  gardeningHost: GardeningGlovesHost | null;
  fuzzyHatStacks: number;
  headbandStacks: number;
  gemSwordStacks: number;
  onHeelysAirDodgeLanding(combinedVx: number): void;
  onHeelysSlideSpeedBase(): number;
  applySwordHitItemProcs(enemy: CombatEnemy): void;
  beginOffensiveHitlag(frames: number): void;
  hitlagFrames: number;
}

/**
 * DISC01 slide, DISC02 wall-jump, DISC03 air-dodge, DISC04 heavy attack (Java Player subset).
 */
export class DiscMechanics {
  // --- slide (disc01) ---
  slideActive = false;
  private slideDistanceTraveled = 0;
  private slideSpeedBase = 0;
  slideJumpReleasedSinceLast = true;
  private slideJumpChordBufferTimer = 0;
  private slideDownChordBufferTimer = 0;
  private slideChordPending = false;
  slideFacing = 1;
  private readonly slideHitEnemies = new Set<CombatEnemy>();
  private slideDustAccumPx = 0;
  private pendingSlideDustX: number | null = null;
  private pendingSlideDustY: number | null = null;

  // --- wall slide (disc02) ---
  wallSlideActive = false;
  wallSlideSide = 0;
  wallSlideLandFacingSnap = false;
  private wallSlideDustAccumPx = 0;
  private wallSlideDustTrackY = 0;
  private pendingWallSlideDustX: number | null = null;
  private pendingWallSlideDustY: number | null = null;

  // --- air dodge (disc03) ---
  airDodgeActive = false;
  private airDodgeFramesElapsed = 0;
  private airDodgeRemainingPx = 0;
  private airDodgeUnitX = 0;
  private airDodgeUnitY = 0;
  private airDodgeVelX = 0;
  private airDodgeCarryVx = 0;
  private airDodgeDispVelX = 0;
  private airDodgeDispVelY = 0;
  private airDodgeSavedVx = 0;
  private airDodgeSavedVelocityPending = false;
  airDodgeGroundCoast = false;
  airDodgeAvailable = true;
  private airDodgeFromJumpsquat = false;
  private fullWavedashPendingAerialFrame = false;
  airDodgeLockedUntilLand = false;
  airDodgeEndedInAir = false;
  private pendingJumpsquatAirDodge = false;
  private dodgeBufferTimer = 0;

  // --- heavy (disc04) ---
  heavyAttackActive = false;
  private heavyFrameIdx = 0;
  private heavyAttackFrameTimeLeft = 0;
  private heavyAttackHitLanded = false;
  private heavyAttackDamageConfirmed = false;
  heavyAttackStartedOnGround = false;
  private attackChordBufferTimer = 0;
  private subweaponChordBufferTimer = 0;
  private heavyAttackScreenShakeFramesRemaining = 0;
  private heavyAttackScreenShakeDeviceX = 0;
  private heavyAttackScreenShakeDeviceY = 0;
  private heavyAttackScreenShakeArmed = false;

  tickChordBuffers(dt: number, input: Input, host: DiscMechanicsHost): void {
    if (input.attackPressed) this.attackChordBufferTimer = CHORD_BUFFER;
    if (input.subweaponPressed) this.subweaponChordBufferTimer = CHORD_BUFFER;
    this.attackChordBufferTimer = Math.max(0, this.attackChordBufferTimer - dt);
    this.subweaponChordBufferTimer = Math.max(0, this.subweaponChordBufferTimer - dt);

    if (host.stats.disc01SlideStacks > 0) {
      if (input.jumpPressed) this.slideJumpChordBufferTimer = CHORD_BUFFER;
      if (input.downPressed) this.slideDownChordBufferTimer = CHORD_BUFFER;
      this.slideJumpChordBufferTimer = Math.max(0, this.slideJumpChordBufferTimer - dt);
      this.slideDownChordBufferTimer = Math.max(0, this.slideDownChordBufferTimer - dt);
    }
  }

  tickDodgeBuffer(dt: number, input: Input, host: DiscMechanicsHost): void {
    if (host.getupLockFrames > 0) return;
    if (input.dodgePressed) {
      this.dodgeBufferTimer = AIR_DODGE_BUFFER;
      if (host.jumpSquatRemaining > 0 && host.stats.disc03AirDodgeStacks > 0) {
        this.pendingJumpsquatAirDodge = true;
      }
    }
    if (!this.airDodgeActive && host.jumpSquatRemaining === 0) {
      this.dodgeBufferTimer = Math.max(0, this.dodgeBufferTimer - dt);
    }
  }

  tryAirDodgeFromBuffer(
    dt: number,
    input: Input,
    map: TileMap,
    left: boolean,
    right: boolean,
    host: DiscMechanicsHost,
  ): void {
    if (host.getupLockFrames > 0) return;
    if (this.dodgeBufferTimer <= 0 || this.airDodgeActive || host.jumpSquatRemaining > 0) {
      if (
        this.dodgeBufferTimer > 0 &&
        !this.airDodgeActive &&
        host.jumpSquatRemaining > 0 &&
        host.stats.disc03AirDodgeStacks > 0 &&
        host.getupLockFrames === 0
      ) {
        this.pendingJumpsquatAirDodge = true;
      }
      return;
    }
    const wavedashFromSupport =
      host.jumpBufferTimer > 0 && host.standsOnWavedashSupport(map);
    if (
      !this.tryBeginAirDodge(input, map, left, right, wavedashFromSupport, host) &&
      !this.tryBeginAirDodge(input, map, left, right, false, host)
    ) {
      return;
    }
    this.dodgeBufferTimer = 0;
    void dt;
  }

  tryJumpsquatCompletionAirDodge(
    input: Input,
    map: TileMap,
    left: boolean,
    right: boolean,
    host: DiscMechanicsHost,
  ): boolean {
    if (
      (this.pendingJumpsquatAirDodge || this.dodgeBufferTimer > 0) &&
      this.tryBeginAirDodge(input, map, left, right, true, host)
    ) {
      this.pendingJumpsquatAirDodge = false;
      this.dodgeBufferTimer = 0;
      return true;
    }
    return false;
  }

  trySlideFromChord(
    input: Input,
    map: TileMap,
    left: boolean,
    right: boolean,
    landingLocked: boolean,
    host: DiscMechanicsHost,
  ): void {
    if (host.stats.disc01SlideStacks <= 0 || this.slideActive) return;
    if (this.slideChordCompletedThisFrame(input, host)) {
      if (landingLocked) {
        this.slideChordPending = true;
        this.clearSlideChordBuffers(input, true);
        return;
      }
      if (this.canStartSlide(map, host) && this.tryBeginSlide(map, left, right, host)) {
        this.consumeSlideChordInput(input);
      }
      return;
    }
    if (
      this.slideChordPending &&
      this.canStartSlide(map, host) &&
      this.tryBeginSlide(map, left, right, host)
    ) {
      this.consumeSlideChordInput(input);
    }
  }

  tryWallJumpOnPress(dt: number, left: boolean, right: boolean, host: DiscMechanicsHost): void {
    if (!this.wallSlideActive) return;
    this.tryWallJump(dt, left, right, host);
  }

  updateHeavy(dt: number, input: Input, host: DiscMechanicsHost): void {
    if (this.airDodgeLockedUntilLand) return;
    if (this.heavyAttackActive) {
      if (this.tryCancelHeavyLateRecoverOnAttack(input, host)) {
        // fall through
      } else {
        if (this.heavyFrameIdx >= HEAVY_ATTACK1_HIT_FRAME) {
          this.triggerHeavyAttackScreenShake();
        }
        this.heavyAttackFrameTimeLeft -= dt;
        while (this.heavyAttackActive && this.heavyAttackFrameTimeLeft <= 0) {
          const prev = this.heavyFrameIdx;
          this.heavyFrameIdx++;
          if (prev < HEAVY_ATTACK1_HIT_FRAME && this.heavyFrameIdx >= HEAVY_ATTACK1_HIT_FRAME) {
            this.triggerHeavyAttackScreenShake();
          }
          if (this.heavyFrameIdx >= HEAVY_ATTACK1_TICKS.length) {
            this.cancelHeavyAttack();
            break;
          }
          this.heavyAttackFrameTimeLeft += this.heavyAttackFrameSeconds(this.heavyFrameIdx, host);
          host.fireAnimCueStrip(
            "attack1",
            this.heavyFrameIdx,
            prev,
            this.heavyAttackStartedOnGround,
          );
        }
        return;
      }
    }
    if (this.canBeginHeavyAttackFromInput(input, host)) {
      this.beginHeavyAttack(host);
      this.consumeAttackChordInput(input);
    }
  }

  tickHeavyScreenShake(): void {
    if (this.heavyAttackScreenShakeFramesRemaining <= 0) {
      this.heavyAttackScreenShakeDeviceX = 0;
      this.heavyAttackScreenShakeDeviceY = 0;
      return;
    }
    const t = this.heavyAttackScreenShakeFramesRemaining / HEAVY_ATTACK_SCREEN_SHAKE_FRAMES;
    const amp = HEAVY_ATTACK_SCREEN_SHAKE_AMP_DEVICE_PX * t;
    this.heavyAttackScreenShakeDeviceX = sampleShake(amp);
    this.heavyAttackScreenShakeDeviceY = sampleShake(amp);
    this.heavyAttackScreenShakeFramesRemaining--;
  }

  heavyScreenShakeDeviceX(): number {
    return this.heavyAttackScreenShakeDeviceX;
  }

  heavyScreenShakeDeviceY(): number {
    return this.heavyAttackScreenShakeDeviceY;
  }

  /** Apply slide / wall-slide / air-dodge velocity overrides before collide. */
  applyMovementOverrides(host: DiscMechanicsHost, steerDir: number): void {
    if (this.wallSlideActive) {
      host.facing = this.wallSlideSide;
      host.vx = 0;
    } else if (this.slideActive) {
      host.facing = this.slideFacing;
      host.vx = this.slideFacing * this.slideSpeedBase;
      host.vy = 0;
    } else if (this.airDodgeActive) {
      if (!this.airDodgeInDisplacementPhase()) {
        host.vx = this.airDodgeVelX;
        if (!this.airDodgeSuppressesGravity()) {
          // vy from gravity
        }
      }
    } else if (this.airDodgeGroundCoast) {
      this.airDodgeVelX = approach(
        this.airDodgeVelX,
        0,
        host.stats.groundFriction * (1 / 60),
      );
      host.vx = this.airDodgeCoastCombinedVx(steerDir);
      if (Math.abs(this.airDodgeVelX) < 1e-3) {
        this.airDodgeGroundCoast = false;
        this.airDodgeVelX = 0;
        host.vx = this.airDodgeSavedWalkVx(steerDir);
      }
    }
  }

  wallSlideGravityMult(): number {
    return this.wallSlideActive ? WALLSLIDE_GRAVITY_MULT : 1;
  }

  airDodgeSuppressesGravity(): boolean {
    if (!this.airDodgeActive) return false;
    const f = this.airDodgeFramesElapsed;
    return (
      f >= AIR_DODGE_GRAVITY_START_FRAMES &&
      f < AIR_DODGE_TOTAL_FRAMES - AIR_DODGE_GRAVITY_END_FRAMES
    );
  }

  shouldSkipGravity(host: DiscMechanicsHost): boolean {
    if (host.jumpSquatRemaining > 0) return true;
    if (this.airDodgeSuppressesGravity()) return true;
    if (this.fullWavedashPendingAerialFrame && this.airDodgeFromJumpsquat) return true;
    return false;
  }

  /** Air-dodge displacement step — returns true when move used custom path. */
  runAirDodgeMoveStep(dt: number, map: TileMap, host: DiscMechanicsHost): boolean {
    if (!this.airDodgeActive || !this.airDodgeInDisplacementPhase() || this.airDodgeRemainingPx <= 1e-6) {
      return false;
    }
    const baseVy = host.vy;
    const scheduledStep = this.prepareAirDodgeDisplacementForStep(dt, host);
    host.vx += this.airDodgeDispVelX;
    host.vy += this.airDodgeDispVelY;
    host.moveAndCollide(dt, map);
    this.mergeAirDodgeDisplacementVelocity(baseVy, scheduledStep, host);
    return true;
  }

  afterMove(
    _dt: number,
    map: TileMap,
    wasOnGround: boolean,
    downHeld: boolean,
    xBefore: number,
    left: boolean,
    right: boolean,
    steerDir: number,
    host: DiscMechanicsHost,
  ): void {
    if (this.slideActive) {
      this.tickSlideAfterMove(map, wasOnGround, downHeld, xBefore, host);
    }
    if (this.airDodgeActive) {
      this.tickAirDodgeMovement(host, steerDir);
    } else if (this.airDodgeGroundCoast) {
      this.syncAirDodgeCoastAfterMove(steerDir, host);
    }
    this.tickWallSlideAfterMove(map, left, right, host);
  }

  onLeaveGroundWhileHeavy(): void {
    if (this.heavyAttackActive && this.heavyAttackStartedOnGround) {
      this.cancelHeavyAttack();
    }
  }

  onLand(host: DiscMechanicsHost): void {
    if (this.airDodgeActive || this.airDodgeLockedUntilLand) {
      if (this.airDodgeEndedInAir) {
        host.landingLockFramesMutable.value = Math.max(
          host.landingLockFramesMutable.value,
          AIR_DODGE_FORCED_LANDING_LAG,
        );
      }
    }
    if (!this.airDodgeActive) {
      this.airDodgeAvailable = true;
    }
    this.endWallSlide();
  }

  onWalkOff(): void {
    this.airDodgeAvailable = true;
  }

  refreshAirDodgeFromLadder(): void {
    this.airDodgeAvailable = true;
    this.airDodgeLockedUntilLand = false;
  }

  isPlayerDamageImmune(): boolean {
    return this.slideActive || this.isAirDodgeIntangible();
  }

  isAirDodgeIntangible(): boolean {
    return (
      this.airDodgeActive &&
      this.airDodgeFramesElapsed >= AIR_DODGE_INTANGIBLE_START &&
      this.airDodgeFramesElapsed <= AIR_DODGE_INTANGIBLE_END
    );
  }

  airDodgeCostumeFrameIndex(): number {
    if (this.airDodgeFramesElapsed < AIR_DODGE_POSE0_FRAMES) return 0;
    if (this.airDodgeFramesElapsed >= AIR_DODGE_POSE2_START_FRAME) return 2;
    return 1;
  }

  airDodgeIntangibleFlashAlpha(): number {
    if (!this.isAirDodgeIntangible()) return 0;
    const flashOn = ((this.airDodgeFramesElapsed >> 1) & 1) === 0;
    return flashOn ? AIR_DODGE_FLASH_ALPHA_ON : AIR_DODGE_FLASH_ALPHA_OFF;
  }

  wallSlideAnimFrame(): number {
    return this.wallSlideActive ? (this.airDodgeFramesElapsed & 1) : 0;
  }

  consumeWallSlideLandFacingSnap(): boolean {
    const v = this.wallSlideLandFacingSnap;
    this.wallSlideLandFacingSnap = false;
    return v;
  }

  /** One-shot hand-dust spawn after update; cleared on consume. */
  consumeWallSlideDustSpawn(): [number, number] | null {
    if (this.pendingWallSlideDustX == null || this.pendingWallSlideDustY == null) return null;
    const out: [number, number] = [this.pendingWallSlideDustX, this.pendingWallSlideDustY];
    this.pendingWallSlideDustX = null;
    this.pendingWallSlideDustY = null;
    return out;
  }

  /** One-shot hand-on-floor dust spawn for disc01 slide; cleared on consume. */
  consumeSlideDustSpawn(): [number, number] | null {
    if (this.pendingSlideDustX == null || this.pendingSlideDustY == null) return null;
    const out: [number, number] = [this.pendingSlideDustX, this.pendingSlideDustY];
    this.pendingSlideDustX = null;
    this.pendingSlideDustY = null;
    return out;
  }

  isHeavyActive(): boolean {
    return this.heavyAttackActive;
  }

  heavyFrameIndex(): number {
    if (!this.heavyAttackActive) return 0;
    return Math.min(this.heavyFrameIdx, HEAVY_ATTACK1_TICKS.length - 1);
  }

  heavyAttackFromAir(): boolean {
    return this.heavyAttackActive && !this.heavyAttackStartedOnGround;
  }

  heavyFacingLocked(): boolean {
    return this.heavyAttackActive && this.heavyFrameIdx >= HEAVY_ATTACK1_HIT_FRAME;
  }

  slideMoveLock(): boolean {
    return this.slideActive;
  }

  wallSlideMoveLock(): boolean {
    return this.wallSlideActive;
  }

  airDodgeMoveLock(): boolean {
    return this.airDodgeActive;
  }

  airDodgeActionLock(): boolean {
    return this.airDodgeLockedUntilLand;
  }

  blocksLadderLatch(host: DiscMechanicsHost): boolean {
    return host.attackPhase !== 0 || host.headbandActive() || host.isSubweaponAnimating() || this.slideActive;
  }

  airDodgeBlocksLadderLatch(): boolean {
    return this.airDodgeActive;
  }

  slideKickHitboxPose(host: DiscMechanicsHost): HitboxPose | null {
    if (!this.slideActive) return null;
    const pivot = SLIDE_KICK_ACTIVE_PIVOT_X;
    const frameOriginX = host.x + host.w * 0.5 - pivot;
    const anchorY = host.y + host.h - SLIDE_BODY_SPRITE_H;
    return new HitboxPose(
      SLIDE_KICK_ACTIVE_LOCAL,
      frameOriginX,
      anchorY,
      this.slideFacing,
      pivot,
      1,
    );
  }

  heavyAttackHitboxPose(host: DiscMechanicsHost): HitboxPose | null {
    if (!this.heavyAttackActive || this.heavyFrameIdx !== HEAVY_ATTACK1_HIT_FRAME) {
      return null;
    }
    const aabb = heavyAttackHitbox({
      visual: host.swordVisual as import("../combat/SwordVisual").SwordVisual,
      x: host.x,
      y: host.y,
      w: host.w,
      h: host.h,
      facing: host.facing,
      groundCrouchAttack: false,
      stickFrameW: 48,
    });
    if (!aabb) return null;
    return HitboxPose.fromWorldPolygon([
      aabb.x, aabb.y,
      aabb.x + aabb.w, aabb.y,
      aabb.x + aabb.w, aabb.y + aabb.h,
      aabb.x, aabb.y + aabb.h,
    ]);
  }

  applySlideHits(
    host: DiscMechanicsHost,
    enemies: CombatEnemy[],
    onHit?: (enemy: CombatEnemy, strike: WeaponStrike, sword: Aabb) => void,
  ): number {
    if (!this.slideActive || host.offensiveHitlagRemaining > 0) return 0;
    const kickPose = this.slideKickHitboxPose(host);
    if (!kickPose) return 0;
    const sword = kickPose.bounds();
    let dmg = this.slideKickDamage(host);
    if (host.fuzzyHatStacks > 0 && host.swordVisual === "fists") {
      dmg += 1;
    }
    dmg = host.effectiveOutgoingDamage(dmg);
    const kb: KnockbackKind = "slide_kick";
    let any = false;
    let maxFreeze = 0;
    for (const e of enemies) {
      if (this.slideHitEnemies.has(e) || e.isDead()) continue;
      if (e.attackBlockedByShield(sword)) {
        const contact = contactBetweenHurtAndEnemy(sword, e.rect());
        const pen = ShieldBreakerCombat.tryMeleeShieldPenetration(
          e,
          sword,
          dmg,
          host.x,
          host.w,
          this.slideFacing,
          kb,
          contact,
        );
        if (pen >= 0) {
          this.slideHitEnemies.add(e);
          any = true;
          maxFreeze = Math.max(maxFreeze, host.scaleOutgoingHitstun(pen));
        }
        continue;
      }
      if (!enemyIntersectsMelee(e, kickPose)) continue;
      const ff = host.scaleOutgoingHitstun(freezeFrames(dmg));
      const strike: WeaponStrike = {
        damage: dmg,
        freezeFrames: ff,
        attackerX: host.x,
        attackerW: host.w,
        facing: this.slideFacing,
        knockKind: kb,
      };
      if (e.applyWeaponStrike(strike)) {
        this.slideHitEnemies.add(e);
        any = true;
        maxFreeze = Math.max(maxFreeze, ff);
        AutismCombat.notifyPlayerDamageDealt(e, dmg);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, dmg);
        host.applySwordHitItemProcs(e);
        onHit?.(e, strike, sword);
      }
    }
    if (any) host.beginOffensiveHitlag(maxFreeze);
    return maxFreeze;
  }

  applyHeavyHits(
    host: DiscMechanicsHost,
    enemies: CombatEnemy[],
    onHit?: (
      enemy: CombatEnemy,
      strike: WeaponStrike,
      sword: Aabb,
      vfx: "slash" | "shield_break" | "shield_block",
    ) => void,
  ): number {
    if (!this.heavyAttackActive || this.heavyAttackHitLanded) return 0;
    const swordPose = this.heavyAttackHitboxPose(host);
    if (!swordPose) return 0;
    const sword = swordPose.bounds();
    const baseDmg = host.stats.outgoingDamage() * HEAVY_ATTACK_DAMAGE_MULT;
    const dmg = host.effectiveOutgoingDamage(baseDmg);
    const knockKind = swordKnockbackKind(host.swordVisual as SwordVisual, false);
    let any = false;
    let maxFreeze = 0;
    for (const e of enemies) {
      if (e.isDead()) continue;
      if (e.attackBlockedByShield(sword)) {
        const contact = contactBetweenHurtAndEnemy(sword, e.rect());
        const pen = ShieldBreakerCombat.tryMeleeShieldPenetration(
          e,
          sword,
          dmg,
          host.x,
          host.w,
          host.facing,
          knockKind,
          contact,
        );
        if (pen >= 0) {
          any = true;
          maxFreeze = Math.max(maxFreeze, host.scaleOutgoingHitstun(pen));
          onHit?.(e, { damage: dmg, freezeFrames: pen, attackerX: host.x, attackerW: host.w, facing: host.facing, knockKind, contactWorldX: contact.x, contactWorldY: contact.y }, sword, "shield_break");
        } else {
          const ff = host.scaleOutgoingHitstun(freezeFrames(dmg));
          e.applyShieldBlockStrike({ damage: 0, freezeFrames: ff, attackerX: host.x, attackerW: host.w, facing: host.facing, knockKind, contactWorldX: contact.x, contactWorldY: contact.y });
          any = true;
          maxFreeze = Math.max(maxFreeze, ff);
          onHit?.(e, { damage: 0, freezeFrames: ff, attackerX: host.x, attackerW: host.w, facing: host.facing, knockKind }, sword, "shield_block");
        }
        continue;
      }
      if (!enemyIntersectsMelee(e, swordPose)) continue;
      const ff = host.scaleOutgoingHitstun(freezeFrames(dmg, host.gemSwordStacks > 0 ? 2 : 1));
      const strike: WeaponStrike = {
        damage: dmg,
        freezeFrames: ff,
        attackerX: host.x,
        attackerW: host.w,
        facing: host.facing,
        knockKind,
      };
      if (e.applyWeaponStrike(strike)) {
        any = true;
        maxFreeze = Math.max(maxFreeze, ff);
        this.heavyAttackDamageConfirmed = true;
        AutismCombat.notifyPlayerDamageDealt(e, dmg);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, dmg);
        host.applySwordHitItemProcs(e);
        onHit?.(e, strike, sword, "slash");
      }
    }
    if (any) {
      this.heavyAttackHitLanded = true;
      host.beginOffensiveHitlag(maxFreeze);
    }
    return maxFreeze;
  }

  latchHeavyHit(freeze: number, host: DiscMechanicsHost): void {
    this.heavyAttackHitLanded = true;
    host.hitlagFrames = Math.max(host.hitlagFrames, freeze);
  }

  cancelHeavyAttack(): void {
    this.heavyAttackActive = false;
    this.heavyFrameIdx = 0;
    this.heavyAttackFrameTimeLeft = 0;
    this.heavyAttackHitLanded = false;
    this.heavyAttackDamageConfirmed = false;
    this.heavyAttackStartedOnGround = false;
    this.heavyAttackScreenShakeArmed = false;
  }

  // --- private helpers ---

  private slideKickDamage(host: DiscMechanicsHost): number {
    if (host.swordVisual === "fists") return host.stats.attackDamage + 1;
    if (host.stats.slideKickDamageUsesAttackStat) {
      return host.stats.attackDamage + host.stats.slideKickDamageAttackStatBonus;
    }
    if (host.stats.slideKickDamageFixed > 0) return host.stats.slideKickDamageFixed;
    return 2;
  }

  private slideChordCompletedThisFrame(input: Input, host: DiscMechanicsHost): boolean {
    if (host.stats.disc01SlideStacks <= 0) return false;
    return (
      (input.jumpPressed && this.slideDownChordBufferTimer > 0) ||
      (input.downPressed && this.slideJumpChordBufferTimer > 0)
    );
  }

  private clearSlideChordBuffers(input: Input, consumeKeys: boolean): void {
    if (consumeKeys) {
      input.consumePress("KeyZ");
      input.consumePress("Space");
      input.consumePress("ArrowDown");
      input.consumePress("KeyS");
    }
    this.slideJumpChordBufferTimer = 0;
    this.slideDownChordBufferTimer = 0;
  }

  private consumeSlideChordInput(input: Input): void {
    this.clearSlideChordBuffers(input, true);
    this.slideChordPending = false;
  }

  private canStartSlide(_map: TileMap, host: DiscMechanicsHost): boolean {
    return (
      host.stats.disc01SlideStacks > 0 &&
      host.onGround &&
      host.crouching &&
      !host.climbing &&
      !host.carryHolding() &&
      !host.hurtLocked &&
      !host.grabHeld &&
      !this.slideActive &&
      host.attackPhase === 0 &&
      host.getupLockFrames === 0 &&
      host.landingLockFrames === 0 &&
      !host.isSubweaponAnimating() &&
      this.slideJumpReleasedSinceLast
    );
  }

  private tryBeginSlide(
    map: TileMap,
    left: boolean,
    right: boolean,
    host: DiscMechanicsHost,
  ): boolean {
    if (!this.canStartSlide(map, host)) return false;
    host.cancelAttack();
    host.cancelSubweaponAnim();
    host.crouchJumpMode = false;
    this.slideActive = true;
    this.slideDistanceTraveled = 0;
    this.slideDustAccumPx = 0;
    this.slideJumpReleasedSinceLast = false;
    this.slideHitEnemies.clear();
    host.applySquashStretchX(SLIDE_SQUASH_X, SLIDE_SQUASH_RECOVER_FRAMES);
    let nf = host.facing;
    if (left && !right) nf = -1;
    else if (right && !left) nf = 1;
    this.slideFacing = nf;
    host.facing = nf;
    host.crouching = true;
    host.applyHitboxHeight(PLAYER_CROUCH_H, map);
    this.slideSpeedBase = host.stats.heelysStacks > 0
      ? host.onHeelysSlideSpeedBase()
      : Math.max(Math.abs(host.vx), host.stats.maxGroundSpeed) * host.stats.slideSpeedMult;
    host.vx = this.slideFacing * this.slideSpeedBase;
    host.vy = 0;
    host.walkOffLedgeActive = false;
    host.climbing = false;
    return true;
  }

  private tickSlideAfterMove(
    map: TileMap,
    wasGrounded: boolean,
    downHeld: boolean,
    xBefore: number,
    host: DiscMechanicsHost,
  ): void {
    const dx = Math.abs(host.x - xBefore);
    this.slideDistanceTraveled += dx;
    if (dx > 0) {
      this.slideDustAccumPx += dx;
      if (this.slideDustAccumPx >= SLIDE_DUST_INTERVAL_PX) {
        this.slideDustAccumPx -= SLIDE_DUST_INTERVAL_PX;
        this.pendingSlideDustX = this.slideDustHandWorldX(host);
        this.pendingSlideDustY = host.y + host.h;
      }
    }
    if (wasGrounded && !host.onGround) {
      this.endSlide(true, downHeld, map, host);
      return;
    }
    if (host.onGround && Math.abs(host.vx) < 1e-4 && !this.slideCeilingLocked(map, host)) {
      this.endSlide(false, downHeld, map, host);
      return;
    }
    if (this.slideDistanceTraveled >= host.stats.slideDistancePx && !this.slideCeilingExtends(map, host)) {
      this.endSlide(false, downHeld, map, host);
    }
  }

  private slideCeilingLocked(map: TileMap, host: DiscMechanicsHost): boolean {
    return (
      this.slideActive &&
      this.slideDistanceTraveled >= host.stats.slideDistancePx &&
      this.slideCeilingExtends(map, host)
    );
  }

  private slideCeilingExtends(map: TileMap, host: DiscMechanicsHost): boolean {
    const yStand = host.y + (PLAYER_CROUCH_H - PLAYER_STAND_H);
    return host.overlapsSolid(map, host.standHullAt(host.x, yStand, PLAYER_STAND_H));
  }

  private endSlide(cancelledOffLedge: boolean, downHeld: boolean, map: TileMap, host: DiscMechanicsHost): void {
    this.slideActive = false;
    this.slideHitEnemies.clear();
    this.slideSpeedBase = 0;
    if (!cancelledOffLedge && host.onGround && host.stats.heelysStacks <= 0) {
      host.vx = 0;
    }
    if (downHeld) {
      host.crouching = true;
      host.applyHitboxHeight(PLAYER_CROUCH_H, map);
    } else {
      host.crouching = false;
      host.applyHitboxHeight(PLAYER_STAND_H, map);
    }
  }

  private endWallSlide(): void {
    this.wallSlideActive = false;
    this.wallSlideSide = 0;
    this.wallSlideDustAccumPx = 0;
  }

  private canUseWallSlide(host: DiscMechanicsHost): boolean {
    return (
      host.stats.disc02WalljumpStacks > 0 &&
      !host.onGround &&
      !host.climbing &&
      !host.hurtLocked &&
      !host.grabHeld &&
      !this.slideActive &&
      !host.carryHolding() &&
      !this.airDodgeActive &&
      !this.airDodgeLockedUntilLand
    );
  }

  private beginWallSlide(wallSide: number, _map: TileMap, host: DiscMechanicsHost): void {
    this.wallSlideActive = true;
    this.wallSlideSide = wallSide;
    host.facing = wallSide;
    host.vx = 0;
    host.walkOffLedgeActive = false;
    this.wallSlideDustAccumPx = 0;
    this.wallSlideDustTrackY = host.y;
    host.applySquashStretchYWallAnchored(WALLSLIDE_ENTRY_STRETCH_Y, WALLSLIDE_ENTRY_STRETCH_FRAMES, wallSide);
    if (host.attackPhase !== 0 || host.headbandActive()) host.cancelAttack();
    host.cancelSubweaponAnim();
  }

  private tryWallJump(dt: number, left: boolean, right: boolean, host: DiscMechanicsHost): void {
    if (!this.wallSlideActive || host.jumpSquatRemaining > 0) return;
    if (host.attackPhase !== 0 || host.headbandActive()) return;
    const awayDir = -this.wallSlideSide;
    host.facing = awayDir;
    host.vy = -host.stats.jumpVel;
    const airCap = host.stats.maxAirSpeed;
    const holdingAway =
      (awayDir < 0 && left && !right) || (awayDir > 0 && right && !left);
    if (holdingAway) {
      host.vx = awayDir * airCap;
    } else {
      const push = host.stats.airAccel * 0.25 * dt * WALL_JUMP_AIR_PUSH_FRAMES;
      host.vx = awayDir * Math.min(push, airCap);
    }
    this.endWallSlide();
    host.onGround = false;
    host.jumpHeld = true;
    host.normalJumpAirborne = true;
    host.crouchJumpMode = false;
    host.coyoteTimer = 0;
    host.landingLockFramesMutable.value = 0;
    host.landedThisTick = false;
    host.walkOffLedgeActive = false;
    this.tryWallJump(dt, left, right, host);
  }

  private holdingTowardWall(wallSide: number, left: boolean, right: boolean): boolean {
    return (wallSide < 0 && left && !right) || (wallSide > 0 && right && !left);
  }

  private wallSlideLandFaceAwayInput(wallSide: number, left: boolean, right: boolean): boolean {
    return wallSide !== 0 && !this.holdingTowardWall(wallSide, left, right);
  }

  probeWallContactSide(map: TileMap, host: DiscMechanicsHost): number {
    if (host.onGround || host.climbing) return 0;
    if (host.horizontalWallContactResolvedThisStep) return host.horizontalWallContactSide;
    const left = this.probeTileWallSide(map, -1, host) ? -1 : 0;
    const right = this.probeTileWallSide(map, 1, host) ? 1 : 0;
    if (left !== 0 && right !== 0) {
      return this.wallSlideActive ? this.wallSlideSide : left;
    }
    if (left !== 0) return -1;
    if (right !== 0) return 1;
    return 0;
  }

  private probeTileWallSide(map: TileMap, side: number, host: DiscMechanicsHost): boolean {
    const vxProbe = side < 0 ? -1 : 1;
    for (let inset = 0; inset <= WALL_CONTACT_PROBE_INSET_PX; inset += 1) {
      const probe = host.collisionPoseAt(host.x + side * inset, host.y);
      if (!host.polygonOverlapsHorizontalBlockingSolids(probe, map, vxProbe)) continue;
      if (this.isSideWallTileNotDeck(probe, map, side, host)) return true;
    }
    return false;
  }

  private isSideWallTileNotDeck(
    pose: HitboxPose,
    map: TileMap,
    side: number,
    host: DiscMechanicsHost,
  ): boolean {
    const feet = host.poseForFeetSupport().bounds();
    const b = pose.bounds();
    const ts = TILE_SIZE;
    const topTile = Math.floor((b.y + 0.001) / ts);
    const bottomTile = Math.floor((b.y + b.h - 0.001) / ts);
    const c0 = side > 0 ? Math.floor(b.x + b.w - 0.001) / ts : Math.floor(b.x / ts);
    const c1 = side > 0 ? c0 + 1 : c0 - 1;
    for (const col of [c0, c1]) {
      for (let ty = topTile; ty <= bottomTile; ty++) {
        if (!map.isSolidTile(col, ty)) continue;
        const tile = { x: col * ts, y: ty * ts, w: ts, h: ts };
        if (!pose.intersectsRect(tile)) continue;
        const deckTop = tile.y;
        if (feet.y + feet.h >= deckTop - 1e-3 && feet.y + feet.h <= deckTop + PLATFORM_DECK_SLACK_PX) {
          continue;
        }
        return true;
      }
    }
    return false;
  }

  private tickWallSlideAfterMove(
    map: TileMap,
    left: boolean,
    right: boolean,
    host: DiscMechanicsHost,
  ): void {
    if (!this.canUseWallSlide(host) && !this.wallSlideActive) return;
    const contact = this.probeWallContactSide(map, host);
    if (this.wallSlideActive) {
      if (host.onGround || contact === 0 || host.carryHolding() || host.hurtLocked || host.grabHeld) {
        if (host.onGround && this.wallSlideLandFaceAwayInput(this.wallSlideSide, left, right)) {
          host.facing = -this.wallSlideSide;
          this.wallSlideLandFacingSnap = true;
        }
        this.endWallSlide();
        return;
      }
      if (contact !== this.wallSlideSide) {
        this.wallSlideSide = contact;
        host.facing = contact;
      }
      host.facing = this.wallSlideSide;
      host.vx = 0;
      this.clampWallSlideIntoWall(map, host);
      const dy = Math.abs(host.y - this.wallSlideDustTrackY);
      if (dy > 0) {
        this.wallSlideDustAccumPx += dy;
        this.wallSlideDustTrackY = host.y;
        if (this.wallSlideDustAccumPx >= WALLSLIDE_DUST_INTERVAL_PX) {
          this.wallSlideDustAccumPx -= WALLSLIDE_DUST_INTERVAL_PX;
          const hull = host.collisionPoseAt(host.x, host.y).bounds();
          const handX = this.wallSlideSide < 0 ? hull.x : hull.x + hull.w;
          const handY =
            host.y + host.h * WALLSLIDE_DUST_HAND_Y_FRAC - WALLSLIDE_DUST_HAND_Y_OFFSET_PX;
          this.pendingWallSlideDustX = handX;
          this.pendingWallSlideDustY = handY;
        }
      }
      return;
    }
    if (contact !== 0 && this.holdingTowardWall(contact, left, right)) {
      this.beginWallSlide(contact, map, host);
      this.clampWallSlideIntoWall(map, host);
    }
  }

  private slideDustHandWorldX(host: DiscMechanicsHost): number {
    const pivot = SLIDE_KICK_ACTIVE_PIVOT_X;
    const frameOriginX = host.x + host.w * 0.5 - pivot;
    let localX = SLIDE_DUST_HAND_LOCAL_X;
    if (this.slideFacing > 0) {
      localX = 2 * pivot - localX;
    }
    return frameOriginX + localX;
  }

  private clampWallSlideIntoWall(map: TileMap, host: DiscMechanicsHost): void {
    if (!this.wallSlideActive) return;
    const surface = this.findWallSurfaceWorldX(map, this.wallSlideSide, host);
    if (surface == null) return;
    const b = host.collisionPoseAt(host.x, host.y).bounds();
    if (this.wallSlideSide > 0) host.x += surface - (b.x + b.w);
    else host.x += surface - b.x;
  }

  private findWallSurfaceWorldX(map: TileMap, wallSide: number, host: DiscMechanicsHost): number | null {
    for (let inset = 0; inset <= WALL_CONTACT_PROBE_INSET_PX; inset += 0.5) {
      const probe = host.collisionPoseAt(host.x + wallSide * inset, host.y);
      const tileFace = this.tileWallFaceAtProbe(map, wallSide, probe, host);
      if (tileFace != null) return tileFace;
    }
    return null;
  }

  private tileWallFaceAtProbe(
    map: TileMap,
    wallSide: number,
    pose: HitboxPose,
    host: DiscMechanicsHost,
  ): number | null {
    if (!this.isSideWallTileNotDeck(pose, map, wallSide, host)) return null;
    const b = pose.bounds();
    const ts = TILE_SIZE;
    const topTile = Math.floor((b.y + 0.001) / ts);
    const bottomTile = Math.floor((b.y + b.h - 0.001) / ts);
    const c0 = wallSide > 0 ? Math.floor(b.x + b.w - 0.001) / ts : Math.floor(b.x / ts);
    const c1 = wallSide > 0 ? c0 + 1 : c0 - 1;
    for (const col of [c0, c1]) {
      for (let ty = topTile; ty <= bottomTile; ty++) {
        if (!map.isSolidTile(col, ty)) continue;
        const tile = { x: col * ts, y: ty * ts, w: ts, h: ts };
        if (!pose.intersectsRect(tile)) continue;
        return wallSide > 0 ? tile.x : tile.x + tile.w;
      }
    }
    return null;
  }

  private canBeginAirDodge(fromJumpsquat: boolean, map: TileMap, host: DiscMechanicsHost): boolean {
    if (host.stats.disc03AirDodgeStacks <= 0) return false;
    if (this.airDodgeActive || this.airDodgeLockedUntilLand) return false;
    if (!this.airDodgeAvailable) return false;
    if (
      this.wallSlideActive ||
      host.hurtLocked ||
      host.grabHeld ||
      host.climbing ||
      this.slideActive ||
      host.carryAnimating()
    ) {
      return false;
    }
    if (host.attackPhase !== 0 || host.isSubweaponAnimating() || host.headbandActive()) return false;
    if (host.getupLockFrames > 0) return false;
    if (fromJumpsquat) return host.standsOnWavedashSupport(map);
    return !host.onGround;
  }

  private tryBeginAirDodge(
    input: Input,
    map: TileMap,
    left: boolean,
    right: boolean,
    fromJumpsquat: boolean,
    host: DiscMechanicsHost,
  ): boolean {
    if (!this.canBeginAirDodge(fromJumpsquat, map, host)) return false;
    void left;
    void right;
    const di = directionalInfluence(input);
    let unitX = 0;
    let unitY = 0;
    if (di) {
      const len = Math.hypot(di.x, di.y);
      if (len > 1e-6) {
        unitX = di.x / len;
        unitY = di.y / len;
      }
    }
    this.dodgeBufferTimer = 0;
    this.pendingJumpsquatAirDodge = false;
    host.cancelAttack();
    host.cancelSubweaponAnim();
    if (host.carryHolding()) host.dropCarryForAirDodge(host.gardeningHost);
    this.airDodgeActive = true;
    this.airDodgeFramesElapsed = 0;
    this.airDodgeRemainingPx = AIR_DODGE_DISTANCE_PX;
    this.airDodgeUnitX = unitX;
    this.airDodgeUnitY = unitY;
    this.airDodgeFromJumpsquat = fromJumpsquat;
    this.airDodgeLockedUntilLand = true;
    this.airDodgeEndedInAir = false;
    this.airDodgeAvailable = false;
    this.airDodgeVelX = 0;
    this.airDodgeCarryVx = 0;
    this.airDodgeDispVelX = 0;
    this.airDodgeDispVelY = 0;
    this.airDodgeGroundCoast = false;
    this.saveAirDodgeEntryVelocity(host);
    this.endWallSlide();
    host.walkOffLedgeActive = false;
    if (fromJumpsquat) {
      this.fullWavedashPendingAerialFrame = true;
      host.onGround = false;
      host.vx = 0;
      host.vy = 0;
    } else {
      host.vx = 0;
      host.vy = 0;
    }
    return true;
  }

  private saveAirDodgeEntryVelocity(host: DiscMechanicsHost): void {
    this.airDodgeSavedVx = Math.abs(host.vx);
    this.airDodgeSavedVelocityPending = this.airDodgeSavedVx > 1e-3;
  }

  private airDodgeSavedWalkVx(steerDir: number): number {
    if (!this.airDodgeSavedVelocityPending || steerDir === 0) return 0;
    return steerDir * this.airDodgeSavedVx;
  }

  private airDodgeCoastCombinedVx(steerDir: number): number {
    return this.airDodgeSavedWalkVx(steerDir) + this.airDodgeVelX;
  }

  private airDodgeInDisplacementPhase(): boolean {
    return this.airDodgeFramesElapsed <= AIR_DODGE_MOVE_END_FRAME;
  }

  private airDodgeTailWeightSum(fromMoveIdx: number): number {
    let sum = 0;
    for (let i = fromMoveIdx; i < AIR_DODGE_MOVE_DELTAS.length; i++) sum += AIR_DODGE_MOVE_DELTAS[i];
    return sum;
  }

  private airDodgeDisplacementTargetStep(frameElapsed: number): number {
    if (
      frameElapsed < AIR_DODGE_MOVE_START_FRAME ||
      frameElapsed > AIR_DODGE_MOVE_END_FRAME ||
      this.airDodgeRemainingPx <= 1e-6
    ) {
      return 0;
    }
    const moveIdx = frameElapsed - AIR_DODGE_MOVE_START_FRAME;
    const tailSum = this.airDodgeTailWeightSum(moveIdx);
    if (tailSum <= 1e-9) return this.airDodgeRemainingPx;
    return Math.min(
      this.airDodgeRemainingPx,
      this.airDodgeRemainingPx * (AIR_DODGE_MOVE_DELTAS[moveIdx] / tailSum),
    );
  }

  private prepareAirDodgeDisplacementForStep(dt: number, _host: DiscMechanicsHost): number {
    this.airDodgeDispVelX = 0;
    this.airDodgeDispVelY = 0;
    if (Math.hypot(this.airDodgeUnitX, this.airDodgeUnitY) <= 1e-6) return 0;
    const step = this.airDodgeDisplacementTargetStep(this.airDodgeFramesElapsed);
    if (step <= 1e-9) return 0;
    this.airDodgeDispVelX = (step * this.airDodgeUnitX) / dt;
    this.airDodgeDispVelY = (step * this.airDodgeUnitY) / dt;
    if (this.fullWavedashPendingAerialFrame) this.airDodgeDispVelY = 0;
    return step;
  }

  private mergeAirDodgeDisplacementVelocity(baseVy: number, scheduledStep: number, host: DiscMechanicsHost): void {
    if (!host.horizontalWallContactResolvedThisStep) {
      this.airDodgeVelX = this.mergeAirDodgeAxisVelocity(this.airDodgeCarryVx, this.airDodgeDispVelX);
      host.vx = this.airDodgeCarryVx;
    } else {
      this.airDodgeVelX = host.vx;
    }
    if (this.fullWavedashPendingAerialFrame) host.vy = 0;
    else host.vy = baseVy;
    if (scheduledStep > 1e-9) {
      this.airDodgeRemainingPx = Math.max(0, this.airDodgeRemainingPx - scheduledStep);
    }
    this.airDodgeDispVelX = 0;
    this.airDodgeDispVelY = 0;
  }

  private mergeAirDodgeAxisVelocity(base: number, disp: number): number {
    const boosted = base + disp;
    return Math.abs(boosted) > Math.abs(base) + 1e-6 ? boosted : base;
  }

  private tickAirDodgeMovement(host: DiscMechanicsHost, steerDir: number): void {
    this.airDodgeFramesElapsed++;
    if (this.fullWavedashPendingAerialFrame) this.fullWavedashPendingAerialFrame = false;
    if (this.airDodgeFramesElapsed >= AIR_DODGE_TOTAL_FRAMES) {
      this.finishAirDodgeAnimation(host, steerDir);
    }
  }

  private finishAirDodgeAnimation(host: DiscMechanicsHost, steerDir: number): void {
    if (!host.onGround) {
      this.airDodgeActive = false;
      this.airDodgeEndedInAir = true;
      this.airDodgeVelX = 0;
      this.airDodgeGroundCoast = false;
      this.airDodgeSavedVelocityPending = false;
      host.normalJumpAirborne = true;
      host.crouchJumpMode = false;
    } else {
      this.airDodgeEndedInAir = false;
      this.endAirDodgeOnLand(steerDir, host);
    }
  }

  private endAirDodgeOnLand(steerDir: number, host: DiscMechanicsHost): void {
    const combinedVx = this.airDodgeCoastCombinedVx(steerDir);
    const hadSlideMomentum = Math.abs(combinedVx) > 1e-3;
    if (host.onGround && Math.abs(host.vx) > Math.abs(this.airDodgeVelX) + 1e-3) {
      this.airDodgeVelX = host.vx;
    }
    this.airDodgeActive = false;
    this.airDodgeLockedUntilLand = false;
    this.airDodgeFromJumpsquat = false;
    this.airDodgeRemainingPx = 0;
    this.airDodgeAvailable = true;
    if (host.onGround) {
      if (host.stats.heelysStacks > 0) {
        if (hadSlideMomentum) {
          host.vx = combinedVx;
          this.airDodgeVelX = 0;
          this.airDodgeGroundCoast = false;
          this.airDodgeSavedVelocityPending = false;
          host.onHeelysAirDodgeLanding(combinedVx);
        } else {
          this.airDodgeVelX = 0;
          this.airDodgeGroundCoast = false;
          this.airDodgeSavedVelocityPending = false;
        }
      } else if (hadSlideMomentum) {
        this.airDodgeGroundCoast = true;
        host.vx = combinedVx;
      } else {
        this.airDodgeGroundCoast = false;
        this.airDodgeSavedVelocityPending = false;
      }
    } else {
      this.airDodgeVelX = 0;
      this.airDodgeGroundCoast = false;
      this.airDodgeSavedVelocityPending = false;
    }
  }

  private syncAirDodgeCoastAfterMove(steerDir: number, host: DiscMechanicsHost): void {
    if (host.horizontalWallContactResolvedThisStep) {
      this.airDodgeVelX = 0;
      this.airDodgeSavedVelocityPending = false;
      host.vx = 0;
    } else {
      host.vx = this.airDodgeCoastCombinedVx(steerDir);
    }
  }

  private attackChordCompletedThisFrame(input: Input): boolean {
    return (
      (input.attackPressed && this.subweaponChordBufferTimer > 0) ||
      (input.subweaponPressed && this.attackChordBufferTimer > 0)
    );
  }

  private consumeAttackChordInput(input: Input): void {
    input.consumePress("KeyX");
    input.consumePress("KeyC");
    this.attackChordBufferTimer = 0;
    this.subweaponChordBufferTimer = 0;
  }

  private canBeginHeavyAttackFromInput(input: Input, host: DiscMechanicsHost): boolean {
    if (host.stats.disc04HeavyStacks <= 0 || this.heavyAttackActive) return false;
    if (!this.attackChordCompletedThisFrame(input)) return false;
    if (input.down || input.up) return false;
    if (host.swordVisual === "lemon") return false;
    if (host.headbandActive() || host.attackPhase !== 0 || host.isSubweaponAnimating()) return false;
    if (host.carryThrowing() || host.carryBlocksAttack()) return false;
    if (
      host.landingLockFrames > 0 ||
      host.getupLockFrames > 0 ||
      this.slideActive ||
      this.wallSlideActive ||
      this.airDodgeLockedUntilLand ||
      host.climbing
    ) {
      return false;
    }
    return true;
  }

  private beginHeavyAttack(host: DiscMechanicsHost): void {
    this.heavyAttackActive = true;
    this.heavyFrameIdx = 0;
    this.heavyAttackHitLanded = false;
    this.heavyAttackDamageConfirmed = false;
    this.heavyAttackStartedOnGround = host.onGround;
    this.heavyAttackFrameTimeLeft = this.heavyAttackFrameSeconds(0, host);
    this.heavyAttackScreenShakeArmed = false;
    host.fireAnimCueStrip("attack1", 0, -1, this.heavyAttackStartedOnGround);
  }

  private tryCancelHeavyLateRecoverOnAttack(input: Input, host: DiscMechanicsHost): boolean {
    if (host.headbandStacks <= 0 || !this.heavyAttackDamageConfirmed) return false;
    if (!this.isHeavyLateRecoverFrame()) return false;
    if (!input.attackPressed) return false;
    this.cancelHeavyAttack();
    return true;
  }

  private isHeavyLateRecoverFrame(): boolean {
    return this.heavyAttackActive && this.heavyFrameIdx >= HEAVY_ATTACK1_LATE_RECOVER_FRAME;
  }

  private heavyAttackFrameSeconds(frameIndex: number, host: DiscMechanicsHost): number {
    if (frameIndex < 0 || frameIndex >= HEAVY_ATTACK1_TICKS.length) return 0;
    const authored = HEAVY_ATTACK1_TICKS[frameIndex];
    const scale = host.attackTimingScale();
    const hz = FIXED_STEP_HZ;
    let statFrames = 1;
    let ref = 1;
    switch (frameIndex) {
      case 0:
      case 1:
        statFrames = host.stats.attackWindupFrames;
        ref = HEAVY_STAND_WINDUP_REF;
        break;
      case 2:
        statFrames = host.stats.attackActiveFrames;
        ref = HEAVY_ATTACK_ACTIVE_REF;
        break;
      case 3:
      case 4:
      case 5:
        statFrames = host.stats.attackRecoverEarlyFrames;
        ref = HEAVY_STAND_RECOVER_EARLY_REF;
        break;
      case 6:
      case 7:
        statFrames = host.stats.attackRecoverLateFrames;
        ref = HEAVY_STAND_RECOVER_LATE_REF;
        break;
    }
    return (authored * statFrames) / ref / scale / hz;
  }

  private triggerHeavyAttackScreenShake(): void {
    if (this.heavyAttackScreenShakeArmed) return;
    this.heavyAttackScreenShakeArmed = true;
    this.heavyAttackScreenShakeFramesRemaining = HEAVY_ATTACK_SCREEN_SHAKE_FRAMES;
    this.heavyAttackScreenShakeDeviceX = sampleShake(HEAVY_ATTACK_SCREEN_SHAKE_AMP_DEVICE_PX);
    this.heavyAttackScreenShakeDeviceY = sampleShake(HEAVY_ATTACK_SCREEN_SHAKE_AMP_DEVICE_PX);
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}
