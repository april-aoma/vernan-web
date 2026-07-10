import { clipWorldDelta } from "../combat/KnockbackCollision";
import type { Aabb } from "../combat/CombatMath";
import { aabbOverlap } from "../combat/CombatMath";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import {
  shouldStackVertically,
  stackSnapDeltaY,
  isStackedPair,
} from "./EnemyPeerPlatforms";
import { isPeerWalkingEnemy, type PeerWalkingEnemy } from "./PeerWalkingEnemy";
import { Possessed } from "./Possessed";

const MIN_OVERLAP_PX = 0.25;
const RESOLVE_ITERATIONS = 3;

/**
 * Resolves overlap between room enemies so they do not clip through each other,
 * and flips patrol direction when one walks into another (Java EnemyPeerSeparation).
 */
export function resolveEnemyPeerSeparation(
  enemies: CombatEnemy[],
  map: TileMap,
): void {
  const n = enemies.length;
  if (n < 2) return;

  for (let pass = 0; pass < RESOLVE_ITERATIONS; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = enemies[i]!;
      if (!participates(a)) continue;
      let ra = a.rect();
      for (let j = i + 1; j < n; j++) {
        const b = enemies[j]!;
        if (!participates(b)) continue;
        const rb = b.rect();
        if (!aabbOverlap(ra, rb)) continue;

        const overlapX = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
        const overlapY = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
        if (overlapX < MIN_OVERLAP_PX || overlapY < MIN_OVERLAP_PX) continue;

        if (isStackedPair(a, b, enemies)) {
          if (overlapY >= MIN_OVERLAP_PX) {
            moved = separateVertical(map, a, ra, b, rb, overlapY) || moved;
          }
          continue;
        }

        if (overlapX <= overlapY) {
          moved = separateHorizontal(map, a, ra, b, rb, overlapX) || moved;
          maybeFlipOnBump(a, ra, b, rb);
        } else {
          moved = separateVertical(map, a, ra, b, rb, overlapY) || moved;
        }
        ra = a.rect();
      }
    }
    if (!moved) break;
  }
}

function participates(e: CombatEnemy): e is PeerWalkingEnemy {
  return (
    isPeerWalkingEnemy(e) &&
    !e.isDead() &&
    !e.isInCombatHitstun() &&
    !(e instanceof Possessed)
  );
}

function separateHorizontal(
  map: TileMap,
  a: PeerWalkingEnemy,
  ra: Aabb,
  b: PeerWalkingEnemy,
  rb: Aabb,
  overlapX: number,
): boolean {
  const cxA = ra.x + ra.w * 0.5;
  const cxB = rb.x + rb.w * 0.5;
  const half = overlapX * 0.5 + 0.01;
  let dxA: number;
  let dxB: number;
  if (cxA < cxB) {
    dxA = -half;
    dxB = half;
  } else {
    dxA = half;
    dxB = -half;
  }
  return translateClipped(map, a, dxA, 0) || translateClipped(map, b, dxB, 0);
}

function separateVertical(
  map: TileMap,
  a: PeerWalkingEnemy,
  ra: Aabb,
  b: PeerWalkingEnemy,
  rb: Aabb,
  overlapY: number,
): boolean {
  if (shouldStackVertically(a, ra, b, rb, overlapY)) {
    const feetA = ra.y + ra.h;
    const feetB = rb.y + rb.h;
    const upper = feetA <= feetB + 1e-3 ? a : b;
    const lower = upper === a ? b : a;
    const ru = upper === a ? ra : rb;
    const rl = lower === a ? ra : rb;
    const dy = stackSnapDeltaY(upper, ru, lower, rl);
    if (Math.abs(dy) > 1e-9) return translateClipped(map, upper, 0, dy);
    return false;
  }

  const groundA = a.isOnGround();
  const groundB = b.isOnGround();
  const push = overlapY + 0.02;

  if (groundA && !groundB) return translateClipped(map, b, 0, -push);
  if (groundB && !groundA) return translateClipped(map, a, 0, -push);

  const cyA = ra.y + ra.h * 0.5;
  const cyB = rb.y + rb.h * 0.5;
  const half = overlapY * 0.5 + 0.01;
  let dyA: number;
  let dyB: number;
  if (cyA < cyB) {
    dyA = -half;
    dyB = half;
  } else {
    dyA = half;
    dyB = -half;
  }
  dyA = preferUpwardWhenWouldEmbed(map, a, 0, dyA);
  dyB = preferUpwardWhenWouldEmbed(map, b, 0, dyB);
  return translateClipped(map, a, 0, dyA) || translateClipped(map, b, 0, dyB);
}

function preferUpwardWhenWouldEmbed(
  map: TileMap,
  e: PeerWalkingEnemy,
  dx: number,
  dy: number,
): number {
  if (Math.abs(dy) < 1e-9) return dy;
  if (!wouldEmbedOnDelta(map, e, dx, dy)) return dy;
  const up = -Math.abs(dy);
  if (!wouldEmbedOnDelta(map, e, dx, up)) return up;
  return 0;
}

function wouldEmbedOnDelta(
  map: TileMap,
  e: PeerWalkingEnemy,
  dx: number,
  dy: number,
): boolean {
  const clipped = clipWorldDelta(map, e.collisionPoseAt.bind(e), e.x, e.y, dx, dy);
  return Math.abs(clipped.dx - dx) > 1e-6 || Math.abs(clipped.dy - dy) > 1e-6;
}

function translateClipped(
  map: TileMap,
  e: PeerWalkingEnemy,
  dx: number,
  dy: number,
): boolean {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return false;
  const clipped = clipWorldDelta(map, e.collisionPoseAt.bind(e), e.x, e.y, dx, dy);
  dx = clipped.dx;
  dy = clipped.dy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return false;
  e.translateWorld(dx, dy);
  return true;
}

function canFlipPatrol(e: PeerWalkingEnemy): boolean {
  return e.isOnGround() && !e.isJumpSquatting();
}

function maybeFlipOnBump(
  a: PeerWalkingEnemy,
  ra: Aabb,
  b: PeerWalkingEnemy,
  rb: Aabb,
): void {
  const cxA = ra.x + ra.w * 0.5;
  const cxB = rb.x + rb.w * 0.5;
  const vxA = a.facingHintVelX();
  const vxB = b.facingHintVelX();
  if (cxA < cxB) {
    if (canFlipPatrol(a) && vxA > 1) a.flipPatrolDirection();
    if (canFlipPatrol(b) && vxB < -1) b.flipPatrolDirection();
  } else if (cxA > cxB) {
    if (canFlipPatrol(a) && vxA < -1) a.flipPatrolDirection();
    if (canFlipPatrol(b) && vxB > 1) b.flipPatrolDirection();
  }
}
