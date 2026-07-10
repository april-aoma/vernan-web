/**
 * Defensive hitlag visuals only (Java HitlagState).
 * Offensive hitlag (landing a hit) must not use shake/red.
 */
export const DEFAULT_SHAKE_AMPLITUDE_PX = 8;

/** Random shake component in [-amp/2, +amp/2]. */
export function sampleShake(ampWorldPx = DEFAULT_SHAKE_AMPLITUDE_PX): number {
  return (Math.random() - 0.5) * ampWorldPx;
}

export const HURT_TINT_SECONDS = 0.35;
export const HURT_TINT_PEAK_ALPHA = 220;
