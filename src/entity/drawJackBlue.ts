import { JACK_BONE_SPRITE_H, JACK_BONE_SPRITE_W } from "../config/AnimStats";
import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";
import type { JackBlue } from "./JackBlue";
import type { JackBlueBone } from "./JackBlueBone";

export function drawJackBlueBones(
  g: CanvasRenderingContext2D,
  jack: JackBlue,
  camera: WorldCamera,
  boneSheet: ImageBitmap | null,
): void {
  for (const b of jack.bonesCopy()) {
    if (!b.alive) continue;
    drawOneBone(g, b, camera, boneSheet);
  }
}

function drawOneBone(
  g: CanvasRenderingContext2D,
  b: JackBlueBone,
  camera: WorldCamera,
  boneSheet: ImageBitmap | null,
): void {
  const wcx = b.centerX();
  const wcy = b.centerY();
  const dcx = camera.worldToDeviceX(wcx);
  const dcy = camera.worldToDeviceY(wcy);
  const sw = JACK_BONE_SPRITE_W;
  const sh = JACK_BONE_SPRITE_H;
  const dw = Math.max(1, Math.round(CAMERA_ZOOM * sw));
  const dh = Math.max(1, Math.round(CAMERA_ZOOM * sh));
  g.save();
  g.translate(dcx, dcy);
  g.rotate(b.renderAngleRad());
  if (boneSheet) {
    g.imageSmoothingEnabled = false;
    g.drawImage(boneSheet, 0, 0, sw, sh, -dw / 2, -dh / 2, dw, dh);
  } else {
    g.fillStyle = "#e8e0d0";
    g.fillRect(-dw / 2, -dh / 2, dw, dh);
  }
  g.restore();
}
