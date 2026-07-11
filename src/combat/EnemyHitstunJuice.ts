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
  if (strike.knockKind === "black_heart_burst") return;
  const electrocute = isElectrocutionKnock(strike.knockKind);
  state.hitlagElectrocute = electrocute;
  if (electrocute) state.hitlagSolidRed = false;
}

export function hitstunElectrocuteBw(state: ElectrocuteJuiceState, hitstunSec: number): boolean {
  return state.hitlagElectrocute && hitstunSec > 0;
}

/** Alternating black/white SrcAtop phase during electrocution (Java tintScratchElectrocuteForDraw). */
export function electrocuteBwWhitePhase(simTicks: number): boolean {
  return Math.floor(simTicks / 3) % 2 === 0;
}
