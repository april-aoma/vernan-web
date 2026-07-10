import { HitboxPose } from "../collision/HitboxPose";
import { polygonBounds, polygonIntersectsAabb } from "../collision/polygonIntersect";
import type { Aabb } from "../combat/CombatMath";
import {
  BRICK_CHUNK_DEBRIS_LOCAL,
  BRICK_CHUNK_DEBRIS_PIVOT_X,
} from "../config/HitboxValues";
import {
  BRICKCHUNK_LINEAR_AIR_DAMP_VX_PER_SEC,
  BRICKCHUNK_RESTITUTION_CEILING,
  BRICKCHUNK_RESTITUTION_FLOOR,
  BRICKCHUNK_RESTITUTION_WALL,
  GRAVITY,
} from "../config/Physics";
import {
  backstepPositionUntilClear,
  overlapsAnySolidTile,
  PICKUP_BACKSTEP_MAX_ITER,
} from "../physics/SolidOverlap";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";

/** Optional 8×8 (or part) sprite from a sheet or tile snap. */
export type BrickChunkSprite = {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export type BrickChunkTelekinesisPhase = "none" | "float" | "homing";

const BLINK_PERIOD_SEC = 0.1;
const CONTACT_PROBE_PX = 1.5;
const GROUND_NORMAL_Y = 0.42;
const FLOOR_FRICTION_REST = 0.22;
const GRAVITY_MUL = 0.85;
const MAX_VY = 420;

function comOffsetForSeed(seedX: number, seedY: number): { x: number; y: number; mag: number } {
  let h =
    (Math.imul(Math.floor(seedX * 1000), 0x9e3779b1) ^
      Math.imul(Math.floor(seedY * 1000), 0x85ebca77) ^
      0x9e3779b9) >>>
    0;
  const rnd = () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 0x100000000;
  };
  const min = 2.6;
  const max = 4.15;
  const mag = min + rnd() * (max - min);
  const corner = Math.floor(rnd() * 4);
  const invSqrt2 = 1 / Math.sqrt(2);
  const sx = corner === 0 || corner === 2 ? -invSqrt2 : invSqrt2;
  const sy = corner === 0 || corner === 1 ? -invSqrt2 : invSqrt2;
  return { x: sx * mag, y: sy * mag, mag };
}

function rotateHullToWorld(
  local: ReadonlyArray<number>,
  pivotLocalX: number,
  pivotLocalY: number,
  pivotWorldX: number,
  pivotWorldY: number,
  angleRad: number,
  mirrorX: boolean,
): number[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const out: number[] = [];
  for (let i = 0; i < local.length; i += 2) {
    let lx = local[i]! - pivotLocalX;
    let ly = local[i + 1]! - pivotLocalY;
    if (mirrorX) lx = -lx;
    out.push(pivotWorldX + lx * cos - ly * sin, pivotWorldY + lx * sin + ly * cos);
  }
  return out;
}

function aabbCorners(w: number, h: number): number[] {
  return [0, 0, w, 0, w, h, 0, h];
}

/** One debris piece — breakable shards or pivot-anchored boss limbs (Java BrickChunk). */
export class BrickChunk {
  static readonly SIZE = 8;

  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  omega: number;
  color: string;
  sprite: BrickChunkSprite | null;

  private readonly worldSizePx: number;
  private readonly pivotXLocal: number;
  private readonly pivotYLocal: number;
  private readonly pivotAnchored: boolean;
  private readonly mirrorX: boolean;
  private readonly customHullLocal: number[] | null;
  private readonly comLocalX: number;
  private readonly comLocalY: number;
  private readonly comMag: number;
  private readonly fireAnimPhaseOffsetSec: number;

