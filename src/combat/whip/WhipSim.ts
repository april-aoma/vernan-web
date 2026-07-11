import type { Aabb } from "../CombatMath";
import { GRAVITY } from "../../config/Physics";
import type { CombatEnemy } from "../../entity/CombatEnemy";
import type { TileMap } from "../../world/TileMap";
import { WhipTuningValues } from "./WhipTuningValues";

type ModeParams = {
  stretchLimitMult: number;
  snapLimitMult: number;
  steerAccel: number;
  crackImpulse: number;
  tipDamping: number;
  chainCollidePush: number;
  linkGravityScale: number;
  tipGravityScale: number;
  steerStrength: number;
};

/**
 * Castlevania IV-style whip: pinned handle, Verlet chain, physics tip (Java WhipSim).
 * Hit tests use circle/capsule vs enemy AABB (web HitboxPose is polygon-only).
 */
export class WhipSim {
  static readonly HANDLE_CELL_W = 8;
  static readonly HANDLE_CELL_H = 8;
  static readonly HEAD_CELL_W = 8;
  static readonly HEAD_CELL_H = 8;
  static readonly HANDLE_ROPE_LOCAL_X = 3;
  static readonly HANDLE_ROPE_LOCAL_Y = 7;
  static readonly HEAD_ROPE_LOCAL_X = 3;
  static readonly HEAD_ROPE_LOCAL_Y = 0;
  static readonly SEGMENT_COUNT = 6;
  static readonly POINT_COUNT = WhipSim.SEGMENT_COUNT + 1;
  static readonly CHAIN_HIT_RADIUS = 1;
  static readonly PART_HIT_RADIUS = 4;
  static readonly TIP_DAMAGE_MULT = 1.2;
  static readonly TIP_HITLAG_BONUS_FRAMES = 3;
  static readonly WIGGLE_DAMAGE_MULT = WhipTuningValues.WIGGLE_DAMAGE_MULT;

  private static readonly CONSTRAINT_ITERS = 6;

  private static readonly CRACK_PARAMS: ModeParams = {
    stretchLimitMult: WhipTuningValues.CRACK_STRETCH_LIMIT_MULT,
    snapLimitMult: WhipTuningValues.CRACK_SNAP_LIMIT_MULT,
    steerAccel: WhipTuningValues.CRACK_STEER_ACCEL,
    crackImpulse: WhipTuningValues.CRACK_IMPULSE,
    tipDamping: WhipTuningValues.CRACK_TIP_DAMPING,
    chainCollidePush: WhipTuningValues.CRACK_CHAIN_COLLIDE_PUSH,
    linkGravityScale: WhipTuningValues.CRACK_LINK_GRAVITY_SCALE,
    tipGravityScale: WhipTuningValues.CRACK_TIP_GRAVITY_SCALE,
    steerStrength: WhipTuningValues.CRACK_STEER_STRENGTH,
  };

  private static readonly WIGGLE_PARAMS: ModeParams = {
    stretchLimitMult: WhipTuningValues.WIGGLE_STRETCH_LIMIT_MULT,
    snapLimitMult: WhipTuningValues.WIGGLE_SNAP_LIMIT_MULT,
    steerAccel: 0,
    crackImpulse: 0,
    tipDamping: WhipTuningValues.WIGGLE_TIP_DAMPING,
    chainCollidePush: WhipTuningValues.WIGGLE_CHAIN_COLLIDE_PUSH,
    linkGravityScale: WhipTuningValues.WIGGLE_LINK_GRAVITY_SCALE,
    tipGravityScale: WhipTuningValues.WIGGLE_TIP_GRAVITY_SCALE,
    steerStrength: 0,
  };

  private readonly px = new Array(WhipSim.POINT_COUNT).fill(0);
  private readonly py = new Array(WhipSim.POINT_COUNT).fill(0);
  private readonly ox = new Array(WhipSim.POINT_COUNT).fill(0);
  private readonly oy = new Array(WhipSim.POINT_COUNT).fill(0);

