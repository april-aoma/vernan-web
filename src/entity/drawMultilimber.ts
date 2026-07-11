import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";
import { drawJuicedImage, type JuiceDrawOpts } from "../render/JuiceDraw";
import type { SpriteStrip } from "../render/SpriteDraw";
import {
  MULTILIMBER_PART_BODY,
  MULTILIMBER_PART_EYE,
  MULTILIMBER_PART_HEAD,
  type Multilimber,
} from "./Multilimber";

export type MultilimberPartSprites = {
  body: SpriteStrip | null;
  head: SpriteStrip | null;
  eye: SpriteStrip | null;
};

function mirrorHorizontalQuadSource(q: number): number {
  return (q & 1) === 0 ? q + 1 : q - 1;
}

function drawStripFeetPinnedDevice(
  g: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
  faceRight: boolean,
): void {
  g.imageSmoothingEnabled = false;
  if (faceRight) {
    g.drawImage(image, sx, sy, sw, sh, dx1, dy1, dx2 - dx1, dy2 - dy1);
  } else {
    g.save();
    g.translate(dx2, dy1);
    g.scale(-1, 1);
    g.drawImage(image, sx, sy, sw, sh, 0, 0, dx2 - dx1, dy2 - dy1);
    g.restore();
  }
}

function drawBodyQuadrants(
  g: CanvasRenderingContext2D,
  strip: SpriteStrip,
  frameIndex: number,
  faceRight: boolean,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
  ml: Multilimber,
): void {
  const fi = ((frameIndex % strip.frameCount) + strip.frameCount) % strip.frameCount;
  const frameSx = fi * strip.frameW;
  const sw = strip.frameW;
  const sh = strip.frameH;
  const midDevX = dx1 + Math.floor((dx2 - dx1) / 2);
  const midDevY = dy1 + Math.floor((dy2 - dy1) / 2);
  const midSrcX = Math.floor(sw / 2);
  const midSrcY = Math.floor(sh / 2);
  const quads: number[][] = [
    [dx1, dy1, midDevX, midDevY, frameSx, 0, frameSx + midSrcX, midSrcY],
    [midDevX, dy1, dx2, midDevY, frameSx + midSrcX, 0, frameSx + sw, midSrcY],
    [dx1, midDevY, midDevX, dy2, frameSx, midSrcY, frameSx + midSrcX, sh],
    [midDevX, midDevY, dx2, dy2, frameSx + midSrcX, midSrcY, frameSx + sw, sh],
  ];
  g.imageSmoothingEnabled = false;
  for (let q = 0; q < 4; q++) {
    if (ml.isBodyQuadrantHidden(q)) continue;
    const qd = quads[q]!;
    if (faceRight) {
      const sd = quads[mirrorHorizontalQuadSource(q)]!;
      const sx = sd[6]!;
      const sy = sd[5]!;
      const sw2 = sd[4]! - sd[6]!;
      const sh2 = sd[7]! - sd[5]!;
      g.drawImage(strip.image, sx, sy, sw2, sh2, qd[0]!, qd[1]!, qd[2]! - qd[0]!, qd[3]! - qd[1]!);
    } else {
      const sx = qd[4]!;
      const sy = qd[5]!;
      const sw2 = qd[6]! - qd[4]!;
      const sh2 = qd[7]! - qd[5]!;
      g.drawImage(strip.image, sx, sy, sw2, sh2, qd[0]!, qd[1]!, qd[2]! - qd[0]!, qd[3]! - qd[1]!);
    }
  }
}

