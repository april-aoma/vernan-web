import {
  aabbOverlap,
  knockbackFor,
  knockbackForFlintFirePull,
  knockbackForFrisbee,
  knockbackForPsychicDebris,
  type Aabb,
  type ProjectileStrike,
  type WeaponStrike,
} from "../combat/CombatMath";
import {
  CRAWLER_H,
  CRAWLER_HOP_COOLDOWN_MAX,
  CRAWLER_HOP_COOLDOWN_MIN,
  CRAWLER_HOP_VX,
  CRAWLER_HOP_VY,
  CRAWLER_JUMPSQUAT_FRAMES,
  CRAWLER_MAX_HP,
  CRAWLER_WALK_SPEED,
  CRAWLER_W,
} from "../config/CombatStats";
import {
  ENEMY_CRAWLER_HIT_LOCAL,
  ENEMY_CRAWLER_HIT_PIVOT_X,
  ENEMY_CRAWLER_HURT_LOCAL,
  ENEMY_CRAWLER_HURT_PIVOT_X,
  ENEMY_CRAWLER_LOCAL,
  ENEMY_CRAWLER_PIVOT_X,
} from "../config/HitboxValues";
import { HitboxPose } from "../collision/HitboxPose";
import { GRAVITY, MAX_FALL, PLATFORM_DECK_SLACK_PX } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import {
  isGrounded,
  landingSurfaceY,
  ridingDeck,
  solidUnderFootAhead,
} from "./EnemyPeerPlatforms";
import { isPeerWalkingEnemy, type PeerWalkingEnemy } from "./PeerWalkingEnemy";
import type { PeerRidingBehavior } from "./PeerRidingBehavior";
import { SquashStretch } from "../render/SquashStretch";
import {
  DEFAULT_SHAKE_AMPLITUDE_PX,
  HURT_TINT_PEAK_ALPHA,
  HURT_TINT_SECONDS,
  sampleShake,
} from "../combat/HitlagState";

/**
 * Slim Crawler (Java Enemy.java hop/walk).
 * Physics AABB from ENEMY_CRAWLER; contact/hurt from HIT/HURT polys.
 */
export class Crawler implements PeerWalkingEnemy {
  x: number;
  y: number;
  w = CRAWLER_W;
  h = CRAWLER_H;
  vx = 0;
  vy = 0;
  onGround = false;
  facing = 1;
  hp: number;
  readonly maxHp: number;

  private hopCooldown: number;
  private jumpsquat = 0;
  private hitstun = 0;
  private faceCooldown = 0;
  private animFrame = 0;
  private animAccum = 0;
  private pendingCorpseExplosion = false;
  /** Java horizontalWallResolvedThisStep — wall snap this tick (turn after move). */
  private horizontalWallResolvedThisStep = false;
  private peerCarryAnchorX = 0;
  private peerCarryAnchorY = 0;
  private peerCarrierThisTick: CombatEnemy | null = null;

  readonly squash = new SquashStretch();
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  hitlagSolidRed = false;
  private hurtTintRemaining = 0;

