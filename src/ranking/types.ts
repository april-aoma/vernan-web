/** Snapshot of a finished Vernan run (opt-in submit). */
export type RunSummary = {
  seed: number;
  floorReached: number;
  coins: number;
  enemiesKilled: number;
  /** Sum of per-kill difficulty points (boss = 25, etc.). */
  enemiesKillDifficulty: number;
  durationSec: number;
  /** Item ids obtained during the run (inventory at submit). */
  itemIds: string[];
};

/** Persisted leaderboard row. */
export type ScoreEntry = RunSummary & {
  id: string;
  playerName: string;
  /**
   * Submitting client id, e.g. `web_0.1.19` or `desktop_0.1.53`
   * (`0.1.x` where x = git commit count). Empty for legacy rows.
   */
  client: string;
  /**
   * Account id when submitted while logged in. Empty for guest / legacy rows.
   * Leaderboard shows logged-in names in green.
   */
  userId: string;
  /** UTC ISO-8601 to the second, e.g. `2026-07-10T17:32:05Z`. */
  createdAt: string;
};

/** True when the score was submitted by a logged-in account. */
export function isAuthenticatedScore(entry: Pick<ScoreEntry, "userId">): boolean {
  return typeof entry.userId === "string" && entry.userId.length > 0;
}
