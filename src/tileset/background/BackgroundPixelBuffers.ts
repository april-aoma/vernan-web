/**
 * ARGB packed pixel buffers — mirrors Java `BackgroundPixelBuffers`.
 * Packing: `(a << 24) | (r << 16) | (g << 8) | b` (same as Java TYPE_INT_ARGB).
 */

export type ArgbBuffer = {
  width: number;
  height: number;
  /** Packed ARGB ints (signed 32-bit, same bit pattern as Java int). */
  px: Int32Array;
};

export function createArgb(w: number, h: number): ArgbBuffer {
  return { width: w, height: h, px: new Int32Array(w * h) };
}

export function ensureArgb(w: number, h: number, reuse: ArgbBuffer | null | undefined): ArgbBuffer {
  if (reuse && reuse.width === w && reuse.height === h && reuse.px.length === w * h) {
    return reuse;
  }
  return createArgb(w, h);
}

export function fillBlack(buf: ArgbBuffer): void {
  buf.px.fill(0xff000000);
}

export function fillTransparent(buf: ArgbBuffer): void {
  buf.px.fill(0);
}

export function copyPixels(src: ArgbBuffer, dest: ArgbBuffer): void {
  dest.px.set(src.px.subarray(0, Math.min(src.px.length, dest.px.length)));
}

/** Convert canvas RGBA ImageData → packed ARGB Int32Array. */
export function rgbaToArgb(rgba: Uint8ClampedArray, out?: Int32Array): Int32Array {
  const n = (rgba.length / 4) | 0;
  const dest = out && out.length >= n ? out : new Int32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = rgba[j]!;
    const g = rgba[j + 1]!;
    const b = rgba[j + 2]!;
    const a = rgba[j + 3]!;
    dest[i] = ((a << 24) | (r << 16) | (g << 8) | b) | 0;
  }
  return dest;
}

/** Write packed ARGB into an ImageData (RGBA byte order). */
export function argbIntoImageData(px: Int32Array, imageData: ImageData): void {
  const rgba = imageData.data;
  const n = Math.min(px.length, (rgba.length / 4) | 0);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const c = px[i]!;
    rgba[j] = (c >>> 16) & 255;
    rgba[j + 1] = (c >>> 8) & 255;
    rgba[j + 2] = c & 255;
    rgba[j + 3] = (c >>> 24) & 255;
  }
}

/** Read ImageBitmap / CanvasImageSource into packed ARGB. */
export function readAllArgb(source: CanvasImageSource, width: number, height: number): Int32Array {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return new Int32Array(width * height);
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, width, height);
  return rgbaToArgb(data.data);
}

export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}
