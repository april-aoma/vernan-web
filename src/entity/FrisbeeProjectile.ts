import { HitboxPose } from "../collision/HitboxPose";
import { freezeFrames, type ProjectileStrike } from "../combat/CombatMath";
import {
  PROJECTILE_FRISBEE_HIT_LOCAL,
  PROJECTILE_FRISBEE_HIT_PIVOT_X,
  PROJECTILE_FRISBEE_LOCAL,
  PROJECTILE_FRISBEE_PIVOT_X,
} from "../config/HitboxValues";
import { GRAVITY } from "../config/Physics";
import { AutismCombat } from "../item/effect/AutismCombat";
import { KaleidoscopeEyeCombat } from "../item/effect/kaleidoscope/KaleidoscopeEyeCombat";
import {
  backstepPositionUntilClear,
  nudgePositionOutOfSolidTiles,
  overlapsAnySolidTile,
  PICKUP_BACKSTEP_MAX_ITER,
} from "../physics/SolidOverlap";
import { FIXED_STEP_HZ } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";

/** Java FrisbeeProjectile — pierce, bounce, settle, blink-out. */
export class FrisbeeProjectile {
  static readonly DAMAGE = 1.5;
  static readonly DEFAULT_GRAVITY_MUL = 0.35;
  static readonly DEFAULT_VY_CAP = 2400;
  /** Java CombatJuice.FRISBEE_PROJECTILE_HITLAG_MULTIPLIER. */
  static readonly HITLAG_MULT = 0.5;

  private static readonly MAX_LIFETIME_SEC = 8;
  private static readonly BLINK_START_SEC = 7;
  private static readonly BLINK_PERIOD_SEC = 0.1;
  private static readonly HORIZONTAL_DRAG_PER_SEC = 0.85;
  private static readonly WALL_BOUNCE = 0.78;
  private static readonly FLOOR_BOUNCE = 0.62;
  private static readonly CEILING_BOUNCE = 0.55;
  private static readonly BLOCK_EPS_FRAC = 0.42;
  private static readonly SETTLE_MAX_VY = 22;
  private static readonly SETTLE_MAX_VX = 22;
  static readonly ANIM_FRAME_COUNT = 47;
  private static readonly ANIM_FPS = 18;

