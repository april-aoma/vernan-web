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
  /** Per-hull polygon test vs sword pose (Java Player.applyAttackHits). */
  intersectsMeleePose?(pose: HitboxPose): boolean;
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
  /** Flint fire loop tick (bosses / regular enemies). */
  applyFlintFireLoopDamage?(amount: number, fireCx: number, fireCy: number): boolean;
  /** Grab reach latch (Nephilim). */
  tryGrabLatch?(playerHurt: HitboxPose): boolean;
  isGrabHoldingPlayer?(): boolean;
  grabHoldBoxPose?(): HitboxPose | null;
  flipGrabHoldFacing?(): void;
  grabPlayerDrawBeforePart?(): string | null;
  consumeGrabReleasePunish?(): boolean;
  applyGrabDrinkStealIfDue?(player: {
    applyGrabDrinkSteal(halfHearts: number, freezeFrames: number): boolean;
  }): void;
  grabReleaseDamageToPlayer?(): number;
  /** Boss dying but room not cleared yet (Nephilim head landing, Possessed delay). */
  isDying?(): boolean;
  /** Deferred black-heart burst knockback when the global beat ends. */
  releaseBlackHeartBeatKnockback?(): void;
  /** True while frozen for the black-heart beat after local hitstun elapsed. */
  isBlackHeartBeatLocked?(): boolean;
  /** Offensive hitlag — boss freezes between attack beats (Nephilim drink sip, lift land). */
  applyOffensiveHitlag?(freezeFrames: number): void;
  /** Forearm shield blocks projectiles without HP loss. */
  projectileBlockedByShield?(projectile: HitboxPose): boolean;
  applyProjectileShieldBlock?(strike: ProjectileStrike): void;
}
