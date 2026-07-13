import type { HitboxPose } from "../collision/HitboxPose";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";

/** Java Physics.PICKUP_BACKSTEP_MAX_ITER. */
export const PICKUP_BACKSTEP_MAX_ITER = 14;

/** True if pose polygon overlaps any solid tile AABB (Java Physics.overlapsAnySolidTile). */
export function overlapsAnySolidTile(map: TileMap, pose: HitboxPose): boolean {
  const b = pose.bounds();
  if (b.w <= 0 || b.h <= 0) return false;
  const x0 = Math.floor(b.x / TILE_SIZE);
  const y0 = Math.floor(b.y / TILE_SIZE);
  const x1 = Math.floor((b.x + b.w - 1e-6) / TILE_SIZE);
  const y1 = Math.floor((b.y + b.h - 1e-6) / TILE_SIZE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!map.isSolidTile(tx, ty)) continue;
      if (
        pose.intersectsRect({
          x: tx * TILE_SIZE,
          y: ty * TILE_SIZE,
          w: TILE_SIZE,
          h: TILE_SIZE,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True when previous foot/bottom was at or above the tile top (or in a higher tile row).
 * Java Physics.crossedLandFromAbove.
 */
export function crossedLandFromAbove(prevBottom: number, tileRowY: number): boolean {
  const floorTopY = tileRowY * TILE_SIZE;
  const prevBottomTile = Math.floor((prevBottom - 1e-4) / TILE_SIZE);
  return prevBottom <= floorTopY + 1e-3 || prevBottomTile < tileRowY;
}

/**
 * Solids always block; one-way platforms block only when crossed from above (pickup landing).
 * Java Physics.overlapsAnySolidOrLandingPlatform.
 */
export function overlapsAnySolidOrLandingPlatform(
  map: TileMap,
  pose: HitboxPose,
  prevFootY: number,
): boolean {
  const b = pose.bounds();
  if (b.w <= 0 || b.h <= 0) return false;
  const x0 = Math.floor(b.x / TILE_SIZE);
  const y0 = Math.floor(b.y / TILE_SIZE);
  const x1 = Math.floor((b.x + b.w - 1e-6) / TILE_SIZE);
  const y1 = Math.floor((b.y + b.h - 1e-6) / TILE_SIZE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const solid = map.isSolidTile(tx, ty);
      const platform =
        !solid && map.isPlatformTile(tx, ty) && crossedLandFromAbove(prevFootY, ty);
      if (!solid && !platform) continue;
      if (
        pose.intersectsRect({
          x: tx * TILE_SIZE,
          y: ty * TILE_SIZE,
          w: TILE_SIZE,
          h: TILE_SIZE,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Binary search along (x0,y0)→(x1,y1): latest clear point assuming start is clear.
 * (Java Physics.backstepPositionUntilClear.)
 */
export function backstepPositionUntilClear(
  map: TileMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  poseAt: (ax: number, ay: number) => HitboxPose,
  maxIter: number,
): { x: number; y: number } {
  return backstepPositionUntilClearLanding(
    map,
    x0,
    y0,
    x1,
    y1,
    poseAt,
    maxIter,
    Number.POSITIVE_INFINITY,
  );
}

/**
 * Like backstepPositionUntilClear, but treats one-way platforms as blocking when landing from above.
 * Java Physics.backstepPositionUntilClearLanding.
 */
export function backstepPositionUntilClearLanding(
  map: TileMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  poseAt: (ax: number, ay: number) => HitboxPose,
  maxIter: number,
  prevFootY: number,
): { x: number; y: number } {
  const landing = Number.isFinite(prevFootY);
  const blocked = (pose: HitboxPose) =>
    landing
      ? overlapsAnySolidOrLandingPlatform(map, pose, prevFootY)
      : overlapsAnySolidTile(map, pose);
  if (blocked(poseAt(x0, y0))) {
    return { x: x0, y: y0 };
  }
  if (!blocked(poseAt(x1, y1))) {
    return { x: x1, y: y1 };
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) * 0.5;
    const xm = x0 + (x1 - x0) * mid;
    const ym = y0 + (y1 - y0) * mid;
    if (blocked(poseAt(xm, ym))) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { x: x0 + (x1 - x0) * lo, y: y0 + (y1 - y0) * lo };
}

/**
 * Nudge out of solid tiles along average contact normal (Java Physics.nudgePositionOutOfSolidTiles subset).
 */
export function nudgePositionOutOfSolidTiles(
  map: TileMap,
  x: number,
  y: number,
  poseAt: (ax: number, ay: number) => HitboxPose,
  stepPx: number,
  maxSteps: number,
): { x: number; y: number } {
  let cx = x;
  let cy = y;
  for (let i = 0; i < maxSteps; i++) {
    const pose = poseAt(cx, cy);
    if (!overlapsAnySolidTile(map, pose)) {
      return { x: cx, y: cy };
    }
    const n = contactNormalSolidTowardPose(map, pose);
    if (!n) break;
    cx += n.x * stepPx;
    cy += n.y * stepPx;
  }
  return { x: cx, y: cy };
}

/** Java Physics.axisSnapContactNormalIfDiagonal. */
export function axisSnapContactNormalIfDiagonal(
  n: { x: number; y: number } | null,
): { x: number; y: number } | null {
  if (!n) return null;
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const ledgeThresh = 0.42;
  if (ax < ledgeThresh || ay < ledgeThresh) return n;
  if (ay >= ax) return { x: 0, y: Math.sign(n.y) || -1 };
  return { x: Math.sign(n.x) || -1, y: 0 };
}

/**
 * Axis-snapped nudge for polygon enemies (Java Physics.nudgePositionOutOfSolidTilesAxisAligned).
 */
export function nudgePositionOutOfSolidTilesAxisAligned(
  map: TileMap,
  x: number,
  y: number,
  poseAt: (ax: number, ay: number) => HitboxPose,
  stepPx: number,
  maxSteps: number,
): { x: number; y: number } {
  let cx = x;
  let cy = y;
  for (let i = 0; i < maxSteps; i++) {
    const pose = poseAt(cx, cy);
    if (!overlapsAnySolidTile(map, pose)) {
      return { x: cx, y: cy };
    }
    const snapped = axisSnapContactNormalIfDiagonal(contactNormalSolidTowardPose(map, pose));
    if (snapped) {
      cx += snapped.x * stepPx;
      cy += snapped.y * stepPx;
    } else {
      cx -= stepPx;
    }
  }
  return { x: cx, y: cy };
}

/**
 * Backstep along motion segment, then axis-aligned nudge (Java Physics.resolveEmbeddedPolygonFootprint).
 */
export function resolveEmbeddedPolygonFootprint(
  map: TileMap,
  prevX: number,
  prevY: number,
  x: number,
  y: number,
  poseAt: (ax: number, ay: number) => HitboxPose,
  embeddedAt: (ax: number, ay: number) => boolean,
): { x: number; y: number } {
  const back = backstepPositionUntilClear(map, prevX, prevY, x, y, poseAt, 32);
  let cx = back.x;
  let cy = back.y;
  if (embeddedAt(cx, cy)) {
    const nudged = nudgePositionOutOfSolidTilesAxisAligned(map, cx, cy, poseAt, 2, 16);
    return nudged;
  }
  return { x: cx, y: cy };
}

/** Unit normal from overlapping solid tiles toward pose (Java Physics.contactNormalSolidTowardPolygon). */
export function contactNormalSolidTowardPose(
  map: TileMap,
  pose: HitboxPose,
): { x: number; y: number } | null {
  return contactNormalSolidOrLandingPlatformTowardPose(map, pose, Number.POSITIVE_INFINITY);
}

/**
 * Like contactNormalSolidTowardPose, but also includes one-way platforms when landing from above.
 * Java Physics.contactNormalSolidOrLandingPlatformTowardPolygon.
 */
export function contactNormalSolidOrLandingPlatformTowardPose(
  map: TileMap,
  pose: HitboxPose,
  prevFootY: number,
): { x: number; y: number } | null {
  const b = pose.bounds();
  const cx = b.x + b.w * 0.5;
  const cy = b.y + b.h * 0.5;
  const x0 = Math.floor(b.x / TILE_SIZE);
  const y0 = Math.floor(b.y / TILE_SIZE);
  const x1 = Math.floor((b.x + b.w - 1e-6) / TILE_SIZE);
  const y1 = Math.floor((b.y + b.h - 1e-6) / TILE_SIZE);
  let sx = 0;
  let sy = 0;
  let count = 0;
  const includePlatforms = Number.isFinite(prevFootY);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const solid = map.isSolidTile(tx, ty);
      const platform =
        includePlatforms &&
        !solid &&
        map.isPlatformTile(tx, ty) &&
        crossedLandFromAbove(prevFootY, ty);
      if (!solid && !platform) continue;
      const tile = {
        x: tx * TILE_SIZE,
        y: ty * TILE_SIZE,
        w: TILE_SIZE,
        h: TILE_SIZE,
      };
      if (!pose.intersectsRect(tile)) continue;
      const tcx = tile.x + TILE_SIZE * 0.5;
      const tcy = tile.y + TILE_SIZE * 0.5;
      const dx = cx - tcx;
      const dy = cy - tcy;
      const len = Math.hypot(dx, dy);
      if (len > 1e-8) {
        sx += dx / len;
        sy += dy / len;
        count++;
      }
    }
  }
  if (count === 0) return null;
  const len = Math.hypot(sx, sy);
  if (len < 1e-8) return { x: 0, y: -1 };
  return { x: sx / len, y: sy / len };
}
