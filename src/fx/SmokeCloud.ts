import { HitboxPose } from "../collision/HitboxPose";
import { polygonIntersectsAabb } from "../collision/polygonIntersect";
import { freezeFrames, type ProjectileStrike } from "../combat/CombatMath";
import { SMOKE_HIT_LOCAL, SMOKE_HIT_PIVOT_X } from "../config/HitboxValues";
import { AutismCombat } from "../item/effect/AutismCombat";
import { KaleidoscopeEyeCombat } from "../item/effect/kaleidoscope/KaleidoscopeEyeCombat";
import type { CombatEnemy } from "../entity/CombatEnemy";

/**
 * Pack-of-smokes puff: rises with horizontal sine drift, damages on each anim loop
 * (Java SmokeCloud). Heat-shimmer via {@link applySmokeHeatDistortion}.
 */
export class SmokeCloud {
  static readonly ANIM_FRAME_COUNT = 4;
  static readonly FRAME_DURATION_SEC = 0.13;
  private static readonly RISE_VY = -42;
  private static readonly SINE_AMP = 18;
  private static readonly SINE_FREQ = 2.4;
  private static readonly LIFETIME_SEC = 4.5;
  private static readonly SPRITE_HIT_SCALE = 1.2;
  private static readonly SPRITE_SCALE_LERP_PER_SEC = 9;
  private static readonly INITIAL_HIT_BUDGET = 12;

  x: number;
  y: number;
  readonly w: number;
  readonly h: number;
  private vx: number;
  private vy = SmokeCloud.RISE_VY;
  private ripplePhase: number;
  private ageSec = 0;
  private animAccum = 0;
  private animFrame = 0;
  private hitsBudget = SmokeCloud.INITIAL_HIT_BUDGET;
  private spriteVisualScale = 1;
  private readonly damagePerAnimTick: number;
  private readonly damagedEnemyThisCycle = new Set<CombatEnemy>();

  constructor(
    x: number,
    y: number,
    w: number,
    h: number,
    damagePerAnimTick: number,
    initialVx: number,
  ) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.damagePerAnimTick = damagePerAnimTick;
    this.vx = initialVx;
    this.ripplePhase = Math.random() * Math.PI * 2;
  }

  animFrameIndex(): number {
    return this.animFrame;
  }

  isDissipated(): boolean {
    return this.hitsBudget <= 0 || this.ageSec >= SmokeCloud.LIFETIME_SEC;
  }

  renderAlpha(): number {
    const life = Math.max(0, 1 - this.ageSec / SmokeCloud.LIFETIME_SEC);
    const consumed = SmokeCloud.INITIAL_HIT_BUDGET - this.hitsBudget;
    const hitFade = 1 - 0.03 * consumed;
    return Math.max(0.08, Math.min(1, life * hitFade));
  }

  spriteScale(): number {
    return this.spriteVisualScale;
  }

  /** Alias for Java spriteVisualScale(). */
  spriteVisualScaleValue(): number {
    return this.spriteVisualScale;
  }

  /** Phase for localized heat-shimmer pockets (matches ripple drift). */
  distortionPhaseSec(): number {
    return this.ripplePhase;
  }

  earthboundScanlineOffsetWorldX(localRowY: number): number {
    const ry = Math.max(0, localRowY);
    return Math.round(
      Math.sin(this.ripplePhase + ry * 0.52 + this.animFrame * 0.33),
    );
  }

  update(dt: number, enemies: readonly CombatEnemy[], frameDurationSec: number): void {
    if (this.isDissipated()) return;
    this.ageSec += dt;
    if (this.ageSec >= SmokeCloud.LIFETIME_SEC) {
      this.hitsBudget = 0;
      return;
    }

    this.spriteVisualScale +=
      (1 - this.spriteVisualScale) *
      Math.min(1, dt * SmokeCloud.SPRITE_SCALE_LERP_PER_SEC);
    this.ripplePhase += dt * SmokeCloud.SINE_FREQ;
    this.vx = SmokeCloud.SINE_AMP * Math.sin(this.ripplePhase);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.animAccum += dt;
    while (this.animAccum >= frameDurationSec) {
      this.animAccum -= frameDurationSec;
      this.animFrame = (this.animFrame + 1) % SmokeCloud.ANIM_FRAME_COUNT;
      this.damagedEnemyThisCycle.clear();
      this.applyAnimTickDamage(enemies);
      if (this.hitsBudget <= 0) return;
    }
  }

  private damagePose(): HitboxPose {
    return new HitboxPose(SMOKE_HIT_LOCAL, this.x, this.y, 1, SMOKE_HIT_PIVOT_X, 1);
  }

  private applyAnimTickDamage(enemies: readonly CombatEnemy[]): void {
    const pose = this.damagePose();
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    const dmg = this.damagePerAnimTick;
    for (const e of enemies) {
      if (e.isDead() || this.damagedEnemyThisCycle.has(e)) continue;
      const hurt = e.damageReceivePose();
      if (!polygonIntersectsAabb(pose.worldVertices(), hurt)) continue;
      if (e.applySmokeLoopDamage?.(dmg, cx, cy, this.vx, this.vy)) {
        this.damagedEnemyThisCycle.add(e);
        this.spriteVisualScale = SmokeCloud.SPRITE_HIT_SCALE;
        this.hitsBudget--;
        AutismCombat.notifyPlayerDamageDealt(e, dmg);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, dmg);
        if (this.hitsBudget <= 0) return;
        continue;
      }
      const strike: ProjectileStrike = {
        damage: dmg,
        freezeFrames: freezeFrames(dmg, 0.35),
        projectileVelX: this.vx,
        projectileVelY: this.vy,
        knockKind: "contact_only",
        debrisCenterWorldX: cx,
        debrisCenterWorldY: cy,
      };
      if (e.applyProjectileStrike(strike)) {
        this.damagedEnemyThisCycle.add(e);
        this.spriteVisualScale = SmokeCloud.SPRITE_HIT_SCALE;
        this.hitsBudget--;
        AutismCombat.notifyPlayerDamageDealt(e, dmg);
        KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, dmg);
        if (this.hitsBudget <= 0) return;
      }
    }
  }
}
