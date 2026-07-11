import {
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
import { seesPlayerWithSolidLos } from "../combat/SolidLineOfSight";
import type { WorldRect } from "../combat/EnemyVision";
import {
  MULTILIMBER_MAX_HP,
  MULTILIMBER_PATROL_FLIP_COOLDOWN_SEC,
  MULTILIMBER_SUPPRESS_LEDGE_AFTER_WALL_SEC,
} from "../config/CombatStats";
import {
  ENEMY_MULTILIMBER_EDITOR_FEET_LOCAL_Y,
  ENEMY_MULTILIMBER_EYE_HURT_LOCAL,
  ENEMY_MULTILIMBER_EYE_HURT_PIVOT_X,
  ENEMY_MULTILIMBER_HEAD_HURT_LOCAL,
  ENEMY_MULTILIMBER_HEAD_HURT_PIVOT_X,
  ENEMY_MULTILIMBER_HIT_LOCAL,
  ENEMY_MULTILIMBER_HIT_PIVOT_X,
  ENEMY_MULTILIMBER_HURT_LOCAL,
  ENEMY_MULTILIMBER_HURT_PIVOT_X,
  ENEMY_MULTILIMBER_LOCAL,
  ENEMY_MULTILIMBER_PIVOT_X,
} from "../config/HitboxValues";
import {
  feetCrossedOntoFloorThisStep,
  nudgePenismanEmbedAfterMove,
  resolveHorizontalPolygonEnemy,
  resolveVerticalPolygonEnemy,
  polygonOverlapsSolidWallTiles,
} from "../collision/EnemyCollision";
import { HitboxPose } from "../collision/HitboxPose";
import { GRAVITY, MAX_FALL } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { isGrounded, solidUnderFootAhead } from "./EnemyPeerPlatforms";
import {
  createPatrolWallFlipState,
  tickWallFlipReady,
} from "./EnemyPatrolWallFlip";
import { SquashStretch } from "../render/SquashStretch";
import { HURT_TINT_PEAK_ALPHA, HURT_TINT_SECONDS } from "../combat/HitlagState";
import { JavaRandom } from "../util/JavaRandom";
import {
  applyStrikeElectrocuteJuice,
  isElectrocutionKnock,
} from "../combat/EnemyHitstunJuice";
import type { MultilimberPartIceSpawn } from "../combat/freezeCombatEnemy";

export type IceFreezeHost = {
  iceBlockEquipped(): boolean;
};

export const MULTILIMBER_PART_EYE = 0;
export const MULTILIMBER_PART_HEAD = 1;
export const MULTILIMBER_PART_BODY = 2;
export const MULTILIMBER_PART_COUNT = 3;

const PART_MAX_HP = [3, 4, 5];
const PHASE_SPEED = [96, 80, 64];
const ANIM_FRAME_COUNT = 3;
const SPAWN_FLOOR_EPS_PX = 0.5;
const STEER_COOLDOWN_SEC = 4;
const ACCEL_FRAMES = 30;
const GROUND_FRICTION = 140;
const JUMP_HEIGHT_PX = 2 * TILE_SIZE;
const JUMP_VY = -Math.sqrt(2 * GRAVITY * JUMP_HEIGHT_PX);
const JUMP_SQUAT_FRAMES = 15;
const JUMP_SQUAT_SQUASH_X = 1.2;
const JUMP_LIFT_STRETCH_Y = 1.2;
const JUMP_LIFT_STRETCH_RECOVER = 10;
const HOP_COOLDOWN_MIN = 2.2;
const HOP_COOLDOWN_MAX = 4.2;
const HEAD_HOP_CHANCE_PER_TICK = 0.008;
const HOP_LAND_BOUNCE_REST = 0.52;
const HOP_LAND_BOUNCE_MIN_VY = 120;
const HOP_LAND_BOUNCE_STRETCH_Y = 1.18;
const HOP_LAND_BOUNCE_STRETCH_RECOVER = 8;
const WALL_JUMP_LOOKAHEAD_PX = 3 * TILE_SIZE;
const PART_EXPLOSION_STAGGER_SEC = 0.11;
const KNOCKBACK_WEIGHT = 2;

export type MultilimberExplosionSpawn = { cx: number; cy: number; delaySec: number };

function collisionFeetLocalY(): number {
  const d = ENEMY_MULTILIMBER_LOCAL;
  let maxY = d[1]!;
  for (let i = 3; i < d.length; i += 2) maxY = Math.max(maxY, d[i + 1]!);
  return maxY;
}

const COLLISION_FEET_LOCAL_Y = collisionFeetLocalY();

function moveToward(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

function hurtLocalForPart(part: number): readonly number[] {
  switch (part) {
    case MULTILIMBER_PART_EYE:
      return ENEMY_MULTILIMBER_EYE_HURT_LOCAL;
    case MULTILIMBER_PART_HEAD:
      return ENEMY_MULTILIMBER_HEAD_HURT_LOCAL;
    default:
      return ENEMY_MULTILIMBER_HURT_LOCAL;
  }
}

function hurtPivotForPart(part: number): number {
  switch (part) {
    case MULTILIMBER_PART_EYE:
      return ENEMY_MULTILIMBER_EYE_HURT_PIVOT_X;
    case MULTILIMBER_PART_HEAD:
      return ENEMY_MULTILIMBER_HEAD_HURT_PIVOT_X;
    default:
      return ENEMY_MULTILIMBER_HURT_PIVOT_X;
  }
}

/**
 * Layered sawblade enemy (Java Multilimber.java): eye → head → body phases, per-part HP, hop AI.
 */
export class Multilimber implements CombatEnemy {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  onGround = false;
  patrolDir = -1;
  hp: number;
  readonly maxHp: number;

  private readonly partHp: number[] = [];
  private readonly partGone = [false, false, false];
  private readonly partDestroying = [false, false, false];
  private readonly partDestroyStep = [0, 0, 0];
  private readonly partDestroyTimer = [0, 0, 0];
  private readonly bodyQuadrantHidden = [false, false, false, false];
  private readonly partSquash = [
    new SquashStretch(),
    new SquashStretch(),
    new SquashStretch(),
  ];
  private readonly pendingExplosions: MultilimberExplosionSpawn[] = [];
  private readonly rng = new JavaRandom();

  private steerDir = -1;
  private steerCooldownSec = 0;
  private seesPlayerForSteer = false;
  private hurtLocked = false;
  private horizontalWallResolvedThisStep = false;
  private readonly patrolWallFlipState = createPatrolWallFlipState();
  private patrolFlipCooldownSec = 0;
  private suppressLedgeFlipRemainSec = 0;
  private jumpSquatFrames = 0;
  private hopCooldown = 0;
  private knockbackLandingSquashPending = false;
  private hopAirborne = false;
  private animFrame = 0;
  private animAccum = 0;
  private hurtTintRemaining = 0;
  private lastStruckPart = -1;
  hitstun = 0;
  private pendingKnockVx = 0;
  private pendingKnockVy = 0;
  private pendingKnockIsContactOnly = false;

  readonly squash = new SquashStretch();
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  hitlagSolidRed = false;
  hitlagElectrocute = false;
  readonly blackHeartBeat = new BlackHeartBeatDeferral();

  private iceFreezeHost: IceFreezeHost | null = null;
  private readonly pendingPartIceSpawns: MultilimberPartIceSpawn[] = [];

  constructor(x: number, y: number, maxHp = MULTILIMBER_MAX_HP) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    const hpScale = maxHp / (PART_MAX_HP[0]! + PART_MAX_HP[1]! + PART_MAX_HP[2]!);
    for (let i = 0; i < MULTILIMBER_PART_COUNT; i++) {
      this.partHp[i] = PART_MAX_HP[i]! * hpScale;
    }
    this.steerDir = this.patrolDir;
  }

  static onGround(anchorX: number, groundTopWorldY: number, maxHp = MULTILIMBER_MAX_HP): Multilimber {
    return new Multilimber(
      anchorX,
      groundTopWorldY - COLLISION_FEET_LOCAL_Y - SPAWN_FLOOR_EPS_PX,
      maxHp,
    );
  }

  spriteFeetWorldY(): number {
    return this.y + ENEMY_MULTILIMBER_EDITOR_FEET_LOCAL_Y;
  }

  setCameraView(_view: WorldRect): void {}

  applyVision(playerCx: number, playerCy: number, seeRadius: number, map: TileMap): void {
    const br = this.rect();
    this.seesPlayerForSteer = seesPlayerWithSolidLos(
      map,
      br.x + br.w * 0.5,
      br.y + br.h * 0.5,
      playerCx,
      playerCy,
      seeRadius,
    );
  }

  seesPlayer(): boolean {
    return this.seesPlayerForSteer;
  }

  getAnimFrame(): number {
    return this.animFrame;
  }

  drainExplosionSpawns(): MultilimberExplosionSpawn[] {
    if (this.pendingExplosions.length === 0) return [];
    const out = [...this.pendingExplosions];
    this.pendingExplosions.length = 0;
    return out;
  }

  setIceFreezeHost(host: IceFreezeHost | null): void {
    this.iceFreezeHost = host;
  }

  drainPartIceSpawns(): MultilimberPartIceSpawn[] {
    if (this.pendingPartIceSpawns.length === 0) return [];
    const out = [...this.pendingPartIceSpawns];
    this.pendingPartIceSpawns.length = 0;
    return out;
  }

  isPartDrawVisible(part: number): boolean {
    if (this.partGone[part]) return false;
    if (part === MULTILIMBER_PART_BODY && this.partDestroying[MULTILIMBER_PART_BODY]) {
      return this.bodyQuadrantHidden.some((h) => !h);
    }
    return true;
  }

  isBodyQuadrantHidden(quadrant: number): boolean {
    return this.bodyQuadrantHidden[((quadrant % 4) + 4) % 4]!;
  }

  hasActiveBodyQuadrantCull(): boolean {
    return this.bodyQuadrantHidden.some((h) => h);
  }

  partRenderSquash(part: number): SquashStretch {
    return this.partSquash[Math.max(0, Math.min(MULTILIMBER_PART_COUNT - 1, part))]!;
  }

  update(dt: number, map: TileMap, playerX: number, roomEnemies: readonly CombatEnemy[] = []): void {
    this.tickPartDestroy(dt);
    if (this.isDead() && this.allPartsGone()) return;

    this.squash.tick(dt);
    for (const s of this.partSquash) s.tick(dt);
    this.hurtTintRemaining = Math.max(0, this.hurtTintRemaining - dt);
    this.patrolFlipCooldownSec = Math.max(0, this.patrolFlipCooldownSec - dt);
    this.suppressLedgeFlipRemainSec = Math.max(0, this.suppressLedgeFlipRemainSec - dt);
    this.steerCooldownSec = Math.max(0, this.steerCooldownSec - dt);

    if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
      const hadHitstun = this.hitstun > 0;
      tickBlackHeartEnemyHitstun(dt, this);
      if (hadHitstun && this.hitstun <= 0 && !this.blackHeartBeat.isLocked()) {
        this.finishHitstunKnockRelease();
      }
      if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
        this.vx = 0;
        this.vy = 0;
        this.tickAnim(dt);
        return;
      }
    }

    const wasAirborneBeforeMove = !this.onGround || this.knockbackLandingSquashPending;
    this.onGround = isGrounded(this, map, roomEnemies);

    if (!this.hurtLocked) {
      this.tickMovementAi(dt, map, roomEnemies, playerX);
    } else {
      this.jumpSquatFrames = 0;
    }

    const vyBefore = this.vy;
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;

    const landed = this.moveAndCollide(dt, map, roomEnemies);
    const impactVy = Math.max(vyBefore, this.vy);
    if (landed && wasAirborneBeforeMove) {
      this.squash.applyStretchX(1.2, Math.abs(vyBefore) >= 24 ? 20 : 5);
      this.knockbackLandingSquashPending = false;
    }
    if (
      landed &&
      this.hopAirborne &&
      !this.hurtLocked &&
      !this.knockbackLandingSquashPending &&
      impactVy >= HOP_LAND_BOUNCE_MIN_VY
    ) {
      this.vy = -impactVy * HOP_LAND_BOUNCE_REST;
      this.onGround = false;
      this.squash.applyStretchY(HOP_LAND_BOUNCE_STRETCH_Y, HOP_LAND_BOUNCE_STRETCH_RECOVER);
      if (impactVy * HOP_LAND_BOUNCE_REST < HOP_LAND_BOUNCE_MIN_VY) {
        this.hopAirborne = false;
      }
    } else if (landed) {
      this.hopAirborne = false;
    }

    this.onGround = isGrounded(this, map, roomEnemies);
    if (!this.hurtLocked && this.onGround) {
      this.tickPatrolFlips(map, roomEnemies);
    }
    if (this.hurtLocked && landed) this.hurtLocked = false;

    this.tickAnim(dt);
  }

  private tickMovementAi(
    dt: number,
    map: TileMap,
    roomEnemies: readonly CombatEnemy[],
    playerX: number,
  ): void {
    this.hopCooldown = Math.max(0, this.hopCooldown - dt);
    let desiredVx = this.patrolDir * this.targetSpeed();

    if (this.eyePhase()) {
      if (this.steerCooldownSec <= 0 && this.seesPlayerForSteer) {
        const br = this.rect();
        const cx = br.x + br.w * 0.5;
        if (playerX > cx + 2) this.steerDir = 1;
        else if (playerX < cx - 2) this.steerDir = -1;
        this.patrolDir = this.steerDir;
        this.steerCooldownSec = STEER_COOLDOWN_SEC;
      }
      desiredVx = this.patrolDir * this.targetSpeed();
      if (this.onGround && this.jumpSquatFrames === 0 && this.shouldWallJump(map, roomEnemies)) {
        this.beginJumpSquat();
      }
    } else if (this.headPhase()) {
      desiredVx = this.patrolDir * this.targetSpeed();
      if (
        this.onGround &&
        this.jumpSquatFrames === 0 &&
        this.hopCooldown <= 0 &&
        this.rng.nextDouble() < HEAD_HOP_CHANCE_PER_TICK
      ) {
        this.beginJumpSquat();
      }
    } else if (this.bodyPhase()) {
      desiredVx = this.patrolDir * this.targetSpeed();
      this.jumpSquatFrames = 0;
    }

    if (this.jumpSquatFrames > 0) {
      this.jumpSquatFrames--;
      this.vx = 0;
      if (this.jumpSquatFrames === 0) this.launchJump();
      return;
    }

    if (this.onGround) {
      this.vx = moveToward(this.vx, desiredVx, this.groundAccel() * dt);
      if (Math.abs(desiredVx) < 1e-3 && Math.abs(this.vx) > 1e-3) {
        this.vx = moveToward(this.vx, 0, GROUND_FRICTION * dt);
      }
    }
  }

  private beginJumpSquat(): void {
    this.jumpSquatFrames = JUMP_SQUAT_FRAMES;
    this.squash.applyStretchXHeld(JUMP_SQUAT_SQUASH_X, JUMP_SQUAT_FRAMES);
    this.vx = 0;
  }

  private launchJump(): void {
    this.vy = JUMP_VY;
    this.vx = this.patrolDir * this.targetSpeed();
    this.squash.applyStretchY(JUMP_LIFT_STRETCH_Y, JUMP_LIFT_STRETCH_RECOVER);
    this.onGround = false;
    this.hopAirborne = true;
    if (this.headPhase()) {
      this.hopCooldown =
        HOP_COOLDOWN_MIN + this.rng.nextDouble() * (HOP_COOLDOWN_MAX - HOP_COOLDOWN_MIN);
    }
  }

  private shouldWallJump(map: TileMap, peers: readonly CombatEnemy[]): boolean {
    if (!this.onGround || !solidUnderFootAhead(this, map, peers, this.patrolDir)) return false;
    const probeX = this.x + this.patrolDir * WALL_JUMP_LOOKAHEAD_PX;
    return polygonOverlapsSolidWallTiles(this.poseAt(probeX, this.y), map);
  }

  private tickPatrolFlips(map: TileMap, roomEnemies: readonly CombatEnemy[]): void {
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
    if (this.patrolFlipCooldownSec > 0) return;

    if (this.bodyPhase()) {
      if (wallPatrolFlip) {
        this.patrolDir *= -1;
        this.patrolFlipCooldownSec = MULTILIMBER_PATROL_FLIP_COOLDOWN_SEC;
        this.suppressLedgeFlipRemainSec = MULTILIMBER_SUPPRESS_LEDGE_AFTER_WALL_SEC;
      }
      return;
    }

    if (!solidUnderFootAhead(this, map, roomEnemies, this.patrolDir)) {
      if (this.suppressLedgeFlipRemainSec <= 0) {
        this.patrolDir *= -1;
        this.patrolFlipCooldownSec = MULTILIMBER_PATROL_FLIP_COOLDOWN_SEC;
      }
    } else if (wallPatrolFlip) {
      this.patrolDir *= -1;
      this.patrolFlipCooldownSec = MULTILIMBER_PATROL_FLIP_COOLDOWN_SEC;
      this.suppressLedgeFlipRemainSec = MULTILIMBER_SUPPRESS_LEDGE_AFTER_WALL_SEC;
    }
  }

  private tickAnim(dt: number): void {
    if (this.isJumpSquatting()) return;
    const speed = Math.max(Math.abs(this.vx), this.targetSpeed() * 0.25);
    const frameSec = 1 / Math.max(4, Math.min(14, 4 + speed / 12));
    this.animAccum += dt;
    while (this.animAccum >= frameSec) {
      this.animAccum -= frameSec;
      this.animFrame = (this.animFrame + 1) % ANIM_FRAME_COUNT;
    }
  }

  private collisionFacingSign(): number {
    return -this.patrolDir;
  }

  private poseAt(ax: number, ay: number, local = ENEMY_MULTILIMBER_LOCAL, pivot = ENEMY_MULTILIMBER_PIVOT_X): HitboxPose {
    return new HitboxPose(local, ax, ay, this.collisionFacingSign(), pivot);
  }

  private partHurtPose(part: number, ax = this.x, ay = this.y): HitboxPose {
    return new HitboxPose(
      hurtLocalForPart(part),
      ax,
      ay,
      this.collisionFacingSign(),
      hurtPivotForPart(part),
    );
  }

  private targetSpeed(): number {
    if (!this.partGone[MULTILIMBER_PART_EYE]) return PHASE_SPEED[0]!;
    if (!this.partGone[MULTILIMBER_PART_HEAD]) return PHASE_SPEED[1]!;
    return PHASE_SPEED[2]!;
  }

  private groundAccel(): number {
    return this.targetSpeed() * (60 / ACCEL_FRAMES);
  }

  private topmostLivingPart(): number {
    if (!this.partGone[MULTILIMBER_PART_EYE] && !this.partDestroying[MULTILIMBER_PART_EYE]) {
      return MULTILIMBER_PART_EYE;
    }
    if (!this.partGone[MULTILIMBER_PART_HEAD] && !this.partDestroying[MULTILIMBER_PART_HEAD]) {
      return MULTILIMBER_PART_HEAD;
    }
    return MULTILIMBER_PART_BODY;
  }

  private eyePhase(): boolean {
    return !this.partGone[MULTILIMBER_PART_EYE];
  }

  private headPhase(): boolean {
    return this.partGone[MULTILIMBER_PART_EYE] && !this.partGone[MULTILIMBER_PART_HEAD];
  }

  private bodyPhase(): boolean {
    return this.partGone[MULTILIMBER_PART_EYE] && this.partGone[MULTILIMBER_PART_HEAD];
  }

  private livingHurtBounds(): Aabb {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (let part = MULTILIMBER_PART_EYE; part <= MULTILIMBER_PART_BODY; part++) {
      if (this.partGone[part] || this.partDestroying[part]) continue;
      const b = this.partHurtPose(part).bounds();
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
      any = true;
    }
    if (!any) return this.hitboxPose().bounds();
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private intersectAnyLivingHurtRouteTopmost(pose: HitboxPose): boolean {
    if (this.isDead()) return false;
    for (let part = MULTILIMBER_PART_EYE; part <= MULTILIMBER_PART_BODY; part++) {
      if (this.partGone[part] || this.partDestroying[part]) continue;
      if (pose.intersects(this.partHurtPose(part))) {
        this.lastStruckPart = this.topmostLivingPart();
        return true;
      }
    }
    this.lastStruckPart = -1;
    return false;
  }

  hitboxPose(): HitboxPose {
    return this.poseAt(this.x, this.y);
  }

  rect(): Aabb {
    return this.hitboxPose().bounds();
  }

  contactDamagePose(): Aabb {
    return this.poseAt(this.x, this.y, ENEMY_MULTILIMBER_HIT_LOCAL, ENEMY_MULTILIMBER_HIT_PIVOT_X).bounds();
  }

  damageReceivePose(): Aabb {
    return this.livingHurtBounds();
  }

  intersectsAttack(sword: Aabb): boolean {
    if (this.isDead()) return false;
    for (let part = MULTILIMBER_PART_EYE; part <= MULTILIMBER_PART_BODY; part++) {
      if (this.partGone[part] || this.partDestroying[part]) continue;
      if (this.partHurtPose(part).intersectsRect(sword)) {
        this.lastStruckPart = this.topmostLivingPart();
        return true;
      }
    }
    this.lastStruckPart = -1;
    return false;
  }

  intersectsMeleePose(swordPose: HitboxPose): boolean {
    return this.intersectAnyLivingHurtRouteTopmost(swordPose);
  }

  intersectsProjectile(projectile: HitboxPose): boolean {
    return this.intersectAnyLivingHurtRouteTopmost(projectile);
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (this.isDead() || this.lastStruckPart < 0) return false;
    if (this.hitstun > 0 && strike.knockKind !== "black_heart_burst") return false;
    if (!this.applyPartDamage(this.lastStruckPart, strike.damage)) return false;
    if (strike.knockKind === "black_heart_burst") {
      this.hitstun = queueBlackHeartBurstKnock(this.blackHeartBeat, strike, this.hitstun);
      this.hurtTintRemaining = HURT_TINT_SECONDS;
      return true;
    }
    this.queueHitstunAfterDamage(strike);
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    return true;
  }

  applyProjectileStrike(strike: ProjectileStrike): boolean {
    if (this.isDead() || this.lastStruckPart < 0) return false;
    if (this.hitstun > 0) return false;
    if (!this.applyPartDamage(this.lastStruckPart, strike.damage)) return false;
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    this.hitlagSolidRed = true;
    this.pendingKnockIsContactOnly = false;
    const kb = this.scaleKnock(knockbackForFrisbee(strike.projectileVelX));
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    return true;
  }

  private applyPartDamage(part: number, amount: number): boolean {
    if (this.partGone[part] || this.partDestroying[part] || amount <= 0) return false;
    const applied = Math.min(amount, this.partHp[part]!);
    if (applied <= 0) return false;
    this.syncHealthPoolIfDepletedDesync();
    this.hp = Math.max(0, this.hp - applied);
    this.partHp[part] = Math.max(0, this.partHp[part]! - applied);
    if (this.partHp[part]! <= 0) this.beginPartDestroy(part);
    return true;
  }

  private livingPartHpTotal(): number {
    let sum = 0;
    for (let i = 0; i < MULTILIMBER_PART_COUNT; i++) {
      if (!this.partGone[i]) sum += this.partHp[i]!;
    }
    return sum;
  }

  private syncHealthPoolIfDepletedDesync(): void {
    if (this.hp > 0) return;
    const living = this.livingPartHpTotal();
    if (living <= 0) return;
    this.hp = Math.ceil(living);
  }

  private beginPartDestroy(part: number): void {
    if (this.partDestroying[part] || this.partGone[part]) return;
    if (this.iceFreezeHost?.iceBlockEquipped()) {
      this.partGone[part] = true;
      if (part !== MULTILIMBER_PART_BODY) {
        const c = this.spriteCenterWorld();
        const sq = this.partRenderSquash(part);
        this.pendingPartIceSpawns.push({
          partIndex: part,
          cx: c[0]!,
          cy: c[1]!,
          animFrame: this.animFrame,
          mirrorSourceX: this.facingHintVelX() >= 0,
          squashX: sq.active() ? sq.scaleX() : 1,
          squashY: sq.active() ? sq.scaleY() : 1,
        });
      }
      return;
    }
    this.partDestroying[part] = true;
    this.partDestroyStep[part] = 0;
    this.partDestroyTimer[part] = 0;
  }

  private tickPartDestroy(dt: number): void {
    for (let p = 0; p < MULTILIMBER_PART_COUNT; p++) {
      if (!this.partDestroying[p]) continue;
      this.partDestroyTimer[p]! += dt;
      const need = this.destroyExplosionCount(p);
      while (
        this.partDestroyStep[p]! < need &&
        this.partDestroyTimer[p]! >= (this.partDestroyStep[p]! + 1) * PART_EXPLOSION_STAGGER_SEC
      ) {
        this.spawnPartDestroyExplosion(p, this.partDestroyStep[p]!);
        if (p === MULTILIMBER_PART_BODY) {
          this.bodyQuadrantHidden[this.partDestroyStep[p]!] = true;
        }
        this.partDestroyStep[p]!++;
      }
      if (this.partDestroyStep[p]! >= need) {
        this.partDestroying[p] = false;
        this.partGone[p] = true;
      }
    }
  }

  private destroyExplosionCount(part: number): number {
    switch (part) {
      case MULTILIMBER_PART_EYE:
        return 1;
      case MULTILIMBER_PART_HEAD:
        return 2;
      default:
        return 4;
    }
  }

  private spawnPartDestroyExplosion(part: number, step: number): void {
    const c = this.spriteCenterWorld();
    const pos = this.explosionPoint(part, step, c[0], c[1]);
    this.pendingExplosions.push({ cx: pos[0]!, cy: pos[1]!, delaySec: 0 });
  }

  private explosionPoint(part: number, step: number, cx: number, cy: number): [number, number] {
    if (part !== MULTILIMBER_PART_BODY) return [cx, cy];
    const ox = (step % 2 === 0 ? -1 : 1) * 6;
    const oy = (step < 2 ? -1 : 1) * 6;
    return [cx + ox, cy + oy];
  }

  private spriteCenterWorld(): [number, number] {
    const r = this.rect();
    return [r.x + r.w * 0.5, r.y + r.h * 0.5];
  }

  private allPartsGone(): boolean {
    return this.partGone.every((g) => g);
  }

  private queueHitstunAfterDamage(strike: WeaponStrike): void {
    this.hitstun = Math.max(this.hitstun, Math.max(0.12, strike.freezeFrames / 60));
    applyStrikeElectrocuteJuice(strike, this);
    if (!this.hitlagElectrocute) this.hitlagSolidRed = true;
    this.pendingKnockIsContactOnly =
      strike.knockKind === "contact_only" || isElectrocutionKnock(strike.knockKind);
    const r = this.rect();
    const away = r.x + r.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = this.scaleKnock(knockbackFor(strike.knockKind, away));
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
  }

  private finishHitstunKnockRelease(): void {
    this.hitlagSolidRed = false;
    this.hitlagElectrocute = false;
    if (this.pendingKnockIsContactOnly) {
      this.pendingKnockIsContactOnly = false;
      return;
    }
    this.vx = this.pendingKnockVx;
    this.vy = this.pendingKnockVy;
    this.pendingKnockVx = 0;
    this.pendingKnockVy = 0;
    this.hurtLocked = true;
    this.knockbackLandingSquashPending = true;
    this.hopAirborne = false;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    if (Math.abs(this.vx) + Math.abs(this.vy) > 1) this.onGround = false;
  }

  private scaleKnock(kb: { vx: number; vy: number }): { vx: number; vy: number } {
    return { vx: kb.vx * KNOCKBACK_WEIGHT, vy: kb.vy * KNOCKBACK_WEIGHT };
  }

  releaseBlackHeartBeatKnockback(): void {
    releaseBlackHeartBeatKnockback(this.blackHeartBeat, (vx, vy) => {
      const kb = this.scaleKnock({ vx, vy });
      this.pendingKnockVx = kb.vx;
      this.pendingKnockVy = kb.vy;
      this.finishHitstunKnockRelease();
    });
  }

  isBlackHeartBeatLocked(): boolean {
    return this.blackHeartBeat.isLocked();
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (this.isDead() || this.partDestroying[MULTILIMBER_PART_BODY]) return false;
    if (this.hurtLocked || this.hitstun > 0 || this.blackHeartBeat.isLocked()) return false;
    const pose = this.poseAt(this.x, this.y, ENEMY_MULTILIMBER_HIT_LOCAL, ENEMY_MULTILIMBER_HIT_PIVOT_X);
    return pose.intersectsRect(playerHurt);
  }

  contactDamageToPlayer(): number {
    return 2;
  }

  getHealth(): number {
    return this.hp;
  }

  getMaxHealth(): number {
    return this.maxHp;
  }

  isDead(): boolean {
    return this.partGone[MULTILIMBER_PART_BODY]!;
  }

  blocksRoomClear(): boolean {
    return !this.isDead();
  }

  isInCombatHitstun(): boolean {
    return this.hitstun > 0 || this.blackHeartBeat.isLocked();
  }

  facingSign(): number {
    return this.collisionFacingSign();
  }

  facingHintVelX(): number {
    if (Math.abs(this.vx) > 6) return this.vx;
    return this.patrolDir * this.targetSpeed();
  }

  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SECONDS));
  }

  isJumpSquatting(): boolean {
    return this.jumpSquatFrames > 0;
  }

  suppressDeathExplosion(): boolean {
    return true;
  }

  attackBlockedByShield(_attack: Aabb): boolean {
    return false;
  }

  applyShieldBlockStrike(_strike: WeaponStrike): void {}

  flipPatrolDirection(): void {
    this.patrolDir *= -1;
    if (this.onGround && !this.hurtLocked && this.jumpSquatFrames === 0) {
      this.vx = this.patrolDir * this.targetSpeed();
    }
  }

  private moveAndCollide(dt: number, map: TileMap, peers: readonly CombatEnemy[]): boolean {
    this.horizontalWallResolvedThisStep = false;
    const poseAt = (ax: number, ay: number) => this.poseAt(ax, ay);
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

    const hullBeforeStep = poseAt(this.x, this.y).bounds();
    const prevFeetBottom = hullBeforeStep.y + hullBeforeStep.h;
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
      prevFeetBottom,
      hullBeforeStep.y,
    );
    this.y = vert.y;
    this.vy = vert.vy;

    const nudged = nudgePenismanEmbedAfterMove(map, poseAt, anchorX0, anchorY0, this.x, this.y);
    this.x = nudged.x;
    this.y = nudged.y;
    if (nudged.clearVx) this.vx = 0;

    feetCrossedOntoFloorThisStep(map, this, peers, this.vy, prevFeetBottom);
    return vert.landed;
  }

  private shouldResolveHorizontal(map: TileMap, peers: readonly CombatEnemy[]): boolean {
    if (this.vx === 0) return false;
    const dir = this.vx > 0 ? 1 : -1;
    if (!solidUnderFootAhead(this, map, peers, dir)) return false;
    return this.onGround;
  }
}
