import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import {
  applyCarrierMotion,
  enemyFeetY,
  linkCarriersAtTickStart,
  snapRidersToDecks,
  syncRiderVelocities,
} from "./EnemyPeerPlatforms";
import { resolveEnemyPeerSeparation } from "./EnemyPeerSeparation";
import { isPeerWalkingEnemy } from "./PeerWalkingEnemy";

const carryLinks = new Map<CombatEnemy, CombatEnemy>();

/**
 * Java GamePanel enemy tick tail: carrier motion, deck snaps, peer separation, velocity sync.
 * Call after individual enemy updates (vision should already be applied).
 */
export function tickEnemyPeerPhysics(
  enemies: CombatEnemy[],
  map: TileMap,
  playerX: number,
  dt: number,
): void {
  for (const e of enemies) {
    if (isPeerWalkingEnemy(e)) e.capturePeerCarryAnchor();
  }
  linkCarriersAtTickStart(enemies, carryLinks);
  for (const e of enemies) {
    if (isPeerWalkingEnemy(e)) {
      e.setPeerCarrierForTick(carryLinks.get(e) ?? null);
    }
  }

  const order = [...enemies].sort((a, b) => enemyFeetY(b) - enemyFeetY(a));
  for (const e of order) {
    if (!e.isDead()) e.update(dt, map, playerX, enemies);
  }

  applyCarrierMotion(carryLinks);
  snapRidersToDecks(enemies);
  resolveEnemyPeerSeparation(enemies, map);
  snapRidersToDecks(enemies);
  syncRiderVelocities(enemies);
}
