/** Planar two-bone IK (shoulder → elbow → effector). Port of Java TwoBoneIk. */

export type TwoBoneIkResult = { ex: number; ey: number; tx: number; ty: number };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Mid joint (elbow) in world space. Two solutions exist; picks the one closer to pole.
 * Returns null if degenerate.
 */
export function solveTwoBoneIk(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  len1: number,
  len2: number,
  poleX: number,
  poleY: number,
): TwoBoneIkResult | null {
  len1 = Math.max(1e-3, len1);
  len2 = Math.max(1e-3, len2);
  let dx = tx - sx;
  let dy = ty - sy;
  let dist = Math.hypot(dx, dy);
  if (dist < 1e-6) {
    dx = 1e-3;
    dy = 0;
    dist = 1e-3;
  }
  const maxReach = len1 + len2 - 1e-3;
  const minReach = Math.abs(len1 - len2) + 1e-3;
  let outTx = tx;
  let outTy = ty;
  if (dist > maxReach) {
    outTx = sx + (dx / dist) * maxReach;
    outTy = sy + (dy / dist) * maxReach;
    dx = outTx - sx;
    dy = outTy - sy;
    dist = maxReach;
  } else if (dist < minReach) {
    outTx = sx + (dx / dist) * minReach;
    outTy = sy + (dy / dist) * minReach;
    dx = outTx - sx;
    dy = outTy - sy;
    dist = minReach;
  }
  const cosShoulder = clamp((len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist), -1, 1);
  const offset = Math.acos(cosShoulder);
  const base = Math.atan2(dy, dx);
  const ex1 = sx + len1 * Math.cos(base + offset);
  const ey1 = sy + len1 * Math.sin(base + offset);
  const ex2 = sx + len1 * Math.cos(base - offset);
  const ey2 = sy + len1 * Math.sin(base - offset);
  const d1 = Math.hypot(ex1 - poleX, ey1 - poleY);
  const d2 = Math.hypot(ex2 - poleX, ey2 - poleY);
  if (d1 <= d2) return { ex: ex1, ey: ey1, tx: outTx, ty: outTy };
  return { ex: ex2, ey: ey2, tx: outTx, ty: outTy };
}