  constructor(x: number, y: number, maxHp = CRAWLER_MAX_HP) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.hopCooldown = CRAWLER_HOP_COOLDOWN_MIN;
  }

  getAnimFrame(): number {
    return this.animFrame;
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

    // Java: corpse stays through hitstun, then queues explosion.
    if (this.hp <= 0) {
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
      }
      this.applyGravity(dt);
      this.moveAndCollide(dt, map, roomEnemies);
      return;
    }
    this.hitlagSolidRed = false;
    this.hitlagShakeX = 0;
    this.hitlagShakeY = 0;

    const wasAirborneBeforeMove = !this.onGround;
    this.onGround = isGrounded(this, map, roomEnemies);
    const onDeck = ridingDeck(this, map, this.peerCarrierThisTick);

    if (this.faceCooldown > 0) this.faceCooldown--;
    else if (!onDeck) {
      const want = playerX + 5 < this.rect().x + this.rect().w * 0.5 ? -1 : 1;
      if (want !== this.facing) {
        this.facing = want;
        this.faceCooldown = 15;
      }
    }

    if (onDeck) {
      this.jumpsquat = 0;
      const carrier = this.peerCarrierThisTick;
      if (carrier && isPeerWalkingEnemy(carrier)) {
        this.vx = carrier.simulationVx();
        if (Math.abs(this.vx) > 1) this.facing = this.vx > 0 ? 1 : -1;
      }
    } else if (this.jumpsquat > 0) {
      this.jumpsquat--;
      this.vx = 0;
      this.vy = 0;
      this.squash.applyStretchXHeld(1.2, 1);
      if (this.jumpsquat === 0) {
        this.vx = this.facing * CRAWLER_HOP_VX;
        this.vy = -CRAWLER_HOP_VY;
        this.onGround = false;
        this.squash.applyStretchY(1.2, 20);
        this.hopCooldown =
          CRAWLER_HOP_COOLDOWN_MIN +
          Math.random() * (CRAWLER_HOP_COOLDOWN_MAX - CRAWLER_HOP_COOLDOWN_MIN);
      }
    } else if (this.onGround) {
      this.hopCooldown -= dt;
      this.vx = this.facing * CRAWLER_WALK_SPEED;
      if (this.hopCooldown <= 0) {
        this.jumpsquat = CRAWLER_JUMPSQUAT_FRAMES;
        this.vx = 0;
      }
    }

    if (!onDeck) {
      this.applyGravity(dt);
    } else {
      this.vy = 0;
    }
    const impactVy = this.vy;
    const landed = this.moveAndCollide(dt, map, roomEnemies);
    this.onGround = isGrounded(this, map, roomEnemies);
    if (landed && wasAirborneBeforeMove) {
      this.squash.applyStretchX(1.2, Math.abs(impactVy) >= 24 ? 20 : 5);
    }
    if (this.onGround && this.jumpsquat === 0 && !onDeck) {
      if (!solidUnderFootAhead(this, map, roomEnemies, this.facing)) {
        this.facing = -this.facing;
      } else if (this.horizontalWallResolvedThisStep) {
        this.facing = -this.facing;
      }
    }
    this.tickAnim(dt);
  }

  private tickAnim(dt: number): void {
    if (this.jumpsquat > 0) return;
    const frameSeconds = this.onGround
      ? Math.abs(this.vx) > 1
        ? 0.22
        : 0.35
      : 0.08;
    this.animAccum += dt;
    while (this.animAccum >= frameSeconds) {
      this.animAccum -= frameSeconds;
      this.animFrame = (this.animFrame + 1) % 2;
    }
  }

  private crawlerPose(
    local: ReadonlyArray<number>,
    pivotLocalX: number,
    ax = this.x,
    ay = this.y,
  ): HitboxPose {
    return new HitboxPose(local, ax, ay, this.facing, pivotLocalX);
  }

  hitboxPose(): HitboxPose {
    return this.crawlerPose(ENEMY_CRAWLER_LOCAL, ENEMY_CRAWLER_PIVOT_X);
  }

  rect(): Aabb {
    return this.hitboxPose().bounds();
  }

  contactDamagePose(): Aabb {
    return this.crawlerPose(ENEMY_CRAWLER_HIT_LOCAL, ENEMY_CRAWLER_HIT_PIVOT_X).bounds();
  }

  damageReceivePose(): Aabb {
    return this.crawlerPose(ENEMY_CRAWLER_HURT_LOCAL, ENEMY_CRAWLER_HURT_PIVOT_X).bounds();
  }

  intersectsAttack(sword: Aabb): boolean {
    if (this.isDead()) return false;
    return this.crawlerPose(ENEMY_CRAWLER_HURT_LOCAL, ENEMY_CRAWLER_HURT_PIVOT_X).intersectsRect(
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
    this.jumpsquat = 0;
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
    if (strike.knockKind === "psychic_debris") {
      const r = this.rect();
      const kb = knockbackForPsychicDebris(
        r.x + r.w * 0.5,
        r.y + r.h * 0.5,
        strike.debrisCenterWorldX ?? r.x,
        strike.debrisCenterWorldY ?? r.y,
        strike.projectileVelX,
        strike.projectileVelY ?? 0,
        strike.damage,
      );
      this.vx = kb.vx;
      this.vy = kb.vy;
    } else if (strike.knockKind === "flint_fire_pull") {
      const r = this.rect();
      const kb = knockbackForFlintFirePull(
        r.x + r.w * 0.5,
        r.y + r.h * 0.5,
        strike.debrisCenterWorldX ?? r.x,
        strike.debrisCenterWorldY ?? r.y,
      );
      this.vx = kb.vx;
      this.vy = kb.vy;
    } else {
      const kb = knockbackForFrisbee(strike.projectileVelX);
      this.vx = kb.vx;
      this.vy = kb.vy;
    }
    this.onGround = false;
    this.jumpsquat = 0;
    return true;
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (this.isDead() || this.hitstun > 0) return false;
    return aabbOverlap(playerHurt, this.contactDamagePose());
  }

  contactDamageToPlayer(): number {
    return 1;
  }

  getHealth(): number {
    return this.hp;
  }

  getMaxHealth(): number {
    return CRAWLER_MAX_HP;
  }

  /** Dead only after hitstun ends (Java Enemy.isDead). */
  isDead(): boolean {
    return this.hp <= 0 && this.hitstun <= 0;
  }

  /** Still drawing corpse during death hitstun. */
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
    return this.facing;
  }

  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SECONDS));
  }

  peerRidingBehavior(): PeerRidingBehavior {
    return "ride_deck";
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
    if (this.hitstun > 0 && Math.abs(this.vx) > 6) return this.vx;
    return this.facing * CRAWLER_WALK_SPEED;
  }

  flipPatrolDirection(): void {
    this.facing *= -1;
    if (this.onGround && this.jumpsquat === 0) {
      this.vx = this.facing * CRAWLER_WALK_SPEED;
    }
  }

  isOnGround(): boolean {
    return this.onGround;
  }

  isJumpSquatting(): boolean {
    return this.jumpsquat > 0;
  }

  canServeAsPeerPlatform(): boolean {
    return !this.isDead() && !this.isInCombatHitstun();
  }

  isKuriboStompCorpseActive(): boolean {
    return false;
  }

  collisionPoseAt(ax: number, ay: number): HitboxPose {
    return this.crawlerPose(ENEMY_CRAWLER_LOCAL, ENEMY_CRAWLER_PIVOT_X, ax, ay);
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

  /**
   * Java Enemy.resolveHorizontal: snap to wall face along motion; do not flip facing
   * (1px ENEMY_CRAWLER overhang would otherwise re-trigger every frame).
   */
  private resolveHorizontal(map: TileMap, xBefore: number): boolean {
    if (this.vx === 0) return false;
    const r = this.rect();
    const ts = TILE_SIZE;
    const topTile = Math.floor((r.y + 0.001) / ts);
    const bottomTile = Math.floor((r.y + r.h - 0.001) / ts);

    if (this.vx > 0) {
      const prevB = this.crawlerPose(ENEMY_CRAWLER_LOCAL, ENEMY_CRAWLER_PIVOT_X, xBefore, this.y).bounds();
      const prevRight = prevB.x + prevB.w;
      const prevRightTile = Math.floor((prevRight - 1e-6) / ts);
      const newRightTile = Math.floor((r.x + r.w) / ts);
      for (let tx = Math.max(prevRightTile, 0); tx <= newRightTile; tx++) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (!map.isSolidTile(tx, ty)) continue;
          const cr = this.rect();
          this.x += tx * ts - (cr.x + cr.w);
          this.vx = 0;
          return true;
        }
      }
    } else {
      const prevLeft = this.crawlerPose(
        ENEMY_CRAWLER_LOCAL,
        ENEMY_CRAWLER_PIVOT_X,
        xBefore,
        this.y,
      ).bounds().x;
      const prevLeftTile = Math.floor(prevLeft / ts);
      const newLeftTile = Math.floor(r.x / ts);
      for (let tx = prevLeftTile; tx >= newLeftTile; tx--) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (!map.isSolidTile(tx, ty)) continue;
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
    if (this.vy > 0) {
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
        if (crossedFromAbove && foot >= floorY - 1e-3) {
          if (map.isPlatformTile(tx, bottomTile) && foot > floorY + PLATFORM_DECK_SLACK_PX) {
            continue;
          }
          this.y += floorY - foot;
          this.vy = 0;
          this.onGround = true;
          return true;
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
    } else if (this.vy < 0) {
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
