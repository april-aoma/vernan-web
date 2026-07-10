import { HitboxPose } from "../collision/HitboxPose";
import { polygonIntersectsAabb } from "../collision/polygonIntersect";
import type { Aabb } from "../combat/CombatMath";
import { freezeFrames, type ProjectileStrike } from "../combat/CombatMath";
import {
  PROJECTILE_LEMON_SHOT_HIT_LOCAL,
  PROJECTILE_LEMON_SHOT_HIT_PIVOT_X,
  PROJECTILE_LEMON_SHOT_LOCAL,
  PROJECTILE_LEMON_SHOT_PIVOT_X,
} from "../config/HitboxValues";
import {
  backstepPositionUntilClear,
  PICKUP_BACKSTEP_MAX_ITER,
} from "../physics/SolidOverlap";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";

const SPEED = 300 * 0.85;
const BLOCK_EPS_FRAC = 0.42;
const OFFSCREEN_DESPAWN_MARGIN_PX = 140;

/** Player lemon buster (Java LemonProjectile). */
export class LemonProjectile {
  readonly damage: number;
  x: number;
  y: number;
  vx: number;
  private alive = true;

  constructor(x: number, y: number, facingSign: number, damage: number) {
    this.x = x;
    this.y = y;
    this.damage = damage;
    this.vx = facingSign * SPEED;
  }

  isAlive(): boolean {
    return this.alive;
  }

  collisionPose(facingSign: number): HitboxPose {
    return new HitboxPose(
      PROJECTILE_LEMON_SHOT_LOCAL,
      this.x,
      this.y,
      facingSign,
      PROJECTILE_LEMON_SHOT_PIVOT_X,
      1,
    );
  }

  damagePose(facingSign: number): HitboxPose {
    return new HitboxPose(
      PROJECTILE_LEMON_SHOT_HIT_LOCAL,
      this.x,
      this.y,
      facingSign,
      PROJECTILE_LEMON_SHOT_HIT_PIVOT_X,
      1,
    );
  }

  update(
    dt: number,
    map: TileMap,
    cameraView: Aabb | null,
    tryStrikeTiles: (bounds: Aabb) => boolean,
  ): void {
    if (!this.alive) return;
    const fs = this.vx >= 0 ? 1 : -1;
    if (cameraView && this.isFullyOutside(cameraView, fs)) {
      this.alive = false;
      return;
    }
    const builder = (ax: number, ay: number) =>
      new HitboxPose(
        PROJECTILE_LEMON_SHOT_LOCAL,
        ax,
        ay,
        fs,
        PROJECTILE_LEMON_SHOT_PIVOT_X,
        1,
      );
    const ox = this.x;
    const oy = this.y;
    const nx = ox + this.vx * dt;
    const hClear = backstepPositionUntilClear(map, ox, oy, nx, oy, builder, PICKUP_BACKSTEP_MAX_ITER);
    this.x = hClear.x;
    this.y = hClear.y;
    const hIx = nx - ox;
    const hAx = this.x - ox;
    if (Math.abs(hIx) > 1e-4 && Math.abs(hAx) < Math.abs(hIx) * BLOCK_EPS_FRAC) {
      this.alive = false;
      return;
    }
    if (tryStrikeTiles(this.collisionPose(fs).bounds())) {
      this.alive = false;
      return;
    }
    if (cameraView && this.isFullyOutside(cameraView, fs)) {
      this.alive = false;
    }
  }

  applyHits(enemies: CombatEnemy[]): void {
    if (!this.alive) return;
    const fs = this.vx >= 0 ? 1 : -1;
    const pose = this.damagePose(fs);
    for (const e of enemies) {
      if (e.isDead()) continue;
      if (!polygonIntersectsAabb(pose.worldVertices(), e.damageReceivePose())) continue;
      const strike: ProjectileStrike = {
        damage: this.damage,
        freezeFrames: freezeFrames(this.damage, 1),
        projectileVelX: this.vx,
        projectileVelY: 0,
        knockKind: "lemon_shot",
      };
      e.applyProjectileStrike(strike);
      this.alive = false;
      return;
    }
  }

  private isFullyOutside(cam: Aabb, fs: number): boolean {
    const b = this.damagePose(fs).bounds();
    const l = cam.x - OFFSCREEN_DESPAWN_MARGIN_PX;
    const r = cam.x + cam.w + OFFSCREEN_DESPAWN_MARGIN_PX;
    const t = cam.y - OFFSCREEN_DESPAWN_MARGIN_PX;
    const bb = cam.y + cam.h + OFFSCREEN_DESPAWN_MARGIN_PX;
    return b.x + b.w < l || b.x > r || b.y + b.h < t || b.y > bb;
  }
}
