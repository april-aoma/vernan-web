/**
 * Mutable copy of GameColorPalette for kaleidoscope eye.
 * Accumulates edits and remaps the full backbuffer to nearest scratch swatch.
 */
import { blendRgb, MODE_LABELS } from "../../../tileset/background/BackgroundLayerBlend";
import { parse as parseSpatialDistortion, SPATIAL_KINDS } from "../../../tileset/background/BackgroundSpatialDistortion";
const LUT_SIZE = 4096;
const BLACK_RGB = 0x000000;
const WHITE_RGB = 0xffffff;
const BLACK_CLAMP_V = 0.035;
const WHITE_CLAMP_V = 0.965;
const WHITE_CLAMP_SAT = 0.1;

export class KaleidoscopeScratchPalette {
  private grid: number[][] = [];
  private extraColors: number[] = [];
  private remapLut: Int32Array | null = null;

  resetFromGrid(sourceGrid: number[][]): void {
    this.grid = sourceGrid.map((col) => col.slice());
    this.extraColors = [];
    this.rebuildRemapLut();
  }

  isReady(): boolean {
    return this.grid.length >= 3 && this.remapLut != null && this.remapLut.length === LUT_SIZE;
  }

  applyRandomOp(nextInt: (bound: number) => number): void {
    if (this.grid.length < 3) return;
    const op = nextInt(6);
    switch (op) {
      case 0:
        this.swapRandomSwatches(nextInt);
        break;
      case 1:
        this.burnRandomColor(nextInt);
        break;
      case 2:
        this.rotateRandomHueColumn(nextInt);
        break;
      case 3:
        this.nudgeRandomBrightnessRow(nextInt);
        break;
      case 4:
        this.stretchRandomSwatch(nextInt);
        break;
      default:
        this.distortPaletteOnce(nextInt);
        break;
    }
    this.rebuildRemapLut();
  }

