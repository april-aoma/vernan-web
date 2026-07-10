import type { PlayerStats } from "../../../entity/PlayerStats";
import {
  KaleidoscopeEyeStat,
  rollKaleidoscopeEyeStat,
} from "./KaleidoscopeEyeStat";
import type { KaleidoscopeScratchPalette } from "./KaleidoscopeScratchPalette";

/** Run-scoped kaleidoscope eye bonuses (permanent + one active temp roll). */
export class KaleidoscopeEyeState {
  private static readonly DAMAGE_STEP = 0.1;
  private static readonly GROUND_SPEED_STEP = 5;
  private static readonly AIR_SPEED_STEP = 5;
  private static readonly LUCK_STEP = 0.5;
  private static readonly GRAVITY_WEAKER_FRAC = 0.05;
  private static readonly RECOVER_EARLY_STEP = -1;
  private static readonly RECOVER_LATE_STEP = -1;
  private static readonly JUMP_SQUAT_STEP = -1;
  private static readonly WINDUP_STEP = -1;

  private permDamage = 0;
  private permGroundSpeed = 0;
  private permAirSpeed = 0;
  private permLuck = 0;
  private permGravitySteps = 0;
  private permRecoverEarly = 0;
  private permRecoverLate = 0;
  private permJumpSquat = 0;
  private permWindup = 0;

  private tempStat = KaleidoscopeEyeStat.DAMAGE;
  private tempActive = false;

  reset(): void {
    this.permDamage = 0;
    this.permGroundSpeed = 0;
    this.permAirSpeed = 0;
    this.permLuck = 0;
    this.permGravitySteps = 0;
    this.permRecoverEarly = 0;
    this.permRecoverLate = 0;
    this.permJumpSquat = 0;
    this.permWindup = 0;
    this.tempActive = false;
  }

  hasTempBoost(): boolean {
    return this.tempActive;
  }

  getTempStat(): KaleidoscopeEyeStat {
    return this.tempStat;
  }

  /** One enemy HP-loss proc: palette op + fresh temp roll. */
  onDealDamage(
    nextInt: (bound: number) => number,
    stacks: number,
    palette: KaleidoscopeScratchPalette,
  ): void {
    void stacks;
    palette.applyRandomOp(nextInt);
    this.tempStat = rollKaleidoscopeEyeStat(nextInt);
    this.tempActive = true;
  }

  /** Crystallize the current temp increment into permanent totals. */
  crystallizeTemp(stacks: number): void {
    if (!this.tempActive) return;
    this.addStepToPermanent(this.tempStat, this.magnitude(this.tempStat, stacks));
  }

  contribute(stats: PlayerStats, stacks: number): void {
    let dmg = this.permDamage;
    let gspd = this.permGroundSpeed;
    let asp = this.permAirSpeed;
    let luck = this.permLuck;
    let gravSteps = this.permGravitySteps;
    let recE = this.permRecoverEarly;
    let recL = this.permRecoverLate;
    let jsq = this.permJumpSquat;
    let wind = this.permWindup;

    if (this.tempActive) {
      const mag = this.magnitude(this.tempStat, stacks);
      switch (this.tempStat) {
        case KaleidoscopeEyeStat.DAMAGE:
          dmg += mag;
          break;
        case KaleidoscopeEyeStat.GROUND_SPEED:
          gspd += mag;
          break;
        case KaleidoscopeEyeStat.AIR_SPEED:
          asp += mag;
          break;
        case KaleidoscopeEyeStat.LUCK:
          luck += mag;
          break;
        case KaleidoscopeEyeStat.GRAVITY:
          gravSteps += mag;
          break;
        case KaleidoscopeEyeStat.RECOVER_EARLY:
          recE += mag;
          break;
        case KaleidoscopeEyeStat.RECOVER_LATE:
          recL += mag;
          break;
        case KaleidoscopeEyeStat.JUMP_SQUAT:
          jsq += mag;
          break;
        case KaleidoscopeEyeStat.WINDUP:
          wind += mag;
          break;
      }
    }

    stats.attackDamage += dmg;
    stats.maxGroundSpeed += gspd;
    stats.maxAirSpeed += asp;
    stats.luck += luck;
    stats.attackRecoverEarlyFrames = Math.max(1, stats.attackRecoverEarlyFrames + recE);
    stats.attackRecoverLateFrames = Math.max(1, stats.attackRecoverLateFrames + recL);
    stats.jumpSquatFrames = Math.max(1, stats.jumpSquatFrames + jsq);
    stats.attackWindupFrames = Math.max(1, stats.attackWindupFrames + wind);
    stats.kaleidoscopeGravityMult = Math.max(
      0.05,
      1 - KaleidoscopeEyeState.GRAVITY_WEAKER_FRAC * gravSteps,
    );
  }

