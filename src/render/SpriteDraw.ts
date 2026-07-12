import { CAMERA_ZOOM } from "../specs";
import type { WorldCamera } from "../camera/WorldCamera";
import { drawJuicedImage, type JuiceDrawOpts } from "./JuiceDraw";

/** Horizontal strip sheet (equal-width frames). */
export type SpriteStrip = {
  image: ImageBitmap;
  frameW: number;
  frameH: number;
  frameCount: number;
};

export function stripFromImage(image: ImageBitmap, frameCount: number): SpriteStrip {
  const frameW = Math.max(1, Math.floor(image.width / Math.max(1, frameCount)));
  return {
    image,
    frameW,
    frameH: image.height,
    frameCount: Math.max(1, frameCount),
  };
}

export function drawStripFrame(
  g: CanvasRenderingContext2D,
  strip: SpriteStrip,
  frameIndex: number,
  worldLeft: number,
  worldTop: number,
  facing: number,
  camera: WorldCamera,
  juice?: JuiceDrawOpts,
): void {
  const fi = ((frameIndex % strip.frameCount) + strip.frameCount) % strip.frameCount;
  const sx = fi * strip.frameW;
  const dx = camera.worldToDeviceX(worldLeft);
  const dy = camera.worldToDeviceY(worldTop);
  blitStripFrame(g, strip, sx, dx, dy, facing, juice);
}

/**
 * Feet-pinned strip draw: pin sprite bottom to {@code feetWorldY} via
 * {@link WorldCamera.worldSpriteTopDeviceY} (Java anti-shimmer).
 */
export function drawStripFrameFeetPinned(
  g: CanvasRenderingContext2D,
  strip: SpriteStrip,
  frameIndex: number,
  worldLeft: number,
  feetWorldY: number,
  facing: number,
  camera: WorldCamera,
  juice?: JuiceDrawOpts,
  feetAnchorHeightWorldPx: number = strip.frameH,
): void {
  const fi = ((frameIndex % strip.frameCount) + strip.frameCount) % strip.frameCount;
  const sx = fi * strip.frameW;
  const dx = camera.worldToDeviceX(worldLeft);
  const dy = camera.worldSpriteTopDeviceY(feetWorldY, feetAnchorHeightWorldPx);
  blitStripFrame(g, strip, sx, dx, dy, facing, juice);
}

function blitStripFrame(
  g: CanvasRenderingContext2D,
  strip: SpriteStrip,
  sx: number,
  dx: number,
  dy: number,
  facing: number,
  juice?: JuiceDrawOpts,
): void {
  const dw = Math.floor(CAMERA_ZOOM * strip.frameW);
  const dh = Math.floor(CAMERA_ZOOM * strip.frameH);
  if (juice && (juice.solidRed || (juice.hurtTintAlpha ?? 0) > 0 || juice.tintRgb != null || juice.shakeX || juice.shakeY || (juice.scaleX ?? 1) !== 1 || (juice.scaleY ?? 1) !== 1)) {
    drawJuicedImage(
      g,
      strip.image,
      sx,
      0,
      strip.frameW,
      strip.frameH,
      { x1: dx, y1: dy, x2: dx + dw, y2: dy + dh },
      facing,
      juice,
    );
    return;
  }
  g.imageSmoothingEnabled = false;
  if (facing >= 0) {
    g.drawImage(strip.image, sx, 0, strip.frameW, strip.frameH, dx, dy, dw, dh);
  } else {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(strip.image, sx, 0, strip.frameW, strip.frameH, 0, 0, dw, dh);
    g.restore();
  }
}

/** Feet-pinned: bottom of sprite at feetWorldY, horizontally centered on centerX. */
export function drawFeetPinnedStrip(
  g: CanvasRenderingContext2D,
  strip: SpriteStrip,
  frameIndex: number,
  centerX: number,
  feetWorldY: number,
  facing: number,
  camera: WorldCamera,
  juice?: JuiceDrawOpts,
  feetAnchorHeightWorldPx: number = strip.frameH,
): void {
  const left = centerX - strip.frameW * 0.5;
  drawStripFrameFeetPinned(
    g,
    strip,
    frameIndex,
    left,
    feetWorldY,
    facing,
    camera,
    juice,
    feetAnchorHeightWorldPx,
  );
}

