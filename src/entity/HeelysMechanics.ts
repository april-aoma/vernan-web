import {
  HEELIES_COAST_CAP_MAX_MULT,
  HEELIES_PUMP_MAX_TAP_FRAMES,
  HEELIES_PUMPS_TO_CEILING,
  HEELIES_STOP_FRAMES,
} from "../config/Physics";
import { FIXED_STEP_HZ } from "../specs";
import type { PlayerStats } from "./PlayerStats";

export const HEELIES_PUMP_SQUASH_X = 1.1;
export const HEELIES_PUMP_SQUASH_RECOVER_FRAMES = 10;
export const SKATE_STEER_STRIDE_HOLD_MULT = 6;

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return current;
}

/**
 * HEELIES tap-to-pump coasting (Java Player heelys* methods).
 */
export class HeelysMechanics {
  private heelysCoastCap = 0;
  private heelysPumpTapFrames = 0;
  heelysGlidePoseHold = false;
  heelysSkateSteerHeld = false;

  reset(): void {
    this.heelysCoastCap = 0;
    this.heelysPumpTapFrames = 0;
    this.heelysGlidePoseHold = false;
    this.heelysSkateSteerHeld = false;
  }

  isSkatePose(
    stacks: number,
    onGround: boolean,
    crouching: boolean,
    vx: number,
    maxGroundSpeed: number,
  ): boolean {
    return (
      stacks > 0 &&
      onGround &&
      !crouching &&
      this.heelysCoastCap > maxGroundSpeed + 1e-6 &&
      Math.abs(vx) > maxGroundSpeed + 1e-6
    );
  }

  isGlidePoseHold(): boolean {
    return this.heelysGlidePoseHold;
  }

  isSkateSteerHeld(): boolean {
    return this.heelysSkateSteerHeld;
  }

  finalizePoseFlags(
    stacks: number,
    onGround: boolean,
    crouching: boolean,
    vx: number,
    maxGroundSpeed: number,
    steerDir: number,
    slideActive: boolean,
    climbing: boolean,
  ): void {
    this.heelysGlidePoseHold =
      stacks > 0 && onGround && !crouching && !slideActive && !climbing && steerDir === 0;
    this.heelysSkateSteerHeld =
      this.isSkatePose(stacks, onGround, crouching, vx, maxGroundSpeed) &&
      !this.heelysGlidePoseHold &&
      this.heelysPumpTapFrames > HEELIES_PUMP_MAX_TAP_FRAMES;
  }

  airSpeedCap(stacks: number, baseCap: number, stats: PlayerStats): number {
    if (stacks <= 0) return baseCap;
    return this.heelysSteerMax(stats, baseCap, true);
  }

  disc01SlideSpeedBase(stacks: number, vx: number, stats: PlayerStats): number {
    const pumped =
      stacks > 0 ? this.heelysSteerMax(stats, stats.maxGroundSpeed, true) : stats.maxGroundSpeed;
    return Math.max(Math.abs(vx), pumped) * stats.slideSpeedMult;
  }

  syncCoastCapFromSpeed(stacks: number, absVx: number, stats: PlayerStats): void {
    if (stacks <= 0) return;
    this.heelysCoastCap = Math.min(
      this.heelysCoastCapCeiling(stats),
      Math.max(this.heelysCoastCap, Math.max(stats.maxGroundSpeed, absVx)),
    );
  }

  syncPumpOnMomentumStop(stacks: number, vx: number, stats: PlayerStats): void {
    if (stacks <= 0 || Math.abs(vx) > 1e-6) return;
    this.resetPumpProgress(stats);
  }

  onAirDodgeLanding(stacks: number, combinedVx: number, stats: PlayerStats): void {
    if (stacks <= 0) return;
    this.heelysPumpTapFrames = 0;
    this.syncCoastCapFromSpeed(stacks, Math.abs(combinedVx), stats);
  }

  cancelPumpTap(): void {
    this.heelysPumpTapFrames = 0;
  }

  applyBrake(dt: number, vx: number, stats: PlayerStats, traction: number): number {
    return approach(vx, 0, this.heelysFrictionPerSec(stats) * traction * dt);
  }

