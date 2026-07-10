/**
 * Earthbound-style math room backgrounds — TypeScript port of Java
 * `game.tileset.v3.runtime.Background*`.
 *
 * ## Wiring (mount.ts)
 *
 * ```ts
 * import {
 *   BackgroundPresetRegistry,
 *   drawRoomMathBackground,
 *   createRoomMathBackgroundBuffers,
 * } from "./tileset/background";
 *
 * // once at load:
 * const bgRegistry = await BackgroundPresetRegistry.load(assets);
 * const bgBuffers = createRoomMathBackgroundBuffers();
 * // per room: pickBossPresetId(contentSeed) / pickSecretPresetId(contentSeed)
 *
 * // each frame, before tiles:
 * drawRoomMathBackground(g, {
 *   registry: bgRegistry,
 *   presetId,
 *   camera: { tx: camera.tx, ty: camera.ty },
 *   timeSec: decorationAnimTime,
 *   map: roomMap,
 *   buffers: bgBuffers,
 * });
 * ```
 *
 * Specs: INTERNAL_WIDTH=512, WORLD_VIEWPORT_H=256, CAMERA_ZOOM=2
 * → bgWorldW=256, bgWorldH=128 with worldPixels(2).
 */

export { BackgroundPresetRegistry } from "./BackgroundPresetRegistry";
export {
  copyPreset,
  isolateLayerTransforms,
} from "./BackgroundPresetNormalize";
export {
  render,
  detectFrameCount,
  detectFrameWidth,
  detectFrameHeight,
  VIEWPORT_W,
  VIEWPORT_H,
  worldViewportW,
  worldViewportH,
} from "./BackgroundRendererV3";
export { BackgroundRenderOptions, Quality } from "./BackgroundRenderOptions";
export { BackgroundRenderCache } from "./BackgroundRenderCache";
export {
  compositeOnto,
  normalizeMode,
  blendRgb,
  MODE_LABELS,
} from "./BackgroundLayerBlend";
export {
  pickFrame,
  parseAnimateFrames,
  ticksPerFrame,
  animateLoop,
} from "./BackgroundLayerFrames";
export {
  parse as parseSpatialDistortion,
  isSpatialKind,
  normalizeSpatialKind,
  SPATIAL_KINDS,
  defaultPhaseOffset,
  type Distortion,
} from "./BackgroundSpatialDistortion";
export {
  type ArgbBuffer,
  createArgb,
  ensureArgb,
  fillBlack,
  argbIntoImageData,
  readAllArgb,
  rgbaToArgb,
} from "./BackgroundPixelBuffers";
export type { BackgroundSprite } from "./BackgroundSprite";
export type { JsonMap } from "./jsonMaps";
export {
  fillRoomBackgroundOcclusionMask,
  ensureOcclusionMask,
  cellKey,
  type CameraTxTy,
} from "./occlusionMask";
export {
  drawRoomMathBackground,
  createRoomMathBackgroundBuffers,
  renderRoomMathBackgroundBuffer,
  type DrawRoomMathBackgroundOpts,
  type RoomMathBackgroundBuffers,
} from "./drawRoomMathBackground";
