import type { GameColorPalette } from "./GameColorPalette";
import {
  configureBandColumnShift,
  configureKCandyFadeSteps,
  createKCandyPaletteTables,
  kCandyFadePixel,
  kCandyWrongColumnPixel,
  sanitizeKCandyPixel,
  type KCandyPaletteTables,
} from "./kCandyPaletteOps";

/** Post-heal k-candy Worley fisheye + palette fade (Java KCandyVisionEffect). */
export class KCandyVisionEffect {
  static readonly BRIGHTEN_FADE_SEC = 60.0;
  static readonly BRIGHTEN_PALETTE_STEPS = 3;
  private static readonly BAND_PALETTE_COLUMN_SHIFT = 2;
  private static readonly BRIGHTEN_DEFAULT_SCALE = 0.1;
  private static readonly BRIGHTEN_PEAK_SCALE = 1.0;
  private static readonly VORONOI_ZOOM_MIX = 1.0;
  private static readonly VORONOI_BASE_SEC = 24.0;
  private static readonly VORONOI_FEATURE_CELL_PX = 44;
  private static readonly BREATHE_HZ_MIN = 0.38;
  private static readonly BREATHE_HZ_MAX = 1.85;
  private static readonly FISHEYE_ZOOM_FRAC = 0.11;
  private static readonly FISHEYE_ZOOM_QUANT_STEPS = 10;
  private static readonly POCKET_CENTER_DRIFT_PX = 2.2;
  private static readonly WORLEY_EDGE_SOFTEN_CELL_FRAC = 0.54;
  private static readonly WORLEY_EDGE_SOFTEN_STRENGTH = 0.55;
  private static readonly FISHEYE_COLOR_SAMPLE_BLEND = 0.22;
  private static readonly WORLEY_SCROLL_CELLS_PER_SEC = 0.32;
  private static readonly WORLEY_SCROLL_DIR_X = 0.70710677;
  private static readonly WORLEY_SCROLL_DIR_Y = 0.70710677;
  private static readonly HUE_DRIFT_PEAK = 0.5;
  private static readonly FORGET_EXTRA_COLUMN_SHIFT = 2.5;

  private brightenRemainingSec = 0;
  private brightenTotalSec = 0;
  private voronoiRemainingSec = 0;
  private voronoiTotalSec = 0;
  private voronoiPhaseSec = 0;
  private forgetBoost = 0;
  private paletteTables: KCandyPaletteTables | null = null;
  private paletteGrid: number[][] = [];

  private pixelScratch = new Uint32Array(0);
  private zoomSourceScratch = new Uint32Array(0);
  private pocketCache: WorleyPocket[] = [];
  private pocketCacheCells = 0;
  private pocketCacheMinCx = 0;
  private pocketCacheMinCy = 0;
  private pocketCacheMaxCx = 0;
  private pocketCacheMaxCy = 0;
  private pocketCacheSpanX = 0;
  private readonly ownerCellScratch = [0, 0];
  private readonly ownerEdgeScratch = [0];

  bindPalette(palette: GameColorPalette | null): void {
    if (!palette?.isLoaded) {
      this.paletteTables = null;
      this.paletteGrid = [];
      return;
    }
    this.paletteGrid = palette.copyPaletteGrid();
    this.paletteTables = createKCandyPaletteTables(this.paletteGrid);
  }

  reset(): void {
    this.brightenRemainingSec = 0;
    this.brightenTotalSec = 0;
    this.voronoiRemainingSec = 0;
    this.voronoiTotalSec = 0;
    this.voronoiPhaseSec = 0;
    this.forgetBoost = 0;
  }

  isActive(): boolean {
    return this.brightenRemainingSec > 0 || this.voronoiRemainingSec > 0;
  }

  beginAfterHeal(effectSeed: bigint, forgetIntensity: number): void {
    this.forgetBoost = Math.max(0, Math.min(1, forgetIntensity));
    this.brightenTotalSec = KCandyVisionEffect.BRIGHTEN_FADE_SEC;
    this.brightenRemainingSec = KCandyVisionEffect.BRIGHTEN_FADE_SEC;
    this.voronoiTotalSec = KCandyVisionEffect.VORONOI_BASE_SEC * (1 + this.forgetBoost * 0.65);
    this.voronoiRemainingSec = this.voronoiTotalSec;
    this.voronoiPhaseSec = 0;
    if (this.paletteTables) {
      configureBandColumnShift(this.paletteTables, this.columnDeltaForFrame(0));
      configureKCandyFadeSteps(
        this.paletteGrid,
        this.paletteTables,
        this.fadeBrightenStepsForForget(),
        this.fadeDarkenStepsForForget(),
      );
    }
    void effectSeed;
  }

