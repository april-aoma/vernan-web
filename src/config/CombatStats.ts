/** Combat / attack timings — mirror PlayerStats base values. */
export const MAX_HEALTH = 6;
export const CONTACT_DAMAGE_IFRAMES = 1.125;
export const ATTACK_DAMAGE = 1;
export const ATTACK_WINDUP_FRAMES = 10;
export const ATTACK_ACTIVE_FRAMES = 4;
export const ATTACK_RECOVER_EARLY_FRAMES = 12;
export const ATTACK_RECOVER_LATE_FRAMES = 8;
export const ATTACK_RECOVER_FRAMES = ATTACK_RECOVER_EARLY_FRAMES + ATTACK_RECOVER_LATE_FRAMES; // 20
export const ATTACK_LANDING_LOCK_FRAMES = 20;
/** Buffer X presses through recover / landing lock / hitlag (web feel; jump already buffers). */
export { ATTACK_BUFFER } from "./AnimStats";

/** Crouch sword swing deltas vs baseline (Java Player crouch attack). */
export const CROUCH_ATTACK_WINDUP_FRAMES_DELTA = -2;
export const CROUCH_ATTACK_RECOVER_EARLY_FRAMES_DELTA = -4;
export const CROUCH_ATTACK_RECOVER_LATE_FRAMES_DELTA = -2;
export const CROUCH_ATTACK_DAMAGE_MULT = 0.8;

/** Sword sheet: 192×32 → 4 frames → frameW 48; bodyW = frameW − 16 = 32. */
export const SWORD_FRAME_W = 48;
export const SWORD_FRAME_H = 32;
export const SWORD_BODY_W = SWORD_FRAME_W - 16; // 32
export const SWORD_BODY_H = SWORD_FRAME_H; // 32

/** Re-export sword polys from HitboxValues (single source of truth). */
export {
  SWORD_ATTACK_ACTIVE_LOCAL,
  SWORD_ATTACK_ACTIVE_PIVOT_X,
  SWORD_CROUCH_ATTACK_ACTIVE_LOCAL,
  SWORD_CROUCH_ATTACK_ACTIVE_PIVOT_X,
} from "./HitboxValues";

/** Crawler physics / contact AABB from polygon (-1,0)-(9,0)-(9,12)-(-1,12). */
export const CRAWLER_W = 10;
export const CRAWLER_H = 12;
export const CRAWLER_SPAWN_H = 12;
export const CRAWLER_MAX_HP = 3;
export const CRAWLER_WALK_SPEED = 28;
export const CRAWLER_HOP_VX = 42;
export const CRAWLER_HOP_VY = 165;
export const CRAWLER_HOP_COOLDOWN_MIN = 2.2;
export const CRAWLER_HOP_COOLDOWN_MAX = 4.2;
export const CRAWLER_JUMPSQUAT_FRAMES = 18;

/** Mouse (Java Mouse.java) — floor walker; spawn H matches RoomGenerator.ENEMY_SPAWN_HITBOX_H. */
export const MOUSE_W = 12;
export const MOUSE_H = 8;
export const MOUSE_SPAWN_H = 12;
export const MOUSE_MAX_HP = 2;
export const MOUSE_WALK_SPEED_DORMANT = 32;
export const MOUSE_WALK_SPEED_FULL = 64;
export const MOUSE_WALK_SPEED_DAMAGED = 80;
/** Prevents ledge vs wall patrol flips from alternating at corners. */
export const MOUSE_PATROL_FLIP_COOLDOWN_SEC = 0.2;
/** After wall flip, suppress ledge flips until footing returns or this elapses. */
export const MOUSE_SUPPRESS_LEDGE_AFTER_WALL_SEC = 0.35;

/** Penisman (Java Penisman.java) — floor patrol shooter. */
export const PENISMAN_W = 12;
export const PENISMAN_H = 8;
export const PENISMAN_SPAWN_H = 12;
export const PENISMAN_MAX_HP = 4;
export const PENISMAN_WALK_SPEED = 28;
export const PENISMAN_SHOOT_RANGE_PX = 192;
export const PENISMAN_SHOOT_ALIGN_EPS = 2;
export const PENISMAN_SHOOT_COOLDOWN_MIN = 1.8;
export const PENISMAN_SHOOT_COOLDOWN_MAX = 2.4;
export const PENISMAN_PATROL_FLIP_COOLDOWN_SEC = 0.2;
export const PENISMAN_SUPPRESS_LEDGE_AFTER_WALL_SEC = 0.35;

/** Golden roach (Java GoldenRoach.java) — ambient cluster walker / flier. */
export const GOLDEN_ROACH_MAX_HP = 1;
export const GOLDEN_ROACH_SPAWN_W = 6;
export const GOLDEN_ROACH_SPAWN_H = 6;
