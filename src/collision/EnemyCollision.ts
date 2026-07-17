import type { Aabb } from "../combat/CombatMath";
import type { HitboxPose } from "./HitboxPose";
import { PLATFORM_DECK_SLACK_PX, TILE_SEPARATION_ITERATIONS } from "../config/Physics";
import {
  nudgePositionOutOfSolidTiles,
  resolveEmbeddedPolygonFootprint,
} from "../physics/SolidOverlap";
import { TILE_SIZE } from "../specs";
import type { CombatEnemy } from "../entity/CombatEnemy";
import { landingSurfaceY, PEER_STAND_EPS_PX } from "../entity/EnemyPeerPlatforms";
import type { TileMap } from "../world/TileMap";

export type PoseAtAnchor = (ax: number, ay: number) => HitboxPose;

function rectLeft(r: Aabb): number {
  return r.x;
}
function rectRight(r: Aabb): number {
  return r.x + r.w;
}
function rectTop(r: Aabb): number {
  return r.y;
}
function rectBottom(r: Aabb): number {
  return r.y + r.h;
}

export function tileRectWorld(tx: number, ty: number): Aabb {
  return { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
}

/**
 * Solid overlap that is not just standing on the floor under the collision hull footprint.
 * (Java Enemy / Mouse / Penisman embeddedAsideFromFootprintFloor.)
 */
export function embeddedAsideFromFootprintFloor(
  map: TileMap,
  poseAt: PoseAtAnchor,
  x: number,
  y: number,
): boolean {
  const pose = poseAt(x, y);
  const pb = pose.bounds();
  const ts = TILE_SIZE;
  const footRow = Math.floor((rectBottom(pb) - 1.0) / ts);
  const leftT = Math.floor(rectLeft(pb) / ts);
  const rightT = Math.floor((rectRight(pb) - 1e-9) / ts);
  const minTx = Math.floor(rectLeft(pb) / ts);
  const maxTx = Math.floor((rectRight(pb) - 1e-9) / ts);
  const minTy = Math.floor(rectTop(pb) / ts);
  const maxTy = Math.floor((rectBottom(pb) - 1e-9) / ts);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!map.isSolidTile(tx, ty)) continue;
      if (!pose.intersectsRect(tileRectWorld(tx, ty))) continue;
      if (ty === footRow && tx >= leftT && tx <= rightT) continue;
      return true;
    }
  }
  return false;
}

export function polygonOverlapsSolidWallTiles(pose: HitboxPose, map: TileMap): boolean {
  const aabb = pose.bounds();
  const minTx = Math.floor(rectLeft(aabb) / TILE_SIZE);
  const maxTx = Math.floor((rectRight(aabb) - 1e-9) / TILE_SIZE);
  const minTy = Math.floor(rectTop(aabb) / TILE_SIZE);
  const maxTy = Math.floor((rectBottom(aabb) - 1e-9) / TILE_SIZE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!map.isSolidTile(tx, ty)) continue;
      if (pose.intersectsRect(tileRectWorld(tx, ty))) return true;
    }
  }
  return false;
}

function crossedLandFromAbove(prevBottom: number, tileRowY: number): boolean {
  const floorTopY = tileRowY * TILE_SIZE;
  const prevBottomTile = Math.floor((prevBottom - 1e-4) / TILE_SIZE);
  return prevBottom <= floorTopY + 1e-3 || prevBottomTile < tileRowY;
}

export function polygonOverlapsFloorBlockingTiles(
  pose: HitboxPose,
  map: TileMap,
  prevBottom: number,
): boolean {
  const aabb = pose.bounds();
  const minTx = Math.floor(rectLeft(aabb) / TILE_SIZE);
  const maxTx = Math.floor((rectRight(aabb) - 1e-9) / TILE_SIZE);
  const minTy = Math.floor(rectTop(aabb) / TILE_SIZE);
  const maxTy = Math.floor((rectBottom(aabb) - 1e-9) / TILE_SIZE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const tile = tileRectWorld(tx, ty);
      if (!pose.intersectsRect(tile)) continue;
      if (map.isSolidTile(tx, ty)) return true;
      if (map.isPlatformTile(tx, ty) && crossedLandFromAbove(prevBottom, ty)) return true;
    }
  }
  return false;
}

export function polygonOverlapsCeilingSolidTiles(pose: HitboxPose, map: TileMap): boolean {
  const aabb = pose.bounds();
  const minTx = Math.floor(rectLeft(aabb) / TILE_SIZE);
  const maxTx = Math.floor((rectRight(aabb) - 1e-9) / TILE_SIZE);
  const minTy = Math.floor(rectTop(aabb) / TILE_SIZE);
  const maxTy = Math.floor((rectBottom(aabb) - 1e-9) / TILE_SIZE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!map.isSolidTile(tx, ty)) continue;
      if (pose.intersectsRect(tileRectWorld(tx, ty))) return true;
    }
  }
  return false;
}

