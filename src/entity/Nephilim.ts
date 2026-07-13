import type { HitboxPose } from "../collision/HitboxPose";
import { HitboxPose as HitboxPoseClass } from "../collision/HitboxPose";
import { polygonIntersectsPolygon } from "../collision/polygonIntersect";
import {
  CHILD,
  isConnector as chainIsConnector,
  NEPHILIM_LEG_CHAINS,
  NEPHILIM_LIMBS,
  NEPHILIM_LINKS,
  PARENT,
  type LimbChain,
} from "./ChainPinModel";
import { solveTwoBoneIk } from "./TwoBoneIk";
import {
  aabbOverlap,
  freezeFrames,
  type Aabb,
  type ProjectileStrike,
  type WeaponStrike,
} from "../combat/CombatMath";
import { BlackHeartBeatDeferral } from "../combat/BlackHeartBeatDeferral";
import {
  queueBlackHeartBurstKnock,
  releaseBlackHeartBeatKnockback,
  tickBlackHeartEnemyHitstun,
} from "../combat/BlackHeartEnemyCombat";
import { HURT_TINT_PEAK_ALPHA, HURT_TINT_SECONDS } from "../combat/HitlagState";
import {
  chainAttach,
  feetBelowAnchorFromRig,
  getNephilimRig,
  poseOffset,
  sequence,
  type NephilimPartDef,
  type NephilimRigData,
} from "../boss/NephilimRig";
import { polygonBounds, polygonIntersectsAabb } from "../collision/polygonIntersect";
import { GRAVITY } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { seesPlayerAt, type PlayerCombatSnapshot, type WorldRect } from "../combat/EnemyVision";

export type NephilimDeathChunkSpawn = {
  frameIndex: number;
  pivotWorldX: number;
  pivotWorldY: number;
  vx: number;
  vy: number;
  angleRad: number;
  omega: number;
  pivotX: number;
  pivotY: number;
  mirror: boolean;
  hullLocal: number[] | null;
  head: boolean;
};

const SPAWN_FLOOR_EPS_PX = 0.5;
const AWAKEN_FRAME_SEC = 1.05;
const NOTICE_SEC = 1.35;
const PART_K = 200;
const PART_C = 2 * Math.sqrt(PART_K);
const ANGLE_K = 160;
const ANGLE_C = 2 * Math.sqrt(ANGLE_K);
const KNOCK_SPEED = 145;
const KNOCK_UP = 58;
const KNOCK_SPIN_DEG = 620;
const LOOSE_MIN_SEC = 0.32;
const ANCHOR_TRAIL_FRAC = 0.28;
const BAND_URGED_HP_FRAC = 0.66;
const BAND_DESPERATE_HP_FRAC = 0.33;
const WALK_SPEED_BASE = 20;
const WALK_SPEED_AGG = 28;
const BACKPEDAL_SPEED_BASE = 26;
const BACKPEDAL_SPEED_AGG = 22;
const STANDOFF_APPROACH_BASE_PX = 32;
const STANDOFF_APPROACH_AGG_PX = 14;
const STANDOFF_RETREAT_BASE_PX = 24;
const STANDOFF_RETREAT_AGG_PX = 8;
const MAX_FALL = 6000;
const HURT_TINT_SEC = HURT_TINT_SECONDS;
const HURT_POSE_SEC = 0.18;
const PUPPET_WALK_HZ = 3.6 * 3.5;
const PLANTED_VEL_PX = 6;
const WALK_STEP_THRESHOLD_PX = 0.04;
const DEATH_POSE1_SEC = 0.55;
const DEATH_POSE2_SEC = 0.45;
const DEATH_POSE_K = 320;
const DEATH_POSE_C = 2 * Math.sqrt(DEATH_POSE_K);
const DEATH_HEAD_HOLD_K = 240;
const DEATH_HEAD_HOLD_C = 2 * Math.sqrt(DEATH_HEAD_HOLD_K);
const DEATH_PART_DROP_INTERVAL = 0.16;
const DEATH_HEAD_FALL_DELAY_SEC = 2.6;
const DEATH_CHUNK_SCATTER_HORZ = 28;
const DEATH_CHUNK_SCATTER_UP = 16;
const ROOM_MARGIN = 14;
const CHAIN_SLACK = 1.14;
const CHAIN_GRAVITY = GRAVITY * 0.42;
const LOOSE_MAX_SEC = 1.45;
const LOOSE_RECALL_K_HEAD = 78;
const LOOSE_RECALL_K_HAND = 54;
const LOOSE_RECALL_ANGLE_K = 130;
const LOOSE_SETTLE_DIST_HEAD = 13;
const LOOSE_SETTLE_DIST_HAND = 9;
const LOOSE_LINEAR_DAMP = 1.4;
const LOOSE_LINEAR_DAMP_EXT = 1.75;
const LOOSE_ANGLE_DAMP = 0.55;
const LOOSE_ANGLE_DAMP_HEAD = 3.1;
const LOOSE_ANGLE_DAMP_HAND = 1.05;
const LOOSE_WALL_REST = 0.7;
const LOOSE_FLOOR_REST = 0.6;

const GRAB_WINDUP_SEC = 0.62;
const GRAB_WINDUP_AGG_SEC = 0.46;
const GRAB_REACH_SEC = 0.38;
const ARM_IK_REACH_SCALE_BASE = 1.0;
const ARM_IK_REACH_SCALE_AGG = 2.0;
const GRAB_POSE_REACH = "grab_reach";
const GRAB_POSE_HOLD_0 = "grab_0";
const GRAB_POSE_HOLD_1 = "grab_1";
const GRAB_HOLD_SEC = 0.34;
const GRAB_HOLD_LATCHED_THROW_SEC = 2.0;
const GRAB_HOLD_MASH_TIMER_MULT = 2.0;
const GRAB_HOLD_LATCHED_DRINK_SEC = GRAB_HOLD_SEC * 2.0;
const GRAB_RELEASE_BEAT_SEC = 0.38;
const GRAB_DRINK_SIP_SEC = 0.72;
const GRAB_DRINK_STEAL_HALF_HEARTS = 1.0;
const GRAB_DRINK_HEAL_HP = 4;
const GRAB_DRINK_HITSTUN_MULT = 5.0;
const GRAB_RECOVER_SEC = 0.48;
const GRAB_RECOVER_AGG_SEC = 0.3;
const GRAB_COOLDOWN_BASE_SEC = 2.75;
const GRAB_COOLDOWN_AGG_SEC = 0.85;
const GRAB_STANDOFF_HOLD_BASE_SEC = 0.9;
const GRAB_STANDOFF_HOLD_AGG_SEC = 0.15;
const GRAB_REACH_IK = 1.0;
const GRAB_LUNGE_SPEED_BASE = 52;
const GRAB_LUNGE_SPEED_AGG = 78;

const LIFT_HEIGHT_WORLD_PX = 96;
const LIFT_HAND_ABOVE_ANCHOR_PX = 28;
const LIFT_RISE_SEC = 0.85;
const LIFT_DRAG_SEC = 1.35;
const LIFT_DRAG_SPEED_BASE = 118;
const LIFT_DRAG_SPEED_AGG = 168;
const LIFT_RECOVER_SEC = 1.25;
const LIFT_LAND_SEC = 2.4;
const LIFT_LAND_LOOSE_SEC = 2.35;
const LIFT_LAND_IMPACT_HITLAG = 11;
const LIFT_REBUILD_RECALL_K = 168;
const LIFT_REBUILD_ANGLE_K = 230;
const LIFT_COOLDOWN_BASE_SEC = 11.0;
const LIFT_COOLDOWN_AGG_SEC = 7.0;
const LIFT_STUCK_MIN_SEC = 0.85;
const LIFT_STUCK_ATTEMPT_BASE_SEC = 3.8;
const LIFT_STUCK_ATTEMPT_AGG_SEC = 2.2;
const LIFT_STUCK_MOVE_EPS = 1.2;
const LIFT_UNREACHABLE_VERT_PX = 24;
const LIFT_UNREACHABLE_MIN_SEC = 0.5;
const LIFT_UNREACHABLE_ATTEMPT_BASE_SEC = 2.0;
const LIFT_UNREACHABLE_ATTEMPT_AGG_SEC = 1.1;
const LIFT_DROP_CONTACT_DAMAGE = 1;
const LIFT_DROP_IK_WOBBLE_HZ = 9.5;

const ARM_GUARD_HITS = 3;
const ARM_GUARD_COMBO_SEC = 1.8;
const ARM_GUARD_DURATION_SEC = 2.4;
const ARM_GUARD_COOLDOWN_SEC = 3.75;
const ARM_GUARD_POSE = "arm_guard";
const ARM_GUARD_GLOW_PEAK_ALPHA = 175;
const ARM_GUARD_GLOW_FADE_SEC = 1.25;
const SHIELD_PROJECTILE_INFLATE_PX = 3.5;

export const DRINK_HEAL_OVERLAY_DURATION_SEC = 0.82;
export const DRINK_HEAL_OVERLAY_BASE_ALPHA = 0.9;
export const DRINK_HEAL_OVERLAY_RISE_WORLD_PX = 56;

const DEATH_HEAD_LAND_MAX_SEC = 4.0;

type GrabReleaseKind = "THROW" | "DRINK";
type LiftPhase = "RISE" | "DRAG" | "DROP" | "LAND" | "RECOVER";

export type LiftPuppetString = {
  handWorldX: number;
  handWorldY: number;
  anchorWorldX: number;
  anchorWorldY: number;
};

export type ChainStringSegment = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  loose: boolean;
};

type LifePhase = "DORMANT" | "AWAKENING" | "NOTICE" | "ACTIVE";

export type NephilimPartSim = {
  name: string;
  cx: number;
  cy: number;
  prevCx: number;
  prevCy: number;
  prevAngle: number;
  vx: number;
  vy: number;
  angleDeg: number;
  angleVel: number;
  loose: boolean;
  looseTimer: number;
  looseAge: number;
  bobPhase: number;
  chainLen: number;
};

export type NephilimPartRender = {
  name: string;
  frame: number;
  cx: number;
  cy: number;
  angleRad: number;
  mirror: boolean;
  pivotX: number;
  pivotY: number;
  armGuardGlowAlpha: number;
};

/**
 * Phase 5b Nephilim — grounded marionette boss (intro, stalk, combat, grab, lift, arm guard, chain IK, marionette death).
 */
export class Nephilim implements CombatEnemy {
  /** Body-center anchor in world space. */
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hp: number;
  readonly maxHp: number;
  hitlagSolidRed = false;
  hitlagElectrocute = false;
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  readonly blackHeartBeat = new BlackHeartBeatDeferral();

  private lifePhase: LifePhase = "DORMANT";
  private awakenIdx = 0;
  private awakenTimer = 0;
  private noticeTimer = 0;
  private idleSeqIdx = 0;
  private idleSeqTimer = 0;
  private idleExtraPause = 0;
  private facingRight = false;
  private visionSeesPlayer = false;
  private playerCx = NaN;
  private playerCy = NaN;
  private dir = -1;
  private onGround = true;
  private wasOnGround = true;
  private bobTime = 0;
  private walkPhase = 0;
  private lastHorzStepPx = 0;
  private feetBelowAnchorPx = 20;
  hitstun = 0;
  private hurtPoseTimer = 0;
  private hurtTintRemaining = 0;
  private knockbackContactTimer = 0;
  private readonly partSims: NephilimPartSim[] = [];
  private readonly simNames: string[] = [];
  private partScattered: boolean[] | null = null;
  private deathStarted = false;
  private deathTimer = -1;
  private deathDropTimer = 0;
  private deathDropIdx = 0;
  private deathDropOrder: number[] = [];
  private deathBodyDropsFinished = false;
  private deathHeadChunkQueued = false;
  private deathPostScatterTimer = 0;
  private readonly pendingDeathChunks: NephilimDeathChunkSpawn[] = [];
  private readonly lastStruckParts: number[] = [];

  private grabSeqIdx = -1;
  private attackPhaseTimer = 0;
  private attackCooldown = 0;
  private standoffHoldTimer = 0;
  private grabLatched = false;
  private grabReleaseKind: GrabReleaseKind = "THROW";
  private grabDrinkActive = false;
  private grabDrinkStealPending = false;
  private grabStruggleMashing = false;
  private grabReleasePending = false;
  private grabHoldWallTurned = false;

  private liftPhase: LiftPhase | null = null;
  private liftPhaseTimer = 0;
  private liftCooldown = 0;
  private anchorStuckTimer = 0;
  private liftStuckAttemptTimer = 0;
  private liftUnreachableTimer = 0;
  private liftHandWorldX = 0;
  private liftHandWorldY = 0;
  private liftTargetAnchorY = 0;
  private cameraViewWorld: WorldRect | null = null;
  private renderPrevX = 0;
  private renderPrevY = 0;

  private armGuardTimer = 0;
  private armGuardCooldown = 0;
  private armGuardGlow = 0;
  private comboHitCount = 0;
  private comboHitWindow = 0;

  private plantedFootL = false;
  private plantedFootLWorldX = 0;
  private plantedFootLWorldY = 0;
  private plantedFootR = false;
  private plantedFootRWorldX = 0;
  private plantedFootRWorldY = 0;

  private offensiveHitlagFrames = 0;
  private drinkHealOverlayAge = -1;

  private deathFightOver = false;
  private deathHeadFallTimer = 0;
  private deathHeadChunk: import("../fx/BrickChunk").BrickChunk | null = null;

  constructor(anchorX: number, anchorY: number, maxHp: number) {
    this.x = anchorX;
    this.y = anchorY;
    this.renderPrevX = anchorX;
    this.renderPrevY = anchorY;
    this.maxHp = maxHp;
    this.hp = maxHp;
    const rig = getNephilimRig();
    if (rig) this.ensureSims(rig);
  }

  /** Anchor Y so idle feet rest on groundTopWorldY. */
  static anchorYOnGround(groundTopWorldY: number, rig?: NephilimRigData | null): number {
    const r = rig ?? getNephilimRig();
    const feet = r ? feetBelowAnchorFromRig(r) : 20;
    return groundTopWorldY - feet - SPAWN_FLOOR_EPS_PX;
  }

  bindRoom(map: TileMap): void {
    const rig = getNephilimRig();
    if (rig) {
      this.feetBelowAnchorPx = feetBelowAnchorFromRig(rig);
      this.ensureSims(rig);
      this.snapToGround(map, rig);
    }
  }

  private snapToGround(map: TileMap, rig: NephilimRigData): void {
    const tx = Math.floor(this.x / TILE_SIZE);
    const groundTop = map.groundTopWorldYAtColumn(tx);
    this.y = Nephilim.anchorYOnGround(groundTop, rig);
    this.onGround = true;
  }

  setCameraView(view: WorldRect): void {
    this.cameraViewWorld = view;
  }

  applyVision(player: PlayerCombatSnapshot, seeRadius: number): void {
    this.playerCx = player.cx;
    this.playerCy = player.cy;
    this.visionSeesPlayer = seesPlayerAt(this.x, this.y, player.cx, player.cy, seeRadius);
  }

  seesPlayer(): boolean {
    return this.visionSeesPlayer;
  }

  /** Java kuriboStompOverlaps — combat-active gate. */
  kuriboStompOverlaps(playerHurt: HitboxPose): boolean {
    if (!this.isCombatActive() || this.deathStarted) return false;
    return playerHurt.intersectsRect(this.damageReceivePose());
  }

  setGrabStruggleMashing(mashing: boolean): void {
    this.grabStruggleMashing = mashing;
  }

  isCombatActive(): boolean {
    return this.lifePhase === "ACTIVE" && !this.deathStarted && this.hp > 0;
  }

  suppressDeathExplosion(): boolean {
    return true;
  }

  drainDeathChunkSpawns(): NephilimDeathChunkSpawn[] {
    if (this.pendingDeathChunks.length === 0) return [];
    const out = [...this.pendingDeathChunks];
    this.pendingDeathChunks.length = 0;
    return out;
  }

  partRenders(): NephilimPartRender[] {
    const rig = getNephilimRig();
    if (!rig || this.partSims.length === 0) return [];
    const out: NephilimPartRender[] = [];
    const mirror = this.facingRight;
    for (const name of rig.drawOrder) {
      const idx = this.indexOf(name);
      if (idx < 0) continue;
      if (this.partScattered?.[idx]) continue;
      const def = rig.parts[idx]!;
      const p = this.partSims[idx]!;
      let ang = (p.angleDeg * Math.PI) / 180;
      if (mirror) ang = -ang;
      out.push({
        name: def.name,
        frame: def.frame,
        cx: p.cx,
        cy: p.cy,
        angleRad: ang,
        mirror,
        pivotX: def.pivotX,
        pivotY: def.pivotY,
        armGuardGlowAlpha: this.forearmShieldGlowAlpha(def.name),
      });
    }
    return out;
  }

