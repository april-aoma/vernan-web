import { HitboxPose } from "../collision/HitboxPose";
import type { Aabb } from "../combat/CombatMath";
import { freezeFrames, type ProjectileStrike } from "../combat/CombatMath";
import { WARP_ORB_DAMAGE, WARP_ORB_MAX_LIFETIME_SEC } from "../combat/WarpOrbFx";
import {
  PROJECTILE_WARP_ORB_HIT_LOCAL,
  PROJECTILE_WARP_ORB_HIT_PIVOT_X,
  PROJECTILE_WARP_ORB_LOCAL,
  PROJECTILE_WARP_ORB_PIVOT_X,
} from "../config/HitboxValues";
import { GRAVITY } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import { AutismCombat } from "../item/effect/AutismCombat";
import { KaleidoscopeEyeCombat } from "../item/effect/kaleidoscope/KaleidoscopeEyeCombat";
import {
  backstepPositionUntilClear,
  nudgePositionOutOfSolidTiles,
  overlapsAnySolidTile,
  PICKUP_BACKSTEP_MAX_ITER,
} from "../physics/SolidOverlap";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";

/** Warp orb subweapon: arcing throw, wall bounce, teleport on floor/platform landing (Java WarpOrbProjectile). */
export class WarpOrbProjectile {
  private static readonly GRAVITY_MUL = 0.825;
  private static readonly HORIZONTAL_DRAG_PER_SEC = 0.05;
  private static readonly WALL_BOUNCE = 0.78;
  private static readonly CEILING_BOUNCE = 0.55;
  private static readonly BLOCK_EPS_FRAC = 0.42;
  private static readonly SPAWN_NUDGE_MAX_STEPS = 32;

  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly throwFromGround: boolean;

  private ageSec = 0;
  private alive = true;
  private settled = false;
  private teleportPending = false;
  private landedOnStandableSurface = false;
  private readonly hitEnemyIndicesThisSegment = new Set<number>();