/**
 * Device-space draw: pin {@code feetRowWorldPx} in the source cel to {@code feetDevY}
 * (Java drawFeetRowAnchoredSpriteDevice — used by level-transition climb/strip).
 */
export function drawFeetRowAnchoredStripDevice(
  g: CanvasRenderingContext2D,
  strip: SpriteStrip,
  frameIndex: number,
  centerDevX: number,
  feetDevY: number,
  facing: number,
  feetRowWorldPx: number,
): void {
  const fi = ((frameIndex % strip.frameCount) + strip.frameCount) % strip.frameCount;
  const sx = fi * strip.frameW;
  const sw = strip.frameW;
  const sh = strip.frameH;
  const dw = Math.floor(CAMERA_ZOOM * sw);
  const dh = Math.floor(CAMERA_ZOOM * sh);
  const feetRowDev = Math.floor(CAMERA_ZOOM * feetRowWorldPx);
  const dx = Math.round(centerDevX - dw * 0.5);
  const dy = feetDevY - feetRowDev;
  g.imageSmoothingEnabled = false;
  if (facing >= 0) {
    g.drawImage(strip.image, sx, 0, sw, sh, dx, dy, dw, dh);
  } else {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(strip.image, sx, 0, sw, sh, 0, 0, dw, dh);
    g.restore();
  }
}

/** Single full image (idle/crouch), feet-pinned. */
export function drawFeetPinnedImage(
  g: CanvasRenderingContext2D,
  image: ImageBitmap,
  centerX: number,
  feetWorldY: number,
  facing: number,
  camera: WorldCamera,
  juice?: JuiceDrawOpts,
): void {
  const left = centerX - image.width * 0.5;
  const dx = camera.worldToDeviceX(left);
  const dy = camera.worldSpriteTopDeviceY(feetWorldY, image.height);
  const dw = Math.floor(CAMERA_ZOOM * image.width);
  const dh = Math.floor(CAMERA_ZOOM * image.height);
  if (juice && (juice.solidRed || (juice.hurtTintAlpha ?? 0) > 0 || juice.tintRgb != null || juice.shakeX || juice.shakeY || (juice.scaleX ?? 1) !== 1 || (juice.scaleY ?? 1) !== 1)) {
    drawJuicedImage(
      g,
      image,
      0,
      0,
      image.width,
      image.height,
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

/**
 * Attack body (32×32) + optional sword overlay (48×32 = body+16 right extension).
 * Java drawAttackLayer: overlay left aligns with body left when facing right;
 * facing left mirrors and shifts destination −16 so the extension sits on the left.
 */
export function drawAttackComposite(
  g: CanvasRenderingContext2D,
  body: SpriteStrip,
  sword: SpriteStrip | null,
  frameIndex: number,
  hitboxLeft: number,
  hitboxW: number,
  feetWorldY: number,
  facing: number,
  camera: WorldCamera,
  juice?: JuiceDrawOpts,
  stickCentered = false,
  shield: SpriteStrip | null = null,
): void {
  const bodyW = body.frameW;
  const bodyLeft = hitboxLeft + hitboxW * 0.5 - bodyW * 0.5;
  drawStripFrameFeetPinned(g, body, frameIndex, bodyLeft, feetWorldY, facing, camera, juice);

  const overlayJuice = juice
    ? { ...juice, solidRed: false, hurtTintAlpha: 0 }
    : undefined;

  if (shield) {
    // Body-sized (32×32) — unlike sword, no left-facing −16 extension shift.
    drawStripFrameFeetPinned(
      g,
      shield,
      frameIndex,
      bodyLeft,
      feetWorldY,
      facing,
      camera,
      overlayJuice,
    );
  }

  if (!sword) return;
  const overlayLeft = stickCentered
    ? bodyLeft + bodyW * 0.5 - sword.frameW * 0.5
    : facing >= 0
      ? bodyLeft
      : bodyLeft - 16;
  drawStripFrameFeetPinned(
    g,
    sword,
    frameIndex,
    overlayLeft,
    feetWorldY,
    facing,
    camera,
    overlayJuice,
  );
}
