import type { PlayerStats } from "../../entity/PlayerStats";

/** Landing event for items like PLUG. */
export type ItemLandContext = {
  stats: PlayerStats;
  landingLockFrames: number;
};
