import { DEFAULT_SHAKE_AMPLITUDE_PX, sampleShake } from "./HitlagState";
import { BlackHeartBeatDeferral } from "./BlackHeartBeatDeferral";
import { blackHeartBurstKnockVelocity } from "./BlackHeartBurstCombat";
import type { WeaponStrike } from "./CombatMath";
import type { ElectrocuteJuiceState } from "./EnemyHitstunJuice";

export type BlackHeartEnemyHitstunState = ElectrocuteJuiceState & {
  hitstun: number;
  blackHeartBeat: BlackHeartBeatDeferral;
  hitlagShakeX: number;
  hitlagShakeY: number;
};

/**
 * Java Enemy/Possessed hitstun gate: freeze while local hitstun or global black-heart beat lock.
 * @returns true when movement should be skipped this tick.
 */
export function tickBlackHeartEnemyHitstun(dt: number, state: BlackHeartEnemyHitstunState): boolean {
  if (state.hitstun <= 0 && !state.blackHeartBeat.isLocked()) {
    state.hitlagSolidRed = false;
    state.hitlagElectrocute = false;
    state.hitlagShakeX = 0;
    state.hitlagShakeY = 0;
    return false;
  }
  if (state.hitstun > 0) {
    state.hitstun = Math.max(0, state.hitstun - dt);
  }
  const frozen = state.hitstun > 0 || state.blackHeartBeat.isLocked();
  if (frozen) {
    // Solid-red is sticky from damage (Java hitstunSolidRedFlag) — do not re-force here,
    // or shield-block clears (hitlagSolidRed = false) get overwritten every frame.
    state.hitlagShakeX = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
    state.hitlagShakeY = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
    return true;
  }
  state.hitlagSolidRed = false;
  state.hitlagElectrocute = false;
  state.hitlagShakeX = 0;
  state.hitlagShakeY = 0;
  return false;
}

/** Queue upward burst knock after damage (Java queueHitstunAfterDamage BLACK_HEART_BURST path). */
export function queueBlackHeartBurstKnock(
  deferral: BlackHeartBeatDeferral,
  strike: WeaponStrike,
  hitstunSec: number,
  juice?: ElectrocuteJuiceState,
): number {
  const kb = blackHeartBurstKnockVelocity(strike.damage);
  deferral.beginLivingKnock(kb.vx, kb.vy);
  if (juice) {
    juice.hitlagSolidRed = true;
    juice.hitlagElectrocute = false;
  }
  return Math.max(hitstunSec, strike.freezeFrames / 60);
}

export function releaseBlackHeartBeatKnockback(
  deferral: BlackHeartBeatDeferral,
  applyKnock: (vx: number, vy: number) => void,
  applyCorpseStrike?: (strike: WeaponStrike) => void,
): void {
  if (!deferral.isLocked()) return;
  if (deferral.hasCorpseStrike()) {
    const strike = deferral.pendingCorpseStrikeValue()!;
    deferral.clear();
    applyCorpseStrike?.(strike);
    return;
  }
  const vx = deferral.knockVxValue();
  const vy = deferral.knockVyValue();
  deferral.clear();
  applyKnock(vx, vy);
}
