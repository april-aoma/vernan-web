import { HitboxPose } from "../collision/HitboxPose";
import { polygonIntersectsAabb } from "../collision/polygonIntersect";
import {
  freezeFrames,
  type ProjectileStrike,
} from "../combat/CombatMath";
import {
  FLINT_FIRE_HIT_LOCAL,
  FLINT_FIRE_HIT_PIVOT_X,
  FLINT_FIRE_LOCAL,
  FLINT_FIRE_PIVOT_X,
} from "../config/HitboxValues";
import { GRAVITY } from "../config/Physics";
import { AutismCombat } from "../item/effect/AutismCombat";
import { KaleidoscopeEyeCombat } from "../item/effect/kaleidoscope/KaleidoscopeEyeCombat";
import {
  backstepPositionUntilClear,
  overlapsAnySolidTile,
  PICKUP_BACKSTEP_MAX_ITER,
} from "../physics/SolidOverlap";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";

/** Java FlintFire — arcing fire patch with per-loop damage. */
export class FlintFire {
  static readonly FRAME_DURATION_SEC = 0.13;
  static readonly LOOP_DAMAGE = 0.5;
  static readonly GRAVITY_MUL = 0.85;
  static readonly LIFETIME_SEC = 2.4;
  static readonly FADE_START_SEC = 1.8;

  x: number;
  y: number;
  readonly w: number;
  readonly h: number;
  vx: number;
  vy: number;
  private ageSec = 0;
  private animAccum = 0;
  private animFrame = 0;
  private dissipated = false;
  private readonly hitEnemyThisFrame = new Set<CombatEnemy>();
  private readonly onDamagedEnemy: ((e: CombatEnemy) => void) | null;

  constructor(
    x: number,
    y: number,
    w: number,
    h: number,
    vx: number,
    vy: number,
    onDamagedEnemy: ((e: CombatEnemy) => void) | null,
  ) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vx = vx;
    this.vy = vy;
    this.onDamagedEnemy = onDamagedEnemy;
  }

  isDissipated(): boolean {
    return this.dissipated;
  }

  animFrameIndex(): number {
    return this.animFrame;
  }

  renderAlpha(): number {
    if (this.ageSec < FlintFire.FADE_START_SEC) return 1;
    const t = (this.ageSec - FlintFire.FADE_START_SEC) / (FlintFire.LIFETIME_SEC - FlintFire.FADE_START_SEC);
    return Math.max(0, 1 - t);
  }

  spriteVisualScale(): number {
    return 1;
  }

  earthboundScanlineOffsetWorldX(row: number): number {
    return Math.sin(this.ageSec * 14 + row * 0.55) * 0.8;
  }

  collisionPose(): HitboxPose {
    return new HitboxPose(FLINT_FIRE_LOCAL, this.x, this.y, 1, FLINT_FIRE_PIVOT_X, 1);
  }

  damagePose(): HitboxPose {
    return new HitboxPose(FLINT_FIRE_HIT_LOCAL, this.x, this.y, 1, FLINT_FIRE_HIT_PIVOT_X, 1);
  }

  centerX(): number {
    return this.x + this.w * 0.5;
  }

  centerY(): number {
    return this.y + this.h * 0.5;
  }

  update(dt: number, map: TileMap, enemies: CombatEnemy[], frameDurationSec: number): void {
    if (this.dissipated) return;
    this.ageSec += dt;
    if (this.ageSec >= FlintFire.LIFETIME_SEC) {
      this.dissipated = true;
      return;
    }

    this.vy += GRAVITY * FlintFire.GRAVITY_MUL * dt;
    const ox = this.x;
    const oy = this.y;
    const nx = ox + this.vx * dt;
    const builder = (ax: number, ay: number) =>
      new HitboxPose(FLINT_FIRE_LOCAL, ax, ay, 1, FLINT_FIRE_PIVOT_X, 1);
    const hClear = backstepPositionUntilClear(map, ox, oy, nx, oy, builder, PICKUP_BACKSTEP_MAX_ITER);
    this.x = hClear.x;
    this.y = hClear.y;
    if (Math.abs(nx - ox) > 1e-4 && Math.abs(this.x - ox) < Math.abs(nx - ox) * 0.42) {
      this.vx *= -0.35;
    }
    const nx2 = this.x;
    const ny2 = oy + this.vy * dt;
    const vClear = backstepPositionUntilClear(map, nx2, oy, nx2, ny2, builder, PICKUP_BACKSTEP_MAX_ITER);
    this.x = vClear.x;
    this.y = vClear.y;
    if (Math.abs(ny2 - oy) > 1e-4 && Math.abs(this.y - oy) < Math.abs(ny2 - oy) * 0.42) {
      if (this.vy > 0) {
        this.vy *= -0.2;
        this.vx *= 0.72;
      } else {
        this.vy *= -0.25;
      }
    }
    if (overlapsAnySolidTile(map, builder(this.x, this.y))) {
      this.dissipated = true;
      return;
    }

    const prevFrame = this.animFrame;
    this.animAccum += dt;
    while (this.animAccum >= frameDurationSec) {
      this.animAccum -= frameDurationSec;
      this.animFrame++;
    }
    if (this.animFrame !== prevFrame) {
      this.hitEnemyThisFrame.clear();
      this.applyLoopHits(enemies);
    }
  }

  private applyLoopHits(enemies: CombatEnemy[]): void {
    const pose = this.damagePose();
    const cx = this.centerX();
    const cy = this.centerY();
    for (const e of enemies) {
      if (e.isDead() || this.hitEnemyThisFrame.has(e)) continue;
      const hurt = e.damageReceivePose();
      if (!polygonIntersectsAabb(pose.worldVertices(), hurt)) continue;
      if (e.applyFlintFireLoopDamage?.(FlintFire.LOOP_DAMAGE, cx, cy)) {
        this.hitEnemyThisFrame.add(e);
        AutismCombat.notifyPlayerDamageDealt(e, FlintFire.LOOP_DAMAGE);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, FlintFire.LOOP_DAMAGE);
        this.onDamagedEnemy?.(e);
      } else {
        const strike: ProjectileStrike = {
          damage: FlintFire.LOOP_DAMAGE,
          freezeFrames: freezeFrames(FlintFire.LOOP_DAMAGE, 1),
          projectileVelX: 0,
          projectileVelY: 0,
          knockKind: "flint_fire_pull",
          debrisCenterWorldX: cx,
          debrisCenterWorldY: cy,
        };
        if (e.applyProjectileStrike(strike)) {
          this.hitEnemyThisFrame.add(e);
          AutismCombat.notifyPlayerDamageDealt(e, FlintFire.LOOP_DAMAGE);
          KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, FlintFire.LOOP_DAMAGE);
          this.onDamagedEnemy?.(e);
        }
      }
    }
  }
}
