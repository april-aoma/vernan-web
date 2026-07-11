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

/** HEELIES (Java Physics). */
export const HEELIES_COAST_CAP_MAX_MULT = 2.2;
export const HEELIES_PUMP_MAX_TAP_FRAMES = 10;
export const HEELIES_PUMPS_TO_CEILING = 5;
export const HEELIES_STOP_FRAMES = 40;

/** PINK_SCARF: hold jump while falling (Java Player.SCARF_*). */
export const SCARF_FLOAT_GRAVITY_SCALE = 1 / 3;
export const SCARF_GLIDE_AIR_SPEED_BONUS = 45;
export const SCARF_AIR_CONTROL_MULT = 3;

/** PONCHO mid-air flap (Java Physics.PONCHO_FLAP_*). */
export const PONCHO_FLAP_HEIGHT_PX = 12;
export const PONCHO_FLAP_FALLING_HEIGHT_PX = 16;
export const PONCHO_FLAP_COOLDOWN_FRAMES = 20;
export const PONCHO_FLAP_STRETCH_Y = 1.06;
export const PONCHO_FLAP_STRETCH_RECOVER_FRAMES = 8;

export function ponchoFlapUpwardVy(peakHeightPx: number): number {
  return Math.sqrt(2 * GRAVITY * peakHeightPx);
}

/** TAMIL_OM aura (Java Physics.TAMIL_OM_*). */
export const TAMIL_OM_AURA_RADIUS_PX = 30;
export const TAMIL_OM_AURA_DEFLECT_STRENGTH = 0.1;

/** KURIBO_SHOE stomp (Java Physics.KURIBO_STOMP_*). */
export const KURIBO_STOMP_BOUNCE_JUMP_FRAC = 1.0;
export const KURIBO_STOMP_BOUNCE_JUMP_HELD_FRAC = 1.1;
export const KURIBO_STOMP_KNOCK_ANGLE_RAD = 0.6;
export const KURIBO_STOMP_KNOCK_MAG_SCALE = 1.5;
export const KURIBO_STOMP_HITSTUN_MULT = 2.0;
export const KURIBO_STOMP_GROUND_RICOCHET_VY = -80;

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

/** Pickup angular motion (Java Physics.PICKUP_*). */
export const PICKUP_ANGULAR_DAMP_PER_SEC = 6.8;
export const PICKUP_OMEGA_MAX_RAD_PER_SEC = 14.0;
export const PICKUP_SPIN_BREAKABLE_RAD_PER_SEC = 5.0;
export const PICKUP_SPIN_ROOM_CLEAR_RAD_PER_SEC = 11.0;
export const PICKUP_COLLISION_SPIN_GATE_REF_PX_PER_SEC = 52.0;
export const PICKUP_REST_MAX_TRANSLATION_FOR_SPIN_SLEEP = 28.0;
export const PICKUP_REST_ANGULAR_SLEEP_PER_SEC = 38.0;
export const PICKUP_OMEGA_SNAP_REST_RAD_PER_SEC = 0.62;

/** Pickup spawn squash (Java Physics.PICKUP_SPAWN_*). */
export const PICKUP_SPAWN_SQUASH_DURATION_SEC = 1.45;
export const PICKUP_SPAWN_OVERSHOOT_PEAK = 0.11;
export const PICKUP_SPAWN_SQUASH_DEPTH = 0.07;

export type PickupSquishProfile = "HEART" | "KEY_OR_COIN";

export function pickupSquishAmplitude(profile: PickupSquishProfile): number {
  return profile === "HEART" ? 1.45 : 1.0;
}

/** Initial spin ±mag (Java Physics.randomPickupSpinRadPerSec). */
export function randomPickupSpinRadPerSec(
  style: "BREAKABLE" | "ROOM_CLEAR",
  rnd: () => number,
): number {
  const mag =
    style === "ROOM_CLEAR"
      ? PICKUP_SPIN_ROOM_CLEAR_RAD_PER_SEC
      : PICKUP_SPIN_BREAKABLE_RAD_PER_SEC;
  return (rnd() - 0.5) * 2 * mag;
}

/** Angular damp + clamp (Java Physics.integrateAngular). */
export function integratePickupAngular(omega: number, dt: number): number {
  const w = omega * Math.exp(-PICKUP_ANGULAR_DAMP_PER_SEC * dt);
  const lim = PICKUP_OMEGA_MAX_RAD_PER_SEC;
  if (w > lim) return lim;
  if (w < -lim) return -lim;
  return w;
}

/**
 * Spawn squash width/height multipliers around 1.0 (Java Physics.spawnSquashMul).
 * Past duration returns (1, 1).
 */
export function spawnSquashMul(
  spawnAge: number,
  profile: PickupSquishProfile,
): { w: number; h: number } {
  const dur = PICKUP_SPAWN_SQUASH_DURATION_SEC;
  if (spawnAge <= 0 || dur <= 0) return { w: 1, h: 1 };
  const t = Math.min(1, spawnAge / dur);
  const amp = pickupSquishAmplitude(profile);
  const ease = 1 - (1 - t) * (1 - t);
  const bounce = Math.sin(t * Math.PI) * (1 - t);
  const w =
    1 -
    PICKUP_SPAWN_SQUASH_DEPTH * amp * (1 - ease) +
    PICKUP_SPAWN_OVERSHOOT_PEAK * amp * bounce;
  const h =
    1 +
    PICKUP_SPAWN_SQUASH_DEPTH * 0.65 * amp * (1 - ease) -
    PICKUP_SPAWN_OVERSHOOT_PEAK * 0.45 * amp * bounce;
  return { w: Math.max(0.65, w), h: Math.max(0.65, h) };
}

/** True if standable floor under foot (Java Physics.pickupOnStandableFloor). */
export function pickupOnStandableFloor(
  map: { isStandableFloorTile(tx: number, ty: number): boolean },
  footX: number,
  footMaxWorldY: number,
  vy: number,
  tileSize: number,
): boolean {
  if (vy > 0.75) return false;
  const tyFoot = Math.floor(footMaxWorldY / tileSize);
  const txFoot = Math.floor(footX / tileSize);
  if (!map.isStandableFloorTile(txFoot, tyFoot)) return false;
  const surfaceY = tyFoot * tileSize;
  return footMaxWorldY >= surfaceY - 1e-2 && footMaxWorldY <= surfaceY + tileSize;
}

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
/** Base damage for arcing enemy bullets vs Vernan (Java Physics.ARCING_ENEMY_BULLET_PLAYER_DAMAGE). */
export const ARCING_ENEMY_BULLET_PLAYER_DAMAGE = 1.0;

/** Flint spark proc (Java Player). */
export const FLINT_SPARK_BASE_CHANCE = 0.1;
export const FLINT_SPARK_LUCK_MULT = 0.05;
