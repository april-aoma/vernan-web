import { asList, mapList, num, str, type JsonMap } from "./jsonMaps";
import {
  type ArgbBuffer,
  copyPixels,
  createArgb,
  ensureArgb,
  fillBlack,
  floorDiv,
  floorMod,
} from "./BackgroundPixelBuffers";
import { compositeOnto } from "./BackgroundLayerBlend";
import * as BackgroundLayerFrames from "./BackgroundLayerFrames";
import type { BackgroundRenderCache } from "./BackgroundRenderCache";
import { BackgroundRenderOptions, Quality } from "./BackgroundRenderOptions";
import type { BackgroundSprite } from "./BackgroundSprite";
import {
  parse as parseDistortion,
  type Distortion,
} from "./BackgroundSpatialDistortion";
import { VIEWPORT_H, VIEWPORT_W, worldViewportH, worldViewportW } from "./viewport";

export { VIEWPORT_W, VIEWPORT_H, worldViewportW, worldViewportH };

type ResolvedLayer = {
  sprite: BackgroundSprite;
  frameW: number;
  frameH: number;
  frameCount: number;
  frameMode: string;
  frameIndex: number;
  animateFrames: number[];
  animateTicksPerFrame: number;
  animateLoop: boolean;
  opacity: number;
  blend: string;
  zIndex: number;
  originX: number;
  originY: number;
  spatialDistortions: Distortion[];
};

/**
 * Renders .preset.json background layers: cardinal tiling, optional dual-frame checkerboard,
 * scroll + camera parallax, and a stack of spatial distortions.
 */
export function render(
  preset: JsonMap,
  spritesById: ReadonlyMap<string, BackgroundSprite> | Record<string, BackgroundSprite>,
  target: ArgbBuffer,
  cameraXSubpx: number,
  cameraYSubpx: number,
  simTick: number,
  soloLayerListIndex = -1,
  options: BackgroundRenderOptions | null = null,
): void {
  if (!target) return;
  const opts = options ?? BackgroundRenderOptions.full();
  const targetW = target.width;
  const targetH = target.height;
  let scale = Math.max(1, opts.pixelScale);
  if (opts.quality === Quality.FAST && !opts.worldPixelBuffer && scale <= 1) {
    scale = 2;
  }

  let renderW: number;
  let renderH: number;
  let upscaleToTarget: boolean;
  if (opts.worldPixelBuffer) {
    renderW = targetW;
    renderH = targetH;
    upscaleToTarget = false;
  } else {
    renderW = Math.max(1, (targetW / scale) | 0);
    renderH = Math.max(1, (targetH / scale) | 0);
    upscaleToTarget = scale > 1 && (renderW !== targetW || renderH !== targetH);
  }

  const cache = opts.cache;
  let accum: ArgbBuffer;
  if (
    !upscaleToTarget &&
    cache == null &&
    renderW === targetW &&
    renderH === targetH
  ) {
    accum = target;
  } else {
    accum = cache != null ? cache.accum(renderW, renderH) : ensureArgb(renderW, renderH, null);
  }
  fillBlack(accum);
  const accumPx = accum.px;

  const sprites = asSpriteMap(spritesById);
  const layerMaps = mapList(preset, "layers");
  const layers: ResolvedLayer[] = [];
  for (let i = 0; i < layerMaps.length; i++) {
    if (soloLayerListIndex >= 0 && i !== soloLayerListIndex) continue;
    const resolved = resolveLayer(i, layerMaps[i]!, sprites, cameraXSubpx, cameraYSubpx, simTick);
    if (resolved) layers.push(resolved);
  }
  layers.sort((a, b) => a.zIndex - b.zIndex);

  let skipMask = opts.occlusionMask;
  if (skipMask != null && skipMask.length < renderW * renderH) {
    skipMask = null;
  }

  for (const layer of layers) {
    drawLayer(accum, accumPx, renderW, renderH, scale, layer, simTick, cache, skipMask);
  }

  if (upscaleToTarget) {
    // Nearest-neighbor upscale into target
    fillBlack(target);
    const tw = targetW;
    const th = targetH;
    for (let dy = 0; dy < th; dy++) {
      const sy = Math.min(renderH - 1, ((dy * renderH) / th) | 0);
      const srcRow = sy * renderW;
      const dstRow = dy * tw;
      for (let dx = 0; dx < tw; dx++) {
        const sx = Math.min(renderW - 1, ((dx * renderW) / tw) | 0);
        target.px[dstRow + dx] = accumPx[srcRow + sx]!;
      }
    }
  } else if (accum !== target) {
    copyPixels(accum, target);
  }
}

export function detectFrameCount(img: { width: number; height: number } | null): number {
  if (img == null) return 1;
  const w = img.width;
  const h = img.height;
  if (h <= 0 || w < h) return 1;
  if (w % h !== 0) return 1;
  return (w / h) | 0;
}

export function detectFrameWidth(img: { width: number; height: number } | null): number {
  const fc = detectFrameCount(img);
  return img == null || fc <= 0 ? 16 : (img.width / fc) | 0;
}

