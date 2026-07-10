import type { CombatEnemy } from "../entity/CombatEnemy";
import { GoldenRoach } from "../entity/GoldenRoach";
import { Mouse } from "../entity/Mouse";
import { Nephilim } from "../entity/Nephilim";
import { Penisman } from "../entity/Penisman";
import { Possessed } from "../entity/Possessed";

/**
 * Leaderboard kill-difficulty points per defeated enemy (parity with Java EnemyKillDifficulty).
 *
 * Boss battles are always 25. Regulars: crawler/mouse/roach 1, penisman 2.
 */
export const BOSS_KILL_DIFFICULTY = 25;

export function enemyKillDifficulty(e: CombatEnemy): number {
  if (e instanceof Possessed || e instanceof Nephilim) return BOSS_KILL_DIFFICULTY;
  if (e instanceof Penisman) return 2;
  if (e instanceof Mouse || e instanceof GoldenRoach) return 1;
  // Crawler and other regulars.
  return 1;
}