  private maxLengthPx = 3 * 16;
  private linkLengthPx = 0;
  private active = false;
  private deployed = false;
  private crackImpulsePending = false;
  private fullRangeActive = false;
  private whipStacksStored = 0;
  private headAngleSmoothed = 0;
  private headAngleInitialized = false;
  private wiggleOffsetX = 0;
  private wiggleOffsetY = 0;

  reset(): void {
    this.active = false;
    this.deployed = false;
    this.crackImpulsePending = false;
    this.fullRangeActive = false;
    this.headAngleInitialized = false;
    this.wiggleOffsetX = 0;
    this.wiggleOffsetY = 0;
  }

  beginSwing(
    handX: number,
    handY: number,
    tipRestX: number,
    tipRestY: number,
    whipStacks: number,
  ): void {
    this.whipStacksStored = Math.max(0, whipStacks);
    this.active = true;
    this.deployed = false;
    this.crackImpulsePending = false;
    this.fullRangeActive = false;
    this.headAngleInitialized = false;
    this.wiggleOffsetX = tipRestX - handX;
    this.wiggleOffsetY = tipRestY - handY;
    this.clampWiggleOffsetToCircle(WhipTuningValues.wiggleRadiusPx());
    this.applyMaxLength(false);
    this.layCoiled(handX, handY, tipRestX, tipRestY);
  }

  setFullRangeActive(fullRange: boolean): void {
    if (!this.active || this.fullRangeActive === fullRange) return;
    if (this.fullRangeActive && !fullRange) this.syncWiggleOffsetFromTip();
    this.fullRangeActive = fullRange;
    this.applyMaxLength(fullRange);
  }

  private applyMaxLength(fullRange: boolean): void {
    this.maxLengthPx = fullRange
      ? WhipTuningValues.crackRadiusPx(this.whipStacksStored)
      : WhipTuningValues.wiggleRadiusPx();
    this.linkLengthPx = this.maxLengthPx / WhipSim.SEGMENT_COUNT;
  }

  queueCrackImpulse(): void {
    if (!this.active || this.deployed) return;
    this.crackImpulsePending = true;
  }

  isActive(): boolean {
    return this.active;
  }

  isDeployed(): boolean {
    return this.deployed;
  }

  pointCount(): number {
    return WhipSim.POINT_COUNT;
  }

  pointX(i: number): number {
    return this.px[Math.max(0, Math.min(WhipSim.POINT_COUNT - 1, i))]!;
  }

  pointY(i: number): number {
    return this.py[Math.max(0, Math.min(WhipSim.POINT_COUNT - 1, i))]!;
  }

  handleX(): number {
    return this.px[0]!;
  }

  handleY(): number {
    return this.py[0]!;
  }

  tipX(): number {
    return this.px[WhipSim.POINT_COUNT - 1]!;
  }

  tipY(): number {
    return this.py[WhipSim.POINT_COUNT - 1]!;
  }

  layCoiled(handX: number, handY: number, tipRestX: number, tipRestY: number): void {
    for (let i = 0; i < WhipSim.POINT_COUNT; i++) {
      const t = i / (WhipSim.POINT_COUNT - 1);
      this.px[i] = handX + (tipRestX - handX) * t;
      this.py[i] = handY + (tipRestY - handY) * t;
      this.ox[i] = this.px[i];
      this.oy[i] = this.py[i];
    }
  }