/** Stacked body → head → eye with per-part squash and body quadrant cull (Java drawMultilimberDevice). */
export function drawMultilimber(
  g: CanvasRenderingContext2D,
  ml: Multilimber,
  camera: WorldCamera,
  parts: MultilimberPartSprites,
  juice: JuiceDrawOpts,
): void {
  if (!parts.body) {
    const rect = ml.rect();
    const dx = camera.worldToDeviceX(rect.x);
    const dy = camera.worldToDeviceY(rect.y);
    const dw = Math.max(1, Math.floor(CAMERA_ZOOM * rect.w));
    const dh = Math.max(1, Math.floor(CAMERA_ZOOM * rect.h));
    g.fillStyle = "#b43c78";
    g.fillRect(dx, dy, dw, dh);
    return;
  }

  const bodyStrip = parts.body;
  const fi = Math.max(0, Math.min(2, ml.getAnimFrame()));
  const sw = bodyStrip.frameW;
  const sh = bodyStrip.frameH;
  const dw = Math.floor(CAMERA_ZOOM * sw);
  const dh = Math.floor(CAMERA_ZOOM * sh);
  const feetY = Math.round(camera.worldToDeviceY(ml.spriteFeetWorldY()));
  const centerDevX = Math.round(camera.worldToDeviceX(ml.x + ml.rect().w * 0.5));
  const shakeDx = Math.round(CAMERA_ZOOM * (juice.shakeX ?? 0));
  const shakeDy = Math.round(CAMERA_ZOOM * (juice.shakeY ?? 0));

  let dx1 = centerDevX - Math.floor(dw / 2) + shakeDx;
  let dy2 = feetY + shakeDy;
  let dy1 = dy2 - dh;
  let dx2 = dx1 + dw;

  const squashX = juice.scaleX ?? 1;
  const squashY = juice.scaleY ?? 1;
  if (squashX !== 1 || squashY !== 1) {
    const cx = (dx1 + dx2) / 2;
    const halfW = Math.max(1, Math.floor(((dx2 - dx1) / 2) * squashX));
    const halfH = Math.max(1, Math.floor((dy2 - dy1) * squashY));
    dx1 = cx - halfW;
    dx2 = cx + halfW;
    dy1 = dy2 - halfH;
  }

  const faceRight = ml.facingHintVelX() >= 0;
  const drawOrder = [MULTILIMBER_PART_BODY, MULTILIMBER_PART_HEAD, MULTILIMBER_PART_EYE] as const;
  const strips = [parts.body, parts.head, parts.eye];

  for (let i = 0; i < drawOrder.length; i++) {
    const part = drawOrder[i]!;
    if (!ml.isPartDrawVisible(part)) continue;
    const strip = strips[part];
    if (!strip) continue;

    const partSquash = ml.partRenderSquash(part);
    const psx = partSquash.active() ? partSquash.scaleX() : 1;
    const psy = partSquash.active() ? partSquash.scaleY() : 1;
    const cx = (dx1 + dx2) / 2;
    const halfW = Math.max(1, Math.floor(((dx2 - dx1) / 2) * psx));
    const halfH = Math.max(1, Math.floor((dy2 - dy1) * psy));
    const pdx1 = cx - halfW;
    const pdx2 = cx + halfW;
    const pdy2 = dy2;
    const pdy1 = pdy2 - halfH;

    const frameSx = fi * strip.frameW;
    if (part === MULTILIMBER_PART_BODY && ml.hasActiveBodyQuadrantCull()) {
      drawBodyQuadrants(g, strip, fi, faceRight, pdx1, pdy1, pdx2, pdy2, ml);
      continue;
    }

    const needsJuice =
      juice.solidRed ||
      (juice.hurtTintAlpha ?? 0) > 0 ||
      juice.tintRgb != null;
    if (needsJuice) {
      drawJuicedImage(
        g,
        strip.image,
        frameSx,
        0,
        strip.frameW,
        strip.frameH,
        { x1: pdx1, y1: pdy1, x2: pdx2, y2: pdy2 },
        faceRight ? 1 : -1,
        juice,
      );
    } else {
      drawStripFeetPinnedDevice(
        g,
        strip.image,
        frameSx,
        0,
        strip.frameW,
        strip.frameH,
        pdx1,
        pdy1,
        pdx2,
        pdy2,
        faceRight,
      );
    }
  }
}