  /** Remap opaque pixels on ImageData in place (after identity palette clamp). */
  applyRemapToImageData(data: ImageData): void {
    if (!this.isReady() || !this.remapLut) return;
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3]!;
      if (a === 0) continue;
      const r = px[i]!;
      const g = px[i + 1]!;
      const b = px[i + 2]!;
      const rgb = this.remapLut[quantizeIndex(r, g, b)]!;
      px[i] = (rgb >>> 16) & 0xff;
      px[i + 1] = (rgb >>> 8) & 0xff;
      px[i + 2] = rgb & 0xff;
    }
  }

  applyToCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.isReady()) return;
    const img = ctx.getImageData(0, 0, w, h);
    this.applyRemapToImageData(img);
    ctx.putImageData(img, 0, 0);
  }

  private swapRandomSwatches(nextInt: (bound: number) => number): void {
    const cols = this.grid.length;
    const rows = this.grid[0]!.length;
    const c1 = 1 + nextInt(cols - 2);
    const c2 = 1 + nextInt(cols - 2);
    const r1 = nextInt(rows);
    const r2 = nextInt(rows);
    const tmp = this.grid[c1]![r1]!;
    this.grid[c1]![r1] = this.grid[c2]![r2]!;
    this.grid[c2]![r2] = tmp;
  }

  private burnRandomColor(nextInt: (bound: number) => number): void {
    let rgb = (nextInt(256) << 16) | (nextInt(256) << 8) | nextInt(256);
    if (rgb === BLACK_RGB || rgb === WHITE_RGB) rgb ^= 0x808080;
    this.extraColors.push(rgb);
    const cols = this.grid.length;
    const rows = this.grid[0]!.length;
    const c = 1 + nextInt(cols - 2);
    const r = nextInt(rows);
    this.grid[c]![r] = rgb;
  }

  private rotateRandomHueColumn(nextInt: (bound: number) => number): void {
    const cols = this.grid.length;
    const chromatic = cols - 2;
    if (chromatic <= 1) return;
    const from = 1 + nextInt(chromatic);
    const dir = nextInt(2) === 0 ? 1 : -1;
    const to = wrapChromatic(from + dir, cols);
    const rows = this.grid[0]!.length;
    const column = this.grid[from]!.slice();
    for (let r = 0; r < rows; r++) {
      this.grid[from]![r] = this.grid[to]![r]!;
      this.grid[to]![r] = column[r]!;
    }
  }

  private nudgeRandomBrightnessRow(nextInt: (bound: number) => number): void {
    const cols = this.grid.length;
    const rows = this.grid[0]!.length;
    if (rows <= 1) return;
    const c = 1 + nextInt(cols - 2);
    const dir = nextInt(2) === 0 ? 1 : -1;
    const col = this.grid[c]!.slice();
    if (dir > 0) {
      for (let r = rows - 1; r > 0; r--) this.grid[c]![r] = col[r - 1]!;
      this.grid[c]![0] = col[rows - 1]!;
    } else {
      for (let r = 0; r < rows - 1; r++) this.grid[c]![r] = col[r + 1]!;
      this.grid[c]![rows - 1] = col[0]!;
    }
  }

  private stretchRandomSwatch(nextInt: (bound: number) => number): void {
    const cols = this.grid.length;
    const rows = this.grid[0]!.length;
    const c = 1 + nextInt(cols - 2);
    const r = nextInt(rows);
    const base = this.grid[c]![r]!;
    const dir = nextInt(4);
    let nc = c;
    let nr = r;
    if (dir === 0) nc = Math.min(cols - 2, c + 1);
    else if (dir === 1) nc = Math.max(1, c - 1);
    else if (dir === 2) nr = Math.min(rows - 1, r + 1);
    else nr = Math.max(0, r - 1);
    const neighbor = this.grid[nc]![nr]!;
    const mode = MODE_LABELS[nextInt(MODE_LABELS.length)] ?? "normal";
    const strength = 0.35 + nextInt(56) / 100;
    const blended = blendRgb(base | 0xff000000, neighbor | 0xff000000, strength, mode) & 0xffffff;
    this.grid[c]![r] = blended;
    if (nextInt(2) === 0) this.grid[nc]![nr] = blended;
  }

  /** Remap palette swatches through a random BackgroundSpatialDistortion (Java distortPaletteOnce). */
  private distortPaletteOnce(nextInt: (bound: number) => number): void {
    const cols = this.grid.length;
    const rows = this.grid[0]!.length;
    const copy = this.grid.map((col) => col.slice());
    const kind = SPATIAL_KINDS[nextInt(SPATIAL_KINDS.length)]!;
    const tr = defaultDistortParams(kind, cols, rows, nextInt);
    const dist = parseSpatialDistortion(tr, nextInt(8));
    if (!dist) return;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const uv = new Float64Array([c * 8 + 4, r * 8 + 4]);
        dist.mapSample(uv, 0, 0, nextInt(240));
        let sc = Math.round(uv[0]! / 8);
        let sr = Math.round(uv[1]! / 8);
        sc = Math.max(0, Math.min(cols - 1, sc));
        sr = Math.max(0, Math.min(rows - 1, sr));
        this.grid[c]![r] = copy[sc]![sr]!;
      }
    }
  }

  private rebuildRemapLut(): void {
    if (this.grid.length < 3) {
      this.remapLut = null;
      return;
    }
    const lut = new Int32Array(LUT_SIZE);
    for (let q = 0; q < LUT_SIZE; q++) {
      const r = ((q >> 8) & 0xf) * 16 + 8;
      const g = ((q >> 4) & 0xf) * 16 + 8;
      const b = (q & 0xf) * 16 + 8;
      lut[q] = nearestSwatchRgb(this.grid, r, g, b);
    }
    this.remapLut = lut;
  }
}

function wrapChromatic(col: number, cols: number): number {
  const first = 1;
  const last = cols - 2;
  const span = last - first + 1;
  let c = col;
  while (c < first) c += span;
  while (c > last) c -= span;
  return c;
}

