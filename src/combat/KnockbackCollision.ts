import type { HitboxPose } from "../collision/HitboxPose";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";

/** Java KnockbackCollision.DEFAULT_PROBE_PX / Player.HURT_DI_COLLISION_PROBE_PX. */
export const KNOCKBACK_PROBE_PX = 2;

export type PoseAtAnchor = (anchorX: number, anchorY: number) => HitboxPose;

/**
 * Zero dvx/dvy components whose probe step would overlap a solid (Java KnockbackCollision).
 */
export function clipVelocityDelta(
  map: TileMap,
  poseAt: PoseAtAnchor,
  anchorX: number,
  anchorY: number,
  dvx: number,
  dvy: number,
  probePx = KNOCKBACK_PROBE_PX,
): { vx: number; vy: number } {
  let outVx = dvx;
  let outVy = dvy;
  if (
    Math.abs(dvx) > 1e-9 &&
    probeStepOverlapsSolid(map, poseAt, anchorX, anchorY, Math.sign(dvx) * probePx, 0)
  ) {
    outVx = 0;
  }
  if (
    Math.abs(dvy) > 1e-9 &&
    probeStepOverlapsSolid(map, poseAt, anchorX, anchorY, 0, Math.sign(dvy) * probePx)
  ) {
    outVy = 0;
  }
  return { vx: outVx, vy: outVy };
}

/** Clip a world translation the same way as velocity components (Java clipWorldDelta). */
export function clipWorldDelta(
  map: TileMap,
  poseAt: PoseAtAnchor,
  anchorX: number,
  anchorY: number,
  dx: number,
  dy: number,
  probePx = KNOCKBACK_PROBE_PX,
): { dx: number; dy: number } {
  const v = clipVelocityDelta(map, poseAt, anchorX, anchorY, dx, dy, probePx);
  return { dx: v.vx, dy: v.vy };
}

function probeStepOverlapsSolid(
  map: TileMap,
  poseAt: PoseAtAnchor,
  anchorX: number,
  anchorY: number,
  probeDx: number,
  probeDy: number,
): boolean {
  const pose = poseAt(anchorX + probeDx, anchorY + probeDy);
  const b = pose.bounds();
  const x0 = Math.floor(b.x / TILE_SIZE);
  const y0 = Math.floor(b.y / TILE_SIZE);
  const x1 = Math.floor((b.x + b.w - 1e-6) / TILE_SIZE);
  const y1 = Math.floor((b.y + b.h - 1e-6) / TILE_SIZE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!map.isSolidTile(tx, ty)) continue;
      const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
      if (pose.intersectsRect(tile)) return true;
    }
  }
  return false;
}
