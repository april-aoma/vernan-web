import type { Player } from "../../entity/Player";
import type { PlayerItemInventory } from "../PlayerItemInventory";
import type { PlayerStats } from "../../entity/PlayerStats";
import type { PickupKind } from "../../world/BreakableLootRoll";
import type { JavaRandom } from "../../util/JavaRandom";

/** Game-side services for item pickup / HUD effects (Java ItemPickupHost). */
export interface ItemPickupHost {
  player(): Player;

  stats(): PlayerStats;

  inventory(): PlayerItemInventory;

  runSeed(): bigint;

  currentRoomId(): number;

  /** Animate HUD coin/key counters counting up; applies currency to PlayerStats. */
  startHudResourceGain(coins: number, keys: number): void;

  /** Collection VFX only (stats already updated). */
  playPickupCollectFxAtPlayer(kind: PickupKind, count: number): void;

  showPickupMessage(line: string): void;

  rngForItem(itemId: string): JavaRandom;
}