function defaultDistortParams(
  kind: string,
  cols: number,
  rows: number,
  nextInt: (bound: number) => number,
): Record<string, number | string | boolean> {
  const cx = cols * 4;
  const cy = rows * 4;
  const rad = Math.hypot(cols, rows) * 4;
  const tr: Record<string, number | string | boolean> = {
    kind,
    enabled: true,
    phaseOffsetRad: nextInt(6283) / 1000,
  };
  switch (kind.toLowerCase()) {
    case "scanlinewarp":
      tr.ampPx = 1.5 + nextInt(2500) / 1000;
      tr.phasePerRowRad = 0.25 + nextInt(500) / 1000;
      tr.timeRadPerTick = 0.04;
      tr.pinnedRow = nextInt(Math.max(1, rows));
      tr.strength = 0.6 + nextInt(350) / 1000;
      break;
    case "fisheye":
      tr.centerXPx = cx;
      tr.centerYPx = cy;
      tr.radiusPx = rad * 0.55;
      tr.strength = 0.2 + nextInt(450) / 1000;
      tr.rippleAmp = 0.08 + nextInt(180) / 1000;
      tr.rippleFreq = 3 + nextInt(5000) / 1000;
      tr.timeRadPerTick = 0.03;
      break;
    case "swirl":
      tr.centerXPx = cx;
      tr.centerYPx = cy;
      tr.radiusPx = rad * 0.65;
      tr.twistRad = 0.6 + nextInt(1400) / 1000;
      tr.rippleAmp = 0.1 + nextInt(200) / 1000;
      tr.rippleFreq = 3 + nextInt(4000) / 1000;
      tr.timeRadPerTick = 0.04;
      break;
    case "polarscroll":
      tr.centerXPx = cx;
      tr.centerYPx = cy;
      tr.radiusPx = rad;
      tr.angleRadPerTick = 0.02 + nextInt(50) / 1000;
      tr.radialPxPerTick = nextInt(2000) / 1000 - 1;
      tr.strength = 0.65 + nextInt(350) / 1000;
      break;
    case "wave2d":
      tr.ampXPx = 1 + nextInt(3000) / 1000;
      tr.ampYPx = 0.8 + nextInt(2500) / 1000;
      tr.phasePerColRad = 0.15 + nextInt(350) / 1000;
      tr.phasePerRowRad = 0.2 + nextInt(400) / 1000;
      tr.pinnedCol = nextInt(Math.max(1, cols));
      tr.pinnedRow = nextInt(Math.max(1, rows));
      tr.timeRadPerTick = 0.05;
      break;
    case "ripple":
      tr.centerXPx = cx;
      tr.centerYPx = cy;
      tr.radiusPx = rad * 0.7;
      tr.ampPx = 1.5 + nextInt(3000) / 1000;
      tr.rings = 2 + nextInt(4000) / 1000;
      tr.timeRadPerTick = 0.06;
      break;
    default:
      break;
  }
  return tr;
}

function quantizeIndex(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function nearestSwatchRgb(grid: number[][], r: number, g: number, b: number): number {
  const clamp = clampRgb(grid, r, g, b);
  if (clamp >= 0) return clamp;
  let bestCol = 1;
  let bestRow = 0;
  let bestD = Number.POSITIVE_INFINITY;
  const lastCol = grid.length - 2;
  for (let c = 1; c <= lastCol; c++) {
    const col = grid[c]!;
    for (let row = 0; row < col.length; row++) {
      const rgb = col[row]!;
      const cr = (rgb >>> 16) & 0xff;
      const cg = (rgb >>> 8) & 0xff;
      const cb = rgb & 0xff;
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (d < bestD) {
        bestD = d;
        bestCol = c;
        bestRow = row;
      }
    }
  }
  return grid[bestCol]![bestRow]!;
}

function clampRgb(grid: number[][], r: number, g: number, b: number): number {
  if (grid.length === 0) return -1;
  const { s, v } = rgbToHs(r, g, b);
  if (v <= BLACK_CLAMP_V) return grid[0]![0]!;
  if (v >= WHITE_CLAMP_V && s <= WHITE_CLAMP_SAT) return grid[grid.length - 1]![0]!;
  return -1;
}

function rgbToHs(r: number, g: number, b: number): { s: number; v: number } {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const v = max;
  const d = max - min;
  const s = max <= 1e-9 ? 0 : d / max;
  return { s, v };
}
