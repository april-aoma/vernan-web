const LUT_SIZE = 4096;
const BRIGHTEN_HARD_SNAP_THRESHOLD = 0.72;
const FADE_ROW_SPLIT = 0.52;
const BLACK_CLAMP_V = 0.035;
const WHITE_CLAMP_V = 0.965;
const WHITE_CLAMP_SAT = 0.1;

export type KCandyPaletteTables = {
  fadeBrightTargetLut: Int32Array | null;
  fadeDarkTargetLut: Int32Array | null;
  fadeUseDarkenLut: Uint8Array | null;
  kCandyFloorRgb: number;
  kCandyCeilRgb: number;
  bandPaletteColumnShift: number;
};

export function createKCandyPaletteTables(grid: number[][]): KCandyPaletteTables {
  const tables: KCandyPaletteTables = {
    fadeBrightTargetLut: null,
    fadeDarkTargetLut: null,
    fadeUseDarkenLut: null,
    kCandyFloorRgb: 0x101010,
    kCandyCeilRgb: 0xe8e8e8,
    bandPaletteColumnShift: 0,
  };
  rebuildKCandyExtremeBounds(grid, tables);
  configureKCandyFadeSteps(grid, tables, 3, 1);
  return tables;
}

export function configureKCandyFadeSteps(
  grid: number[][],
  tables: KCandyPaletteTables,
  brightenSteps: number,
  darkenSteps: number,
): void {
  if (grid.length < 3) {
    tables.fadeBrightTargetLut = null;
    tables.fadeDarkTargetLut = null;
    tables.fadeUseDarkenLut = null;
    return;
  }
  tables.fadeBrightTargetLut = new Int32Array(LUT_SIZE);
  tables.fadeDarkTargetLut = new Int32Array(LUT_SIZE);
  tables.fadeUseDarkenLut = new Uint8Array(LUT_SIZE);
  const rows = paletteRows(grid);
  for (let q = 0; q < LUT_SIZE; q++) {
    const r = ((q >> 8) & 0xf) * 16 + 8;
    const g = ((q >> 4) & 0xf) * 16 + 8;
    const b = (q & 0xf) * 16 + 8;
    const identity = sanitizeKCandyRgb(tables, (r << 16) | (g << 8) | b);
    tables.fadeBrightTargetLut[q] =
      brightenSteps > 0 ? rowDeltaSnapKCandy(grid, tables, r, g, b, brightenSteps) : identity;
    tables.fadeDarkTargetLut[q] =
      darkenSteps > 0 ? rowDeltaSnapKCandy(grid, tables, r, g, b, -darkenSteps) : identity;
    tables.fadeUseDarkenLut[q] = paletteRowNorm(grid, r, g, b, rows) >= FADE_ROW_SPLIT ? 1 : 0;
  }
}

export function configureBandColumnShift(tables: KCandyPaletteTables, delta: number): void {
  tables.bandPaletteColumnShift = delta;
}

export function kCandyFadePixel(
  grid: number[][],
  tables: KCandyPaletteTables,
  argb: number,
  strength: number,
): number {
  if (strength <= 1e-4 || !tables.fadeBrightTargetLut || grid.length < 3) return argb;
  const a = (argb >>> 24) & 0xff;
  if (a === 0) return argb;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  const q = quantizeIndex(r, g, b);
  const target =
    tables.fadeUseDarkenLut![q] !== 0
      ? tables.fadeDarkTargetLut![q]!
      : tables.fadeBrightTargetLut![q]!;
  if (strength >= BRIGHTEN_HARD_SNAP_THRESHOLD) {
    return sanitizeKCandyArgb(tables, (a << 24) | target);
  }
  const t = strength / BRIGHTEN_HARD_SNAP_THRESHOLD;
  const tr = (target >>> 16) & 0xff;
  const tg = (target >>> 8) & 0xff;
  const tb = target & 0xff;
  const or = Math.round(r + (tr - r) * t);
  const og = Math.round(g + (tg - g) * t);
  const ob = Math.round(b + (tb - b) * t);
  return sanitizeKCandyArgb(tables, (a << 24) | (or << 16) | (og << 8) | ob);
}

export function kCandyWrongColumnPixel(
  grid: number[][],
  tables: KCandyPaletteTables,
  argb: number,
  columnDelta: number,
  strength: number,
): number {
  if (strength <= 1e-4 || grid.length < 3) return argb;
  const a = (argb >>> 24) & 0xff;
  if (a === 0) return argb;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  const clamp = clampRgb(grid, r, g, b);
  if (clamp >= 0) return (a << 24) | clamp;
  const cell = matchCellFast(grid, r, g, b);
  const wrongCol = wrapChromaticColumn(grid, cell[0]!, columnDelta);
  const target = nearestSwatchInColumnRgb(grid, r, g, b, wrongCol);
  if (strength >= BRIGHTEN_HARD_SNAP_THRESHOLD) {
    return sanitizeKCandyArgb(tables, (a << 24) | target);
  }
  const t = strength / BRIGHTEN_HARD_SNAP_THRESHOLD;
  const tr = (target >>> 16) & 0xff;
  const tg = (target >>> 8) & 0xff;
  const tb = target & 0xff;
  const or = Math.round(r + (tr - r) * t);
  const og = Math.round(g + (tg - g) * t);
  const ob = Math.round(b + (tb - b) * t);
  return sanitizeKCandyArgb(tables, (a << 24) | (or << 16) | (og << 8) | ob);
}

