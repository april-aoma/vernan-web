import type { CombatEnemy } from "../entity/CombatEnemy";
import { Nephilim } from "../entity/Nephilim";
import { Possessed } from "../entity/Possessed";

/** Which room enemies may be frozen when ice block is owned (Java IceBlockFreeze). */
export function isIceBlockFreezable(e: CombatEnemy): boolean {
  return !isIceBlockBoss(e);
}

export function isIceBlockBoss(e: CombatEnemy): boolean {
  return e instanceof Possessed || e instanceof Nephilim;
}
