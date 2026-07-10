import type { Aabb } from "../combat/CombatMath";
import { freezeFrames, type ProjectileStrike } from "../combat/CombatMath";
import type { CombatEnemy } from "../entity/CombatEnemy";
import type { Player } from "../entity/Player";
import type { WorldCamera } from "../camera/WorldCamera";
import { AutismCombat } from "../item/effect/AutismCombat";
import { KaleidoscopeEyeCombat } from "../item/effect/kaleidoscope/KaleidoscopeEyeCombat";
import { brickChunkHitsEnemyAabb, type BrickChunk } from "./BrickChunk";
import { Possessed } from "../entity/Possessed";
import { Mouse } from "../entity/Mouse";
import { Crawler } from "../entity/Crawler";
import type { TileMap } from "../world/TileMap";

/** Java GamePanel psychic spoon constants. */
export const PSYCHIC_SPOON_DAMAGE = 0.5;
const PSYCHIC_HOMING_ACCEL = 520;
const PSYCHIC_FLOAT_FOLLOW_ACCEL = 155;
const PSYCHIC_HOMING_TARGET_SCREEN_MARGIN_WORLD_PX = 220;
const PSYCHIC_HOMING_INTER_CHUNK_FRAMES = 15;

function enemyIsDying(e: CombatEnemy): boolean {
  if (e instanceof Possessed) return e.isDying();
  if (e instanceof Crawler) return e.isDyingVisually();
  if (e instanceof Mouse) return e.isDyingVisually();
  return false;
}

function psychicHomingTargetEligibleBounds(camera: WorldCamera): Aabb {
  const v = camera.viewRect();
  const m = PSYCHIC_HOMING_TARGET_SCREEN_MARGIN_WORLD_PX;
  return { x: v.x - m, y: v.y - m, w: v.w + 2 * m, h: v.h + 2 * m };
}

function boundsOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Psychic Spoon telekinesis + homing queue (Java GamePanel psychic spoon subset).
 */
export class PsychicSpoonController {
  private readonly homingQueue: BrickChunk[] = [];
  private homingQueueIndex = 0;
  private interChunkFramesRemaining = 0;

  reset(): void {
    this.homingQueue.length = 0;
    this.homingQueueIndex = 0;
    this.interChunkFramesRemaining = 0;
  }

  clearTelekinesis(chunks: BrickChunk[]): void {
    let any = false;
    for (const b of chunks) {
      if (b.isTelekinesisActive()) {
        b.clearTelekinesis();
        any = true;
      }
    }
    if (any) this.reset();
  }

  /** Active homing dash chunk (queue head after inter-chunk delay). */
  dashTarget(chunks: BrickChunk[]): BrickChunk | null {
    if (this.interChunkFramesRemaining > 0) return null;
    if (this.homingQueueIndex >= this.homingQueue.length) return null;
    const c = this.homingQueue[this.homingQueueIndex]!;
    if (!chunks.includes(c) || c.telekinesis() !== "homing") return null;
    return c;
  }

  activate(chunks: BrickChunk[], player: Player, enemies: CombatEnemy[], camera: WorldCamera): void {
    let anyTk = false;
    for (const b of chunks) {
      if (b.isTelekinesisActive()) {
        anyTk = true;
        break;
      }
    }
    if (anyTk) {
      let hadFloat = false;
      for (const b of chunks) {
        if (b.telekinesis() === "float") hadFloat = true;
      }
      for (const b of chunks) {
        if (b.isTelekinesisActive()) b.setTelekinesisHoming();
      }
      if (hadFloat) {
        const target = this.nearestEligibleEnemy(player, enemies, camera);
        if (target) {
          this.rebuildHomingQueue(chunks, target);
        } else {
          this.reset();
        }
      }
    } else {
      const vis = camera.viewRect();
      const rnd = Math.random;
      for (const b of chunks) {
        if (!boundsOverlap(vis, b.rect())) continue;
        b.beginTelekinesisLift(rnd);
      }
    }
  }

