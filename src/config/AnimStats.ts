/** Animation / input-feel constants (Java GamePanel / Player subset). */
export const WALK_ANIM_FPS_AT_MAX = 12;
export const WALK_SPEED_THRESHOLD = 8;
export const ATTACK_BUFFER = 0.14;
/** GamePanel turn window: 4 frames before flip + 4 after. */
export const TURN_PRE_FLIP_FRAMES = 4;
export const TURN_POST_FLIP_FRAMES = 4;
/** Walk-off landing lag floor (Java). */
export const WALK_OFF_LANDING_LOCK_FRAMES = 5;
/**
 * Seconds after apex (vy >= 0) before extended-fall frames accumulate / jump frame 3
 * (Java Player.EXTENDED_FALL_DELAY / GamePanel.JUMP_EXTENDED_FALL_DELAY).
 */
export const EXTENDED_FALL_DELAY = 0.12;
/** Cap on variable landing lock from fall airtime (Java LANDING_LOCK_MAX). */
export const LANDING_LOCK_MAX = 20;
/** Air steer strength vs full airAccel/Brake (Java applyAirHorizontal). */
export const AIR_STEER_FRAC = 0.25;
/** Walk-off air speed cap as fraction of maxAirSpeed. */
export const WALK_OFF_AIR_CAP_FRAC = 0.2;
/** Ladder jump-off horizontal kick (Java). */
export const LADDER_JUMP_SIDE_FRAC = 0.65;
export const LADDER_JUMP_NEUTRAL_FRAC = 0.45;
export const VERNAN_SPRITE_W = 32;
export const VERNAN_SPRITE_H = 32;
export const VERNAN_WALK_FRAMES = 4;
export const VERNAN_JUMP_FRAMES = 4;
/** Jump ascent frame 0 vs 1 threshold fraction of high-speed jump vel (Java JUMP_ASCENT_VY_THRESHOLD_FRAC). */
export const JUMP_ASCENT_VY_THRESHOLD_FRAC = 0.5;
export const VERNAN_ATTACK_FRAMES = 4;
/** Ladder climb strip FPS (Java GamePanel.CLIMB_ANIM_FPS). */
export const CLIMB_ANIM_FPS = 5;
export const VERNAN_CLIMB_FRAMES = 2;
/** Megaman-style mount/dismount pose lock (Java Player.GETUP_LOCK_FRAMES). */
export const GETUP_LOCK_FRAMES = 10;
/** Grounded mouth: second Down tap within this window starts ladder mount getup. */
export const LADDER_MOUTH_DOUBLE_TAP_FRAMES = 18;
/** Min horizontal overlap (px) with mouth column for mount snap (Java). */
export const LADDER_MOUTH_LATCH_MIN_OVERLAP_PX = 6;
/** Getup art is taller than stand hull (32×48). */
export const VERNAN_GETUP_SPRITE_H = 48;
/** Hurt-air strip (Java GamePanel.HURT_AIR_*). */
export const HURT_AIR_SHEET_FRAMES = 6;
export const HURT_AIR_ANIM_FPS = 12;
export const SWORD_ATTACK_FRAMES = 4;
export const CRAWLER_SPRITE_W = 16;
export const CRAWLER_SPRITE_H = 16;
export const CRAWLER_FRAMES = 2;
/** Mouse walk strip: 64×16 → 4 frames (also `mouse hurt.png`). */
export const MOUSE_SPRITE_W = 16;
export const MOUSE_SPRITE_H = 16;
export const MOUSE_FRAMES = 4;
/** Penisman walk strip: 64×16 → 4 frames (faces left like mouse). */
export const PENISMAN_SPRITE_W = 16;
export const PENISMAN_SPRITE_H = 16;
export const PENISMAN_FRAMES = 4;
/** `penis bullet.png` / die — 16×8 → 2 frames. */
export const PENIS_BULLET_FRAMES = 2;

export const JACK_BLUE_SPRITE_W = 32;
export const JACK_BLUE_SPRITE_H = 32;
export const JACK_BLUE_FRAMES = 3;

export const JACK_BONE_SPRITE_W = 16;
export const JACK_BONE_SPRITE_H = 16;

export const ROLLING_HEAD_SPRITE_W = 16;
export const ROLLING_HEAD_SPRITE_H = 16;
export const ROLLING_HEAD_FRAMES = 4;

/** Multilimber part strips — 96×32 → 3 frames of 32×32. */
export const MULTILIMBER_FRAMES = 3;
export const PENIS_BULLET_SPRITE_W = 8;
export const PENIS_BULLET_SPRITE_H = 8;
export const PENIS_BULLET_FLIGHT_ANIM_FRAME_SEC = 0.09;
export const PENIS_BULLET_DIE_FRAME_SEC = PENIS_BULLET_FLIGHT_ANIM_FRAME_SEC * 2;
export const PENIS_BULLET_DIE_FRAME_COUNT = 2;
/** Golden roach walk `golden roach2.png` — 16×8 → 2 frames of 8×8. */
export const GOLDEN_ROACH_WALK_FRAMES = 2;
export const GOLDEN_ROACH_WALK_SPRITE_W = 8;
export const GOLDEN_ROACH_WALK_SPRITE_H = 8;
/** Golden roach fly `golden roach2 fly.png` — 32×16 → 2 frames of 16×16 (art centered in canvas). */
export const GOLDEN_ROACH_FLY_FRAMES = 2;
export const GOLDEN_ROACH_FLY_SPRITE_W = 16;
export const GOLDEN_ROACH_FLY_SPRITE_H = 16;
export const POSSESSED_PART_W = 16;
export const POSSESSED_PART_H = 16;
/** Body part frame index on possessed.png (0 head, 1 body, …). */
export const POSSESSED_BODY_FRAME = 1;
