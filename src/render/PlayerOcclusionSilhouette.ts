/**
 * Black Vernan silhouette where her juiced costume alpha intersects occluder alpha
 * (enemies / debris / registered OccluderLayer stamps). Canvas composites only — no CPU pixel walks.
 */

import {
  anyAabbIntersects,
  forEachOccluderLayer,
  type DeviceAabb,
} from "./OccluderLayer";

export const OCCLUSION_SILHOUETTE_FILL = "#000000";
export const OCCLUSION_SILHOUETTE_ALPHA = 0.5;
export const OCCLUSION_AABB_PAD_PX = 4;

type Surface = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let silCanvas: Surface | null = null;
let maskCanvas: Surface | null = null;
let silCtx: Ctx2D | null = null;
let maskCtx: Ctx2D | null = null;

function ensureBuffers(w: number, h: number): { sil: Ctx2D; mask: Ctx2D; sw: number; sh: number } {
  const bw = Math.max(1, w | 0);
  const bh = Math.max(1, h | 0);
  if (!silCanvas || silCanvas.width < bw || silCanvas.height < bh) {
    if (typeof OffscreenCanvas !== "undefined") {
      silCanvas = new OffscreenCanvas(bw, bh);
      maskCanvas = new OffscreenCanvas(bw, bh);
    } else {
      const s = document.createElement("canvas");
      s.width = bw;
      s.height = bh;
      silCanvas = s;
      const m = document.createElement("canvas");
      m.width = bw;
      m.height = bh;
      maskCanvas = m;
    }
    silCtx = silCanvas.getContext("2d") as Ctx2D;
    maskCtx = maskCanvas!.getContext("2d") as Ctx2D;
  } else {
    // Keep allocated size; clear only the used region below.
  }
  return { sil: silCtx!, mask: maskCtx!, sw: silCanvas!.width, sh: silCanvas!.height };
}

export type OcclusionSilhouetteDrawArgs = {
  dest: CanvasRenderingContext2D;
  /** Device-space Vernan bounds (pre-squash pad ok). */
  playerAabb: DeviceAabb;
  /** Built-in occluder AABBs (enemies, debris, bones). */
  occluderAabbs: readonly DeviceAabb[];
  /**
   * Draw juiced / costume Vernan into `g` at normal device coords (same as live draw).
   * Caller must skip when the live Vernan draw was skipped (invuln blink, grab embed, etc.).
   */
  drawPlayer: (g: CanvasRenderingContext2D) => void;
  /** Stamp built-in occluder sprite alpha into `g` at normal device coords. */
  stampOccluders: (g: CanvasRenderingContext2D) => void;
  /** Overlay opacity for the black silhouette (default 0.5). */
  alpha?: number;
  aabbPadPx?: number;
};

/**
 * If any occluder AABB overlaps Vernan, draw a black silhouette of Vernan ∩ occluders on top.
 */
export function drawPlayerOcclusionSilhouette(args: OcclusionSilhouetteDrawArgs): void {
  const pad = args.aabbPadPx ?? OCCLUSION_AABB_PAD_PX;
  const alpha = args.alpha ?? OCCLUSION_SILHOUETTE_ALPHA;

  const aabbs: DeviceAabb[] = [...args.occluderAabbs];
  forEachOccluderLayer((layer) => {
    for (const box of layer.collectAabbs()) aabbs.push(box);
  });
  if (!anyAabbIntersects(args.playerAabb, aabbs, pad)) return;

  const bx = Math.floor(args.playerAabb.x - pad);
  const by = Math.floor(args.playerAabb.y - pad);
  const bw = Math.ceil(args.playerAabb.w + pad * 2);
  const bh = Math.ceil(args.playerAabb.h + pad * 2);
  if (bw <= 0 || bh <= 0) return;

  // Expand buffer to cover nearby occluders that poke outside the player box.
  let minX = bx;
  let minY = by;
  let maxX = bx + bw;
  let maxY = by + bh;
  for (const box of aabbs) {
    if (!anyAabbIntersects(args.playerAabb, [box], pad)) continue;
    minX = Math.min(minX, Math.floor(box.x - pad));
    minY = Math.min(minY, Math.floor(box.y - pad));
    maxX = Math.max(maxX, Math.ceil(box.x + box.w + pad));
    maxY = Math.max(maxY, Math.ceil(box.y + box.h + pad));
  }
  // Clamp to a reasonable region (full internal world viewport is fine if huge).
  const regionW = Math.max(1, maxX - minX);
  const regionH = Math.max(1, maxY - minY);
  const { sil, mask, sw, sh } = ensureBuffers(regionW, regionH);

  sil.setTransform(1, 0, 0, 1, 0, 0);
  mask.setTransform(1, 0, 0, 1, 0, 0);
  sil.globalAlpha = 1;
  mask.globalAlpha = 1;
  sil.globalCompositeOperation = "source-over";
  mask.globalCompositeOperation = "source-over";
  sil.imageSmoothingEnabled = false;
  mask.imageSmoothingEnabled = false;
  sil.clearRect(0, 0, sw, sh);
  mask.clearRect(0, 0, sw, sh);

  // Draw into region-local space: translate so device (minX,minY) → (0,0).
  sil.save();
  sil.translate(-minX, -minY);
  args.drawPlayer(sil as CanvasRenderingContext2D);
  sil.restore();

  // Flatten RGB to black, keep alpha (costume + squash shape).
  sil.globalCompositeOperation = "source-in";
  sil.fillStyle = OCCLUSION_SILHOUETTE_FILL;
  sil.fillRect(0, 0, regionW, regionH);
  sil.globalCompositeOperation = "source-over";

  mask.save();
  mask.translate(-minX, -minY);
  args.stampOccluders(mask as CanvasRenderingContext2D);
  forEachOccluderLayer((layer) => layer.stamp(mask as CanvasRenderingContext2D));
  mask.restore();

  // sil ∩ mask
  sil.globalCompositeOperation = "destination-in";
  sil.drawImage(maskCanvas as CanvasImageSource, 0, 0);
  sil.globalCompositeOperation = "source-over";

  args.dest.save();
  args.dest.imageSmoothingEnabled = false;
  args.dest.globalAlpha = alpha;
  args.dest.drawImage(
    silCanvas as CanvasImageSource,
    0,
    0,
    regionW,
    regionH,
    minX,
    minY,
    regionW,
    regionH,
  );
  args.dest.restore();
}

/** Device AABB from a world-space axis-aligned box. */
export function deviceAabbFromWorld(
  camera: { worldToDeviceX(x: number): number; worldToDeviceY(y: number): number },
  x: number,
  y: number,
  w: number,
  h: number,
): DeviceAabb {
  const x0 = camera.worldToDeviceX(x);
  const y0 = camera.worldToDeviceY(y);
  const x1 = camera.worldToDeviceX(x + w);
  const y1 = camera.worldToDeviceY(y + h);
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.max(1, Math.abs(x1 - x0)),
    h: Math.max(1, Math.abs(y1 - y0)),
  };
}
