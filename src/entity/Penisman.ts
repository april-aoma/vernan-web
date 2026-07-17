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
import { applyStrikeElectrocuteJuice, applySolidRedHitstunJuice } from "../combat/EnemyHitstunJuice";
import type { WorldRect } from "../combat/EnemyVision";
import {
  PENISMAN_H,
  PENISMAN_MAX_HP,
  PENISMAN_PATROL_FLIP_COOLDOWN_SEC,
  PENISMAN_SHOOT_ALIGN_EPS,
  PENISMAN_SHOOT_COOLDOWN_MAX,
  PENISMAN_SHOOT_COOLDOWN_MIN,
  PENISMAN_SHOOT_RANGE_PX,
  PENISMAN_SUPPRESS_LEDGE_AFTER_WALL_SEC,
  PENISMAN_W,
  PENISMAN_WALK_SPEED,
} from "../config/CombatStats";
import {
  ENEMY_PENISMAN_HIT_LOCAL,
  ENEMY_PENISMAN_HIT_PIVOT_X,
  ENEMY_PENISMAN_HURT_LOCAL,
  ENEMY_PENISMAN_HURT_PIVOT_X,
  ENEMY_PENISMAN_LOCAL,
  ENEMY_PENISMAN_PIVOT_X,
} from "../config/HitboxValues";
import {
  feetCrossedOntoFloorThisStep,
  nudgePenismanEmbedAfterMove,
  resolveHorizontalPolygonEnemy,
  resolveVerticalPolygonEnemy,
} from "../collision/EnemyCollision";
import { tryResolveIceHorizontal, tryResolveIceVertical } from "../collision/EnemyIceSolids";
import { HitboxPose } from "../collision/HitboxPose";
import { GRAVITY, MAX_FALL } from "../config/Physics";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { isGrounded, solidUnderFootAhead } from "./EnemyPeerPlatforms";
import type { PeerWalkingEnemy } from "./PeerWalkingEnemy";
import type { PeerRidingBehavior } from "./PeerRidingBehavior";
import { PenismanBullet } from "./PenismanBullet";
import {
  PENIS_BULLET_DIE_FRAME_COUNT,
  PENIS_BULLET_DIE_FRAME_SEC,
} from "../config/AnimStats";
import { SquashStretch } from "../render/SquashStretch";
import { HURT_TINT_PEAK_ALPHA, HURT_TINT_SECONDS } from "../combat/HitlagState";
import {
  createPatrolWallFlipState,
  tickWallFlipReady,
} from "./EnemyPatrolWallFlip";

export type PenisBulletDieFx = { x: number; y: number; age: number };

const BULLET_DIE_MAX_AGE = PENIS_BULLET_DIE_FRAME_SEC * PENIS_BULLET_DIE_FRAME_COUNT;

function rectContainsFully(outer: WorldRect, inner: Aabb): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/**
 * Floor patrol shooter (Java Penisman.java). Art faces left; shoots when Vernan is ahead in range.
 */
export class Penisman implements PeerWalkingEnemy {
  x: number;
  y: number;
  w = PENISMAN_W;
  h = PENISMAN_H;
  vx = 0;
  vy = 0;
  onGround = false;
  patrolDir = -1;
  hp: number;
  readonly maxHp: number;

  hitstun = 0;
  private pendingKnockVx = 0;
  private pendingKnockVy = 0;
  private hurtLocked = false;
  private animFrame = 0;
  private animAccum = 0;
  private pendingCorpseExplosion = false;
  private horizontalWallResolvedThisStep = false;
  private patrolFlipCooldownSec = 0;
  private suppressLedgeFlipRemainSec = 0;
  private readonly patrolWallFlipState = createPatrolWallFlipState();
  private knockbackLandingSquashPending = false;
  private peerCarryAnchorX = 0;
  private peerCarryAnchorY = 0;
  private peerCarrierThisTick: CombatEnemy | null = null;
  private shootCooldown: number;
  private cameraViewWorld: WorldRect | null = null;
  private readonly bullets: PenismanBullet[] = [];
  private readonly bulletDieFx: PenisBulletDieFx[] = [];

  readonly squash = new SquashStretch();
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  hitlagSolidRed = false;
  hitlagElectrocute = false;
  private hurtTintRemaining = 0;
  readonly blackHeartBeat = new BlackHeartBeatDeferral();

