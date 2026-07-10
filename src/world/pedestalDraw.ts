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

function ensureOutlineScratch(w: number, h: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
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
    outlineCtx = outlineScratch.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D;
  }
  return outlineCtx!;
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
  const ctx = ensureOutlineScratch(sw, sh);
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

/** Bobbing item sprite with squash/stretch + white outline (Java drawSinglePedestal item branch). */
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
  const pedestalTop = p.groundTop - PEDESTAL_DRAW_H;
  const bob = pedestalItemBobOffset(bobPhase);
  const { scaleX, scaleY } = pedestalItemSquashScales(bobPhase);
  const iy = pedestalTop - sh + 4.0 + bob;
  const cx = p.anchorX;
  const cy = iy + sh * 0.5;
  const dcx = camera.worldToDeviceX(cx);
  const dcy = camera.worldToDeviceY(cy);
  const baseDw = CAMERA_ZOOM * sw;
  const baseDh = CAMERA_ZOOM * sh;
  const dw = Math.max(1, Math.round(baseDw * scaleX));
  const dh = Math.max(1, Math.round(baseDh * scaleY));
  const dx = Math.floor(dcx - dw * 0.5);
  const dy = Math.floor(dcy - dh * 0.5);

  g.imageSmoothingEnabled = false;
  const outline = pedestalItemOutlineForDraw(source, sx, sy, sw, sh);
  if (outline) {
    g.drawImage(outline, 0, 0, sw, sh, dx, dy, dw, dh);
  }
  g.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
}