  private telekinesisPhase: BrickChunkTelekinesisPhase = "none";
  private telekinesisBobTime = 0;
  private homingAccX = 0;
  private homingAccY = 0;
  private onGround = false;
  private lifetimeSec = -1;
  private blinkStartSec = 0;
  private lifeAgeSec = 0;
  /** Nephilim marionette head — room clear waits on this chunk resting. */
  bossDeathHead = false;

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    angle = 0,
    omega = 0,
    color = "#8a5a3a",
    sprite: BrickChunkSprite | null = null,
    opts?: {
      worldSize?: number;
      spritePivotX?: number;
      spritePivotY?: number;
      pivotAnchored?: boolean;
      mirrorX?: boolean;
      hullLocal?: number[] | null;
    },
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.angle = angle;
    this.omega = omega;
    this.color = color;
    this.sprite = sprite;
    this.worldSizePx = opts?.worldSize ?? BrickChunk.SIZE;
    this.pivotXLocal = opts?.spritePivotX ?? BRICK_CHUNK_DEBRIS_PIVOT_X;
    this.pivotYLocal = opts?.spritePivotY ?? 0;
    this.pivotAnchored = opts?.pivotAnchored ?? false;
    this.mirrorX = opts?.mirrorX ?? false;
    this.customHullLocal =
      opts?.hullLocal && opts.hullLocal.length >= 6 ? opts.hullLocal.slice() : null;
    const com = comOffsetForSeed(x, y);
    this.comLocalX = com.x;
    this.comLocalY = com.y;
    this.comMag = com.mag;
    const h =
      (Math.imul(Math.floor(x * 1000), 0x9e3779b1) ^
        Math.imul(Math.floor(y * 1000), 0x85ebca77)) >>>
      0;
    this.fireAnimPhaseOffsetSec = ((h & 0xffff) / 65536) * 0.85;
  }

  /** Pivot-anchored boss limb debris (Possessed death scatter). */
  static createPivotAnchored(
    pivotWorldX: number,
    pivotWorldY: number,
    vx: number,
    vy: number,
    sprite: BrickChunkSprite | null,
    angleRad: number,
    omega: number,
    worldSize: number,
    pivotX: number,
    pivotY: number,
    mirror: boolean,
    hullLocal: number[] | null,
    color = "#c8a0e8",
  ): BrickChunk {
    return new BrickChunk(pivotWorldX, pivotWorldY, vx, vy, angleRad, omega, color, sprite, {
      worldSize,
      spritePivotX: pivotX,
      spritePivotY: pivotY,
      pivotAnchored: true,
      mirrorX: mirror,
      hullLocal,
    });
  }

  get done(): boolean {
    return this.isExpired();
  }

  telekinesis(): BrickChunkTelekinesisPhase {
    return this.telekinesisPhase;
  }

  isTelekinesisActive(): boolean {
    return this.telekinesisPhase === "float" || this.telekinesisPhase === "homing";
  }

  fireAnimPhaseOffset(): number {
    return this.fireAnimPhaseOffsetSec;
  }

  worldSize(): number {
    return this.worldSizePx;
  }

  isPivotAnchored(): boolean {
    return this.pivotAnchored;
  }

  isMirrorX(): boolean {
    return this.mirrorX;
  }

  spritePivotX(): number {
    return this.pivotXLocal;
  }

  spritePivotY(): number {
    return this.pivotYLocal;
  }

  isOnGround(): boolean {
    return this.onGround;
  }

  isSettled(): boolean {
    return this.onGround && Math.hypot(this.vx, this.vy) < 4 && Math.abs(this.omega) < 0.25;
  }

  /**
   * Lenient resting probe for boss-defeat head debris (Java BrickChunk.isBossDeathHeadResting).
   */
  isBossDeathHeadResting(map: TileMap | null): boolean {
    if (this.isTelekinesisActive()) return false;
    if (this.isSettled() || this.isOnGround()) return true;
    if (!map) return false;
    const speed = Math.hypot(this.vx, this.vy);
    const spin = Math.abs(this.omega);
    if (speed > 12 || spin > 3) return false;
    if (this.standableUnderBottomCenter(map)) return true;
    return overlapsAnySolidTile(map, this.poseAt(this.x, this.y)) && speed < 6 && spin < 1.5;
  }

  setLifetime(lifetimeSec: number, blinkStartSec: number): void {
    this.lifetimeSec = lifetimeSec;
    this.blinkStartSec = Math.min(blinkStartSec, lifetimeSec);
    this.lifeAgeSec = 0;
  }

  isExpired(): boolean {
    return this.lifetimeSec > 0 && this.lifeAgeSec >= this.lifetimeSec;
  }

  isDrawVisible(): boolean {
    if (this.lifetimeSec <= 0 || this.lifeAgeSec < this.blinkStartSec) return true;
    const phase = Math.floor((this.lifeAgeSec - this.blinkStartSec) / BLINK_PERIOD_SEC);
    return phase % 2 === 0;
  }

  setHomingAcceleration(ax: number, ay: number): void {
    this.homingAccX = ax;
    this.homingAccY = ay;
  }

  beginTelekinesisLift(rnd: () => number): void {
    this.telekinesisPhase = "float";
    this.telekinesisBobTime = rnd() * Math.PI * 2;
    this.onGround = false;
    this.vy -= 32 + rnd() * 28;
    this.omega += (rnd() < 0.5 ? -1 : 1) * (2.2 + rnd() * 3.5);
    this.homingAccX = 0;
    this.homingAccY = 0;
  }

  setTelekinesisHoming(): void {
    if (this.telekinesisPhase === "float" || this.telekinesisPhase === "homing") {
      this.telekinesisPhase = "homing";
    }
  }

  clearTelekinesis(): void {
    this.telekinesisPhase = "none";
    this.homingAccX = 0;
    this.homingAccY = 0;
  }

  endTelekinesisAfterHit(): void {
    this.clearTelekinesis();
  }

  debrisCenterWorldX(): number {
    return this.bounds().x + this.bounds().w * 0.5;
  }

  debrisCenterWorldY(): number {
    return this.bounds().y + this.bounds().h * 0.5;
  }

  rect(): Aabb {
    return this.bounds();
  }

  bounds(): Aabb {
    return polygonBounds(this.collisionVertices());
  }

  damagePose(): HitboxPose {
    return HitboxPose.fromWorldPolygon(this.collisionVertices());
  }

  private hullLocal(): ReadonlyArray<number> {
    if (this.customHullLocal) return this.customHullLocal;
    if (this.pivotAnchored) return aabbCorners(this.worldSizePx, this.worldSizePx);
    return BRICK_CHUNK_DEBRIS_LOCAL;
  }

  private pivotWorld(): { x: number; y: number } {
    if (this.pivotAnchored) return { x: this.x, y: this.y };
    return { x: this.x, y: this.y };
  }

  collisionVertices(): number[] {
    const p = this.pivotWorld();
    if (this.pivotAnchored) {
      return rotateHullToWorld(
        this.hullLocal(),
        this.pivotXLocal,
        this.pivotYLocal,
        p.x,
        p.y,
        this.angle,
        this.mirrorX,
      );
    }
    return rotateHullToWorld(
      BRICK_CHUNK_DEBRIS_LOCAL,
      BRICK_CHUNK_DEBRIS_PIVOT_X,
      0,
      this.x,
      this.y,
      this.angle,
      false,
    );
  }

  private poseAt(ax: number, ay: number): HitboxPose {
    if (this.pivotAnchored) {
      return HitboxPose.fromWorldPolygon(
        rotateHullToWorld(
          this.hullLocal(),
          this.pivotXLocal,
          this.pivotYLocal,
          ax,
          ay,
          this.angle,
          this.mirrorX,
        ),
      );
    }
    return HitboxPose.fromWorldPolygon(
      rotateHullToWorld(BRICK_CHUNK_DEBRIS_LOCAL, BRICK_CHUNK_DEBRIS_PIVOT_X, 0, ax, ay, this.angle, false),
    );
  }

  private standableUnderBottomCenter(map: TileMap): boolean {
    const b = this.bounds();
    const cx = b.x + b.w * 0.5;
    const footY = b.y + b.h;
    const tx = Math.floor(cx / TILE_SIZE);
    const ty = Math.floor((footY + 2e-3) / TILE_SIZE);
    return map.isStandableFloorTile(tx, ty);
  }

  update(dt: number, map: TileMap): void {
    if (this.lifetimeSec > 0) this.lifeAgeSec += dt;

    const tk = this.isTelekinesisActive();
    const overlapsSolidNow = overlapsAnySolidTile(map, this.poseAt(this.x, this.y));

    if (!tk) {
      this.vy += GRAVITY * dt * GRAVITY_MUL;
    }
    if (this.vy > MAX_VY) this.vy = MAX_VY;

    if (!this.onGround) {
      this.vx *= Math.exp(-BRICKCHUNK_LINEAR_AIR_DAMP_VX_PER_SEC * dt);
    }

    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const rx = this.comLocalX * cos - this.comLocalY * sin;
    const ry = this.comLocalX * sin + this.comLocalY * cos;
    if (!tk && !this.onGround && ry < 0) {
      this.vy += GRAVITY * 0.22 * (-ry / this.worldSizePx) * dt;
    }
    if (this.vy > MAX_VY) this.vy = MAX_VY;

    if (!tk && Math.abs(this.vx) > 22 && !overlapsSolidNow) {
      this.omega += GRAVITY * 0.032 * rx * dt * (this.onGround ? 0.2 : 1) * (this.comMag / 2.35);
    }
    if (!tk && this.onGround && Math.abs(this.vx) > 4) {
      const target = this.vx / 4.2;
      this.omega += 12 * (target - this.omega) * dt;
    }

    let damp = (this.onGround ? 15 : 4.2) + 2.55;
    if (tk) damp *= 0.38;
    this.omega *= Math.exp(-damp * dt);
    if (Math.abs(this.omega) > 18) this.omega = Math.sign(this.omega) * 18;
    if (Math.abs(this.omega) < 0.65) this.omega = 0;
    this.angle += this.omega * dt;

    if (tk) {
      this.telekinesisBobTime += dt;
      if (this.telekinesisPhase === "float") {
        this.vy += Math.cos(this.telekinesisBobTime * 5.4) * 10 * dt;
        this.omega *= Math.exp(-3.8 * dt);
      } else {
        this.vy += Math.cos(this.telekinesisBobTime * 7.2) * 4 * dt;
      }
      this.vx += this.homingAccX * dt;
      this.vy += this.homingAccY * dt;
      this.homingAccX = 0;
      this.homingAccY = 0;
      const cap = this.telekinesisPhase === "float" ? 115 : 320;
      const v = Math.hypot(this.vx, this.vy);
      if (v > cap) {
        this.vx = (this.vx / v) * cap;
        this.vy = (this.vy / v) * cap;
      }
      if (this.telekinesisPhase === "float") {
        this.vy = Math.max(-115, Math.min(95, this.vy));
      } else {
        this.vy = Math.max(-220, Math.min(260, this.vy));
      }
    }

    const prevX = this.x;
    const prevY = this.y;
    const tryX = prevX + this.vx * dt;
    const tryY = prevY + this.vy * dt;
    let groundedThisStep = false;

    if (tk) {
      this.x = tryX;
      this.y = tryY;
    } else if (overlapsAnySolidTile(map, this.poseAt(tryX, tryY))) {
      const cleared = backstepPositionUntilClear(
        map,
        prevX,
        prevY,
        tryX,
        tryY,
        (ax, ay) => this.poseAt(ax, ay),
        PICKUP_BACKSTEP_MAX_ITER,
      );
      this.x = cleared.x;
      this.y = cleared.y;
      const ddx = tryX - prevX;
      const ddy = tryY - prevY;
      const moveLen = Math.hypot(ddx, ddy);
      if (moveLen > 1e-6) {
        const n = this.contactNormal(map, this.x, this.y, ddx / moveLen, ddy / moveLen);
        if (n) {
          const vDotN = this.vx * n.x + this.vy * n.y;
          if (vDotN < 0) {
            const e =
              Math.abs(n.y) >= Math.abs(n.x)
                ? n.y < 0
                  ? BRICKCHUNK_RESTITUTION_FLOOR
                  : BRICKCHUNK_RESTITUTION_CEILING
                : BRICKCHUNK_RESTITUTION_WALL;
            const impulse = (1 + e) * vDotN;
            this.vx -= impulse * n.x;
            this.vy -= impulse * n.y;
          }
          if (n.y < -GROUND_NORMAL_Y) groundedThisStep = true;
        }
      }
    } else {
      this.x = tryX;
      this.y = tryY;
    }

    this.onGround = groundedThisStep && this.standableUnderBottomCenter(map);
    if (tk) this.onGround = false;

    if (!tk && this.onGround) {
      this.vx *= Math.pow(FLOOR_FRICTION_REST, (dt * 60) / 14);
      if (Math.abs(this.vx) < 3) this.vx = 0;
    }

    if (Math.abs(this.omega) < 0.65) this.omega = 0;
  }

  private contactNormal(
    map: TileMap,
    ax: number,
    ay: number,
    dirx: number,
    diry: number,
  ): { x: number; y: number } | null {
    let probe = this.poseAt(ax + dirx * CONTACT_PROBE_PX, ay + diry * CONTACT_PROBE_PX);
    let n = this.normalFromOverlap(map, probe);
    if (!n) {
      probe = this.poseAt(ax + dirx * CONTACT_PROBE_PX * 3, ay + diry * CONTACT_PROBE_PX * 3);
      n = this.normalFromOverlap(map, probe);
    }
    return n;
  }

  private normalFromOverlap(map: TileMap, pose: HitboxPose): { x: number; y: number } | null {
    const b = pose.bounds();
    const cx = b.x + b.w * 0.5;
    const cy = b.y + b.h * 0.5;
    const x0 = Math.floor(b.x / TILE_SIZE);
    const y0 = Math.floor(b.y / TILE_SIZE);
    const x1 = Math.floor((b.x + b.w - 1e-6) / TILE_SIZE);
    const y1 = Math.floor((b.y + b.h - 1e-6) / TILE_SIZE);
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!map.isSolidTile(tx, ty)) continue;
        const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
        if (!pose.intersectsRect(tile)) continue;
        const tcx = tile.x + TILE_SIZE * 0.5;
        const tcy = tile.y + TILE_SIZE * 0.5;
        const dx = cx - tcx;
        const dy = cy - tcy;
        const len = Math.hypot(dx, dy);
        if (len > 1e-8) {
          sx += dx / len;
          sy += dy / len;
          count++;
        }
      }
    }
    if (count === 0) return null;
    const len = Math.hypot(sx, sy);
    if (len < 1e-8) return { x: 0, y: -1 };
    return { x: sx / len, y: sy / len };
  }
}

