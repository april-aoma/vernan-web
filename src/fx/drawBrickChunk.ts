import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";
import type { SpriteStrip } from "../render/SpriteDraw";
import type { BrickChunk } from "./BrickChunk";
import type { Player } from "../entity/Player";

const PSYCHIC_FIRE_FRAMES = 4;
const PSYCHIC_HOMING_WAIT_BOB_WORLD_PX = 2;
const PSYCHIC_HOMING_WAIT_SPIN_RAD_PER_SEC = 5.2;
const PSYCHIC_HOMING_FIRE_FLIP_RAD = Math.PI;
const PSYCHIC_FLOAT_Z_OSC_HZ = 0.42;
const PSYCHIC_FLOAT_Z_SCALE_MIN = 0.46;
const PSYCHIC_FLOAT_Z_SCALE_MAX = 1.16;
const PSYCHIC_FLOAT_Z_PROXIMITY_OUTER_WORLD_PX = 120;
const PSYCHIC_FLOAT_Z_PROXIMITY_INNER_WORLD_PX = 32;

function psychicFloatZDepth01(b: BrickChunk, timeSec: number): number {
  const w = Math.PI * 2 * PSYCHIC_FLOAT_Z_OSC_HZ;
  const p = b.fireAnimPhaseOffset() * 13.7;
  return 0.5 * (Math.sin(timeSec * w + p) + 1);
}

function psychicFloatZScale(b: BrickChunk, timeSec: number): number {
  const z = psychicFloatZDepth01(b, timeSec);
  return PSYCHIC_FLOAT_Z_SCALE_MIN + z * (PSYCHIC_FLOAT_Z_SCALE_MAX - PSYCHIC_FLOAT_Z_SCALE_MIN);
}

function psychicFloatZProximityBlend(b: BrickChunk, player: Player): number {
  if (b.telekinesis() !== "float") return 0;
  const pb = player.hurtbox();
  const px = pb.x + pb.w * 0.5;
  const py = pb.y + pb.h * 0.5;
  const dist = Math.hypot(b.debrisCenterWorldX() - px, b.debrisCenterWorldY() - py);
  if (dist >= PSYCHIC_FLOAT_Z_PROXIMITY_OUTER_WORLD_PX) return 0;
  if (dist <= PSYCHIC_FLOAT_Z_PROXIMITY_INNER_WORLD_PX) return 1;
  return (
    1 -
    (dist - PSYCHIC_FLOAT_Z_PROXIMITY_INNER_WORLD_PX) /
      (PSYCHIC_FLOAT_Z_PROXIMITY_OUTER_WORLD_PX - PSYCHIC_FLOAT_Z_PROXIMITY_INNER_WORLD_PX)
  );
}

function psychicFloatZDisplayScale(b: BrickChunk, player: Player, timeSec: number): number {
  if (b.telekinesis() !== "float") return 1;
  const p = psychicFloatZProximityBlend(b, player);
  if (p <= 0) return 1;
  const zOsc = psychicFloatZScale(b, timeSec);
  return 1 + p * (zOsc - 1);
}

function psychicFloatZBehindPlayer(b: BrickChunk, timeSec: number): boolean {
  return psychicFloatZDepth01(b, timeSec) < 0.5;
}

function isHomingWaitDraw(b: BrickChunk, dashTarget: BrickChunk | null): boolean {
  return b.telekinesis() === "homing" && b !== dashTarget;
}

export function drawBrickChunksFloatZBehindPlayer(
  g: CanvasRenderingContext2D,
  chunks: BrickChunk[],
  player: Player,
  camera: WorldCamera,
  timeSec: number,
  psychicFire: SpriteStrip | null,
  dashTarget: BrickChunk | null,
): void {
  const layer = chunks
    .filter((b) => b.telekinesis() === "float" && psychicFloatZBehindPlayer(b, timeSec))
    .sort((a, c) => psychicFloatZDepth01(a, timeSec) - psychicFloatZDepth01(c, timeSec));
  for (const b of layer) {
    drawOneBrickChunk(g, b, camera, player, timeSec, psychicFire, dashTarget);
  }
}

export function drawBrickChunksInFront(
  g: CanvasRenderingContext2D,
  chunks: BrickChunk[],
  player: Player,
  camera: WorldCamera,
  timeSec: number,
  psychicFire: SpriteStrip | null,
  dashTarget: BrickChunk | null,
): void {
  for (const b of chunks) {
    if (b.telekinesis() === "float" && psychicFloatZBehindPlayer(b, timeSec)) continue;
    drawOneBrickChunk(g, b, camera, player, timeSec, psychicFire, dashTarget);
  }
}

