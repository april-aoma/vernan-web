import type { HitboxPose } from "../collision/HitboxPose";
import {
  aabbOverlap,
  type Aabb,
  type ProjectileStrike,
  type WeaponStrike,
} from "../combat/CombatMath";
import {
  DEFAULT_SHAKE_AMPLITUDE_PX,
  HURT_TINT_PEAK_ALPHA,
  HURT_TINT_SECONDS,
  sampleShake,
} from "../combat/HitlagState";
import {
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
const LOOSE_K = 54;
const LOOSE_C = 2 * Math.sqrt(LOOSE_K);
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
const DEATH_REWARD_DELAY_SEC = 4.0;
const ROOM_MARGIN = 14;
const WALL_REST = 0.7;
const FLOOR_REST = 0.6;
const KNOCKBACK_CONTACT_DISABLE = 0.5;

type LifePhase = "DORMANT" | "AWAKENING" | "NOTICE" | "ACTIVE";

export type NephilimPartSim = {
  name: string;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  angleDeg: number;
  angleVel: number;
  loose: boolean;
  looseTimer: number;
  bobPhase: number;
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
 * Phase 5b Nephilim — grounded marionette boss (intro, stalk, combat, marionette death).
 * MVP: no grab/lift/strings/chain IK; simplified death clear (4s delay).
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
  hitlagShakeX = 0;
  hitlagShakeY = 0;

  private lifePhase: LifePhase = "DORMANT";
  private awakenIdx = 0;
  private awakenTimer = 0;
  private noticeTimer = 0;
  private idleSeqIdx = 0;
  private idleSeqTimer = 0;
  private idleExtraPause = 0;
  private facingRight = false;
  private seesPlayer = false;
  private playerCx = NaN;
  private dir = -1;
  private onGround = true;
  private wasOnGround = true;
  private bobTime = 0;
  private walkPhase = 0;
  private lastHorzStepPx = 0;
  private feetBelowAnchorPx = 20;
  private hitstun = 0;
  private hurtPoseTimer = 0;
  private hurtTintRemaining = 0;
  private knockbackContactTimer = 0;
  private contactActiveTimer = 0;
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

  constructor(anchorX: number, anchorY: number, maxHp: number) {
    this.x = anchorX;
    this.y = anchorY;
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

  setCameraView(_view: WorldRect): void {
    // Reserved for future camera clamp (Java setCameraViewWorld).
  }

  applyVision(player: PlayerCombatSnapshot, seeRadius: number): void {
    this.playerCx = player.cx;
    this.seesPlayer = seesPlayerAt(this.x, this.y, player.cx, player.cy, seeRadius);
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
        armGuardGlowAlpha: 0,
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

    if (this.hitstun > 0) {
      this.hitstun = Math.max(0, this.hitstun - dt);
      this.hitlagShakeX = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
      this.hitlagShakeY = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
    } else {
      this.hitlagShakeX = 0;
      this.hitlagShakeY = 0;
      this.hitlagSolidRed = false;
    }

    if (!this.deathStarted && this.hp <= 0) {
      this.startDeath(rig);
    }

    if (this.deathStarted) {
      this.tickDeath(dt, map, rig);
      this.deathTimer += dt;
      return;
    }

    this.tickLifePhase(dt, rig);

    if (this.lifePhase === "ACTIVE" && this.hitstun <= 0) {
      this.tickGroundMovement(dt, map, rig);
    } else if (this.lifePhase !== "ACTIVE") {
      this.vx = 0;
      this.vy = 0;
      this.onGround = this.isGrounded(map, rig);
    }

    this.bobTime += dt;
    if (
      this.lifePhase === "ACTIVE" &&
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

    const pose = this.currentPoseName(rig);
    if (this.hitstun <= 0) {
      this.integrateParts(dt, map, rig, pose);
    }
  }

  private tickLifePhase(dt: number, rig: NephilimRigData): void {
    switch (this.lifePhase) {
      case "DORMANT":
        if (this.seesPlayer) {
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
      // planted feet reset
    }
    this.wasOnGround = this.onGround;
    this.clampToRoom(map, rig);
  }

  private tickEngageHorzVelocity(dt: number, map: TileMap, rig: NephilimRigData): void {
    if (!this.seesPlayer || !this.onGround || !Number.isFinite(this.playerCx)) {
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
      this.seesPlayer &&
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
      this.lifePhase === "ACTIVE" &&
      this.hurtPoseTimer <= 0 &&
      !this.isHorzWalking() &&
      this.onGround &&
      !poseName.startsWith("walk");
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

    for (let i = 0; i < this.partSims.length; i++) {
      const def = rig.parts[i]!;
      const p = this.partSims[i]!;
      const pe = poseOffset(rig, poseName, def.name);
      let follow = this.partFollowScale(def.name, uncannyIdle);
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
        } else if (this.isConnector(def.name) && !(this.usePlantedStance() && def.name.startsWith("connFoot"))) {
          ang += side * m * stride * 6;
        } else if (def.name === "head") {
          ang += m * stride * 4;
          dy += Math.abs(stride) * 0.5;
        }
      }
      const targetX = this.x + m * dx + bx;
      const targetY = this.y + dy + by;
      const targetAng = ang;

      if (p.loose) {
        if (p.looseTimer > 0) p.looseTimer -= dt;
        const lk = LOOSE_K;
        const lc = LOOSE_C;
        p.vx += ((targetX - p.cx) * lk - p.vx * lc) * dt;
        p.vy += ((targetY - p.cy) * lk - p.vy * lc) * dt;
        p.angleVel += (this.angleDelta(targetAng, p.angleDeg) * ANGLE_K * 0.5 - p.angleVel * ANGLE_C) * dt;
        p.angleDeg += p.angleVel * dt;
        this.moveLooseWithBounce(rig, i, p, dt, map);
        const dist = Math.hypot(targetX - p.cx, targetY - p.cy);
        const sp = Math.hypot(p.vx, p.vy);
        if (p.looseTimer <= 0 && dist < 9 && sp < 42) {
          p.loose = false;
          p.vx *= 0.2;
          p.vy *= 0.2;
          p.angleVel *= 0.2;
        }
        continue;
      }

      const partK = PART_K * follow;
      const partC = PART_C * Math.sqrt(follow);
      const angleK = ANGLE_K * follow;
      const angleC = ANGLE_C * Math.sqrt(follow);
      p.vx += ((targetX - p.cx) * partK - p.vx * partC) * dt;
      p.vy += ((targetY - p.cy) * partK - p.vy * partC) * dt;
      p.angleVel += (this.angleDelta(targetAng, p.angleDeg) * angleK - p.angleVel * angleC) * dt;
      p.angleDeg += p.angleVel * dt;
      p.cx += p.vx * dt;
      p.cy += p.vy * dt;
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
    if (this.isConnector(partName)) return 0.82;
    return 0.92;
  }

  private isConnector(name: string): boolean {
    return name.startsWith("conn") || name === "neck" || name === "armL" || name === "armR";
  }

  private limbSideSign(partName: string): number {
    if (partName.includes("L") || partName.endsWith("L")) return -1;
    if (partName.includes("R") || partName.endsWith("R")) return 1;
    return 0;
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
      p.vx = -p.vx * WALL_REST;
    } else {
      p.cx = nx;
    }
    const ny = p.cy + p.vy * dt;
    if (this.collisionHullHitsSolid(rig, index, p.cx, ny, p.angleDeg, map)) {
      p.vy = -p.vy * FLOOR_REST;
    } else {
      p.cy = ny;
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
    });
  }

  // --- Combat ----------------------------------------------------------------

  rect(): Aabb {
    const rig = getNephilimRig();
    if (!rig) return { x: this.x - 7, y: this.y - 11, w: 14, h: 22 };
    return this.anchorCollisionRect(rig, this.x, this.y) ?? { x: this.x - 7, y: this.y - 11, w: 14, h: 22 };
  }

  contactDamagePose(): Aabb {
    const bodyIdx = this.indexOf("body");
    if (bodyIdx >= 0) {
      const rig = getNephilimRig();
      if (rig) {
        const box = this.partWorldRoleAabb(rig, bodyIdx, "hit");
        if (box) return box;
      }
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
    this.lastStruckParts.length = 0;
    const rig = getNephilimRig();
    if (!rig) return aabbOverlap(sword, this.damageReceivePose());
    let any = false;
    for (let i = 0; i < this.partSims.length; i++) {
      if (this.partScattered?.[i]) continue;
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
    this.onDamaged(strike.freezeFrames);
    const attackerCx = strike.attackerX + strike.attackerW * 0.5;
    this.knockStruckParts(attackerCx, strike.damage, strike.facing);
    if (this.hp <= 0 && !this.deathStarted) {
      const rig = getNephilimRig();
      if (rig) this.startDeath(rig);
    }
    return true;
  }

  intersectsProjectile(projectile: HitboxPose): boolean {
    if (!this.isCombatActive()) return false;
    return projectile.intersectsRect(this.damageReceivePose());
  }

  applyProjectileStrike(strike: ProjectileStrike): boolean {
    if (!this.isCombatActive()) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.onDamaged(strike.freezeFrames);
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
    if (!this.isCombatActive()) return false;
    if (this.contactActiveTimer <= 0) return false;
    if (this.hitstun > 0 || this.knockbackContactTimer > 0) return false;
    return aabbOverlap(playerHurt, this.contactDamagePose());
  }

  contactDamageToPlayer(): number {
    return 1;
  }

  private onDamaged(freezeFrames: number): void {
    const stunSec = Math.max(0, freezeFrames) / 60;
    this.hitstun = Math.max(this.hitstun, stunSec);
    this.hitlagSolidRed = true;
    this.hurtTintRemaining = Math.max(this.hurtTintRemaining, HURT_TINT_SEC);
    this.hurtPoseTimer = HURT_POSE_SEC;
    this.knockbackContactTimer = Math.max(this.knockbackContactTimer, KNOCKBACK_CONTACT_DISABLE);
    this.contactActiveTimer = Math.max(this.contactActiveTimer, 0.4);
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
      this.loosenPart("head", kx, ky, spin * 0.55);
      this.loosenPart("neck", kx, ky, spin * 0.58);
      impx += kx;
      cnt++;
    }
    if (armL) {
      this.loosenPart("armL", kx, ky, -spin * 0.85);
      this.loosenPart("handL", kx, ky, -spin * 0.78);
      impx += kx;
      cnt++;
    }
    if (armR) {
      this.loosenPart("armR", kx, ky, spin * 0.85);
      this.loosenPart("handR", kx, ky, spin * 0.78);
      impx += kx;
      cnt++;
    }
    if (cnt > 0) this.vx += (ANCHOR_TRAIL_FRAC * impx) / cnt;
  }

  private loosenPart(name: string, impX: number, impY: number, spinDeg: number): void {
    const idx = this.indexOf(name);
    if (idx < 0) return;
    const p = this.partSims[idx]!;
    p.loose = true;
    p.looseTimer = Math.max(p.looseTimer, LOOSE_MIN_SEC);
    p.vx += impX;
    p.vy += impY;
    p.angleVel += spinDeg;
  }

  getHealth(): number {
    return Math.max(0, this.hp);
  }

  getMaxHealth(): number {
    return this.maxHp;
  }

  isDying(): boolean {
    return this.deathStarted && this.deathTimer < DEATH_REWARD_DELAY_SEC;
  }

  isOnGround(): boolean {
    return this.onGround;
  }

  isDead(): boolean {
    return this.deathStarted && this.deathTimer >= DEATH_REWARD_DELAY_SEC;
  }

  isInCombatHitstun(): boolean {
    return this.hitstun > 0 || this.knockbackContactTimer > 0;
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

  attackBlockedByShield(_attack: Aabb): boolean {
    return false;
  }

  applyShieldBlockStrike(_strike: WeaponStrike): void {}

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
        vx: 0,
        vy: 0,
        angleDeg: pe.angleDeg,
        angleVel: 0,
        loose: false,
        looseTimer: 0,
        bobPhase: i * 1.4,
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

function transformHull(
  local: ReadonlyArray<number>,
  pivotX: number,
  pivotY: number,
  cx: number,
  cy: number,
  angleDeg: number,
  m: number,
): number[] {
  const a = (angleDeg * Math.PI) / 180;
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
