import {
  freezeFrames,
  placePolygonAabb,
  type Aabb,
  type WeaponStrike,
} from "../combat/CombatMath";
import { Health } from "../combat/Health";
import {
  ATTACK_BUFFER,
  ATTACK_LANDING_LOCK_FRAMES,
  CONTACT_DAMAGE_IFRAMES,
  CROUCH_ATTACK_DAMAGE_MULT,
  CROUCH_ATTACK_RECOVER_EARLY_FRAMES_DELTA,
  CROUCH_ATTACK_RECOVER_LATE_FRAMES_DELTA,
  CROUCH_ATTACK_WINDUP_FRAMES_DELTA,
  SWORD_ATTACK_ACTIVE_LOCAL,
  SWORD_ATTACK_ACTIVE_PIVOT_X,
  SWORD_BODY_H,
  SWORD_BODY_W,
  SWORD_CROUCH_ATTACK_ACTIVE_LOCAL,
  SWORD_CROUCH_ATTACK_ACTIVE_PIVOT_X,
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
import { clipVelocityDelta, clipWorldDelta } from "../combat/KnockbackCollision";
import {
  PLAYER_JUMP_HITBOX_H,
  PLAYER_JUMP_LEAD_FOOT_LOCAL_Y,
  PLAYER_JUMP_LOCAL,
  PLAYER_JUMP_PIVOT_X,
  PLAYER_JUMP_STAND_HITBOX_H,
  PLAYER_JUMP_TRAIL_FOOT_LOCAL_Y,
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
  TILE_SEPARATION_ITERATIONS,
} from "../config/Physics";
import type { ItemCatalog } from "../item/ItemCatalog";
import { PlayerItemInventory } from "../item/PlayerItemInventory";
import type { Input } from "../input/Input";
import { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { PlayerStats } from "./PlayerStats";
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

  /** Feet-anchored squash/stretch (Java SquashStretch). */
  readonly squash = new SquashStretch();
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
  /** Lift-off deferred until after leave-ground attack cancel (Java order). */
  private jumpSquatLiftOffPending = false;
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
  private hurtAirAnimAccum = 0;
  private hurtAirFrame = 0;

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
    this.jumpSquatLiftOffPending = false;
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
      return new HitboxPose(
        PLAYER_JUMP_LOCAL,
        anchorX,
        anchorY,
        this.facing,
        PLAYER_JUMP_PIVOT_X,
        this.h / PLAYER_JUMP_STAND_HITBOX_H,
      );
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

  /** Floor probe Y: jump uses max(lead, trail) feet; stand uses AABB bottom. */
  private collisionFootWorldY(pose: HitboxPose = this.hitboxPose()): number {
    if (this.usesJumpCollisionHull()) {
      return Math.max(
        pose.maxLocalYWorld(PLAYER_JUMP_LEAD_FOOT_LOCAL_Y),
        pose.maxLocalYWorld(PLAYER_JUMP_TRAIL_FOOT_LOCAL_Y),
      );
    }
    return pose.bounds().y + pose.bounds().h;
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

  update(dt: number, input: Input, map: TileMap): void {
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

    this.wasOnGround = this.onGround;
    this.justLanded = false;

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

    this.updateAttack(dt, input);

    // Ladder jump-off before movement (Java): immediate exit, no jumpsquat.
    this.tryLadderJumpOff(input);

    if (this.climbing) {
      this.cancelAttack();
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
    this.detectWalkOff();
    // Leave-ground cancel before jumpsquat lift-off so X-during-squat rising attacks survive (Java).
    this.cancelAttackOnLeaveGround();
    this.tryCompleteJumpSquatLiftOff();
    this.tickExtendedFall(dt);
    this.applyLandingFromTouchdown(map);
    if (this.justLanded) {
      const recover = Math.max(1, this.landingLockFrames || SquashStretch.DEFAULT_RECOVER_FRAMES);
      this.squash.applyStretchX(1.2, recover);
    }
    if (!this.climbing) {
      this.applyCrouchHeight(crouchHeld, map);
      this.crouching =
        (crouchHeld && this.onGround) ||
        (this.crouchJumpMode && !this.onGround) ||
        // Forced crouch from finishJumpLandingCollision / failed stand-up under ceiling.
        (this.onGround && this.h <= PLAYER_CROUCH_H + 0.5);
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
    this.jumpSquatLiftOffPending = false;
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;
    this.moveAndCollide(dt, map);
    // Java: depenetrate every hurt-lock tick when already embedded (vx often 0 after wall hit).
    if (this.overlapsSolid(map, this.collisionPoseAt(this.x, this.y))) {
      this.nudgeCollisionPoseOutOfSolids(map);
    }
    if (!this.wasOnGround && this.onGround) {
      if (this.normalJumpAirborne) {
        this.finishJumpLandingCollision(map);
        this.normalJumpAirborne = false;
      }
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
    return this.attackPhase !== 0;
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

  /** Sword active AABB, or null when not swinging. */
  attackHitbox(): Aabb | null {
    if (this.attackPhase !== 2) return null;
    const bodyLeft = this.x + this.w * 0.5 - SWORD_BODY_W * 0.5;
    const bodyTop = this.y + this.h - SWORD_BODY_H;
    const local = this.groundCrouchAttack
      ? SWORD_CROUCH_ATTACK_ACTIVE_LOCAL
      : SWORD_ATTACK_ACTIVE_LOCAL;
    const pivot = this.groundCrouchAttack
      ? SWORD_CROUCH_ATTACK_ACTIVE_PIVOT_X
      : SWORD_ATTACK_ACTIVE_PIVOT_X;
    return placePolygonAabb(local, pivot, bodyLeft, bodyTop, this.facing);
  }

  hurtbox(): Aabb {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  /** Grant item, apply passives, sync HP cap, soul/black grants, equip subweapon. */
  collectItem(id: string, catalog: ItemCatalog): void {
    this.inventory.add(id, 1);
    const def = catalog.def(id);
    if (def.subweapon) {
      this.inventory.setEquippedSubweapon(id);
    }
    this.stats.applyItemPassives(this.inventory, catalog);
    // Java syncHealthCapFromItems: raise/lower red cap without auto-heal.
    this.health.max = this.stats.maxHealth;
    if (def.soulHeartsOnPickup > 0) {
      this.health.grantSoulHeartsFilled(def.soulHeartsOnPickup);
    }
    if (def.blackHeartsOnPickup > 0) {
      this.health.grantBlackHeartsFilled(def.blackHeartsOnPickup);
    }
    if (def.redHeartsHealOnPickup > 0) {
      this.health.heal(def.redHeartsHealOnPickup);
    }
  }

  /**
   * Sword vs enemies: hit every overlapping foe on first contact (Java applyAttackHits).
   * Does not latch {@link #attackHitLanded} — mount latches after breakables so both can connect same frame.
   * @returns max freeze frames from hits, or 0 if none / already latched.
   * When {@code onHit} is provided, it is called for each successful strike (HitVfx spawn).
   */
  applyAttackHits(
    enemies: CombatEnemy[],
    onHit?: (enemy: CombatEnemy, strike: WeaponStrike, sword: Aabb) => void,
  ): number {
    const sword = this.attackHitbox();
    if (!sword || this.attackHitLanded) return 0;
    const dmg =
      this.stats.outgoingDamage() *
      (this.groundCrouchAttack ? CROUCH_ATTACK_DAMAGE_MULT : 1);
    let any = false;
    let maxFreeze = 0;
    for (const e of enemies) {
      if (e.isDead()) continue;
      if (!e.intersectsAttack(sword)) continue;
      const ff = freezeFrames(dmg);
      const strike: WeaponStrike = {
        damage: dmg,
        freezeFrames: ff,
        attackerX: this.x,
        attackerW: this.w,
        facing: this.facing,
        knockKind: this.groundCrouchAttack ? "sword_crouch" : "sword_stand",
      };
      const hit = e.applyWeaponStrike(strike);
      if (hit) {
        any = true;
        maxFreeze = Math.max(maxFreeze, ff);
        onHit?.(e, strike, sword);
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

  applyEnemyContacts(enemies: CombatEnemy[]): void {
    if (this.health.isDead || this.health.isInvulnerable) return;
    if (this.hurtLocked) return;
    if (this.defensiveHitstunRemaining > 0) return;
    const hurt = this.hurtbox();
    for (const e of enemies) {
      if (!e.hurtsPlayer(hurt)) continue;
      const dmg = e.contactDamageToPlayer();
      if (!this.health.tryDamage(dmg, CONTACT_DAMAGE_IFRAMES)) return;
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
    this.jumpSquatLiftOffPending = false;
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
    this.jumpSquatLiftOffPending = false;
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

  private attackWindupFramesThisSwing(): number {
    const base = this.stats.attackWindupFrames;
    const frames = this.groundCrouchAttack
      ? base + CROUCH_ATTACK_WINDUP_FRAMES_DELTA
      : base;
    return Math.max(1, frames);
  }

  private attackRecoverEarlyFramesThisSwing(): number {
    const base = this.stats.attackRecoverEarlyFrames;
    const frames = this.groundCrouchAttack
      ? base + CROUCH_ATTACK_RECOVER_EARLY_FRAMES_DELTA
      : base;
    return Math.max(1, frames);
  }

  private attackRecoverLateFramesThisSwing(): number {
    const base = this.stats.attackRecoverLateFrames;
    const frames = this.groundCrouchAttack
      ? base + CROUCH_ATTACK_RECOVER_LATE_FRAMES_DELTA
      : base;
    return Math.max(1, frames);
  }

  private attackRecoverFramesThisSwing(): number {
    return this.attackRecoverEarlyFramesThisSwing() + this.attackRecoverLateFramesThisSwing();
  }

  private tryBeginAttackFromBuffer(downHeld: boolean): void {
    if (this.attackPhase !== 0) return;
    if (this.attackBufferTimer <= 0) return;
    if (this.landingLockFrames > 0 || this.climbing) return;
    this.attackBufferTimer = 0;
    this.attackPhase = 1;
    this.attackHitLanded = false;
    this.attackStartedOnGround = this.onGround;
    // Java: crouch on ground, or air Down (not crouch-jump). Fists never use crouch variant (web: sword only).
    this.groundCrouchAttack =
      (this.onGround && this.crouching) ||
      (!this.onGround && !this.crouchJumpMode && downHeld);
    this.attackTimer = this.attackWindupFramesThisSwing() / 60;
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
      this.onGround && !this.crouching && this.attackPhase === 0 && speed > WALK_SPEED_THRESHOLD;
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
      this.vy >= 0 &&
      !this.crouchJumpMode &&
      !this.climbing
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
  private applyLandingFromTouchdown(map: TileMap): void {
    if (this.wasOnGround || !this.onGround) return;

    this.crouchJumpMode = false;

    // Align stand feet after jump-hull land (Java finishJumpLandingCollision).
    if (this.normalJumpAirborne) {
      this.finishJumpLandingCollision(map);
      this.normalJumpAirborne = false;
    }

    // Air-started attack cancels on land with fixed lock (Java ATTACK_LANDING_LOCK_FRAMES).
    if (this.attackPhase !== 0 && !this.attackStartedOnGround) {
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
    if (this.h < PLAYER_STAND_H - 0.5) {
      this.h = PLAYER_STAND_H;
    }
    const jumpPose = new HitboxPose(
      PLAYER_JUMP_LOCAL,
      this.x,
      this.y,
      this.facing,
      PLAYER_JUMP_PIVOT_X,
      this.h / PLAYER_JUMP_STAND_HITBOX_H,
    );
    const bottomJump = Math.max(
      jumpPose.maxLocalYWorld(PLAYER_JUMP_LEAD_FOOT_LOCAL_Y),
      jumpPose.maxLocalYWorld(PLAYER_JUMP_TRAIL_FOOT_LOCAL_Y),
    );
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
    // Always run (no-op if clear) — matches Java push after optional crouch snap.
    this.pushStandHullOutOfSolids(map);
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
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
  }

  private applyCrouchHeight(crouchHeld: boolean, map: TileMap): void {
    if (this.climbing) return;
    let wantH = PLAYER_STAND_H;
    if (this.jumpSquatRemaining > 0) {
      // Jumpsquat prefers stand (Java); stay crouch-height only if wind-up started crouched.
      wantH = this.crouchJumpMode ? PLAYER_CROUCH_H : PLAYER_STAND_H;
    } else if (this.crouchJumpMode && !this.onGround) {
      wantH = PLAYER_CROUCH_H;
    } else if (crouchHeld && this.onGround) {
      wantH = PLAYER_CROUCH_H;
    }
    // Landing lock is visual-only (Java renderJumpSquatCrouch) — do not shrink collision h.
    if (wantH === this.h) return;
    const oldH = this.h;
    const oldBottom = this.bottom();
    this.h = wantH;
    this.y = oldBottom - this.h;
    if (wantH > oldH && this.overlapsSolid(map)) {
      // Can't stand up here (Java applyHitboxHeight) — stay short.
      this.h = oldH;
      this.y = oldBottom - this.h;
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
    if (dir !== 0) this.facing = dir;

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

  private applyJumpLogic(dt: number, crouchHeld: boolean): void {
    void dt;
    // Getup clears jumpsquat. Sword does not — X during squat starts a rising attack (Java).
    if (this.getupLockFrames > 0) {
      if (this.jumpSquatRemaining > 0) this.jumpSquatRemaining = 0;
      this.jumpSquatLiftOffPending = false;
      return;
    }

    if (this.jumpSquatRemaining > 0) {
      this.vy = 0;
      this.jumpSquatMaxAbsVx = Math.max(this.jumpSquatMaxAbsVx, Math.abs(this.vx));
      this.jumpSquatRemaining--;
      if (this.jumpSquatRemaining === 0) {
        // Defer impulse until after leave-ground attack cancel (Java finish-jumpsquat order).
        this.jumpSquatLiftOffPending = true;
      }
      return;
    }

    // Block starting a new jumpsquat while swinging; existing wind-up already handled above.
    if (this.attackPhase !== 0) return;

    const canJump = this.onGround || this.coyoteTimer > 0;
    // Allow jump during landing lock (clears it) — Java's only landing-lock cancel.
    // Crouch jump: Down held while grounded still starts jumpsquat.
    if (this.jumpBufferTimer > 0 && canJump) {
      this.jumpSquatRemaining = this.stats.jumpSquatFrames;
      this.jumpSquatMaxAbsVx = Math.abs(this.vx);
      this.jumpSquatLiftOffPending = false;
      this.jumpBufferTimer = 0;
      this.vy = 0;
      this.crouchJumpMode = this.onGround && crouchHeld;
      this.landingLockFrames = 0;
      this.crouchQueuedFromLanding = false;
      this.walkOffLedgeActive = false;
      this.climbing = false;
      this.climbShaftTx = -1;
    }
  }

  /** Apply deferred jumpsquat impulse (after leave-ground cancel). */
  private tryCompleteJumpSquatLiftOff(): void {
    if (!this.jumpSquatLiftOffPending) return;
    this.jumpSquatLiftOffPending = false;
    let vel = this.stats.jumpVel;
    const speedGate = Math.max(this.stats.maxGroundSpeed, this.stats.maxAirSpeed) * 0.99;
    if (this.jumpSquatMaxAbsVx >= speedGate) {
      vel *= HIGH_SPEED_JUMP_VEL_MULT;
    }
    this.vy = -vel;
    this.vx = Math.max(
      -this.stats.maxAirSpeed,
      Math.min(this.stats.maxAirSpeed, this.vx),
    );
    this.onGround = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.walkOffLedgeActive = false;
    // Keep crouchJumpMode for air hull until land; normal jump uses PLAYER_JUMP.
    this.normalJumpAirborne = !this.crouchJumpMode;
    this.squash.applyStretchY(1.2, SquashStretch.DEFAULT_RECOVER_FRAMES);
  }

  private applyGravity(dt: number): void {
    if (this.jumpSquatRemaining > 0 || this.jumpSquatLiftOffPending) return;
    let g = GRAVITY;
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
          this.jumpSquatLiftOffPending = false;
          this.crouchJumpMode = false;
          this.normalJumpAirborne = false;
        }
        this.climbing = true;
        this.walkOffLedgeActive = false;
        this.constrainClimbingShaftColumn(map);
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
    this.vx = approach(this.vx, 0, this.stats.airBrake * dt);
    this.constrainClimbingShaftColumn(map);

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
    this.jumpSquatLiftOffPending = false;

    if (kind === "ladder_top") {
      this.captureGetupMouthShaftFromClimb(map);
      this.computeGetupLandPlatform(map);
      this.x = this.getupLandX;
      this.y = this.getupLandY;
      this.h = PLAYER_STAND_H;
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

  private finishGetup(_map: TileMap): void {
    const finished = this.getupKind;
    if (finished === "ladder_mount") {
      if (this.getupMouthCol >= 0 && this.getupMouthRungTy >= 0) {
        this.climbShaftTx = this.getupMouthCol;
        this.climbing = true;
        this.onGround = false;
        this.vx = 0;
        this.vy = this.getupLatchDown ? this.stats.climbSpeed : 0;
        this.h = PLAYER_STAND_H;
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
      this.onGround = true;
      this.vx = 0;
      this.vy = 0;
      this.h = PLAYER_STAND_H;
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
    if (this.top() <= TILE_SIZE) return false;
    let deckTy = this.feetStandableDeckRowInColumn(map, col);
    let topRungTy = deckTy >= 0 ? mouthRungRowBelowDeck(map, col, deckTy) : -1;
    if (deckTy >= 0) {
      // Feet on solid floor / non-mouth platform (e.g. room ground under a shaft) is NOT a top step-off.
      // Only a mouth `-` with `H` directly below qualifies for the deckTy >= 0 path.
      if (topRungTy < 0) return false;
    } else {
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

  private moveAndCollide(dt: number, map: TileMap): void {
    const poseBefore = this.hitboxPose();
    const prevFootY = this.collisionFootWorldY(poseBefore);
    const prevTop = poseBefore.bounds().y;
    // Full predicted pose (incl. vx) so landing decks aren't misread as side walls (Java).
    const predictedFootY = this.collisionFootWorldY(
      this.collisionPoseAt(this.x + this.vx * dt, this.y + this.vy * dt),
    );

    const xBefore = this.x;
    this.x += this.vx * dt;
    this.resolveHorizontal(map, xBefore, prevFootY, predictedFootY);

    // Post-horizontal foot Y for vertical sweep (Java footYBeforeVertical).
    const footYBeforeVertical = this.collisionFootWorldY();
    this.y += this.vy * dt;
    this.onGround = false;
    this.resolveVertical(map, footYBeforeVertical, prevTop);
    if (!this.onGround) {
      this.onGround = this.isGrounded(map);
    }
  }

  private resolveHorizontal(
    map: TileMap,
    xBefore: number,
    prevFootY: number,
    predictedFootY: number,
  ): void {
    if (this.vx === 0) return;
    if (
      !this.polygonOverlapsHorizontalBlockingSolids(
        this.collisionPoseAt(this.x, this.y),
        map,
        this.vx,
        prevFootY,
        predictedFootY,
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
            prevFootY,
            predictedFootY,
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
            prevFootY,
            predictedFootY,
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

  private resolveVertical(map: TileMap, prevFootY: number, prevTop: number): void {
    const pose = this.hitboxPose();
    const b = pose.bounds();
    const nextFootY = this.collisionFootWorldY(pose);

    if (this.vy >= 0) {
      let bestFloor = Number.POSITIVE_INFINITY;
      const leftTile = Math.floor((b.x + 0.001) / TILE_SIZE);
      const rightTile = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
      const prevFootTile = Math.floor((prevFootY - 1e-4) / TILE_SIZE);
      const nextFootTile = Math.floor((nextFootY - 1e-4) / TILE_SIZE);
      const tyLo = Math.min(prevFootTile, nextFootTile);
      const tyHi = Math.max(prevFootTile, nextFootTile);
      const platScanLo = leftTile - 1;
      const platScanHi = rightTile + 1;

      for (let ty = tyLo; ty <= tyHi; ty++) {
        const floorY = ty * TILE_SIZE;
        // Feet already below this deck (Y-down): skip.
        if (prevFootY > floorY + 1e-3) continue;
        if (nextFootY < floorY - 1e-3) continue;

        for (let tx = leftTile; tx <= rightTile; tx++) {
          if (!map.isSolidTile(tx, ty)) continue;
          const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
          if (!pose.intersectsRect(tile)) continue;
          const crossedFromAbove = prevFootY <= floorY + 1e-3 || prevFootTile < ty;
          if (crossedFromAbove && nextFootY >= floorY - 1e-3) {
            bestFloor = Math.min(bestFloor, floorY);
          }
        }

        if (!this.climbing) {
          for (let tx = platScanLo; tx <= platScanHi; tx++) {
            if (!map.isPlatformTile(tx, ty)) continue;
            if (this.dropsThroughOneWayPlatformTile(map, tx, ty)) continue;
            const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
            if (!pose.intersectsRect(tile)) continue;
            const crossedFromAbove =
              prevFootY <= floorY + PLATFORM_DECK_SLACK_PX + 1e-3 || prevFootTile < ty;
            const restingOnDeck =
              nextFootY >= floorY - 1e-3 &&
              nextFootY <= floorY + PLATFORM_DECK_SLACK_PX &&
              prevFootY >= floorY - 1e-3;
            if ((crossedFromAbove && nextFootY >= floorY - 1e-3) || restingOnDeck) {
              bestFloor = Math.min(bestFloor, floorY);
            }
          }
        }
      }

      if (Number.isFinite(bestFloor)) {
        this.snapFootToFloorY(bestFloor);
        this.vy = 0;
        this.onGround = true;
        if (this.climbing) {
          this.climbing = false;
          this.climbShaftTx = -1;
        }
      }
    } else {
      // Ceiling — use polygon top against solid tiles (one-ways ignored while rising).
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

  private snapFootToFloorY(floorY: number): void {
    // Keep current top `y`, shift so collisionFootWorldY lands on floorY.
    const foot = this.collisionFootWorldY();
    this.y += floorY - foot;
  }

  private isGrounded(map: TileMap): boolean {
    if (this.vy < 0) return false;
    const foot = this.collisionFootWorldY();
    const pose = this.hitboxPose();
    const b = pose.bounds();
    const leftTile = Math.floor((b.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
    const tyCenter = Math.floor((foot - 1e-3) / TILE_SIZE);
    const scanLo = leftTile - 1;
    const scanHi = rightTile + 1;
    for (let dty = -1; dty <= 1; dty++) {
      const ty = tyCenter + dty;
      if (ty < 0 || ty >= map.getHeight()) continue;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!map.isSolidTile(tx, ty)) continue;
        const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
        if (pose.intersectsRect(tile)) return true;
      }
      // Platforms ignored while climbing (Java); solids can still ground.
      if (!this.climbing) {
        for (let tx = scanLo; tx <= scanHi; tx++) {
          if (!map.isPlatformTile(tx, ty)) continue;
          if (this.dropsThroughOneWayPlatformTile(map, tx, ty)) continue;
          const tileLeft = tx * TILE_SIZE;
          const tileRight = (tx + 1) * TILE_SIZE;
          if (b.x + b.w <= tileLeft + 1e-6 || b.x >= tileRight - 1e-6) continue;
          const deckTop = ty * TILE_SIZE;
          if (foot >= deckTop - 1e-3 && foot <= deckTop + PLATFORM_DECK_SLACK_PX) {
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
    prevFootY: number,
    predictedFootY: number,
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
          if (this.solidTileBlocksHorizontalWall(pose, map, c, ty, prevFootY, predictedFootY)) {
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
          if (this.solidTileBlocksHorizontalWall(pose, map, c, ty, prevFootY, predictedFootY)) {
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
    prevFootY: number,
    predictedFootY: number,
  ): boolean {
    if (this.vy < 0 || !Number.isFinite(prevFootY) || !Number.isFinite(predictedFootY)) {
      return false;
    }
    if (!map.isPlatformTile(tx, ty) || this.dropsThroughOneWayPlatformTile(map, tx, ty)) {
      return false;
    }
    const deckTop = ty * TILE_SIZE;
    const prevFootTile = Math.floor((prevFootY - 1e-4) / TILE_SIZE);
    const crossedFromAbove =
      prevFootY <= deckTop + PLATFORM_DECK_SLACK_PX + 1e-3 || prevFootTile < ty;
    const reachesDeck = predictedFootY >= deckTop - 1e-3;
    return crossedFromAbove && reachesDeck;
  }

  private solidTileFloorContactThisStep(
    map: TileMap,
    tx: number,
    ty: number,
    prevFootY: number,
    nextFootY: number,
  ): boolean {
    if (!map.isSolidTile(tx, ty)) return false;
    const floorY = ty * TILE_SIZE;
    const prevFootTile = Math.floor((prevFootY - 1e-4) / TILE_SIZE);
    const crossedFromAbove = prevFootY <= floorY + 1e-3 || prevFootTile < ty;
    const restingOnDeck =
      nextFootY >= floorY - 1e-3 &&
      nextFootY <= floorY + PLATFORM_DECK_SLACK_PX &&
      prevFootY >= floorY - 1e-3;
    return (crossedFromAbove && nextFootY >= floorY - 1e-3) || restingOnDeck;
  }

  /**
   * Solid floor deck feet will touch after vertical resolve — defer horizontal so landing
   * momentum isn't zeroed. Still blocks knockback sliding along an already-grounded deck.
   */
  private tileIsSolidFloorLandingThisStep(
    map: TileMap,
    tx: number,
    ty: number,
    prevFootY: number,
    predictedFootY: number,
  ): boolean {
    if (this.vy < 0 || !Number.isFinite(prevFootY) || !Number.isFinite(predictedFootY)) {
      return false;
    }
    if (!this.solidTileFloorContactThisStep(map, tx, ty, prevFootY, predictedFootY)) {
      return false;
    }
    const deckTop = ty * TILE_SIZE;
    const prevFootTile = Math.floor((prevFootY - 1e-4) / TILE_SIZE);
    const alreadyGroundedOnDeck =
      prevFootY >= deckTop - 1e-3 && prevFootY <= deckTop + PLATFORM_DECK_SLACK_PX;
    const descendingOntoDeck = predictedFootY > prevFootY + 1e-3;
    const fromAirTileRow = prevFootTile < ty;
    if (alreadyGroundedOnDeck && !descendingOntoDeck && !fromAirTileRow) {
      return false;
    }
    return true;
  }

  /**
   * False when feet rest on / are landing on a deck (trail may extend into the tile — not a side wall).
   */
  private solidTileBlocksHorizontalWall(
    pose: HitboxPose,
    map: TileMap,
    tx: number,
    ty: number,
    prevFootY: number,
    predictedFootY: number,
  ): boolean {
    if (this.tileIsVerticalDeckContactThisStep(map, tx, ty, prevFootY, predictedFootY)) {
      return false;
    }
    if (this.tileIsSolidFloorLandingThisStep(map, tx, ty, prevFootY, predictedFootY)) {
      return false;
    }
    const deckTop = ty * TILE_SIZE;
    const feet = this.poseForFeetSupport().bounds();
    if (feet.y + feet.h >= deckTop - 1e-3 && feet.y + feet.h <= deckTop + PLATFORM_DECK_SLACK_PX) {
      return false;
    }
    if (map.isPlatformTile(tx, ty) && !this.dropsThroughOneWayPlatformTile(map, tx, ty)) {
      const footY = this.collisionFootWorldY(pose);
      if (footY >= deckTop - 1e-3 && footY <= deckTop + PLATFORM_DECK_SLACK_PX + 1e-3) {
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

  /** True if hitbox overlaps the given ladder column (for boss ascend). */
  overlapsLadderColumn(map: TileMap, columnTx: number): boolean {
    if (columnTx < 0) return false;
    if (this.ladderShaftBelowFeetPlatformInColumn(map, columnTx)) return true;
    if (!this.aabbOverlapsTileX(columnTx)) return false;
    const topTile = Math.floor((this.top() + 0.001) / TILE_SIZE);
    const bottomTile = Math.floor((this.bottom() - 0.001) / TILE_SIZE);
    for (let ty = topTile; ty <= bottomTile; ty++) {
      if (map.isLadderTile(columnTx, ty) && this.aabbOverlapsTile(columnTx, ty)) return true;
    }
    // Open ceiling cell (tx,0) still counts while climbing near the top.
    if (this.climbing && this.top() < TILE_SIZE * 1.5 && this.aabbOverlapsTileX(columnTx)) {
      return true;
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

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}
