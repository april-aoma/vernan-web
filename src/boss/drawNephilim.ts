import type { Nephilim, NephilimPartRender } from "../entity/Nephilim";
import { getNephilimRig } from "./NephilimRig";
import { drawStripFrame, type SpriteStrip } from "../render/SpriteDraw";
import { drawJuicedImage, type JuiceDrawOpts } from "../render/JuiceDraw";
import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";

export type NephilimDrawAssets = {
  strip: SpriteStrip | null;
  healOverlay?: CanvasImageSource | null;
};

/** Draw grabbed Vernan between rig parts (Java embedGrabbedPlayer before handR). */
export type NephilimPlayerEmbed = {
  beforePart: string;
  drawPlayer: (g: CanvasRenderingContext2D) => void;
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

function partDeviceRect(
  strip: SpriteStrip,
  pr: NephilimPartRender,
  camera: WorldCamera,
): { pivotDevX: number; pivotDevY: number; dx: number; dy: number; dw: number; dh: number; sx: number; sw: number; sh: number } {
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
  return {
    pivotDevX,
    pivotDevY,
    dx: -pivotDevOffX,
    dy: -pivotDevOffY,
    dw,
    dh,
    sx,
    sw,
    sh,
  };
}

function drawPartRender(
  g: CanvasRenderingContext2D,
  strip: SpriteStrip,
  pr: NephilimPartRender,
  camera: WorldCamera,
  juice?: JuiceDrawOpts,
): void {
  const facing = pr.mirror ? -1 : 1;
  const { pivotDevX, pivotDevY, dx, dy, dw, dh, sx, sw, sh } = partDeviceRect(strip, pr, camera);

  const partJuice: JuiceDrawOpts | undefined =
    pr.armGuardGlowAlpha > 0
      ? {
          ...(juice ?? {}),
          tintRgb: 0xe0c090,
          hurtTintAlpha: pr.armGuardGlowAlpha,
        }
      : juice;

  const needsJuice =
    partJuice &&
    (partJuice.solidRed ||
      (partJuice.hurtTintAlpha ?? 0) > 0 ||
      partJuice.shakeX ||
      partJuice.shakeY ||
      (partJuice.scaleX ?? 1) !== 1 ||
      (partJuice.scaleY ?? 1) !== 1);

  g.save();
  g.translate(pivotDevX, pivotDevY);
  if (Math.abs(pr.angleRad) > 1e-6) g.rotate(pr.angleRad);
  if (facing < 0) g.scale(-1, 1);

  if (needsJuice && partJuice) {
    drawJuicedImage(
      g,
      strip.image,
      sx,
      0,
      sw,
      sh,
      { x1: dx, y1: dy, x2: dx + dw, y2: dy + dh },
      1,
      partJuice,
    );
  } else {
    g.imageSmoothingEnabled = false;
    g.drawImage(strip.image, sx, 0, sw, sh, dx, dy, dw, dh);
  }

  g.restore();
}

/** Masked rising heal tiles over combined puppet silhouette (Java drawNephilimDrinkHealOverlayMasked). */
function drawNephilimDrinkHealOverlay(
  g: CanvasRenderingContext2D,
  strip: SpriteStrip,
  parts: readonly NephilimPartRender[],
  camera: WorldCamera,
  healTile: CanvasImageSource | null | undefined,
  alpha: number,
  scrollWorldPx: number,
): void {
  if (alpha <= 0 || parts.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pr of parts) {
    const { pivotDevX, pivotDevY, dx, dy, dw, dh } = partDeviceRect(strip, pr, camera);
    minX = Math.min(minX, pivotDevX + dx);
    minY = Math.min(minY, pivotDevY + dy);
    maxX = Math.max(maxX, pivotDevX + dx + dw);
    maxY = Math.max(maxY, pivotDevY + dy + dh);
  }
  if (minX >= maxX || minY >= maxY) return;

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const scrollDev = Math.round(CAMERA_ZOOM * scrollWorldPx);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = bw;
  maskCanvas.height = bh;
  const maskG = maskCanvas.getContext("2d");
  if (!maskG) return;

  for (const pr of parts) {
    const facing = pr.mirror ? -1 : 1;
    const { pivotDevX, pivotDevY, dx, dy, dw, dh, sx, sw, sh } = partDeviceRect(strip, pr, camera);
    maskG.save();
    maskG.translate(pivotDevX - minX, pivotDevY - minY);
    if (Math.abs(pr.angleRad) > 1e-6) maskG.rotate(pr.angleRad);
    if (facing < 0) maskG.scale(-1, 1);
    maskG.imageSmoothingEnabled = false;
    maskG.drawImage(strip.image, sx, 0, sw, sh, dx, dy, dw, dh);
    maskG.restore();
  }

  const healCanvas = document.createElement("canvas");
  healCanvas.width = bw;
  healCanvas.height = bh;
  const healG = healCanvas.getContext("2d");
  if (!healG) return;

  if (healTile) {
    const tileW =
      "width" in healTile && typeof healTile.width === "number" ? healTile.width : strip.frameW;
    const tileH =
      "height" in healTile && typeof healTile.height === "number" ? healTile.height : strip.frameH;
    const tileDevW = Math.max(1, Math.floor(CAMERA_ZOOM * tileW));
    const tileDevH = Math.max(1, Math.floor(CAMERA_ZOOM * tileH));
    const tileOriginX = Math.floor(minX / tileDevW) * tileDevW;
    const tileOriginY = Math.floor((minY + scrollDev) / tileDevH) * tileDevH - scrollDev;
    healG.imageSmoothingEnabled = false;
    for (let y0 = tileOriginY; y0 <= maxY; y0 += tileDevH) {
      for (let x0 = tileOriginX; x0 <= maxX; x0 += tileDevW) {
        healG.drawImage(
          healTile,
          x0 - minX,
          y0 - minY,
          x0 - minX + tileDevW,
          y0 - minY + tileDevH,
          0,
          0,
          tileW,
          tileH,
        );
      }
    }
  } else {
    healG.fillStyle = "#5fe8b0";
    healG.fillRect(0, 0, bw, bh);
  }

  healG.globalCompositeOperation = "destination-in";
  healG.drawImage(maskCanvas, 0, 0);

  g.save();
  g.globalAlpha = alpha;
  g.drawImage(healCanvas, minX, minY);
  g.restore();
}

/** Draw Nephilim puppet parts from partRenders() — no scanline warp. */
export function drawNephilimBoss(
  g: CanvasRenderingContext2D,
  boss: Nephilim,
  camera: WorldCamera,
  assets: NephilimDrawAssets,
  embed?: NephilimPlayerEmbed,
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
  const partRenders = boss.partRenders();
  const healActive = boss.drinkHealOverlayActive();
  const healAlpha = healActive ? boss.drinkHealOverlayAlpha() : 0;
  const healScroll = healActive ? boss.drinkHealOverlayScrollWorldPx() : 0;

  drawNephilimChainStrings(g, boss, camera);
  drawNephilimLiftString(g, boss, camera);
  let healDrawn = false;
  for (const pr of partRenders) {
    if (embed && pr.name === embed.beforePart) {
      if (healAlpha > 0) {
        drawNephilimDrinkHealOverlay(
          g,
          strip,
          partRenders,
          camera,
          assets.healOverlay,
          healAlpha,
          healScroll,
        );
        healDrawn = true;
      }
      embed.drawPlayer(g);
    }
    drawPartRender(g, strip, pr, camera, juice);
  }
  if (healAlpha > 0 && !healDrawn) {
    drawNephilimDrinkHealOverlay(
      g,
      strip,
      partRenders,
      camera,
      assets.healOverlay,
      healAlpha,
      healScroll,
    );
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
