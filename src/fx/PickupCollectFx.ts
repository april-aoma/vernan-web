import { PickupKind } from "../world/BreakableLootRoll";
import { CAMERA_ZOOM } from "../specs";
import type { WorldCamera } from "../camera/WorldCamera";

/** Java GamePanel.PICKUP_COLLECT_* */
export const PICKUP_COLLECT_DURATION_SEC = 0.68;
export const PICKUP_COLLECT_RISE_WORLD_PX = 16;
export const PICKUP_COLLECT_SIN_FREQ_RAD_PER_SEC = 4;
export const PICKUP_COLLECT_SIN_AMPLITUDE_WORLD_PX = 12;
export const PICKUP_COLLECT_FADE_START_U = 0.58;

/** Touch-collect VFX: strip rises + sine wobble from pickup anchor (Java PickupCollectFx). */
export class PickupCollectFx {
  readonly kind: PickupKind;
  ageSec = 0;
  readonly sinPhase: number;
  readonly anchorWorldX: number;
  readonly anchorWorldY: number;

  constructor(
    kind: PickupKind,
    sinPhase: number,
    anchorWorldX: number,
    anchorWorldY: number,
  ) {
    this.kind = kind;
    this.sinPhase = sinPhase;
    this.anchorWorldX = anchorWorldX;
    this.anchorWorldY = anchorWorldY;
  }

  get done(): boolean {
    return this.ageSec >= PICKUP_COLLECT_DURATION_SEC;
  }

  update(dt: number): void {
    this.ageSec += dt;
  }
}

export function enqueuePickupCollectFx(
  out: PickupCollectFx[],
  kind: PickupKind,
  anchorWorldX: number,
  anchorWorldY: number,
): void {
  const phase = out.length * 2.5132741228718345;
  out.push(new PickupCollectFx(kind, phase, anchorWorldX, anchorWorldY));
}

export function pickupCollectSpriteFile(kind: PickupKind): string {
  switch (kind) {
    case PickupKind.HEART:
      return "heart collect.png";
    case PickupKind.KEY:
      return "key collect.png";
    case PickupKind.COIN_1:
      return "coin 1 collect.png";
    case PickupKind.COIN_5:
      return "coin 5 collect.png";
    case PickupKind.COIN_10:
      return "coin 10 collect.png";
  }
}

/** Draw collect strips (4 frames horizontal). */
export function drawPickupCollectFx(
  g: CanvasRenderingContext2D,
  fxList: PickupCollectFx[],
  camera: WorldCamera,
  strips: Map<PickupKind, ImageBitmap>,
): void {
  for (const fx of fxList) {
    const bmp = strips.get(fx.kind);
    if (!bmp) continue;
    const n = 4;
    const u = fx.ageSec / PICKUP_COLLECT_DURATION_SEC;
    if (u >= 1) continue;
    const fi = Math.min(n - 1, Math.floor(u * n));
    const fw = Math.max(1, Math.floor(bmp.width / n));
    const fh = bmp.height;

    let alpha = 1;
    if (u > PICKUP_COLLECT_FADE_START_U) {
      alpha =
        1 -
        (u - PICKUP_COLLECT_FADE_START_U) /
          Math.max(1e-6, 1 - PICKUP_COLLECT_FADE_START_U);
    }
    alpha = Math.max(0, Math.min(1, alpha));
    if (alpha < 1e-3) continue;

    const rise = u * PICKUP_COLLECT_RISE_WORLD_PX;
    const sinOff =
      Math.sin(fx.ageSec * PICKUP_COLLECT_SIN_FREQ_RAD_PER_SEC + fx.sinPhase) *
      PICKUP_COLLECT_SIN_AMPLITUDE_WORLD_PX;
    const cxWorld = fx.anchorWorldX + sinOff;
    const cyWorld = fx.anchorWorldY - rise;
    const dw = Math.floor(CAMERA_ZOOM * fw);
    const dh = Math.floor(CAMERA_ZOOM * fh);
    const dx = camera.worldToDeviceX(cxWorld - fw * 0.5);
    const dy = camera.worldToDeviceY(cyWorld - fh * 0.5);

    g.save();
    g.globalAlpha = alpha;
    g.imageSmoothingEnabled = false;
    g.drawImage(bmp, fi * fw, 0, fw, fh, dx, dy, dw, dh);
    g.restore();
  }
}