  applyGroundHorizontal(
    dt: number,
    dir: number,
    vx: number,
    steerMaxSpeed: number,
    allowPump: boolean,
    stacks: number,
    stats: PlayerStats,
    traction: number,
    applyPumpSquash: (scaleX: number, recoverFrames: number) => void,
  ): number {
    if (stacks <= 0) return vx;
    if (this.heelysCoastCap < stats.maxGroundSpeed) {
      this.heelysCoastCap = stats.maxGroundSpeed;
    }
    const capCeiling = this.heelysCoastCapCeiling(stats);
    const pumpSpeed = Math.abs(vx) >= stats.maxGroundSpeed - 1e-6;
    const steerCap = this.heelysSteerMax(stats, steerMaxSpeed, allowPump);

    if (dir !== 0 && Math.abs(vx) > 1e-6 && Math.sign(dir) !== Math.sign(vx)) {
      this.heelysPumpTapFrames = 0;
      return approach(vx, dir * steerCap, stats.groundBrake * traction * dt);
    }

    const forward = dir !== 0 && (Math.abs(vx) <= 1e-6 || Math.sign(dir) === Math.sign(vx));

    if (forward && allowPump && pumpSpeed) {
      this.heelysPumpTapFrames++;
      if (this.heelysPumpTapFrames > HEELIES_PUMP_MAX_TAP_FRAMES) {
        const target = Math.sign(vx) * steerCap;
        if (Math.sign(vx) !== Math.sign(target) && Math.abs(vx) > 1e-6) {
          return approach(vx, target, stats.groundBrake * traction * dt);
        }
        return approach(vx, target, stats.groundAccel * traction * dt);
      }
      return vx;
    }

    if (dir === 0) {
      let nextVx = vx;
      if (
        allowPump &&
        pumpSpeed &&
        this.heelysPumpTapFrames > 0 &&
        this.heelysPumpTapFrames <= HEELIES_PUMP_MAX_TAP_FRAMES &&
        this.tryPump(capCeiling, steerMaxSpeed, allowPump, stats)
      ) {
        if (Math.abs(vx) > 1e-6) {
          nextVx = Math.sign(vx) * this.heelysSteerMax(stats, steerMaxSpeed, allowPump);
        }
        applyPumpSquash(HEELIES_PUMP_SQUASH_X, HEELIES_PUMP_SQUASH_RECOVER_FRAMES);
      }
      this.heelysPumpTapFrames = 0;
      return nextVx;
    }

    this.heelysPumpTapFrames = 0;
    const steerTarget = dir * steerCap;
    if (Math.sign(vx) !== Math.sign(steerTarget) && Math.abs(vx) > 1e-6) {
      return approach(vx, steerTarget, stats.groundBrake * traction * dt);
    }
    return approach(vx, steerTarget, stats.groundAccel * traction * dt);
  }

  clampGroundVx(
    vx: number,
    stacks: number,
    cap: number,
    stats: PlayerStats,
    allowPump: boolean,
  ): number {
    if (stacks <= 0) return Math.max(-cap, Math.min(cap, vx));
    const steerCap = this.heelysSteerMax(stats, cap, allowPump);
    return Math.max(-steerCap, Math.min(steerCap, vx));
  }

  groundNeutralDecelPerSec(stacks: number, braking: boolean, stats: PlayerStats): number {
    if (stacks > 0) return braking ? this.heelysFrictionPerSec(stats) : 0;
    return stats.groundFriction;
  }

  private tryPump(
    capCeiling: number,
    _steerMaxSpeed: number,
    _allowPumpedCap: boolean,
    stats: PlayerStats,
  ): boolean {
    if (this.heelysCoastCap >= capCeiling - 1e-6) return false;
    const step = (capCeiling - stats.maxGroundSpeed) / HEELIES_PUMPS_TO_CEILING;
    this.heelysCoastCap = Math.min(capCeiling, this.heelysCoastCap + step);
    return true;
  }

  private heelysSteerMax(stats: PlayerStats, baseCap: number, allowPumpedCap: boolean): number {
    if (!allowPumpedCap) return baseCap;
    return Math.max(baseCap, Math.min(this.heelysCoastCap, this.heelysCoastCapCeiling(stats)));
  }

  private heelysCoastCapCeiling(stats: PlayerStats): number {
    return stats.maxGroundSpeed * HEELIES_COAST_CAP_MAX_MULT;
  }

  private heelysFrictionPerSec(stats: PlayerStats): number {
    return (stats.maxGroundSpeed * FIXED_STEP_HZ) / HEELIES_STOP_FRAMES;
  }

  private resetPumpProgress(stats: PlayerStats): void {
    this.heelysCoastCap = stats.maxGroundSpeed;
    this.heelysPumpTapFrames = 0;
  }
}
