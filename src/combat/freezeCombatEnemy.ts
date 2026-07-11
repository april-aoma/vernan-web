import { Crawler } from "../entity/Crawler";
import type { CombatEnemy } from "../entity/CombatEnemy";
import { GoldenRoach } from "../entity/GoldenRoach";
import { JackBlue } from "../entity/JackBlue";
import { IceBlock } from "../entity/IceBlock";
import { Mouse } from "../entity/Mouse";
import { Multilimber } from "../entity/Multilimber";
import { Penisman } from "../entity/Penisman";
import { RollingHead } from "../entity/RollingHead";
import type { MultilimberPartSprites } from "../entity/drawMultilimber";
import { isIceBlockFreezable } from "./IceBlockFreeze";
import { ICE_AQUA_OVERLAY_ALPHA, ICE_AQUA_OVERLAY_RGB } from "./IceBlockFx";
import type { SpriteStrip } from "../render/SpriteDraw";
import { TILE_SIZE } from "../specs";

export type FreezeEnemyArt = {
  crawler: SpriteStrip | null;
  mouse: SpriteStrip | null;
  mouseHurt: SpriteStrip | null;
  penisman: SpriteStrip | null;
  jackBlue: SpriteStrip | null;
  rollingHead: SpriteStrip | null;
  goldenRoachWalk: SpriteStrip | null;
  goldenRoachFly: SpriteStrip | null;
  multilimberBody: SpriteStrip | null;
  multilimberHead: SpriteStrip | null;
  multilimberEye: SpriteStrip | null;
};

export type MultilimberPartIceSpawn = {
  partIndex: number;
  cx: number;
  cy: number;
  animFrame: number;
  mirrorSourceX: boolean;
  squashX: number;
  squashY: number;
};

function facingHint(e: CombatEnemy): number {
  if ("facingHintVelX" in e && typeof e.facingHintVelX === "function") {
    return e.facingHintVelX();
  }
  return e.facingSign();
}

export function iceBlockMirrorSourceX(e: CombatEnemy): boolean {
  const faceRight = facingHint(e) >= 0;
  if (
    e instanceof Penisman ||
    e instanceof Mouse ||
    e instanceof JackBlue ||
    e instanceof GoldenRoach ||
    e instanceof RollingHead ||
    e instanceof Multilimber
  ) {
    return faceRight;
  }
  return !faceRight;
}

function resolveFrame(
  e: CombatEnemy,
  art: FreezeEnemyArt,
): { strip: SpriteStrip; frame: number } | null {
  if (e instanceof Crawler) {
    if (!art.crawler) return null;
    return { strip: art.crawler, frame: Math.max(0, Math.min(1, e.getAnimFrame())) };
  }
  if (e instanceof Penisman) {
    if (!art.penisman) return null;
    return { strip: art.penisman, frame: Math.max(0, Math.min(3, e.getAnimFrame())) };
  }
  if (e instanceof Mouse) {
    const strip = e.useHurtSprite() && art.mouseHurt ? art.mouseHurt : art.mouse;
    if (!strip) return null;
    return { strip, frame: Math.max(0, Math.min(3, e.getAnimFrame())) };
  }
  if (e instanceof JackBlue) {
    if (!art.jackBlue) return null;
    return { strip: art.jackBlue, frame: Math.max(0, Math.min(2, e.getAnimFrame())) };
  }
  if (e instanceof RollingHead) {
    if (!art.rollingHead) return null;
    return { strip: art.rollingHead, frame: Math.max(0, Math.min(3, e.getAnimFrame())) };
  }
  if (e instanceof GoldenRoach) {
    const flying = e.getMode() === "fly";
    const strip = flying ? art.goldenRoachFly : art.goldenRoachWalk;
    if (!strip) return null;
    return { strip, frame: Math.max(0, Math.min(strip.frameCount - 1, e.getAnimFrame())) };
  }
  if (e instanceof Multilimber) {
    if (!art.multilimberBody) return null;
    return { strip: art.multilimberBody, frame: Math.max(0, Math.min(2, e.getAnimFrame())) };
  }
  return null;
}

function tintAqua(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const g = out.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, 0);
  g.globalCompositeOperation = "source-atop";
  const r = (ICE_AQUA_OVERLAY_RGB >> 16) & 0xff;
  const gr = (ICE_AQUA_OVERLAY_RGB >> 8) & 0xff;
  const b = ICE_AQUA_OVERLAY_RGB & 0xff;
  g.fillStyle = `rgba(${r},${gr},${b},${ICE_AQUA_OVERLAY_ALPHA / 255})`;
  g.fillRect(0, 0, out.width, out.height);
  return out;
}

function drawEnemyFrameToCanvas(
  strip: SpriteStrip,
  frame: number,
  mirrorSourceX: boolean,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const fw = strip.frameW;
  const fh = strip.frameH;
  const sx = frame * fw;
  if (mirrorSourceX) {
    g.drawImage(strip.image, sx + fw, 0, -fw, fh, 0, 0, c.width, c.height);
  } else {
    g.drawImage(strip.image, sx, 0, fw, fh, 0, 0, c.width, c.height);
  }
  return c;
}

function drawPartFrameToCanvas(
  strip: SpriteStrip,
  frame: number,
  mirrorSourceX: boolean,
): HTMLCanvasElement | null {
  const fw = strip.frameW;
  const fh = strip.frameH;
  const c = document.createElement("canvas");
  c.width = fw;
  c.height = fh;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const sx = frame * fw;
  if (mirrorSourceX) {
    g.drawImage(strip.image, sx + fw, 0, -fw, fh, 0, 0, fw, fh);
  } else {
    g.drawImage(strip.image, sx, 0, fw, fh, 0, 0, fw, fh);
  }
  return c;
}

export function snapshotIceHoldSprite(block: IceBlock): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(block.sprite, 0, 0, TILE_SIZE, TILE_SIZE);
  return c;
}

export function freezeCombatEnemyToIce(
  e: CombatEnemy,
  art: FreezeEnemyArt,
  kuriboPancake = false,
): IceBlock | null {
  if (!isIceBlockFreezable(e)) return null;
  const resolved = resolveFrame(e, art);
  if (!resolved) return null;
  const r = e.rect();
  const mirror = iceBlockMirrorSourceX(e);
  const base = drawEnemyFrameToCanvas(resolved.strip, resolved.frame, mirror, r.w, r.h);
  if (!base) return null;
  const tinted = tintAqua(base);
  const squashX = kuriboPancake ? 1.35 : 1;
  const squashY = kuriboPancake ? 1 / 1.35 : 1;
  return new IceBlock(r.x, r.y, r.w, r.h, tinted, mirror, kuriboPancake, squashX, squashY, 0);
}

export function spawnMultilimberPartIce(
  req: MultilimberPartIceSpawn,
  parts: MultilimberPartSprites,
): IceBlock | null {
  const strip =
    req.partIndex === 0
      ? parts.eye
      : req.partIndex === 1
        ? parts.head
        : parts.body;
  if (!strip) return null;
  const fi = Math.max(0, Math.min(2, req.animFrame));
  const base = drawPartFrameToCanvas(strip, fi, req.mirrorSourceX);
  if (!base) return null;
  const tinted = tintAqua(base);
  const halfW = base.width * 0.5;
  const halfH = base.height * 0.5;
  return new IceBlock(
    req.cx - halfW,
    req.cy - halfH,
    base.width,
    base.height,
    tinted,
    req.mirrorSourceX,
    req.squashX >= 1.35 * 0.9,
    req.squashX,
    req.squashY,
    0,
  );
}
