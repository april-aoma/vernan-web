/** Tuning for frozen enemies and ice shatter (Java IceBlockFx). */
export const ICE_AQUA_OVERLAY_RGB = 0x7fe4f9;
export const ICE_AQUA_OVERLAY_ALPHA = 210;
export const ICE_SHARD_VELOCITY_SCALE = 2.5;
export const ICE_SPAWN_INVULN_SEC = 0.28;
export const ICE_SPAWN_SHAKE_SEC = 0.22;
export const ICE_SPAWN_SHAKE_AMP_PX = 2.5;
export const ICE_TRACTION_MULT = 0.38;

/** Live reflection sampled from the frame buffer each draw (0–1). */
export const ICE_REFLECTION_OPACITY = 0.77;
export const ICE_REFLECTION_BLEND = "add";
export const ICE_REFLECTION_POOL_HALF_CELL = 0.5;
export const ICE_REFLECTION_POOL_SPRITE_FRAC = 0.4;
export const ICE_REFLECTION_FISHEYE_PEAK = 1.15;
export const ICE_REFLECTION_FISHEYE_STRENGTH = -0.86;
export const ICE_REFLECTION_ANNULUS_STRENGTH = 0.75;

export function iceSpawnShakeDevicePx(shakeRemainingSec: number): number {
  if (shakeRemainingSec <= 0) return 0;
  const t = Math.max(0, Math.min(1, shakeRemainingSec / Math.max(1e-6, ICE_SPAWN_SHAKE_SEC)));
  const amp = ICE_SPAWN_SHAKE_AMP_PX * t;
  const tick = Math.floor(shakeRemainingSec * 60);
  const sign = tick % 2 === 0 ? 1 : -1;
  return Math.round(amp * sign);
}