  step(
    dt: number,
    map: TileMap | null,
    handX: number,
    handY: number,
    tipRestX: number,
    tipRestY: number,
    aimDx: number,
    aimDy: number,
    wiggleInputX: number,
    wiggleInputY: number,
    deployPhase: boolean,
    combatActive: boolean,
    steerActive: boolean,
  ): void {
    if (!this.active) return;
    this.setFullRangeActive(combatActive);

    if (!this.deployed) {
      this.layCoiled(handX, handY, tipRestX, tipRestY);
      if (deployPhase && this.crackImpulsePending) this.deployed = true;
      if (!this.deployed) return;
    }

    this.px[0] = handX;
    this.py[0] = handY;
    this.ox[0] = handX;
    this.oy[0] = handY;

    const mode = combatActive ? WhipSim.CRACK_PARAMS : WhipSim.WIGGLE_PARAMS;
    const tip = WhipSim.POINT_COUNT - 1;

    if (this.crackImpulsePending) {
      this.lerpTipTowardAimTarget(tip, aimDx, aimDy, mode, dt, 1);
      this.crackImpulsePending = false;
    }

    if (steerActive) {
      if (combatActive) {
        this.steerTipTowardAimTarget(
          tip,
          aimDx,
          aimDy,
          mode,
          dt,
          WhipTuningValues.CRACK_STEER_SCALE,
        );
      } else {
        this.updateWiggleSteering(tip, dt, wiggleInputX, wiggleInputY);
      }
    }

    for (let i = 1; i < WhipSim.POINT_COUNT; i++) {
      let vx = (this.px[i]! - this.ox[i]!) * mode.tipDamping;
      let vy = (this.py[i]! - this.oy[i]!) * mode.tipDamping;
      if (i === tip) vy += GRAVITY * mode.tipGravityScale * dt;
      else vy += GRAVITY * mode.linkGravityScale * dt;
      this.ox[i] = this.px[i];
      this.oy[i] = this.py[i];
      this.px[i]! += vx;
      this.py[i]! += vy;
    }

    this.satisfyConstraints(true, mode);
    this.resolveTipTileCollision(map);
    this.resolveChainTileCollision(map, mode);
    this.satisfyConstraints(false, mode);
    if (!combatActive) this.retractTowardHandle(dt);
    this.enforceMaxReach(aimDx, aimDy, combatActive);
    this.px[0] = handX;
    this.py[0] = handY;
    this.ox[0] = handX;
    this.oy[0] = handY;
  }

  private retractTowardHandle(dt: number): void {
    const tip = WhipSim.POINT_COUNT - 1;
    const dx = this.px[0]! - this.px[tip]!;
    const dy = this.py[0]! - this.py[tip]!;
    const dist = Math.hypot(dx, dy);
    if (dist <= this.maxLengthPx || dist < 1e-6) {
      this.syncWiggleOffsetFromTip();
      return;
    }
    const pull = Math.min(
      dist - this.maxLengthPx,
      WhipTuningValues.WIGGLE_RETRACT_SPEED_PX_PER_SEC * dt,
    );
    this.px[tip]! += (dx / dist) * pull;
    this.py[tip]! += (dy / dist) * pull;
    this.satisfyConstraints(false, WhipSim.WIGGLE_PARAMS);
    this.syncWiggleOffsetFromTip();
  }

  private syncWiggleOffsetFromTip(): void {
    const tip = WhipSim.POINT_COUNT - 1;
    this.wiggleOffsetX = this.px[tip]! - this.px[0]!;
    this.wiggleOffsetY = this.py[tip]! - this.py[0]!;
    this.clampWiggleOffsetToCircle(this.maxLengthPx);
  }

  private clampWiggleOffsetToCircle(radius: number): void {
    const dist = Math.hypot(this.wiggleOffsetX, this.wiggleOffsetY);
    if (dist <= radius || dist < 1e-6) return;
    this.wiggleOffsetX = (this.wiggleOffsetX / dist) * radius;
    this.wiggleOffsetY = (this.wiggleOffsetY / dist) * radius;
  }

  private updateWiggleSteering(
    _tip: number,
    dt: number,
    inputX: number,
    inputY: number,
  ): void {
    if (Math.hypot(inputX, inputY) > 1e-6) {
      let moveX = inputX * WhipTuningValues.WIGGLE_INPUT_HORIZONTAL_MULT;
      let moveY = inputY;
      if (moveY < 0) moveY *= WhipTuningValues.WIGGLE_INPUT_UP_MULT;
      else if (moveY > 0) moveY *= WhipTuningValues.WIGGLE_INPUT_DOWN_MULT;
      const speed = WhipTuningValues.WIGGLE_MOVE_SPEED_PX_PER_SEC * dt;
      this.wiggleOffsetX += moveX * speed;
      this.wiggleOffsetY += moveY * speed;
      this.clampWiggleOffsetToCircle(this.maxLengthPx);
    }
    this.moveTipToward(
      this.px[0]! + this.wiggleOffsetX,
      this.py[0]! + this.wiggleOffsetY,
      WhipTuningValues.WIGGLE_TIP_TRACK_SPEED_PX_PER_SEC * dt,
    );
  }

