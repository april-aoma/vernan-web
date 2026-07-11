import { HitboxPose } from "../collision/HitboxPose";
import { freezeFrames, knockbackForFrisbee, type ProjectileStrike } from "../combat/CombatMath";
import {
  PROJECTILE_CARRY_BLOCK_HIT_LOCAL,
  PROJECTILE_CARRY_BLOCK_HIT_PIVOT_X,
  PROJECTILE_CARRY_BLOCK_LOCAL,
  PROJECTILE_CARRY_BLOCK_PIVOT_X,
  PROJECTILE_CARRY_FRUIT_HIT_LOCAL,
  PROJECTILE_CARRY_FRUIT_HIT_PIVOT_X,
  PROJECTILE_CARRY_FRUIT_LOCAL,
  PROJECTILE_CARRY_FRUIT_PIVOT_X,
} from "../config/HitboxValues";
import { GRAVITY } from "../config/Physics";
import {
  backstepPositionUntilClear,
  nudgePositionOutOfSolidTiles,
  overlapsAnySolidTile,
  PICKUP_BACKSTEP_MAX_ITER,
} from "../physics/SolidOverlap";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "../entity/CombatEnemy";
import type { CarryPayload } from "./CarryPayload";
import { isTileBreakableCarry } from "./CarryPayload";
import { CarryKind } from "./CarryKind";
import { SPRITE_H, SPRITE_W } from "./CarryFruitLayout";
import {
  applyAirDamping,
  arcThrowVy,
  floorBounce,
  fruitStatsForPayload,
  gentleDropVy,
  gravityMultiplier,
  wallBounce,
} from "./FruitVariantStats";

/** SMB2-style thrown carry projectile (Java ThrownCarryProjectile thin). */
export class ThrownCarryProjectile {
  static readonly MIN_THROW_SPEED = 84;
  private static readonly MAX_FALL_VY = 320;
  private static readonly GRAVITY_MUL = 1;
  private static readonly WALL_BOUNCE = 0.55;
  private static readonly FLOOR_BOUNCE = 0.42;
  private static readonly BLOCK_EPS_FRAC = 0.42;
  private static readonly SETTLE_MAX_VY = 55;

  readonly payload: CarryPayload;
  x: number;
  y: number;
  vx: number;
  vy: number;
  private alive = true;
  private settled = false;
  private readonly hitEnemyIndicesThisSegment = new Set<number>();

