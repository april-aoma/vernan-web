import { HitboxPose } from "../collision/HitboxPose";
import {
  PROJECTILE_PENIS_BULLET_HIT_LOCAL,
  PROJECTILE_PENIS_BULLET_HIT_PIVOT_X,
  PROJECTILE_PENIS_BULLET_LOCAL,
  PROJECTILE_PENIS_BULLET_PIVOT_X,
} from "../config/HitboxValues";
import { GRAVITY } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";

/** Java Penisman.Bullet — arcing floor projectile. */
export class PenismanBullet {
  static readonly HITBOX_W = 6;
  static readonly HITBOX_H = 6;
  static readonly FLIGHT_ANIM_FRAME_SEC = 0.09;
  private static readonly INIT_VX = 92;
  private static readonly INIT_VY = -155;
  private static readonly MAX_BULLET_FALL = 5000;

  x: number;
  y: number;
  vx: number;
  vy: number;
  alive = true;
  private hitlagBeforeRemove = 0;
  private playerOverlapDone = false;
  private animFrame = 0;
  private animAccum = 0;
  private visualAge = 0;

  constructor(x: number, y: number, dir: number) {
    this.x = x;
    this.y = y;
    this.vx = dir * PenismanBullet.INIT_VX;
    this.vy = PenismanBullet.INIT_VY + (Math.random() - 0.5) * 24;
  }

  private facingSign(): number {
    return this.vx >= 0 ? 1 : -1;
  }

  collisionPose(): HitboxPose {
    return new HitboxPose(
      PROJECTILE_PENIS_BULLET_LOCAL,
      this.x,
      this.y,
      this.facingSign(),
      PROJECTILE_PENIS_BULLET_PIVOT_X,
    );
  }

  damagePose(): HitboxPose {
    return new HitboxPose(
      PROJECTILE_PENIS_BULLET_HIT_LOCAL,
      this.x,
      this.y,
      this.facingSign(),
      PROJECTILE_PENIS_BULLET_HIT_PIVOT_X,
    );
  }

  centerX(): number {
    return this.x + PenismanBullet.HITBOX_W * 0.5;
  }

  centerY(): number {
    return this.y + PenismanBullet.HITBOX_H * 0.5;
  }

  getAnimFrame(): number {
    return this.animFrame;
  }

  visualScale(): number {
    return 1 + 0.32 * Math.sin(this.visualAge * 13);
  }

  kill(): void {
    this.alive = false;
  }

  beginHitlagThenRemove(hitlagSec: number): void {
    this.playerOverlapDone = true;
    this.hitlagBeforeRemove = Math.max(this.hitlagBeforeRemove, Math.max(0, hitlagSec));
  }

  playerOverlapHandled(): boolean {
    return this.playerOverlapDone;
  }

  update(dt: number, map: TileMap): boolean {
    if (!this.alive) return false;
    if (this.hitlagBeforeRemove > 0) {
      this.hitlagBeforeRemove -= dt;
      if (this.hitlagBeforeRemove <= 0) {
        this.alive = false;
      }
      return false;
    }
    this.visualAge += dt;
    this.vy += GRAVITY * dt;
    if (this.vy > PenismanBullet.MAX_BULLET_FALL) this.vy = PenismanBullet.MAX_BULLET_FALL;

    this.x += this.vx * dt;
    if (this.resolveHorizontalBullet(map)) {
      this.alive = false;
      return true;
    }

    const prevBottom = this.y + PenismanBullet.HITBOX_H;
    const prevTop = this.y;
    this.y += this.vy * dt;
    if (this.resolveVerticalBullet(map, prevBottom, prevTop)) {
      this.alive = false;
      return true;
    }

    this.animAccum += dt;
    while (this.animAccum >= PenismanBullet.FLIGHT_ANIM_FRAME_SEC) {
      this.animAccum -= PenismanBullet.FLIGHT_ANIM_FRAME_SEC;
      this.animFrame = (this.animFrame + 1) % 2;
    }
    return false;
  }

  private resolveHorizontalBullet(map: TileMap): boolean {
    const r = this.collisionPose().bounds();
    const ts = TILE_SIZE;
    const topTile = Math.floor((r.y + 0.001) / ts);
    const bottomTile = Math.floor((r.y + r.h - 0.001) / ts);
    if (this.vx > 0) {
      const rightTile = Math.floor(r.x + r.w) / ts;
      for (let ty = topTile; ty <= bottomTile; ty++) {
        if (map.isSolidTile(rightTile, ty)) return true;
      }
    } else if (this.vx < 0) {
      const leftTile = Math.floor(r.x / ts);
      for (let ty = topTile; ty <= bottomTile; ty++) {
        if (map.isSolidTile(leftTile, ty)) return true;
      }
    }
    return false;
  }

  private resolveVerticalBullet(map: TileMap, prevBottom: number, prevTop: number): boolean {
    const r = this.collisionPose().bounds();
    const ts = TILE_SIZE;
    if (this.vy > 0) {
      const nextBottom = r.y + r.h;
      const bottomTile = Math.floor((nextBottom - 1e-4) / ts);
      const leftTile = Math.floor((r.x + 0.001) / ts);
      const rightTile = Math.floor((r.x + r.w - 0.001) / ts);
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!map.isSolidTile(tx, bottomTile)) continue;
        const floorY = bottomTile * ts;
        const prevBottomTile = Math.floor((prevBottom - 1e-4) / TILE_SIZE);
        const crossedFromAbove =
          prevBottom <= floorY + 1e-3 || prevBottomTile < bottomTile;
        if (crossedFromAbove && nextBottom >= floorY - 1e-3) return true;
      }
    } else if (this.vy < 0) {
      const nextTop = r.y;
      const topTile = Math.floor((nextTop + 1e-4) / ts);
      const leftTile = Math.floor((r.x + 0.001) / ts);
      const rightTile = Math.floor((r.x + r.w - 0.001) / ts);
      const ceilingBottomY = (topTile + 1) * ts;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (!map.isSolidTile(tx, topTile)) continue;
        if (prevTop >= ceilingBottomY - 1e-3 && nextTop <= ceilingBottomY + 1e-3) {
          return true;
        }
      }
    }
    return false;
  }
}
