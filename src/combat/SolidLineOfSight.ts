import { seesPlayerAt } from "./EnemyVision";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";

const SAMPLE_STEP_PX = 4;

/** Circular vision plus solid-tile occlusion (Java SolidLineOfSight). */
export function seesPlayerWithSolidLos(
  map: TileMap,
  enemyCx: number,
  enemyCy: number,
  playerCx: number,
  playerCy: number,
  seeRadiusPx: number,
): boolean {
  if (!seesPlayerAt(enemyCx, enemyCy, playerCx, playerCy, seeRadiusPx)) return false;
  return solidLineClear(map, enemyCx, enemyCy, playerCx, playerCy);
}

export function solidLineClear(map: TileMap, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  const steps = Math.max(1, Math.ceil(len / SAMPLE_STEP_PX));
  const ux = dx / len;
  const uy = dy / len;
  for (let i = 1; i < steps; i++) {
    const t = i * SAMPLE_STEP_PX;
    if (t >= len - SAMPLE_STEP_PX * 0.5) break;
    const px = ax + ux * t;
    const py = ay + uy * t;
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(py / TILE_SIZE);
    if (map.isSolidTile(tx, ty)) return false;
  }
  return true;
}
