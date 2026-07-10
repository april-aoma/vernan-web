/** Hitlag freeze frames from damage (Java CombatJuice.freezeFrames). */
export function freezeFrames(damage: number, multiplier = 1): number {
  const raw = Math.max(5, 5 + damage) * multiplier;
  return Math.max(1, Math.ceil(raw));
}

export type KnockbackKind = "sword_stand" | "sword_crouch" | "hurt";

const BASE_KX = 74;
const BASE_KY = -98;
/** Java KnockbackVectors.CROUCH_MAG_SCALE — same hypot, 80° launch. */
const CROUCH_MAG_SCALE = 0.85;

/** Knock vectors (Java KnockbackVectors / Player hurt). */
export function knockbackFor(kind: KnockbackKind, facingAwaySign: number): { vx: number; vy: number } {
  const sign = Math.sign(facingAwaySign || 1);
  if (kind === "sword_crouch") {
    const mag = Math.hypot(BASE_KX, BASE_KY) * CROUCH_MAG_SCALE;
    const theta = (80 * Math.PI) / 180;
    return { vx: sign * mag * Math.cos(theta), vy: -mag * Math.sin(theta) };
  }
  // SWORD_STAND and hurt share the baseline vector.
  return { vx: sign * BASE_KX, vy: BASE_KY };
}

export type WeaponStrike = {
  damage: number;
  freezeFrames: number;
  attackerX: number;
  attackerW: number;
  facing: number;
  knockKind: KnockbackKind;
  /** Optional contact for HitVfx (world px). */
  contactWorldX?: number;
  contactWorldY?: number;
};

export type Aabb = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Axis-aligned bounds of a local polygon (flat [x,y,...]). */
export function polygonAabb(local: number[]): Aabb {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < local.length; i += 2) {
    const x = local[i]!;
    const y = local[i + 1]!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Place a local polygon in world space with feet-pinned body and facing flip around pivotX.
 * Returns world AABB of the transformed polygon.
 */
export function placePolygonAabb(
  local: number[],
  pivotX: number,
  bodyLeft: number,
  bodyTop: number,
  facing: number,
): Aabb {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < local.length; i += 2) {
    let lx = local[i]!;
    const ly = local[i + 1]!;
    if (facing < 0) lx = 2 * pivotX - lx;
    const wx = bodyLeft + lx;
    const wy = bodyTop + ly;
    minX = Math.min(minX, wx);
    minY = Math.min(minY, wy);
    maxX = Math.max(maxX, wx);
    maxY = Math.max(maxY, wy);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
