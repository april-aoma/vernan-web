import { CAMERA_ZOOM } from "../specs";
import type { WorldCamera } from "../camera/WorldCamera";

const FRAME_SEC = 0.05;
const FRAMES = 8;
const CELL = 16;

/**
 * Kill explosion strip (sprites/kill explosion.png) — 8 frames × 0.05s.
 * World (x,y) is FEET center (Java): draw top-left = (feetX - dw/2, feetY - dh).
 */
export class KillExplosion {
  /** Feet center world X. */
  x: number;
  /** Feet world Y. */
  y: number;
  age = 0;
  done = false;

  constructor(feetCenterX: number, feetWorldY: number) {
    this.x = feetCenterX;
    this.y = feetWorldY;
  }

  update(dt: number): void {
    this.age += dt;
    if (this.age >= FRAMES * FRAME_SEC) this.done = true;
  }

  frameIndex(): number {
    return Math.min(FRAMES - 1, Math.floor(this.age / FRAME_SEC));
  }
}

export function drawKillExplosion(
  g: CanvasRenderingContext2D,
  fx: KillExplosion,
  camera: WorldCamera,
  sheet: ImageBitmap | null,
): void {
  const fi = fx.frameIndex();
  const feetX = camera.worldToDeviceX(fx.x);
  const feetY = camera.worldToDeviceY(fx.y);
  const dw = Math.floor(CAMERA_ZOOM * CELL);
  const dh = Math.floor(CAMERA_ZOOM * CELL);
  const dx = Math.round(feetX - dw * 0.5);
  const dy = Math.round(feetY - dh);
  if (sheet && sheet.width >= CELL * FRAMES) {
    g.imageSmoothingEnabled = false;
    g.drawImage(sheet, fi * CELL, 0, CELL, CELL, dx, dy, dw, dh);
  } else {
    g.fillStyle = `rgba(255,${200 - fi * 20},80,${1 - fi / FRAMES})`;
    g.beginPath();
    g.arc(dx + dw * 0.5, dy + dh * 0.5, dw * (0.3 + fi * 0.08), 0, Math.PI * 2);
    g.fill();
  }
}