  constructor(x: number, y: number, vx: number, vy: number, throwFromGround: boolean) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.throwFromGround = throwFromGround;
  }

  isAlive(): boolean {
    return this.alive;
  }

  isSettled(): boolean {
    return this.alive && this.settled;
  }

  consumeTeleportPending(): boolean {
    if (!this.teleportPending) return false;
    this.teleportPending = false;
    this.alive = false;
    return true;
  }

  landedOnStandable(): boolean {
    return this.landedOnStandableSurface;
  }

  centerWorldX(): number {
    const b = this.collisionBounds();
    return b.x + b.w * 0.5;
  }

  feetWorldY(): number {
    return this.collisionBounds().y + this.collisionBounds().h;
  }

  private collisionBounds(): Aabb {
    return this.collisionPose().bounds();
  }

  collisionPose(): HitboxPose {
    return new HitboxPose(
      PROJECTILE_WARP_ORB_LOCAL,
      this.x,
      this.y,
      1,
      PROJECTILE_WARP_ORB_PIVOT_X,
      1,
    );
  }

  damagePose(): HitboxPose {
    return new HitboxPose(
      PROJECTILE_WARP_ORB_HIT_LOCAL,
      this.x,
      this.y,
      1,
      PROJECTILE_WARP_ORB_HIT_PIVOT_X,
      1,
    );
  }

  private poseAt(ax: number, ay: number): HitboxPose {
    return new HitboxPose(PROJECTILE_WARP_ORB_LOCAL, ax, ay, 1, PROJECTILE_WARP_ORB_PIVOT_X, 1);
  }

  update(dt: number, map: TileMap, extraOneWayPlatforms: readonly Aabb[] | null, _enemies: CombatEnemy[]): void {
    if (!this.alive) return;
    this.ageSec += dt;
    if (this.ageSec >= WARP_ORB_MAX_LIFETIME_SEC) {
      this.queueTeleport();
      return;
    }
    if (this.settled) return;

    const prevFootY = this.feetWorldY();

    this.vy = Math.min(2400, this.vy + GRAVITY * WarpOrbProjectile.GRAVITY_MUL * dt);
    this.vx *= Math.exp(-WarpOrbProjectile.HORIZONTAL_DRAG_PER_SEC * dt);

    if (overlapsAnySolidTile(map, this.poseAt(this.x, this.y))) {
      const popped = nudgePositionOutOfSolidTiles(
        map,
        this.x,
        this.y,
        (ax, ay) => this.poseAt(ax, ay),
        1,
        WarpOrbProjectile.SPAWN_NUDGE_MAX_STEPS,
      );
      this.x = popped.x;
      this.y = popped.y;
    }

    let ox = this.x;
    let oy = this.y;
    const nx = ox + this.vx * dt;
    const hClear = backstepPositionUntilClear(
      map,
      ox,
      oy,
      nx,
      oy,
      (ax, ay) => this.poseAt(ax, ay),
      PICKUP_BACKSTEP_MAX_ITER,
    );
    this.x = hClear.x;
    this.y = hClear.y;
    const hIx = nx - ox;
    const hAx = this.x - ox;
    const wallHit =
      Math.abs(hIx) > 1e-4 && Math.abs(hAx) < Math.abs(hIx) * WarpOrbProjectile.BLOCK_EPS_FRAC;
    if (wallHit) {
      this.vx = -this.vx * WarpOrbProjectile.WALL_BOUNCE;
      this.hitEnemyIndicesThisSegment.clear();
    }

    ox = this.x;
    oy = this.y;
    const ny = oy + this.vy * dt;
    const vClear = backstepPositionUntilClear(
      map,
      ox,
      oy,
      ox,
      ny,
      (ax, ay) => this.poseAt(ax, ay),
      PICKUP_BACKSTEP_MAX_ITER,
    );
    this.x = vClear.x;
    this.y = vClear.y;
    const vIy = ny - oy;
    const vAy = this.y - oy;
    const vertBlocked =
      Math.abs(vIy) > 1e-4 && Math.abs(vAy) < Math.abs(vIy) * WarpOrbProjectile.BLOCK_EPS_FRAC;
    if (vertBlocked) {
      if (this.vy >= 0 && vIy >= 0) {
        this.handleFloorContact();
      } else if (this.vy < 0 && vIy < 0) {
        this.vy = -this.vy * WarpOrbProjectile.CEILING_BOUNCE;
        this.hitEnemyIndicesThisSegment.clear();
      }
    } else if (this.vy >= 0) {
      this.resolveOneWayPlatformLanding(map, extraOneWayPlatforms, prevFootY);
    }
  }

  private resolveOneWayPlatformLanding(
    map: TileMap,
    extraPlatforms: readonly Aabb[] | null,
    prevFootY: number,
  ): void {
    if (this.vy < 0 || this.settled) return;
    const b = this.collisionBounds();
    const footY = b.y + b.h;
    const ts = TILE_SIZE;
    const prevBottomTile = Math.floor((prevFootY - 1e-4) / ts);
    const nextBottomTile = Math.floor((footY - 1e-4) / ts);
    const tyLo = Math.min(prevBottomTile, nextBottomTile);
    const tyHi = Math.max(prevBottomTile, nextBottomTile);
    const txLo = Math.floor((b.x + 0.001) / ts);
    const txHi = Math.floor((b.x + b.w - 0.001) / ts);

    let bestSurfaceY = Number.POSITIVE_INFINITY;
    for (let ty = tyLo; ty <= tyHi; ty++) {
      const surfaceY = ty * ts;
      if (prevFootY > surfaceY + 1e-3) continue;
      if (footY < surfaceY - 1e-3) continue;
      for (let tx = txLo; tx <= txHi; tx++) {
        if (map.isPlatformTile(tx, ty)) {
          bestSurfaceY = Math.min(bestSurfaceY, surfaceY);
        }
      }
    }
    if (extraPlatforms) {
      for (const deck of extraPlatforms) {
        const surfaceY = deck.y;
        if (prevFootY > surfaceY + 1e-3 || footY < surfaceY - 1e-3) continue;
        if (b.x + b.w > deck.x + 1e-3 && b.x < deck.x + deck.w - 1e-3) {
          bestSurfaceY = Math.min(bestSurfaceY, surfaceY);
        }
      }
    }
    if (!Number.isFinite(bestSurfaceY)) return;
    this.y += bestSurfaceY - 1e-3 - footY;
    this.handleFloorContact();
  }

  private handleFloorContact(): void {
    this.landedOnStandableSurface = true;
    this.settleNow();
  }

  private settleNow(): void {
    this.settled = true;
    this.queueTeleport();
  }

  private queueTeleport(): void {
    this.teleportPending = true;
  }

  applyHits(enemies: CombatEnemy[]): void {
    if (!this.alive || this.settled) return;
    const pose = this.damagePose();
    const bounds = pose.bounds();
    const centerX = bounds.x + bounds.w * 0.5;
    const centerY = bounds.y + bounds.h * 0.5;

    for (let i = 0; i < enemies.length; i++) {
      if (this.hitEnemyIndicesThisSegment.has(i)) continue;
      const e = enemies[i]!;
      if (e.isDead()) continue;
      if (e.projectileBlockedByShield?.(pose)) {
        const enemyFreeze = freezeFrames(WARP_ORB_DAMAGE, 1);
        e.applyProjectileShieldBlock?.({
          damage: WARP_ORB_DAMAGE,
          freezeFrames: enemyFreeze,
          projectileVelX: this.vx,
          knockKind: "frisbee",
        });
        this.hitEnemyIndicesThisSegment.add(i);
        continue;
      }
      if (!e.intersectsProjectile(pose)) continue;

      const enemyFreeze = freezeFrames(WARP_ORB_DAMAGE, 1);
      const strike: ProjectileStrike = {
        damage: WARP_ORB_DAMAGE,
        freezeFrames: enemyFreeze,
        projectileVelX: this.vx,
        knockKind: "frisbee",
        debrisCenterWorldX: centerX,
        debrisCenterWorldY: centerY,
        contactWorldX: centerX,
        contactWorldY: centerY,
      };
      if (e.applyProjectileStrike(strike)) {
        AutismCombat.notifyPlayerDamageDealt(e, WARP_ORB_DAMAGE);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, WARP_ORB_DAMAGE);
        this.hitEnemyIndicesThisSegment.add(i);
      }
    }
  }
}