  tick(dt: number): void {
    if (this.brightenRemainingSec > 0) {
      this.brightenRemainingSec = Math.max(0, this.brightenRemainingSec - dt);
    }
    if (this.voronoiRemainingSec > 0) {
      this.voronoiRemainingSec = Math.max(0, this.voronoiRemainingSec - dt);
      this.voronoiPhaseSec += dt;
    }
  }

  apply(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.isActive() || !this.paletteTables || this.paletteGrid.length < 3) return;
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const pixelCount = w * h;
    this.ensurePixelScratch(pixelCount);
    for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
      const a = px[p + 3]!;
      const r = px[p]!;
      const g = px[p + 1]!;
      const b = px[p + 2]!;
      this.pixelScratch[i] = (a << 24) | (r << 16) | (g << 8) | b;
    }

    const brightenStrength = this.brightenStrength();
    const voronoiStrength = this.voronoiStrength();
    const doBrighten = brightenStrength > 1e-4;
    const doVoronoi = voronoiStrength > 1e-4;
    const baseColumnDelta = this.columnDeltaForFrame(brightenStrength);

    if (doVoronoi) {
      this.ensureZoomSourceScratch(pixelCount);
      this.zoomSourceScratch.set(this.pixelScratch);
      this.rebuildPocketCache(w, h, voronoiStrength);
    }

    for (let row = 0; row < h; row++) {
      const rowBase = row * w;
      for (let col = 0; col < w; col++) {
        const idx = rowBase + col;
        let argb = this.pixelScratch[idx]!;
        if (doVoronoi) {
          argb = this.applyFisheyeNearestPixel(col, row, argb, w, h);
        }
        if (doBrighten) {
          argb = kCandyFadePixel(this.paletteGrid, this.paletteTables, argb, brightenStrength);
          const hueStrength = this.hueMisreadStrength(brightenStrength);
          if (hueStrength > 1e-4) {
            argb = kCandyWrongColumnPixel(
              this.paletteGrid,
              this.paletteTables,
              argb,
              baseColumnDelta,
              hueStrength,
            );
          }
        }
        if (doBrighten || doVoronoi) {
          argb = sanitizeKCandyPixel(this.paletteTables, argb);
        }
        this.pixelScratch[idx] = argb;
      }
    }

    for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
      const argb = this.pixelScratch[i]!;
      px[p] = (argb >>> 16) & 0xff;
      px[p + 1] = (argb >>> 8) & 0xff;
      px[p + 2] = argb & 0xff;
      px[p + 3] = (argb >>> 24) & 0xff;
    }
    ctx.putImageData(img, 0, 0);
  }

  private fadeBrightenStepsForForget(): number {
    const cap = Math.min(KCandyVisionEffect.BRIGHTEN_PALETTE_STEPS, 3);
    if (cap <= 1) return cap;
    return 1 + Math.round(this.forgetBoost * (cap - 1));
  }

  private fadeDarkenStepsForForget(): number {
    return Math.max(1, 1 + Math.round(this.forgetBoost));
  }

  private brightenIntensityScale(): number {
    return KCandyVisionEffect.BRIGHTEN_DEFAULT_SCALE +
      this.forgetBoost * (KCandyVisionEffect.BRIGHTEN_PEAK_SCALE - KCandyVisionEffect.BRIGHTEN_DEFAULT_SCALE);
  }

  private brightenStrength(): number {
    if (this.brightenRemainingSec <= 0 || this.brightenTotalSec <= 1e-6) return 0;
    const timeFade = this.brightenRemainingSec / this.brightenTotalSec;
    return timeFade * this.brightenIntensityScale();
  }

  private voronoiStrength(): number {
    if (this.voronoiRemainingSec <= 0 || this.voronoiTotalSec <= 1e-6) return 0;
    const u = this.voronoiRemainingSec / this.voronoiTotalSec;
    return Math.sin(Math.PI * 0.5 * u) * (1 + this.forgetBoost * 0.35);
  }

  private columnDeltaForFrame(brightenStrength: number): number {
    const extra = Math.round(this.forgetBoost * KCandyVisionEffect.FORGET_EXTRA_COLUMN_SHIFT);
    const driftBoost = Math.round(brightenStrength * (1 + this.forgetBoost * 0.35));
    return KCandyVisionEffect.BAND_PALETTE_COLUMN_SHIFT + extra + driftBoost;
  }

  private hueMisreadStrength(brightenStrength: number): number {
    return Math.min(1, brightenStrength * (KCandyVisionEffect.HUE_DRIFT_PEAK + this.forgetBoost * 0.35));
  }

  private applyFisheyeNearestPixel(col: number, row: number, argb: number, w: number, h: number): number {
    if ((argb & 0x00ffffff) === 0) return argb;
    const pocket = this.pocketForPixel(col, row, this.ownerEdgeScratch);
    if (!pocket) return argb;
    const zoomStrength = 1 - this.ownerEdgeScratch[0]!;
    const effScale = 1 + (pocket.scale - 1) * KCandyVisionEffect.VORONOI_ZOOM_MIX * zoomStrength;
    if (Math.abs(effScale - 1) < 1e-4) return argb;
    const relX = col - pocket.centerX;
    const relY = row - pocket.centerY;
    const sampleX = pocket.centerX + relX / effScale;
    const sampleY = pocket.centerY + relY / effScale;
    return this.sampleFisheyeColor(sampleX, sampleY, w, h, argb);
  }

  private rebuildPocketCache(w: number, h: number, strength: number): void {
    const scrollMargin = this.worleyScrollCellMargin();
    const minCx = -1;
    const maxCx = Math.floor((w + KCandyVisionEffect.VORONOI_FEATURE_CELL_PX - 1) / KCandyVisionEffect.VORONOI_FEATURE_CELL_PX) + 1 + scrollMargin;
    const minCy = -1;
    const maxCy = Math.floor((h + KCandyVisionEffect.VORONOI_FEATURE_CELL_PX - 1) / KCandyVisionEffect.VORONOI_FEATURE_CELL_PX) + 1 + scrollMargin;
    const spanX = maxCx - minCx + 1;
    const spanY = maxCy - minCy + 1;
    const cells = spanX * spanY;
    this.pocketCache = new Array(cells);
    this.pocketCacheCells = cells;
    this.pocketCacheMinCx = minCx;
    this.pocketCacheMinCy = minCy;
    this.pocketCacheMaxCx = maxCx;
    this.pocketCacheMaxCy = maxCy;
    this.pocketCacheSpanX = spanX;
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const idx = this.pocketCacheIndex(cx, cy);
        this.pocketCache[idx] = this.buildPocketForCell(cx, cy, strength);
      }
    }
  }

  private pocketCacheIndex(cellCx: number, cellCy: number): number {
    return cellCx - this.pocketCacheMinCx + (cellCy - this.pocketCacheMinCy) * this.pocketCacheSpanX;
  }

  private pocketForPixel(col: number, row: number, outEdgeSoften: number[]): WorleyPocket | null {
    this.resolveOwnerCell(col, row, this.ownerCellScratch, outEdgeSoften);
    const cx = this.ownerCellScratch[0]!;
    const cy = this.ownerCellScratch[1]!;
    if (
      cx < this.pocketCacheMinCx ||
      cx > this.pocketCacheMaxCx ||
      cy < this.pocketCacheMinCy ||
      cy > this.pocketCacheMaxCy
    ) {
      return null;
    }
    const idx = this.pocketCacheIndex(cx, cy);
    if (idx < 0 || idx >= this.pocketCacheCells) return null;
    return this.pocketCache[idx] ?? null;
  }

  private worleyScrollFx(): number {
    return this.voronoiPhaseSec * KCandyVisionEffect.WORLEY_SCROLL_CELLS_PER_SEC * KCandyVisionEffect.WORLEY_SCROLL_DIR_X;
  }

  private worleyScrollFy(): number {
    return this.voronoiPhaseSec * KCandyVisionEffect.WORLEY_SCROLL_CELLS_PER_SEC * KCandyVisionEffect.WORLEY_SCROLL_DIR_Y;
  }

  private worleyScrollCellMargin(): number {
    return 2 + Math.ceil(this.voronoiTotalSec * KCandyVisionEffect.WORLEY_SCROLL_CELLS_PER_SEC * 1.1);
  }

  private resolveOwnerCell(col: number, row: number, outCxCy: number[], outEdgeSoften: number[] | null): void {
    const fx = col / KCandyVisionEffect.VORONOI_FEATURE_CELL_PX + this.worleyScrollFx();
    const fy = row / KCandyVisionEffect.VORONOI_FEATURE_CELL_PX + this.worleyScrollFy();
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    let bestDistSq = Number.POSITIVE_INFINITY;
    let secondDistSq = Number.POSITIVE_INFINITY;
    let bestCx = ix;
    let bestCy = iy;
    for (let cy = iy - 1; cy <= iy + 1; cy++) {
      for (let cx = ix - 1; cx <= ix + 1; cx++) {
        const px = cx + KCandyVisionEffect.cellJitter(cx, cy, 0);
        const py = cy + KCandyVisionEffect.cellJitter(cx, cy, 1);
        const dx = fx - px;
        const dy = fy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDistSq) {
          secondDistSq = bestDistSq;
          bestDistSq = d2;
          bestCx = cx;
          bestCy = cy;
        } else if (d2 < secondDistSq) {
          secondDistSq = d2;
        }
      }
    }
    outCxCy[0] = bestCx;
    outCxCy[1] = bestCy;
    if (outEdgeSoften) {
      const gap = Math.sqrt(secondDistSq) - Math.sqrt(bestDistSq);
      outEdgeSoften[0] =
        gap >= KCandyVisionEffect.WORLEY_EDGE_SOFTEN_CELL_FRAC
          ? 0
          : (1 - gap / KCandyVisionEffect.WORLEY_EDGE_SOFTEN_CELL_FRAC) *
            KCandyVisionEffect.WORLEY_EDGE_SOFTEN_STRENGTH;
    }
  }

  private buildPocketForCell(cellCx: number, cellCy: number, strength: number): WorleyPocket {
    const px = cellCx + KCandyVisionEffect.cellJitter(cellCx, cellCy, 0);
    const py = cellCy + KCandyVisionEffect.cellJitter(cellCx, cellCy, 1);
    let centerX = px * KCandyVisionEffect.VORONOI_FEATURE_CELL_PX;
    let centerY = py * KCandyVisionEffect.VORONOI_FEATURE_CELL_PX;
    const drift = KCandyVisionEffect.POCKET_CENTER_DRIFT_PX * strength;
    centerX +=
      drift *
      Math.sin(
        this.voronoiPhaseSec * KCandyVisionEffect.cellBreathHz(cellCx, cellCy, 4) +
          KCandyVisionEffect.cellBreathPhase(cellCx, cellCy, 6),
      );
    centerY +=
      drift *
      Math.cos(
        this.voronoiPhaseSec * KCandyVisionEffect.cellBreathHz(cellCx, cellCy, 5) +
          KCandyVisionEffect.cellBreathPhase(cellCx, cellCy, 7),
      );
    const wobble = this.pocketBreathWobble(cellCx, cellCy, strength);
    const scale = KCandyVisionEffect.crispQuantizeScale(1 + KCandyVisionEffect.FISHEYE_ZOOM_FRAC * strength * wobble);
    return { centerX, centerY, scale };
  }

  private pocketBreathWobble(cx: number, cy: number, strength: number): number {
    const hzA = KCandyVisionEffect.cellBreathHz(cx, cy, 0);
    const hzB = KCandyVisionEffect.cellBreathHz(cx, cy, 1);
    const phaseA = KCandyVisionEffect.cellBreathPhase(cx, cy, 2);
    const phaseB = KCandyVisionEffect.cellBreathPhase(cx, cy, 3);
    const ampA = 0.36 + KCandyVisionEffect.cellJitter(cx, cy, 8) * 0.22;
    const ampB = 0.11 + KCandyVisionEffect.cellJitter(cx, cy, 9) * 0.12;
    const primary = Math.sin(this.voronoiPhaseSec * hzA + phaseA);
    const secondary = Math.sin(this.voronoiPhaseSec * hzB + phaseB);
    const mix = ampA * primary + ampB * secondary;
    return Math.max(-0.72, Math.min(0.72, mix * (0.68 + 0.1 * strength)));
  }

  private sampleFisheyeColor(sampleX: number, sampleY: number, w: number, h: number, fallback: number): number {
    const sc = Math.max(0, Math.min(w - 1, Math.round(sampleX)));
    const sr = Math.max(0, Math.min(h - 1, Math.round(sampleY)));
    const nearest = this.readZoomSource(sc, sr, w, fallback);
    if (KCandyVisionEffect.FISHEYE_COLOR_SAMPLE_BLEND <= 1e-4) return nearest;
    const x0 = Math.max(0, Math.floor(sampleX));
    const y0 = Math.max(0, Math.floor(sampleY));
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = sampleX - x0;
    const ty = sampleY - y0;
    const c00 = this.readZoomSource(x0, y0, w, fallback);
    const c10 = this.readZoomSource(x1, y0, w, fallback);
    const c01 = this.readZoomSource(x0, y1, w, fallback);
    const c11 = this.readZoomSource(x1, y1, w, fallback);
    const c0 = KCandyVisionEffect.lerpArgb(c00, c10, tx);
    const c1 = KCandyVisionEffect.lerpArgb(c01, c11, tx);
    const bilinear = KCandyVisionEffect.lerpArgb(c0, c1, ty);
    return KCandyVisionEffect.lerpArgb(nearest, bilinear, KCandyVisionEffect.FISHEYE_COLOR_SAMPLE_BLEND);
  }

  private readZoomSource(col: number, row: number, w: number, fallback: number): number {
    const idx = row * w + col;
    if (idx < 0 || idx >= this.zoomSourceScratch.length) return fallback;
    return this.zoomSourceScratch[idx]!;
  }

  private ensurePixelScratch(pixelCount: number): void {
    if (this.pixelScratch.length !== pixelCount) {
      this.pixelScratch = new Uint32Array(pixelCount);
    }
  }

  private ensureZoomSourceScratch(pixelCount: number): void {
    if (this.zoomSourceScratch.length !== pixelCount) {
      this.zoomSourceScratch = new Uint32Array(pixelCount);
    }
  }

  private static crispQuantizeScale(scale: number): number {
    const min = 1 - KCandyVisionEffect.FISHEYE_ZOOM_FRAC;
    const max = 1 + KCandyVisionEffect.FISHEYE_ZOOM_FRAC;
    scale = Math.max(min, Math.min(max, scale));
    if (KCandyVisionEffect.FISHEYE_ZOOM_QUANT_STEPS <= 1) return scale;
    const step = (max - min) / KCandyVisionEffect.FISHEYE_ZOOM_QUANT_STEPS;
    let bucket = Math.round((scale - min) / step);
    bucket = Math.max(0, Math.min(KCandyVisionEffect.FISHEYE_ZOOM_QUANT_STEPS, bucket));
    return min + bucket * step;
  }

  private static cellBreathHz(cx: number, cy: number, channel: number): number {
    const u = KCandyVisionEffect.cellJitter(cx, cy, channel);
    return KCandyVisionEffect.BREATHE_HZ_MIN + u * (KCandyVisionEffect.BREATHE_HZ_MAX - KCandyVisionEffect.BREATHE_HZ_MIN);
  }

  private static cellBreathPhase(cx: number, cy: number, channel: number): number {
    return KCandyVisionEffect.cellJitter(cx, cy, channel) * (Math.PI * 2);
  }

  private static cellJitter(cx: number, cy: number, channel: number): number {
    return (KCandyVisionEffect.cellHash(cx, cy, channel) & 0xffff) / 65535;
  }

  private static cellHash(cx: number, cy: number, seedIndex: number): number {
    let h = cx * 374761393 + cy * 668265263 + seedIndex * 362437;
    h = (h ^ (h >>> 13)) * 1274126177;
    return h ^ (h >>> 16);
  }

  private static lerpArgb(from: number, to: number, t: number): number {
    if (t <= 1e-4) return from;
    if (t >= 1 - 1e-4) return to;
    const af = (from >>> 24) & 0xff;
    const rf = (from >>> 16) & 0xff;
    const gf = (from >>> 8) & 0xff;
    const bf = from & 0xff;
    const at = (to >>> 24) & 0xff;
    const rt = (to >>> 16) & 0xff;
    const gt = (to >>> 8) & 0xff;
    const bt = to & 0xff;
    const a = Math.round(af + (at - af) * t);
    const r = Math.round(rf + (rt - rf) * t);
    const g = Math.round(gf + (gt - gf) * t);
    const b = Math.round(bf + (bt - bf) * t);
    return (a << 24) | (r << 16) | (g << 8) | b;
  }
}

type WorleyPocket = {
  centerX: number;
  centerY: number;
  scale: number;
};