  update(dt: number, map: TileMap, _playerX: number, _roomEnemies?: readonly CombatEnemy[]): void {
    const rig = getNephilimRig();
    if (!rig) return;
    this.ensureSims(rig);

    this.hurtTintRemaining = Math.max(0, this.hurtTintRemaining - dt);
    this.hurtPoseTimer = Math.max(0, this.hurtPoseTimer - dt);
    this.knockbackContactTimer = Math.max(0, this.knockbackContactTimer - dt);
    this.tickArmGuard(dt);
    if (this.drinkHealOverlayAge >= 0) {
      this.drinkHealOverlayAge += dt;
      if (this.drinkHealOverlayAge >= DRINK_HEAL_OVERLAY_DURATION_SEC) {
        this.drinkHealOverlayAge = -1;
      }
    }

    if (this.offensiveHitlagFrames > 0) {
      this.offensiveHitlagFrames--;
    }

    if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
      tickBlackHeartEnemyHitstun(dt, this);
    } else {
      this.hitlagShakeX = 0;
      this.hitlagShakeY = 0;
      this.hitlagSolidRed = false;
    }

    const movementFrozen = this.hitstun > 0 || this.blackHeartBeat.isLocked();

    if (!this.deathStarted && this.hp <= 0) {
      this.startDeath(rig);
    }

    if (this.deathStarted) {
      this.tickDeath(dt, map, rig);
      this.deathTimer += dt;
      return;
    }

    this.tickLifePhase(dt, rig);

    if (this.lifePhase === "ACTIVE") {
      if (this.isLiftActive()) {
        this.liftPhaseTimer = Math.max(0, this.liftPhaseTimer - dt);
      }
      if (!movementFrozen && this.offensiveHitlagFrames <= 0) {
        this.tickAttack(dt, map, rig);
      } else if (!this.isLiftActive()) {
        this.vx = 0;
      }
      if (this.isLiftActive()) {
        this.tickLiftMovement(dt, map, rig);
      } else if (!movementFrozen && this.offensiveHitlagFrames <= 0) {
        this.tickGroundMovement(dt, map, rig);
      }
    } else {
      this.vx = 0;
      this.vy = 0;
      this.onGround = this.isGrounded(map, rig);
    }

    this.bobTime += dt;
    if (
      this.lifePhase === "ACTIVE" &&
      !this.isGrabActive() &&
      !this.isLiftActive() &&
      this.hurtPoseTimer <= 0 &&
      !this.isHorzWalking()
    ) {
      this.tickUncannyIdle(dt, rig);
    } else if (this.lifePhase !== "ACTIVE") {
      this.idleSeqTimer = 0;
      this.idleSeqIdx = 0;
      this.idleExtraPause = 0;
    }

    if (this.isHorzWalking()) {
      this.walkPhase += dt * PUPPET_WALK_HZ * Math.sign(this.lastHorzStepPx || 1);
    }

    // Java keeps integrating parts during hitstun so knock impulses settle instead of rubber-banding.
    const pose = this.currentPoseName(rig);
    this.integrateParts(dt, map, rig, pose);
    this.finalizeGroundedStance(rig, map);