  x: number;
  y: number;
  vx: number;
  vy: number;
  private ageSec = 0;
  private animAccum = 0;
  private animFrame = 0;
  private alive = true;
  private settled = false;
  private projectileHitlagTimeRemaining = 0;
  private readonly hitEnemyIndicesThisSegment = new Set<number>();
  private readonly gravityMul: number;
  private readonly vyCap: number;

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    gravityMul = FrisbeeProjectile.DEFAULT_GRAVITY_MUL,
    vyCap = FrisbeeProjectile.DEFAULT_VY_CAP,
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.gravityMul = gravityMul;
    this.vyCap = vyCap;
  }

  isAlive(): boolean {
    return this.alive;
  }

  isSettled(): boolean {
    return this.alive && this.settled;
  }

  isDrawVisible(): boolean {
    if (this.ageSec < FrisbeeProjectile.BLINK_START_SEC) return true;
    const phase = Math.floor(
      (this.ageSec - FrisbeeProjectile.BLINK_START_SEC) / FrisbeeProjectile.BLINK_PERIOD_SEC,
    );
    return phase % 2 === 0;
  }

  animFrameIndex(): number {
    return this.animFrame;
  }

  collisionPose(facingSign: number): HitboxPose {
    return new HitboxPose(
      PROJECTILE_FRISBEE_LOCAL,
      this.x,
      this.y,
      facingSign,
      PROJECTILE_FRISBEE_PIVOT_X,
      1,
    );
  }

  damagePose(facingSign: number): HitboxPose {
    return new HitboxPose(
      PROJECTILE_FRISBEE_HIT_LOCAL,
      this.x,
      this.y,
      facingSign,
      PROJECTILE_FRISBEE_HIT_PIVOT_X,
      1,
    );
  }

  private poseAt(ax: number, ay: number): HitboxPose {
    const fs = this.vx >= 0 ? 1 : -1;
    return new HitboxPose(PROJECTILE_FRISBEE_LOCAL, ax, ay, fs, PROJECTILE_FRISBEE_PIVOT_X, 1);
  }

  update(dt: number, map: TileMap, _enemies: CombatEnemy[]): void {
    if (!this.alive) return;
    this.ageSec += dt;
    if (this.ageSec >= FrisbeeProjectile.MAX_LIFETIME_SEC) {
      this.alive = false;
      return;
    }

    if (this.projectileHitlagTimeRemaining > 0) {
      this.projectileHitlagTimeRemaining -= dt;
      if (this.projectileHitlagTimeRemaining < 0) this.projectileHitlagTimeRemaining = 0;
      this.advanceAnim(dt);
      return;
    }

    if (this.settled) {
      this.advanceAnim(dt);
      return;
    }

    this.vy = Math.min(this.vyCap, this.vy + GRAVITY * this.gravityMul * dt);
    this.vx *= Math.exp(-FrisbeeProjectile.HORIZONTAL_DRAG_PER_SEC * dt);

    if (overlapsAnySolidTile(map, this.poseAt(this.x, this.y))) {
      const popped = nudgePositionOutOfSolidTiles(map, this.x, this.y, (ax, ay) => this.poseAt(ax, ay), 1, 640);
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
      Math.abs(hIx) > 1e-4 && Math.abs(hAx) < Math.abs(hIx) * FrisbeeProjectile.BLOCK_EPS_FRAC;
    if (wallHit) {
      if (Math.abs(this.vx) < FrisbeeProjectile.SETTLE_MAX_VX) {
        this.vx = 0;
      } else {
        this.vx = -this.vx * FrisbeeProjectile.WALL_BOUNCE;
        this.hitEnemyIndicesThisSegment.clear();
      }
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
      Math.abs(vIy) > 1e-4 && Math.abs(vAy) < Math.abs(vIy) * FrisbeeProjectile.BLOCK_EPS_FRAC;
    if (vertBlocked) {
      if (this.vy >= 0 && vIy >= 0) {
        if (Math.abs(this.vy) < FrisbeeProjectile.SETTLE_MAX_VY) {
          this.vx = 0;
          this.vy = 0;
          this.settled = true;
        } else {
          this.vy = -Math.abs(this.vy) * FrisbeeProjectile.FLOOR_BOUNCE;
          this.hitEnemyIndicesThisSegment.clear();
        }
      } else if (this.vy < 0 && vIy < 0) {
        this.vy = -this.vy * FrisbeeProjectile.CEILING_BOUNCE;
        this.hitEnemyIndicesThisSegment.clear();
      }
    }

    this.advanceAnim(dt);
  }

  private advanceAnim(dt: number): void {
    this.animAccum += dt;
    const frameDur = 1 / FrisbeeProjectile.ANIM_FPS;
    while (this.animAccum >= frameDur) {
      this.animAccum -= frameDur;
      this.animFrame = (this.animFrame + 1) % FrisbeeProjectile.ANIM_FRAME_COUNT;
    }
  }

  applyHits(enemies: CombatEnemy[]): void {
    if (!this.alive || this.settled) return;
    const facingSign = this.vx >= 0 ? 1 : -1;
    const pose = this.damagePose(facingSign);
    const bounds = pose.bounds();
    const centerX = bounds.x + bounds.w * 0.5;
    const centerY = bounds.y + bounds.h * 0.5;

    for (let i = 0; i < enemies.length; i++) {
      if (this.hitEnemyIndicesThisSegment.has(i)) continue;
      const e = enemies[i]!;
      if (e.isDead()) continue;
      if (e.projectileBlockedByShield?.(pose)) {
        const enemyFreeze = freezeFrames(FrisbeeProjectile.DAMAGE, 1);
        e.applyProjectileShieldBlock?.({
          damage: FrisbeeProjectile.DAMAGE,
          freezeFrames: enemyFreeze,
          projectileVelX: this.vx,
          knockKind: "frisbee",
        });
        const hl = freezeFrames(FrisbeeProjectile.DAMAGE, FrisbeeProjectile.HITLAG_MULT) / 60;
        this.projectileHitlagTimeRemaining = Math.max(this.projectileHitlagTimeRemaining, hl);
        this.hitEnemyIndicesThisSegment.add(i);
        continue;
      }
      if (!e.intersectsProjectile(pose)) continue;

      const enemyFreeze = freezeFrames(FrisbeeProjectile.DAMAGE, 1);
      const strike: ProjectileStrike = {
        damage: FrisbeeProjectile.DAMAGE,
        freezeFrames: enemyFreeze,
        projectileVelX: this.vx,
        knockKind: "frisbee",
        debrisCenterWorldX: centerX,
        debrisCenterWorldY: centerY,
        contactWorldX: centerX,
        contactWorldY: centerY,
      };
      if (e.applyProjectileStrike(strike)) {
        AutismCombat.notifyPlayerDamageDealt(e, FrisbeeProjectile.DAMAGE);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, FrisbeeProjectile.DAMAGE);
        const hl =
          freezeFrames(FrisbeeProjectile.DAMAGE, FrisbeeProjectile.HITLAG_MULT) / FIXED_STEP_HZ;
        this.projectileHitlagTimeRemaining = Math.max(this.projectileHitlagTimeRemaining, hl);
        this.hitEnemyIndicesThisSegment.add(i);
      }
    }
  }
}
