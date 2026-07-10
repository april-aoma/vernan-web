import {
  type ArgbBuffer,
  ensureArgb,
  readAllArgb,
} from "./BackgroundPixelBuffers";

/**
 * Reusable render buffers for BackgroundRendererV3.
 * One instance per editor preview or game viewport — not thread-safe.
 */
export class BackgroundRenderCache {
  private accumBuf: ArgbBuffer | null = null;
  private layerScratchBuf: ArgbBuffer | null = null;
  private spritePixelsCache: Int32Array | null = null;
  private spriteSourceKey: string | null = null;

  accum(w: number, h: number): ArgbBuffer {
    this.accumBuf = ensureArgb(w, h, this.accumBuf);
    return this.accumBuf;
  }

  layerScratch(w: number, h: number): ArgbBuffer {
    this.layerScratchBuf = ensureArgb(w, h, this.layerScratchBuf);
    return this.layerScratchBuf;
  }

  /**
   * Cached ARGB pixels for a sprite. `key` should uniquely identify the sprite
   * (e.g. sprite id string). Pass the ImageBitmap/canvas source for first read.
   */
  spritePixels(
    key: string,
    source: CanvasImageSource,
    width: number,
    height: number,
  ): Int32Array {
    if (this.spritePixelsCache == null || this.spriteSourceKey !== key) {
      this.spritePixelsCache = readAllArgb(source, width, height);
      this.spriteSourceKey = key;
    }
    return this.spritePixelsCache;
  }
}
