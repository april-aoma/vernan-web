import { TILE_SIZE } from "../specs";
import { blendRgb } from "../tileset/background/BackgroundLayerBlend";
import type { LiveReflectionStyle } from "./LiveReflectionStyle";

/** Snapshot of the internal framebuffer for per-pixel environment sampling. */
export type BackbufferSample = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export function captureBackbuffer(canvas: HTMLCanvasElement): BackbufferSample | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { width, height } = canvas;
  if (width <= 0 || height <= 0) return null;
  const imageData = ctx.getImageData(0, 0, width, height);
  return { data: imageData.data, width, height };
}

function readArgb(sample: BackbufferSample, x: number, y: number): number {
  const { data, width, height } = sample;
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  const i = (cy * width + cx) * 4;
  const r = data[i]!;
  const g = data[i + 1]!;
  const b = data[i + 2]!;
  const a = data[i + 3]!;
  return (a << 24) | (r << 16) | (g << 8) | b;
}

export function reflectionPadDevicePx(
  cameraZoom: number,
  dw: number,
  dh: number,
  style: LiveReflectionStyle,
): number {
  const halfCell = Math.round(cameraZoom * TILE_SIZE * style.poolHalfCellTiles);
  const spritePad = Math.round(Math.max(dw, dh) * style.poolSpriteFrac);
  return Math.max(halfCell, spritePad);
}

/** Live per-frame environment reflection composited over a sprite mask (Java LiveReflectionEffect). */
export function drawSpriteWithLiveReflection(
  g: CanvasRenderingContext2D,
  backbuffer: BackbufferSample | null,
  sprite: CanvasImageSource,
  sw: number,
  sh: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
  cameraZoom: number,
  mirrorSourceX: boolean,
  style: LiveReflectionStyle,
): void {
  if (!sprite || sw <= 0 || sh <= 0) return;
  const dw = dx2 - dx1;
  const dh = dy2 - dy1;
  if (dw <= 0 || dh <= 0) return;

  const pad = reflectionPadDevicePx(cameraZoom, dw, dh, style);
  const reflection =
    backbuffer != null
      ? buildOverlayFromBackbuffer(
          backbuffer,
          sprite,
          sw,
          sh,
          dx1,
          dy1,
          dx2,
          dy2,
          pad,
          mirrorSourceX,
          style,
        )
      : null;

  g.imageSmoothingEnabled = false;
  if (mirrorSourceX) {
    g.drawImage(sprite, dx1, dy1, dx2, dy2, sw, 0, 0, sh);
  } else {
    g.drawImage(sprite, dx1, dy1, dx2, dy2, 0, 0, sw, sh);
  }
  if (reflection) {
    drawOverlay(g, reflection, dx1, dy1, dx2, dy2, sw, sh, mirrorSourceX);
  }
}