    this.renderPrevX = this.x;
    this.renderPrevY = this.y;
    for (const p of this.partSims) {
      p.prevCx = p.cx;
      p.prevCy = p.cy;
      p.prevAngle = p.angleDeg;
    }
  }

  private tickLifePhase(dt: number, rig: NephilimRigData): void {
    switch (this.lifePhase) {
      case "DORMANT":
        if (this.visionSeesPlayer) {
          this.lifePhase = "AWAKENING";
          this.awakenIdx = 0;
          this.awakenTimer = 0;
          this.vx = 0;
        }
        break;
      case "AWAKENING": {
        this.awakenTimer += dt;
        const seq = sequence(rig, "awaken");
        while (this.awakenIdx < seq.length && this.awakenTimer >= AWAKEN_FRAME_SEC) {
          this.awakenTimer -= AWAKEN_FRAME_SEC;
          this.awakenIdx++;
        }
        if (this.awakenIdx >= seq.length) {
          this.lifePhase = "NOTICE";
          this.noticeTimer = NOTICE_SEC;
          this.updateFacingTowardPlayer();
        }
        break;
      }
      case "NOTICE":
        this.noticeTimer -= dt;
        this.updateFacingTowardPlayer();
        if (this.noticeTimer <= 0) {
          this.lifePhase = "ACTIVE";
        }
        break;
      case "ACTIVE":
        break;
    }
  }

  private updateFacingTowardPlayer(): void {
    if (!Number.isFinite(this.playerCx)) return;
    if (this.playerCx > this.x + 4) this.facingRight = true;
    else if (this.playerCx < this.x - 4) this.facingRight = false;
  }

  private tickGroundMovement(dt: number, map: TileMap, rig: NephilimRigData): void {
    this.onGround = this.isGrounded(map, rig);
    this.updateFacingTowardPlayer();
    const xBefore = this.x;
    this.tickEngageHorzVelocity(dt, map, rig);
    const intentVx = this.vx;
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;
    this.moveAndCollide(dt, map, rig);
    this.lastHorzStepPx = Math.abs(intentVx) > 1 ? this.x - xBefore : 0;
    this.onGround = this.isGrounded(map, rig);
    if (this.onGround && !this.wasOnGround) {
      this.plantedFootL = false;
      this.plantedFootR = false;
    }
    this.wasOnGround = this.onGround;
    this.clampToRoom(map, rig);
  }

  private tickEngageHorzVelocity(dt: number, map: TileMap, rig: NephilimRigData): void {
    if (this.isLiftActive()) {
      this.vx = 0;
      return;
    }
    if (this.isGrabActive()) {
      if (this.isGrabReachIk(rig) && Number.isFinite(this.playerCx)) {
        const toward = Math.sign(this.playerCx - this.x);
        if (toward !== 0) {
          const lungeVx = toward * this.lerpAgg(GRAB_LUNGE_SPEED_BASE, GRAB_LUNGE_SPEED_AGG);
          this.vx = this.canMoveHorizontally(map, rig, lungeVx) ? lungeVx : 0;
          return;
        }
      }
      this.vx *= Math.max(0, 1 - dt * 14);
      if (Math.abs(this.vx) < 2) this.vx = 0;
      return;
    }
    if (!this.visionSeesPlayer || !this.onGround || !Number.isFinite(this.playerCx)) {
      this.vx *= Math.max(0, 1 - dt * 6);
      return;
    }
    const gap = Math.abs(this.playerCx - this.x);
    let awaySign = Math.sign(this.x - this.playerCx);
    if (awaySign === 0) awaySign = this.facingRight ? -1 : 1;
    if (this.playerCx > this.x + 4) this.dir = 1;
    else if (this.playerCx < this.x - 4) this.dir = -1;
    const retreatPx = this.standoffRetreatPx();
    const approachPx = this.standoffApproachPx();
    if (gap < retreatPx) {
      const retreatVx = awaySign * this.backpedalSpeed();
      this.vx = this.canMoveHorizontally(map, rig, retreatVx) ? retreatVx : 0;
    } else if (gap > approachPx) {
      const approachVx = this.dir * this.walkSpeed();
      this.vx = this.canMoveHorizontally(map, rig, approachVx) ? approachVx : 0;
    } else {
      this.vx *= Math.max(0, 1 - dt * 10);
      if (Math.abs(this.vx) < 4) this.vx = 0;
    }
  }

  private hpFrac(): number {
    return this.maxHp <= 0 ? 0 : this.hp / this.maxHp;
  }

  private aggression(): number {
    const f = this.hpFrac();
    if (f > BAND_URGED_HP_FRAC) return 0;
    if (f > BAND_DESPERATE_HP_FRAC) {
      const t = (BAND_URGED_HP_FRAC - f) / (BAND_URGED_HP_FRAC - BAND_DESPERATE_HP_FRAC);
      return 0.22 * t;
    }
    const t = (BAND_DESPERATE_HP_FRAC - f) / BAND_DESPERATE_HP_FRAC;
    return 0.55 + 0.45 * Math.sqrt(t);
  }

  private lerpAgg(base: number, atFull: number): number {
    const a = this.aggression();
    return base + (atFull - base) * a;
  }

  private walkSpeed(): number {
    return this.lerpAgg(WALK_SPEED_BASE, WALK_SPEED_AGG);
  }

  private backpedalSpeed(): number {
    return this.lerpAgg(BACKPEDAL_SPEED_BASE, BACKPEDAL_SPEED_AGG);
  }

  private standoffApproachPx(): number {
    return this.lerpAgg(STANDOFF_APPROACH_BASE_PX, STANDOFF_APPROACH_AGG_PX);
  }

  private standoffRetreatPx(): number {
    return this.lerpAgg(STANDOFF_RETREAT_BASE_PX, STANDOFF_RETREAT_AGG_PX);
  }

  private isStandoffTrackingPlayer(): boolean {
    const settleVx = 8 + 14 * this.aggression();
    return (
      this.lifePhase === "ACTIVE" &&
      this.visionSeesPlayer &&
      this.onGround &&
      Number.isFinite(this.playerCx) &&
      Math.abs(this.vx) <= settleVx
    );
  }

  private isHorzWalking(): boolean {
    return this.onGround && Math.abs(this.lastHorzStepPx) > WALK_STEP_THRESHOLD_PX;
  }

  private usePlantedStance(): boolean {
    return (
      this.lifePhase === "ACTIVE" &&
      this.onGround &&
      !this.deathStarted &&
      !this.isHorzWalking() &&
      Math.abs(this.vx) <= PLANTED_VEL_PX
    );
  }

  private tickUncannyIdle(dt: number, rig: NephilimRigData): void {
    const seq = sequence(rig, "idle");
    if (seq.length === 0) return;
    this.idleSeqIdx = ((this.idleSeqIdx % seq.length) + seq.length) % seq.length;
    this.idleSeqTimer += dt;
    const pose = seq[this.idleSeqIdx]!;
    const need = this.idlePoseDuration(pose) + this.idleExtraPause;
    if (this.idleSeqTimer < need) return;
    this.idleSeqTimer -= need;
    this.idleSeqIdx = (this.idleSeqIdx + 1) % seq.length;
    this.idleExtraPause =
      this.idleSeqIdx === 0 && Math.random() < 0.28 ? 0.18 + Math.random() * 0.42 : 0;
  }

  private idlePoseDuration(poseName: string): number {
    switch (poseName) {
      case "idle_3":
        return 0.52;
      case "idle_4":
        return 1.08;
      case "idle_0":
      case "idle_1":
        return 0.72;
      default:
        return 0.88;
    }
  }

  private dormantPoseName(rig: NephilimRigData): string {
    const rest = sequence(rig, "rest");
    return rest.length > 0 ? rest[0]! : "idle";
  }

  private currentPoseName(rig: NephilimRigData): string {
    if (this.lifePhase === "ACTIVE" && this.isLiftAttackPose()) {
      return this.liftPoseName(rig);
    }
    if (this.lifePhase === "ACTIVE" && this.isGrabActive()) {
      return this.grabPoseName(rig);
    }
    if (this.armGuardActive()) {
      if (this.isHorzWalking()) return this.walkPoseFromPhase(rig, this.walkPhase);
      return ARM_GUARD_POSE;
    }
    if (this.hurtPoseTimer > 0) return "hurt";
    switch (this.lifePhase) {
      case "DORMANT":
        return this.dormantPoseName(rig);
      case "AWAKENING": {
        const seq = sequence(rig, "awaken");
        return seq.length > 0 ? seq[Math.min(this.awakenIdx, seq.length - 1)]! : this.dormantPoseName(rig);
      }
      case "NOTICE":
        return "idle";
      case "ACTIVE":
        if (this.isHorzWalking()) return this.walkPoseFromPhase(rig, this.walkPhase);
        {
          const seq = sequence(rig, "idle");
          return seq.length > 0 ? seq[this.idleSeqIdx % seq.length]! : "idle";
        }
    }
  }

  private walkPoseFromPhase(rig: NephilimRigData, walkPhaseRad: number): string {
    const seq = sequence(rig, "walk");
    if (seq.length === 0) return "walk";
    if (seq.length === 1) return seq[0]!;
    let u = walkPhaseRad / (Math.PI * 2);
    u -= Math.floor(u);
    const idx = Math.min(seq.length - 1, Math.floor(u * seq.length));
    return seq[idx]!;
  }

  private integrateParts(dt: number, map: TileMap, rig: NephilimRigData, poseName: string): void {
    const m = this.facingMul();
    const stride = Math.sin(this.walkPhase);
    const uncannyIdle =
      (this.lifePhase === "ACTIVE" &&
        this.hurtPoseTimer <= 0 &&
        !this.isHorzWalking() &&
        this.onGround &&
        !poseName.startsWith("walk")) ||
      (this.lifePhase === "ACTIVE" && this.isLiftSuspended() && this.hurtPoseTimer <= 0);
    const notice = this.lifePhase === "NOTICE";
    const standoffTrack = this.isStandoffTrackingPlayer();
    let headTurnExtra = 0;
    if (notice && Number.isFinite(this.playerCx)) {
      headTurnExtra = this.headTurnTowardPlayer(0.22, 22);
    } else if (standoffTrack) {
      headTurnExtra = this.headTurnTowardPlayer(0.14, 14);
    }
    const neckTurnExtra = standoffTrack ? headTurnExtra * 0.38 : 0;
    const bobScale =
      this.lifePhase === "DORMANT"
        ? 0.15
        : this.lifePhase === "AWAKENING"
          ? 0.35
          : this.lifePhase === "NOTICE"
            ? 0.55
            : 1.0;
    const grabReachU = this.grabReachBlend(rig);
    const targetX = new Array<number>(this.partSims.length);
    const targetY = new Array<number>(this.partSims.length);
    const targetAng = new Array<number>(this.partSims.length);
    const grabPose = this.isGrabActive() ? this.grabPoseName(rig) : "";

    for (let i = 0; i < this.partSims.length; i++) {
      const def = rig.parts[i]!;
      const p = this.partSims[i]!;
      const pe = this.partPoseEntry(rig, poseName, def.name);
      let follow = this.partFollowScale(def.name, uncannyIdle);
      if (grabPose === "grab_windup" && def.name.includes("Hand")) follow = 1.25;
      const bobAmp = rig.bobAmpPx * def.bobScale * bobScale;
      let bx = 0;
      let by = 0;
      if (!p.loose) {
        bx = bobAmp * Math.sin(this.bobTime * rig.bobSpeedRadPerSec + p.bobPhase);
        by = bobAmp * Math.sin(this.bobTime * rig.bobSpeedRadPerSec * 1.25 + p.bobPhase * 1.6);
      }
      let dx = pe.dx;
      let dy = pe.dy;
      let ang = pe.angleDeg;
      if (!p.loose && def.name === "head") ang += headTurnExtra;
      else if (!p.loose && def.name === "neck") ang += neckTurnExtra;
      if (!p.loose && poseName.startsWith("walk")) {
        const side = this.limbSideSign(def.name);
        const legStride =
          side !== 0 &&
          (def.name.includes("foot") || def.name.includes("Hand")) &&
          !(this.usePlantedStance() && (def.name.includes("foot") || def.name.startsWith("connFoot")));
        if (legStride) {
          dy += side * m * stride * 2;
          ang += side * m * stride * 10;
        } else if (chainIsConnector(def.name) && !(this.usePlantedStance() && def.name.startsWith("connFoot"))) {
          ang += side * m * stride * 6;
        } else if (def.name === "head") {
          ang += m * stride * 4;
          dy += Math.abs(stride) * 0.5;
        }
      }
      targetX[i] = this.x + m * dx + bx;
      targetY[i] = this.y + dy + by;
      targetAng[i] = ang;
      if (this.liftPhase === "LAND" && def.name === "body") {
        const slumpU = 1 - Math.max(0, this.liftPhaseTimer / LIFT_LAND_SEC);
        targetY[i]! += 5 + slumpU * 12;
        targetAng[i]! += slumpU * 18 * (this.facingRight ? 1 : -1);
      }
      if (grabReachU > 0 && def.name === "head") {
        this.applyGrabReachHeadTarget(targetX, targetY, targetAng, i, grabReachU);
      }

      if (p.loose) {
        p.looseAge += dt;
        if (p.looseTimer > 0) p.looseTimer -= dt;
        this.integrateLoosePart(rig, i, p, def.name, dt, map);
        if (this.liftPhase === "RECOVER") {
          this.applyLiftRebuildRecall(p, def.name, targetX[i]!, targetY[i]!, targetAng[i]!, dt);
        } else if (p.looseTimer <= 0) {
          this.applyLooseRecall(p, def.name, targetX[i]!, targetY[i]!, targetAng[i]!, dt);
        }
        continue;
      }

      let partK = PART_K * follow;
      let partC = PART_C * Math.sqrt(follow);
      if (this.liftPhase === "LAND" && (def.name === "body" || def.name === "neck")) {
        const slumpU = 1 - Math.max(0, this.liftPhaseTimer / LIFT_LAND_SEC);
        partK *= 0.34 - slumpU * 0.16;
        partC *= 0.55;
      }
      if (this.isGrabHoldPhase()) {
        partK *= 2.4;
        partC *= 1.35;
      }
      const angleK = ANGLE_K * follow;
      const angleC = ANGLE_C * Math.sqrt(follow);
      p.vx += ((targetX[i]! - p.cx) * partK - p.vx * partC) * dt;
      p.vy += ((targetY[i]! - p.cy) * partK - p.vy * partC) * dt;
      p.angleVel += (this.angleDelta(targetAng[i]!, p.angleDeg) * angleK - p.angleVel * angleC) * dt;
      p.angleDeg += p.angleVel * dt;
      this.applyAngleWrap(p);
      p.cx += p.vx * dt;
      p.cy += p.vy * dt;
    }

    if (grabReachU > 0) this.applyGrabReachArmIk(rig, grabReachU);
    this.applyChainConstraints(rig);
    for (let i = 0; i < this.partSims.length; i++) {
      const p = this.partSims[i]!;
      if (p.loose) this.depenetrateLoosePart(rig, i, p, map);
    }
    if (this.isLiftDropIkActive()) {
      this.applyLiftDropIk(rig);
    }
    if (!this.usePlantedStance()) {
      this.applyAttachedLegChains(rig);
    }
    this.applyPlantedLegConstraints(rig);
    this.settleLooseConnectors();
    for (let i = 0; i < this.partSims.length; i++) {
      const p = this.partSims[i]!;
      if (!p.loose) continue;
      if (this.trySettleLoosePart(p, this.simNames[i]!, targetX[i]!, targetY[i]!)) {
        p.looseAge = 0;
      }
    }
  }

  private headTurnTowardPlayer(gain: number, maxDeg: number): number {
    const m = this.facingMul();
    const rel = m * (this.playerCx - this.x);
    return Math.max(-maxDeg, Math.min(maxDeg, rel * gain));
  }

  private partFollowScale(partName: string, uncannyIdle: boolean): number {
    if (!uncannyIdle) return 1;
    if (partName === "head") return 1.45;
    if (partName === "body") return 0.68;
    if (chainIsConnector(partName)) return 0.82;
    return 0.92;
  }

  private limbSideSign(partName: string): number {
    if (partName.includes("L")) return 1;
    if (partName.includes("R")) return -1;
    return 0;
  }

  /** Wrap sim angle and shift prevAngle so render interpolation stays continuous (Java applyAngleWrap). */
  private applyAngleWrap(p: NephilimPartSim): void {
    const wrapped = this.wrapAngleDeg(p.angleDeg);
    const shift = wrapped - p.angleDeg;
    if (Math.abs(shift) > 1e-9) {
      p.angleDeg = wrapped;
      p.prevAngle += shift;
    }
  }

  private facingMul(): number {
    return this.facingRight ? -1 : 1;
  }

  private angleDelta(target: number, current: number): number {
    let d = target - current;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  private moveAndCollide(dt: number, map: TileMap, rig: NephilimRigData): void {
    const coll = this.anchorCollisionRect(rig, this.x, this.y);
    const prevBottom = coll ? coll.y + coll.h : this.y + this.feetBelowAnchorPx;
    const prevTop = coll ? coll.y : this.y - 8;
    this.x += this.vx * dt;
    this.resolveHorizontal(map, rig);
    this.y += this.vy * dt;
    if (this.vy > 0) this.resolveLand(map, rig, prevBottom);
    else if (this.vy < 0) this.resolveCeiling(map, rig, prevTop);
  }

  private anchorCollisionRect(rig: NephilimRigData, ax: number, ay: number): Aabb | null {
    const local = rig.anchorCollision;
    if (local.length < 6) {
      return { x: ax - 7, y: ay - 11, w: 14, h: 22 };
    }
    const m = this.facingMul();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < local.length; i += 2) {
      const wx = ax + m * local[i]!;
      const wy = ay + local[i + 1]!;
      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy);
      maxY = Math.max(maxY, wy);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private resolveHorizontal(map: TileMap, rig: NephilimRigData): void {
    const r = this.anchorCollisionRect(rig, this.x, this.y);
    if (!r) return;
    const leftTile = Math.floor(r.x / TILE_SIZE);
    const rightTile = Math.floor((r.x + r.w - 1e-4) / TILE_SIZE);
    if (this.vx > 0) {
      for (let ty = Math.floor(r.y / TILE_SIZE); ty <= Math.floor((r.y + r.h - 1) / TILE_SIZE); ty++) {
        if (map.isSolidTile(rightTile, ty)) {
          this.x = rightTile * TILE_SIZE - (r.x + r.w - this.x) - 0.5;
          this.vx = 0;
          return;
        }
      }
    } else if (this.vx < 0) {
      for (let ty = Math.floor(r.y / TILE_SIZE); ty <= Math.floor((r.y + r.h - 1) / TILE_SIZE); ty++) {
        if (map.isSolidTile(leftTile, ty)) {
          this.x = (leftTile + 1) * TILE_SIZE + (this.x - r.x) + 0.5;
          this.vx = 0;
          return;
        }
      }
    }
  }

  private resolveLand(map: TileMap, rig: NephilimRigData, prevBottom: number): void {
    const r = this.anchorCollisionRect(rig, this.x, this.y);
    if (!r) return;
    const bottomTile = Math.floor((r.y + r.h - 1e-4) / TILE_SIZE);
    const leftTile = Math.floor((r.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((r.x + r.w - 0.001) / TILE_SIZE);
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (map.isSolidTile(tx, bottomTile) || map.isPlatformTile(tx, bottomTile)) {
        const floorY = bottomTile * TILE_SIZE;
        if (prevBottom <= floorY + 1e-3 && r.y + r.h >= floorY - 1e-3) {
          this.y += floorY - (r.y + r.h);
          this.vy = 0;
        }
        return;
      }
    }
  }

  private resolveCeiling(map: TileMap, rig: NephilimRigData, prevTop: number): void {
    const r = this.anchorCollisionRect(rig, this.x, this.y);
    if (!r) return;
    const topTile = Math.floor((r.y + 1e-4) / TILE_SIZE);
    const leftTile = Math.floor((r.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((r.x + r.w - 0.001) / TILE_SIZE);
    const ceilingY = (topTile + 1) * TILE_SIZE;
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (map.isSolidTile(tx, topTile) && prevTop >= ceilingY - 1e-3 && r.y <= ceilingY + 1e-3) {
        this.y += ceilingY - r.y;
        this.vy = 0;
        return;
      }
    }
  }

  private isGrounded(map: TileMap, rig: NephilimRigData): boolean {
    if (this.vy < 0) return false;
    const r = this.anchorCollisionRect(rig, this.x, this.y);
    if (!r) return false;
    const bottomTile = Math.floor((r.y + r.h + 1e-4) / TILE_SIZE);
    const leftTile = Math.floor((r.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((r.x + r.w - 0.001) / TILE_SIZE);
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (map.isSolidTile(tx, bottomTile) || map.isPlatformTile(tx, bottomTile)) {
        const floorY = bottomTile * TILE_SIZE;
        if (Math.abs(r.y + r.h - floorY) < 2.5) return true;
      }
    }
    return false;
  }

  private clampToRoom(map: TileMap, rig: NephilimRigData): void {
    const rw = map.getWidth() * TILE_SIZE;
    const r = this.anchorCollisionRect(rig, this.x, this.y);
    if (!r) return;
    if (r.x < ROOM_MARGIN) {
      this.x += ROOM_MARGIN - r.x;
      this.vx = Math.max(0, this.vx);
    }
    if (r.x + r.w > rw - ROOM_MARGIN) {
      this.x -= r.x + r.w - (rw - ROOM_MARGIN);
      this.vx = Math.min(0, this.vx);
    }
    if (r.y < ROOM_MARGIN) {
      this.y += ROOM_MARGIN - r.y;
      this.vy = Math.max(0, this.vy);
    }
  }

  private canMoveHorizontally(map: TileMap, rig: NephilimRigData, tryVx: number): boolean {
    if (Math.abs(tryVx) < 0.5) return false;
    const probe = Math.sign(tryVx) * Math.max(3, Math.abs(tryVx) / 30);
    return !this.wouldHorzCollideAt(map, rig, this.x + probe, this.y);
  }

  private wouldHorzCollideAt(map: TileMap, rig: NephilimRigData, testX: number, testY: number): boolean {
    const r = this.anchorCollisionRect(rig, testX, testY);
    if (!r) return false;
    const rw = map.getWidth() * TILE_SIZE;
    if (r.x < ROOM_MARGIN - 1e-3 || r.x + r.w > rw - ROOM_MARGIN + 1e-3) return true;
    const leftTile = Math.floor(r.x / TILE_SIZE);
    const rightTile = Math.floor((r.x + r.w - 1e-4) / TILE_SIZE);
    const topTy = Math.floor(r.y / TILE_SIZE);
    const bottomTy = Math.floor((r.y + r.h - 1) / TILE_SIZE);
    for (let ty = topTy; ty <= bottomTy; ty++) {
      if (ty < 0 || ty >= map.getHeight()) continue;
      if (map.isSolidTile(leftTile, ty) || map.isSolidTile(rightTile, ty)) return true;
    }
    return false;
  }

  private moveLooseWithBounce(
    rig: NephilimRigData,
    index: number,
    p: NephilimPartSim,
    dt: number,
    map: TileMap,
  ): void {
    if (this.collisionHullHitsSolid(rig, index, p.cx, p.cy, p.angleDeg, map)) {
      p.cx += p.vx * dt;
      p.cy += p.vy * dt;
      return;
    }
    const nx = p.cx + p.vx * dt;
    if (this.collisionHullHitsSolid(rig, index, nx, p.cy, p.angleDeg, map)) {
      p.vx = -p.vx * LOOSE_WALL_REST;
    } else {
      p.cx = nx;
    }
    const ny = p.cy + p.vy * dt;
    if (this.collisionHullHitsSolid(rig, index, p.cx, ny, p.angleDeg, map)) {
      p.vy = -p.vy * LOOSE_FLOOR_REST;
    } else {
      p.cy = ny;
    }
  }

  /** Nudge loose extremities out of solids after chain constraints (Java depenetrateLoosePart). */
  private depenetrateLoosePart(
    rig: NephilimRigData,
    index: number,
    p: NephilimPartSim,
    map: TileMap,
  ): void {
    if (!p.loose || chainIsConnector(this.simNames[index]!)) return;
    const step = 0.5;
    for (let iter = 0; iter < 8; iter++) {
      if (!this.collisionHullHitsSolid(rig, index, p.cx, p.cy, p.angleDeg, map)) return;
      if (!this.collisionHullHitsSolid(rig, index, p.cx, p.cy - step, p.angleDeg, map)) {
        p.cy -= step;
        if (p.vy > 0) p.vy *= -LOOSE_FLOOR_REST * 0.5;
        continue;
      }
      if (!this.collisionHullHitsSolid(rig, index, p.cx - step, p.cy, p.angleDeg, map)) {
        p.cx -= step;
        if (p.vx > 0) p.vx *= -LOOSE_WALL_REST * 0.5;
        continue;
      }
      if (!this.collisionHullHitsSolid(rig, index, p.cx + step, p.cy, p.angleDeg, map)) {
        p.cx += step;
        if (p.vx < 0) p.vx *= -LOOSE_WALL_REST * 0.5;
        continue;
      }
      if (!this.collisionHullHitsSolid(rig, index, p.cx, p.cy + step, p.angleDeg, map)) {
        p.cy += step;
        if (p.vy < 0) p.vy *= -LOOSE_WALL_REST * 0.5;
        continue;
      }
      break;
    }
  }

  private collisionHullHitsSolid(
    rig: NephilimRigData,
    index: number,
    cx: number,
    cy: number,
    angleDeg: number,
    map: TileMap,
  ): boolean {
    const def = rig.parts[index];
    if (!def) return false;
    const local = def.collision.length >= 6 ? def.collision : def.hurt;
    if (local.length < 6) return false;
    const m = this.facingMul();
    const world = transformHull(local, def.pivotX, def.pivotY, cx, cy, angleDeg, m);
    const b = polygonBounds(world);
    const ts = TILE_SIZE;
    const minTx = Math.floor(b.x / ts);
    const maxTx = Math.floor((b.x + b.w - 1e-9) / ts);
    const minTy = Math.floor(b.y / ts);
    const maxTy = Math.floor((b.y + b.h - 1e-9) / ts);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!map.isSolidTile(tx, ty)) continue;
        const tile: Aabb = { x: tx * ts, y: ty * ts, w: ts, h: ts };
        if (polygonIntersectsAabb(world, tile)) return true;
      }
    }
    return false;
  }

  // --- Death -----------------------------------------------------------------

  private startDeath(rig: NephilimRigData): void {
    this.deathStarted = true;
    this.deathFightOver = false;
    this.deathHeadFallTimer = 0;
    this.deathHeadChunk = null;
    this.deathTimer = 0;
    this.deathDropTimer = 0;
    this.deathDropIdx = 0;
    this.deathBodyDropsFinished = false;
    this.deathHeadChunkQueued = false;
    this.deathPostScatterTimer = 0;
    this.pendingDeathChunks.length = 0;
    this.partScattered = new Array(this.partSims.length).fill(false);
    this.buildDeathDropOrder(rig);
    this.vx = 0;
    this.vy = 0;
    for (const p of this.partSims) {
      p.loose = false;
      p.looseTimer = 0;
      p.vx = 0;
      p.vy = 0;
      p.angleVel = 0;
    }
  }

  private tickDeath(dt: number, map: TileMap, rig: NephilimRigData): void {
    this.vx = 0;
    this.vy = 0;
    this.onGround = this.isGrounded(map, rig);
    const poseEnd = DEATH_POSE1_SEC + DEATH_POSE2_SEC;
    if (this.deathTimer < poseEnd) {
      const pose =
        this.deathTimer < DEATH_POSE1_SEC ? this.deathPoseFrame(rig, 0) : this.deathPoseFrame(rig, 1);
      this.integratePartsDeathPose(dt, rig, pose);
      return;
    }
    const pose2 = this.deathPoseFrame(rig, 1);
    if (!this.deathBodyDropsFinished) {
      this.integratePartsDeathPose(dt, rig, pose2);
      this.deathDropTimer += dt;
      while (
        this.deathDropTimer >= DEATH_PART_DROP_INTERVAL &&
        this.deathDropIdx < this.deathDropOrder.length
      ) {
        this.deathDropTimer -= DEATH_PART_DROP_INTERVAL;
        const i = this.deathDropOrder[this.deathDropIdx]!;
        this.queuePartDeathChunk(rig, i, false);
        if (this.partScattered) this.partScattered[i] = true;
        this.deathDropIdx++;
      }
      if (this.deathDropIdx >= this.deathDropOrder.length) {
        this.deathBodyDropsFinished = true;
        this.deathPostScatterTimer = 0;
      }
      return;
    }
    this.deathPostScatterTimer += dt;
    if (!this.deathHeadChunkQueued) {
      this.integrateHeadDeathHold(dt, rig, pose2);
      if (this.deathPostScatterTimer >= DEATH_HEAD_FALL_DELAY_SEC) {
        const headIdx = this.indexOf("head");
        if (headIdx >= 0) {
          this.queuePartDeathChunk(rig, headIdx, true);
          if (this.partScattered) this.partScattered[headIdx] = true;
        }
        this.deathHeadChunkQueued = true;
      }
    }
  }

  private deathPoseFrame(rig: NephilimRigData, index: number): string {
    const seq = sequence(rig, "death");
    if (seq.length === 0) return "idle";
    return seq[Math.min(index, seq.length - 1)]!;
  }

  private buildDeathDropOrder(rig: NephilimRigData): void {
    const order: number[] = [];
    const seen = new Set<number>();
    for (const name of rig.drawOrder) {
      if (name === "head") continue;
      const idx = this.indexOf(name);
      if (idx >= 0 && !seen.has(idx)) {
        order.push(idx);
        seen.add(idx);
      }
    }
    for (let i = 0; i < this.partSims.length; i++) {
      if (!seen.has(i) && this.simNames[i] !== "head") order.push(i);
    }
    this.deathDropOrder = order;
  }

  private integratePartsDeathPose(dt: number, rig: NephilimRigData, poseName: string): void {
    const m = this.facingMul();
    for (let i = 0; i < this.partSims.length; i++) {
      if (this.partScattered?.[i]) continue;
      const def = rig.parts[i]!;
      const p = this.partSims[i]!;
      const pe = poseOffset(rig, poseName, def.name);
      const tx = this.x + m * pe.dx;
      const ty = this.y + pe.dy;
      const ta = pe.angleDeg;
      p.vx += ((tx - p.cx) * DEATH_POSE_K - p.vx * DEATH_POSE_C) * dt;
      p.vy += ((ty - p.cy) * DEATH_POSE_K - p.vy * DEATH_POSE_C) * dt;
      p.angleVel += (this.angleDelta(ta, p.angleDeg) * ANGLE_K * 1.15 - p.angleVel * ANGLE_C) * dt;
      p.angleDeg += p.angleVel * dt;
      this.applyAngleWrap(p);
      p.cx += p.vx * dt;
      p.cy += p.vy * dt;
    }
  }

  private integrateHeadDeathHold(dt: number, rig: NephilimRigData, poseName: string): void {
    const headIdx = this.indexOf("head");
    if (headIdx < 0 || this.partScattered?.[headIdx]) return;
    const def = rig.parts[headIdx]!;
    const p = this.partSims[headIdx]!;
    const pe = poseOffset(rig, poseName, def.name);
    const m = this.facingMul();
    const tx = this.x + m * pe.dx;
    const ty = this.y + pe.dy;
    const ta = pe.angleDeg;
    p.vx += ((tx - p.cx) * DEATH_HEAD_HOLD_K - p.vx * DEATH_HEAD_HOLD_C) * dt;
    p.vy += ((ty - p.cy) * DEATH_HEAD_HOLD_K - p.vy * DEATH_HEAD_HOLD_C) * dt;
    p.angleVel += (this.angleDelta(ta, p.angleDeg) * ANGLE_K - p.angleVel * ANGLE_C) * dt;
    p.angleDeg += p.angleVel * dt;
    this.applyAngleWrap(p);
    p.cx += p.vx * dt;
    p.cy += p.vy * dt;
  }

  private queuePartDeathChunk(rig: NephilimRigData, partIdx: number, head: boolean): void {
    const def = rig.parts[partIdx]!;
    const p = this.partSims[partIdx]!;
    const m = this.facingMul();
    const angleRad = (m < 0 ? -p.angleDeg : p.angleDeg) * (Math.PI / 180);
    const omega = (p.angleVel * Math.PI) / 180 + (Math.random() - 0.5) * 2.5;
    let chunkVx = p.vx + (Math.random() - 0.5) * DEATH_CHUNK_SCATTER_HORZ;
    let chunkVy = p.vy - DEATH_CHUNK_SCATTER_UP * (0.35 + Math.random() * 0.45);
    if (head) chunkVy -= DEATH_CHUNK_SCATTER_UP * 0.25;
    const hull = def.hurt.length >= 6 ? def.hurt.slice() : null;
    this.pendingDeathChunks.push({
      frameIndex: def.frame,
      pivotWorldX: p.cx,
      pivotWorldY: p.cy,
      vx: chunkVx,
      vy: chunkVy,
      angleRad,
      omega,
      pivotX: def.pivotX,
      pivotY: def.pivotY,
      mirror: this.facingRight,
      hullLocal: hull,
      head,
    });
  }

  // --- Combat ----------------------------------------------------------------

  rect(): Aabb {
    const rig = getNephilimRig();
    if (!rig) return { x: this.x - 7, y: this.y - 11, w: 14, h: 22 };
    return this.anchorCollisionRect(rig, this.x, this.y) ?? { x: this.x - 7, y: this.y - 11, w: 14, h: 22 };
  }

  contactDamagePose(): Aabb {
    if (this.liftPhase === "LAND") {
      const loose = this.loosePartsContactDamageAabb();
      if (loose) return loose;
    }
    const rig = getNephilimRig();
    if (rig) {
      const hurt = this.combinedRoleAabb(rig, "hurt");
      if (hurt) return hurt;
      const hit = this.combinedRoleAabb(rig, "hit");
      if (hit) return hit;
    }
    return this.rect();
  }

  damageReceivePose(): Aabb {
    const rig = getNephilimRig();
    if (!rig || this.partSims.length === 0) {
      return { x: this.x - 12, y: this.y - 18, w: 24, h: 30 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (let i = 0; i < this.partSims.length; i++) {
      if (this.partScattered?.[i]) continue;
      const box = this.partWorldRoleAabb(rig, i, "hurt");
      if (!box) continue;
      minX = Math.min(minX, box.x);
      maxX = Math.max(maxX, box.x + box.w);
      minY = Math.min(minY, box.y);
      maxY = Math.max(maxY, box.y + box.h);
      any = true;
    }
    if (!any) return this.rect();
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  intersectsAttack(sword: Aabb): boolean {
    if (!this.isCombatActive()) return false;
    const shield = this.shieldBlockPose();
    if (shield && shield.intersectsRect(sword)) {
      this.lastStruckParts.length = 0;
      return false;
    }
    this.lastStruckParts.length = 0;
    const rig = getNephilimRig();
    if (!rig) return aabbOverlap(sword, this.damageReceivePose());
    let any = false;
    for (let i = 0; i < this.partSims.length; i++) {
      if (this.partScattered?.[i]) continue;
      if (this.isArmShieldPart(this.simNames[i]!)) continue;
      const box = this.partWorldRoleAabb(rig, i, "hurt");
      if (box && aabbOverlap(sword, box)) {
        this.lastStruckParts.push(i);
        any = true;
      }
    }
    return any;
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (!this.isCombatActive()) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.offensiveHitlagFrames = 0;
    this.onDamaged(strike.freezeFrames);
    this.noteHitForArmGuard();
    if (strike.knockKind === "black_heart_burst") {
      this.hitstun = queueBlackHeartBurstKnock(this.blackHeartBeat, strike, this.hitstun, this);
      if (this.hp <= 0 && !this.deathStarted) {
        const rig = getNephilimRig();
        if (rig) this.startDeath(rig);
      }
      return true;
    }
    const attackerCx = strike.attackerX + strike.attackerW * 0.5;
    this.knockStruckParts(attackerCx, strike.damage, strike.facing);
    if (this.hp <= 0 && !this.deathStarted) {
      const rig = getNephilimRig();
      if (rig) this.startDeath(rig);
    }
    return true;
  }

  releaseBlackHeartBeatKnockback(): void {
    releaseBlackHeartBeatKnockback(this.blackHeartBeat, (vx, vy) => {
      this.vx = vx;
      this.vy = vy;
    });
  }

  isBlackHeartBeatLocked(): boolean {
    return this.blackHeartBeat.isLocked();
  }

  intersectsProjectile(projectile: HitboxPose): boolean {
    if (!this.isCombatActive()) return false;
    if (this.projectileBlockedByShield(projectile)) return false;
    const rig = getNephilimRig();
    if (!rig) return projectile.intersectsRect(this.damageReceivePose());
    for (let i = 0; i < this.partSims.length; i++) {
      if (this.partScattered?.[i]) continue;
      if (this.isArmShieldPart(this.simNames[i]!)) continue;
      const box = this.partWorldRoleAabb(rig, i, "hurt");
      if (box && projectile.intersectsRect(box)) return true;
    }
    return false;
  }

  applyProjectileStrike(strike: ProjectileStrike): boolean {
    if (!this.isCombatActive()) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.onDamaged(strike.freezeFrames);
    this.noteHitForArmGuard();
    const facing = strike.projectileVelX >= 0 ? 1 : -1;
    const attackerCx =
      strike.debrisCenterWorldX != null && Number.isFinite(strike.debrisCenterWorldX)
        ? strike.debrisCenterWorldX
        : facing >= 0
          ? -1e9
          : 1e9;
    this.knockStruckParts(attackerCx, strike.damage, facing);
    if (this.hp <= 0 && !this.deathStarted) {
      const rig = getNephilimRig();
      if (rig) this.startDeath(rig);
    }
    return true;
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (!this.isLiftLandingContactActive()) return false;
    if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) return false;
    const pose = this.contactDamagePose();
    return aabbOverlap(playerHurt, pose);
  }

  contactDamageToPlayer(): number {
    return LIFT_DROP_CONTACT_DAMAGE;
  }

  private onDamaged(freezeFrames: number): void {
    const stunSec = Math.max(0, freezeFrames) / 60;
    this.hitstun = Math.max(this.hitstun, stunSec);
    this.hitlagSolidRed = true;
    this.hurtTintRemaining = Math.max(this.hurtTintRemaining, HURT_TINT_SEC);
    this.hurtPoseTimer = HURT_POSE_SEC;
  }

  private knockStruckParts(attackerCx: number, dmg: number, facing: number): void {
    if (this.lastStruckParts.length === 0) return;
    let neck = false;
    let armL = false;
    let armR = false;
    for (const i of this.lastStruckParts) {
      const name = this.simNames[i];
      if (name === "head" || name === "neck") neck = true;
      if (name === "handL" || name === "armL") armL = true;
      if (name === "handR" || name === "armR") armR = true;
    }
    if (!neck && !armL && !armR) return;
    let dir: number;
    if (Math.abs(attackerCx) < 1e8) dir = Math.sign(this.x - attackerCx);
    else dir = facing >= 0 ? 1 : -1;
    if (dir === 0) dir = facing >= 0 ? 1 : -1;
    const scale = 0.8 + 0.4 * Math.min(2, dmg);
    const kx = dir * KNOCK_SPEED * scale;
    const ky = -KNOCK_UP * scale;
    const spin = (Math.random() - 0.5) * KNOCK_SPIN_DEG;
    let impx = 0;
    let cnt = 0;
    if (neck) {
      this.loosenLimbChain(NEPHILIM_LIMBS[0]!, kx, ky, spin, 0.55, 0.58, 0.86);
      impx += kx;
      cnt++;
    }
    if (armL) {
      this.loosenLimbChain(NEPHILIM_LIMBS[1]!, kx, ky, -spin, 0.85, 0.78, 0.92);
      impx += kx;
      cnt++;
    }
    if (armR) {
      this.loosenLimbChain(NEPHILIM_LIMBS[2]!, kx, ky, spin, 0.85, 0.78, 0.92);
      impx += kx;
      cnt++;
    }
    if (cnt > 0) this.vx += (ANCHOR_TRAIL_FRAC * impx) / cnt;
  }

  getHealth(): number {
    return Math.max(0, this.hp);
  }

  getMaxHealth(): number {
    return this.maxHp;
  }

  isDying(): boolean {
    return this.deathStarted && !this.deathFightOver;
  }

  isOnGround(): boolean {
    return this.onGround;
  }

  isDead(): boolean {
    return this.deathFightOver;
  }

  isInCombatHitstun(): boolean {
    return this.hitstun > 0 || this.knockbackContactTimer > 0 || this.blackHeartBeat.isLocked();
  }

  facingSign(): number {
    return this.facingRight ? -1 : 1;
  }

  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SEC));
  }

  hitstunSolidRed(): boolean {
    return this.hitlagSolidRed && this.hitstun > 0 && this.hp > 0;
  }

  blocksRoomClear(): boolean {
    return !this.isDead();
  }

  attackBlockedByShield(attack: Aabb): boolean {
    if (!this.armGuardActive()) return false;
    const shield = this.shieldBlockPose();
    return shield != null && shield.intersectsRect(attack);
  }

  applyShieldBlockStrike(strike: WeaponStrike): void {
    if (!this.isCombatActive()) return;
    this.onShieldBlocked(strike.freezeFrames);
  }

  projectileBlockedByShield(projectile: HitboxPose): boolean {
    if (!this.armGuardActive()) return false;
    const shield = this.combinedForearmShieldPose(SHIELD_PROJECTILE_INFLATE_PX);
    return shield != null && shield.intersects(projectile);
  }

  applyProjectileShieldBlock(strike: ProjectileStrike): void {
    if (!this.isCombatActive()) return;
    this.onShieldBlocked(strike.freezeFrames);
  }

  applyOffensiveHitlag(freezeFrames: number): void {
    this.offensiveHitlagFrames = Math.max(this.offensiveHitlagFrames, Math.max(0, freezeFrames));
  }

  registerDeathHeadChunk(chunk: import("../fx/BrickChunk").BrickChunk): void {
    this.deathHeadChunk = chunk;
  }

  tickDeathHeadLanding(dt: number, map: TileMap): void {
    if (this.deathFightOver || !this.deathHeadChunkQueued) return;
    this.deathHeadFallTimer += dt;
    if (this.deathHeadChunk != null && this.deathHeadChunk.isBossDeathHeadResting(map)) {
      this.deathFightOver = true;
      return;
    }
    if (this.deathHeadFallTimer >= DEATH_HEAD_LAND_MAX_SEC) {
      this.deathFightOver = true;
    }
  }

  liftPuppetString(renderAlpha = 1): LiftPuppetString | null {
    if (this.liftPhase !== "RISE" && this.liftPhase !== "DRAG") return null;
    const a = Math.max(0, Math.min(1, renderAlpha));
    const ax = this.renderPrevX + (this.x - this.renderPrevX) * a;
    const ay = this.renderPrevY + (this.y - this.renderPrevY) * a;
    return {
      handWorldX: this.liftHandWorldX,
      handWorldY: this.liftHandWorldY,
      anchorWorldX: ax,
      anchorWorldY: ay - 4,
    };
  }

  drinkHealOverlayActive(): boolean {
    return this.drinkHealOverlayAge >= 0 && this.drinkHealOverlayAge < DRINK_HEAL_OVERLAY_DURATION_SEC;
  }

  drinkHealOverlayAlpha(): number {
    if (!this.drinkHealOverlayActive()) return 0;
    const u = this.drinkHealOverlayAge / DRINK_HEAL_OVERLAY_DURATION_SEC;
    return DRINK_HEAL_OVERLAY_BASE_ALPHA * (1 - u);
  }

  drinkHealOverlayScrollWorldPx(): number {
    if (!this.drinkHealOverlayActive()) return 0;
    const u = this.drinkHealOverlayAge / DRINK_HEAL_OVERLAY_DURATION_SEC;
    return u * DRINK_HEAL_OVERLAY_RISE_WORLD_PX;
  }

  // --- Grab (CombatEnemy hooks) ----------------------------------------------

  tryGrabLatch(playerHurt: HitboxPose): boolean {
    if (
      !this.isCombatActive() ||
      !this.visionSeesPlayer ||
      !playerHurt ||
      this.grabLatched ||
      !this.isGrabReachPhase()
    ) {
      return false;
    }
    const catchHull = this.combinedHandHitPose();
    if (!catchHull || !polygonIntersectsPolygon(catchHull.worldVertices(), playerHurt.worldVertices())) {
      return false;
    }
    this.grabLatched = true;
    this.grabReleaseKind = this.isDesperateBand() ? "DRINK" : "THROW";
    this.grabDrinkActive = false;
    return true;
  }

  applyGrabDrinkStealIfDue(player: {
    applyGrabDrinkSteal(halfHearts: number, freezeFrames: number): boolean;
  }): void {
    if (!this.grabDrinkStealPending) return;
    this.grabDrinkStealPending = false;
    const fz = freezeFrames(GRAB_DRINK_STEAL_HALF_HEARTS, GRAB_DRINK_HITSTUN_MULT);
    if (player.applyGrabDrinkSteal(GRAB_DRINK_STEAL_HALF_HEARTS, fz)) {
      this.hp = Math.min(this.maxHp, this.hp + GRAB_DRINK_HEAL_HP);
      this.hitstun = Math.max(this.hitstun, fz / 60);
      this.offensiveHitlagFrames = Math.max(this.offensiveHitlagFrames, fz);
      this.drinkHealOverlayAge = 0;
    }
  }

  isGrabHoldingPlayer(): boolean {
    return this.isGrabHoldPhase();
  }

  grabHoldBoxPose(): HitboxPose | null {
    if (!this.isGrabHoldPhase()) return null;
    return this.combinedGrabBoxPose();
  }

  consumeGrabReleasePunish(): boolean {
    if (!this.grabReleasePending) return false;
    this.grabReleasePending = false;
    this.grabLatched = false;
    return true;
  }

  grabReleaseDamageToPlayer(): number {
    return 1;
  }

  flipGrabHoldFacing(): void {
    const rig = getNephilimRig();
    if (!rig || !this.isGrabHoldPhase() || this.grabHoldWallTurned) return;
    this.facingRight = !this.facingRight;
    this.grabHoldWallTurned = true;
    this.snapGrabHoldPoseToFacing(rig);
  }

  grabPlayerDrawBeforePart(): string {
    return "handR";
  }

  chainStringSegments(alpha = 1): ChainStringSegment[] {
    const rig = getNephilimRig();
    if (!rig) return [];
    const out: ChainStringSegment[] = [];
    for (const link of NEPHILIM_LINKS) {
      const idxA = this.indexOf(link.partA);
      const idxB = this.indexOf(link.partB);
      if (idxA < 0 || idxB < 0) continue;
      if (this.partScattered?.[idxA] || this.partScattered?.[idxB]) continue;
      const pinA = this.chainPin(rig, link.partA, link.pinA);
      const pinB = this.chainPin(rig, link.partB, link.pinB);
      const wA = this.attachPointWorldInterp(idxA, pinA[0], pinA[1], alpha);
      const wB = this.attachPointWorldInterp(idxB, pinB[0], pinB[1], alpha);
      const a = this.partSims[idxA]!;
      const b = this.partSims[idxB]!;
      out.push({ ax: wA[0], ay: wA[1], bx: wB[0], by: wB[1], loose: a.loose || b.loose });
    }
    return out;
  }

  handGrabStringSegments(alpha = 1): ChainStringSegment[] {
    const rig = getNephilimRig();
    if (!rig) return [];
    const out: ChainStringSegment[] = [];
    for (const hand of ["handL", "handR"] as const) {
      const idx = this.indexOf(hand);
      if (idx < 0 || this.partScattered?.[idx]) continue;
      const parent = this.chainPin(rig, hand, PARENT);
      const child = this.chainPin(rig, hand, CHILD);
      const wP = this.attachPointWorldInterp(idx, parent[0], parent[1], alpha);
      const wC = this.attachPointWorldInterp(idx, child[0], child[1], alpha);
      out.push({
        ax: wP[0],
        ay: wP[1],
        bx: wC[0],
        by: wC[1],
        loose: this.partSims[idx]!.loose,
      });
    }
    return out;
  }

  // --- Lift, arm guard, planted feet -----------------------------------------

  private liftSequence(rig: NephilimRigData): string[] {
    return sequence(rig, "lift");
  }

  private liftPoseName(rig: NephilimRigData): string {
    const seq = this.liftSequence(rig);
    return seq.length > 0 ? seq[0]! : "death";
  }

  private isLiftActive(): boolean {
    return this.liftPhase != null;
  }

  private isLiftAttackPose(): boolean {
    return (
      this.liftPhase === "RISE" ||
      this.liftPhase === "DRAG" ||
      this.liftPhase === "DROP" ||
      this.liftPhase === "LAND"
    );
  }

  private isLiftSuspended(): boolean {
    return this.liftPhase === "RISE" || this.liftPhase === "DRAG";
  }

  private isLiftDropping(): boolean {
    return this.liftPhase === "DROP" && !this.onGround;
  }

  private isLiftPartsDetached(): boolean {
    return this.liftPhase === "LAND" || this.liftPhase === "RECOVER";
  }

  private isLiftLandingContactActive(): boolean {
    return this.isLiftDropping() || this.liftPhase === "LAND";
  }

  private isLiftDropIkActive(): boolean {
    return this.liftPhase === "DROP" && !this.onGround && !this.deathStarted;
  }

  private liftStuckAttemptRequiredSec(): number {
    return this.lerpAgg(LIFT_STUCK_ATTEMPT_BASE_SEC, LIFT_STUCK_ATTEMPT_AGG_SEC);
  }

  private liftUnreachableAttemptRequiredSec(): number {
    return this.lerpAgg(LIFT_UNREACHABLE_ATTEMPT_BASE_SEC, LIFT_UNREACHABLE_ATTEMPT_AGG_SEC);
  }

  private liftCooldownSec(): number {
    return this.lerpAgg(LIFT_COOLDOWN_BASE_SEC, LIFT_COOLDOWN_AGG_SEC);
  }

  private liftDragSpeed(): number {
    return this.lerpAgg(LIFT_DRAG_SPEED_BASE, LIFT_DRAG_SPEED_AGG);
  }

  private canTrackLiftFrustration(): boolean {
    return (
      this.visionSeesPlayer &&
      this.onGround &&
      this.lifePhase === "ACTIVE" &&
      this.isStandoffTrackingPlayer() &&
      !this.anyArmChainLoose() &&
      !this.armGuardActive()
    );
  }

  private canBeginLift(): boolean {
    return this.canTrackLiftFrustration() && this.attackCooldown <= 0 && this.liftCooldown <= 0;
  }

  private tickLiftStuckTimers(dt: number, map: TileMap, rig: NephilimRigData): void {
    if (!this.canTrackLiftFrustration()) {
      this.anchorStuckTimer = 0;
      this.liftStuckAttemptTimer = 0;
      this.liftUnreachableTimer = 0;
      return;
    }
    if (this.isEffectivelyStuck(map, rig)) {
      this.anchorStuckTimer += dt;
    } else {
      this.anchorStuckTimer = Math.max(0, this.anchorStuckTimer - dt * 1.5);
    }
    if (this.anchorStuckTimer >= LIFT_STUCK_MIN_SEC) {
      this.liftStuckAttemptTimer += dt;
    } else {
      this.liftStuckAttemptTimer = 0;
    }
    if (this.isPlayerUnreachable(map, rig)) {
      this.liftUnreachableTimer += dt;
    } else {
      this.liftUnreachableTimer = Math.max(0, this.liftUnreachableTimer - dt * 1.2);
    }
  }

  private isPlayerUnreachable(map: TileMap, rig: NephilimRigData): boolean {
    if (!this.onGround || !this.visionSeesPlayer || !Number.isFinite(this.playerCx) || !Number.isFinite(this.playerCy)) {
      return false;
    }
    if (Math.abs(this.lastHorzStepPx) >= LIFT_STUCK_MOVE_EPS || Math.abs(this.vx) > PLANTED_VEL_PX) {
      return false;
    }
    if (Math.abs(this.playerCy - this.y) > LIFT_UNREACHABLE_VERT_PX) return true;
    const gapX = Math.abs(this.playerCx - this.x);
    const approachPx = this.standoffApproachPx();
    if (gapX > approachPx + 2) {
      const dir = Math.sign(this.playerCx - this.x);
      if (dir !== 0 && !this.canMoveHorizontally(map, rig, dir * this.walkSpeed())) return true;
    }
    return false;
  }

  private isEffectivelyStuck(map: TileMap, rig: NephilimRigData): boolean {
    if (!this.onGround || !this.visionSeesPlayer || !Number.isFinite(this.playerCx)) return false;
    if (Math.abs(this.lastHorzStepPx) >= LIFT_STUCK_MOVE_EPS) return false;
    if (Math.abs(this.vx) > PLANTED_VEL_PX) return false;
    const gap = Math.abs(this.playerCx - this.x);
    const approachPx = this.standoffApproachPx();
    const retreatPx = this.standoffRetreatPx();
    const wantsApproach = gap > approachPx + 2;
    const wantsRetreat = gap < retreatPx - 2;
    if (!wantsApproach && !wantsRetreat) return false;
    if (wantsApproach) {
      const dir = Math.sign(this.playerCx - this.x);
      if (dir === 0) return false;
      return !this.canMoveHorizontally(map, rig, dir * this.walkSpeed());
    }
    let away = Math.sign(this.x - this.playerCx);
    if (away === 0) away = this.facingRight ? -1 : 1;
    return !this.canMoveHorizontally(map, rig, away * this.backpedalSpeed());
  }

  private beginLift(map: TileMap, rig: NephilimRigData): void {
    void map;
    this.clearGrabState();
    this.grabSeqIdx = -1;
    this.liftPhase = "RISE";
    this.liftPhaseTimer = LIFT_RISE_SEC;
    const desiredTargetY = this.y - LIFT_HEIGHT_WORLD_PX;
    const ceilingCapY = this.liftCeilingCapAnchorY(rig, this.x, this.y);
    this.liftTargetAnchorY = Number.isFinite(ceilingCapY) ? Math.max(desiredTargetY, ceilingCapY) : desiredTargetY;
    this.liftHandWorldX = this.x;
    this.liftHandWorldY = this.liftTargetAnchorY - LIFT_HAND_ABOVE_ANCHOR_PX;
    this.vx = 0;
    this.vy = 0;
    this.standoffHoldTimer = 0;
    this.liftStuckAttemptTimer = 0;
    this.liftUnreachableTimer = 0;
    this.anchorStuckTimer = 0;
    this.plantedFootL = false;
    this.plantedFootR = false;
    this.endLiftRagdoll();
    this.updateFacingTowardPlayer();
  }

  private liftDragTargetX(map: TileMap, rig: NephilimRigData): number {
    if (!Number.isFinite(this.playerCx)) return this.x;
    let target = this.playerCx;
    const margin = ROOM_MARGIN;
    const rw = map.getWidth() * TILE_SIZE;
    const r = this.anchorCollisionRect(rig, target, this.y);
    if (!r) return target;
    if (r.x < margin) target += margin - r.x;
    if (r.x + r.w > rw - margin) target -= r.x + r.w - (rw - margin);
    return target;
  }

  private endLiftRagdoll(): void {
    for (const p of this.partSims) {
      p.loose = false;
      p.looseTimer = 0;
      p.looseAge = 0;
      p.vx = 0;
      p.vy = 0;
      p.angleVel = 0;
    }
  }

  private clearLiftState(): void {
    this.liftPhase = null;
    this.liftPhaseTimer = 0;
    this.liftHandWorldX = 0;
    this.liftHandWorldY = 0;
    this.liftTargetAnchorY = 0;
    this.endLiftRagdoll();
  }

  private tickLiftPhases(dt: number, map: TileMap, rig: NephilimRigData): void {
    void map;
    void rig;
    switch (this.liftPhase) {
      case "RISE": {
        const riseSpeed = LIFT_HEIGHT_WORLD_PX / Math.max(1e-6, LIFT_RISE_SEC);
        this.y -= riseSpeed * dt;
        this.liftHandWorldX = this.x;
        this.liftHandWorldY = this.liftTargetAnchorY - LIFT_HAND_ABOVE_ANCHOR_PX;
        if (this.y <= this.liftTargetAnchorY || this.liftPhaseTimer <= 0) {
          this.y = Math.max(this.y, this.liftTargetAnchorY);
          this.liftPhase = "DRAG";
          this.liftPhaseTimer = LIFT_DRAG_SEC;
          this.liftHandWorldY = this.liftTargetAnchorY - LIFT_HAND_ABOVE_ANCHOR_PX;
          this.updateFacingTowardPlayer();
        }
        break;
      }
      case "DRAG": {
        this.vx = 0;
        this.vy = 0;
        const targetX = this.liftDragTargetX(map, rig);
        const dx = targetX - this.x;
        const step = this.liftDragSpeed() * dt;
        if (Math.abs(dx) <= step) this.x = targetX;
        else this.x += Math.sign(dx) * step;
        this.liftHandWorldX = this.x + Math.sin(this.bobTime * 2.4) * 3;
        this.liftHandWorldY = this.liftTargetAnchorY - LIFT_HAND_ABOVE_ANCHOR_PX;
        if (this.liftPhaseTimer <= 0) {
          this.liftPhase = "DROP";
          this.liftPhaseTimer = 0;
          this.endLiftRagdoll();
        }
        break;
      }
      case "DROP":
      case "LAND":
      case "RECOVER":
        break;
    }
  }

  private tickLiftMovement(dt: number, map: TileMap, rig: NephilimRigData): void {
    if (this.liftPhase === "RISE" || this.liftPhase === "DRAG") {
      this.applyLiftCeilingCap(map, rig);
      this.onGround = false;
      this.wasOnGround = false;
      this.clampToRoom(map, rig);
      return;
    }
    if (this.liftPhase === "DROP") {
      this.vy += GRAVITY * dt;
      if (this.vy > MAX_FALL) this.vy = MAX_FALL;
      this.vx *= Math.max(0, 1 - dt * 2);
      this.moveAndCollide(dt, map, rig);
      this.onGround = this.isGrounded(map, rig);
      if (this.onGround) {
        const impactVy = this.vy;
        this.vy = 0;
        this.vx *= 0.35;
        this.beginLiftLandingCollapse(impactVy);
        this.liftPhase = "LAND";
        this.liftPhaseTimer = LIFT_LAND_SEC;
      }
      this.clampToRoom(map, rig);
      return;
    }
    if (this.liftPhase === "LAND") {
      this.vy += GRAVITY * dt * 0.72;
      if (this.vy > MAX_FALL) this.vy = MAX_FALL;
      this.vx *= Math.max(0, 1 - dt * 3.5);
      this.moveAndCollide(dt, map, rig);
      this.onGround = this.isGrounded(map, rig);
      if (this.onGround && this.vy > 0) this.vy = 0;
      if (this.liftPhaseTimer <= 0) {
        this.liftPhase = "RECOVER";
        this.liftPhaseTimer = LIFT_RECOVER_SEC;
      }
      return;
    }
    if (this.liftPhase === "RECOVER") {
      this.vx *= Math.max(0, 1 - dt * 8);
      this.onGround = this.isGrounded(map, rig);
      if (this.liftPhaseTimer <= 0) {
        this.clearLiftState();
        this.liftCooldown = this.liftCooldownSec();
        this.attackCooldown = Math.max(this.attackCooldown, this.grabCooldownSec() * 0.5);
      }
    }
  }

  private liftCeilingCapAnchorY(rig: NephilimRigData, anchorX: number, anchorY: number): number {
    const r = this.anchorCollisionRect(rig, anchorX, anchorY);
    if (!r || !this.cameraViewWorld) return Number.NEGATIVE_INFINITY;
    const capTopY = this.cameraViewWorld.y - TILE_SIZE;
    const topOffset = r.y - anchorY;
    return capTopY - topOffset;
  }

  private applyLiftCeilingCap(map: TileMap, rig: NephilimRigData): void {
    void map;
    const capY = this.liftCeilingCapAnchorY(rig, this.x, this.y);
    if (!Number.isFinite(capY)) return;
    if (this.y < capY) this.y = capY;
    this.liftTargetAnchorY = Math.max(this.liftTargetAnchorY, capY);
    this.liftHandWorldY = this.liftTargetAnchorY - LIFT_HAND_ABOVE_ANCHOR_PX;
  }

  private beginLiftLandingCollapse(impactVy: number): void {
    const impact = Math.min(2.5, Math.max(1.05, impactVy / 160));
    const outL = this.facingRight ? 1 : -1;
    const outR = -outL;
    const kx = KNOCK_SPEED * 0.78 * impact;
    const ky = -KNOCK_UP * 0.42 * impact;
    const splashY = 38 + impact * 22;
    const spin = (Math.random() - 0.5) * KNOCK_SPIN_DEG * 1.2;
    this.loosenLimbChainForLiftLand(NEPHILIM_LIMBS[0]!, outL * kx * 0.62, ky * 1.15, spin, 0.58, 0.62, 1.05);
    this.loosenLimbChainForLiftLand(NEPHILIM_LIMBS[1]!, outL * kx * 1.08, ky * 0.88, -spin, 0.88, 0.84, 1.12);
    this.loosenLimbChainForLiftLand(NEPHILIM_LIMBS[2]!, outR * kx * 1.08, ky * 0.88, spin, 0.88, 0.84, 1.12);
    this.loosenLimbChainForLiftLand(
      NEPHILIM_LEG_CHAINS[0]!,
      outL * kx * 0.95,
      splashY,
      -spin * 0.75,
      0.72,
      0.9,
      1.18,
    );
    this.loosenLimbChainForLiftLand(
      NEPHILIM_LEG_CHAINS[1]!,
      outR * kx * 0.95,
      splashY,
      spin * 0.75,
      0.72,
      0.9,
      1.18,
    );
    this.offensiveHitlagFrames = Math.max(this.offensiveHitlagFrames, LIFT_LAND_IMPACT_HITLAG);
    const landStunSec = LIFT_LAND_IMPACT_HITLAG / 60;
    this.hitstun = Math.max(this.hitstun, landStunSec);
    const towardPlayer = Number.isFinite(this.playerCx)
      ? Math.sign(this.playerCx - this.x)
      : this.facingRight
        ? 1
        : -1;
    if (towardPlayer !== 0) this.vx = towardPlayer * (52 + impact * 38);
    this.plantedFootL = false;
    this.plantedFootR = false;
  }

  private loosenLimbChainForLiftLand(
    chain: LimbChain,
    impX: number,
    impY: number,
    spinDeg: number,
    connSpinScale: number,
    extSpinScale: number,
    impScale: number,
  ): void {
    this.loosenLimbChain(chain, impX, impY, spinDeg, connSpinScale, extSpinScale, impScale);
    const connIdx = this.indexOf(chain.connector);
    const extIdx = this.indexOf(chain.extremity);
    if (connIdx >= 0) {
      this.partSims[connIdx]!.looseTimer = Math.max(this.partSims[connIdx]!.looseTimer, LIFT_LAND_LOOSE_SEC);
    }
    if (extIdx >= 0) {
      this.partSims[extIdx]!.looseTimer = Math.max(this.partSims[extIdx]!.looseTimer, LIFT_LAND_LOOSE_SEC);
    }
  }

  private loosenLimbChain(
    chain: LimbChain,
    impX: number,
    impY: number,
    spinDeg: number,
    connSpinScale: number,
    extSpinScale: number,
    impScale: number,
  ): void {
    const rig = getNephilimRig();
    if (!rig) return;
    const connIdx = this.indexOf(chain.connector);
    if (connIdx < 0) return;
    const conn = this.partSims[connIdx]!;
    conn.loose = true;
    conn.looseTimer = Math.max(conn.looseTimer, LOOSE_MIN_SEC);
    conn.looseAge = 0;
    conn.angleVel += spinDeg * connSpinScale;
    const extIdx = this.indexOf(chain.extremity);
    if (extIdx < 0) return;
    const connChild = this.chainPin(rig, chain.connector, CHILD);
    const childPin = this.attachPointWorld(rig, connIdx, connChild[0], connChild[1]);
    const extParent = this.chainPin(rig, chain.extremity, PARENT);
    const extAttach = this.attachPointWorld(rig, extIdx, extParent[0], extParent[1]);
    const dist = Math.hypot(extAttach[0] - childPin[0], extAttach[1] - childPin[1]);
    const ext = this.partSims[extIdx]!;
    ext.chainLen = Math.max(4, dist * CHAIN_SLACK);
    ext.loose = true;
    ext.looseTimer = Math.max(ext.looseTimer, LOOSE_MIN_SEC);
    ext.looseAge = 0;
    ext.vx += impX * impScale;
    ext.vy += impY * impScale;
    ext.angleVel += spinDeg * extSpinScale;
  }

  private applyLiftDropIk(rig: NephilimRigData): void {
    const wob = Math.sin(this.bobTime * LIFT_DROP_IK_WOBBLE_HZ);
    const wob2 = Math.sin(this.bobTime * (LIFT_DROP_IK_WOBBLE_HZ * 0.73) + 1.1);
    const fallLean = Math.min(1, Math.max(0.4, Math.hypot(this.vx * 0.018, this.vy * 0.006)));
    const sillyBack = this.facingRight ? 1 : -1;
    const trailSign = this.vx !== 0 ? -Math.sign(this.vx) : sillyBack;
    const trailX = this.x + trailSign * (30 + wob * 9);
    this.applyLiftDropArmIkSide(
      rig,
      this.x + sillyBack * (46 + wob * 11),
      this.y - (60 + wob2 * 14),
      "socketHandL",
      "armL",
      "handL",
    );
    this.applyLiftDropArmIkSide(
      rig,
      this.x + sillyBack * (34 - wob * 7),
      this.y - (46 - wob2 * 9),
      "socketHandR",
      "armR",
      "handR",
    );
    this.applyLiftDropLegIk(rig, trailX - 14, this.y + 40 + fallLean * 12, true, NEPHILIM_LEG_CHAINS[0]!);
    this.applyLiftDropLegIk(rig, trailX + 18, this.y + 34 + fallLean * 10, false, NEPHILIM_LEG_CHAINS[1]!);
    this.applyLiftDropHeadNeck(
      rig,
      this.x + sillyBack * (10 + wob * 7),
      this.y - (52 + Math.abs(wob2) * 16),
      wob * 22,
    );
  }

  private applyLiftDropArmIkSide(
    rig: NephilimRigData,
    aimX: number,
    aimY: number,
    bodySocket: string,
    armName: string,
    handName: string,
  ): void {
    const armIdx = this.indexOf(armName);
    const handIdx = this.indexOf(handName);
    if (armIdx < 0 || handIdx < 0) return;
    const arm = this.partSims[armIdx]!;
    const hand = this.partSims[handIdx]!;
    if (arm.loose || hand.loose) return;
    const shoulder = this.bodySocketWorld(rig, bodySocket);
    const armParent = this.chainPin(rig, armName, PARENT);
    const armChild = this.chainPin(rig, armName, CHILD);
    const handParent = this.chainPin(rig, handName, PARENT);
    const handChild = this.chainPin(rig, handName, CHILD);
    const lenUpper = this.pinDistance(armParent, armChild);
    const lenLower = this.pinDistance(handParent, handChild);
    const elbowAuth = this.attachPointWorld(rig, armIdx, armChild[0], armChild[1]);
    const solved = solveTwoBoneIk(
      shoulder[0],
      shoulder[1],
      aimX,
      aimY,
      lenUpper,
      lenLower,
      elbowAuth[0],
      elbowAuth[1],
    );
    if (!solved) return;
    this.gluePartTwoPins(rig, armIdx, armParent, armChild, shoulder[0], shoulder[1], solved.ex, solved.ey);
    this.gluePartTwoPins(rig, handIdx, handParent, handChild, solved.ex, solved.ey, solved.tx, solved.ty);
  }

  private applyLiftDropLegIk(
    rig: NephilimRigData,
    plantX: number,
    plantY: number,
    leftLeg: boolean,
    chain: LimbChain,
  ): void {
    const connIdx = this.indexOf(chain.connector);
    const footIdx = this.indexOf(chain.extremity);
    if (connIdx < 0 || footIdx < 0) return;
    const conn = this.partSims[connIdx]!;
    const foot = this.partSims[footIdx]!;
    if (conn.loose || foot.loose) return;
    const hip = this.bodySocketWorld(rig, chain.bodySocket);
    const connParent = this.chainPin(rig, chain.connector, PARENT);
    const connChild = this.chainPin(rig, chain.connector, CHILD);
    const footParent = this.chainPin(rig, chain.extremity, PARENT);
    const footChild = this.chainPin(rig, chain.extremity, CHILD);
    const lenUpper = this.pinDistance(connParent, connChild);
    const lenLower = this.pinDistance(footParent, footChild);
    const pole = this.legKneePoleWorld(hip[0], hip[1], plantX, plantY, leftLeg);
    const solved = solveTwoBoneIk(hip[0], hip[1], plantX, plantY, lenUpper, lenLower, pole[0], pole[1]);
    if (!solved) return;
    this.gluePartTwoPins(rig, connIdx, connParent, connChild, hip[0], hip[1], solved.ex, solved.ey);
    this.gluePartTwoPins(rig, footIdx, footParent, footChild, solved.ex, solved.ey, solved.tx, solved.ty);
  }

  private applyLiftDropHeadNeck(
    rig: NephilimRigData,
    headAimX: number,
    headAimY: number,
    headTiltDeg: number,
  ): void {
    const neckIdx = this.indexOf("neck");
    const headIdx = this.indexOf("head");
    if (neckIdx < 0 || headIdx < 0) return;
    const neck = this.partSims[neckIdx]!;
    const head = this.partSims[headIdx]!;
    if (neck.loose || head.loose) return;
    const bodyPin = this.bodySocketWorld(rig, "socketNeck");
    const neckParent = this.chainPin(rig, "neck", PARENT);
    const neckChild = this.chainPin(rig, "neck", CHILD);
    this.gluePartTwoPins(rig, neckIdx, neckParent, neckChild, bodyPin[0], bodyPin[1], headAimX, headAimY);
    const neckTip = this.attachPointWorld(rig, neckIdx, neckChild[0], neckChild[1]);
    const headParent = this.chainPin(rig, "head", PARENT);
    this.pinPartAttachAt(rig, headIdx, headParent[0], headParent[1], neckTip[0], neckTip[1]);
    head.angleDeg = this.partPoseEntry(rig, this.liftPoseName(rig), "head").angleDeg + headTiltDeg;
    head.angleVel *= 0.12;
    head.vx *= 0.15;
    head.vy *= 0.15;
  }

  private applyLiftRebuildRecall(
    p: NephilimPartSim,
    partName: string,
    targetX: number,
    targetY: number,
    targetAng: number,
    dt: number,
  ): void {
    const k = chainIsConnector(partName) ? LIFT_REBUILD_RECALL_K * 0.82 : LIFT_REBUILD_RECALL_K;
    p.vx += (targetX - p.cx) * k * dt;
    p.vy += (targetY - p.cy) * k * dt;
    p.angleVel += this.angleDelta(targetAng, p.angleDeg) * LIFT_REBUILD_ANGLE_K * dt;
  }

  private applyLooseRecall(
    p: NephilimPartSim,
    partName: string,
    targetX: number,
    targetY: number,
    targetAng: number,
    dt: number,
  ): void {
    if (this.isLiftSuspended()) return;
    if (this.liftPhase === "RECOVER") {
      this.applyLiftRebuildRecall(p, partName, targetX, targetY, targetAng, dt);
      return;
    }
    if (this.isLiftPartsDetached()) return;
    if (partName !== "head" && !partName.startsWith("hand")) return;
    const k = partName === "head" ? LOOSE_RECALL_K_HEAD : LOOSE_RECALL_K_HAND;
    p.vx += (targetX - p.cx) * k * dt;
    p.vy += (targetY - p.cy) * k * dt;
    p.angleVel += this.angleDelta(targetAng, p.angleDeg) * LOOSE_RECALL_ANGLE_K * dt;
  }

  private isLooseExtremity(partName: string): boolean {
    return (
      partName === "head" ||
      partName.startsWith("hand") ||
      partName.startsWith("foot")
    );
  }

  private trySettleLoosePart(
    p: NephilimPartSim,
    partName: string,
    targetX: number,
    targetY: number,
  ): boolean {
    if (this.isLiftSuspended() || this.liftPhase === "LAND") return false;
    if (p.looseTimer > 0) return false;
    if (this.liftPhase === "RECOVER") {
      const dist = Math.hypot(targetX - p.cx, targetY - p.cy);
      const sp = Math.hypot(p.vx, p.vy);
      if (dist < 11 && sp < 42 && Math.abs(p.angleVel) < 220) {
        p.loose = false;
        p.vx *= 0.2;
        p.vy *= 0.2;
        p.angleVel *= 0.2;
        return true;
      }
      return false;
    }
    const dist = Math.hypot(targetX - p.cx, targetY - p.cy);
    const sp = Math.hypot(p.vx, p.vy);
    const angSettled = Math.abs(p.angleVel) < 140;
    const movingSlow = sp < 26 && angSettled;
    const settleDist =
      partName === "head"
        ? LOOSE_SETTLE_DIST_HEAD
        : partName === "handL" || partName === "handR"
          ? LOOSE_SETTLE_DIST_HAND
          : 7;
    if (movingSlow && dist < settleDist) {
      p.loose = false;
      return true;
    }
    if (this.isLooseExtremity(partName) && p.looseAge >= LOOSE_MAX_SEC && sp < 38 && angSettled) {
      p.loose = false;
      p.vx *= 0.25;
      p.vy *= 0.25;
      p.angleVel *= 0.25;
      return true;
    }
    return false;
  }

  private tickArmGuard(dt: number): void {
    if (this.armGuardCooldown > 0) {
      this.armGuardCooldown = Math.max(0, this.armGuardCooldown - dt);
    }
    if (this.armGuardTimer > 0) {
      this.armGuardTimer = Math.max(0, this.armGuardTimer - dt);
      this.armGuardGlow = 1;
    } else if (this.armGuardGlow > 0) {
      this.armGuardGlow = Math.max(0, this.armGuardGlow - dt / ARM_GUARD_GLOW_FADE_SEC);
    }
    if (this.comboHitWindow > 0) {
      this.comboHitWindow = Math.max(0, this.comboHitWindow - dt);
      if (this.comboHitWindow <= 0) this.comboHitCount = 0;
    }
  }

  armGuardActive(): boolean {
    return this.armGuardTimer > 0 && this.lifePhase === "ACTIVE" && !this.deathStarted;
  }

  private noteHitForArmGuard(): void {
    if (this.armGuardCooldown > 0 || !this.isCombatActive()) return;
    if (this.comboHitWindow <= 0) this.comboHitCount = 0;
    this.comboHitWindow = ARM_GUARD_COMBO_SEC;
    this.comboHitCount++;
    if (this.comboHitCount >= ARM_GUARD_HITS) {
      this.armGuardTimer = ARM_GUARD_DURATION_SEC;
      this.armGuardCooldown = ARM_GUARD_COOLDOWN_SEC;
      this.armGuardGlow = 1;
      this.comboHitCount = 0;
      this.comboHitWindow = 0;
    }
  }

  private isForearmPart(partName: string): boolean {
    if (partName === "handL") return !this.isChainLoose("armL", "handL");
    if (partName === "handR") return !this.isChainLoose("armR", "handR");
    return false;
  }

  private isArmShieldPart(partName: string): boolean {
    return this.armGuardActive() && this.isForearmPart(partName);
  }

  private forearmShieldGlowAlpha(partName: string): number {
    if (this.armGuardGlow <= 0 || !this.isForearmPart(partName)) return 0;
    return Math.round(ARM_GUARD_GLOW_PEAK_ALPHA * this.armGuardGlow);
  }

  private isArmGuardWalkOverlayPart(partName: string): boolean {
    return (
      partName === "body" ||
      partName === "head" ||
      partName === "neck" ||
      partName === "armL" ||
      partName === "armR" ||
      partName === "handL" ||
      partName === "handR"
    );
  }

  private partPoseEntry(rig: NephilimRigData, poseName: string, partName: string) {
    if (this.armGuardActive() && poseName.startsWith("walk") && this.isArmGuardWalkOverlayPart(partName)) {
      return poseOffset(rig, ARM_GUARD_POSE, partName);
    }
    if (poseName === "hurt") return poseOffset(rig, "idle", partName);
    return poseOffset(rig, poseName, partName);
  }

  private onShieldBlocked(freezeFrames: number): void {
    const stunSec = Math.max(0, freezeFrames) / 60;
    this.hitstun = Math.max(this.hitstun, stunSec);
    this.hitlagSolidRed = false;
    this.hitlagElectrocute = false;
  }

  /** Raised forearms only — Java shieldBlockPose / combinedHurtPose(shieldOnly). */
  private shieldBlockPose(): HitboxPose | null {
    if (!this.armGuardActive()) return null;
    return this.combinedForearmShieldPose(0);
  }

  private combinedRoleAabb(rig: NephilimRigData, role: "hurt" | "hit"): Aabb | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (let i = 0; i < this.partSims.length; i++) {
      if (this.partScattered?.[i]) continue;
      const box = this.partWorldRoleAabb(rig, i, role);
      if (!box) continue;
      minX = Math.min(minX, box.x);
      maxX = Math.max(maxX, box.x + box.w);
      minY = Math.min(minY, box.y);
      maxY = Math.max(maxY, box.y + box.h);
      any = true;
    }
    if (!any) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private loosePartsContactDamageAabb(): Aabb | null {
    const rig = getNephilimRig();
    if (!rig) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (let i = 0; i < this.partSims.length; i++) {
      if (!this.partSims[i]!.loose) continue;
      const box = this.partWorldRoleAabb(rig, i, "hurt");
      if (!box) continue;
      minX = Math.min(minX, box.x);
      maxX = Math.max(maxX, box.x + box.w);
      minY = Math.min(minY, box.y);
      maxY = Math.max(maxY, box.y + box.h);
      any = true;
    }
    if (!any) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private combinedForearmShieldPose(inflateLocalPx: number): HitboxPose | null {
    const rig = getNephilimRig();
    if (!rig) return null;
    const worldVerts: number[] = [];
    for (let i = 0; i < this.partSims.length; i++) {
      if (!this.isForearmPart(this.simNames[i]!)) continue;
      const def = rig.parts[i]!;
      let local: ReadonlyArray<number> = def.hurt;
      if (local.length < 6) continue;
      if (inflateLocalPx > 0) local = inflateHullLocal(local, inflateLocalPx);
      const p = this.partSims[i]!;
      const m = this.facingMul();
      const poly = transformHull(local, def.pivotX, def.pivotY, p.cx, p.cy, p.angleDeg, m);
      for (let j = 0; j < poly.length; j += 2) worldVerts.push(poly[j]!, poly[j + 1]!);
    }
    if (worldVerts.length < 6) return null;
    return HitboxPoseClass.fromWorldPolygon(worldVerts);
  }

  private applyAttachedLegChains(rig: NephilimRigData): void {
    if (this.lifePhase !== "ACTIVE" || !this.onGround || this.deathStarted) return;
    for (const chain of NEPHILIM_LEG_CHAINS) this.glueAttachedLegChain(rig, chain);
  }

  private glueAttachedLegChain(rig: NephilimRigData, chain: LimbChain): void {
    const connIdx = this.indexOf(chain.connector);
    const footIdx = this.indexOf(chain.extremity);
    if (connIdx < 0 || footIdx < 0) return;
    const conn = this.partSims[connIdx]!;
    const foot = this.partSims[footIdx]!;
    if (conn.loose || foot.loose) return;
    const hip = this.bodySocketWorld(rig, chain.bodySocket);
    const connParent = this.chainPin(rig, chain.connector, PARENT);
    const connChild = this.chainPin(rig, chain.connector, CHILD);
    const footParent = this.chainPin(rig, chain.extremity, PARENT);
    const ankle = this.attachPointWorld(rig, footIdx, footParent[0], footParent[1]);
    this.gluePartTwoPins(rig, connIdx, connParent, connChild, hip[0], hip[1], ankle[0], ankle[1]);
  }

  private applyPlantedLegConstraints(rig: NephilimRigData): void {
    if (!this.usePlantedStance()) {
      this.plantedFootL = false;
      this.plantedFootR = false;
      return;
    }
    this.updatePlantedLeg(rig, NEPHILIM_LEG_CHAINS[0]!, true);
    this.updatePlantedLeg(rig, NEPHILIM_LEG_CHAINS[1]!, false);
  }

  private updatePlantedLeg(rig: NephilimRigData, chain: LimbChain, left: boolean): void {
    const extIdx = this.indexOf(chain.extremity);
    if (extIdx < 0 || this.partSims[extIdx]!.loose) {
      if (left) this.plantedFootL = false;
      else this.plantedFootR = false;
      return;
    }
    const plantLocal = this.chainPin(rig, chain.extremity, CHILD);
    const plantWorld = this.attachPointWorld(rig, extIdx, plantLocal[0], plantLocal[1]);
    if (left) {
      if (!this.plantedFootL) {
        this.plantedFootLWorldX = plantWorld[0];
        this.plantedFootLWorldY = plantWorld[1];
        this.plantedFootL = true;
      }
      this.applyPlantedLegChain(rig, chain, this.plantedFootLWorldX, this.plantedFootLWorldY, true);
    } else {
      if (!this.plantedFootR) {
        this.plantedFootRWorldX = plantWorld[0];
        this.plantedFootRWorldY = plantWorld[1];
        this.plantedFootR = true;
      }
      this.applyPlantedLegChain(rig, chain, this.plantedFootRWorldX, this.plantedFootRWorldY, false);
    }
  }

  private applyPlantedLegChain(
    rig: NephilimRigData,
    chain: LimbChain,
    plantX: number,
    plantY: number,
    leftLeg: boolean,
  ): void {
    const connIdx = this.indexOf(chain.connector);
    const footIdx = this.indexOf(chain.extremity);
    if (connIdx < 0 || footIdx < 0) return;
    const conn = this.partSims[connIdx]!;
    const foot = this.partSims[footIdx]!;
    if (conn.loose || foot.loose) return;
    const hip = this.bodySocketWorld(rig, chain.bodySocket);
    const connParent = this.chainPin(rig, chain.connector, PARENT);
    const connChild = this.chainPin(rig, chain.connector, CHILD);
    const footParent = this.chainPin(rig, chain.extremity, PARENT);
    const footChild = this.chainPin(rig, chain.extremity, CHILD);
    const lenUpper = this.pinDistance(connParent, connChild);
    const lenLower = this.pinDistance(footParent, footChild);
    const pole = this.legKneePoleWorld(hip[0], hip[1], plantX, plantY, leftLeg);
    const solved = solveTwoBoneIk(hip[0], hip[1], plantX, plantY, lenUpper, lenLower, pole[0], pole[1]);
    if (!solved) return;
    this.gluePartTwoPins(rig, connIdx, connParent, connChild, hip[0], hip[1], solved.ex, solved.ey);
    this.gluePartTwoPins(rig, footIdx, footParent, footChild, solved.ex, solved.ey, solved.tx, solved.ty);
  }

  private finalizeGroundedStance(rig: NephilimRigData, map: TileMap): void {
    if (!this.usePlantedStance()) return;
    this.snapPlantedFeetToFloor(map);
    if (this.plantedFootL) {
      this.applyPlantedLegChain(
        rig,
        NEPHILIM_LEG_CHAINS[0]!,
        this.plantedFootLWorldX,
        this.plantedFootLWorldY,
        true,
      );
    }
    if (this.plantedFootR) {
      this.applyPlantedLegChain(
        rig,
        NEPHILIM_LEG_CHAINS[1]!,
        this.plantedFootRWorldX,
        this.plantedFootRWorldY,
        false,
      );
    }
  }

  private snapPlantedFeetToFloor(map: TileMap): void {
    if (this.plantedFootL) {
      const floor = this.floorTopYUnder(map, this.plantedFootLWorldX, this.plantedFootLWorldY);
      if (floor != null) this.plantedFootLWorldY = floor;
    }
    if (this.plantedFootR) {
      const floor = this.floorTopYUnder(map, this.plantedFootRWorldX, this.plantedFootRWorldY);
      if (floor != null) this.plantedFootRWorldY = floor;
    }
  }

  private floorTopYUnder(map: TileMap, worldX: number, worldY: number): number | null {
    const tx = Math.floor(worldX / TILE_SIZE);
    if (tx < 0 || tx >= map.getWidth()) return null;
    let ty = Math.max(0, Math.floor((worldY - 2) / TILE_SIZE));
    for (; ty < map.getHeight(); ty++) {
      if (map.isSolidTile(tx, ty) || map.isPlatformTile(tx, ty)) return ty * TILE_SIZE;
    }
    return null;
  }

  private legKneePoleWorld(
    hipX: number,
    hipY: number,
    plantX: number,
    plantY: number,
    leftLeg: boolean,
  ): [number, number] {
    const mx = (hipX + plantX) * 0.5;
    const my = (hipY + plantY) * 0.5;
    const dx = plantX - hipX;
    const dy = plantY - hipY;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return [mx, my + 14];
    const perpX = -dy / len;
    const perpY = dx / len;
    const outward = leftLeg ? -1 : 1;
    const poleDist = Math.max(12, len * 0.35);
    return [mx + perpX * outward * poleDist, my + perpY * outward * poleDist];
  }

  // --- Grab + chain internals ------------------------------------------------

  private isDesperateBand(): boolean {
    return this.hpFrac() <= BAND_DESPERATE_HP_FRAC;
  }

  private grabStandoffHoldSec(): number {
    return this.lerpAgg(GRAB_STANDOFF_HOLD_BASE_SEC, GRAB_STANDOFF_HOLD_AGG_SEC);
  }

  private grabCooldownSec(): number {
    return this.lerpAgg(GRAB_COOLDOWN_BASE_SEC, GRAB_COOLDOWN_AGG_SEC);
  }

  private grabWindupSec(): number {
    return this.lerpAgg(GRAB_WINDUP_SEC, GRAB_WINDUP_AGG_SEC);
  }

  private grabRecoverSec(): number {
    return this.lerpAgg(GRAB_RECOVER_SEC, GRAB_RECOVER_AGG_SEC);
  }

  private armIkReachScale(): number {
    return this.lerpAgg(ARM_IK_REACH_SCALE_BASE, ARM_IK_REACH_SCALE_AGG);
  }

  private grabSequence(rig: NephilimRigData): string[] {
    return sequence(rig, "grab");
  }

  private isGrabActive(): boolean {
    return this.grabSeqIdx >= 0;
  }

  private grabPoseName(rig: NephilimRigData): string {
    const seq = this.grabSequence(rig);
    if (this.grabSeqIdx < 0 || this.grabSeqIdx >= seq.length) return "idle";
    return seq[this.grabSeqIdx]!;
  }

  private grabFrameDurationSec(_rig: NephilimRigData, poseName: string): number {
    switch (poseName) {
      case "grab_windup":
        return this.grabWindupSec();
      case GRAB_POSE_REACH:
        return GRAB_REACH_SEC;
      case GRAB_POSE_HOLD_1:
        return GRAB_RELEASE_BEAT_SEC;
      case "grab_recover":
        return this.grabRecoverSec();
      case GRAB_POSE_HOLD_0:
        return this.grabHold0DurationSec();
      default:
        return 0.4;
    }
  }

  private grabHold0DurationSec(): number {
    if (!this.grabLatched) return GRAB_HOLD_SEC;
    if (this.grabReleaseKind === "DRINK") {
      return this.grabDrinkActive ? GRAB_DRINK_SIP_SEC : GRAB_HOLD_LATCHED_DRINK_SEC;
    }
    return GRAB_HOLD_LATCHED_THROW_SEC;
  }

  private isGrabReachIk(rig: NephilimRigData): boolean {
    return this.isGrabActive() && this.grabPoseName(rig) === GRAB_POSE_REACH;
  }

  private isGrabReachPhase(): boolean {
    const rig = getNephilimRig();
    return rig != null && this.isGrabActive() && this.grabPoseName(rig) === GRAB_POSE_REACH;
  }

  private isGrabHoldPhase(): boolean {
    const rig = getNephilimRig();
    if (!rig || !this.isGrabActive() || !this.grabLatched) return false;
    const pose = this.grabPoseName(rig);
    return pose === GRAB_POSE_HOLD_0 || pose === GRAB_POSE_HOLD_1;
  }

  private grabHoldPhaseTimerScale(): number {
    const rig = getNephilimRig();
    if (!rig || !this.grabLatched || this.grabReleaseKind !== "THROW") return 1;
    if (this.grabPoseName(rig) !== GRAB_POSE_HOLD_0) return 1;
    return this.grabStruggleMashing ? GRAB_HOLD_MASH_TIMER_MULT : 1;
  }

  private advanceGrabSequence(rig: NephilimRigData): void {
    const seq = this.grabSequence(rig);
    this.grabSeqIdx++;
    while (
      this.grabSeqIdx < seq.length &&
      seq[this.grabSeqIdx] === GRAB_POSE_HOLD_1 &&
      !this.grabLatched
    ) {
      this.grabSeqIdx++;
    }
  }

  private clearGrabState(): void {
    this.grabLatched = false;
    this.grabReleaseKind = "THROW";
    this.grabDrinkActive = false;
    this.grabDrinkStealPending = false;
    this.grabStruggleMashing = false;
    this.grabReleasePending = false;
    this.grabHoldWallTurned = false;
    this.drinkHealOverlayAge = -1;
  }

  private tickAttack(dt: number, map: TileMap, rig: NephilimRigData): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.liftCooldown = Math.max(0, this.liftCooldown - dt);
    if (this.isLiftActive()) {
      this.tickLiftPhases(dt, map, rig);
      return;
    }
    if (!this.isGrabActive()) {
      this.tickLiftStuckTimers(dt, map, rig);
      const stuckReady = this.liftStuckAttemptTimer >= this.liftStuckAttemptRequiredSec();
      const unreachableReady = this.liftUnreachableTimer >= this.liftUnreachableAttemptRequiredSec();
      if (this.canBeginLift() && (stuckReady || unreachableReady)) {
        this.beginLift(map, rig);
        return;
      }
      const frustratedForLift =
        this.anchorStuckTimer >= LIFT_STUCK_MIN_SEC ||
        this.liftUnreachableTimer >= LIFT_UNREACHABLE_MIN_SEC;
      if (this.canBeginGrab() && !frustratedForLift) {
        this.standoffHoldTimer += dt;
        if (this.standoffHoldTimer >= this.grabStandoffHoldSec() && this.attackCooldown <= 0) {
          this.beginGrab(rig);
        }
      } else {
        this.standoffHoldTimer = 0;
      }
      return;
    }
    if (this.anyArmChainLoose()) {
      this.grabSeqIdx = -1;
      this.clearGrabState();
      this.attackCooldown = this.grabCooldownSec() * 0.35;
      return;
    }
    this.standoffHoldTimer = 0;
    if (!this.isGrabHoldPhase()) this.updateFacingTowardPlayer();
    this.attackPhaseTimer -= dt * this.grabHoldPhaseTimerScale();
    if (this.attackPhaseTimer > 0) return;
    const seq = this.grabSequence(rig);
    const currentPose = this.grabPoseName(rig);
    if (
      currentPose === GRAB_POSE_HOLD_0 &&
      this.grabLatched &&
      this.grabReleaseKind === "DRINK" &&
      !this.grabDrinkActive
    ) {
      this.grabDrinkActive = true;
      this.grabDrinkStealPending = true;
      this.attackPhaseTimer = this.grabFrameDurationSec(rig, currentPose);
      return;
    }
    const releaseAfterHold = currentPose === GRAB_POSE_HOLD_1 && this.grabLatched;
    this.advanceGrabSequence(rig);
    if (releaseAfterHold) this.grabReleasePending = true;
    if (this.grabSeqIdx >= seq.length) {
      this.grabSeqIdx = -1;
      this.clearGrabState();
      this.attackCooldown = this.grabCooldownSec();
    } else {
      this.attackPhaseTimer = this.grabFrameDurationSec(rig, seq[this.grabSeqIdx]!);
    }
  }

  private canBeginGrab(): boolean {
    return this.visionSeesPlayer && this.onGround && this.isStandoffTrackingPlayer() && !this.anyArmChainLoose();
  }

  private anyArmChainLoose(): boolean {
    return this.isChainLoose("armL", "handL") || this.isChainLoose("armR", "handR");
  }

  private isChainLoose(connectorName: string, extremityName: string): boolean {
    const ci = this.indexOf(connectorName);
    if (ci < 0 || !this.partSims[ci]!.loose) return false;
    const ei = this.indexOf(extremityName);
    return ei < 0 || this.partSims[ei]!.loose;
  }

  private beginGrab(rig: NephilimRigData): void {
    const seq = this.grabSequence(rig);
    if (seq.length === 0) return;
    this.clearGrabState();
    this.grabSeqIdx = 0;
    this.attackPhaseTimer = this.grabFrameDurationSec(rig, seq[0]!);
    this.vx = 0;
    this.updateFacingTowardPlayer();
  }

  private grabReachBlend(rig: NephilimRigData): number {
    if (!this.isGrabReachIk(rig)) return 0;
    let u = 1 - Math.max(0, this.attackPhaseTimer / GRAB_REACH_SEC);
    u = u * u * (3 - 2 * u);
    return u * GRAB_REACH_IK;
  }

  private applyGrabReachHeadTarget(
    targetX: number[],
    _targetY: number[],
    targetAng: number[],
    i: number,
    reachU: number,
  ): void {
    if (!Number.isFinite(this.playerCx)) return;
    targetX[i] = targetX[i]! + (this.playerCx - this.x) * 0.14 * reachU;
    targetAng[i] = targetAng[i]! + (this.playerCx - this.x) * 0.018 * reachU;
  }

  private applyGrabReachArmIk(rig: NephilimRigData, reachU: number): void {
    if (!Number.isFinite(this.playerCx) || this.anyArmChainLoose()) return;
    const aimX = this.playerCx;
    const aimY = Number.isFinite(this.playerCy) ? this.playerCy : this.y;
    this.applyGrabReachArmIkSide(rig, reachU, aimX, aimY, "socketHandL", "armL", "handL");
    this.applyGrabReachArmIkSide(rig, reachU, aimX, aimY, "socketHandR", "armR", "handR");
  }

  private applyGrabReachArmIkSide(
    rig: NephilimRigData,
    reachU: number,
    aimX: number,
    aimY: number,
    bodySocket: string,
    armName: string,
    handName: string,
  ): void {
    const armIdx = this.indexOf(armName);
    const handIdx = this.indexOf(handName);
    if (armIdx < 0 || handIdx < 0) return;
    const arm = this.partSims[armIdx]!;
    const hand = this.partSims[handIdx]!;
    if (arm.loose || hand.loose) return;
    const shoulder = this.bodySocketWorld(rig, bodySocket);
    const armParent = this.chainPin(rig, armName, PARENT);
    const armChild = this.chainPin(rig, armName, CHILD);
    const handParent = this.chainPin(rig, handName, PARENT);
    const handChild = this.chainPin(rig, handName, CHILD);
    let lenUpper = this.pinDistance(armParent, armChild);
    let lenLower = this.pinDistance(handParent, handChild);
    const ikScale = this.armIkReachScale();
    lenUpper *= ikScale;
    lenLower *= ikScale;
    const tipAuth = this.attachPointWorld(rig, handIdx, handChild[0], handChild[1]);
    const elbowAuth = this.attachPointWorld(rig, armIdx, armChild[0], armChild[1]);
    const targetX = tipAuth[0] + (aimX - tipAuth[0]) * reachU;
    const targetY = tipAuth[1] + (aimY - tipAuth[1]) * reachU;
    const solved = solveTwoBoneIk(
      shoulder[0],
      shoulder[1],
      targetX,
      targetY,
      lenUpper,
      lenLower,
      elbowAuth[0],
      elbowAuth[1],
    );
    if (!solved) return;
    this.gluePartTwoPins(
      rig,
      armIdx,
      armParent,
      armChild,
      shoulder[0],
      shoulder[1],
      solved.ex,
      solved.ey,
    );
    this.gluePartTwoPins(
      rig,
      handIdx,
      handParent,
      handChild,
      solved.ex,
      solved.ey,
      solved.tx,
      solved.ty,
    );
  }

  private applyChainConstraints(rig: NephilimRigData): void {
    for (const chain of NEPHILIM_LIMBS) this.applyLimbChain(rig, chain);
    for (const chain of NEPHILIM_LEG_CHAINS) this.applyLimbChain(rig, chain);
  }

  private applyLimbChain(rig: NephilimRigData, chain: LimbChain): void {
    const connIdx = this.indexOf(chain.connector);
    const extIdx = this.indexOf(chain.extremity);
    if (connIdx < 0) return;
    const conn = this.partSims[connIdx]!;
    const ext = extIdx >= 0 ? this.partSims[extIdx]! : null;
    if (!conn.loose && (ext == null || !ext.loose)) return;
    const bodyPin = this.bodySocketWorld(rig, chain.bodySocket);
    const connParent = this.chainPin(rig, chain.connector, PARENT);
    const connChild = this.chainPin(rig, chain.connector, CHILD);
    if (ext != null && ext.loose) {
      this.alignLooseConnectorBone(
        rig,
        connIdx,
        connParent,
        connChild,
        bodyPin,
        extIdx,
        chain.extremity,
      );
    }
    this.pinPartAttachAt(rig, connIdx, connParent[0], connParent[1], bodyPin[0], bodyPin[1]);
    conn.vx *= 0.12;
    conn.vy *= 0.12;
    if (ext != null && ext.loose) {
      const childPin = this.attachPointWorld(rig, connIdx, connChild[0], connChild[1]);
      const extParent = this.chainPin(rig, chain.extremity, PARENT);
      this.constrainAttachToPin(rig, extIdx, extParent[0], extParent[1], childPin[0], childPin[1]);
      ext.angleVel *= chain.extremity === "head" ? 0.48 : chain.extremity.startsWith("hand") ? 0.62 : 0.72;
    }
  }

  private alignLooseConnectorBone(
    rig: NephilimRigData,
    connIdx: number,
    parentLocal: [number, number],
    childLocal: [number, number],
    bodyPinWorld: [number, number],
    extIdx: number,
    extremity: string,
  ): void {
    const conn = this.partSims[connIdx]!;
    const ext = this.partSims[extIdx]!;
    let aimX: number;
    let aimY: number;
    if (extremity === "head" || extremity.startsWith("hand") || extremity.startsWith("foot")) {
      aimX = ext.cx;
      aimY = ext.cy;
    } else {
      const extParentLocal = this.chainPin(rig, extremity, PARENT);
      const extAttach = this.attachPointWorld(rig, extIdx, extParentLocal[0], extParentLocal[1]);
      aimX = extAttach[0];
      aimY = extAttach[1];
    }
    const wx = aimX - bodyPinWorld[0];
    const wy = aimY - bodyPinWorld[1];
    if (Math.hypot(wx, wy) < 1e-3) return;
    const m = this.facingMul();
    const wantDeg = (Math.atan2(wy, wx * m) * 180) / Math.PI;
    const boneDx = childLocal[0] - parentLocal[0];
    const boneDy = childLocal[1] - parentLocal[1];
    const boneDeg = (Math.atan2(boneDy, boneDx * m) * 180) / Math.PI;
    let aligned = this.wrapAngleDeg(wantDeg - boneDeg);
    const flipped = this.wrapAngleDeg(aligned + 180);
    const prevAng = conn.angleDeg;
    if (Math.abs(this.angleDelta(flipped, prevAng)) < Math.abs(this.angleDelta(aligned, prevAng))) {
      aligned = flipped;
    }
    conn.angleDeg = aligned;
    conn.angleVel *= 0.12;
  }

  private integrateLoosePart(
    rig: NephilimRigData,
    index: number,
    p: NephilimPartSim,
    partName: string,
    dt: number,
    map: TileMap,
  ): void {
    if (chainIsConnector(partName)) return;
    const angDamp =
      partName === "head"
        ? LOOSE_ANGLE_DAMP_HEAD
        : partName === "handL" || partName === "handR"
          ? LOOSE_ANGLE_DAMP_HAND
          : LOOSE_ANGLE_DAMP;
    const damp = Math.max(0, 1 - angDamp * dt);
    p.angleVel *= damp;
    p.angleDeg += p.angleVel * dt;
    this.applyAngleWrap(p);
    p.vy += CHAIN_GRAVITY * (this.liftPhase === "RECOVER" ? 0.28 : 1) * dt;
    const linDampRate =
      partName === "head" || partName.startsWith("hand") ? LOOSE_LINEAR_DAMP_EXT : LOOSE_LINEAR_DAMP;
    const linDamp = Math.max(0, 1 - linDampRate * dt);
    p.vx *= linDamp;
    p.vy *= linDamp;
    this.moveLooseWithBounce(rig, index, p, dt, map);
  }

  private settleLooseConnectors(): void {
    this.settleConnectorWhenExtremitySettled("neck", "head");
    this.settleConnectorWhenExtremitySettled("armL", "handL");
    this.settleConnectorWhenExtremitySettled("armR", "handR");
    this.settleConnectorWhenExtremitySettled("connFootL", "footL");
    this.settleConnectorWhenExtremitySettled("connFootR", "footR");
  }

  private settleConnectorWhenExtremitySettled(connName: string, extName: string): void {
    const connIdx = this.indexOf(connName);
    const extIdx = this.indexOf(extName);
    if (connIdx < 0 || extIdx < 0) return;
    const conn = this.partSims[connIdx]!;
    const ext = this.partSims[extIdx]!;
    if (conn.loose && !ext.loose) {
      conn.loose = false;
      conn.angleVel = 0;
    }
  }

  private bodySocketWorld(rig: NephilimRigData, socketPin: string): [number, number] {
    const local = this.chainPin(rig, "body", socketPin);
    const bodyIdx = this.indexOf("body");
    if (bodyIdx < 0) return [this.x, this.y];
    return this.attachPointWorld(rig, bodyIdx, local[0], local[1]);
  }

  private chainPin(rig: NephilimRigData, part: string, pin: string): [number, number] {
    return chainAttach(rig, part, pin, rig.frameW, rig.frameH);
  }

  private gluePartTwoPins(
    rig: NephilimRigData,
    partIdx: number,
    parentLocal: [number, number],
    childLocal: [number, number],
    parentWorldX: number,
    parentWorldY: number,
    childWorldX: number,
    childWorldY: number,
  ): void {
    const p = this.partSims[partIdx]!;
    const m = this.facingMul();
    const wantDx = childWorldX - parentWorldX;
    const wantDy = childWorldY - parentWorldY;
    if (Math.hypot(wantDx, wantDy) < 1e-4) return;
    const wantDeg = (Math.atan2(wantDy, wantDx * m) * 180) / Math.PI;
    const boneDx = (childLocal[0] - parentLocal[0]) * m;
    const boneDy = childLocal[1] - parentLocal[1];
    const boneDeg = (Math.atan2(boneDy, boneDx) * 180) / Math.PI;
    p.angleDeg = this.wrapAngleDeg(wantDeg - boneDeg);
    this.pinPartAttachAt(rig, partIdx, parentLocal[0], parentLocal[1], parentWorldX, parentWorldY);
    p.vx *= 0.15;
    p.vy *= 0.15;
    p.angleVel *= 0.12;
  }

  private attachPointWorld(rig: NephilimRigData, partIdx: number, localX: number, localY: number): [number, number] {
    void rig;
    const p = this.partSims[partIdx]!;
    const m = this.facingMul();
    const lx = localX * m;
    const ly = localY;
    const a = ((m < 0 ? -p.angleDeg : p.angleDeg) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return [p.cx + lx * cos - ly * sin, p.cy + lx * sin + ly * cos];
  }

  private attachPointWorldInterp(
    partIdx: number,
    localX: number,
    localY: number,
    alpha: number,
  ): [number, number] {
    const p = this.partSims[partIdx]!;
    const a = Math.max(0, Math.min(1, alpha));
    const cx = p.prevCx + (p.cx - p.prevCx) * a;
    const cy = p.prevCy + (p.cy - p.prevCy) * a;
    const angleDeg = p.prevAngle + this.angleDelta(p.angleDeg, p.prevAngle) * a;
    const m = this.facingMul();
    const lx = localX * m;
    const ly = localY;
    const rad = ((m < 0 ? -angleDeg : angleDeg) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
  }

  private pinPartAttachAt(
    rig: NephilimRigData,
    partIdx: number,
    localX: number,
    localY: number,
    worldX: number,
    worldY: number,
  ): void {
    const p = this.partSims[partIdx]!;
    const m = this.facingMul();
    const lx = localX * m;
    const ly = localY;
    const a = ((m < 0 ? -p.angleDeg : p.angleDeg) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    p.cx = worldX - (lx * cos - ly * sin);
    p.cy = worldY - (lx * sin + ly * cos);
    void rig;
  }

  private constrainAttachToPin(
    rig: NephilimRigData,
    partIdx: number,
    localX: number,
    localY: number,
    pinX: number,
    pinY: number,
  ): void {
    void rig;
    const p = this.partSims[partIdx]!;
    const attach = this.attachPointWorld(rig, partIdx, localX, localY);
    const dx = attach[0] - pinX;
    const dy = attach[1] - pinY;
    const dist = Math.hypot(dx, dy);
    if (dist <= p.chainLen || dist < 1e-6) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const targetAx = pinX + nx * p.chainLen;
    const targetAy = pinY + ny * p.chainLen;
    p.cx += targetAx - attach[0];
    p.cy += targetAy - attach[1];
    const radial = p.vx * nx + p.vy * ny;
    if (radial > 0) {
      p.vx -= radial * nx * 0.85;
      p.vy -= radial * ny * 0.85;
    }
  }

  private pinDistance(a: [number, number], b: [number, number]): number {
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  private wrapAngleDeg(deg: number): number {
    let d = deg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  private combinedHandHitPose(): HitboxPose | null {
    return this.combinedHandRolePose("hit");
  }

  private combinedGrabBoxPose(): HitboxPose | null {
    return this.combinedHandRolePose("grab") ?? this.combinedHandHitPose();
  }

  private combinedHandRolePose(role: "hit" | "grab"): HitboxPose | null {
    const rig = getNephilimRig();
    if (!rig) return null;
    const worldVerts: number[] = [];
    for (const name of ["handL", "handR"] as const) {
      const idx = this.indexOf(name);
      if (idx < 0) continue;
      const def = rig.parts[idx]!;
      let local: ReadonlyArray<number>;
      if (role === "grab" && def.grab.length >= 6) local = def.grab;
      else if (def.hit.length >= 6) local = def.hit;
      else continue;
      const p = this.partSims[idx]!;
      const m = this.facingMul();
      const poly = transformHull(local, def.pivotX, def.pivotY, p.cx, p.cy, p.angleDeg, m);
      for (let i = 0; i < poly.length; i += 2) worldVerts.push(poly[i]!, poly[i + 1]!);
    }
    if (worldVerts.length < 6) return null;
    return HitboxPoseClass.fromWorldPolygon(worldVerts);
  }

  private snapGrabHoldPoseToFacing(rig: NephilimRigData): void {
    const pose = this.grabPoseName(rig);
    const m = this.facingMul();
    for (let i = 0; i < this.partSims.length; i++) {
      const def = rig.parts[i]!;
      const p = this.partSims[i]!;
      const pe = poseOffset(rig, pose, def.name);
      p.cx = this.x + m * pe.dx;
      p.cy = this.y + pe.dy;
      p.prevCx = p.cx;
      p.prevCy = p.cy;
      p.angleDeg = pe.angleDeg;
      p.prevAngle = p.angleDeg;
      p.vx = 0;
      p.vy = 0;
      p.angleVel = 0;
    }
  }

  // --- Internals -------------------------------------------------------------

  private ensureSims(rig: NephilimRigData): void {
    if (this.partSims.length === rig.parts.length) return;
    this.partSims.length = 0;
    this.simNames.length = 0;
    this.feetBelowAnchorPx = feetBelowAnchorFromRig(rig);
    const m = this.facingMul();
    const pose = this.dormantPoseName(rig);
    for (let i = 0; i < rig.parts.length; i++) {
      const def = rig.parts[i]!;
      const pe = poseOffset(rig, pose, def.name);
      const p: NephilimPartSim = {
        name: def.name,
        cx: this.x + m * pe.dx,
        cy: this.y + pe.dy,
        prevCx: this.x + m * pe.dx,
        prevCy: this.y + pe.dy,
        prevAngle: pe.angleDeg,
        vx: 0,
        vy: 0,
        angleDeg: pe.angleDeg,
        angleVel: 0,
        loose: false,
        looseTimer: 0,
        looseAge: 0,
        bobPhase: i * 1.4,
        chainLen: 0,
      };
      this.partSims.push(p);
      this.simNames.push(def.name);
    }
  }

  private indexOf(name: string): number {
    return this.simNames.indexOf(name);
  }

  private partWorldRoleAabb(
    rig: NephilimRigData,
    index: number,
    role: "hurt" | "hit" | "collision",
  ): Aabb | null {
    const def = rig.parts[index];
    const sim = this.partSims[index];
    if (!def || !sim) return null;
    let local: ReadonlyArray<number>;
    if (role === "hurt") local = def.hurt.length >= 6 ? def.hurt : def.collision;
    else if (role === "hit") local = def.hit.length >= 6 ? def.hit : def.collision;
    else local = def.collision.length >= 6 ? def.collision : def.hurt;
    if (local.length < 6) {
      if (role === "hurt" && def.hurtAabb) return this.aabbFromHurtAabb(def, sim);
      return null;
    }
    const m = this.facingMul();
    const world = transformHull(local, def.pivotX, def.pivotY, sim.cx, sim.cy, sim.angleDeg, m);
    return polygonBounds(world);
  }

  private aabbFromHurtAabb(def: NephilimPartDef, sim: NephilimPartSim): Aabb {
    const hull = def.hurtAabb!;
    const m = this.facingMul();
    const left = sim.cx - def.pivotX;
    const top = sim.cy - def.pivotY;
    let hx0 = hull.minX;
    let hx1 = hull.maxX;
    if (m < 0) {
      hx0 = 2 * def.pivotX - hull.maxX;
      hx1 = 2 * def.pivotX - hull.minX;
    }
    const x0 = left + Math.min(hx0, hx1);
    const x1 = left + Math.max(hx0, hx1);
    return { x: x0, y: top + hull.minY, w: x1 - x0, h: hull.maxY - hull.minY };
  }
}

function inflateHullLocal(local: ReadonlyArray<number>, px: number): number[] {
  if (local.length < 6 || px <= 0) return [...local];
  const n = local.length / 2;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < local.length; i += 2) {
    cx += local[i]!;
    cy += local[i + 1]!;
  }
  cx /= n;
  cy /= n;
  const out: number[] = new Array(local.length);
  for (let i = 0; i < local.length; i += 2) {
    const dx = local[i]! - cx;
    const dy = local[i + 1]! - cy;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      out[i] = local[i]!;
      out[i + 1] = local[i + 1]!;
    } else {
      const scale = (len + px) / len;
      out[i] = cx + dx * scale;
      out[i + 1] = cy + dy * scale;
    }
  }
  return out;
}

function transformHull(
  local: ReadonlyArray<number>,
  pivotX: number,
  pivotY: number,
  cx: number,
  cy: number,
  angleDeg: number,
  m: number,
): number[] {
  // Sim angles are authored facing-left; mirror rotation when flipping X (same as partRenders).
  const a = (((m < 0 ? -angleDeg : angleDeg) * Math.PI) / 180);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const out: number[] = new Array(local.length);
  for (let i = 0; i < local.length; i += 2) {
    const lx = (local[i]! - pivotX) * m;
    const ly = local[i + 1]! - pivotY;
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;
    out[i] = cx + rx;
    out[i + 1] = cy + ry;
  }
  return out;
}
