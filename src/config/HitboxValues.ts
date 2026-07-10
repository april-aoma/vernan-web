/**
 * Authoritative hitbox geometry (Java `game.config.HitboxValues` subset).
 * Do not invent polygons — mirror HitboxEditor output.
 */

/** Stand / grounded collision (PLAYER polygon). */
export const PLAYER_STAND_HITBOX_H = 18;
export const PLAYER_WIDTH = 10;
export const PLAYER_PIVOT_LOCAL_X = PLAYER_WIDTH * 0.5;

/** Stand collision polygon (0,0)-(10,0)-(10,18)-(0,18). */
export const PLAYER_STAND_LOCAL = [0, 0, 10, 0, 10, 18, 0, 18];

/**
 * Jump collision hull PLAYER_JUMP
 * `(0,0)-(10,0)-(10,5)-(4,11)-(0,13)`.
 */
export const PLAYER_JUMP_LOCAL = [0, 0, 10, 0, 10, 5, 4, 11, 0, 13];
/** AABB height of jump polygon (debug / HUD). */
export const PLAYER_JUMP_HITBOX_H = 13;
export const PLAYER_JUMP_PIVOT_X = 5;
/** Reference height for jump local Y scale (editor / vernan jump.png). */
export const PLAYER_JUMP_STAND_HITBOX_H = 18;
/** Local Y of jump lead foot (right tip) and trail foot (left tip). */
export const PLAYER_JUMP_LEAD_FOOT_LOCAL_Y = 5;
export const PLAYER_JUMP_TRAIL_FOOT_LOCAL_Y = 13;

/** Vulnerability hull pivot — full PLAYER_HURT polygon still stubbed as AABB. */
export const PLAYER_HURT_PIVOT_X = 5;

/** Knockback / DI (Java Player). */
export const HURT_KNOCKBACK_X = 74;
export const HURT_KNOCKBACK_Y = -98;
export const HURT_DI_MAX_FRAC = 0.1;
export const HURT_DI_COLLISION_PROBE_PX = 2;
export const HURT_TINT_SECONDS = 0.35;
