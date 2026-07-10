import { TILE_SOLID, type TileMap } from "../world/TileMap";

/**
 * Inward SOLID neighbor for secret-seam shell disguise (Java GamePanel.drawHiddenShellBreakable).
 * Ortho order W → E → N → S. Skips other hidden-shell breakables so vertical pairs don't
 * disguise as each other.
 */
export function inwardSolidSampleCell(
  map: TileMap,
  tx: number,
  ty: number,
  isHiddenShell: (x: number, y: number) => boolean,
): { tx: number; ty: number } | null {
  const w = map.getWidth();
  const h = map.getHeight();
  const dirs: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dx, dy] of dirs) {
    const ix = tx + dx;
    const iy = ty + dy;
    if (ix < 1 || ix >= w - 1 || iy < 1 || iy >= h - 1) continue;
    if (isHiddenShell(ix, iy)) continue;
    if (map.tileAt(ix, iy) === TILE_SOLID) return { tx: ix, ty: iy };
  }
  return null;
}
