/** Shared leaderboard scoring helpers (web + desktop parity). */

import type { ScoreEntry } from "./types";

/** Temporary formula — Floor + Kills + $. */
export function totalScore(e: Pick<ScoreEntry, "floorReached" | "enemiesKilled" | "coins">): number {
  return e.floorReached + e.enemiesKilled + e.coins;
}

export const TOTAL_SCORE_FORMULA = "Floor + Kills + $";

export type SortKey =
  | "rank"
  | "name"
  | "total"
  | "floor"
  | "coins"
  | "kills"
  | "client"
  | "seed"
  | "time";

export type SortDir = "asc" | "desc";

export function defaultSortDir(key: SortKey): SortDir {
  switch (key) {
    case "name":
    case "client":
    case "time":
      return "asc";
    default:
      return "desc";
  }
}

export function compareBy(
  a: ScoreEntry,
  b: ScoreEntry,
  key: SortKey,
  dir: SortDir,
): number {
  const sign = dir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (key) {
    case "name":
      cmp = a.playerName.localeCompare(b.playerName, undefined, { sensitivity: "base" });
      break;
    case "total":
    case "rank":
      cmp = totalScore(a) - totalScore(b);
      break;
    case "floor":
      cmp = a.floorReached - b.floorReached;
      break;
    case "coins":
      cmp = a.coins - b.coins;
      break;
    case "kills":
      cmp = a.enemiesKilled - b.enemiesKilled;
      break;
    case "client":
      cmp = (a.client || "").localeCompare(b.client || "");
      break;
    case "seed":
      cmp = a.seed - b.seed;
      break;
    case "time":
      cmp = a.createdAt.localeCompare(b.createdAt);
      break;
  }
  if (cmp !== 0) return cmp * sign;
  // Stable-ish tie-breakers
  const t = totalScore(b) - totalScore(a);
  if (t !== 0) return t;
  if (b.floorReached !== a.floorReached) return b.floorReached - a.floorReached;
  if (b.coins !== a.coins) return b.coins - a.coins;
  if (b.enemiesKilled !== a.enemiesKilled) return b.enemiesKilled - a.enemiesKilled;
  return a.createdAt.localeCompare(b.createdAt);
}

export function sortScores(
  rows: readonly ScoreEntry[],
  key: SortKey,
  dir: SortDir,
): ScoreEntry[] {
  return [...rows].sort((a, b) => compareBy(a, b, key, dir));
}