  constructor(payload: CarryPayload, x: number, y: number, vx: number, vy: number) {
    this.payload = payload;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  isAlive(): boolean {
    return this.alive;
  }

  kill(): void {
    this.alive = false;
  }

  isSettledFruit(): boolean {
    return this.alive && this.settled && this.payload.kind === CarryKind.FRUIT;
  }

  isSettled(): boolean {
    return this.alive && this.settled;
  }

  markSettled(): void {
    this.settled = true;
    this.vx = 0;
    this.vy = 0;
    this.hitEnemyIndicesThisSegment.clear();
  }

  piercesEnemies(): boolean {
    return this.payload.kind === CarryKind.FRUIT;
  }

  copySettled(): ThrownCarryProjectile {
    const copy = new ThrownCarryProjectile(this.payload, this.x, this.y, 0, 0);
    copy.markSettled();
    return copy;
  }

  collisionPose(facingSign: number): HitboxPose {
    if (this.payload.kind === CarryKind.BREAKABLE_BLOCK) {
      return new HitboxPose(
        PROJECTILE_CARRY_BLOCK_LOCAL,
        this.x,
        this.y,
        facingSign,
        PROJECTILE_CARRY_BLOCK_PIVOT_X,
        1,
      );
    }
    return new HitboxPose(
      PROJECTILE_CARRY_FRUIT_LOCAL,
      this.x,
      this.y,
      facingSign,
      PROJECTILE_CARRY_FRUIT_PIVOT_X,
      1,
    );
  }

  damagePose(facingSign: number): HitboxPose {
    if (this.payload.kind === CarryKind.BREAKABLE_BLOCK) {
      return new HitboxPose(
        PROJECTILE_CARRY_BLOCK_HIT_LOCAL,
        this.x,
        this.y,
        facingSign,
        PROJECTILE_CARRY_BLOCK_HIT_PIVOT_X,
        1,
      );
    }
    return new HitboxPose(
      PROJECTILE_CARRY_FRUIT_HIT_LOCAL,
      this.x,
      this.y,
      facingSign,
      PROJECTILE_CARRY_FRUIT_HIT_PIVOT_X,
      1,
    );
  }

  updatePhysics(dt: number, map: TileMap): void {
    if (!this.alive || this.settled) return;
    const fruitStats = fruitStatsForPayload(this.payload);
    const gravMul =
      this.payload.kind === CarryKind.FRUIT
        ? gravityMultiplier(fruitStats)
        : ThrownCarryProjectile.GRAVITY_MUL;
    const wBounce =
      this.payload.kind === CarryKind.FRUIT ? wallBounce(fruitStats) : ThrownCarryProjectile.WALL_BOUNCE;
    const fBounce =
      this.payload.kind === CarryKind.FRUIT ? floorBounce(fruitStats) : ThrownCarryProjectile.FLOOR_BOUNCE;

    this.vy = Math.min(ThrownCarryProjectile.MAX_FALL_VY, this.vy + GRAVITY * gravMul * dt);
    if (this.payload.kind === CarryKind.FRUIT) {
      applyAirDamping(fruitStats, dt, this);
    }

    const poseAt = (ax: number, ay: number) => {
      const fs = this.vx >= 0 ? 1 : -1;
      if (this.payload.kind === CarryKind.BREAKABLE_BLOCK) {
        return new HitboxPose(
          PROJECTILE_CARRY_BLOCK_LOCAL,
          ax,
          ay,
          fs,
          PROJECTILE_CARRY_BLOCK_PIVOT_X,
          1,
        );
      }
      return new HitboxPose(
        PROJECTILE_CARRY_FRUIT_LOCAL,
        ax,
        ay,
        fs,
        PROJECTILE_CARRY_FRUIT_PIVOT_X,
        1,
      );
    };
    if (overlapsAnySolidTile(map, poseAt(this.x, this.y))) {
      const popped = nudgePositionOutOfSolidTiles(
        map,
        this.x,
        this.y,
        (ax, ay) => poseAt(ax, ay),
        1,
        32,
      );
      this.x = popped.x;
      this.y = popped.y;
    }

    const ox = this.x;
    const oy = this.y;
    const nx = ox + this.vx * dt;
    const hClear = backstepPositionUntilClear(
      map,
      ox,
      oy,
      nx,
      oy,
      (ax, ay) => poseAt(ax, ay),
      PICKUP_BACKSTEP_MAX_ITER,
    );
    this.x = hClear.x;
    this.y = hClear.y;
    const hIx = nx - ox;
    const hAx = this.x - ox;
    const wallHit = Math.abs(hIx) > 1e-4 && Math.abs(hAx) < Math.abs(hIx) * ThrownCarryProjectile.BLOCK_EPS_FRAC;
    if (wallHit) {
      if (isTileBreakableCarry(this.payload.kind)) {
        this.kill();
        return;
      }
      this.vx = -this.vx * wBounce;
      this.hitEnemyIndicesThisSegment.clear();
    }

    const ox2 = this.x;
    const oy2 = this.y;
    const ny = oy2 + this.vy * dt;
    const vClear = backstepPositionUntilClear(
      map,
      ox2,
      oy2,
      ox2,
      ny,
      (ax, ay) => poseAt(ax, ay),
      PICKUP_BACKSTEP_MAX_ITER,
    );
    this.x = vClear.x;
    this.y = vClear.y;
    const vIy = ny - oy2;
    const vAy = this.y - oy2;
    const vertBlocked =
      Math.abs(vIy) > 1e-4 && Math.abs(vAy) < Math.abs(vIy) * ThrownCarryProjectile.BLOCK_EPS_FRAC;
    if (vertBlocked) {
      if (isTileBreakableCarry(this.payload.kind)) {
        this.kill();
        return;
      }
      if (this.vy >= 0 && vIy >= 0) {
        if (Math.abs(this.vy) < ThrownCarryProjectile.SETTLE_MAX_VY) {
          this.snapCarryToFloor(map);
          this.markSettled();
        } else {
          this.vy = -Math.abs(this.vy) * fBounce;
          this.hitEnemyIndicesThisSegment.clear();
        }
      } else if (this.vy < 0) {
        this.vy = -this.vy * wBounce;
        this.hitEnemyIndicesThisSegment.clear();
      }
    }
  }

  applyEnemyHits(
    enemies: readonly CombatEnemy[],
    baseThrowDamage: number,
    onHit: (enemy: CombatEnemy, strike: ProjectileStrike) => void,
  ): boolean {
    if (!this.alive || this.settled) return false;
    const dmg = baseThrowDamage;
    const fs = this.vx >= 0 ? 1 : -1;
    const pose = this.damagePose(fs);
    const hitBounds = pose.bounds();
    const debrisCx = hitBounds.x + hitBounds.w * 0.5;
    const debrisCy = hitBounds.y + hitBounds.h * 0.5;
    let killed = false;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (this.piercesEnemies() && this.hitEnemyIndicesThisSegment.has(i)) continue;
      if (e.isDead()) continue;
      if (!e.intersectsProjectile(pose)) continue;
      const freeze = freezeFrames(dmg, 1);
      const strike: ProjectileStrike = {
        damage: dmg,
        freezeFrames: freeze,
        projectileVelX: this.vx,
        projectileVelY: -165,
        knockKind: "frisbee",
        debrisCenterWorldX: debrisCx,
        debrisCenterWorldY: debrisCy,
      };
      onHit(e, strike);
      if (isTileBreakableCarry(this.payload.kind)) {
        this.kill();
        killed = true;
        break;
      }
      this.hitEnemyIndicesThisSegment.add(i);
    }
    return killed;
  }

  private snapCarryToFloor(map: TileMap): void {
    if (this.payload.kind !== CarryKind.FRUIT) return;
    const footY = this.y + SPRITE_H;
    const footX = this.x + SPRITE_W * 0.5;
    const tyFoot = Math.floor(footY / TILE_SIZE);
    const txFoot = Math.floor(footX / TILE_SIZE);
    if (map.isStandableFloorTile(txFoot, tyFoot)) {
      const surfaceY = tyFoot * TILE_SIZE;
      this.y += surfaceY - 1e-3 - footY;
    }
  }

  static launchVy(payload: CarryPayload, throwSpeed: number, arcThrow: boolean): number {
    if (!arcThrow) return 0;
    if (payload.kind === CarryKind.FRUIT) {
      return arcThrowVy(fruitStatsForPayload(payload), throwSpeed);
    }
    return -throwSpeed * 0.55;
  }

  static gentleDropVyFor(payload: CarryPayload): number {
    if (payload.kind === CarryKind.FRUIT) return gentleDropVy(fruitStatsForPayload(payload));
    return 120;
  }
}

export function knockbackFromCarryStrike(strike: ProjectileStrike) {
  return knockbackForFrisbee(strike.projectileVelX);
}
