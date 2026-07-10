import {
  aabbOverlap,
  knockbackFor,
  type Aabb,
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
import { GRAVITY, MAX_FALL, PLATFORM_DECK_SLACK_PX } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { SquashStretch } from "../render/SquashStretch";
import {
  DEFAULT_SHAKE_AMPLITUDE_PX,
  HURT_TINT_PEAK_ALPHA,
  HURT_TINT_SECONDS,
  sampleShake,
} from "../combat/HitlagState";

/**
 * Slim Crawler (Java Enemy.java hop/walk).
 * Physics AABB 10×12; contact/hurt use same AABB for Phase 3.
 */
export class Crawler implements CombatEnemy {
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
  private wasOnGround = false;
  private pendingCorpseExplosion = false;

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

  update(dt: number, map: TileMap, playerX: number): void {
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
      this.moveAndCollide(dt, map);
      return;
    }
    this.hitlagSolidRed = false;
    this.hitlagShakeX = 0;
    this.hitlagShakeY = 0;

    this.wasOnGround = this.onGround;

    if (this.faceCooldown > 0) this.faceCooldown--;
    else {
      const want = playerX + 5 < this.x + this.w * 0.5 ? -1 : 1;
      if (want !== this.facing) {
        this.facing = want;
        this.faceCooldown = 15;
      }
    }

    if (this.jumpsquat > 0) {
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
      } else if (this.shouldTurnAtEdgeOrWall(map)) {
        this.facing = -this.facing;
        this.vx = this.facing * CRAWLER_WALK_SPEED;
      }
    }

    this.applyGravity(dt);
    const impactVy = this.vy;
    this.moveAndCollide(dt, map);
    if (!this.wasOnGround && this.onGround) {
      this.squash.applyStretchX(1.2, Math.abs(impactVy) >= 24 ? 20 : 5);
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

  rect(): Aabb {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  contactDamagePose(): Aabb {
    return this.rect();
  }

  damageReceivePose(): Aabb {
    // Slightly larger hurt AABB approximation of ENEMY_CRAWLER_HURT
    return { x: this.x - 2, y: this.y - 3, w: this.w + 4, h: this.h + 3 };
  }

  intersectsAttack(sword: Aabb): boolean {
    return !this.isDead() && aabbOverlap(sword, this.damageReceivePose());
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (this.hp <= 0 || this.hitstun > 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    const away =
      this.x + this.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = knockbackFor(strike.knockKind, away);
    this.vx = kb.vx;
    this.vy = kb.vy;
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

  private applyGravity(dt: number): void {
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;
  }

  private shouldTurnAtEdgeOrWall(map: TileMap): boolean {
    const footY = this.y + this.h;
    const probeX = this.facing > 0 ? this.x + this.w + 1 : this.x - 1;
    const wallTx = Math.floor(probeX / TILE_SIZE);
    const bodyTy = Math.floor((this.y + this.h * 0.5) / TILE_SIZE);
    if (map.isSolidTile(wallTx, bodyTy)) return true;
    const aheadTx = Math.floor((this.x + this.w * 0.5 + this.facing * (this.w * 0.5 + 2)) / TILE_SIZE);
    const footTy = Math.floor((footY + 1) / TILE_SIZE);
    if (!map.isSolidTile(aheadTx, footTy) && !map.isPlatformTile(aheadTx, footTy)) return true;
    return false;
  }

  private moveAndCollide(dt: number, map: TileMap): void {
    this.x += this.vx * dt;
    this.resolveHorizontal(map);
    const prevFoot = this.y + this.h;
    this.y += this.vy * dt;
    this.onGround = false;
    this.resolveVertical(map, prevFoot);
  }

  private resolveHorizontal(map: TileMap): void {
    if (this.overlapsSolid(map)) {
      // Step back greedily
      const step = Math.sign(this.vx) || this.facing;
      for (let i = 0; i < 16; i++) {
        this.x -= step;
        if (!this.overlapsSolid(map)) break;
      }
      this.vx = 0;
      this.facing = -this.facing;
    }
  }

  private resolveVertical(map: TileMap, prevFoot: number): void {
    if (this.vy >= 0) {
      let best = Number.POSITIVE_INFINITY;
      const left = Math.floor((this.x + 0.001) / TILE_SIZE);
      const right = Math.floor((this.x + this.w - 0.001) / TILE_SIZE);
      const top = Math.floor((Math.min(prevFoot, this.y + this.h) - 0.001) / TILE_SIZE);
      const bottom = Math.floor((Math.max(prevFoot, this.y + this.h) + 0.001) / TILE_SIZE);
      for (let ty = top; ty <= bottom + 1; ty++) {
        for (let tx = left; tx <= right; tx++) {
          if (!map.isSolidTile(tx, ty) && !map.isPlatformTile(tx, ty)) continue;
          const floorY = ty * TILE_SIZE;
          if (prevFoot <= floorY + 1e-3 && this.y + this.h >= floorY - 1e-3) {
            if (map.isPlatformTile(tx, ty)) {
              if (this.y + this.h > floorY + PLATFORM_DECK_SLACK_PX) continue;
            }
            best = Math.min(best, floorY);
          }
        }
      }
      if (Number.isFinite(best)) {
        this.y = best - this.h;
        this.vy = 0;
        this.onGround = true;
      }
    } else if (this.overlapsSolid(map)) {
      this.y = Math.ceil(this.y / TILE_SIZE) * TILE_SIZE;
      this.vy = 0;
    }
  }

  private overlapsSolid(map: TileMap): boolean {
    const left = Math.floor((this.x + 0.001) / TILE_SIZE);
    const right = Math.floor((this.x + this.w - 0.001) / TILE_SIZE);
    const top = Math.floor((this.y + 0.001) / TILE_SIZE);
    const bottom = Math.floor((this.y + this.h - 0.001) / TILE_SIZE);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (map.isSolidTile(tx, ty)) return true;
      }
    }
    return false;
  }
}
