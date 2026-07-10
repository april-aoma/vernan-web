/** Per-pixel compositing for BackgroundRendererV3 layers. */

export const MODE_LABELS = [
  "normal",
  "add",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color",
  "invert",
  "difference",
  "subtract",
] as const;

export function normalizeMode(blend: string | null | undefined): string {
  if (blend == null || blend.trim() === "") return "normal";
  switch (blend.toLowerCase()) {
    case "darker":
      return "darken";
    case "brighter":
      return "lighten";
    default:
      return blend.toLowerCase();
  }
}

export function compositeOnto(
  dest: Int32Array,
  src: Int32Array,
  w: number,
  h: number,
  blend: string,
  globalOpacity: number,
  skipMask: boolean[] | null = null,
): void {
  const mode = normalizeMode(blend);
  const go = Math.max(0, Math.min(1, globalOpacity));
  const count = w * h;
  if (skipMask == null || skipMask.length < count) {
    for (let i = 0; i < count; i++) {
      dest[i] = blendPixel(dest[i]!, src[i]!, go, mode);
    }
    return;
  }
  for (let i = 0; i < count; i++) {
    if (skipMask[i]) continue;
    dest[i] = blendPixel(dest[i]!, src[i]!, go, mode);
  }
}

/** Public entry for palette tooling. */
export function blendRgb(
  destArgb: number,
  srcArgb: number,
  globalOpacity: number,
  mode: string,
): number {
  return blendPixel(destArgb, srcArgb, globalOpacity, normalizeMode(mode));
}

function blendPixel(destArgb: number, srcArgb: number, globalOpacity: number, mode: string): number {
  let sa = (srcArgb >>> 24) & 255;
  if (sa === 0 || globalOpacity <= 0) return destArgb;
  sa = (sa * globalOpacity) | 0;
  if (sa === 0) return destArgb;
  const da = (destArgb >>> 24) & 255;
  const sr = (srcArgb >> 16) & 255;
  const sg = (srcArgb >> 8) & 255;
  const sb = srcArgb & 255;
  const dr = (destArgb >> 16) & 255;
  const dg = (destArgb >> 8) & 255;
  const db = destArgb & 255;
  const fa = sa / 255;

  let nr: number;
  let ng: number;
  let nb: number;
  switch (mode) {
    case "add":
      nr = clampAdd(dr, sr, fa);
      ng = clampAdd(dg, sg, fa);
      nb = clampAdd(db, sb, fa);
      break;
    case "multiply":
      nr = lerp(dr, ((dr * sr) / 255) | 0, fa);
      ng = lerp(dg, ((dg * sg) / 255) | 0, fa);
      nb = lerp(db, ((db * sb) / 255) | 0, fa);
      break;
    case "screen":
      nr = lerp(dr, 255 - ((((255 - dr) * (255 - sr)) / 255) | 0), fa);
      ng = lerp(dg, 255 - ((((255 - dg) * (255 - sg)) / 255) | 0), fa);
      nb = lerp(db, 255 - ((((255 - db) * (255 - sb)) / 255) | 0), fa);
      break;
    case "overlay":
      nr = lerp(dr, overlayChannel(dr, sr), fa);
      ng = lerp(dg, overlayChannel(dg, sg), fa);
      nb = lerp(db, overlayChannel(db, sb), fa);
      break;
    case "darken":
      nr = lerp(dr, Math.min(dr, sr), fa);
      ng = lerp(dg, Math.min(dg, sg), fa);
      nb = lerp(db, Math.min(db, sb), fa);
      break;
    case "lighten":
      nr = lerp(dr, Math.max(dr, sr), fa);
      ng = lerp(dg, Math.max(dg, sg), fa);
      nb = lerp(db, Math.max(db, sb), fa);
      break;
    case "color": {
      const destHsl = rgbToHsl(dr, dg, db);
      const srcHsl = rgbToHsl(sr, sg, sb);
      const rgb = hslToRgb(srcHsl[0]!, srcHsl[1]!, destHsl[2]!);
      nr = lerp(dr, rgb[0]!, fa);
      ng = lerp(dg, rgb[1]!, fa);
      nb = lerp(db, rgb[2]!, fa);
      break;
    }
    case "invert":
      nr = lerp(dr, 255 - dr, fa);
      ng = lerp(dg, 255 - dg, fa);
      nb = lerp(db, 255 - db, fa);
      break;
    case "difference":
      nr = lerp(dr, Math.abs(dr - sr), fa);
      ng = lerp(dg, Math.abs(dg - sg), fa);
      nb = lerp(db, Math.abs(db - sb), fa);
      break;
    case "subtract":
      nr = lerp(dr, Math.max(0, dr - sr), fa);
      ng = lerp(dg, Math.max(0, dg - sg), fa);
      nb = lerp(db, Math.max(0, db - sb), fa);
      break;
    default:
      nr = lerp(dr, sr, fa);
      ng = lerp(dg, sg, fa);
      nb = lerp(db, sb, fa);
      break;
  }
  let na = sa + (((da * (255 - sa)) / 255) | 0);
  na = Math.min(255, Math.max(0, na));
  return ((na << 24) | (nr << 16) | (ng << 8) | nb) | 0;
}

function overlayChannel(base: number, blend: number): number {
  if (base < 128) return ((2 * base * blend) / 255) | 0;
  return (255 - ((2 * (255 - base) * (255 - blend)) / 255)) | 0;
}

function lerp(base: number, blended: number, fa: number): number {
  return Math.round(base + (blended - base) * fa);
}

function clampAdd(base: number, add: number, fa: number): number {
  return Math.min(255, base + Math.round(add * fa));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, Math.max(gf, bf));
  const min = Math.min(rf, Math.min(gf, bf));
  let h = 0;
  let s: number;
  const l = (max + min) * 0.5;
  if (max === min) {
    s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let dh: number;
    if (max === rf) {
      dh = (gf - bf) / d + (gf < bf ? 6 : 0);
    } else if (max === gf) {
      dh = (bf - rf) / d + 2;
    } else {
      dh = (rf - gf) / d + 4;
    }
    h = dh / 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0) {
    const v = Math.max(0, Math.min(255, Math.round(l * 255)));
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hueToRgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, h) * 255);
  const b = Math.round(hueToRgb(p, q, h - 1 / 3) * 255);
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 0.5) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
