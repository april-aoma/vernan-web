import type { Aabb, WeaponStrike } from "../combat/CombatMath";
import type { TileMap } from "../world/TileMap";

/** Minimal CombatEnemy surface for Phase 3+. */
export interface CombatEnemy {
  update(dt: number, map: TileMap, playerX: number): void;
  rect(): Aabb;
  contactDamagePose(): Aabb;
  damageReceivePose(): Aabb;
  intersectsAttack(sword: Aabb): boolean;
  applyWeaponStrike(strike: WeaponStrike): boolean;
  hurtsPlayer(playerHurt: Aabb): boolean;
  contactDamageToPlayer(): number;
  getHealth(): number;
  isDead(): boolean;
  isInCombatHitstun(): boolean;
  facingSign(): number;
  /** When true, room-clear rewards wait (e.g. Possessed death delay). */
  blocksRoomClear(): boolean;
}
