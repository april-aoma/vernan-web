import type { Aabb } from "../combat/CombatMath";

/**
 * Transform texture-local polygon (flat x,y,...) to world space — matches Java CompoundHitbox.
 * Facing flips about pivotLocalX; Y scales from top (anchor).
 */
export function worldPolygon(
  local: ReadonlyArray<number>,
  anchorX: number,
  anchorY: number,
  facingSign: number,
  pivotLocalX: number,
  scaleLocalY = 1,
  scaleLocalX = 1,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < local.length; i += 2) {
    let lx = local[i]!;
    const ly = local[i + 1]!;
    if (facingSign < 0) lx = 2 * pivotLocalX - lx;
    lx = pivotLocalX + (lx - pivotLocalX) * scaleLocalX;
    out.push(anchorX + lx, anchorY + ly * scaleLocalY);
  }
  return out;
}

export function polygonBounds(worldXy: ReadonlyArray<number>): Aabb {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < worldXy.length; i += 2) {
    const x = worldXy[i]!;
    const y = worldXy[i + 1]!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Convex polygon ∩ axis-aligned rect via SAT (Java Area.intersect emptiness for convex hulls).
 * Inclusive edges: flush contact still counts (enemies need this for wall/floor flush; player
 * ceiling false-ground is handled in {@link Player.isGrounded}, not here).
 */
export function polygonIntersectsAabb(worldXy: ReadonlyArray<number>, box: Aabb): boolean {
  const n = worldXy.length / 2;
  if (n < 3 || box.w <= 0 || box.h <= 0) return false;

  const axes: Array<{ x: number; y: number }> = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  for (let i = 0; i < n; i++) {
    const x0 = worldXy[i * 2]!;
    const y0 = worldXy[i * 2 + 1]!;
    const x1 = worldXy[((i + 1) % n) * 2]!;
    const y1 = worldXy[((i + 1) % n) * 2 + 1]!;
    const ex = x1 - x0;
    const ey = y1 - y0;
    const len = Math.hypot(ex, ey);
    if (len < 1e-12) continue;
    // outward normal of edge
    axes.push({ x: -ey / len, y: ex / len });
  }

  const bx0 = box.x;
  const by0 = box.y;
  const bx1 = box.x + box.w;
  const by1 = box.y + box.h;

  for (const axis of axes) {
    let pMin = Infinity;
    let pMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const d = worldXy[i * 2]! * axis.x + worldXy[i * 2 + 1]! * axis.y;
      pMin = Math.min(pMin, d);
      pMax = Math.max(pMax, d);
    }
    const c = [
      bx0 * axis.x + by0 * axis.y,
      bx1 * axis.x + by0 * axis.y,
      bx1 * axis.x + by1 * axis.y,
      bx0 * axis.x + by1 * axis.y,
    ];
    const aMin = Math.min(...c);
    const aMax = Math.max(...c);
    if (pMax < aMin - 1e-9 || aMax < pMin - 1e-9) return false;
  }
  return true;
}

/** Convex polygon ∩ convex polygon via SAT. */
export function polygonIntersectsPolygon(a: ReadonlyArray<number>, b: ReadonlyArray<number>): boolean {
  const na = a.length / 2;
  const nb = b.length / 2;
  if (na < 3 || nb < 3) return false;
  const axes = [...edgeAxes(a), ...edgeAxes(b)];
  for (const axis of axes) {
    let aMin = Infinity;
    let aMax = -Infinity;
    for (let i = 0; i < na; i++) {
      const d = a[i * 2]! * axis.x + a[i * 2 + 1]! * axis.y;
      aMin = Math.min(aMin, d);
      aMax = Math.max(aMax, d);
    }
    let bMin = Infinity;
    let bMax = -Infinity;
    for (let i = 0; i < nb; i++) {
      const d = b[i * 2]! * axis.x + b[i * 2 + 1]! * axis.y;
      bMin = Math.min(bMin, d);
      bMax = Math.max(bMax, d);
    }
    if (aMax < bMin - 1e-9 || bMax < aMin - 1e-9) return false;
  }
  return true;
}

function edgeAxes(flat: ReadonlyArray<number>): Array<{ x: number; y: number }> {
  const n = flat.length / 2;
  const axes: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const x0 = flat[i * 2]!;
    const y0 = flat[i * 2 + 1]!;
    const x1 = flat[((i + 1) % n) * 2]!;
    const y1 = flat[((i + 1) % n) * 2 + 1]!;
    const ex = x1 - x0;
    const ey = y1 - y0;
    const len = Math.hypot(ex, ey);
    if (len < 1e-12) continue;
    axes.push({ x: -ey / len, y: ex / len });
  }
  return axes;
}

/** Rotate flat world polygon about (cx, cy). */
export function rotateWorldPolygon(
  flat: ReadonlyArray<number>,
  cx: number,
  cy: number,
  angleRad: number,
): number[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const out: number[] = new Array(flat.length);
  for (let i = 0; i < flat.length; i += 2) {
    const wx = flat[i]!;
    const wy = flat[i + 1]!;
    const lx = wx - cx;
    const ly = wy - cy;
    out[i] = cx + lx * cos - ly * sin;
    out[i + 1] = cy + lx * sin + ly * cos;
  }
  return out;
}
