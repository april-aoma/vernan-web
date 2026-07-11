/**
 * Visual squash/stretch with conserved volume (scaleX + scaleY == 2).
 * Java game.render.SquashStretch.
 */
export class SquashStretch {
  static readonly DEFAULT_RECOVER_FRAMES = 20;

  private decay = 0;
  private peakMag = 0;
  private verticalPeak = true;
  private recoverFrames = SquashStretch.DEFAULT_RECOVER_FRAMES;
  private holdFramesRemaining = 0;
  /** -1 left, 0 center, +1 right */
  private _anchorColumnSign = 0;

  reset(): void {
    this.decay = 0;
    this.peakMag = 0;
    this.verticalPeak = true;
    this.holdFramesRemaining = 0;
    this._anchorColumnSign = 0;
  }

  anchorColumnSign(): number {
    return this._anchorColumnSign;
  }

  applyStretchY(scaleY: number, recoverFrames = SquashStretch.DEFAULT_RECOVER_FRAMES): void {
    this._anchorColumnSign = 0;
    this.applyPeak(scaleY - 1, true, recoverFrames);
  }

  applyStretchX(scaleX: number, recoverFrames = SquashStretch.DEFAULT_RECOVER_FRAMES): void {
    this._anchorColumnSign = 0;
    this.applyPeak(scaleX - 1, false, recoverFrames);
  }

  applyStretchXHeld(scaleX: number, holdFrames: number): void {
    this.applyPeak(scaleX - 1, false, Math.max(1, holdFrames));
    this.holdFramesRemaining = Math.max(1, holdFrames);
  }

  applyStretchYWallAnchored(scaleY: number, recoverFrames: number, wallSide: number): void {
    this._anchorColumnSign = wallSide < 0 ? -1 : wallSide > 0 ? 1 : 0;
    this.applyPeak(scaleY - 1, true, recoverFrames);
  }

  private applyPeak(mag: number, vertical: boolean, recoverFrames: number): void {
    if (Math.abs(mag) < 1e-9) return;
    this.peakMag = mag;
    this.verticalPeak = vertical;
    this.recoverFrames = Math.max(1, recoverFrames);
    this.decay = 1;
    this.holdFramesRemaining = 0;
  }

  /** Advance one fixed sim step (dt ≈ 1/60). */
  tick(dtSeconds = 1 / 60): void {
    if (this.holdFramesRemaining > 0) {
      this.holdFramesRemaining--;
      this.decay = 1;
      return;
    }
    if (this.decay <= 0) return;
    const recoverSec = this.recoverFrames / 60;
    if (recoverSec <= 1e-9) {
      this.decay = 0;
      return;
    }
    this.decay = Math.max(0, this.decay - dtSeconds / recoverSec);
  }

  active(): boolean {
    return this.decay > 0;
  }

  scaleX(): number {
    return this.scaleForAxis(false);
  }

  scaleY(): number {
    return this.scaleForAxis(true);
  }

  private scaleForAxis(yAxis: boolean): number {
    if (this.decay <= 0) return 1;
    const mag = this.peakMag * this.decay;
    if (this.verticalPeak) {
      return yAxis ? 1 + mag : 2 - (1 + mag);
    }
    return yAxis ? 2 - (1 + mag) : 1 + mag;
  }
}

/** Feet-anchored device rect [x1,y1,x2,y2] → mutated in place. */
export function adjustDeviceRectFeetAnchored(
  rect: [number, number, number, number],
  scaleX: number,
  scaleY: number,
  anchorColumnSign = 0,
): void {
  if (scaleX === 1 && scaleY === 1) return;
  const [x1, , x2, y2] = rect;
  const feet = y2;
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - rect[1]);
  const nw = Math.max(1, Math.round(w * scaleX));
  const nh = Math.max(1, Math.round(h * scaleY));
  if (anchorColumnSign < 0) {
    rect[0] = x1;
    rect[2] = x1 + nw;
  } else if (anchorColumnSign > 0) {
    rect[2] = x2;
    rect[0] = x2 - nw;
  } else {
    const cx = Math.floor((x1 + x2) / 2);
    rect[0] = cx - Math.floor(nw / 2);
    rect[2] = rect[0] + nw;
  }
  rect[3] = feet;
  rect[1] = feet - nh;
}