  private aimTarget(aimDx: number, aimDy: number): [number, number] {
    return [this.px[0]! + aimDx * this.maxLengthPx, this.py[0]! + aimDy * this.maxLengthPx];
  }

  private steerTipTowardAimTarget(
    _tip: number,
    aimDx: number,
    aimDy: number,
    mode: ModeParams,
    dt: number,
    steerScale: number,
  ): void {
    const [tx, ty] = this.aimTarget(aimDx, aimDy);
    this.moveTipToward(tx, ty, mode.steerAccel * mode.steerStrength * steerScale * dt * dt);
  }

  private lerpTipTowardAimTarget(
    tip: number,
    aimDx: number,
    aimDy: number,
    mode: ModeParams,
    dt: number,
    impulseScale: number,
  ): void {
    const [tx, ty] = this.aimTarget(aimDx, aimDy);
    const lerp = Math.min(
      1,
      (mode.crackImpulse * impulseScale * dt * 60) / Math.max(this.maxLengthPx, 1),
    );
    this.px[tip]! += (tx - this.px[tip]!) * lerp;
    this.py[tip]! += (ty - this.py[tip]!) * lerp;
  }

  private moveTipToward(targetX: number, targetY: number, maxStep: number): void {
    const tip = WhipSim.POINT_COUNT - 1;
    const errX = targetX - this.px[tip]!;
    const errY = targetY - this.py[tip]!;
    const dist = Math.hypot(errX, errY);
    if (dist < 1e-6 || maxStep < 1e-6) return;
    const step = Math.min(maxStep, dist);
    this.px[tip]! += (errX / dist) * step;
    this.py[tip]! += (errY / dist) * step;
  }

  private enforceMaxReach(aimDx: number, aimDy: number, straightenCrack: boolean): void {
    const tip = WhipSim.POINT_COUNT - 1;
    if (straightenCrack && Math.hypot(aimDx, aimDy) > 1e-6) {
      const targetX = this.px[0]! + aimDx * this.maxLengthPx;
      const targetY = this.py[0]! + aimDy * this.maxLengthPx;
      this.px[tip]! += (targetX - this.px[tip]!) * WhipTuningValues.CRACK_ENFORCE_TIP_BLEND;
      this.py[tip]! += (targetY - this.py[tip]!) * WhipTuningValues.CRACK_ENFORCE_TIP_BLEND;
      this.clampPointToCircle(tip);
      this.softenInteriorAlongLine(
        this.px[0]!,
        this.py[0]!,
        this.px[tip]!,
        this.py[tip]!,
        WhipTuningValues.CRACK_ENFORCE_STRAIGHTEN_BLEND,
      );
    } else if (WhipTuningValues.WIGGLE_CLAMP_ALL_POINTS) {
      for (let i = 1; i < WhipSim.POINT_COUNT; i++) this.clampPointToCircle(i);
    } else {
      this.clampPointToCircle(tip);
    }
    this.syncEnforceVerletState();
  }

  private clampPointToCircle(i: number): void {
    const dx = this.px[i]! - this.px[0]!;
    const dy = this.py[i]! - this.py[0]!;
    const dist = Math.hypot(dx, dy);
    if (dist <= this.maxLengthPx || dist < 1e-6) return;
    this.px[i] = this.px[0]! + (dx / dist) * this.maxLengthPx;
    this.py[i] = this.py[0]! + (dy / dist) * this.maxLengthPx;
  }

  private softenInteriorAlongLine(
    hx: number,
    hy: number,
    tx: number,
    ty: number,
    blend: number,
  ): void {
    if (blend <= 0) return;
    for (let i = 1; i < WhipSim.POINT_COUNT - 1; i++) {
      const t = i / (WhipSim.POINT_COUNT - 1);
      const lineX = hx + (tx - hx) * t;
      const lineY = hy + (ty - hy) * t;
      this.px[i]! += (lineX - this.px[i]!) * blend;
      this.py[i]! += (lineY - this.py[i]!) * blend;
    }
  }

