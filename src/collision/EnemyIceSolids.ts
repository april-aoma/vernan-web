import type { Aabb } from "../combat/CombatMath";
import { ICE_STAND_EPS_PX } from "../combat/IceBlockSupport";
import type { HitboxPose } from "./HitboxPose";
import { tickIceBlocks } from "../entity/EnemyPeerPlatforms";

/** Matches Java StandSurfaceQuery.DECK_SLACK_PX / Player PLATFORM_DECK_SLACK_PX. */
const DECK_SLACK_PX = 6.0;

export type IceHorzHit = { deltaX: number };
export type IceVertHit = { deltaY: number; landed: boolean };

function standingFeetOnIceDeck(feet: Aabb, ice: Aabb): boolean {
  const deckTop = ice.y;
  return (
    feet.x < ice.x + ice.w &&
    feet.x + feet.w > ice.x &&
    feet.y + feet.h >= deckTop - 1e-3 &&
    feet.y + feet.h <= deckTop + DECK_SLACK_PX
  );
}

/** Push out of ice side walls unless feet are already on the deck. */
export function tryResolveIceHorizontal(pose: HitboxPose, vx: number): IceHorzHit | null {
  const blocks = tickIceBlocks();
  if (!blocks.length || Math.abs(vx) < 1e-9) return null;
  const feet = pose.bounds();
  for (const block of blocks) {
    const ice = block.rect();
    if (!pose.intersectsRect(ice)) continue;
    if (standingFeetOnIceDeck(feet, ice)) continue;
    if (vx > 0) return { deltaX: ice.x - (feet.x + feet.w) };
    if (vx < 0) return { deltaX: ice.x + ice.w - feet.x };
  }
  return null;
}

/**
 * Land on ice decks from above (if not already landed) and stop against ice ceilings when rising.
 */
export function tryResolveIceVertical(
  pose: HitboxPose,
  vy: number,
  prevBottom: number,
  prevTop: number,
  alreadyLanded: boolean,
): IceVertHit | null {
  const blocks = tickIceBlocks();
  if (!blocks.length) return null;
  const r = pose.bounds();
  if (vy >= 0 && !alreadyLanded) {
    let bestTop = Number.NaN;
    for (const block of blocks) {
      const ice = block.rect();
      if (r.x + r.w <= ice.x + 1e-3 || r.x >= ice.x + ice.w - 1e-3) continue;
      const top = block.deckTopY();
      if (prevBottom > top + ICE_STAND_EPS_PX + 1e-3) continue;
      const crossedFromAbove = prevBottom <= top + 1e-3;
      if (crossedFromAbove && r.y + r.h >= top - ICE_STAND_EPS_PX) {
        if (Number.isNaN(bestTop) || top > bestTop) bestTop = top;
      }
    }
    if (!Number.isNaN(bestTop)) {
      return { deltaY: bestTop - (r.y + r.h), landed: true };
    }
  }
  if (vy < 0) {
    for (const block of blocks) {
      const ice = block.rect();
      if (r.x + r.w <= ice.x + 1e-3 || r.x >= ice.x + ice.w - 1e-3) continue;
      if (!pose.intersectsRect(ice)) continue;
      const ceilingBottomY = ice.y + ice.h;
      const crossedIntoCeiling = prevTop >= ceilingBottomY - 1e-3;
      if (crossedIntoCeiling && r.y <= ceilingBottomY + 1e-3) {
        return { deltaY: ceilingBottomY - r.y, landed: false };
      }
    }
  }
  return null;
}
