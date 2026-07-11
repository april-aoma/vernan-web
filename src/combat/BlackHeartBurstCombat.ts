import type { CombatEnemy } from "../entity/CombatEnemy";
import type { BlackHeartBurstConfig } from "./BlackHeartDepletionBeat";
import { blackHeartBurstDamage } from "./BlackHeartDepletionBeat";
import { knockbackForBlackHeartBurst, type WeaponStrike } from "./CombatMath";
import { HitVfxKind } from "../fx/HitVfx";

const ALIVE_EPS = 1e-9;

/** Room-wide retaliation when Vernan loses black HP (or heart of darkness). */
export function applyBlackHeartBursts(
  burstCount: number,
  config: BlackHeartBurstConfig,
  enemies: readonly CombatEnemy[],
  attackerOriginX: number,
  attackerWidth: number,
  attackerFacing: number,
  onHit?: (enemy: CombatEnemy, strike: WeaponStrike) => void,
): void {
  if (burstCount <= 0 || enemies.length === 0) return;
  for (let burst = 0; burst < burstCount; burst++) {
    for (const enemy of enemies) {
      if (enemy.isDead()) continue;
      const maxHp = Math.max(ALIVE_EPS, enemy.getMaxHealth());
      const r = enemy.rect();
      const contactX = r.x + r.w * 0.5;
      const contactY = r.y + r.h * 0.5;
      const strike: WeaponStrike = {
        damage: blackHeartBurstDamage(config, maxHp),
        freezeFrames: config.frameCount,
        attackerX: attackerOriginX,
        attackerW: attackerWidth,
        facing: attackerFacing,
        knockKind: "black_heart_burst",
        contactWorldX: contactX,
        contactWorldY: contactY,
        hitVfxKind: HitVfxKind.BLACK_HEART,
      };
      if (enemy.applyWeaponStrike(strike)) {
        onHit?.(enemy, strike);
      }
    }
  }
}

export function blackHeartBurstKnockVelocity(damage: number): { vx: number; vy: number } {
  return knockbackForBlackHeartBurst(damage);
}