/** Binary-search horizontal separation for polygon floor walkers (Mouse / Penisman / Crawler). */
export function resolveHorizontalPolygonEnemy(
  map: TileMap,
  poseAt: PoseAtAnchor,
  xBefore: number,
  x: number,
  y: number,
  vx: number,
): { x: number; vx: number; wallResolved: boolean } {
  if (vx === 0) return { x, vx, wallResolved: false };
  if (!polygonOverlapsSolidWallTiles(poseAt(x, y), map)) {
    return { x, vx, wallResolved: false };
  }
  // Already embedded before the step (e.g. spawn 1px into a side wall) — binary search within
  // [xBefore, x] cannot eject; leave patrol flip alone and let post-move nudge clear the embed.
  if (polygonOverlapsSolidWallTiles(poseAt(xBefore, y), map)) {
    return { x, vx: 0, wallResolved: false };
  }
  if (vx > 0) {
    let lo = Math.min(xBefore, x);
    let hi = Math.max(xBefore, x);
    for (let i = 0; i < TILE_SEPARATION_ITERATIONS; i++) {
      const mid = (lo + hi) * 0.5;
      if (polygonOverlapsSolidWallTiles(poseAt(mid, y), map)) hi = mid;
      else lo = mid;
    }
    return { x: lo, vx: 0, wallResolved: true };
  }
  let lo = Math.min(xBefore, x);
  let hi = Math.max(xBefore, x);
  for (let i = 0; i < TILE_SEPARATION_ITERATIONS; i++) {
    const mid = (lo + hi) * 0.5;
    if (polygonOverlapsSolidWallTiles(poseAt(mid, y), map)) lo = mid;
    else hi = mid;
  }
  return { x: hi, vx: 0, wallResolved: true };
}

/** Polygon vertical separation (Mouse / Penisman). */
export function resolveVerticalPolygonEnemy(
  map: TileMap,
  poseAt: PoseAtAnchor,
  self: CombatEnemy,
  peers: readonly CombatEnemy[],
  x: number,
  yBefore: number,
  y: number,
  vy: number,
  prevBottom: number,
  prevTop: number,
): { y: number; vy: number; landed: boolean } {
  if (vy > 0) {
    if (!polygonOverlapsFloorBlockingTiles(poseAt(x, y), map, prevBottom)) {
      const peerTop = landingSurfaceY(self, peers, prevBottom);
      if (!Number.isNaN(peerTop)) {
        const bottom = rectBottom(self.rect());
        return { y: y + peerTop - bottom, vy: 0, landed: true };
      }
      return { y, vy, landed: false };
    }
    if (!polygonOverlapsFloorBlockingTiles(poseAt(x, yBefore), map, prevBottom)) {
      let lo = Math.min(yBefore, y);
      let hi = Math.max(yBefore, y);
      for (let i = 0; i < TILE_SEPARATION_ITERATIONS; i++) {
        const mid = (lo + hi) * 0.5;
        if (polygonOverlapsFloorBlockingTiles(poseAt(x, mid), map, prevBottom)) hi = mid;
        else lo = mid;
      }
      return { y: lo, vy: 0, landed: true };
    }
    let outY = y;
    let panic = 0;
    while (polygonOverlapsFloorBlockingTiles(poseAt(x, outY), map, prevBottom) && panic++ < 512) {
      outY -= 1;
    }
    return { y: outY, vy: 0, landed: true };
  }
  if (vy < 0) {
    if (!polygonOverlapsCeilingSolidTiles(poseAt(x, y), map)) {
      return { y, vy, landed: false };
    }
    const headBounds = poseAt(x, y).bounds();
    const nextTop = rectTop(headBounds);
    const topTile = Math.floor((nextTop + 1e-4) / TILE_SIZE);
    const ceilingBottomY = (topTile + 1) * TILE_SIZE;
    if (prevTop < ceilingBottomY - 1e-3) {
      return { y, vy, landed: false };
    }
    let lo = Math.min(yBefore, y);
    let hi = Math.max(yBefore, y);
    for (let i = 0; i < TILE_SEPARATION_ITERATIONS; i++) {
      const mid = (lo + hi) * 0.5;
      if (polygonOverlapsCeilingSolidTiles(poseAt(x, mid), map)) lo = mid;
      else hi = mid;
    }
    return { y: hi, vy: 0, landed: false };
  }
  return { y, vy, landed: false };
}

/** After vertical resolve: depenetrate side embeds (Mouse). */
export function nudgeMouseEmbedAfterMove(
  map: TileMap,
  poseAt: PoseAtAnchor,
  x: number,
  y: number,
): { x: number; y: number } {
  if (!embeddedAsideFromFootprintFloor(map, poseAt, x, y)) {
    return { x, y };
  }
  return nudgePositionOutOfSolidTiles(map, x, y, poseAt, 2, 96);
}

