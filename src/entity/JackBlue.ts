import {
  aabbOverlap,
  knockbackFor,
  knockbackForFrisbee,
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
import { applyStrikeElectrocuteJuice } from "../combat/EnemyHitstunJuice";
import { seesPlayerAt, type PlayerCombatSnapshot, type WorldRect } from "../combat/EnemyVision";
import {
  JACK_BLUE_MAX_HP,
  JACK_BLUE_PATROL_FLIP_COOLDOWN_SEC,
  JACK_BLUE_SUPPRESS_LEDGE_AFTER_WALL_SEC,
} from "../config/CombatStats";
import {
  ENEMY_JACK_BLUE_HIT_LOCAL,
  ENEMY_JACK_BLUE_HIT_PIVOT_X,
  ENEMY_JACK_BLUE_HURT_LOCAL,
  ENEMY_JACK_BLUE_HURT_PIVOT_X,
  ENEMY_JACK_BLUE_LOCAL,
  ENEMY_JACK_BLUE_PIVOT_X,
  ENEMY_JACK_BLUE_SHIELD_LOCAL,
  ENEMY_JACK_BLUE_SHIELD_PIVOT_X,
} from "../config/HitboxValues";
import {
  feetCrossedOntoFloorThisStep,
  nudgePenismanEmbedAfterMove,
  resolveHorizontalPolygonEnemy,
  resolveVerticalPolygonEnemy,
} from "../collision/EnemyCollision";
import { HitboxPose } from "../collision/HitboxPose";
import { GRAVITY, MAX_FALL } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { isGrounded, solidUnderFootAhead } from "./EnemyPeerPlatforms";
import type { PeerWalkingEnemy } from "./PeerWalkingEnemy";
import type { PeerRidingBehavior } from "./PeerRidingBehavior";
import { JackBlueBone } from "./JackBlueBone";
import { SquashStretch } from "../render/SquashStretch";
import { HURT_TINT_PEAK_ALPHA, HURT_TINT_SECONDS } from "../combat/HitlagState";
import {
  createPatrolWallFlipState,
  tickWallFlipReady,
} from "./EnemyPatrolWallFlip";
import { BRICKCHUNK_SPAWN_OMEGA_RAD_PER_SEC } from "../config/Physics";
import { JavaRandom, toJavaLong } from "../util/JavaRandom";

export type JackBlueBoneBreakRequest = { cx: number; cy: number; facingSign: number };

export type JackBlueDeathChunkSpawn = {
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  angle: number;
  omega: number;
  subX: number;
  subY: number;
};

export type JackBlueExplosionSpawn = { cx: number; cy: number; delaySec: number };

export type JackBlueShieldDropRequest = {
  itemId: string;
  anchorX: number;
  groundTop: number;
};

const SHIELD_DROP_CHANCE = 0.005;
const SHIELD_DROP_SEED_SALT = 0x5113d00n;

function doubleToLongBits(n: number): bigint {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, n, false);
  const dv = new DataView(buf);
  return toJavaLong((BigInt(dv.getUint32(0, false)) | (BigInt(dv.getUint32(4, false)) << 32n)));
}

const PATROL_SPEED = 16;
const APPROACH_SPEED = 32;
const RETREAT_SPEED = 64;
const GROUND_ACCEL = 72;
const GROUND_BRAKE = 200;
const GROUND_FRICTION = 140;
const SPRITE_FRAME_W = 32;
const SPRITE_FRAME_H = 32;
const BONE_SPAWN_FRAME_X = 4;
const BONE_SPAWN_FRAME_Y = 14;
const KEEPAWAY_PX = 4 * TILE_SIZE;
const WIGGLE_HALF_PX = TILE_SIZE * 0.5;
const WIGGLE_DIR_MIN_HOLD_FRAMES = 10;
const WIGGLE_ENTER_SLACK_PX = 8;
const WIGGLE_EXIT_SLACK_PX = 16;
const LOW_HP_FRACTION = 3 / 8;
const BONE_THROW_CHANCE_PER_TICK = 0.005;
const THROW_FRAME_SEC = 0.22;
const BONE_THROW_STRETCH_Y = 1.1;
const BONE_THROW_WINDUP_SQUASH_X = 1.1;
const BONE_THROW_WINDUP_FRAMES = 10;
const KNOCK_VERT_TO_HORIZ_FRAC = 0.9;
const SPAWN_FLOOR_EPS_PX = 0.5;
const COLLISION_FEET_LOCAL_Y = 13;

function rectContainsFully(outer: WorldRect, inner: Aabb): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/**
 * Shielded skirmisher (Java JackBlue.java): dormant patrol → vision wake → keep-away wiggle + bones.
 */