  private syncEnforceVerletState(): void {
    const tip = WhipSim.POINT_COUNT - 1;
    this.ox[tip] = this.px[tip];
    this.oy[tip] = this.py[tip];
    for (let i = 1; i < tip; i++) {
      this.ox[i]! += (this.px[i]! - this.ox[i]!) * WhipTuningValues.ENFORCE_INTERIOR_VERLET_BLEND;
      this.oy[i]! += (this.py[i]! - this.oy[i]!) * WhipTuningValues.ENFORCE_INTERIOR_VERLET_BLEND;
    }
  }

  headSegmentAngleRad(): number {
    const raw = this.rawHeadAngleRad();
    const blend = this.fullRangeActive
      ? WhipTuningValues.CRACK_HEAD_ANGLE_BLEND
      : WhipTuningValues.WIGGLE_HEAD_ANGLE_BLEND;
    if (!this.headAngleInitialized) {
      this.headAngleSmoothed = raw;
      this.headAngleInitialized = true;
    } else {
      this.headAngleSmoothed = WhipSim.lerpAngleRad(this.headAngleSmoothed, raw, blend);
    }
    return this.headAngleSmoothed;
  }

  private rawHeadAngleRad(): number {
    const last = WhipSim.POINT_COUNT - 1;
    if (!this.fullRangeActive) {
      let dx = this.px[last]! - this.px[0]!;
      let dy = this.py[last]! - this.py[0]!;
      if (Math.hypot(dx, dy) >= 2) return Math.atan2(dx, dy);
      if (last >= 2) {
        dx = this.px[last]! - this.px[last - 2]!;
        dy = this.py[last]! - this.py[last - 2]!;
        if (Math.hypot(dx, dy) >= 1) return Math.atan2(dx, dy);
      }
    }
    const dx = this.px[last]! - this.px[last - 1]!;
    const dy = this.py[last]! - this.py[last - 1]!;
    if (Math.hypot(dx, dy) < 0.5) {
      return this.headAngleInitialized ? this.headAngleSmoothed : 0;
    }
    return Math.atan2(dx, dy);
  }

  private static lerpAngleRad(from: number, to: number, t: number): number {
    let delta = to - from;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    return from + delta * Math.max(0, Math.min(1, t));
  }

