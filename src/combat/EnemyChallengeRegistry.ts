import type { JavaRandom } from "../util/JavaRandom";
import { CRAWLER_MAX_HP, GOLDEN_ROACH_MAX_HP, MOUSE_MAX_HP, PENISMAN_MAX_HP } from "../config/CombatStats";

/** Regular + boss spawn kinds known to the web client. */
export type ChallengeSpawnKind = "crawler" | "mouse" | "penisman" | "golden_roach" | "possessed";

export type SpawnPlacement = "floor_column" | "ambient_cluster";

/**
 * Challenge tiers + weighted picks for regular room enemies (Java EnemyChallengeRegistry).
 */

const REGULAR_KINDS: ChallengeSpawnKind[] = ["crawler", "mouse", "penisman", "golden_roach"];

export function spawnPlacement(kind: ChallengeSpawnKind): SpawnPlacement {
  if (kind === "golden_roach") return "ambient_cluster";
  return "floor_column";
}

export function challengeLevel(kind: ChallengeSpawnKind): number {
  switch (kind) {
    case "crawler":
    case "mouse":
    case "golden_roach":
      return 1;
    case "penisman":
      return 2;
    case "possessed":
      return 99;
  }
}

export function spawnCost(kind: ChallengeSpawnKind): number {
  return challengeLevel(kind);
}

export function baseMaxHealth(kind: ChallengeSpawnKind): number {
  switch (kind) {
    case "mouse":
      return MOUSE_MAX_HP;
    case "crawler":
      return CRAWLER_MAX_HP;
    case "golden_roach":
      return GOLDEN_ROACH_MAX_HP;
    case "penisman":
      return PENISMAN_MAX_HP;
    case "possessed":
      return 32;
  }
}

/** maxChallenge = dungeonFloor + 1 */
export function eligibleForNormalRoom(dungeonFloor: number): ChallengeSpawnKind[] {
  const maxChallenge = Math.max(1, dungeonFloor + 1);
  return filterByMaxChallenge(maxChallenge);
}

/** maxChallenge = floor(dungeonFloor / 5) — weakest tiers only. */
export function eligibleForSecretRoom(dungeonFloor: number): ChallengeSpawnKind[] {
  const maxChallenge = Math.floor(dungeonFloor / 5);
  return filterByMaxChallenge(maxChallenge);
}

function filterByMaxChallenge(maxChallenge: number): ChallengeSpawnKind[] {
  return REGULAR_KINDS.filter((k) => challengeLevel(k) <= maxChallenge);
}

/**
 * Weighted pick among eligible. Secret rooms favor Mouse; normal rooms equal weight.
 */
export function pickWeighted(
  rng: JavaRandom,
  eligible: ChallengeSpawnKind[],
  secretRoom: boolean,
): ChallengeSpawnKind {
  if (eligible.length === 0) return "crawler";
  if (eligible.length === 1) return eligible[0]!;
  const weights = eligible.map((k) => weightFor(k, secretRoom));
  let total = 0;
  for (const w of weights) total += w;
  let roll = rng.nextInt(total);
  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return eligible[i]!;
  }
  return eligible[eligible.length - 1]!;
}

function weightFor(kind: ChallengeSpawnKind, secretRoom: boolean): number {
  if (secretRoom) {
    switch (kind) {
      case "mouse":
        return 50;
      case "crawler":
      case "penisman":
        return 25;
      case "golden_roach":
        return 20;
      default:
        return 0;
    }
  }
  switch (kind) {
    case "crawler":
    case "mouse":
    case "penisman":
    case "golden_roach":
      return 25;
    default:
      return 0;
  }
}