export class JackBlue implements PeerWalkingEnemy {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  onGround = false;
  patrolDir = -1;
  hp: number;
  readonly maxHp: number;

  private seesPlayer = false;
  private activated = false;
  private wiggleAnchorX = Number.NaN;
  private wiggleMoveDir = 1;
  private wiggleDirHoldFrames = 0;
  private wiggleActive = false;
  private throwAnimSec = 0;
  private throwWindupFramesRemaining = 0;
  private cameraViewWorld: WorldRect | null = null;
  private readonly bones: JackBlueBone[] = [];
  private desiredGroundVx = 0;
  hitstun = 0;
  private shieldClangSec = 0;
  private shieldKnockReleasePending = false;
  private pendingKnockVx = 0;
  private pendingKnockVy = 0;
  private hurtLocked = false;
  private animFrame = 0;
  private animAccum = 0;
  private deathChunksPrepared = false;
  private deathLootSeed: bigint;
  private readonly chunkRng: JavaRandom;
  private readonly boneBreakRequests: JackBlueBoneBreakRequest[] = [];
  private readonly pendingDeathChunks: JackBlueDeathChunkSpawn[] = [];
  private readonly pendingDeathExplosions: JackBlueExplosionSpawn[] = [];
  private pendingShieldDrop: JackBlueShieldDropRequest | null = null;
  private horizontalWallResolvedThisStep = false;
  private patrolFlipCooldownSec = 0;
  private suppressLedgeFlipRemainSec = 0;
  private readonly patrolWallFlipState = createPatrolWallFlipState();
  private knockbackLandingSquashPending = false;
  private peerCarryAnchorX = 0;
  private peerCarryAnchorY = 0;
  private peerCarrierThisTick: CombatEnemy | null = null;

  readonly squash = new SquashStretch();
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  hitlagSolidRed = false;
  hitlagElectrocute = false;
  private hurtTintRemaining = 0;
  readonly blackHeartBeat = new BlackHeartBeatDeferral();

