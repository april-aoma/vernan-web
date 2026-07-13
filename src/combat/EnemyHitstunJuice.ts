import type { KnockbackKind, WeaponStrike } from "./CombatMath";

export function isElectrocutionKnock(knockKind: KnockbackKind): boolean {
  return knockKind === "electrocution" || knockKind === "stomp_electric";
}

/** Shared electrocution vs solid-red hitstun flags (Java Enemy.hitstunElectrocuteFlag). */
export type ElectrocuteJuiceState = {
  hitlagSolidRed: boolean;
  hitlagElectrocute: boolean;
};

export function applyStrikeElectrocuteJuice(
  strike: WeaponStrike,
  state: ElectrocuteJuiceState,
): void {
  if (strike.knockKind === "black_heart_burst") {
    // Callers that early-return on burst still set flags via queueBlackHeartBurstKnock.
    state.hitlagSolidRed = true;
    state.hitlagElectrocute = false;
    return;
  }
  const electrocute = isElectrocutionKnock(strike.knockKind);
  state.hitlagElectrocute = electrocute;
  // Sticky like Java hitstunSolidRedFlag = !electrocute (hitstun tick must not re-force).
  state.hitlagSolidRed = !electrocute;
}

/** Projectile / non-electrocute hitstun flash (Java hitstunSolidRedFlag = true). */
export function applySolidRedHitstunJuice(state: ElectrocuteJuiceState): void {
  state.hitlagElectrocute = false;
  state.hitlagSolidRed = true;
}

export function hitstunElectrocuteBw(state: ElectrocuteJuiceState, hitstunSec: number): boolean {
  return state.hitlagElectrocute && hitstunSec > 0;
}

/** Alternating black/white SrcAtop phase during electrocution (Java tintScratchElectrocuteForDraw). */
export function electrocuteBwWhitePhase(simTicks: number): boolean {
  return Math.floor(simTicks / 3) % 2 === 0;
}
