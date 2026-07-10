import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { Aabb } from "../combat/CombatMath";

/**
 * Patrol wall-turn detection for polygon floor walkers (Java EnemyPatrolWallFlip).
 * Hull separation can miss when flush against a wall; a tile probe catches that.
 */
const SIDE_WALL_FLUSH_EPS_PX = 3.0;

export type PatrolWallFlipState = {
  horizontalWallResolvedPrevStep: boolean;
  sideWallPatrolBlockedPrevStep: boolean;
  pendingWallFlip: boolean;
};

export function createPatrolWallFlipState(): PatrolWallFlipState {
  return {
    horizontalWallResolvedPrevStep: false,
    sideWallPatrolBlockedPrevStep: false,
    pendingWallFlip: false,
  };
}

/**
 * @param cooldownReady patrolFlipCooldownSec <= 0
 * @returns true when patrol direction should flip due to a wall this tick
 */
export function tickWallFlipReady(
  state: PatrolWallFlipState,
  rect: Aabb,
  map: TileMap,
  patrolDir: number,
  horizontalWallResolvedThisStep: boolean,
  cooldownReady: boolean,
): boolean {
  const sideWallBlocked = sideSolidBlocksHorizontalPatrol(rect, map, patrolDir);

  const hullRising =
    horizontalWallResolvedThisStep && !state.horizontalWallResolvedPrevStep;
  state.horizontalWallResolvedPrevStep = horizontalWallResolvedThisStep;

  const sideRising = sideWallBlocked && !state.sideWallPatrolBlockedPrevStep;
  state.sideWallPatrolBlockedPrevStep = sideWallBlocked;

  if (hullRising || sideRising || sideWallBlocked || horizontalWallResolvedThisStep) {
    state.pendingWallFlip = true;
  }
  if (!sideWallBlocked && !horizontalWallResolvedThisStep) {
    state.pendingWallFlip = false;
  }

  if (state.pendingWallFlip && cooldownReady) {
    state.pendingWallFlip = false;
    return true;
  }
  return false;
}

/** Solid wall column immediately ahead that blocks horizontal patrol. */
export function sideSolidBlocksHorizontalPatrol(
  pb: Aabb,
  map: TileMap,
  dirSign: number,
): boolean {
  if (dirSign === 0) return false;
  const ts = TILE_SIZE;
  const leadX = dirSign > 0 ? pb.x + pb.w : pb.x;
  const aheadTx =
    dirSign > 0 ? Math.floor((leadX + 0.01) / ts) : Math.floor((leadX - 0.01) / ts);
  if (aheadTx < 0 || aheadTx >= map.getWidth()) return true;

  const footRow = Math.floor((pb.y + pb.h - 1.0) / ts);
  const minTy = Math.floor(pb.y / ts);
  const maxTy = Math.floor((pb.y + pb.h - 1e-9) / ts);
  const leftT = Math.floor(pb.x / ts);
  const rightT = Math.floor((pb.x + pb.w - 1e-9) / ts);
  const forwardColumn = dirSign > 0 ? aheadTx > rightT : aheadTx < leftT;

  for (let ty = minTy; ty <= maxTy; ty++) {
    if (!map.isSolidTile(aheadTx, ty)) continue;
    if (ty === footRow && forwardColumn && isWalkableFloorSlab(map, aheadTx, footRow)) {
      continue;
    }
    if (ty === footRow && !forwardColumn) {
      const wallFace = dirSign > 0 ? aheadTx * ts : (aheadTx + 1) * ts;
      if (dirSign > 0 && leadX >= wallFace - SIDE_WALL_FLUSH_EPS_PX) return true;
      if (dirSign < 0 && leadX <= wallFace + SIDE_WALL_FLUSH_EPS_PX) return true;
      continue;
    }
    return true;
  }
  return false;
}

function isWalkableFloorSlab(map: TileMap, tx: number, footRow: number): boolean {
  if (!map.isSolidTile(tx, footRow)) return false;
  return !map.isSolidTile(tx, footRow - 1);
}
