/**
 * Decorative shop NPC from {@code sprites/cat shopkeep sheet.png}
 * (3 square frames: head, body, tail). Stationary, non-colliding.
 * Java {@code game.entity.ShopKeeper}.
 */
export class ShopKeeper {
  private static readonly BOB_PERIOD_SEC = 1.6;
  private static readonly BOB_AMP_WORLD_PX = 1.0;
  private static readonly TAIL_WAVE_AMP_PX = 2.0;
  private static readonly TAIL_WAVE_PHASE_PER_ROW_RAD = 0.52;
  private static readonly TAIL_WAVE_TIME_SPEED_RAD_PER_SEC = 2.2;
  private static readonly TAIL_BASE_FRAC = 28 / 32;
  private static readonly TAIL_TIP_FRAC = 1 / 32;

  constructor(
    /** Top-left of the composited frame, world px. */
    readonly frameLeftWorldX: number,
    readonly frameTopWorldY: number,
    /** World-px size of the square composite frame. */
    readonly frameSize: number,
  ) {}

  feetWorldY(): number {
    return this.frameTopWorldY + this.frameSize;
  }

  /** Vertical head offset (world px; negative = up). */
  headBobWorldDy(t: number): number {
    return ShopKeeper.BOB_AMP_WORLD_PX * Math.sin(t * ((2 * Math.PI) / ShopKeeper.BOB_PERIOD_SEC));
  }

  /** Horizontal offset for one tail frame row, snapped to whole world px. */
  tailRowOffsetWorldX(row: number, t: number): number {
    const baseRow = ShopKeeper.TAIL_BASE_FRAC * this.frameSize;
    const tipRow = ShopKeeper.TAIL_TIP_FRAC * this.frameSize;
    let taper = (baseRow - row) / (baseRow - tipRow);
    if (taper < 0) taper = 0;
    else if (taper > 1) taper = 1;
    const phase =
      t * ShopKeeper.TAIL_WAVE_TIME_SPEED_RAD_PER_SEC + row * ShopKeeper.TAIL_WAVE_PHASE_PER_ROW_RAD;
    return Math.round(ShopKeeper.TAIL_WAVE_AMP_PX * taper * Math.sin(phase));
  }
}

/** Sheet layout: 3 horizontal 32×32 frames (head, body, tail). */
export const SHOPKEEP_FRAME_SRC = 32;
/** Eye sclera boxes in head-frame-local px {minX,minY,maxX,maxY}. */
export const SHOPKEEP_EYE_LEFT = [3, 11, 6, 13] as const;
export const SHOPKEEP_EYE_RIGHT = [9, 10, 14, 13] as const;
export const SHOPKEEP_PUPIL_W = 1;
export const SHOPKEEP_PUPIL_H = 2;
export const SHOPKEEP_PUPIL_COLOR = "#45283c";
