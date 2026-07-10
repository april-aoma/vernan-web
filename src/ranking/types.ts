/** Snapshot of a finished Vernan run (opt-in submit). */
export type RunSummary = {
  seed: number;
  floorReached: number;
  coins: number;
  enemiesKilled: number;
  durationSec: number;
  /** Item ids obtained during the run (inventory at submit). */
  itemIds: string[];
};

/** Persisted leaderboard row. */
export type ScoreEntry = RunSummary & {
  id: string;
  playerName: string;
  /** UTC ISO-8601 to the second, e.g. `2026-07-10T17:32:05Z`. */
  createdAt: string;
};
