/**
 * Runtime palette clamp from sprites/game-palette.png (Java GameColorPalette).
 * Snaps opaque off-palette pixels to nearest chromatic swatch; preserves exact
 * in-game sprite colors (Java rebuildExactSourceColors) and grid swatches.
 */
const SWATCH_PX = 8;
const LUT_SIZE = 4096;
const BLACK_CLAMP_V = 0.035;
const WHITE_CLAMP_V = 0.965;
const WHITE_CLAMP_SAT = 0.1;

export type ExactSourceKeysPayload = {
  keys?: string[];
};

export class GameColorPalette {
  private grid: number[][] = [];
  private identitySnapLut: Int32Array | null = null;
  private exactSourceColorKeys = new Set<number>();

  get isLoaded(): boolean {
    return this.grid.length >= 3 && this.identitySnapLut != null && this.exactSourceColorKeys.size > 0;
  }

  /** Deep copy of palette grid for kaleidoscope scratch (Java copyPaletteGrid). */
  copyPaletteGrid(): number[][] {
    return this.grid.map((col) => col.slice());
  }

  static async load(assets: {
    loadImage(path: string): Promise<ImageBitmap>;
    loadJson?<T>(path: string): Promise<T>;
  }): Promise<GameColorPalette> {
    const pal = new GameColorPalette();
    try {
      const bmp = await assets.loadImage("sprites/game-palette.png");
      pal.loadFromBitmap(bmp);
    } catch (ex) {
      console.warn("[palette] Failed to load game-palette.png", ex);
      return pal;
    }
    if (assets.loadJson) {
      try {
        const payload = await assets.loadJson<ExactSourceKeysPayload>(
          "data/palette-exact-source-keys.json",
        );
        pal.mergeExactSourceKeys(payload);
      } catch (ex) {
        console.warn("[palette] Exact-source keys missing; grid swatches only", ex);
      }
    }
    return pal;
  }

  loadFromBitmap(bmp: ImageBitmap): void {
    this.grid = readGridFromImage(bmp);
    this.rebuildIdentitySnapLut();
    const keys = new Set<number>();
    addGridSwatchesToExactKeys(this.grid, keys);
    this.exactSourceColorKeys = keys;
  }

  /** Merge Java rebuildExactSourceColors keys (hex RRGGBB, already F8-quantized). */
  mergeExactSourceKeys(payload: ExactSourceKeysPayload | null | undefined): void {
    if (!payload?.keys?.length) return;
    for (const hex of payload.keys) {
      const n = Number.parseInt(hex, 16);
      if (!Number.isFinite(n)) continue;
      this.exactSourceColorKeys.add(n & 0xffffff);
    }
  }

  /** Snap opaque pixels on an ImageData buffer in place (ARGB via canvas RGBA). */
  snapImageData(data: ImageData): void {
    if (!this.isLoaded || !this.identitySnapLut) return;
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3]!;
      if (a === 0) continue;
      const r = px[i]!;
      const g = px[i + 1]!;
      const b = px[i + 2]!;
      if (this.exactSourceColorKeys.has(sourceColorKey(r, g, b))) continue;
      const q = quantizeIndex(r, g, b);
      const rgb = this.identitySnapLut[q]!;
      px[i] = (rgb >>> 16) & 0xff;
      px[i + 1] = (rgb >>> 8) & 0xff;
      px[i + 2] = rgb & 0xff;
    }
  }

  /**
   * Snap the full canvas (internal backbuffer) to the palette.
   * Matches GamePanel.paletteClampBackbufferIfReady.
   */
  applyToCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.isLoaded) return;
    const img = ctx.getImageData(0, 0, w, h);
    this.snapImageData(img);
    ctx.putImageData(img, 0, 0);
  }

  private rebuildIdentitySnapLut(): void {
    if (this.grid.length < 3) {
      this.identitySnapLut = null;
      return;
    }
    const lut = new Int32Array(LUT_SIZE);
    for (let q = 0; q < LUT_SIZE; q++) {
      const r = ((q >> 8) & 0xf) * 16 + 8;
      const g = ((q >> 4) & 0xf) * 16 + 8;
      const b = (q & 0xf) * 16 + 8;
      lut[q] = nearestSwatchRgb(this.grid, r, g, b);
    }
    this.identitySnapLut = lut;
  }
}

function readGridFromImage(bmp: ImageBitmap): number[][] {
  const w = bmp.width;
  const h = bmp.height;
  if (w < SWATCH_PX * 3 || h < SWATCH_PX) return [];
  const cols = Math.floor(w / SWATCH_PX);
  const rows = Math.floor(h / SWATCH_PX);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const out: number[][] = [];
  for (let col = 0; col < cols; col++) {
    const column: number[] = [];
    for (let row = 0; row < rows; row++) {
      const cx = Math.min(col * SWATCH_PX + (SWATCH_PX >> 1), w - 1);
      const cy = Math.min(row * SWATCH_PX + (SWATCH_PX >> 1), h - 1);
      const i = (cy * w + cx) * 4;
      column.push(((data[i]! & 0xff) << 16) | ((data[i + 1]! & 0xff) << 8) | (data[i + 2]! & 0xff));
    }
    out.push(column);
  }
  return out;
}

function addGridSwatchesToExactKeys(grid: number[][], keys: Set<number>): void {
  for (const col of grid) {
    for (const rgb of col) {
      const r = (rgb >>> 16) & 0xff;
      const g = (rgb >>> 8) & 0xff;
      const b = rgb & 0xff;
      keys.add(sourceColorKey(r, g, b));
    }
  }
}

function sourceColorKey(r: number, g: number, b: number): number {
  return ((r & 0xf8) << 16) | ((g & 0xf8) << 8) | (b & 0xf8);
}

function quantizeIndex(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function nearestSwatchRgb(grid: number[][], r: number, g: number, b: number): number {
  const clamp = clampRgb(grid, r, g, b);
  if (clamp >= 0) return clamp;
  if (grid.length < 3) return 0;
  const cell = nearestChromaticCell(grid, r, g, b);
  return grid[cell[0]!]![cell[1]!]!;
}

function clampRgb(grid: number[][], r: number, g: number, b: number): number {
  if (grid.length === 0) return -1;
  const { s, v } = rgbToHs(r, g, b);
  if (v <= BLACK_CLAMP_V) return grid[0]![0]!;
  if (v >= WHITE_CLAMP_V && s <= WHITE_CLAMP_SAT) return grid[grid.length - 1]![0]!;
  return -1;
}

function nearestChromaticCell(grid: number[][], r: number, g: number, b: number): [number, number] {
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
      const dr = r - cr;
      const dg = g - cg;
      const db = b - cb;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        bestCol = c;
        bestRow = row;
      }
    }
  }
  return [bestCol, bestRow];
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