/** SAT check for debris vs enemy hurt AABB (psychic spoon hits). */
export function brickChunkHitsEnemyAabb(chunk: BrickChunk, hurt: Aabb): boolean {
  return polygonIntersectsAabb(chunk.collisionVertices(), hurt);
}

/**
 * Spawn four 8×8 shards for a 16×16 breakable cell (Java applyBreakableBrickChunksOnly).
 */
export function spawnBreakableBrickChunks(
  bx: number,
  by: number,
  rnd: () => number,
  out: BrickChunk[],
  velocityScale = 1,
  color = "#8a5a3a",
  tileSnap: HTMLCanvasElement | OffscreenCanvas | null = null,
): void {
  for (let i = 0; i < 4; i++) {
    const qx = (i % 2) * 8;
    const qy = Math.floor(i / 2) * 8;
    const omega0 = (rnd() - 0.5) * 2 * 7 * velocityScale;
    const angle0 = (rnd() - 0.5) * 0.4 * velocityScale;
    const sprite: BrickChunkSprite | null = tileSnap
      ? { image: tileSnap, sx: qx, sy: qy, sw: 8, sh: 8 }
      : null;
    out.push(
      new BrickChunk(
        bx + qx,
        by + qy,
        (rnd() - 0.5) * 140 * velocityScale,
        (-rnd() * 95 - 18) * velocityScale,
        angle0,
        omega0,
        color,
        sprite,
      ),
    );
  }
}

export function brickChunkRng(runSeed: bigint, roomId: number, tx: number, ty: number): () => number {
  let state =
    Number(runSeed & 0xffffffffn) ^
    (tx * 0x9e3779b1) ^
    (ty * 0x85ebca77) ^
    roomId * 37;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 0x100000000;
  };
}