/** After vertical resolve: backstep + axis nudge (Penisman). */
export function nudgePenismanEmbedAfterMove(
  map: TileMap,
  poseAt: PoseAtAnchor,
  anchorX0: number,
  anchorY0: number,
  x: number,
  y: number,
): { x: number; y: number; clearVx: boolean } {
  if (!embeddedAsideFromFootprintFloor(map, poseAt, x, y)) {
    return { x, y, clearVx: false };
  }
  const xy = resolveEmbeddedPolygonFootprint(
    map,
    anchorX0,
    anchorY0,
    x,
    y,
    poseAt,
    (ax, ay) => embeddedAsideFromFootprintFloor(map, poseAt, ax, ay),
  );
  return { x: xy.x, y: xy.y, clearVx: true };
}

/**
 * Tile-based feet crossing for landing squash — polygon resolve can miss a step without
 * falsely snapping in mid-air (Java Mouse / Penisman feetCrossedOntoFloorThisStep).
 */
export function feetCrossedOntoFloorThisStep(
  map: TileMap,
  self: CombatEnemy,
  peers: readonly CombatEnemy[],
  vy: number,
  prevFeetBottom: number,
): boolean {
  if (vy <= 0) return false;
  const r = self.rect();
  const nextBottom = rectBottom(r);
  if (!Number.isFinite(nextBottom) || !Number.isFinite(prevFeetBottom)) return false;
  const bottomTile = Math.floor((nextBottom - 1e-4) / TILE_SIZE);
  const leftTile = Math.floor((rectLeft(r) + 0.001) / TILE_SIZE);
  const rightTile = Math.floor((rectRight(r) - 0.001) / TILE_SIZE);
  if (!Number.isFinite(bottomTile) || !Number.isFinite(leftTile) || !Number.isFinite(rightTile)) {
    return false;
  }
  for (let tx = leftTile; tx <= rightTile; tx++) {
    if (map.isSolidTile(tx, bottomTile) || map.isPlatformTile(tx, bottomTile)) {
      const floorY = bottomTile * TILE_SIZE;
      const prevBottomTile = Math.floor((prevFeetBottom - 1e-4) / TILE_SIZE);
      const crossedFromAbove =
        prevFeetBottom <= floorY + 1e-3 || prevBottomTile < bottomTile;
      return crossedFromAbove && nextBottom >= floorY - 1e-3;
    }
  }
  const peerTop = landingSurfaceY(self, peers, prevFeetBottom);
  if (!Number.isNaN(peerTop)) {
    return (
      prevFeetBottom <= peerTop + 1e-3 && nextBottom >= peerTop - PEER_STAND_EPS_PX
    );
  }
  return false;
}

/** Crawler vertical resolve — floors and ceilings only (Java Enemy.resolveVertical). */
export function resolveVerticalCrawler(
  map: TileMap,
  rect: () => Aabb,
  self: CombatEnemy,
  peers: readonly CombatEnemy[],
  y: number,
  vy: number,
  prevBottom: number,
  prevTop: number,
): { y: number; vy: number; landed: boolean; onGround: boolean } {
  const r = rect();
  let landed = false;
  let onGround = false;

  if (vy > 0) {
    const nextBottom = rectBottom(r);
    const bottomTile = Math.floor((nextBottom - 1e-4) / TILE_SIZE);
    const leftTile = Math.floor((rectLeft(r) + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((rectRight(r) - 0.001) / TILE_SIZE);
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (map.isSolidTile(tx, bottomTile) || map.isPlatformTile(tx, bottomTile)) {
        const floorY = bottomTile * TILE_SIZE;
        const prevBottomTile = Math.floor((prevBottom - 1e-4) / TILE_SIZE);
        const crossedFromAbove = prevBottom <= floorY + 1e-3 || prevBottomTile < bottomTile;
        if (crossedFromAbove && nextBottom >= floorY - 1e-3) {
          if (map.isPlatformTile(tx, bottomTile) && nextBottom > floorY + PLATFORM_DECK_SLACK_PX) {
            continue;
          }
          const lr = rect();
          return {
            y: y + floorY - rectBottom(lr),
            vy: 0,
            landed: true,
            onGround: true,
          };
        }
        return { y, vy, landed, onGround };
      }
    }
    const peerTop = landingSurfaceY(self, peers, prevBottom);
    if (!Number.isNaN(peerTop)) {
      const lr = rect();
      return {
        y: y + peerTop - rectBottom(lr),
        vy: 0,
        landed: true,
        onGround: true,
      };
    }
  } else if (vy < 0) {
    const nextTop = rectTop(r);
    const topTile = Math.floor((nextTop + 1e-4) / TILE_SIZE);
    const leftTile = Math.floor((rectLeft(r) + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((rectRight(r) - 0.001) / TILE_SIZE);
    const ceilingBottomY = (topTile + 1) * TILE_SIZE;
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (map.isSolidTile(tx, topTile)) {
        const crossedIntoCeiling = prevTop >= ceilingBottomY - 1e-3;
        if (crossedIntoCeiling && nextTop <= ceilingBottomY + 1e-3) {
          const lr = rect();
          return { y: y + ceilingBottomY - rectTop(lr), vy: 0, landed: false, onGround };
        }
        break;
      }
    }
  }
  return { y, vy, landed, onGround };
}
