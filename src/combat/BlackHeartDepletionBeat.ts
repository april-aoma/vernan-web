import { DEFAULT_SHAKE_AMPLITUDE_PX, sampleShake } from "./HitlagState";

/** Shared timing and tuning for the black-heart retaliation beat (Java BlackHeartDepletionBeat). */
export const BLACK_HEART_OVERLAY_MAX_ALPHA = 0.3;

/** Standard black-heart loss; also heart-of-darkness hits that do not empty a container. */
export const BLACK_HEART_FRAME_COUNT = 20;

export type BlackHeartBurstConfig = {
  frameCount: number;
  damageDivisor: number;
  minDamage: number;
};

export const BLACK_HEART_CONFIG_STANDARD: BlackHeartBurstConfig = {
  frameCount: BLACK_HEART_FRAME_COUNT,
  damageDivisor: 6,
  minDamage: 2,
};

/** Heart of darkness when a black container is emptied on the same hit. */
export const BLACK_HEART_CONFIG_ENHANCED: BlackHeartBurstConfig = {
  frameCount: 30,
  damageDivisor: 3,
  minDamage: 4,
};

export function blackHeartBurstDamage(config: BlackHeartBurstConfig, maxHp: number): number {
  return Math.max(config.minDamage, maxHp / config.damageDivisor);
}

export type BlackHeartRetaliation = {
  burstCount: number;
  config: BlackHeartBurstConfig;
};

export const BLACK_HEART_RETALIATION_NONE: BlackHeartRetaliation = {
  burstCount: 0,
  config: BLACK_HEART_CONFIG_STANDARD,
};

export function blackHeartRetaliationActive(r: BlackHeartRetaliation): boolean {
  return r.burstCount > 0;
}

export function resolveBlackHeartRetaliation(
  blackHeartsLost: number,
  heartOfDarkness: boolean,
): BlackHeartRetaliation {
  if (!heartOfDarkness && blackHeartsLost <= 0) {
    return BLACK_HEART_RETALIATION_NONE;
  }
  if (blackHeartsLost > 0 && heartOfDarkness) {
    return { burstCount: blackHeartsLost, config: BLACK_HEART_CONFIG_ENHANCED };
  }
  if (blackHeartsLost > 0) {
    return { burstCount: blackHeartsLost, config: BLACK_HEART_CONFIG_STANDARD };
  }
  return { burstCount: 1, config: BLACK_HEART_CONFIG_STANDARD };
}

const SCREEN_SHAKE_MAX_DEVICE_PX = DEFAULT_SHAKE_AMPLITUDE_PX * 2;

export function blackHeartScreenShakeAmpDevicePx(
  framesRemaining: number,
  frameTotal: number,
): number {
  if (framesRemaining <= 0 || frameTotal <= 0) return 0;
  return SCREEN_SHAKE_MAX_DEVICE_PX * (framesRemaining / frameTotal);
}

export function blackHeartOverlayAlpha(framesRemaining: number, frameTotal: number): number {
  if (framesRemaining <= 0 || frameTotal <= 0) return 0;
  return BLACK_HEART_OVERLAY_MAX_ALPHA * (framesRemaining / frameTotal);
}

export function sampleBlackHeartScreenShake(
  framesRemaining: number,
  frameTotal: number,
): { x: number; y: number } {
  const amp = blackHeartScreenShakeAmpDevicePx(framesRemaining, frameTotal);
  return { x: sampleShake(amp), y: sampleShake(amp) };
}
