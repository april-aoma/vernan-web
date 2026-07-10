/** Shared physics — mirror game.config.Physics (subset). */
export const GRAVITY = 300;

/** Player movement stats — mirror game.entity.PlayerStats base values. */
export const PLAYER_W = 10;
export const PLAYER_STAND_H = 18;
export const PLAYER_CROUCH_H = 12;

export const MAX_GROUND_SPEED = 85;
export const MAX_AIR_SPEED = 70;
export const CLIMB_SPEED = 80;
export const GROUND_ACCEL = 300;
export const GROUND_BRAKE = 500;
export const GROUND_FRICTION = 1800;
export const AIR_ACCEL = 150;
export const AIR_BRAKE = 1200;
export const JUMP_VEL = 140;
export const HIGH_SPEED_JUMP_VEL_MULT = 1.2;
export const GRAVITY_RELEASE_MULT = 2.85;
export const MAX_FALL = 3000;
export const JUMP_SQUAT_FRAMES = 5;

/** SHY_MASK: passive gravity multiplier (Java Physics.SHY_MASK_GRAVITY_MULT). */
export const SHY_MASK_GRAVITY_MULT = 1.54;
/** SHY_MASK: hold Down on ground to charge superjump (60 Hz frames). */
export const SHY_MASK_CHARGE_FRAMES = 90;
/** SHY_MASK: jump window after releasing Down when fully charged. */
export const SHY_MASK_FLASH_GRACE_FRAMES = 30;
/** SHY_MASK: each flash color in the charge cycle. */
export const SHY_MASK_COLOR_CYCLE_FRAMES = 5;
/** SHY_MASK: flash tint begins fading in at this charge frame. */
export const SHY_MASK_COLOR_FADE_START_FRAME = 20;
/** SHY_MASK: feet-anchored X scale at full charge crouch. */
export const SHY_MASK_CHARGE_SQUASH_X = 1.3;
/** SHY_MASK: unwind charge squash after releasing Down. */
export const SHY_MASK_CHARGE_RELEASE_RECOVER_FRAMES = 5;
/** SHY_MASK: lift-off Y stretch on superjump. */
export const SHY_MASK_SUPER_JUMP_STRETCH_Y = 1.2;
/** SHY_MASK: lift-off vy for superjump (≈ 5 tiles at SHY_MASK_GRAVITY_MULT). */
export const SHY_MASK_SUPER_JUMP_VEL = 268;

export const COYOTE_TIME = 0.05;
export const JUMP_BUFFER = 0.1;
export const PLATFORM_DECK_SLACK_PX = 6;
export const TILE_SEPARATION_ITERATIONS = 48;

/** Camera edge inset in world px (16 device / CAMERA_ZOOM). */
export const CAMERA_EDGE_BUFFER_WORLD = 8;

/** Side-scroll soft chase (Java SideScrollCamera). */
export const CAMERA_H_DEAD_ZONE_FRAC = 0.2;
export const CAMERA_H_MAX_SPEED = 210;
export const CAMERA_H_FACE_BIAS = 22;
export const CAMERA_H_FACE_VX_BIAS_ON = 48;
export const CAMERA_H_FACE_VX_BIAS_OFF = 28;
export const CAMERA_H_IDEAL_SMOOTH_TAU = 0.11;
export const CAMERA_V_DEAD_ZONE_FRAC = 0.14;
export const CAMERA_V_SPEED_GROUND = 190;
export const CAMERA_V_SPEED_AIR_UP = 250;
export const CAMERA_V_SPEED_AIR_DOWN = 105;
export const CAMERA_V_LANDING_BOOST_TIME = 0.14;
export const CAMERA_V_LANDING_SPEED_MULT = 2.15;

/** Enemy framing + ladder shaft (Java SideScrollCamera). */
export const CAMERA_ENEMY_FOCUS_RADIUS_TILES = 8;
export const CAMERA_ENEMY_FOCUS_PAD_WORLD = 28;
export const CAMERA_LADDER_ENEMY_BELOW_MAX_X_WORLD = 52;
export const CAMERA_LADDER_ENEMY_BELOW_EXTRA_FRAC = 0.16;
export const CAMERA_LADDER_LOOK_FRAC_SHORT = 0.12;
export const CAMERA_LADDER_LOOK_FRAC_FULL = 0.2;
export const CAMERA_LADDER_LOOK_FRAC_CAP = 0.3;
export const CAMERA_LADDER_V_SPEED = 165;
export const CAMERA_LADDER_V_DEAD_ZONE_FRAC = 0.02;
export const CAMERA_LADDER_BIAS_TAU_INPUT = 0.06;
export const CAMERA_LADDER_BIAS_TAU_HOLD = 0.14;
export const CAMERA_LADDER_BIAS_TAU_DECAY = 2.4;

/** Secret seam open strip (Java Physics.SEAM_ANIM_*). */
export const SEAM_ANIM_STAGGER_FRAMES = 4;
export const SEAM_ANIM_VERTICAL_STAGGER_FRAMES = 8;
export const SEAM_ANIM_CAMERA_PAN_STEPS = 15;

/** Breakable debris spawn spin (Java BRICKCHUNK_SPAWN_OMEGA_RAD_PER_SEC). */
export const BRICKCHUNK_SPAWN_OMEGA_RAD_PER_SEC = 7;
export const BRICKCHUNK_RESTITUTION_FLOOR = 0.22;
export const BRICKCHUNK_RESTITUTION_WALL = 0.28;
export const BRICKCHUNK_RESTITUTION_CEILING = 0.16;
export const BRICKCHUNK_LINEAR_AIR_DAMP_VX_PER_SEC = 0.65;

/** GEM_SWORD (Java Physics). */
export const GEM_SWORD_HIT_COIN_CHANCE = 0.05;
export const GEM_SWORD_KILL_COIN_CHANCE = 0.33;
export const GEM_SWORD_HITSTUN_MULT = 2.0;

/** STICK reflect (Java Physics). */
export const STICK_REFLECT_SPEED_MULT = 1.05;
export const STICK_REFLECT_DAMAGE_MULT = 2.0;

/** Flint spark proc (Java Player). */
export const FLINT_SPARK_BASE_CHANCE = 0.1;
export const FLINT_SPARK_LUCK_MULT = 0.05;
