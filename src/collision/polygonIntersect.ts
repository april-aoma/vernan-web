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
