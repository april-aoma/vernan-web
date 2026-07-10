import type { Aabb } from "./CombatMath";

/** Visible world AABB (camera viewport). */
export type WorldRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function rectLeft(r: WorldRect): number {
  return r.x;
}
export function rectTop(r: WorldRect): number {
  return r.y;
}
export function rectRight(r: WorldRect): number {
  return r.x + r.w;
}
export function rectBottom(r: WorldRect): number {
  return r.y + r.h;
}

/** Hoodie shrinks see radius; otherwise min(viewW, viewH). */
export const HOODIE_SEE_RADIUS_PX = 32;

export function seeRadiusForRun(hoodieEquipped: boolean, cameraView: WorldRect): number {
  if (hoodieEquipped) return HOODIE_SEE_RADIUS_PX;
  return Math.min(cameraView.w, cameraView.h);
}

export function seesPlayerAt(
  enemyCx: number,
  enemyCy: number,
  playerCx: number,
  playerCy: number,
  seeRadius: number,
): boolean {
  return Math.hypot(playerCx - enemyCx, playerCy - enemyCy) <= seeRadius;
}

export type PlayerCombatSnapshot = {
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  hurtbox: Aabb;
};
