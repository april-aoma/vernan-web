import {
  ARCING_ENEMY_BULLET_PLAYER_DAMAGE,
  STICK_REFLECT_DAMAGE_MULT,
  STICK_REFLECT_SPEED_MULT,
} from "../config/Physics";

/** Reflected arcing bullet damage vs enemies (Java Bullet.stickReflectEnemyDamage). */
export function stickReflectEnemyDamage(
  baseDamage = ARCING_ENEMY_BULLET_PLAYER_DAMAGE,
): number {
  return baseDamage * STICK_REFLECT_DAMAGE_MULT;
}

/**
 * Stick active swing reflects arcing bullet velocity (Java GamePanel.stickReflectedVelocity).
 */
export function stickReflectedVelocity(
  bulletCx: number,
  bulletCy: number,
  vx: number,
  vy: number,
  playerCx: number,
  playerCy: number,
  playerFacing: number,
): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  if (speed < 1e-6) {
    const fs = playerFacing >= 0 ? 1 : -1;
    return { vx: fs * 160, vy: -120 };
  }
  const mult = Math.max(0, STICK_REFLECT_SPEED_MULT);
  let rvx = -vx * mult;
  let rvy = -vy * mult;
  const dx = bulletCx - playerCx;
  const dy = bulletCy - playerCy;
  const dot = rvx * dx + rvy * dy;
  if (dot < 0 && dx * dx + dy * dy > 1e-8) {
    const dist = Math.hypot(dx, dy);
    const ox = dx / dist;
    const oy = dy / dist;
    rvx = ox * speed * mult;
    rvy = oy * speed * mult;
  }
  return { vx: rvx, vy: rvy };
}
