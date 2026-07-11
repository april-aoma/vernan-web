import type { Aabb } from "./CombatMath";
import type { HitboxPose } from "../collision/HitboxPose";
import type { IceBlock } from "../entity/IceBlock";
import type { Player } from "../entity/Player";

/** Java CombatJuice.BLOCK_BREAK_HITLAG_FRAMES. */
const BLOCK_BREAK_HITLAG_FRAMES = 3;

export const ICE_STAND_EPS_PX = 3.0;

function horizontalOverlap(a: Aabb, b: Aabb): boolean {
  return a.x + a.w > b.x + 1e-3 && a.x < b.x + b.w - 1e-3;
}

export function iceSolidRects(blocks: readonly IceBlock[]): Aabb[] {
  return blocks.map((b) => b.rect());
}

export function feetOnIce(player: Player, blocks: readonly IceBlock[]): boolean {
  if (!blocks.length || player.vy < 0) return false;
  const feet = player.feetSupportBounds();
  for (const block of blocks) {
    const ice = block.rect();
    if (!horizontalOverlap(feet, ice)) continue;
    if (Math.abs(feet.y + feet.h - block.deckTopY()) <= ICE_STAND_EPS_PX + 3) return true;
  }
  return false;
}

export function landingDeckTopY(
  prevBottom: number,
  nextBottom: number,
  vy: number,
  left: number,
  right: number,
  blocks: readonly IceBlock[],
): number {
  if (vy < 0 || !blocks.length) return Number.NaN;
  let best = Number.NaN;
  for (const block of blocks) {
    const ice = block.rect();
    if (right <= ice.x + 1e-3 || left >= ice.x + ice.w - 1e-3) continue;
    const top = block.deckTopY();
    const crossed = prevBottom <= top + 1e-3;
    if (crossed && nextBottom >= top - ICE_STAND_EPS_PX) {
      if (Number.isNaN(best) || top < best) best = top;
    }
  }
  return best;
}

export function intersectsAnyIce(blocks: readonly IceBlock[], pose: HitboxPose): boolean {
  for (const block of blocks) {
    if (pose.intersectsRect(block.rect())) return true;
  }
  return false;
}

export function findBreakableIceHit(blocks: readonly IceBlock[], hit: Aabb): IceBlock | null {
  for (const block of blocks) {
    if (!block.breakableNow()) continue;
    const ice = block.rect();
    if (
      hit.x < ice.x + ice.w &&
      hit.x + hit.w > ice.x &&
      hit.y < ice.y + ice.h &&
      hit.y + hit.h > ice.y
    ) {
      return block;
    }
  }
  return null;
}

/** Index of breakable ice Vernan stands on, or -1 (Java IceBlockSupport.pluckableIndexUnderFeet). */
export function pluckableIceIndexUnderFeet(player: Player, blocks: readonly IceBlock[]): number {
  if (!blocks.length || !feetOnIce(player, blocks)) return -1;
  const feet = player.feetSupportBounds();
  let best = -1;
  let bestDeck = Number.POSITIVE_INFINITY;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (!block.breakableNow()) continue;
    const ice = block.rect();
    if (!horizontalOverlap(feet, ice)) continue;
    const deck = block.deckTopY();
    if (Math.abs(feet.y + feet.h - deck) > ICE_STAND_EPS_PX + 3) continue;
    if (deck < bestDeck) {
      bestDeck = deck;
      best = i;
    }
  }
  return best;
}

/**
 * Sword vs breakable ice blocks (Java trySwordStrikeIceBlocks).
 * @returns hitlag frames when a block shatters, else 0.
 */
export function trySwordStrikeIce(
  player: Player,
  blocks: IceBlock[],
  shatter: (block: IceBlock) => void,
): number {
  const sword = player.attackHitbox();
  if (!sword || player.attackHitLanded) return 0;
  const hit = findBreakableIceHit(blocks, sword);
  if (!hit) return 0;
  const index = blocks.indexOf(hit);
  if (index >= 0) blocks.splice(index, 1);
  shatter(hit);
  player.hitlagFrames = Math.max(player.hitlagFrames, BLOCK_BREAK_HITLAG_FRAMES);
  return BLOCK_BREAK_HITLAG_FRAMES;
}