export function detectFrameHeight(img: { width: number; height: number } | null): number {
  return img == null ? 16 : img.height;
}

function asSpriteMap(
  spritesById: ReadonlyMap<string, BackgroundSprite> | Record<string, BackgroundSprite>,
): Map<string, BackgroundSprite> {
  if (spritesById instanceof Map) return spritesById as Map<string, BackgroundSprite>;
  return new Map(Object.entries(spritesById));
}

function resolveLayer(
  layerListIndex: number,
  layer: JsonMap,
  spritesById: Map<string, BackgroundSprite>,
  cameraXSubpx: number,
  cameraYSubpx: number,
  simTick: number,
): ResolvedLayer | null {
  const spriteId = str(layer, "sprite", "");
  const sprite = spritesById.get(spriteId);
  if (!sprite) return null;
  const frameW = num(layer, "frameW", detectFrameWidth(sprite));
  const frameH = num(layer, "frameH", detectFrameHeight(sprite));
  const frameCount = num(layer, "frameCount", detectFrameCount(sprite));
  if (frameW <= 0 || frameH <= 0) return null;
  const frameMode = str(layer, "frameMode", "single");
  const frameIndex = num(layer, "frameIndex", 0);
  const animateFrames = BackgroundLayerFrames.parseAnimateFrames(layer, frameCount, frameIndex);
  const animateTicksPerFrame = BackgroundLayerFrames.ticksPerFrame(layer);
  const animateLoop = BackgroundLayerFrames.animateLoop(layer);
  const opacity = num(layer, "opacity", 255);
  const blend = str(layer, "blend", "normal");
  const zIndex = num(layer, "zIndex", 0);

  let ox = 0;
  let oy = 0;
  const spatial: Distortion[] = [];
  const transforms = asList(layer["transforms"]);
  if (transforms) {
    for (const to of transforms) {
      if (!to || typeof to !== "object" || Array.isArray(to)) continue;
      const tr = to as JsonMap;
      const kind = str(tr, "kind", "");
      switch (kind) {
        case "scroll": {
          const vx = num(tr, "vxSubpxPerTick", 0);
          const vy = num(tr, "vySubpxPerTick", 0);
          ox += (vx * simTick) >> 8;
          oy += (vy * simTick) >> 8;
          break;
        }
        case "cameraParallax": {
          const mulX = num(tr, "mulX", 256);
          const mulY = num(tr, "mulY", 256);
          ox += (cameraXSubpx * mulX) >> 16;
          oy += (cameraYSubpx * mulY) >> 16;
          break;
        }
        default: {
          const d = parseDistortion(tr, layerListIndex);
          if (d) spatial.push(d);
          break;
        }
      }
    }
  }
  return {
    sprite,
    frameW,
    frameH,
    frameCount,
    frameMode,
    frameIndex,
    animateFrames,
    animateTicksPerFrame,
    animateLoop,
    opacity,
    blend,
    zIndex,
    originX: ox,
    originY: oy,
    spatialDistortions: spatial,
  };
}

function drawLayer(
  dest: ArgbBuffer,
  destPx: Int32Array,
  w: number,
  h: number,
  pixelScale: number,
  layer: ResolvedLayer,
  simTick: number,
  cache: BackgroundRenderCache | null,
  skipMask: boolean[] | null,
): void {
  if (layer.spatialDistortions.length === 0) {
    drawLayerFlat(dest, destPx, w, h, pixelScale, layer, simTick, cache, skipMask);
    return;
  }
  drawLayerDistorted(dest, destPx, w, h, pixelScale, layer, simTick, cache, skipMask);
}

/** Scroll origins are in device pixels; tile placement uses buffer pixels when pixelScale > 1. */
function originForTilePlacement(originDevicePx: number, pixelScale: number): number {
  return pixelScale > 1 ? floorDiv(originDevicePx, pixelScale) : originDevicePx;
}