export function buildOverlayFromBackbuffer(
  backbuffer: BackbufferSample,
  maskSprite: CanvasImageSource,
  sw: number,
  sh: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
  padDevicePx: number,
  mirrorSourceX: boolean,
  style: LiveReflectionStyle,
): HTMLCanvasElement | null {
  if (sw <= 0 || sh <= 0) return null;
  const dw = dx2 - dx1;
  const dh = dy2 - dy1;
  if (dw <= 0 || dh <= 0) return null;

  const bufW = backbuffer.width;
  const bufH = backbuffer.height;
  if (bufW <= 0 || bufH <= 0) return null;

  const pad = Math.max(0, padDevicePx);
  const sampleLeft = dx1 - pad;
  const sampleTop = dy1 - pad;
  const sampleRight = dx2 + pad;
  const sampleBottom = dy2 + pad;

  const cx = (dx1 + dx2) * 0.5;
  const cy = (dy1 + dy2) * 0.5;
  const lensRadius = Math.max(4, Math.min(dw, dh) * 0.5);
  const peakZoom = style.fisheyePeak;
  const strength = style.fisheyeStrength;
  const annulusStrength = style.annulusStrength;

  const scratch = document.createElement("canvas");
  scratch.width = sw;
  scratch.height = sh;
  const sctx = scratch.getContext("2d")!;
  sctx.imageSmoothingEnabled = false;
  if (mirrorSourceX) {
    sctx.drawImage(maskSprite, 0, 0, sw, sh);
  } else {
    sctx.drawImage(maskSprite, 0, 0, sw, sh);
  }
  const maskPx = sctx.getImageData(0, 0, sw, sh).data;
  const outPx = new Uint8ClampedArray(sw * sh * 4);
  const opacity = style.opacity;
  let any = false;

  for (let sy = 0; sy < sh; sy++) {
    const py = dy1 + (sy + 0.5) * (dh / sh);
    const outRow = sy * sw;
    for (let sc = 0; sc < sw; sc++) {
      const bufCol = mirrorSourceX ? sw - 1 - sc : sc;
      const maskI = (outRow + bufCol) * 4;
      const maskA = maskPx[maskI + 3]!;
      if (maskA <= 0) continue;

      const px = dx1 + (sc + 0.5) * (dw / sw);
      const relX = px - cx;
      const relY = py - cy;
      const distSq = relX * relX + relY * relY;
      let readX: number;
      let readY: number;
      if (distSq < 0.25) {
        readX = Math.round(cx);
        readY = Math.round(cy);
      } else {
        const dist = Math.sqrt(distSq);
        const angle = Math.atan2(relY, relX);
        const ringU = Math.min(1, dist / lensRadius);
        const annulusStretch = 1 + annulusStrength * ringU;
        let sampleDist = dist * annulusStretch;
        let centerWeight = 1 - ringU;
        centerWeight = centerWeight * centerWeight * (3 - 2 * centerWeight);
        const zoomSpan = (peakZoom - 1) * centerWeight * strength;
        const effScale = 1 + zoomSpan;
        sampleDist /= effScale;
        readX = Math.round(cx + Math.cos(angle) * sampleDist);
        readY = Math.round(cy + Math.sin(angle) * sampleDist);
      }
      readX = Math.max(sampleLeft, Math.min(sampleRight - 1, readX));
      readY = Math.max(sampleTop, Math.min(sampleBottom - 1, readY));

      const sampleArgb = readArgb(backbuffer, readX, readY);
      const maskArgb =
        (maskA << 24) |
        (maskPx[maskI]! << 16) |
        (maskPx[maskI + 1]! << 8) |
        maskPx[maskI + 2]!;
      const blended = blendRgb(maskArgb, sampleArgb, opacity, style.blendMode);
      const outA = Math.max(0, Math.min(255, Math.round(maskA * opacity)));
      if (outA <= 0) continue;

      const outI = (outRow + bufCol) * 4;
      outPx[outI] = (blended >> 16) & 0xff;
      outPx[outI + 1] = (blended >> 8) & 0xff;
      outPx[outI + 2] = blended & 0xff;
      outPx[outI + 3] = outA;
      any = true;
    }
  }
  if (!any) return null;

  const overlay = document.createElement("canvas");
  overlay.width = sw;
  overlay.height = sh;
  const octx = overlay.getContext("2d")!;
  octx.putImageData(new ImageData(outPx, sw, sh), 0, 0);
  return overlay;
}

export function drawOverlay(
  g: CanvasRenderingContext2D,
  overlay: HTMLCanvasElement,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
  sw: number,
  sh: number,
  mirrorSourceX: boolean,
): void {
  g.save();
  g.globalCompositeOperation = "source-over";
  g.imageSmoothingEnabled = false;
  if (mirrorSourceX) {
    g.drawImage(overlay, dx1, dy1, dx2, dy2, sw, 0, 0, sh);
  } else {
    g.drawImage(overlay, dx1, dy1, dx2, dy2, 0, 0, sw, sh);
  }
  g.restore();
}
