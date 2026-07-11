import { CAMERA_ZOOM } from "../specs";
import type { SpriteStrip } from "../render/SpriteDraw";

/** Java GamePanel.ELECTRIC_SHOCK_SHEET_FRAMES / ELECTRIC_SHOCK_FRAME_DURATION_SEC. */
export const ELECTRIC_SHOCK_SHEET_FRAMES = 6;
export const ELECTRIC_SHOCK_FRAME_DURATION_SEC = 0.07;

export function electricShockFrameIndex(simTicks: number): number {
  const ticksPerFrame = Math.max(1, Math.round(ELECTRIC_SHOCK_FRAME_DURATION_SEC * 60));
  return Math.abs(Math.floor(simTicks / ticksPerFrame)) % ELECTRIC_SHOCK_SHEET_FRAMES;
}

/** Six-frame {@code electric shock.png} centered on device px (Java drawElectricShockOverlayAtDeviceCenter). */
export function drawElectricShockOverlayAtDeviceCenter(
  g: CanvasRenderingContext2D,
  dcx: number,
  dcy: number,
  strip: SpriteStrip,
  simTicks: number,
): void {
  const fi = electricShockFrameIndex(simTicks);
  const fw = strip.frameW;
  const fh = strip.frameH;
  if (fw <= 0 || fh <= 0) return;
  const dw = Math.max(1, Math.round(CAMERA_ZOOM * fw));
  const dh = Math.max(1, Math.round(CAMERA_ZOOM * fh));
  const dx1 = dcx - Math.floor(dw / 2);
  const dy1 = dcy - Math.floor(dh / 2);
  g.imageSmoothingEnabled = false;
  g.drawImage(strip.image, fi * fw, 0, fw, fh, dx1, dy1, dw, dh);
}

export function drawElectricShockOverlayWorldRect(
  g: CanvasRenderingContext2D,
  worldToDeviceX: (wx: number) => number,
  worldToDeviceY: (wy: number) => number,
  rect: { x: number; y: number; w: number; h: number },
  shakeDx: number,
  shakeDy: number,
  strip: SpriteStrip,
  simTicks: number,
): void {
  const ex = worldToDeviceX(rect.x);
  const ey = worldToDeviceY(rect.y);
  const ex2 = worldToDeviceX(rect.x + rect.w);
  const ey2 = worldToDeviceY(rect.y + rect.h);
  drawElectricShockOverlayAtDeviceCenter(
    g,
    Math.round((ex + ex2) / 2) + shakeDx,
    Math.round((ey + ey2) / 2) + shakeDy,
    strip,
    simTicks,
  );
}