export function drawOneBrickChunk(
  g: CanvasRenderingContext2D,
  chunk: BrickChunk,
  camera: WorldCamera,
  player: Player,
  timeSec: number,
  psychicFire: SpriteStrip | null,
  dashTarget: BrickChunk | null,
): void {
  if (!chunk.isDrawVisible()) return;
  if (chunk.isPivotAnchored()) {
    drawPivotAnchoredBrickChunk(g, chunk, camera, player, timeSec, psychicFire, dashTarget);
    return;
  }
  const s = chunk.worldSize();
  const x0 = camera.worldToDeviceX(chunk.x);
  const y0 = camera.worldToDeviceY(chunk.y);
  const x1 = camera.worldToDeviceX(chunk.x + s);
  const y1 = camera.worldToDeviceY(chunk.y + s);
  const dw = Math.max(1, x1 - x0);
  const dh = Math.max(1, y1 - y0);
  const cxDev = (x0 + x1) * 0.5;
  let cyDev = (y0 + y1) * 0.5;
  const homingWait = isHomingWaitDraw(chunk, dashTarget);
  if (homingWait) {
    const bobWorld =
      Math.sin(timeSec * (Math.PI * 2 * 0.9) + chunk.fireAnimPhaseOffset() * 11.3) *
      PSYCHIC_HOMING_WAIT_BOB_WORLD_PX;
    cyDev += bobWorld * CAMERA_ZOOM;
  }
  const waitSpinRad = homingWait
    ? timeSec * PSYCHIC_HOMING_WAIT_SPIN_RAD_PER_SEC + chunk.fireAnimPhaseOffset() * 19
    : 0;
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(cxDev, cyDev);
  const floatZMul =
    chunk.telekinesis() === "float" ? psychicFloatZDisplayScale(chunk, player, timeSec) : 1;
  g.scale(floatZMul, floatZMul);
  drawTelekinesisOverlay(g, chunk, psychicFire, timeSec, homingWait, waitSpinRad);
  if (!homingWait) {
    g.rotate(chunk.angle);
    if (chunk.sprite) {
      const sp = chunk.sprite;
      g.drawImage(sp.image, sp.sx, sp.sy, sp.sw, sp.sh, -dw * 0.5, -dh * 0.5, dw, dh);
    }
  }
  g.restore();
}

function drawPivotAnchoredBrickChunk(
  g: CanvasRenderingContext2D,
  chunk: BrickChunk,
  camera: WorldCamera,
  player: Player,
  timeSec: number,
  psychicFire: SpriteStrip | null,
  dashTarget: BrickChunk | null,
): void {
  const dcx = camera.worldToDeviceX(chunk.x);
  const dcy = camera.worldToDeviceY(chunk.y);
  const homingWait = isHomingWaitDraw(chunk, dashTarget);
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(dcx, dcy);
  if (chunk.isTelekinesisActive()) {
    const floatZMul =
      chunk.telekinesis() === "float" ? psychicFloatZDisplayScale(chunk, player, timeSec) : 1;
    g.scale(floatZMul, floatZMul);
    drawTelekinesisOverlay(
      g,
      chunk,
      psychicFire,
      timeSec,
      homingWait,
      homingWait ? timeSec * PSYCHIC_HOMING_WAIT_SPIN_RAD_PER_SEC : 0,
    );
  }
  g.rotate(chunk.angle + (homingWait ? timeSec * PSYCHIC_HOMING_WAIT_SPIN_RAD_PER_SEC : 0));
  g.scale(chunk.isMirrorX() ? -CAMERA_ZOOM : CAMERA_ZOOM, CAMERA_ZOOM);
  g.translate(-chunk.spritePivotX(), -chunk.spritePivotY());
  if (chunk.sprite) {
    const sp = chunk.sprite;
    g.drawImage(sp.image, sp.sx, sp.sy, sp.sw, sp.sh, 0, 0, sp.sw, sp.sh);
  }
  g.restore();
}

function drawTelekinesisOverlay(
  g: CanvasRenderingContext2D,
  chunk: BrickChunk,
  psychicFire: SpriteStrip | null,
  timeSec: number,
  homingWait: boolean,
  waitSpinRad: number,
): void {
  if (!chunk.isTelekinesisActive() || !psychicFire) {
    if (homingWait) g.rotate(chunk.angle + waitSpinRad);
    else g.rotate(chunk.angle);
    return;
  }
  const fi =
    (Math.floor((timeSec + chunk.fireAnimPhaseOffset()) * 10) % PSYCHIC_FIRE_FRAMES +
      PSYCHIC_FIRE_FRAMES) %
    PSYCHIC_FIRE_FRAMES;
  const fw = psychicFire.frameW;
  const fh = psychicFire.frameH;
  const fw2 = fw * 2;
  const fh2 = fh * 2;
  if (chunk.telekinesis() === "float") {
    g.drawImage(psychicFire.image, fi * fw, 0, fw, fh, -fw2 / 2, -fh2 / 2, fw2, fh2);
    g.rotate(chunk.angle);
    return;
  }
  if (homingWait) {
    g.drawImage(psychicFire.image, fi * fw, 0, fw, fh, -fw2 / 2, -fh2 / 2, fw2, fh2);
    g.rotate(chunk.angle + waitSpinRad);
    return;
  }
  let dirx = 0;
  let diry = -1;
  const vlen = Math.hypot(chunk.vx, chunk.vy);
  if (vlen >= 6) {
    dirx = -chunk.vx / vlen;
    diry = -chunk.vy / vlen;
  }
  const angFire = Math.atan2(-dirx, diry) + PSYCHIC_HOMING_FIRE_FLIP_RAD;
  g.rotate(angFire);
  g.drawImage(psychicFire.image, fi * fw, 0, fw, fh, -fw2 / 2, -fh2 / 2, fw2, fh2);
  g.rotate(-angFire);
  g.rotate(chunk.angle);
}
