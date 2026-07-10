import type { Possessed } from "../entity/Possessed";
import { SCANLINE_PHASE_PER_ROW_RAD } from "../entity/Possessed";
import { getPossessedRig } from "./PossessedRig";
import { drawStripFrame, type SpriteStrip } from "../render/SpriteDraw";
import { drawJuicedImage, type JuiceDrawOpts } from "../render/JuiceDraw";
import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";

const BULLET_DIE_FRAME_SEC = 0.18;

export type PossessedDrawAssets = {
  strip: SpriteStrip | null;
  shinyStrip: SpriteStrip | null;
  bulletSheet: ImageBitmap | null;
  bulletDieSheet: ImageBitmap | null;
};

function stripForBoss(boss: Possessed, assets: PossessedDrawAssets): SpriteStrip | null {
  if (boss.isShiny() && assets.shinyStrip) return assets.shinyStrip;
  return assets.strip;
}

// --- scanline warp cache (keyed by frame + quantized phase) -------------------

type WarpCacheEntry = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  phaseQ: number;
};

const warpCache = new Map<string, WarpCacheEntry>();

function warpCacheKey(stripId: string, frameIndex: number, phaseQ: number, ampQ: number): string {
  return `${stripId}|${frameIndex}|${phaseQ}|${ampQ}`;
}

/**
 * EarthBound-style per-row horizontal sine warp (Java GamePanel.warpPossessedPart).
 * Each source row is shifted by round(ampPx * sin(phaseBase + row * SCANLINE_PHASE_PER_ROW_RAD)).
 */
export function warpPossessedPartFrame(
  strip: SpriteStrip,
  frameIndex: number,
  phaseBase: number,
  ampPx: number,
): CanvasImageSource {
  if (ampPx <= 0) {
    // Caller should draw from strip directly; return a 1×1 placeholder never used when amp≤0.
    return strip.image;
  }
  const fi = ((frameIndex % strip.frameCount) + strip.frameCount) % strip.frameCount;
  const w = strip.frameW;
  const h = strip.frameH;
  // Quantize phase so cache hits across nearby frames (~π/32 ≈ 0.1 rad).
  const phaseQ = Math.round(phaseBase * 32);
  const ampQ = Math.round(ampPx * 4);
  // Strip identity: width+frameCount is enough for the two Possessed sheets.
  const stripId = `${strip.image.width}x${strip.image.height}:${strip.frameCount}`;
  const key = warpCacheKey(stripId, fi, phaseQ, ampQ);
  const hit = warpCache.get(key);
  if (hit && hit.phaseQ === phaseQ) {
    return hit.canvas;
  }

  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(w, h);
    g = canvas.getContext("2d")!;
  } else {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    canvas = c;
    g = c.getContext("2d")!;
  }
  g.imageSmoothingEnabled = false;
  const sx = fi * w;
  for (let row = 0; row < h; row++) {
    const ox = Math.round(ampPx * Math.sin(phaseBase + row * SCANLINE_PHASE_PER_ROW_RAD));
    g.drawImage(strip.image, sx, row, w, 1, ox, row, w, 1);
  }

  // Bound cache size (4 parts × a few phase buckets).
  if (warpCache.size > 64) {
    const first = warpCache.keys().next().value;
    if (first !== undefined) warpCache.delete(first);
  }
  warpCache.set(key, { canvas, phaseQ });
  return canvas;
}

/**
 * Draw a warped (or raw) part frame centered on pivot at (cx,cy) with rotation + mirror.
 */
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
    scanlinePhaseBase: number;
    scanlineAmpPx: number;
  },
  camera: WorldCamera,
  juice?: JuiceDrawOpts,
): void {
  const facing = pr.mirror ? -1 : 1;
  const useWarp = pr.scanlineAmpPx > 0;
  const src: CanvasImageSource = useWarp
    ? warpPossessedPartFrame(strip, pr.frame, pr.scanlinePhaseBase, pr.scanlineAmpPx)
    : strip.image;
  const sx = useWarp ? 0 : (((pr.frame % strip.frameCount) + strip.frameCount) % strip.frameCount) * strip.frameW;
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
  // Mirror about pivot (Java draws with mirror flag / facing).
  if (facing < 0) g.scale(-1, 1);

  const dx = -pivotDevOffX;
  const dy = -pivotDevOffY;

  if (needsJuice && juice) {
    drawJuicedImage(
      g,
      src,
      sx,
      0,
      sw,
      sh,
      { x1: dx, y1: dy, x2: dx + dw, y2: dy + dh },
      1, // already mirrored via scale
      juice,
    );
  } else {
    g.imageSmoothingEnabled = false;
    g.drawImage(src, sx, 0, sw, sh, dx, dy, dw, dh);
  }
  g.restore();
}