export function sanitizeKCandyPixel(tables: KCandyPaletteTables, argb: number): number {
  return sanitizeKCandyArgb(tables, argb);
}

function rebuildKCandyExtremeBounds(grid: number[][], tables: KCandyPaletteTables): void {
  if (grid.length < 3) {
    tables.kCandyFloorRgb = 0x101010;
    tables.kCandyCeilRgb = 0xe8e8e8;
    return;
  }
  const first = 1;
  const rows = paletteRows(grid);
  const floorRow = rows <= 3 ? 0 : 1;
  const ceilRow = rows <= 1 ? 0 : rows <= 3 ? rows - 1 : rows - 2;
  tables.kCandyFloorRgb = grid[first]![floorRow]!;
  tables.kCandyCeilRgb = grid[first]![ceilRow]!;
}

function sanitizeKCandyArgb(tables: KCandyPaletteTables, argb: number): number {
  const a = (argb >>> 24) & 0xff;
  if (a === 0) return argb;
  return (a << 24) | sanitizeKCandyRgb(tables, argb & 0xffffff);
}

function sanitizeKCandyRgb(tables: KCandyPaletteTables, rgb: number): number {
  const r = (rgb >>> 16) & 0xff;
  const g = (rgb >>> 8) & 0xff;
  const b = rgb & 0xff;
  const { s, v } = rgbToHs(r, g, b);
  if (v <= BLACK_CLAMP_V) return tables.kCandyFloorRgb;
  if (v >= WHITE_CLAMP_V && s <= WHITE_CLAMP_SAT) return tables.kCandyCeilRgb;
  return rgb & 0xffffff;
}

function rowDeltaSnapKCandy(
  grid: number[][],
  tables: KCandyPaletteTables,
  r: number,
  g: number,
  b: number,
  rowDelta: number,
): number {
  if (grid.length < 3) return sanitizeKCandyRgb(tables, (r << 16) | (g << 8) | b);
  const cell = matchCellFast(grid, r, g, b);
  const rows = paletteRows(grid);
  const targetRow = clampChromaticRowIndex(cell[1]! + rowDelta, rows);
  return sanitizeKCandyRgb(tables, grid[cell[0]!]![targetRow]!);
}

function paletteRows(grid: number[][]): number {
  return grid[0]?.length ?? 0;
}

function paletteRowNorm(grid: number[][], r: number, g: number, b: number, rows: number): number {
  if (rows <= 1 || grid.length < 3) return 0;
  const cell = matchCellFast(grid, r, g, b);
  return clampChromaticRowIndex(cell[1]!, rows) / (rows - 1);
}

function clampChromaticRowIndex(row: number, rows: number): number {
  if (rows <= 1) return 0;
  if (rows <= 3) return Math.max(0, Math.min(rows - 1, row));
  return Math.max(1, Math.min(rows - 2, row));
}

function wrapChromaticColumn(grid: number[][], col: number, colShift: number): number {
  const first = 1;
  const last = grid.length - 2;
  const count = last - first + 1;
  if (count <= 0) return col;
  let idx = col - first + colShift;
  idx = ((idx % count) + count) % count;
  return first + idx;
}

function nearestSwatchInColumnRgb(grid: number[][], r: number, g: number, b: number, col: number): number {
  const colData = grid[col];
  if (!colData?.length) return (r << 16) | (g << 8) | b;
  let best = colData[0]!;
  let bestD = Number.POSITIVE_INFINITY;
  for (const rgb of colData) {
    const cr = (rgb >>> 16) & 0xff;
    const cg = (rgb >>> 8) & 0xff;
    const cb = rgb & 0xff;
    const dr = r - cr;
    const dg = g - cg;
    const db = b - cb;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = rgb;
    }
  }
  return best;
}

function matchCellFast(grid: number[][], r: number, g: number, b: number): [number, number] {
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

function clampRgb(grid: number[][], r: number, g: number, b: number): number {
  if (grid.length === 0) return -1;
  const { s, v } = rgbToHs(r, g, b);
  if (v <= BLACK_CLAMP_V) return grid[0]![0]!;
  if (v >= WHITE_CLAMP_V && s <= WHITE_CLAMP_SAT) return grid[grid.length - 1]![0]!;
  return -1;
}

function quantizeIndex(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
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
