import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";
import {
  PEDESTAL_BOB_AMP,
  PEDESTAL_DRAW_H,
  PEDESTAL_ITEM_OUTLINE_ALPHA,
  PEDESTAL_ITEM_OUTLINE_ALPHA_THRESHOLD,
  PEDESTAL_SQUASH_Y,
  PEDESTAL_STRETCH_X,
  type ItemPedestal,
} from "./pedestal";

let outlineScratch: OffscreenCanvas | HTMLCanvasElement | null = null;
let outlineCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
let outlineCapW = 0;
let outlineCapH = 0;

function ensureOutlineScratch(w: number, h: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (!outlineScratch || outlineCapW < w || outlineCapH < h) {
    outlineCapW = Math.max(outlineCapW, w);
    outlineCapH = Math.max(outlineCapH, h);
    if (typeof OffscreenCanvas !== "undefined") {
      outlineScratch = new OffscreenCanvas(outlineCapW, outlineCapH);
    } else {
      const c = document.createElement("canvas");
      c.width = outlineCapW;
      c.height = outlineCapH;
      outlineScratch = c;
    }
    outlineCtx = outlineScratch.getContext("2d", { willReadFrequently: true }) as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
  }
  return outlineCtx;
}

/**
 * 1px exterior ring on transparent pixels adjacent to opaque pickup art (cardinal neighbors).
 * Java GamePanel.pedestalItemOutlineScratchForDraw.
 */
export function pedestalItemOutlineForDraw(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): CanvasImageSource | null {
  if (sw <= 0 || sh <= 0) return null;
  try {
    const ctx = ensureOutlineScratch(sw, sh);
    if (!ctx) return null;
    ctx.clearRect(0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    const img = ctx.getImageData(0, 0, sw, sh);
    const srcPx = img.data;
    const out = ctx.createImageData(sw, sh);
    const outPx = out.data;
    const threshold = PEDESTAL_ITEM_OUTLINE_ALPHA_THRESHOLD;
    const outlineA = PEDESTAL_ITEM_OUTLINE_ALPHA;
    for (let py = 0; py < sh; py++) {
      for (let px = 0; px < sw; px++) {
        const idx = (py * sw + px) * 4;
        if (srcPx[idx + 3]! >= threshold) continue;
        let border = false;
        if (px > 0 && srcPx[idx - 4 + 3]! >= threshold) border = true;
        else if (px + 1 < sw && srcPx[idx + 4 + 3]! >= threshold) border = true;
        else if (py > 0 && srcPx[idx - sw * 4 + 3]! >= threshold) border = true;
        else if (py + 1 < sh && srcPx[idx + sw * 4 + 3]! >= threshold) border = true;
        if (border) {
          outPx[idx] = 255;
          outPx[idx + 1] = 255;
          outPx[idx + 2] = 255;
          outPx[idx + 3] = outlineA;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
    return outlineScratch;
  } catch {
    // getImageData can fail on tainted / unreadable sources — skip outline, keep sprite.
    return null;
  }
}

export function pedestalItemBobOffset(bobPhase: number): number {
  return Math.sin(bobPhase) * PEDESTAL_BOB_AMP;
}

export function pedestalItemSquashScales(bobPhase: number): { scaleX: number; scaleY: number } {
  const sinSq = Math.sin(bobPhase) ** 2;
  return {
    scaleX: 1 + PEDESTAL_STRETCH_X * sinSq,
    scaleY: 1 - PEDESTAL_SQUASH_Y * sinSq,
  };
}

function pedestalItemWorldRect(
  p: ItemPedestal,
  bobPhase: number,
  sw: number,
  sh: number,
): { cx: number; cy: number; ix: number; iy: number } {
  const pedestalTop = p.groundTop - PEDESTAL_DRAW_H;
  const bob = pedestalItemBobOffset(bobPhase);
  const iy = pedestalTop - sh + 4.0 + bob;
  const ix = p.anchorX - sw * 0.5;
  return { cx: p.anchorX, cy: iy + sh * 0.5, ix, iy };
}

/**
 * Bobbing item sprite with squash/stretch + white outline (Java drawSinglePedestal item branch).
 * Matches Java AffineTransform: translate to item center, scale squash, draw outline then sprite.
 */
export function drawPedestalFloatingItem(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  p: ItemPedestal,
  bobPhase: number,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): void {
  const { cx, cy } = pedestalItemWorldRect(p, bobPhase, sw, sh);
  const { scaleX, scaleY } = pedestalItemSquashScales(bobPhase);
  const dcx = camera.worldToDeviceX(cx);
  const dcy = camera.worldToDeviceY(cy);
  // Java: camera already has CAMERA_ZOOM, then scale(sx, sy) in world space.
  // Device path: bake zoom into the local scale around the item center.
  const itemDrawX = Math.floor(-sw * 0.5);
  const itemDrawY = Math.floor(-sh * 0.5);

  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(dcx, dcy);
  g.scale(CAMERA_ZOOM * scaleX, CAMERA_ZOOM * scaleY);

  const outline = pedestalItemOutlineForDraw(source, sx, sy, sw, sh);
  if (outline) {
    g.drawImage(outline, 0, 0, sw, sh, itemDrawX, itemDrawY, sw, sh);
  }
  g.drawImage(source, sx, sy, sw, sh, itemDrawX, itemDrawY, sw, sh);
  g.restore();
}
