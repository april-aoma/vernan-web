import { CAMERA_ZOOM } from "../specs";
import type { WorldCamera } from "../camera/WorldCamera";

/** SMW-style rising dust puffs (`sprites/dust.png`, 3-frame horizontal strip). */
export const RISING_DUST_DEFAULT_DURATION_SEC = 0.62;
export const RISING_DUST_DEFAULT_RISE_WORLD_PX = 28;
export const RISING_DUST_DEFAULT_STAGGER_SEC = 0.028;
export const RISING_DUST_DEFAULT_SPREAD_RADIUS_PX = 14;
export const RISING_DUST_STRIP_PUFF_FRAMES = 3;
export const RISING_DUST_STRIP_PUFF_DURATION_SEC = 0.18;
export const RISING_DUST_STRIP_PUFF_RISE_WORLD_PX = 10;

export class RisingDustFx {
  private ageSec = 0;

  private constructor(
    private readonly delaySec: number,
    private readonly startX: number,
    private readonly startY: number,
    private readonly driftX: number,
    private readonly riseHeight: number,
    private readonly durationSec: number,
  ) {}

  static spawnBurst(
    out: RisingDustFx[],
    centerX: number,
    centerY: number,
    count: number,
    spreadRadiusPx = RISING_DUST_DEFAULT_SPREAD_RADIUS_PX,
    staggerSec = RISING_DUST_DEFAULT_STAGGER_SEC,
    riseHeightPx = RISING_DUST_DEFAULT_RISE_WORLD_PX,
    durationSec = RISING_DUST_DEFAULT_DURATION_SEC,
  ): void {
    if (count <= 0) return;
    for (let i = 0; i < count; i++) {
      const ang = ((Math.PI * 2 * i) / count) + 0.17 * i;
      const rad = spreadRadiusPx * (0.55 + (0.45 * ((i * 3) % 5)) / 4);
      const px = centerX + Math.cos(ang) * rad;
      const py = centerY + Math.sin(ang) * rad * 0.72;
      const drift = Math.cos(ang + 0.4) * 6;
      out.push(
        new RisingDustFx(i * staggerSec, px, py, drift, riseHeightPx, durationSec),
      );
    }
  }

  static spawnStripPuff(out: RisingDustFx[], centerX: number, centerY: number): void {
    RisingDustFx.spawnBurst(
      out,
      centerX,
      centerY,
      1,
      0,
      0,
      RISING_DUST_STRIP_PUFF_RISE_WORLD_PX,
      RISING_DUST_STRIP_PUFF_DURATION_SEC,
    );
  }

  static tickAll(fx: RisingDustFx[], dtSec: number): void {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i]!;
      p.ageSec += dtSec;
      if (p.ageSec >= p.delaySec + p.durationSec) fx.splice(i, 1);
    }
  }

  draw(g: CanvasRenderingContext2D, camera: WorldCamera, sprite: ImageBitmap): void {
    const localAge = this.ageSec - this.delaySec;
    if (localAge < 0) return;
    const u = localAge / this.durationSec;
    if (u >= 1) return;

    const sw = sprite.width;
    const sh = sprite.height;
    if (sw <= 0 || sh <= 0) return;

    const stripFrames = RISING_DUST_STRIP_PUFF_FRAMES;
    const frameW = Math.max(1, Math.floor(sw / stripFrames));
    const frameIndex = Math.min(stripFrames - 1, Math.floor(u * stripFrames));
    const sx0 = frameIndex * frameW;
    const ease = 1 - (1 - u) * (1 - u);
    const rise = ease * this.riseHeight;
    const drift = this.driftX * u;
    const cx = this.startX + drift;
    const cy = this.startY - rise;
    let alpha = u < 0.12 ? u / 0.12 : u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1;
    alpha = Math.max(0, Math.min(1, alpha));
    if (alpha < 1e-3) return;

    const dw = Math.floor(CAMERA_ZOOM * frameW);
    const dh = Math.floor(CAMERA_ZOOM * sh);
    const dx1 = Math.floor(CAMERA_ZOOM * (cx - frameW * 0.5) + camera.tx);
    const dy1 = Math.floor(CAMERA_ZOOM * (cy - sh * 0.5) + camera.ty);

    g.save();
    g.globalAlpha = alpha;
    g.drawImage(sprite, sx0, 0, frameW, sh, dx1, dy1, dw, dh);
    g.restore();
  }
}

export function drawRisingDustFx(
  g: CanvasRenderingContext2D,
  fxList: RisingDustFx[],
  camera: WorldCamera,
  sprite: ImageBitmap | null,
): void {
  if (!sprite || fxList.length === 0) return;
  for (const puff of fxList) puff.draw(g, camera, sprite);
}