  constructor(x: number, y: number, maxHp = PENISMAN_MAX_HP) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.shootCooldown =
      PENISMAN_SHOOT_COOLDOWN_MIN +
      Math.random() * (PENISMAN_SHOOT_COOLDOWN_MAX - PENISMAN_SHOOT_COOLDOWN_MIN);
  }

  private collisionFacingSign(): number {
    return -this.patrolDir;
  }

  getAnimFrame(): number {
    return this.animFrame;
  }

  setCameraView(view: WorldRect): void {
    this.cameraViewWorld = view;
  }

  bulletsCopy(): readonly PenismanBullet[] {
    return this.bullets;
  }

  bulletDieFxCopy(): readonly PenisBulletDieFx[] {
    return this.bulletDieFx;
  }

  update(
    dt: number,
    map: TileMap,
    playerX: number,
    roomEnemies: readonly CombatEnemy[] = [],
  ): void {
    this.squash.tick(dt);
    if (this.hurtTintRemaining > 0) {
      this.hurtTintRemaining = Math.max(0, this.hurtTintRemaining - dt);
    }
    this.patrolFlipCooldownSec = Math.max(0, this.patrolFlipCooldownSec - dt);
    this.suppressLedgeFlipRemainSec = Math.max(0, this.suppressLedgeFlipRemainSec - dt);
    for (const fx of this.bulletDieFx) fx.age += dt;
    for (let i = this.bulletDieFx.length - 1; i >= 0; i--) {
      if (this.bulletDieFx[i]!.age >= BULLET_DIE_MAX_AGE) this.bulletDieFx.splice(i, 1);
    }

    if (this.hp <= 0) {
      this.bullets.length = 0;
      if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
        const hadHitstun = this.hitstun > 0;
        tickBlackHeartEnemyHitstun(dt, this);
        if (hadHitstun && this.hitstun <= 0 && !this.blackHeartBeat.isLocked()) {
          this.pendingCorpseExplosion = true;
        }
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

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]!;
      if (!b.alive) {
        this.bullets.splice(i, 1);
        continue;
      }
      const despawned = b.update(dt, map);
      if (!b.alive) {
        if (despawned) {
          this.bulletDieFx.push({ x: b.centerX(), y: b.centerY(), age: 0 });
        }
        this.bullets.splice(i, 1);
      }
    }

    const wasAirborneBeforeMove = !this.onGround || this.knockbackLandingSquashPending;
    this.onGround = isGrounded(this, map, roomEnemies);

    if (!this.hurtLocked) {
      if (this.onGround) this.vx = this.patrolDir * PENISMAN_WALK_SPEED;
      this.shootCooldown = Math.max(0, this.shootCooldown - dt);
      if (this.onGround && this.shootCooldown <= 0 && this.canShootAtPlayer(playerX)) {
        this.spawnBullet();
        this.shootCooldown =
          PENISMAN_SHOOT_COOLDOWN_MIN +
          Math.random() * (PENISMAN_SHOOT_COOLDOWN_MAX - PENISMAN_SHOOT_COOLDOWN_MIN);
      }
    }

    const hullBeforeStep = this.rect();
    const prevFeetBottom = hullBeforeStep.y + hullBeforeStep.h;
    const vyBeforeGravity = this.vy;
    this.applyGravity(dt);
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

    if (!this.hurtLocked && this.onGround && this.patrolFlipCooldownSec <= 0) {
      if (!solidUnderFootAhead(this, map, roomEnemies, this.patrolDir)) {
        if (this.suppressLedgeFlipRemainSec <= 0) {
          this.patrolDir *= -1;
          this.patrolFlipCooldownSec = PENISMAN_PATROL_FLIP_COOLDOWN_SEC;
          this.vx = this.patrolDir * PENISMAN_WALK_SPEED;
        }
      } else if (wallPatrolFlip) {
        this.patrolDir *= -1;
        this.patrolFlipCooldownSec = PENISMAN_PATROL_FLIP_COOLDOWN_SEC;
        this.suppressLedgeFlipRemainSec = PENISMAN_SUPPRESS_LEDGE_AFTER_WALL_SEC;
        this.vx = this.patrolDir * PENISMAN_WALK_SPEED;
      }
    }

    this.tickAnim(dt);
  }

  private canShootAtPlayer(playerCenterX: number): boolean {
    if (this.cameraViewWorld && !rectContainsFully(this.cameraViewWorld, this.rect())) {
      return false;
    }
    const br = this.rect();
    const cx = br.x + br.w * 0.5;
    if (Math.abs(playerCenterX - cx) > PENISMAN_SHOOT_RANGE_PX) return false;
    if (this.patrolDir > 0) return playerCenterX > cx + PENISMAN_SHOOT_ALIGN_EPS;
    if (this.patrolDir < 0) return playerCenterX < cx - PENISMAN_SHOOT_ALIGN_EPS;
    return false;
  }

  private spawnBullet(): void {
    const br = this.rect();
    const spawnX = br.x + br.w * 0.5 - PenismanBullet.HITBOX_W * 0.5;
    this.bullets.push(new PenismanBullet(spawnX, this.y, this.patrolDir));
  }

  addBulletDieFx(x: number, y: number): void {
    this.bulletDieFx.push({ x, y, age: 0 });
  }

  applyBulletHits(
    playerHurt: Aabb,
    onHit: (damage: number, bulletCx: number) => void,
  ): void {
    for (const b of this.bullets) {
      if (!b.alive || b.playerOverlapHandled()) continue;
      if (!b.damagePose().intersectsRect(playerHurt)) continue;
      onHit(1, b.centerX());
      b.beginHitlagThenRemove(Math.max(0.12, 4 / 60));
      this.bulletDieFx.push({ x: b.centerX(), y: b.centerY(), age: 0 });
    }
  }

  private finishHitstunKnockRelease(): void {
    this.vx = this.pendingKnockVx;
    this.vy = this.pendingKnockVy;
    this.pendingKnockVx = 0;
    this.pendingKnockVy = 0;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    this.hurtLocked = true;
    this.knockbackLandingSquashPending = true;
    if (Math.abs(this.vx) + Math.abs(this.vy) > 1) {
      this.onGround = false;
    }
  }

  private tickAnim(dt: number): void {
    const frameSeconds = this.onGround ? 0.14 : 0.1;
    this.animAccum += dt;
    while (this.animAccum >= frameSeconds) {
      this.animAccum -= frameSeconds;
      this.animFrame = (this.animFrame + 1) % 4;
    }
  }

  private penismanPose(
    local: ReadonlyArray<number>,
    pivotLocalX: number,
    ax = this.x,
    ay = this.y,
  ): HitboxPose {
    return new HitboxPose(local, ax, ay, this.collisionFacingSign(), pivotLocalX);
  }

  hitboxPose(): HitboxPose {
    return this.penismanPose(ENEMY_PENISMAN_LOCAL, ENEMY_PENISMAN_PIVOT_X);
  }

  rect(): Aabb {
    return this.hitboxPose().bounds();
  }

  contactDamagePose(): Aabb {
    return this.penismanPose(ENEMY_PENISMAN_HIT_LOCAL, ENEMY_PENISMAN_HIT_PIVOT_X).bounds();
  }

  damageReceivePose(): Aabb {
    return this.penismanPose(ENEMY_PENISMAN_HURT_LOCAL, ENEMY_PENISMAN_HURT_PIVOT_X).bounds();
  }

  intersectsAttack(sword: Aabb): boolean {
    if (this.isDead()) return false;
    return this.penismanPose(ENEMY_PENISMAN_HURT_LOCAL, ENEMY_PENISMAN_HURT_PIVOT_X).intersectsRect(
      sword,
    );
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (this.hp <= 0) return false;
    if (this.hitstun > 0 && strike.knockKind !== "black_heart_burst") return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    if (strike.knockKind === "black_heart_burst") {
      this.hitstun = queueBlackHeartBurstKnock(this.blackHeartBeat, strike, this.hitstun, this);
      this.hurtTintRemaining = HURT_TINT_SECONDS;
      return true;
    }
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    applyStrikeElectrocuteJuice(strike, this);
    const r = this.rect();
    const away =
      r.x + r.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = knockbackFor(strike.knockKind, away);
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
    this.vx = 0;
    this.vy = 0;
    return true;
  }

  releaseBlackHeartBeatKnockback(): void {
    releaseBlackHeartBeatKnockback(this.blackHeartBeat, (vx, vy) => {
      this.pendingKnockVx = vx;
      this.pendingKnockVy = vy;
      this.finishHitstunKnockRelease();
    });
  }

  isBlackHeartBeatLocked(): boolean {
    return this.blackHeartBeat.isLocked();
  }

  intersectsProjectile(projectile: HitboxPose): boolean {
    if (this.isDead()) return false;
    return projectile.intersectsRect(this.damageReceivePose());
  }

  applyProjectileStrike(strike: ProjectileStrike): boolean {
    if (this.hp <= 0 || this.hitstun > 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    applySolidRedHitstunJuice(this);
    const kb = knockbackForFrisbee(strike.projectileVelX);
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
    this.vx = 0;
    this.vy = 0;
    return true;
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (this.isDead() || this.hitstun > 0 || this.blackHeartBeat.isLocked() || this.hurtLocked) {
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

  isDyingVisually(): boolean {
    return this.hp <= 0;
  }

  takeCorpseExplosion(): boolean {
    if (!this.pendingCorpseExplosion) return false;
    this.pendingCorpseExplosion = false;
    return true;
  }

  blocksRoomClear(): boolean {
    return !(this.hp <= 0 && this.hitstun <= 0);
  }

  attackBlockedByShield(_attack: Aabb): boolean {
    return false;
  }

  applyShieldBlockStrike(_strike: WeaponStrike): void {}

  isInCombatHitstun(): boolean {
    return this.hitstun > 0 || this.blackHeartBeat.isLocked();
  }

  facingSign(): number {
    return -this.patrolDir;
  }

  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SECONDS));
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
    return this.patrolDir * PENISMAN_WALK_SPEED;
  }

  flipPatrolDirection(): void {
    this.patrolDir *= -1;
    this.patrolFlipCooldownSec = PENISMAN_PATROL_FLIP_COOLDOWN_SEC;
    this.suppressLedgeFlipRemainSec = PENISMAN_SUPPRESS_LEDGE_AFTER_WALL_SEC;
    if (this.onGround && !this.hurtLocked) {
      this.vx = this.patrolDir * PENISMAN_WALK_SPEED;
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
    return this.penismanPose(ENEMY_PENISMAN_LOCAL, ENEMY_PENISMAN_PIVOT_X, ax, ay);
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

  private applyGravity(dt: number): void {
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;
  }

  private moveAndCollide(
    dt: number,
    map: TileMap,
    peers: readonly CombatEnemy[],
  ): boolean {
    this.horizontalWallResolvedThisStep = false;
    const poseAt = (ax: number, ay: number) =>
      this.penismanPose(ENEMY_PENISMAN_LOCAL, ENEMY_PENISMAN_PIVOT_X, ax, ay);
    const anchorX0 = this.x;
    const anchorY0 = this.y;
    const xBefore = this.x;
    this.x += this.vx * dt;
    const horz = resolveHorizontalPolygonEnemy(map, poseAt, xBefore, this.x, this.y, this.vx);
    this.x = horz.x;
    this.vx = horz.vx;
    this.horizontalWallResolvedThisStep = horz.wallResolved;
    const iceH = tryResolveIceHorizontal(poseAt(this.x, this.y), this.vx);
    if (iceH) {
      this.x += iceH.deltaX;
      this.vx = 0;
      this.horizontalWallResolvedThisStep = true;
    }

    const before = this.hitboxPose().bounds();
    const prevBottom = before.y + before.h;
    const prevTop = before.y;
    const yBefore = this.y;
    this.y += this.vy * dt;
    this.onGround = false;

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
    let landed = vert.landed;
    const iceV = tryResolveIceVertical(poseAt(this.x, this.y), this.vy, prevBottom, prevTop, landed);
    if (iceV) {
      this.y += iceV.deltaY;
      this.vy = 0;
      if (iceV.landed) landed = true;
    }
    if (landed) this.onGround = true;

    const nudged = nudgePenismanEmbedAfterMove(map, poseAt, anchorX0, anchorY0, this.x, this.y);
    this.x = nudged.x;
    this.y = nudged.y;
    if (nudged.clearVx) this.vx = 0;
    return landed;
  }
}
