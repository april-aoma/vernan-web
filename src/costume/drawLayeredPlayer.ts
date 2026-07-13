import { CAMERA_ZOOM } from "../specs";
import type { WorldCamera } from "../camera/WorldCamera";
import { drawJuicedImage, type JuiceDrawOpts } from "../render/JuiceDraw";
import { ownedPaletteEmpty } from "../vernan/OwnedPaletteRuntime";
import { VERNAN_BODY_PARTS, type VernanBodyPart } from "../vernan/VernanBodyPart";
import { vernanBodyLayerImage } from "../vernan/VernanBodyCompositor";
import type { VernanBodyLibrary } from "../vernan/VernanBodyLibrary";
import type { VernanBodyDrawContext } from "../vernan/VernanBodyDrawContext";
import { VernanFeetAnchor } from "../vernan/VernanFeetAnchor";
import { CostumeProfile } from "./CostumeProfile";
import type { CostumeArtCache } from "./CostumeArtCache";
import type { CostumeDrawConfig } from "./CostumeDrawConfig";
import type { CostumeState } from "./CostumeState";
import type { CostumeSlot } from "./CostumeSlot";
import type { CostumeLayersFile } from "../ranking/costumeResolve";

export type LayeredPlayerDrawOpts = {
  g: CanvasRenderingContext2D;
  camera: WorldCamera;
  centerX: number;
  feetWorldY: number;
  yOff: number;
  facing: number;
  juice: JuiceDrawOpts;
  profile: CostumeProfile;
  costumeState: CostumeState;
  frameIndex: number;
  animKey: string;
  bodyCtx: VernanBodyDrawContext;
  bodyLibrary: VernanBodyLibrary;
  artCache: CostumeArtCache;
  drawConfig: CostumeDrawConfig;
  layersFile: CostumeLayersFile;
  lemon: boolean;
  holdOverhead: boolean;
  feetAnchorBodyH: number;
  overlayBeforeTopmost?: () => void;
};

/**
 * Interleaved Vernan body + costume draw (Java drawLayeredVernanWithCostumes).
 */
export function drawLayeredVernanWithCostumes(opts: LayeredPlayerDrawOpts): void {
  drawCostumeSlot(opts, "BEHIND_BODY");

  drawBodyPart(opts, "base");
  drawCostumeSlot(opts, "AFTER_BASE");

  drawBodyPart(opts, "legs");
  drawCostumeSlot(opts, "AFTER_LEGS");

  drawBodyPart(opts, "arm");
  drawCostumeSlot(opts, "AFTER_ARM");

  drawBodyPart(opts, "hair");
  drawBodyPart(opts, "hat-hair");
  drawCostumeSlot(opts, "AFTER_HAIR");

  drawBodyPart(opts, "face");
  drawCostumeSlot(opts, "AFTER_FACE");

  opts.overlayBeforeTopmost?.();
  drawCostumeSlot(opts, "TOPMOST");
}

function drawBodyPart(opts: LayeredPlayerDrawOpts, part: VernanBodyPart): void {
  const layer = vernanBodyLayerImage(
    opts.bodyLibrary,
    opts.animKey,
    opts.frameIndex,
    part,
    opts.bodyCtx,
  );
  drawCostumeFrame(
    opts.g,
    opts.camera,
    layer,
    opts.centerX,
    opts.feetWorldY,
    opts.yOff,
    opts.facing,
    opts.juice,
    opts.feetAnchorBodyH,
    opts.animKey,
  );
}

