import type { Nephilim } from "../entity/Nephilim";
import { getNephilimRig } from "./NephilimRig";
import { drawStripFrame, type SpriteStrip } from "../render/SpriteDraw";
import { drawJuicedImage, type JuiceDrawOpts } from "../render/JuiceDraw";
import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";

export type NephilimDrawAssets = {
  strip: SpriteStrip | null;
  healOverlay?: CanvasImageSource | null;
};

export function drawNephilimChainStrings(
  g: CanvasRenderingContext2D,
  boss: Nephilim,
  camera: WorldCamera,
): void {
  for (const seg of boss.chainStringSegments(1)) {
    const ax = camera.worldToDeviceX(seg.ax);
    const ay = camera.worldToDeviceY(seg.ay);
    const bx = camera.worldToDeviceX(seg.bx);
    const by = camera.worldToDeviceY(seg.by);
    g.strokeStyle = `rgba(255,255,255,${seg.loose ? 160 / 255 : 230 / 255})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }
  g.setLineDash([3, 3]);
  for (const seg of boss.handGrabStringSegments(1)) {
    const ax = camera.worldToDeviceX(seg.ax);
    const ay = camera.worldToDeviceY(seg.ay);
    const bx = camera.worldToDeviceX(seg.bx);
    const by = camera.worldToDeviceY(seg.by);
    g.strokeStyle = "rgba(255,255,220,1)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }
  g.setLineDash([]);
}

export function drawNephilimLiftString(
  g: CanvasRenderingContext2D,
  boss: Nephilim,
  camera: WorldCamera,
): void {
  const lift = boss.liftPuppetString(1);
  if (!lift) return;
  const hx = camera.worldToDeviceX(lift.handWorldX);
  const hy = camera.worldToDeviceY(lift.handWorldY);
  const ax = camera.worldToDeviceX(lift.anchorWorldX);
  const ay = camera.worldToDeviceY(lift.anchorWorldY);
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(hx, hy);
  g.lineTo(ax, ay);
  g.stroke();
}

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
  healOverlay?: CanvasImageSource | null,
  healAlpha = 0,
  healScrollY = 0,
): void {
  const facing = pr.mirror ? -1 : 1;
  const fi = ((pr.frame % strip.frameCount) + strip.frameCount) % strip.frameCount;
  const sx = fi * strip.frameW;
  const sw = strip.frameW;
  const sh = strip.frameH;

  const pivotDevX = camera.worldToDeviceX(pr.cx);
  const pivotDevY = camera.worldToDeviceY(pr.cy - healScrollY);
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

  if (healAlpha > 0) {
    g.save();
    if (healOverlay) {
      g.globalAlpha = healAlpha;
      g.globalCompositeOperation = "source-atop";
      g.drawImage(healOverlay, dx, dy, dw, dh);
      g.globalCompositeOperation = "source-over";
    } else {
      g.globalAlpha = healAlpha * 0.55;
      g.fillStyle = "#5fe8b0";
      g.fillRect(dx, dy, dw, dh);
    }
    g.restore();
  }

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
  const healActive = boss.drinkHealOverlayActive();
  const healAlpha = healActive ? boss.drinkHealOverlayAlpha() : 0;
  const healScroll = healActive ? boss.drinkHealOverlayScrollWorldPx() : 0;

  drawNephilimChainStrings(g, boss, camera);
  drawNephilimLiftString(g, boss, camera);
  for (const pr of boss.partRenders()) {
    drawPartRender(g, strip, pr, camera, juice, assets.healOverlay, healAlpha, healScroll);
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