/**
 * Draw Possessed via partRenders() (world PartSim + scanline warp).
 * Art faces left; partRenders.mirror is true when facing right.
 */
export function drawPossessedBoss(
  g: CanvasRenderingContext2D,
  boss: Possessed,
  camera: WorldCamera,
  assets: PossessedDrawAssets,
): void {
  if (boss.isDying()) {
    const t = Math.min(1, boss.deathProgress() / 4);
    if (t > 0.85) return;
    // Dying: limbs are BrickChunk debris; boss draws nothing (Java partRenders → []).
    return;
  }

  const rig = getPossessedRig();
  const strip = stripForBoss(boss, assets);
  const cx = boss.x + boss.w * 0.5;
  const cy = boss.y + boss.h * 0.5;
  const facing = boss.facingSign();

  if (!strip || !rig) {
    if (strip) {
      const left = cx - strip.frameW * 0.5;
      const top = cy - strip.frameH * 0.5;
      drawStripFrame(g, strip, 1, left, top, facing, camera, juiceForBoss(boss));
    }
    return;
  }

  const juice = juiceForBoss(boss);
  const renders = boss.partRenders();
  for (const pr of renders) {
    drawPartRender(g, strip, pr, camera, juice);
  }
}

function juiceForBoss(boss: Possessed): JuiceDrawOpts | undefined {
  const solidRed = boss.hitstunSolidRed();
  const shakeX = boss.hitlagShakeX;
  const shakeY = boss.hitlagShakeY;
  if (solidRed) {
    return { solidRed: true, shakeX, shakeY };
  }
  const novaA = boss.novaAbsorbFlashAlpha();
  if (novaA > 0) {
    return {
      hurtTintAlpha: novaA,
      tintRgb: boss.novaAbsorbFlashRgb(),
      shakeX,
      shakeY,
    };
  }
  const hurtTintAlpha = boss.hurtTintAlpha();
  if (hurtTintAlpha <= 0 && !shakeX && !shakeY) return undefined;
  return { hurtTintAlpha, shakeX, shakeY };
}

/**
 * Nova wind-up: psychic energy drawn in from the outer rim toward the body
 * (Java GamePanel.drawPossessedNovaRingDevice).
 */
export function drawPossessedNovaRing(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  nova: {
    cx: number;
    cy: number;
    progress: number;
    t: number;
    chargeRgb: number;
  },
  absorbFlashRgb: number,
  absorbFlashAlpha: number,
): void {
  const progress = Math.max(0, Math.min(1, nova.progress));
  const chargeRgb = nova.chargeRgb;
  const dcx = camera.worldToDeviceX(nova.cx);
  const dcy = camera.worldToDeviceY(nova.cy);
  const strokePx = Math.max(1, CAMERA_ZOOM);

  const innerR = 6;
  const outerR = 14 + 26 * progress;
  const period = 0.42;
  const intensity = 0.45 + 0.55 * progress;

  g.save();
  g.imageSmoothingEnabled = false;
  g.lineWidth = strokePx;
  g.lineCap = "butt";

  // Pooling glow at the body — palette steps as charge builds.
  const coreAlpha = Math.round(70 + 160 * progress);
  if (coreAlpha > 0) {
    g.strokeStyle = novaPaletteCss(chargeRgb, coreAlpha);
    const coreR = Math.round((innerR + 2 * progress) * CAMERA_ZOOM);
    g.beginPath();
    g.arc(dcx, dcy, coreR, 0, Math.PI * 2);
    g.stroke();
  }
  // Brief flare when a streak merges.
  if (absorbFlashAlpha > 0) {
    g.strokeStyle = novaPaletteCss(absorbFlashRgb, absorbFlashAlpha);
    const flareR = Math.round((innerR + 10) * CAMERA_ZOOM);
    g.beginPath();
    g.arc(dcx, dcy, flareR, 0, Math.PI * 2);
    g.stroke();
  }

  // Eight inward streaks: tip travels rim → core.
  const spokes = 8;
  for (let s = 0; s < spokes; s++) {
    const ang = s * ((Math.PI * 2) / spokes);
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const frac = ((nova.t / period) + s / spokes) % 1;
    const dist = outerR - (outerR - innerR) * frac;
    const alpha = Math.round(220 * (1 - frac) * intensity);
    if (alpha <= 4) continue;
    g.strokeStyle = novaPaletteCss(chargeRgb, alpha);
    g.fillStyle = g.strokeStyle;
    const xTip = camera.worldToDeviceX(nova.cx + cosA * dist);
    const yTip = camera.worldToDeviceY(nova.cy + sinA * dist);
    const xOuter = camera.worldToDeviceX(nova.cx + cosA * outerR);
    const yOuter = camera.worldToDeviceY(nova.cy + sinA * outerR);
    g.beginPath();
    g.moveTo(xOuter, yOuter);
    g.lineTo(xTip, yTip);
    g.stroke();
    const dot = Math.max(1, Math.round(strokePx));
    g.fillRect(xTip - Math.floor(dot / 2), yTip - Math.floor(dot / 2), dot, dot);
  }

  // Two contracting rings.
  const rings = 2;
  for (let k = 0; k < rings; k++) {
    const frac = ((nova.t / period) + k / rings) % 1;
    const alpha = Math.round(200 * (1 - frac) * intensity);
    if (alpha <= 4) continue;
    g.strokeStyle = novaPaletteCss(chargeRgb, alpha);
    const r = outerR - (outerR - innerR) * frac;
    const rdev = Math.round(r * CAMERA_ZOOM);
    g.beginPath();
    g.arc(dcx, dcy, rdev, 0, Math.PI * 2);
    g.stroke();
  }

  g.restore();
}