function drawLayerFlat(
  dest: ArgbBuffer,
  destPx: Int32Array,
  w: number,
  h: number,
  pixelScale: number,
  layer: ResolvedLayer,
  simTick: number,
  cache: BackgroundRenderCache | null,
  skipMask: boolean[] | null,
): void {
  const fw = layer.frameW;
  const fh = layer.frameH;
  const ox = originForTilePlacement(layer.originX, pixelScale);
  const oy = originForTilePlacement(layer.originY, pixelScale);
  const startTx = floorDiv(ox, fw) - 1;
  const endTx = floorDiv(ox + w, fw) + 1;
  const startTy = floorDiv(oy, fh) - 1;
  const endTy = floorDiv(oy + h, fh) + 1;

  const scratch = cache != null ? cache.layerScratch(w, h) : createArgb(w, h);
  // Match Java flat path: opaque black base, then SrcOver tile blit.
  fillBlack(scratch);
  const scratchPx = scratch.px;
  const sprite = layer.sprite;
  const spriteW = sprite.width;
  const spriteH = sprite.height;
  const spritePx = sprite.px;

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const frame = pickFrame(layer, tx, ty, simTick);
      const sx0 = frame * fw;
      if (sx0 + fw > spriteW || fh > spriteH) continue;
      const dx0 = tx * fw - ox;
      const dy0 = ty * fh - oy;
      for (let ly = 0; ly < fh; ly++) {
        const dy = dy0 + ly;
        if (dy < 0 || dy >= h) continue;
        const srcRow = ly * spriteW;
        const dstRow = dy * w;
        for (let lx = 0; lx < fw; lx++) {
          const dx = dx0 + lx;
          if (dx < 0 || dx >= w) continue;
          const src = spritePx[srcRow + sx0 + lx]!;
          const sa = (src >>> 24) & 255;
          if (sa === 0) continue; // SrcOver: leave black base
          if (sa === 255) {
            scratchPx[dstRow + dx] = src;
            continue;
          }
          // Partial alpha SrcOver onto current scratch pixel
          const di = dstRow + dx;
          const dst = scratchPx[di]!;
          const da = (dst >>> 24) & 255;
          const sr = (src >> 16) & 255;
          const sg = (src >> 8) & 255;
          const sb = src & 255;
          const dr = (dst >> 16) & 255;
          const dg = (dst >> 8) & 255;
          const db = dst & 255;
          const inv = 255 - sa;
          const na = sa + ((da * inv) / 255) | 0;
          const nr = ((sr * sa + dr * inv) / 255) | 0;
          const ng = ((sg * sa + dg * inv) / 255) | 0;
          const nb = ((sb * sa + db * inv) / 255) | 0;
          scratchPx[di] = ((na << 24) | (nr << 16) | (ng << 8) | nb) | 0;
        }
      }
    }
  }

  const alpha = Math.min(1, Math.max(0, layer.opacity / 255));
  compositeOnto(destPx, scratchPx, w, h, layer.blend, alpha, skipMask);
  void dest;
}

function drawLayerDistorted(
  dest: ArgbBuffer,
  destPx: Int32Array,
  w: number,
  h: number,
  pixelScale: number,
  layer: ResolvedLayer,
  simTick: number,
  cache: BackgroundRenderCache | null,
  skipMask: boolean[] | null,
): void {
  const fw = layer.frameW;
  const fh = layer.frameH;
  const oxDevice = layer.originX;
  const oyDevice = layer.originY;
  const ox = originForTilePlacement(oxDevice, pixelScale);
  const oy = originForTilePlacement(oyDevice, pixelScale);
  const sprite = layer.sprite;
  const spriteW = sprite.width;
  const spriteH = sprite.height;
  const spritePx =
    cache != null
      ? cache.spritePixels(sprite.id, sprite.bitmap, spriteW, spriteH)
      : sprite.px;

  const scratch = cache != null ? cache.layerScratch(w, h) : createArgb(w, h);
  const scratchPx = scratch.px;
  scratchPx.fill(0);

  const useMask = skipMask != null && skipMask.length >= w * h;
  const uv = new Float64Array(2);
  const sampleScale = Math.max(1, pixelScale);
  for (let sy = 0; sy < h; sy++) {
    const rowBase = sy * w;
    for (let sx = 0; sx < w; sx++) {
      const idx = rowBase + sx;
      if (useMask && skipMask![idx]) continue;
      uv[0] = (sx + 0.5) * sampleScale;
      uv[1] = (sy + 0.5) * sampleScale;
      for (const d of layer.spatialDistortions) {
        d.mapSample(uv, oxDevice, oyDevice, simTick);
      }
      const px =
        pixelScale > 1
          ? Math.round(uv[0]! / sampleScale) - ox
          : Math.round(uv[0]!) - ox;
      const py =
        pixelScale > 1
          ? Math.round(uv[1]! / sampleScale) - oy
          : Math.round(uv[1]!) - oy;
      const tileX = floorDiv(px, fw);
      const tileY = floorDiv(py, fh);
      const localX = floorMod(px, fw);
      const localY = floorMod(py, fh);
      if (localY < 0 || localY >= fh || localX < 0 || localX >= fw) continue;
      const frame = pickFrame(layer, tileX, tileY, simTick);
      const srcX = frame * fw + localX;
      if (srcX < 0 || srcX >= spriteW || localY < 0 || localY >= spriteH) continue;
      scratchPx[idx] = spritePx[srcX + localY * spriteW]!;
    }
  }

  const alpha = Math.min(1, Math.max(0, layer.opacity / 255));
  compositeOnto(destPx, scratchPx, w, h, layer.blend, alpha, skipMask);
  void dest;
}

function pickFrame(layer: ResolvedLayer, tileX: number, tileY: number, simTick: number): number {
  return BackgroundLayerFrames.pickFrame(
    layer.frameMode,
    layer.frameIndex,
    layer.frameCount,
    layer.animateFrames,
    layer.animateTicksPerFrame,
    layer.animateLoop,
    tileX,
    tileY,
    simTick,
  );
}
