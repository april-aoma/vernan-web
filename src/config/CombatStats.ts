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

/** Local sword active polygon (HitboxValues.SWORD_ATTACK_ACTIVE). */
export const SWORD_ATTACK_ACTIVE_LOCAL = [
  28, 5, 35, 8, 40, 16, 42, 28, 31, 28, 25, 27, 16, 20, 11, 12, 14, 5,
];
export const SWORD_ATTACK_ACTIVE_PIVOT_X = 16;

/** Local crouch sword active polygon (HitboxValues.SWORD_CROUCH_ATTACK_ACTIVE). */
export const SWORD_CROUCH_ATTACK_ACTIVE_LOCAL = [
  28, 16, 36, 20, 41, 24, 41, 32, 28, 32, 26, 26, 21, 22, 11, 22, 11, 17, 16, 15, 23, 15,
];
export const SWORD_CROUCH_ATTACK_ACTIVE_PIVOT_X = 16;

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
