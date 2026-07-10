import { CAMERA_ZOOM } from "../specs";
import { adjustDeviceRectFeetAnchored } from "./SquashStretch";

/**
 * Draw helpers for combat juice: solid red / fade tint via SrcAtop on an offscreen canvas.
 */

let tintCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let tintCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

function ensureTintSurface(w: number, h: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!tintCanvas || tintCanvas.width < w || tintCanvas.height < h) {
    if (typeof OffscreenCanvas !== "undefined") {
      tintCanvas = new OffscreenCanvas(w, h);
    } else {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      tintCanvas = c;
    }
    tintCtx = tintCanvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D;
  }
  return tintCtx!;
}

export type JuiceDrawOpts = {
  /** World-px shake offset (applied in device space × CAMERA_ZOOM). */
  shakeX?: number;
  shakeY?: number;
  scaleX?: number;
  scaleY?: number;
  /** Solid red SrcAtop (defensive hitstun). */
  solidRed?: boolean;
  /** Fade hurt tint alpha 0–255 (red unless tintRgb set). */
  hurtTintAlpha?: number;
  /** Optional 0xRRGGBB for colored SrcAtop (nova absorb flash). */
  tintRgb?: number;
};

export type TintBlitOpts = Pick<JuiceDrawOpts, "solidRed" | "hurtTintAlpha" | "tintRgb">;

/** Blit one source cell with optional SrcAtop tint (caller owns transform). */
export function blitTintedSpriteCell(
  g: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  tint: TintBlitOpts = {},
): void {
  const solidRed = tint.solidRed === true;
  const tintA = tint.hurtTintAlpha ?? 0;
  const needsTint = solidRed || tintA > 0;
  g.imageSmoothingEnabled = false;
  if (!needsTint) {
    g.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
  const tc = ensureTintSurface(sw, sh);
  tc.clearRect(0, 0, sw, sh);
  tc.imageSmoothingEnabled = false;
  tc.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  tc.globalCompositeOperation = "source-atop";
  if (solidRed) {
    tc.fillStyle = "#ff0000";
    tc.globalAlpha = 1;
    tc.fillRect(0, 0, sw, sh);
  } else {
    const rgb = tint.tintRgb;
    if (rgb != null) {
      const r = (rgb >> 16) & 0xff;
      const gch = (rgb >> 8) & 0xff;
      const b = rgb & 0xff;
      tc.fillStyle = `rgb(${r},${gch},${b})`;
    } else {
      tc.fillStyle = "#ff0000";
    }
    tc.globalAlpha = Math.min(1, tintA / 255);
    tc.fillRect(0, 0, sw, sh);
  }
  tc.globalAlpha = 1;
  tc.globalCompositeOperation = "source-over";
  g.drawImage(tintCanvas as CanvasImageSource, 0, 0, sw, sh, dx, dy, dw, dh);
}

/**
 * Draw an image (or strip cell) feet-pinned with optional shake, squash, and red tint.
 */
export function drawJuicedImage(
  g: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dest: { x1: number; y1: number; x2: number; y2: number },
  facing: number,
  juice: JuiceDrawOpts = {},
): void {
  let x1 = dest.x1;
  let y1 = dest.y1;
  let x2 = dest.x2;
  let y2 = dest.y2;

  const sxScale = juice.scaleX ?? 1;
  const syScale = juice.scaleY ?? 1;
  if (sxScale !== 1 || syScale !== 1) {
    const rect: [number, number, number, number] = [x1, y1, x2, y2];
    adjustDeviceRectFeetAnchored(rect, sxScale, syScale);
    [x1, y1, x2, y2] = rect;
  }

  const shakeDevX = Math.round((juice.shakeX ?? 0) * CAMERA_ZOOM);
  const shakeDevY = Math.round((juice.shakeY ?? 0) * CAMERA_ZOOM);
  x1 += shakeDevX;
  x2 += shakeDevX;
  y1 += shakeDevY;
  y2 += shakeDevY;

  const dw = Math.max(1, x2 - x1);
  const dh = Math.max(1, y2 - y1);

  const solidRed = juice.solidRed === true;
  const tintA = juice.hurtTintAlpha ?? 0;
  const needsTint = solidRed || tintA > 0;

  g.imageSmoothingEnabled = false;

  if (!needsTint) {
    blitFacing(g, source, sx, sy, sw, sh, x1, y1, dw, dh, facing);
    return;
  }

  const tc = ensureTintSurface(sw, sh);
  tc.clearRect(0, 0, sw, sh);
  tc.imageSmoothingEnabled = false;
  tc.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  tc.globalCompositeOperation = "source-atop";
  if (solidRed) {
    tc.fillStyle = "#ff0000";
    tc.globalAlpha = 1;
    tc.fillRect(0, 0, sw, sh);
  } else {
    const rgb = juice.tintRgb;
    if (rgb != null) {
      const r = (rgb >> 16) & 0xff;
      const gch = (rgb >> 8) & 0xff;
      const b = rgb & 0xff;
      tc.fillStyle = `rgb(${r},${gch},${b})`;
    } else {
      tc.fillStyle = "#ff0000";
    }
    tc.globalAlpha = Math.min(1, tintA / 255);
    tc.fillRect(0, 0, sw, sh);
  }
  tc.globalAlpha = 1;
  tc.globalCompositeOperation = "source-over";

  blitFacing(g, tintCanvas as CanvasImageSource, 0, 0, sw, sh, x1, y1, dw, dh, facing);
}

function blitFacing(
  g: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  facing: number,
): void {
  if (facing >= 0) {
    g.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
  } else {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
    g.restore();
  }
}
