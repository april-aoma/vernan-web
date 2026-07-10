import { CAMERA_ZOOM, TILE_SIZE } from "../../specs";
import type { TileMap } from "../../world/TileMap";
import { TILE_EMPTY } from "../../world/TileMap";

export type CameraTxTy = { tx: number; ty: number };

/**
 * Occlusion mask for math backgrounds: true = skip pixel.
 * Only TILE_EMPTY cells without a foreground prop/deco tile are visible.
 * Mirrors GamePanel.fillRoomBackgroundOcclusionMask (device→world sample).
 *
 * @param foregroundPropCells optional set of packed cell keys (`tx << 32 | ty` or string `"tx,ty"`).
 *        Prefer `packDecoCellKey` / string keys via `cellKey(tx, ty)`.
 */
export function fillRoomBackgroundOcclusionMask(
  mask: boolean[],
  camera: CameraTxTy,
  map: TileMap | null,
  maskW: number,
  maskH: number,
  deviceViewW: number,
  deviceViewH: number,
  cameraZoom: number = CAMERA_ZOOM,
  foregroundPropCells: ReadonlySet<string> | null = null,
): boolean[] {
  const n = maskW * maskH;
  if (mask.length !== n) {
    throw new Error(`occlusion mask length ${mask.length} != ${n}`);
  }
  mask.fill(true);
  if (map == null) return mask;

  const scaleX = Math.max(1, (deviceViewW / maskW) | 0);
  const scaleY = Math.max(1, (deviceViewH / maskH) | 0);
  for (let my = 0; my < maskH; my++) {
    const worldY = ((my + 0.5) * scaleY - camera.ty) / cameraZoom;
    const ty = Math.floor(worldY / TILE_SIZE);
    const row = my * maskW;
    for (let mx = 0; mx < maskW; mx++) {
      const worldX = ((mx + 0.5) * scaleX - camera.tx) / cameraZoom;
      const tx = Math.floor(worldX / TILE_SIZE);
      if (map.tileAt(tx, ty) !== TILE_EMPTY) continue;
      if (foregroundPropCells != null && foregroundPropCells.has(cellKey(tx, ty))) continue;
      mask[row + mx] = false;
    }
  }
  return mask;
}

/** String cell key for foreground prop occlusion sets. */
export function cellKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

/** Allocate or reuse a boolean occlusion mask of size maskW×maskH. */
export function ensureOcclusionMask(
  reuse: boolean[] | null | undefined,
  maskW: number,
  maskH: number,
): boolean[] {
  const n = maskW * maskH;
  if (reuse && reuse.length === n) return reuse;
  return new Array<boolean>(n);
}