function drawCostumeSlot(opts: LayeredPlayerDrawOpts, slot: CostumeSlot): void {
  const {
    profile,
    costumeState,
    frameIndex,
    lemon,
    holdOverhead,
    artCache,
    drawConfig,
    layersFile,
    g,
    camera,
    centerX,
    feetWorldY,
    yOff,
    facing,
    juice,
    feetAnchorBodyH,
  } = opts;

  if (profile.isEmpty() || artCache.empty) return;

  for (const layer of layersFile.layers) {
    if (!profile.owns(layer.itemId)) continue;
    const routing = artCache.routingFor(layer.itemId, layer.folderName);
    if (routing.parts.length > 0) {
      for (const route of routing.parts) {
        const routeSlot = CostumeProfile.slotForPart(
          layer.itemId,
          layer.folderName,
          route,
          drawConfig,
        );
        if (routeSlot !== slot) continue;
        const frame = artCache.frame(
          layer.folderName,
          costumeState,
          frameIndex,
          lemon,
          holdOverhead,
          route.fileToken,
        );
        drawCostumeFrame(
          g,
          camera,
          frame,
          centerX,
          feetWorldY,
          yOff,
          facing,
          juice,
          feetAnchorBodyH,
          opts.animKey,
        );
      }
      continue;
    }
    const layerSlot = CostumeProfile.slotFor(
      layer.itemId,
      layer.folderName,
      costumeState,
      drawConfig,
    );
    if (layerSlot !== slot || !routing.legacyMonolithic) continue;
    const frame = artCache.frame(
      layer.folderName,
      costumeState,
      frameIndex,
      lemon,
      holdOverhead,
      null,
    );
    drawCostumeFrame(
      g,
      camera,
      frame,
      centerX,
      feetWorldY,
      yOff,
      facing,
      juice,
      feetAnchorBodyH,
      opts.animKey,
    );
  }
}

function drawCostumeFrame(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  image: ImageBitmap | null,
  centerX: number,
  feetWorldY: number,
  yOff: number,
  facing: number,
  juice: JuiceDrawOpts,
  feetAnchorBodyH: number,
  layoutAnimKey = "",
): void {
  if (!image) return;
  const sw = image.width;
  const sh = image.height;
  const standBottomLeft = VernanFeetAnchor.usesStandBottomLeftLayout(layoutAnimKey);
  const anchorH = standBottomLeft
    ? VernanFeetAnchor.feetRowPx(layoutAnimKey, sh)
    : feetAnchorBodyH > 0
      ? feetAnchorBodyH
      : sh;
  // Java VernanFeetAnchor.canvasWorldOriginX(playerOrigin, w, …) — reconstruct origin from center.
  const playerW = VernanFeetAnchor.STAND_SPRITE_W_PX;
  const playerOriginX = centerX - playerW * 0.5;
  const left = VernanFeetAnchor.canvasWorldOriginX(
    playerOriginX,
    playerW,
    sw,
    facing,
    layoutAnimKey,
  );
  // Java worldSpriteTopDeviceY(feet + yOff, anchorH) then +shake in device space.
  const dx = camera.worldToDeviceX(left);
  const dy = camera.worldSpriteTopDeviceY(feetWorldY + yOff, anchorH);
  const dw = Math.floor(CAMERA_ZOOM * sw);
  const dh = Math.floor(CAMERA_ZOOM * sh);

  const hasJuice =
    !ownedPaletteEmpty(juice.ownedPalette) ||
    juice.solidRed ||
    (juice.hurtTintAlpha ?? 0) > 0 ||
    juice.tintRgb != null ||
    (juice.shakeX ?? 0) !== 0 ||
    (juice.shakeY ?? 0) !== 0 ||
    (juice.scaleX ?? 1) !== 1 ||
    (juice.scaleY ?? 1) !== 1;

  if (hasJuice) {
    drawJuicedImage(
      g,
      image,
      0,
      0,
      sw,
      sh,
      { x1: dx, y1: dy, x2: dx + dw, y2: dy + dh },
      facing,
      juice,
    );
    return;
  }

  g.imageSmoothingEnabled = false;
  if (facing >= 0) {
    g.drawImage(image, dx, dy, dw, dh);
  } else {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(image, 0, 0, dw, dh);
    g.restore();
  }
}

/** Draw body parts only (no costumes). */
export function drawLayeredVernanBodyOnly(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  bodyLibrary: VernanBodyLibrary,
  animKey: string,
  frameIndex: number,
  bodyCtx: VernanBodyDrawContext,
  centerX: number,
  feetWorldY: number,
  facing: number,
  juice: JuiceDrawOpts,
  parts: readonly VernanBodyPart[] = VERNAN_BODY_PARTS,
  feetAnchorBodyH = 0,
): void {
  for (const part of parts) {
    const layer = vernanBodyLayerImage(bodyLibrary, animKey, frameIndex, part, bodyCtx);
    drawCostumeFrame(
      g,
      camera,
      layer,
      centerX,
      feetWorldY,
      0,
      facing,
      juice,
      feetAnchorBodyH,
      animKey,
    );
  }
}
