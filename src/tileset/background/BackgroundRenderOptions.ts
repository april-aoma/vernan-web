import type { BackgroundRenderCache } from "./BackgroundRenderCache";

/** Tunables for BackgroundRendererV3.render. */

export enum Quality {
  /** Full-quality sampling. */
  FULL = "FULL",
  /** Editor preview: half internal resolution, upscale into device-sized target. */
  FAST = "FAST",
}

export class BackgroundRenderOptions {
  quality: Quality = Quality.FULL;
  cache: BackgroundRenderCache | null = null;
  /**
   * Preset / distortion coordinates are authored in device pixels (VIEWPORT_W×VIEWPORT_H).
   * pixelScale matches GamePanel CAMERA_ZOOM.
   */
  pixelScale = 1;
  /**
   * When true, the render target is already world-sized (device / pixelScale);
   * output is not upscaled inside the renderer (caller scales on blit).
   */
  worldPixelBuffer = false;
  /**
   * When non-null, length renderW * renderH. true = skip pixel (covered by opaque tiles).
   */
  occlusionMask: boolean[] | null = null;

  withQuality(q: Quality): this {
    this.quality = q;
    return this;
  }

  withCache(c: BackgroundRenderCache | null): this {
    this.cache = c;
    return this;
  }

  withPixelScale(scale: number): this {
    this.pixelScale = Math.max(1, scale);
    return this;
  }

  withWorldPixelBuffer(on: boolean): this {
    this.worldPixelBuffer = on;
    return this;
  }

  withOcclusionMask(mask: boolean[] | null): this {
    this.occlusionMask = mask;
    return this;
  }

  /** In-game: full-quality math on the world-pixel grid (caller upscales pixelScale× on blit). */
  static worldPixels(pixelScale: number, cache: BackgroundRenderCache | null = null): BackgroundRenderOptions {
    return new BackgroundRenderOptions()
      .withQuality(Quality.FULL)
      .withPixelScale(pixelScale)
      .withWorldPixelBuffer(true)
      .withCache(cache);
  }

  static full(): BackgroundRenderOptions {
    return new BackgroundRenderOptions().withQuality(Quality.FULL);
  }

  static fast(cache: BackgroundRenderCache | null = null): BackgroundRenderOptions {
    return new BackgroundRenderOptions().withQuality(Quality.FAST).withPixelScale(2).withCache(cache);
  }
}
