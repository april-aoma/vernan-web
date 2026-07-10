import type { PlayerItemInventory } from "./PlayerItemInventory";
import { JavaRandom, toJavaLong } from "../util/JavaRandom";

export const ITEM_LIL_POSSESSED = "LIL_POSSESSED";
export const ITEM_POSSESSED_HEAD = "POSSESSED_HEAD";

/** Java `activeRoomSeed ^ 0x10557_055EDL` for the neither-owned 50/50. */
const POSSESSED_SPECIAL_REWARD_SALT = 0x10557055edn;

/**
 * Java `GamePanel.pickPossessedSpecialReward`.
 * Returns Lil / Head until Vernan owns both; then null (caller uses BOSS_CLEAR deck).
 */
export function pickPossessedSpecialReward(
  inventory: PlayerItemInventory,
  roomContentSeed: bigint,
): string | null {
  const hasLil = inventory.stacksOf(ITEM_LIL_POSSESSED) > 0;
  const hasHead = inventory.stacksOf(ITEM_POSSESSED_HEAD) > 0;
  if (hasLil && hasHead) return null;
  if (hasLil) return ITEM_POSSESSED_HEAD;
  if (hasHead) return ITEM_LIL_POSSESSED;
  const rng = new JavaRandom(toJavaLong(roomContentSeed) ^ POSSESSED_SPECIAL_REWARD_SALT);
  return rng.nextBoolean() ? ITEM_LIL_POSSESSED : ITEM_POSSESSED_HEAD;
}

/** True when this room's spawn list includes a Possessed boss. */
export function bossRoomHasPossessed(
  enemySpawns: readonly { kind: string }[],
): boolean {
  return enemySpawns.some((s) => s.kind === "possessed");
}
