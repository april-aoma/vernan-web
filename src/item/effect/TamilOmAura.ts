import {
  TAMIL_OM_AURA_DEFLECT_STRENGTH,
  TAMIL_OM_AURA_RADIUS_PX,
} from "../../config/Physics";

/**
 * Nudge bullet velocity outward from Vernan within Tamil Om aura
 * (Java GamePanel.tryDeflect*TamilOmAura — preserves speed).
 */
export function applyTamilOmAuraToBullet(
  stacks: number,
  playerCx: number,
  playerCy: number,
  bulletCx: number,
  bulletCy: number,
  vx: number,
  vy: number,
): { vx: number; vy: number } {
  if (stacks <= 0) return { vx, vy };
  const dx = bulletCx - playerCx;
  const dy = bulletCy - playerCy;
  const distSq = dx * dx + dy * dy;
  const r = TAMIL_OM_AURA_RADIUS_PX;
  if (distSq > r * r || distSq < 1e-8) return { vx, vy };
  const speed = Math.hypot(vx, vy);
  if (speed < 1e-6) return { vx, vy };
  const dist = Math.sqrt(distSq);
  const ox = dx / dist;
  const oy = dy / dist;
  const blend = Math.max(0, Math.min(1, TAMIL_OM_AURA_DEFLECT_STRENGTH));
  let tx = (vx / speed) * (1 - blend) + ox * blend;
  let ty = (vy / speed) * (1 - blend) + oy * blend;
  let tlen = Math.hypot(tx, ty);
  if (tlen < 1e-6) {
    tx = ox;
    ty = oy;
    tlen = 1;
  }
  return { vx: (speed * tx) / tlen, vy: (speed * ty) / tlen };
}
