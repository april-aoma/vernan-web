import type { HitboxPose } from "../collision/HitboxPose";
import type { CombatEnemy } from "../entity/CombatEnemy";

/** Sword polygon vs enemy hurt hulls when supported; otherwise AABB fallback. */
export function enemyIntersectsMelee(e: CombatEnemy, swordPose: HitboxPose): boolean {
  if (e.intersectsMeleePose) return e.intersectsMeleePose(swordPose);
  return e.intersectsAttack(swordPose.bounds());
}