  constructor(x: number, y: number, maxHp = JACK_BLUE_MAX_HP) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.deathLootSeed = doubleToLongBits(x) ^ doubleToLongBits(y);
    this.chunkRng = new JavaRandom(this.deathLootSeed ^ 0x6a09e667n);
  }

  static onGround(anchorX: number, groundTopWorldY: number, maxHp = JACK_BLUE_MAX_HP): JackBlue {
    return new JackBlue(
      anchorX,
      groundTopWorldY - COLLISION_FEET_LOCAL_Y - SPAWN_FLOOR_EPS_PX,
      maxHp,
    );
  }

  private collisionFacingSign(): number {
    return -this.patrolDir;
  }

  getAnimFrame(): number {
    if (this.throwAnimSec > 0) return 2;
    return this.animFrame;
  }

  isThrowing(): boolean {
    return this.throwAnimSec > 0 || this.throwWindupFramesRemaining > 0;
  }

  setCameraView(view: WorldRect): void {
    this.cameraViewWorld = view;
  }

  applyVision(snap: PlayerCombatSnapshot, seeRadius: number): void {
    const br = this.rect();
    const nowSees = seesPlayerAt(
      br.x + br.w * 0.5,
      br.y + br.h * 0.5,
      snap.cx,
      snap.cy,
      seeRadius,
    );
    this.seesPlayer = nowSees;
    if (nowSees) {
      if (!this.activated) this.faceToward(snap.cx);
      this.activated = true;
    }
  }

  bonesCopy(): readonly JackBlueBone[] {
    return this.bones;
  }

  update(dt: number, map: TileMap, playerX: number, roomEnemies: readonly CombatEnemy[] = []): void {
    this.squash.tick(dt);
    this.throwAnimSec = Math.max(0, this.throwAnimSec - dt);
    if (this.throwWindupFramesRemaining > 0) {
      this.throwWindupFramesRemaining--;
      if (this.throwWindupFramesRemaining === 0) this.releaseBoneThrow();
    }
    this.tickBones(dt, map);

    if (this.hurtTintRemaining > 0) {
      this.hurtTintRemaining = Math.max(0, this.hurtTintRemaining - dt);
    }
    this.patrolFlipCooldownSec = Math.max(0, this.patrolFlipCooldownSec - dt);
    this.suppressLedgeFlipRemainSec = Math.max(0, this.suppressLedgeFlipRemainSec - dt);
    if (this.shieldClangSec > 0) this.shieldClangSec = Math.max(0, this.shieldClangSec - dt);

    if (this.hp <= 0) {
      this.prepareDeathFxIfNeeded();
      this.bones.length = 0;
      if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
        tickBlackHeartEnemyHitstun(dt, this);
      }
      return;
    }

    if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
      const hadHitstun = this.hitstun > 0;
      tickBlackHeartEnemyHitstun(dt, this);
      if (hadHitstun && this.hitstun <= 0 && !this.blackHeartBeat.isLocked()) {
        this.finishHitstunKnockRelease();
      }
      if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
        this.vx = 0;
        this.vy = 0;
        return;
      }
    }

    const wasAirborneBeforeMove = !this.onGround || this.knockbackLandingSquashPending;
    this.onGround = isGrounded(this, map, roomEnemies);

    if (!this.hurtLocked) {
      if (!this.onGround) {
        if (this.hitstun <= 0) this.vx = 0;
      } else if (this.activated) {
        this.tickActiveMovement(playerX, map);
        this.applyGroundHorizontal(dt);
      } else {
        this.desiredGroundVx = this.patrolDir * PATROL_SPEED;
        this.clampDesiredVxAwayFromWall(map);
        this.applyGroundHorizontal(dt);
      }
      if (this.canThrowBoneAt(playerX)) this.tryThrowBone();
    }

    const hullBeforeStep = this.rect();
    const prevFeetBottom = hullBeforeStep.y + hullBeforeStep.h;
    const vyBeforeGravity = this.vy;
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;

    const landed = this.moveAndCollide(dt, map, roomEnemies);
    const feetCrossedFloor = feetCrossedOntoFloorThisStep(
      map,
      this,
      roomEnemies,
      this.vy,
      prevFeetBottom,
    );
    this.onGround = isGrounded(this, map, roomEnemies);

    if ((landed || feetCrossedFloor) && wasAirborneBeforeMove) {
      this.squash.applyStretchX(1.2, Math.abs(vyBeforeGravity) >= 24 ? 20 : 5);
      this.knockbackLandingSquashPending = false;
    }
    if (this.hurtLocked && landed) this.hurtLocked = false;

    const wallPatrolFlip = tickWallFlipReady(
      this.patrolWallFlipState,
      this.rect(),
      map,
      this.patrolDir,
      this.horizontalWallResolvedThisStep,
      this.patrolFlipCooldownSec <= 0,
    );

    if (solidUnderFootAhead(this, map, roomEnemies, this.patrolDir)) {
      this.suppressLedgeFlipRemainSec = 0;
    }

    if (!this.activated && !this.hurtLocked && this.onGround && this.patrolFlipCooldownSec <= 0) {
      if (!solidUnderFootAhead(this, map, roomEnemies, this.patrolDir)) {
        if (this.suppressLedgeFlipRemainSec <= 0) {
          this.patrolDir *= -1;
          this.patrolFlipCooldownSec = JACK_BLUE_PATROL_FLIP_COOLDOWN_SEC;
        }
      } else if (wallPatrolFlip) {
        const away = -this.patrolDir;
        this.patrolDir = away;
        this.patrolFlipCooldownSec = JACK_BLUE_PATROL_FLIP_COOLDOWN_SEC;
        this.suppressLedgeFlipRemainSec = JACK_BLUE_SUPPRESS_LEDGE_AFTER_WALL_SEC;
      }
    }

    this.tickAnim(dt);
  }

  private tickBones(dt: number, map: TileMap): void {
    for (let i = this.bones.length - 1; i >= 0; i--) {
      const b = this.bones[i]!;
      if (!b.alive) {
        this.bones.splice(i, 1);
        continue;
      }
      if (b.update(dt, map)) {
        this.boneBreakRequests.push({
          cx: b.centerX(),
          cy: b.centerY(),
          facingSign: b.facingSign(),
        });
        this.bones.splice(i, 1);
      }
    }
  }

  private faceToward(playerCenterX: number): void {
    const br = this.rect();
    const cx = br.x + br.w * 0.5;
    if (playerCenterX > cx + 1) this.patrolDir = 1;
    else if (playerCenterX < cx - 1) this.patrolDir = -1;
  }

  private isLowHp(): boolean {
    return this.hp <= this.maxHp * LOW_HP_FRACTION + 1e-6;
  }

  private tickActiveMovement(playerX: number, map: TileMap): void {
    const br = this.rect();
    const cx = br.x + br.w * 0.5;
    this.faceToward(playerX);
    if (this.isLowHp()) {
      this.wiggleActive = false;
      this.desiredGroundVx = playerX >= cx ? APPROACH_SPEED : -APPROACH_SPEED;
      this.clampDesiredVxAwayFromWall(map);
      return;
    }
    const dist = Math.abs(playerX - cx);
    if (!this.wiggleActive) {
      if (dist <= KEEPAWAY_PX + WIGGLE_ENTER_SLACK_PX && dist >= KEEPAWAY_PX - WIGGLE_ENTER_SLACK_PX) {
        this.wiggleActive = true;
        this.wiggleAnchorX = cx;
        this.wiggleDirHoldFrames = 0;
        if (Math.abs(this.wiggleMoveDir) !== 1) {
          this.wiggleMoveDir = cx >= playerX ? 1 : -1;
        }
      }
    }
    if (this.wiggleActive) {
      if (dist > KEEPAWAY_PX + WIGGLE_EXIT_SLACK_PX) {
        this.wiggleActive = false;
        this.desiredGroundVx = playerX >= cx ? APPROACH_SPEED : -APPROACH_SPEED;
        this.clampDesiredVxAwayFromWall(map);
      } else if (dist < KEEPAWAY_PX - WIGGLE_EXIT_SLACK_PX) {
        this.wiggleActive = false;
        this.desiredGroundVx = playerX >= cx ? -RETREAT_SPEED : RETREAT_SPEED;
        this.clampDesiredVxAwayFromWall(map);
      } else {
        this.tickWiggleMovement(map, cx);
      }
      return;
    }
    if (dist > KEEPAWAY_PX + WIGGLE_ENTER_SLACK_PX) {
      this.desiredGroundVx = playerX >= cx ? APPROACH_SPEED : -APPROACH_SPEED;
      this.clampDesiredVxAwayFromWall(map);
    } else if (dist < KEEPAWAY_PX - WIGGLE_ENTER_SLACK_PX) {
      this.desiredGroundVx = playerX >= cx ? -RETREAT_SPEED : RETREAT_SPEED;
      this.clampDesiredVxAwayFromWall(map);
    } else {
      this.wiggleActive = true;
      this.wiggleAnchorX = cx;
      this.wiggleDirHoldFrames = 0;
      this.tickWiggleMovement(map, cx);
    }
  }

  private tickWiggleMovement(map: TileMap, cx: number): void {
    if (Number.isNaN(this.wiggleAnchorX)) this.wiggleAnchorX = cx;
    if (this.wiggleDirHoldFrames > 0) this.wiggleDirHoldFrames--;
    const leftBound = this.wiggleAnchorX - WIGGLE_HALF_PX;
    const rightBound = this.wiggleAnchorX + WIGGLE_HALF_PX;
    if (cx >= rightBound - 0.25) {
      this.wiggleMoveDir = -1;
      this.wiggleDirHoldFrames = WIGGLE_DIR_MIN_HOLD_FRAMES;
    } else if (cx <= leftBound + 0.25) {
      this.wiggleMoveDir = 1;
      this.wiggleDirHoldFrames = WIGGLE_DIR_MIN_HOLD_FRAMES;
    } else if (this.wiggleDirHoldFrames <= 0) {
      this.wiggleMoveDir = -this.wiggleMoveDir;
      this.wiggleDirHoldFrames = WIGGLE_DIR_MIN_HOLD_FRAMES;
    }
    this.desiredGroundVx = this.wiggleMoveDir * APPROACH_SPEED;
    this.clampDesiredVxAwayFromWall(map);
  }

  private clampDesiredVxAwayFromWall(map: TileMap): void {
    if (Math.abs(this.desiredGroundVx) < 1e-6) return;
    const moveSign = this.desiredGroundVx > 0 ? 1 : -1;
    const r = this.rect();
    const probeX = moveSign > 0 ? r.x + r.w + 1 : r.x - 1;
    const tx = Math.floor(probeX / TILE_SIZE);
    const footTy = Math.floor((r.y + r.h - 1) / TILE_SIZE);
    const headTy = Math.floor((r.y + 1) / TILE_SIZE);
    for (let ty = headTy; ty <= footTy; ty++) {
      if (map.isSolidTile(tx, ty)) {
        this.desiredGroundVx = 0;
        return;
      }
    }
  }

  private applyGroundHorizontal(dt: number): void {
    const target = this.desiredGroundVx;
    if (Math.abs(target) > 1e-6) {
      if (Math.sign(this.vx) !== Math.sign(target) && Math.abs(this.vx) > 1e-6) {
        this.vx = moveToward(this.vx, target, GROUND_BRAKE * dt);
      } else {
        this.vx = moveToward(this.vx, target, GROUND_ACCEL * dt);
      }
    } else {
      this.vx = moveToward(this.vx, 0, GROUND_FRICTION * dt);
    }
  }

  private canThrowBoneAt(playerX: number): boolean {
    if (!this.activated || !this.seesPlayer || this.isThrowing()) return false;
    if (this.cameraViewWorld && !rectContainsFully(this.cameraViewWorld, this.rect())) return false;
    const br = this.rect();
    const cx = br.x + br.w * 0.5;
    return Math.abs(playerX - cx) <= KEEPAWAY_PX + 1;
  }

  private tryThrowBone(): void {
    if (Math.random() >= BONE_THROW_CHANCE_PER_TICK) return;
    this.throwWindupFramesRemaining = BONE_THROW_WINDUP_FRAMES;
    this.squash.applyStretchXHeld(BONE_THROW_WINDUP_SQUASH_X, BONE_THROW_WINDUP_FRAMES);
  }

  private releaseBoneThrow(): void {
    this.throwAnimSec = THROW_FRAME_SEC;
    this.animFrame = 2;
    this.squash.applyStretchY(BONE_THROW_STRETCH_Y);
    const mouth = this.frameLocalToBodyLocal(BONE_SPAWN_FRAME_X, BONE_SPAWN_FRAME_Y);
    const worldCx = this.localXToWorld(mouth[0], this.x);
    const worldCy = this.localYToWorld(mouth[1], this.y);
    const spawnX = worldCx - JackBlueBone.FRAME_W * 0.5;
    const spawnY = worldCy - JackBlueBone.FRAME_H * 0.5;
    this.bones.push(new JackBlueBone(spawnX, spawnY, this.patrolDir));
  }

  private spriteFrameTopLeftLocal(): [number, number] {
    const data = ENEMY_JACK_BLUE_LOCAL;
    let minX = data[0]!;
    let maxX = data[0]!;
    let maxY = data[1]!;
    for (let i = 2; i < data.length; i += 2) {
      minX = Math.min(minX, data[i]!);
      maxX = Math.max(maxX, data[i]!);
      maxY = Math.max(maxY, data[i + 1]!);
    }
    const cx = (minX + maxX) * 0.5;
    return [cx - SPRITE_FRAME_W * 0.5, maxY - SPRITE_FRAME_H];
  }

  private frameLocalToBodyLocal(frameX: number, frameY: number): [number, number] {
    const tl = this.spriteFrameTopLeftLocal();
    return [frameX + tl[0], frameY + tl[1]];
  }

  private localXToWorld(lx: number, anchorX: number): number {
    const fs = this.collisionFacingSign();
    const pivot = ENEMY_JACK_BLUE_PIVOT_X;
    let lx2 = lx;
    if (fs < 0) lx2 = 2 * pivot - lx2;
    return anchorX + lx2;
  }

  private localYToWorld(ly: number, anchorY: number): number {
    return anchorY + ly;
  }

  private tickAnim(dt: number): void {
    if (this.isThrowing()) return;
    const frameSeconds = this.onGround ? 0.14 : 0.07;
    this.animAccum += dt;
    while (this.animAccum >= frameSeconds) {
      this.animAccum -= frameSeconds;
      this.animFrame = (this.animFrame + 1) % 2;
    }
  }

  private finishHitstunKnockRelease(): void {
    if (this.hp <= 0) return;
    const converted = this.jackKnockConverted({
      vx: this.pendingKnockVx,
      vy: this.pendingKnockVy,
    });
    this.vx = converted.vx;
    this.vy = converted.vy;
    this.pendingKnockVx = 0;
    this.pendingKnockVy = 0;
    if (!this.shieldKnockReleasePending) {
      this.hurtTintRemaining = HURT_TINT_SECONDS;
    }
    this.shieldKnockReleasePending = false;
    this.hurtLocked = true;
    this.knockbackLandingSquashPending = true;
    if (Math.abs(this.vx) + Math.abs(this.vy) > 1) this.onGround = false;
  }

  private jackKnockConverted(raw: { vx: number; vy: number }): { vx: number; vy: number } {
    const { vx: kx, vy: ky } = raw;
    if (Math.abs(ky) < 1e-9) return raw;
    const horizAdd = Math.abs(ky) * KNOCK_VERT_TO_HORIZ_FRAC;
    const vertLeft = Math.abs(ky) * (1 - KNOCK_VERT_TO_HORIZ_FRAC);
    const hSign = Math.abs(kx) > 1e-9 ? Math.sign(kx) : this.patrolDir || 1;
    return { vx: kx + hSign * horizAdd, vy: Math.sign(ky) * vertLeft };
  }

  private jackPose(
    local: ReadonlyArray<number>,
    pivotLocalX: number,
    ax = this.x,
    ay = this.y,
  ): HitboxPose {
    return new HitboxPose(local, ax, ay, this.collisionFacingSign(), pivotLocalX);
  }

  shieldBlockPose(): HitboxPose {
    return this.jackPose(ENEMY_JACK_BLUE_SHIELD_LOCAL, ENEMY_JACK_BLUE_SHIELD_PIVOT_X);
  }

  hitboxPose(): HitboxPose {
    return this.jackPose(ENEMY_JACK_BLUE_LOCAL, ENEMY_JACK_BLUE_PIVOT_X);
  }

  rect(): Aabb {
    return this.hitboxPose().bounds();
  }

  contactDamagePose(): Aabb {
    return this.jackPose(ENEMY_JACK_BLUE_HIT_LOCAL, ENEMY_JACK_BLUE_HIT_PIVOT_X).bounds();
  }

  damageReceivePose(): Aabb {
    return this.jackPose(ENEMY_JACK_BLUE_HURT_LOCAL, ENEMY_JACK_BLUE_HURT_PIVOT_X).bounds();
  }

  private swordIntersectsShield(sword: Aabb): boolean {
    return this.shieldBlockPose().intersectsRect(sword);
  }

  intersectsAttack(sword: Aabb): boolean {
    if (this.isDead()) return false;
    if (this.swordIntersectsShield(sword)) return false;
    return this.jackPose(ENEMY_JACK_BLUE_HURT_LOCAL, ENEMY_JACK_BLUE_HURT_PIVOT_X).intersectsRect(
      sword,
    );
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (this.hp <= 0) return false;
    if (this.hitstun > 0 && strike.knockKind !== "black_heart_burst") return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    if (this.hp <= 0) this.prepareDeathFxIfNeeded();
    if (strike.knockKind === "black_heart_burst") {
      this.hitstun = queueBlackHeartBurstKnock(this.blackHeartBeat, strike, this.hitstun);
      this.hurtTintRemaining = HURT_TINT_SECONDS;
      return true;
    }
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    applyStrikeElectrocuteJuice(strike, this);
    const r = this.rect();
    const away = r.x + r.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = this.jackKnockConverted(knockbackFor(strike.knockKind, away));
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
    this.vx = 0;
    this.vy = 0;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    return true;
  }

  releaseBlackHeartBeatKnockback(): void {
    releaseBlackHeartBeatKnockback(this.blackHeartBeat, (vx, vy) => {
      const kb = this.jackKnockConverted({ vx, vy });
      this.pendingKnockVx = kb.vx;
      this.pendingKnockVy = kb.vy;
      this.finishHitstunKnockRelease();
    });
  }

  isBlackHeartBeatLocked(): boolean {
    return this.blackHeartBeat.isLocked();
  }

  intersectsProjectile(projectile: HitboxPose): boolean {
    if (this.isDead()) return false;
    if (this.projectileBlockedByShield(projectile)) return false;
    return projectile.intersectsRect(this.damageReceivePose());
  }

  applyProjectileStrike(strike: ProjectileStrike): boolean {
    if (this.hp <= 0 || this.hitstun > 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    if (this.hp <= 0) this.prepareDeathFxIfNeeded();
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    const kb = this.jackKnockConverted(knockbackForFrisbee(strike.projectileVelX));
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
    this.vx = 0;
    this.vy = 0;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    return true;
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (
      this.isDead() ||
      !this.activated ||
      this.hitstun > 0 ||
      this.blackHeartBeat.isLocked() ||
      this.hurtLocked
    ) {
      return false;
    }
    return aabbOverlap(playerHurt, this.contactDamagePose());
  }

  contactDamageToPlayer(): number {
    return 1;
  }

  getHealth(): number {
    return this.hp;
  }

  getMaxHealth(): number {
    return this.maxHp;
  }

  isDead(): boolean {
    return this.hp <= 0 && this.hitstun <= 0;
  }

  blocksRoomClear(): boolean {
    return !(this.hp <= 0 && this.hitstun <= 0);
  }

  attackBlockedByShield(attack: Aabb): boolean {
    if (this.isDead()) return false;
    return this.swordIntersectsShield(attack);
  }

  applyShieldBlockStrike(strike: WeaponStrike): void {
    if (this.isDead()) return;
    this.shieldClangSec = Math.max(this.shieldClangSec, strike.freezeFrames / 60);
    this.hitstun = Math.max(this.hitstun, strike.freezeFrames / 60);
    this.hitlagSolidRed = false;
    this.shieldKnockReleasePending = true;
    const r = this.rect();
    const away = r.x + r.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = this.jackKnockConverted(knockbackFor(strike.knockKind, away));
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
  }

  projectileBlockedByShield(projectile: HitboxPose): boolean {
    return this.shieldBlockPose().intersects(projectile);
  }

  applyProjectileShieldBlock(strike: ProjectileStrike): void {
    if (this.isDead()) return;
    this.shieldClangSec = Math.max(this.shieldClangSec, strike.freezeFrames / 60);
    this.hitstun = Math.max(this.hitstun, strike.freezeFrames / 60);
    this.hitlagSolidRed = false;
    this.shieldKnockReleasePending = true;
    this.pendingKnockVx = 0;
    this.pendingKnockVy = 0;
  }

  isInCombatHitstun(): boolean {
    return this.hitstun > 0 || this.blackHeartBeat.isLocked();
  }

  facingSign(): number {
    return this.collisionFacingSign();
  }

  hurtTintAlpha(): number {
    if (this.shieldClangSec > 0) return 0;
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SECONDS));
  }

  suppressDeathExplosion(): boolean {
    return true;
  }

  isDeathScatterActive(): boolean {
    return this.deathChunksPrepared;
  }

  prepareDeathFxIfNeeded(): void {
    if (this.deathChunksPrepared || this.hp > 0) return;
    this.deathChunksPrepared = true;
    this.queueDeathChunksFromSprite();
  }

  drainBoneBreakRequests(): JackBlueBoneBreakRequest[] {
    if (this.boneBreakRequests.length === 0) return [];
    const out = [...this.boneBreakRequests];
    this.boneBreakRequests.length = 0;
    return out;
  }

  drainDeathChunkSpawns(): JackBlueDeathChunkSpawn[] {
    if (this.pendingDeathChunks.length === 0) return [];
    const out = [...this.pendingDeathChunks];
    this.pendingDeathChunks.length = 0;
    return out;
  }

  drainDeathExplosionSpawns(): JackBlueExplosionSpawn[] {
    if (this.pendingDeathExplosions.length === 0) return [];
    const out = [...this.pendingDeathExplosions];
    this.pendingDeathExplosions.length = 0;
    return out;
  }

  rollShieldDropOnDeath(vernanHasShield: boolean, runSeed: bigint, roomId: number): void {
    if (vernanHasShield || this.pendingShieldDrop) return;
    const seed = toJavaLong(runSeed ^ BigInt(roomId) ^ this.deathLootSeed ^ SHIELD_DROP_SEED_SALT);
    const rng = new JavaRandom(seed);
    if (rng.nextDouble() >= SHIELD_DROP_CHANCE) return;
    const r = this.rect();
    this.pendingShieldDrop = {
      itemId: "SHIELD",
      anchorX: r.x + r.w * 0.5,
      groundTop: 0,
    };
  }

  drainShieldDropRequest(): JackBlueShieldDropRequest | null {
    const out = this.pendingShieldDrop;
    this.pendingShieldDrop = null;
    return out;
  }

  setDeathLootSeed(seed: bigint): void {
    this.deathLootSeed = toJavaLong(seed);
  }

  private queueDeathChunksFromSprite(): void {
    const b = this.rect();
    const spriteLeft = b.x + b.w * 0.5 - SPRITE_FRAME_W * 0.5;
    const spriteTop = b.y + b.h - SPRITE_FRAME_H;
    const faceRight = this.facingHintVelX() >= 0;
    const cols = [8, 16];
    const stagger = 0.04;
    let order = 0;
    for (const col of cols) {
      for (let row = 0; row < 4; row++) {
        const subX = faceRight ? col : SPRITE_FRAME_W - col - 8;
        const ox = spriteLeft + col;
        const oy = spriteTop + row * 8;
        const impulse = this.chunkImpulse(order++);
        this.pendingDeathChunks.push({
          ox,
          oy,
          vx: impulse.vx,
          vy: impulse.vy,
          angle: impulse.angle,
          omega: impulse.omega,
          subX,
          subY: row * 8,
        });
        this.pendingDeathExplosions.push({
          cx: ox + 4,
          cy: oy + 8,
          delaySec: stagger * order,
        });
      }
    }
  }

  private chunkImpulse(idx: number): { vx: number; vy: number; angle: number; omega: number } {
    const a = idx * 1.7;
    return {
      vx: (this.chunkRng.nextDouble() - 0.5) * 120 + Math.sin(a) * 40,
      vy: (-this.chunkRng.nextDouble() * 90 - 20) - idx * 4,
      angle: (this.chunkRng.nextDouble() - 0.5) * 0.35,
      omega: (this.chunkRng.nextDouble() - 0.5) * 2 * BRICKCHUNK_SPAWN_OMEGA_RAD_PER_SEC,
    };
  }

  peerRidingBehavior(): PeerRidingBehavior {
    return "full_ai";
  }

  simulationVx(): number {
    return this.vx;
  }

  capturePeerCarryAnchor(): void {
    this.peerCarryAnchorX = this.x;
    this.peerCarryAnchorY = this.y;
  }

  peerCarryDeltaX(): number {
    return this.x - this.peerCarryAnchorX;
  }

  peerCarryDeltaY(): number {
    return this.y - this.peerCarryAnchorY;
  }

  translateWorld(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  facingHintVelX(): number {
    return this.patrolDir * Math.max(PATROL_SPEED, Math.abs(this.vx));
  }

  flipPatrolDirection(): void {
    if (this.activated && this.wiggleActive && !this.isLowHp()) {
      this.wiggleMoveDir = -this.wiggleMoveDir;
      this.wiggleDirHoldFrames = WIGGLE_DIR_MIN_HOLD_FRAMES;
      this.desiredGroundVx = this.wiggleMoveDir * APPROACH_SPEED;
      return;
    }
    this.patrolDir *= -1;
    this.patrolFlipCooldownSec = JACK_BLUE_PATROL_FLIP_COOLDOWN_SEC;
    this.suppressLedgeFlipRemainSec = JACK_BLUE_SUPPRESS_LEDGE_AFTER_WALL_SEC;
    if (this.onGround && !this.hurtLocked) {
      this.desiredGroundVx = this.patrolDir * (this.activated ? APPROACH_SPEED : PATROL_SPEED);
    }
  }

  isOnGround(): boolean {
    return this.onGround;
  }

  isJumpSquatting(): boolean {
    return false;
  }

  canServeAsPeerPlatform(): boolean {
    return !this.isDead() && !this.isInCombatHitstun();
  }

  isKuriboStompCorpseActive(): boolean {
    return false;
  }

  collisionPoseAt(ax: number, ay: number): HitboxPose {
    return this.jackPose(ENEMY_JACK_BLUE_LOCAL, ENEMY_JACK_BLUE_PIVOT_X, ax, ay);
  }

  setPeerCarrierForTick(carrier: CombatEnemy | null): void {
    this.peerCarrierThisTick = carrier;
  }

  peerCarrierForTick(): CombatEnemy | null {
    return this.peerCarrierThisTick;
  }

  applyPeerRidingVelocity(carrierVx: number, carrierVy: number): void {
    this.vx = carrierVx;
    this.vy = carrierVy;
  }

  private moveAndCollide(
    dt: number,
    map: TileMap,
    peers: readonly CombatEnemy[],
  ): boolean {
    this.horizontalWallResolvedThisStep = false;
    const poseAt = (ax: number, ay: number) =>
      this.jackPose(ENEMY_JACK_BLUE_LOCAL, ENEMY_JACK_BLUE_PIVOT_X, ax, ay);
    const anchorX0 = this.x;
    const anchorY0 = this.y;
    const xBefore = this.x;
    this.x += this.vx * dt;
    if (this.shouldResolveHorizontal(map, peers)) {
      const horz = resolveHorizontalPolygonEnemy(map, poseAt, xBefore, this.x, this.y, this.vx);
      this.x = horz.x;
      this.vx = horz.vx;
      this.horizontalWallResolvedThisStep = horz.wallResolved;
    }

    const before = this.hitboxPose().bounds();
    const prevBottom = before.y + before.h;
    const prevTop = before.y;
    const yBefore = this.y;
    this.y += this.vy * dt;

    const vert = resolveVerticalPolygonEnemy(
      map,
      poseAt,
      this,
      peers,
      this.x,
      yBefore,
      this.y,
      this.vy,
      prevBottom,
      prevTop,
    );
    this.y = vert.y;
    this.vy = vert.vy;

    const nudged = nudgePenismanEmbedAfterMove(map, poseAt, anchorX0, anchorY0, this.x, this.y);
    this.x = nudged.x;
    this.y = nudged.y;
    if (nudged.clearVx) this.vx = 0;
    return vert.landed;
  }

  private shouldResolveHorizontal(map: TileMap, peers: readonly CombatEnemy[]): boolean {
    if (this.vx === 0) return false;
    const dir = this.vx > 0 ? 1 : -1;
    if (!solidUnderFootAhead(this, map, peers, dir)) return false;
    return this.onGround;
  }
}
