/**
 * Occluder layers for Vernan readability silhouette (enemies, debris, future fake walls).
 * Built-in stamps are wired from mount; register extra layers for authored foreground occluders.
 */

export type DeviceAabb = { x: number; y: number; w: number; h: number };

export type OccluderLayer = {
  id: string;
  /** Device-space AABBs used for the cheap overlap gate. */
  collectAabbs: () => readonly DeviceAabb[];
  /** Stamp sprite alpha into the occlusion mask (same art as the main draw). */
  stamp: (g: CanvasRenderingContext2D) => void;
};

const layers = new Map<string, OccluderLayer>();

export function registerOccluderLayer(layer: OccluderLayer): void {
  layers.set(layer.id, layer);
}

export function unregisterOccluderLayer(id: string): void {
  layers.delete(id);
}

export function clearOccluderLayers(): void {
  layers.clear();
}

export function forEachOccluderLayer(fn: (layer: OccluderLayer) => void): void {
  for (const layer of layers.values()) fn(layer);
}

export function aabbIntersects(a: DeviceAabb, b: DeviceAabb, pad = 0): boolean {
  return !(
    a.x + a.w + pad <= b.x - pad ||
    b.x + b.w + pad <= a.x - pad ||
    a.y + a.h + pad <= b.y - pad ||
    b.y + b.h + pad <= a.y - pad
  );
}

export function anyAabbIntersects(
  player: DeviceAabb,
  candidates: readonly DeviceAabb[],
  pad = 0,
): boolean {
  for (const c of candidates) {
    if (aabbIntersects(player, c, pad)) return true;
  }
  return false;
}