  private satisfyConstraints(allowStretch: boolean, mode: ModeParams): void {
    const stretchLen = this.linkLengthPx * mode.stretchLimitMult;
    const snapLen = this.linkLengthPx * mode.snapLimitMult;
    for (let iter = 0; iter < WhipSim.CONSTRAINT_ITERS; iter++) {
      for (let i = 0; i < WhipSim.SEGMENT_COUNT; i++) {
        const ax = this.px[i]!;
        const ay = this.py[i]!;
        const bx = this.px[i + 1]!;
        const by = this.py[i + 1]!;
        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-6) continue;
        let target = this.linkLengthPx;
        if (allowStretch && dist > snapLen) {
          const mx = ax + dx * 0.5;
          const my = ay + dy * 0.5;
          this.px[i] = mx - (dx / dist) * target * 0.5;
          this.py[i] = my - (dy / dist) * target * 0.5;
          this.px[i + 1] = mx + (dx / dist) * target * 0.5;
          this.py[i + 1] = my + (dy / dist) * target * 0.5;
          continue;
        }
        if (allowStretch && dist > stretchLen) target = this.linkLengthPx;
        const err = (dist - target) / dist;
        const corrX = dx * err * 0.5;
        const corrY = dy * err * 0.5;
        if (i === 0) {
          this.px[i + 1]! -= corrX * 2;
          this.py[i + 1]! -= corrY * 2;
        } else if (i + 1 === WhipSim.POINT_COUNT - 1) {
          this.px[i]! += corrX * 2;
          this.py[i]! += corrY * 2;
        } else {
          this.px[i]! += corrX;
          this.py[i]! += corrY;
          this.px[i + 1]! -= corrX;
          this.py[i + 1]! -= corrY;
        }
      }
      this.px[0] = this.ox[0];
      this.py[0] = this.oy[0];
    }
  }

  private resolveTipTileCollision(map: TileMap | null): void {
    if (!map) return;
    const tip = WhipSim.POINT_COUNT - 1;
    if (!map.isSolidAtPixel(this.px[tip]!, this.py[tip]!)) return;
    const vx = this.px[tip]! - this.ox[tip]!;
    const vy = this.py[tip]! - this.oy[tip]!;
    const prevX = this.px[tip]! - vx;
    const prevY = this.py[tip]! - vy;
    if (!map.isSolidAtPixel(prevX, this.py[tip]!)) {
      this.px[tip] = prevX;
      this.ox[tip] = prevX - vx * 0.45;
    } else if (!map.isSolidAtPixel(this.px[tip]!, prevY)) {
      this.py[tip] = prevY;
      this.oy[tip] = prevY - vy * 0.45;
    } else {
      this.px[tip] = this.px[tip - 1]! + (this.px[tip]! - this.px[tip - 1]!) * 0.85;
      this.py[tip] = this.py[tip - 1]! + (this.py[tip]! - this.py[tip - 1]!) * 0.85;
    }
  }

  private resolveChainTileCollision(map: TileMap | null, mode: ModeParams): void {
    if (!map) return;
    const push = mode.chainCollidePush;
    for (let i = 1; i < WhipSim.POINT_COUNT - 1; i++) {
      if (!map.isSolidAtPixel(this.px[i]!, this.py[i]!)) continue;
      let pushX = this.px[WhipSim.POINT_COUNT - 1]! - this.px[i]!;
      let pushY = this.py[WhipSim.POINT_COUNT - 1]! - this.py[i]!;
      let len = Math.hypot(pushX, pushY);
      if (len < 1e-4) {
        pushX = 0;
        pushY = -1;
        len = 1;
      }
      this.px[i]! += (pushX / len) * push;
      this.py[i]! += (pushY / len) * push;
      if (i === WhipSim.POINT_COUNT - 2) {
        this.px[WhipSim.POINT_COUNT - 1]! += (pushX / len) * push * 0.5;
        this.py[WhipSim.POINT_COUNT - 1]! += (pushY / len) * push * 0.5;
      }
    }
  }

  hitRegionAgainst(enemy: CombatEnemy): "TIP" | "CHAIN" | "HANDLE" | "NONE" {
    if (!enemy || !this.active || !this.deployed) return "NONE";
    const hurt = enemy.damageReceivePose();
    const tip = WhipSim.POINT_COUNT - 1;
    if (circleHitsAabb(this.px[tip]!, this.py[tip]!, WhipSim.PART_HIT_RADIUS, hurt)) {
      return "TIP";
    }
    for (let i = 0; i < WhipSim.SEGMENT_COUNT; i++) {
      if (
        capsuleHitsAabb(
          this.px[i]!,
          this.py[i]!,
          this.px[i + 1]!,
          this.py[i + 1]!,
          WhipSim.CHAIN_HIT_RADIUS,
          hurt,
        )
      ) {
        return "CHAIN";
      }
    }
    if (circleHitsAabb(this.px[0]!, this.py[0]!, WhipSim.PART_HIT_RADIUS, hurt)) {
      return "HANDLE";
    }
    return "NONE";
  }
}

function circleHitsAabb(cx: number, cy: number, r: number, box: Aabb): boolean {
  const nx = Math.max(box.x, Math.min(cx, box.x + box.w));
  const ny = Math.max(box.y, Math.min(cy, box.y + box.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

function capsuleHitsAabb(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  box: Aabb,
): boolean {
  // Sample a few points along the segment (good enough for thin chain).
  for (let s = 0; s <= 4; s++) {
    const t = s / 4;
    if (circleHitsAabb(ax + (bx - ax) * t, ay + (by - ay) * t, r, box)) return true;
  }
  return false;
}
