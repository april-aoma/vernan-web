import {
  aabbOverlap,
  knockbackFor,
  knockbackForFrisbee,
  type Aabb,
  type ProjectileStrike,
  type WeaponStrike,
} from "../combat/CombatMath";
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
import { HitboxPose } from "../collision/HitboxPose";
import { GRAVITY, MAX_FALL, PLATFORM_DECK_SLACK_PX } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import {
  isGrounded,
  landingSurfaceY,
  solidUnderFootAhead,
} from "./EnemyPeerPlatforms";
import type { PeerWalkingEnemy } from "./PeerWalkingEnemy";
import type { PeerRidingBehavior } from "./PeerRidingBehavior";
import { PenismanBullet } from "./PenismanBullet";
import {
  PENIS_BULLET_DIE_FRAME_COUNT,
  PENIS_BULLET_DIE_FRAME_SEC,
} from "../config/AnimStats";
import { SquashStretch } from "../render/SquashStretch";
import {
  DEFAULT_SHAKE_AMPLITUDE_PX,
  HURT_TINT_PEAK_ALPHA,
  HURT_TINT_SECONDS,
  sampleShake,
} from "../combat/HitlagState";
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

  private hitstun = 0;
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
  private hurtTintRemaining = 0;

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
      if (this.hitstun > 0) {
        this.hitlagSolidRed = true;
        this.hitlagShakeX = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
        this.hitlagShakeY = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
        this.hitstun = Math.max(0, this.hitstun - dt);
        if (this.hitstun <= 0) {
          this.hitlagSolidRed = false;
          this.hitlagShakeX = 0;
          this.hitlagShakeY = 0;
          this.pendingCorpseExplosion = true;
        }
      }
      return;
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

    if (this.hitstun > 0) {
      this.hitlagSolidRed = true;
      this.hitlagShakeX = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
      this.hitlagShakeY = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
      this.hitstun = Math.max(0, this.hitstun - dt);
      if (this.hitstun <= 0) {
        this.hitlagSolidRed = false;
        this.hitlagShakeX = 0;
        this.hitlagShakeY = 0;
        this.hurtTintRemaining = HURT_TINT_SECONDS;
        this.hurtLocked = true;
        this.knockbackLandingSquashPending = true;
      }
      this.applyGravity(dt);
      this.moveAndCollide(dt, map, roomEnemies);
      return;
    }
    this.hitlagSolidRed = false;
    this.hitlagShakeX = 0;
    this.hitlagShakeY = 0;

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

    this.applyGravity(dt);
    const impactVy = this.vy;
    const landed = this.moveAndCollide(dt, map, roomEnemies);
    this.onGround = isGrounded(this, map, roomEnemies);

    if (landed && wasAirborneBeforeMove) {
      this.squash.applyStretchX(1.2, Math.abs(impactVy) >= 24 ? 20 : 5);
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
    if (this.hp <= 0 || this.hitstun > 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    const r = this.rect();
    const away =
      r.x + r.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = knockbackFor(strike.knockKind, away);
    this.vx = kb.vx;
    this.vy = kb.vy;
    this.onGround = false;
    return true;
  }

  intersectsProjectile(projectile: HitboxPose): boolean {
    if (this.isDead()) return false;
    return projectile.intersectsRect(this.damageReceivePose());
  }

  applyProjectileStrike(strike: ProjectileStrike): boolean {
    if (this.hp <= 0 || this.hitstun > 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    const kb = knockbackForFrisbee(strike.projectileVelX);
    this.vx = kb.vx;
    this.vy = kb.vy;
    this.onGround = false;
    return true;
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (this.isDead() || this.hitstun > 0 || this.hurtLocked) return false;
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
    return this.hitstun > 0;
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

  private isHorizontalBlockingSolid(map: TileMap, tx: number, ty: number, footRow: number): boolean {
    if (!map.isSolidTile(tx, ty)) return false;
    if (ty === footRow && !map.isSolidTile(tx, footRow - 1)) return false;
    return true;
  }

  private moveAndCollide(
    dt: number,
    map: TileMap,
    peers: readonly CombatEnemy[],
  ): boolean {
    this.horizontalWallResolvedThisStep = false;
    const xBefore = this.x;
    this.x += this.vx * dt;
    this.horizontalWallResolvedThisStep = this.resolveHorizontal(map, xBefore);
    const before = this.hitboxPose().bounds();
    const prevFoot = before.y + before.h;
    const prevTop = before.y;
    this.y += this.vy * dt;
    this.onGround = false;
    return this.resolveVertical(map, peers, prevFoot, prevTop);
  }

  private resolveHorizontal(map: TileMap, xBefore: number): boolean {
    if (this.vx === 0) return false;
    const r = this.rect();
    const ts = TILE_SIZE;
    const topTile = Math.floor((r.y + 0.001) / ts);
    const bottomTile = Math.floor((r.y + r.h - 0.001) / ts);
    const footRow = Math.floor((r.y + r.h - 1.0) / ts);

    if (this.vx > 0) {
      const prevB = this.penismanPose(ENEMY_PENISMAN_LOCAL, ENEMY_PENISMAN_PIVOT_X, xBefore, this.y).bounds();
      const prevRight = prevB.x + prevB.w;
      const prevRightTile = Math.floor((prevRight - 1e-6) / ts);
      const newRightTile = Math.floor((r.x + r.w) / ts);
      for (let tx = Math.max(prevRightTile, 0); tx <= newRightTile; tx++) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (!this.isHorizontalBlockingSolid(map, tx, ty, footRow)) continue;
          const cr = this.rect();
          this.x += tx * ts - (cr.x + cr.w);
          this.vx = 0;
          return true;
        }
      }
    } else {
      const prevLeft = this.penismanPose(
        ENEMY_PENISMAN_LOCAL,
        ENEMY_PENISMAN_PIVOT_X,
        xBefore,
        this.y,
      ).bounds().x;
      const prevLeftTile = Math.floor(prevLeft / ts);
      const newLeftTile = Math.floor(r.x / ts);
      for (let tx = prevLeftTile; tx >= newLeftTile; tx--) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (!this.isHorizontalBlockingSolid(map, tx, ty, footRow)) continue;
          const cr = this.rect();
          this.x += (tx + 1) * ts - cr.x;
          this.vx = 0;
          return true;
        }
      }
    }
    return false;
  }

  private resolveVertical(
    map: TileMap,
    peers: readonly CombatEnemy[],
    prevFoot: number,
    prevTop: number,
  ): boolean {
    if (this.vy >= 0) {
      const b = this.hitboxPose().bounds();
      const foot = b.y + b.h;
      const left = Math.floor((b.x + 0.001) / TILE_SIZE);
      const right = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
      const bottomTile = Math.floor((foot - 1e-4) / TILE_SIZE);
      for (let tx = left; tx <= right; tx++) {
        if (!map.isSolidTile(tx, bottomTile) && !map.isPlatformTile(tx, bottomTile)) continue;
        const floorY = bottomTile * TILE_SIZE;
        const prevBottomTile = Math.floor((prevFoot - 1e-4) / TILE_SIZE);
        const crossedFromAbove = prevFoot <= floorY + 1e-3 || prevBottomTile < bottomTile;
        const embedded = foot > floorY + 1e-3 && foot <= floorY + TILE_SIZE;
        if ((crossedFromAbove || embedded) && foot >= floorY - 1e-3) {
          if (map.isPlatformTile(tx, bottomTile) && foot > floorY + PLATFORM_DECK_SLACK_PX) {
            continue;
          }
          this.y += floorY - foot;
          this.vy = 0;
          this.onGround = true;
          return crossedFromAbove;
        }
        return false;
      }
      const peerTop = landingSurfaceY(this, peers, prevFoot);
      if (!Number.isNaN(peerTop)) {
        const lr = this.rect();
        this.y += peerTop - (lr.y + lr.h);
        this.vy = 0;
        this.onGround = true;
        return true;
      }
    } else {
      const b = this.hitboxPose().bounds();
      const top = b.y;
      const left = Math.floor((b.x + 0.001) / TILE_SIZE);
      const right = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
      const topTile = Math.floor((top + 1e-4) / TILE_SIZE);
      const ceilingBottomY = (topTile + 1) * TILE_SIZE;
      for (let tx = left; tx <= right; tx++) {
        if (!map.isSolidTile(tx, topTile)) continue;
        if (prevTop >= ceilingBottomY - 1e-3 && top <= ceilingBottomY + 1e-3) {
          this.y += ceilingBottomY - top;
          this.vy = 0;
        }
        break;
      }
    }
    return false;
  }
}
