import type { CombatEnemy } from "../entity/CombatEnemy";
import type { GemKillSource } from "./GemKillSource";

const sources = new WeakMap<CombatEnemy, GemKillSource>();

export function setGemKillSource(enemy: CombatEnemy, source: GemKillSource): void {
  sources.set(enemy, source);
}

export function gemKillSource(enemy: CombatEnemy): GemKillSource | null {
  return sources.get(enemy) ?? null;
}
