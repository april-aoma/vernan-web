import { CAMERA_ZOOM, INTERNAL_WIDTH, WORLD_VIEWPORT_H } from "../../specs";
import type { BackgroundPresetRegistry } from "./BackgroundPresetRegistry";
import {
  argbIntoImageData,
  createArgb,
  ensureArgb,
  type ArgbBuffer,
} from "./BackgroundPixelBuffers";
import { BackgroundRenderCache } from "./BackgroundRenderCache";
import { BackgroundRenderOptions } from "./BackgroundRenderOptions";
import { render as renderBackground } from "./BackgroundRendererV3";
import {
  ensureOcclusionMask,
  fillRoomBackgroundOcclusionMask,
  type CameraTxTy,
} from "./occlusionMask";
import type { TileMap } from "../../world/TileMap";

export type DrawRoomMathBackgroundOpts = {
  registry: BackgroundPresetRegistry;
  presetId: string;
  /** Camera transform (device-space tx/ty from WorldCamera). */
  camera: CameraTxTy;
  /** Animation time in seconds; simTick = floor(timeSec * 60). */
  timeSec: number;
  /** Device viewport height above HUD (default WORLD_VIEWPORT_H). */
  deviceViewH?: number;
  /** Device viewport width (default INTERNAL_WIDTH). */
  deviceViewW?: number;
  pixelScale?: number;
  /** Optional tile map for occlusion (true = skip). */
  map?: TileMap | null;
  /** Optional foreground prop/deco cell keys (`"tx,ty"`). */
  foregroundPropCells?: ReadonlySet<string> | null;
  /** Reusable buffers — pass the same object across frames. */
  buffers?: RoomMathBackgroundBuffers;
};

export type RoomMathBackgroundBuffers = {
  frame: ArgbBuffer | null;
  imageData: ImageData | null;
  occlusionMask: boolean[] | null;
  cache: BackgroundRenderCache;
};

export function createRoomMathBackgroundBuffers(): RoomMathBackgroundBuffers {
  return {
    frame: null,
    imageData: null,
    occlusionMask: null,
    cache: new BackgroundRenderCache(),
  };
}

/**
 * Render Earthbound-style math background into an offscreen world-pixel buffer,
 * then blit nearest-neighbor upscaled to device size onto `g`.
 *
 * Matches GamePanel.drawRoomMathBackground:
 * - bgWorldW = deviceViewW / pixelScale, bgWorldH = deviceViewH / pixelScale
 * - camWorld from (deviceCenter - camera.tx/ty) / CAMERA_ZOOM
 * - camera subpx = round(camWorld * 256)
 * - simTick = floor(timeSec * 60)
 * - BackgroundRenderOptions.worldPixels(pixelScale)
 */
export function drawRoomMathBackground(
  g: CanvasRenderingContext2D,
  opts: DrawRoomMathBackgroundOpts,
): void {
  const preset = opts.registry.preset(opts.presetId);
  if (!preset) return;

  const deviceViewW = opts.deviceViewW ?? INTERNAL_WIDTH;
  const deviceViewH = opts.deviceViewH ?? WORLD_VIEWPORT_H;
  const pixelScale = Math.max(1, opts.pixelScale ?? CAMERA_ZOOM);
  const bgWorldW = Math.max(1, (deviceViewW / pixelScale) | 0);
  const bgWorldH = Math.max(1, (deviceViewH / pixelScale) | 0);

  const buffers = opts.buffers ?? createRoomMathBackgroundBuffers();
  buffers.frame = ensureArgb(bgWorldW, bgWorldH, buffers.frame);

  const camWorldX = (deviceViewW * 0.5 - opts.camera.tx) / CAMERA_ZOOM;
  const camWorldY = (deviceViewH * 0.5 - opts.camera.ty) / CAMERA_ZOOM;
  const cameraXSubpx = Math.round(camWorldX * 256.0);
  const cameraYSubpx = Math.round(camWorldY * 256.0);
  const simTick = Math.floor(opts.timeSec * 60.0);

  buffers.occlusionMask = ensureOcclusionMask(buffers.occlusionMask, bgWorldW, bgWorldH);
  fillRoomBackgroundOcclusionMask(
    buffers.occlusionMask,
    opts.camera,
    opts.map ?? null,
    bgWorldW,
    bgWorldH,
    deviceViewW,
    deviceViewH,
    CAMERA_ZOOM,
    opts.foregroundPropCells ?? null,
  );

  const renderOpts = BackgroundRenderOptions.worldPixels(pixelScale, buffers.cache).withOcclusionMask(
    buffers.occlusionMask,
  );

  renderBackground(
    preset,
    opts.registry.sprites,
    buffers.frame,
    cameraXSubpx,
    cameraYSubpx,
    simTick,
    -1,
    renderOpts,
  );

  if (
    buffers.imageData == null ||
    buffers.imageData.width !== bgWorldW ||
    buffers.imageData.height !== bgWorldH
  ) {
    buffers.imageData = new ImageData(bgWorldW, bgWorldH);
  }
  argbIntoImageData(buffers.frame.px, buffers.imageData);

  const prevSmooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  // putImageData then scale via temporary canvas for nearest-neighbor upscale
  const tmp = getBlitCanvas(bgWorldW, bgWorldH);
  const tctx = tmp.getContext("2d")!;
  tctx.putImageData(buffers.imageData, 0, 0);
  g.drawImage(tmp, 0, 0, bgWorldW, bgWorldH, 0, 0, deviceViewW, deviceViewH);
  g.imageSmoothingEnabled = prevSmooth;
}

let blitCanvas: HTMLCanvasElement | null = null;

function getBlitCanvas(w: number, h: number): HTMLCanvasElement {
  if (!blitCanvas) blitCanvas = document.createElement("canvas");
  if (blitCanvas.width !== w || blitCanvas.height !== h) {
    blitCanvas.width = w;
    blitCanvas.height = h;
  }
  return blitCanvas;
}

/** Lower-level: render into an ArgbBuffer without blitting (for custom wiring). */
export function renderRoomMathBackgroundBuffer(
  registry: BackgroundPresetRegistry,
  presetId: string,
  target: ArgbBuffer,
  cameraXSubpx: number,
  cameraYSubpx: number,
  simTick: number,
  pixelScale: number,
  cache: BackgroundRenderCache | null = null,
  occlusionMask: boolean[] | null = null,
): void {
  const preset = registry.preset(presetId);
  if (!preset) {
    target.px.fill(0xff000000);
    return;
  }
  const opts = BackgroundRenderOptions.worldPixels(pixelScale, cache).withOcclusionMask(occlusionMask);
  renderBackground(
    preset,
    registry.sprites,
    target,
    cameraXSubpx,
    cameraYSubpx,
    simTick,
    -1,
    opts,
  );
}

export { createArgb, ensureArgb };