  permanentHudBonus(stat: KaleidoscopeEyeStat): number {
    switch (stat) {
      case KaleidoscopeEyeStat.DAMAGE:
        return this.permDamage;
      case KaleidoscopeEyeStat.JUMP_SQUAT:
        return this.permJumpSquat;
      case KaleidoscopeEyeStat.WINDUP:
        return this.permWindup;
      default:
        return 0;
    }
  }

  tempHudBonus(stat: KaleidoscopeEyeStat, stacks: number): number {
    if (!this.tempActive || this.tempStat !== stat) return 0;
    return this.magnitude(stat, stacks);
  }

  private addStepToPermanent(stat: KaleidoscopeEyeStat, amount: number): void {
    switch (stat) {
      case KaleidoscopeEyeStat.DAMAGE:
        this.permDamage += amount;
        break;
      case KaleidoscopeEyeStat.GROUND_SPEED:
        this.permGroundSpeed += amount;
        break;
      case KaleidoscopeEyeStat.AIR_SPEED:
        this.permAirSpeed += amount;
        break;
      case KaleidoscopeEyeStat.LUCK:
        this.permLuck += amount;
        break;
      case KaleidoscopeEyeStat.GRAVITY:
        this.permGravitySteps += amount;
        break;
      case KaleidoscopeEyeStat.RECOVER_EARLY:
        this.permRecoverEarly += amount;
        break;
      case KaleidoscopeEyeStat.RECOVER_LATE:
        this.permRecoverLate += amount;
        break;
      case KaleidoscopeEyeStat.JUMP_SQUAT:
        this.permJumpSquat += amount;
        break;
      case KaleidoscopeEyeStat.WINDUP:
        this.permWindup += amount;
        break;
    }
  }

  private magnitude(stat: KaleidoscopeEyeStat, stacks: number): number {
    const mult = Math.max(1, stacks);
    switch (stat) {
      case KaleidoscopeEyeStat.DAMAGE:
        return KaleidoscopeEyeState.DAMAGE_STEP * mult;
      case KaleidoscopeEyeStat.GROUND_SPEED:
        return KaleidoscopeEyeState.GROUND_SPEED_STEP * mult;
      case KaleidoscopeEyeStat.AIR_SPEED:
        return KaleidoscopeEyeState.AIR_SPEED_STEP * mult;
      case KaleidoscopeEyeStat.LUCK:
        return KaleidoscopeEyeState.LUCK_STEP * mult;
      case KaleidoscopeEyeStat.GRAVITY:
        return mult;
      case KaleidoscopeEyeStat.RECOVER_EARLY:
        return KaleidoscopeEyeState.RECOVER_EARLY_STEP * mult;
      case KaleidoscopeEyeStat.RECOVER_LATE:
        return KaleidoscopeEyeState.RECOVER_LATE_STEP * mult;
      case KaleidoscopeEyeStat.JUMP_SQUAT:
        return KaleidoscopeEyeState.JUMP_SQUAT_STEP * mult;
      case KaleidoscopeEyeStat.WINDUP:
        return KaleidoscopeEyeState.WINDUP_STEP * mult;
    }
  }
}
