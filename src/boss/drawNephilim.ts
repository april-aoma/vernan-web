import type { Nephilim } from "../entity/Nephilim";
import { getNephilimRig } from "./NephilimRig";
import { drawStripFrame, type SpriteStrip } from "../render/SpriteDraw";
import { drawJuicedImage, type JuiceDrawOpts } from "../render/JuiceDraw";
import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";

export type NephilimDrawAssets = {
  strip: SpriteStrip | null;
};

function drawPartRender(
  g: CanvasRenderingContext2D,
  strip: SpriteStrip,
  pr: {
    frame: number;
    cx: number;
    cy: number;
    angleRad: number;
    mirror: boolean;
    pivotX: number;
    pivotY: number;
    armGuardGlowAlpha: number;
  },
  camera: WorldCamera,
  juice?: JuiceDrawOpts,
): void {
  const facing = pr.mirror ? -1 : 1;
  const fi = ((pr.frame % strip.frameCount) + strip.frameCount) % strip.frameCount;
  const sx = fi * strip.frameW;
  const sw = strip.frameW;
  const sh = strip.frameH;

  const pivotDevX = camera.worldToDeviceX(pr.cx);
  const pivotDevY = camera.worldToDeviceY(pr.cy);
  const dw = Math.floor(CAMERA_ZOOM * sw);
  const dh = Math.floor(CAMERA_ZOOM * sh);
  const pivotDevOffX = Math.floor(CAMERA_ZOOM * pr.pivotX);
  const pivotDevOffY = Math.floor(CAMERA_ZOOM * pr.pivotY);

  const needsJuice =
    juice &&
    (juice.solidRed ||
      (juice.hurtTintAlpha ?? 0) > 0 ||
      juice.shakeX ||
      juice.shakeY ||
      (juice.scaleX ?? 1) !== 1 ||
      (juice.scaleY ?? 1) !== 1);

  g.save();
  g.translate(pivotDevX, pivotDevY);
  if (Math.abs(pr.angleRad) > 1e-6) g.rotate(pr.angleRad);
  if (facing < 0) g.scale(-1, 1);

  const dx = -pivotDevOffX;
  const dy = -pivotDevOffY;

  if (needsJuice && juice) {
    drawJuicedImage(
      g,
      strip.image,
      sx,
      0,
      sw,
      sh,
      { x1: dx, y1: dy, x2: dx + dw, y2: dy + dh },
      1,
      juice,
    );
  } else {
    g.imageSmoothingEnabled = false;
    g.drawImage(strip.image, sx, 0, sw, sh, dx, dy, dw, dh);
  }

  // Arm guard glow stub (MVP: alpha always 0).
  if (pr.armGuardGlowAlpha > 0) {
    g.globalAlpha = pr.armGuardGlowAlpha / 255;
    g.fillStyle = "#a8e0ff";
    g.fillRect(dx, dy, dw, dh);
    g.globalAlpha = 1;
  }

  g.restore();
}

/** Draw Nephilim puppet parts from partRenders() — no scanline warp. */
export function drawNephilimBoss(
  g: CanvasRenderingContext2D,
  boss: Nephilim,
  camera: WorldCamera,
  assets: NephilimDrawAssets,
): void {
  if (boss.isDead()) return;

  const rig = getNephilimRig();
  const strip = assets.strip;
  if (!strip || !rig) {
    if (strip) {
      drawStripFrame(g, strip, 1, boss.x - strip.frameW * 0.5, boss.y - strip.frameH * 0.5, boss.facingSign(), camera);
    }
    return;
  }

  const juice = juiceForBoss(boss);
  for (const pr of boss.partRenders()) {
    drawPartRender(g, strip, pr, camera, juice);
  }
}

function juiceForBoss(boss: Nephilim): JuiceDrawOpts | undefined {
  const solidRed = boss.hitstunSolidRed();
  const shakeX = boss.hitlagShakeX;
  const shakeY = boss.hitlagShakeY;
  if (solidRed) return { solidRed: true, shakeX, shakeY };
  const hurtTintAlpha = boss.hurtTintAlpha();
  if (hurtTintAlpha <= 0 && !shakeX && !shakeY) return undefined;
  return { hurtTintAlpha, shakeX, shakeY };
}