function novaPaletteCss(rgb: number, alpha: number): string {
  const a = Math.max(0, Math.min(255, alpha)) / 255;
  const r = (rgb >> 16) & 0xff;
  const gch = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return `rgba(${r},${gch},${b},${a})`;
}

/** Live bullets + charge orb + nova ring + die strip (Java drawPossessedBulletsDevice). */
export function drawPossessedBullets(
  g: CanvasRenderingContext2D,
  boss: Possessed,
  camera: WorldCamera,
  bulletSheet: ImageBitmap | null,
  bulletDieSheet: ImageBitmap | null,
): void {
  const frameW = 8;
  for (const b of boss.bulletsCopy()) {
    if (b.dead) continue;
    const left = b.x - frameW * 0.5;
    const top = b.y - frameW * 0.5;
    const dx = camera.worldToDeviceX(left);
    const dy = camera.worldToDeviceY(top);
    const dw = Math.floor(CAMERA_ZOOM * frameW);
    const dh = Math.floor(CAMERA_ZOOM * frameW);
    const fi = Math.floor(b.age / 0.09) % 2;
    const pulse = 1 + 0.32 * Math.sin(b.age * 13);
    const pwd = Math.floor(dw * pulse);
    const phd = Math.floor(dh * pulse);
    const pdx = dx - (pwd - dw) * 0.5;
    const pdy = dy - (phd - dh) * 0.5;
    if (bulletSheet && bulletSheet.width >= frameW * 2) {
      g.imageSmoothingEnabled = false;
      g.drawImage(bulletSheet, fi * frameW, 0, frameW, bulletSheet.height, pdx, pdy, pwd, phd);
    } else {
      g.fillStyle = "#e8c0ff";
      g.beginPath();
      g.arc(dx + dw * 0.5, dy + dh * 0.5, dw * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Charge orb during wind-up: bullet sprite growing at the body toward aim.
  const charge = boss.chargeFx();
  if (charge) {
    const fi = Math.max(0, Math.min(1, charge.animFrame));
    const sw = frameW;
    const sh = bulletSheet?.height ?? frameW;
    const dw = Math.max(1, Math.round(CAMERA_ZOOM * sw * charge.scale));
    const dh = Math.max(1, Math.round(CAMERA_ZOOM * sh * charge.scale));
    const dcx = camera.worldToDeviceX(charge.cx);
    const dcy = camera.worldToDeviceY(charge.cy);
    if (bulletSheet && bulletSheet.width >= frameW * 2) {
      g.imageSmoothingEnabled = false;
      g.drawImage(
        bulletSheet,
        fi * frameW,
        0,
        frameW,
        bulletSheet.height,
        dcx - dw / 2,
        dcy - dh / 2,
        dw,
        dh,
      );
    } else {
      g.fillStyle = "#e8c0ff";
      g.beginPath();
      g.arc(dcx, dcy, dw * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Omnidirectional nova tell.
  const nova = boss.novaChargeFx();
  if (nova) {
    drawPossessedNovaRing(
      g,
      camera,
      nova,
      boss.novaAbsorbFlashRgb(),
      boss.novaAbsorbFlashAlpha(),
    );
  }

  if (!bulletDieSheet) return;
  for (const fx of boss.bulletDieFxCopy()) {
    const fi = Math.min(1, Math.floor(fx.age / BULLET_DIE_FRAME_SEC));
    const left = fx.x - frameW * 0.5;
    const top = fx.y - frameW * 0.5;
    const dx = camera.worldToDeviceX(left);
    const dy = camera.worldToDeviceY(top);
    const dw = Math.floor(CAMERA_ZOOM * frameW);
    const dh = Math.floor(CAMERA_ZOOM * frameW);
    if (bulletDieSheet.width >= frameW * (fi + 1)) {
      g.imageSmoothingEnabled = false;
      g.drawImage(bulletDieSheet, fi * frameW, 0, frameW, bulletDieSheet.height, dx, dy, dw, dh);
    }
  }
}
