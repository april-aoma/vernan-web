import type { HitboxPose } from "../collision/HitboxPose";
import type { Aabb, ProjectileStrike, WeaponStrike } from "../combat/CombatMath";
import type { TileMap } from "../world/TileMap";

/** Minimal CombatEnemy surface for Phase 3+. */
export interface CombatEnemy {
  update(dt: number, map: TileMap, playerX: number, roomEnemies?: readonly CombatEnemy[]): void;
  rect(): Aabb;
  contactDamagePose(): Aabb;
  damageReceivePose(): Aabb;
  intersectsAttack(sword: Aabb): boolean;
  applyWeaponStrike(strike: WeaponStrike): boolean;
  /** Frisbee / projectile hit layer vs hurtbox (Java intersectsProjectile). */
  intersectsProjectile(projectile: HitboxPose): boolean;
  applyProjectileStrike(strike: ProjectileStrike): boolean;
  hurtsPlayer(playerHurt: Aabb): boolean;
  contactDamageToPlayer(): number;
  getHealth(): number;
  getMaxHealth(): number;
  isDead(): boolean;
  isInCombatHitstun(): boolean;
  facingSign(): number;
  /** When true, room-clear rewards wait (e.g. Possessed death delay). */
  blocksRoomClear(): boolean;
  /** True when attack AABB overlaps an active shield hull (no HP by default). */
  attackBlockedByShield(attack: Aabb): boolean;
  /** Shield block feedback — hitstun without HP loss. */
  applyShieldBlockStrike(strike: WeaponStrike): void;
}