  tick(
    dt: number,
    chunks: BrickChunk[],
    player: Player,
    enemies: CombatEnemy[],
    camera: WorldCamera,
    map: TileMap,
  ): void {
    if (this.interChunkFramesRemaining > 0) this.interChunkFramesRemaining--;
    this.steerFloat(chunks, player);
    this.steerHoming(chunks, player, enemies, camera);
    for (const b of chunks) b.update(dt, map);
    this.snapHomingVelocityToRadial(chunks, player, enemies, camera, dt);
    this.applyHits(chunks, enemies);
    this.advanceQueueAfterHits(chunks);
    this.dampWaitingHoming(chunks, dt);
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i]!.isExpired()) chunks.splice(i, 1);
    }
  }

  private nearestEligibleEnemy(
    player: Player,
    enemies: CombatEnemy[],
    camera: WorldCamera,
  ): CombatEnemy | null {
    const eligible = psychicHomingTargetEligibleBounds(camera);
    const pb = player.hurtbox();
    const px = pb.x + pb.w * 0.5;
    const py = pb.y + pb.h * 0.5;
    let best: CombatEnemy | null = null;
    let bestD2 = Infinity;
    for (const e of enemies) {
      if (e.isDead() || enemyIsDying(e)) continue;
      const hurt = e.damageReceivePose();
      if (!boundsOverlap(eligible, hurt)) continue;
      const ex = hurt.x + hurt.w * 0.5;
      const ey = hurt.y + hurt.h * 0.5;
      const d2 = (ex - px) ** 2 + (ey - py) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  private rebuildHomingQueue(chunks: BrickChunk[], target: CombatEnemy): void {
    this.homingQueue.length = 0;
    this.homingQueueIndex = 0;
    this.interChunkFramesRemaining = 0;
    const tb = target.damageReceivePose();
    const tx = tb.x + tb.w * 0.5;
    const ty = tb.y + tb.h * 0.5;
    for (const b of chunks) {
      if (b.telekinesis() === "homing") this.homingQueue.push(b);
    }
    this.homingQueue.sort((a, c) => {
      const dxa = a.debrisCenterWorldX() - tx;
      const dya = a.debrisCenterWorldY() - ty;
      const dxc = c.debrisCenterWorldX() - tx;
      const dyc = c.debrisCenterWorldY() - ty;
      return dxa * dxa + dya * dya - (dxc * dxc + dyc * dyc);
    });
  }

  private dashTargetInternal(): BrickChunk | null {
    if (this.interChunkFramesRemaining > 0) return null;
    if (this.homingQueueIndex >= this.homingQueue.length) return null;
    return this.homingQueue[this.homingQueueIndex] ?? null;
  }

  private steerFloat(chunks: BrickChunk[], player: Player): void {
    const pb = player.hurtbox();
    const px = pb.x + pb.w * 0.5;
    const py = pb.y + pb.h * 0.5;
    for (const b of chunks) {
      if (b.telekinesis() !== "float") continue;
      const slot = b.fireAnimPhaseOffset() * Math.PI * 2 * 2.37;
      const tx = px + Math.cos(slot) * 14;
      const ty = py + Math.sin(slot) * 6 - 14;
      const dx = tx - b.debrisCenterWorldX();
      const dy = ty - b.debrisCenterWorldY();
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) {
        b.setHomingAcceleration(0, 0);
      } else {
        b.setHomingAcceleration(
          (dx / len) * PSYCHIC_FLOAT_FOLLOW_ACCEL,
          (dy / len) * PSYCHIC_FLOAT_FOLLOW_ACCEL,
        );
      }
    }
  }

  private steerHoming(
    chunks: BrickChunk[],
    player: Player,
    enemies: CombatEnemy[],
    camera: WorldCamera,
  ): void {
    const target = this.nearestEligibleEnemy(player, enemies, camera);
    if (!target) {
      for (const b of chunks) {
        if (b.telekinesis() === "homing") b.clearTelekinesis();
      }
      this.reset();
      return;
    }
    const tb = target.damageReceivePose();
    const tx = tb.x + tb.w * 0.5;
    const ty = tb.y + tb.h * 0.5;
    let anyHoming = false;
    for (const b of chunks) {
      if (b.telekinesis() === "homing") {
        anyHoming = true;
        break;
      }
    }
    if (anyHoming && this.homingQueue.length === 0) {
      this.rebuildHomingQueue(chunks, target);
    }
    this.advanceQueueHead(chunks);
    const dash = this.dashTargetInternal();
    for (const b of chunks) {
      if (b.telekinesis() !== "homing") continue;
      if (b !== dash) {
        b.setHomingAcceleration(0, 0);
        continue;
      }
      const dx = tx - b.debrisCenterWorldX();
      const dy = ty - b.debrisCenterWorldY();
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) {
        b.setHomingAcceleration(0, 0);
      } else {
        b.setHomingAcceleration((dx / len) * PSYCHIC_HOMING_ACCEL, (dy / len) * PSYCHIC_HOMING_ACCEL);
      }
    }
  }

  private snapHomingVelocityToRadial(
    chunks: BrickChunk[],
    player: Player,
    enemies: CombatEnemy[],
    camera: WorldCamera,
    dt: number,
  ): void {
    const b = this.dashTargetInternal();
    if (!b || !chunks.includes(b)) return;
    const target = this.nearestEligibleEnemy(player, enemies, camera);
    if (!target) return;
    const tb = target.damageReceivePose();
    const tx = tb.x + tb.w * 0.5;
    const ty = tb.y + tb.h * 0.5;
    const rdx = tx - b.debrisCenterWorldX();
    const rdy = ty - b.debrisCenterWorldY();
    const rlen = Math.hypot(rdx, rdy);
    if (rlen < 1e-4) return;
    const ux = rdx / rlen;
    const uy = rdy / rlen;
    const dot = b.vx * ux + b.vy * uy;
    b.vx = ux * dot;
    b.vy = uy * dot;
    b.omega *= Math.exp(-14 * dt);
  }

  private dampWaitingHoming(chunks: BrickChunk[], dt: number): void {
    const dash = this.dashTargetInternal();
    const k = Math.exp(-18 * dt);
    for (const b of chunks) {
      if (b.telekinesis() !== "homing" || b === dash) continue;
      b.vx *= k;
      b.vy *= k;
    }
  }

  private applyHits(chunks: BrickChunk[], enemies: CombatEnemy[]): void {
    const dash = this.dashTargetInternal();
    for (const b of chunks) {
      if (!b.isTelekinesisActive()) continue;
      if (b.telekinesis() === "homing" && b !== dash) continue;
      const cx = b.debrisCenterWorldX();
      const cy = b.debrisCenterWorldY();
      for (const e of enemies) {
        if (e.isDead()) continue;
        if (!brickChunkHitsEnemyAabb(b, e.damageReceivePose())) continue;
        const strike: ProjectileStrike = {
          damage: PSYCHIC_SPOON_DAMAGE,
          freezeFrames: freezeFrames(PSYCHIC_SPOON_DAMAGE, 1),
          projectileVelX: b.vx,
          projectileVelY: b.vy,
          knockKind: "psychic_debris",
          debrisCenterWorldX: cx,
          debrisCenterWorldY: cy,
        };
        if (e.applyProjectileStrike(strike)) {
          AutismCombat.notifyPlayerDamageDealt(e, PSYCHIC_SPOON_DAMAGE);
          KaleidoscopeEyeCombat.notifyEnemyHpLoss(e, PSYCHIC_SPOON_DAMAGE);
          b.endTelekinesisAfterHit();
        }
        break;
      }
    }
  }

  private advanceQueueHead(chunks: BrickChunk[]): void {
    while (this.homingQueueIndex < this.homingQueue.length) {
      const c = this.homingQueue[this.homingQueueIndex]!;
      if (chunks.includes(c) && c.telekinesis() === "homing") return;
      this.homingQueueIndex++;
    }
  }

  private advanceQueueAfterHits(chunks: BrickChunk[]): void {
    const start = this.homingQueueIndex;
    this.advanceQueueHead(chunks);
    if (this.homingQueueIndex > start) {
      this.interChunkFramesRemaining = PSYCHIC_HOMING_INTER_CHUNK_FRAMES;
    }
  }
}
