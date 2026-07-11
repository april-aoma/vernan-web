import { HitboxPose } from "../collision/HitboxPose";
import {
  PROJECTILE_JACK_BONE_HIT_LOCAL,
  PROJECTILE_JACK_BONE_HIT_PIVOT_X,
  PROJECTILE_JACK_BONE_LOCAL,
  PROJECTILE_JACK_BONE_PIVOT_X,
} from "../config/HitboxValues";
import { GRAVITY } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";

/** Java JackBlue.Bone — arcing bone projectile. */
export class JackBlueBone {
  static readonly FRAME_W = 16;
  static readonly FRAME_H = 16;
  private static readonly SPEED = 60;
  private static readonly INIT_VY = -180;
  private static readonly SPIN_RAD_PER_SEC = 22;
  private static readonly MAX_FALL = 5000;

  x: number;
  y: number;
  vx: number;
  vy: number;
  alive = true;
  private readonly facingDir: number;
  private angleRad = 0;
  private playerOverlapDone = false;

  constructor(x: number, y: number, dir: number) {
    this.x = x;
    this.y = y;
    this.facingDir = dir >= 0 ? 1 : -1;
    this.vx = this.facingDir * JackBlueBone.SPEED;
    this.vy = JackBlueBone.INIT_VY;
  }

  centerX(): number {
    return this.x + JackBlueBone.FRAME_W * 0.5;
  }

  centerY(): number {
    return this.y + JackBlueBone.FRAME_H * 0.5;
  }

  renderAngleRad(): number {
    return this.angleRad;
  }

  collisionPose(): HitboxPose {
    return new HitboxPose(
      PROJECTILE_JACK_BONE_LOCAL,
      this.x,
      this.y,
      this.facingDir,
      PROJECTILE_JACK_BONE_PIVOT_X,
    );
  }

  damagePose(): HitboxPose {
    return new HitboxPose(
      PROJECTILE_JACK_BONE_HIT_LOCAL,
      this.x,
      this.y,
      this.facingDir,
      PROJECTILE_JACK_BONE_HIT_PIVOT_X,
    );
  }

  markPlayerHit(): void {
    this.playerOverlapDone = true;
    this.alive = false;
  }

  playerOverlapHandled(): boolean {
    return this.playerOverlapDone;
  }

  facingSign(): number {
    return this.facingDir;
  }

  /** @returns true when the bone should spawn break FX */
  update(dt: number, map: TileMap): boolean {
    if (!this.alive) return false;
    this.angleRad += (this.facingDir > 0 ? 1 : -1) * JackBlueBone.SPIN_RAD_PER_SEC * dt;
    this.vy += GRAVITY * dt;
    if (this.vy > JackBlueBone.MAX_FALL) this.vy = JackBlueBone.MAX_FALL;

    this.x += this.vx * dt;
    if (this.hitsWall(map)) {
      this.alive = false;
      return true;
    }

    const prevBottom = this.y + JackBlueBone.FRAME_H;
    this.y += this.vy * dt;
    if (this.hitsFloor(map, prevBottom)) {
      this.alive = false;
      return true;
    }
    return false;
  }

  private hitsWall(map: TileMap): boolean {
    const r = this.collisionPose().bounds();
    const minTx = Math.floor(r.x / TILE_SIZE);
    const maxTx = Math.floor((r.x + r.w - 1e-9) / TILE_SIZE);
    const minTy = Math.floor(r.y / TILE_SIZE);
    const maxTy = Math.floor((r.y + r.h - 1e-9) / TILE_SIZE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (map.isSolidTile(tx, ty)) return true;
      }
    }
    return false;
  }

  private hitsFloor(map: TileMap, prevBottom: number): boolean {
    if (this.vy <= 0) return false;
    const r = this.collisionPose().bounds();
    const nextBottom = r.y + r.h;
    const bottomTile = Math.floor((nextBottom - 1e-4) / TILE_SIZE);
    const leftTile = Math.floor((r.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((r.x + r.w - 0.001) / TILE_SIZE);
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (map.isSolidTile(tx, bottomTile)) {
        const floorY = bottomTile * TILE_SIZE;
        const prevBottomTile = Math.floor((prevBottom - 1e-4) / TILE_SIZE);
        const crossed = prevBottom <= floorY + 1e-3 || prevBottomTile < bottomTile;
        if (crossed && nextBottom >= floorY - 1e-3) return true;
      }
      if (map.isPlatformTile(tx, bottomTile)) {
        const floorY = bottomTile * TILE_SIZE;
        const prevBottomTile = Math.floor((prevBottom - 1e-4) / TILE_SIZE);
        const crossed = prevBottom <= floorY + 1e-3 || prevBottomTile < bottomTile;
        if (crossed && nextBottom >= floorY - 1e-3) return true;
      }
    }
    return false;
  }
}
