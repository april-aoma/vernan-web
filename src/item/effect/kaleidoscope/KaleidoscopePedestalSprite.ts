/**
 * Slow discrete color swaps on a pedestal item sprite (excludes pure black / white).
 * Java KaleidoscopePedestalSprite.
 */
const BLACK_RGB = 0x000000;
const WHITE_RGB = 0xffffff;
/** ~0.25s between swaps at 60Hz. */
const FRAMES_PER_SWAP = 15;

export class KaleidoscopePedestalSprite {
  private readonly palette: number[] = [];
  private readonly remap = new Map<number, number>();
  private sourcePx: Uint8ClampedArray | null = null;
  private scratchCanvas: HTMLCanvasElement | null = null;
  private scratchCtx: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private swapCountdown = 0;
  private primed = false;

  prime(
    src: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    roomSeed: bigint,
    roomId: number,
  ): void {
    this.palette.length = 0;
    this.remap.clear();
    this.sourcePx = null;
    this.primed = false;
    this.w = sw;
    this.h = sh;

    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, sw, sh);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    const img = ctx.getImageData(0, 0, sw, sh);
    this.sourcePx = new Uint8ClampedArray(img.data);
    const seen = new Map<number, true>();
    for (let i = 0; i < this.sourcePx.length; i += 4) {
      if (this.sourcePx[i + 3]! === 0) continue;
      const rgb =
        ((this.sourcePx[i]! & 0xff) << 16) |
        ((this.sourcePx[i + 1]! & 0xff) << 8) |
        (this.sourcePx[i + 2]! & 0xff);
      if (rgb === BLACK_RGB || rgb === WHITE_RGB) continue;
      seen.set(rgb, true);
    }
    for (const color of seen.keys()) {
      this.palette.push(color);
      this.remap.set(color, color);
    }
    this.scratchCanvas = c;
    this.scratchCtx = ctx;
    this.primed = this.palette.length >= 2;

    const seed =
      (roomSeed ^ BigInt(roomId) * 0x4b1d3e7fn ^ 0x4a1e1d50ecn) & 0xffffffffffffffffn;
    const n = Number(seed % BigInt(FRAMES_PER_SWAP));
    this.swapCountdown = Math.floor(FRAMES_PER_SWAP / 3) + n;
  }

  isPrimed(): boolean {
    return this.primed;
  }

  /** Remapped pickup cell as canvas for drawImage, or null to use source. */
  frame(): HTMLCanvasElement | null {
    if (!this.primed || !this.sourcePx || !this.scratchCanvas || !this.scratchCtx) return null;
    const out = this.scratchCtx.createImageData(this.w, this.h);
    const px = out.data;
    for (let i = 0; i < this.sourcePx.length; i += 4) {
      const a = this.sourcePx[i + 3]!;
      px[i + 3] = a;
      if (a === 0) {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        continue;
      }
      const rgb =
        ((this.sourcePx[i]! & 0xff) << 16) |
        ((this.sourcePx[i + 1]! & 0xff) << 8) |
        (this.sourcePx[i + 2]! & 0xff);
      const mapped = this.remap.get(rgb);
      if (mapped != null) {
        px[i] = (mapped >>> 16) & 0xff;
        px[i + 1] = (mapped >>> 8) & 0xff;
        px[i + 2] = mapped & 0xff;
      } else {
        px[i] = this.sourcePx[i]!;
        px[i + 1] = this.sourcePx[i + 1]!;
        px[i + 2] = this.sourcePx[i + 2]!;
      }
    }
    this.scratchCtx.putImageData(out, 0, 0);
    return this.scratchCanvas;
  }

  tick(): void {
    if (this.palette.length < 2) return;
    this.swapCountdown--;
    if (this.swapCountdown > 0) return;
    this.swapCountdown = FRAMES_PER_SWAP;
    let i = Math.floor(Math.random() * this.palette.length);
    let j = Math.floor(Math.random() * this.palette.length);
    while (j === i) j = Math.floor(Math.random() * this.palette.length);
    const ci = this.palette[i]!;
    const cj = this.palette[j]!;
    const mi = this.remap.get(ci) ?? ci;
    const mj = this.remap.get(cj) ?? cj;
    this.remap.set(ci, mj);
    this.remap.set(cj, mi);
  }

  clear(): void {
    this.palette.length = 0;
    this.remap.clear();
    this.sourcePx = null;
    this.scratchCanvas = null;
    this.scratchCtx = null;
    this.primed = false;
  }
}
