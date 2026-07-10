import {
  PENIS_BULLET_DIE_FRAME_COUNT,
  PENIS_BULLET_DIE_FRAME_SEC,
  PENIS_BULLET_FRAMES,
  PENIS_BULLET_SPRITE_H,
  PENIS_BULLET_SPRITE_W,
} from "../config/AnimStats";
import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";
import type { Penisman, PenisBulletDieFx } from "./Penisman";
import type { PenismanBullet } from "./PenismanBullet";

export function drawPenismanBullets(
  g: CanvasRenderingContext2D,
  pen: Penisman,
  camera: WorldCamera,
  bulletSheet: ImageBitmap | null,
): void {
  for (const b of pen.bulletsCopy()) {
    if (!b.alive) continue;
    drawOnePenisBullet(g, b, camera, bulletSheet);
  }
}

function drawOnePenisBullet(
  g: CanvasRenderingContext2D,
  b: PenismanBullet,
  camera: WorldCamera,
  bulletSheet: ImageBitmap | null,
): void {
  const sc = b.visualScale();
  const wcx = b.centerX();
  const wcy = b.centerY();
  const dcx = camera.worldToDeviceX(wcx);
  const dcy = camera.worldToDeviceY(wcy);
  const sw = PENIS_BULLET_SPRITE_W;
  const sh = PENIS_BULLET_SPRITE_H;
  const dw0 = Math.round(CAMERA_ZOOM * sw);
  const dh0 = Math.round(CAMERA_ZOOM * sh);
  const dw = Math.max(1, Math.round(dw0 * sc));
  const dh = Math.max(1, Math.round(dh0 * sc));
  const dx = dcx - dw / 2;
  const dy = dcy - dh / 2;
  const fi = Math.max(0, Math.min(PENIS_BULLET_FRAMES - 1, b.getAnimFrame()));
  if (bulletSheet && bulletSheet.width >= sw * PENIS_BULLET_FRAMES) {
    g.imageSmoothingEnabled = false;
    g.drawImage(bulletSheet, fi * sw, 0, sw, sh, dx, dy, dw, dh);
    return;
  }
  g.fillStyle = "#e8c0ff";
  g.beginPath();
  g.arc(dcx, dcy, dw * 0.4, 0, Math.PI * 2);
  g.fill();
}

export function drawPenisBulletDieFx(
  g: CanvasRenderingContext2D,
  pen: Penisman,
  camera: WorldCamera,
  dieSheet: ImageBitmap | null,
): void {
  for (const fx of pen.bulletDieFxCopy()) {
    drawOnePenisBulletDieFx(g, fx, camera, dieSheet);
  }
}

function drawOnePenisBulletDieFx(
  g: CanvasRenderingContext2D,
  fx: PenisBulletDieFx,
  camera: WorldCamera,
  dieSheet: ImageBitmap | null,
): void {
  const fi = Math.min(
    PENIS_BULLET_DIE_FRAME_COUNT - 1,
    Math.floor(fx.age / PENIS_BULLET_DIE_FRAME_SEC),
  );
  const wcx = fx.x;
  const wcy = fx.y;
  const dcx = camera.worldToDeviceX(wcx);
  const dcy = camera.worldToDeviceY(wcy);
  const sw = PENIS_BULLET_SPRITE_W;
  const sh = PENIS_BULLET_SPRITE_H;
  const dw = Math.max(1, Math.round(CAMERA_ZOOM * sw));
  const dh = Math.max(1, Math.round(CAMERA_ZOOM * sh));
  if (dieSheet && dieSheet.width >= sw * PENIS_BULLET_DIE_FRAME_COUNT) {
    g.imageSmoothingEnabled = false;
    g.drawImage(
      dieSheet,
      fi * sw,
      0,
      sw,
      sh,
      dcx - dw / 2,
      dcy - dh / 2,
      dw,
      dh,
    );
    return;
  }
  g.fillStyle = "#f0d0ff";
  g.beginPath();
  g.arc(dcx, dcy, dw * 0.35, 0, Math.PI * 2);
  g.fill();
}
