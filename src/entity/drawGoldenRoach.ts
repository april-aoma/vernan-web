import type { GoldenRoach } from "./GoldenRoach";
import {
  GOLDEN_ROACH_FLY_FRAMES,
  GOLDEN_ROACH_FLY_SPRITE_H,
  GOLDEN_ROACH_FLY_SPRITE_W,
  GOLDEN_ROACH_WALK_FRAMES,
  GOLDEN_ROACH_WALK_SPRITE_H,
  GOLDEN_ROACH_WALK_SPRITE_W,
} from "../config/AnimStats";
import type { WorldCamera } from "../camera/WorldCamera";
import { drawJuicedImage, type JuiceDrawOpts } from "../render/JuiceDraw";
import type { SpriteStrip } from "../render/SpriteDraw";
import { CAMERA_ZOOM } from "../specs";

export function drawGoldenRoach(
  g: CanvasRenderingContext2D,
  roach: GoldenRoach,
  camera: WorldCamera,
  walkStrip: SpriteStrip | null,
  flyStrip: SpriteStrip | null,
): void {
  if (roach.isDead()) return;
  const flying = roach.getMode() === "fly";
  const strip = flying ? flyStrip : walkStrip;
  const frameW = flying ? GOLDEN_ROACH_FLY_SPRITE_W : GOLDEN_ROACH_WALK_SPRITE_W;
  const frameH = flying ? GOLDEN_ROACH_FLY_SPRITE_H : GOLDEN_ROACH_WALK_SPRITE_H;
  const frameCount = flying ? GOLDEN_ROACH_FLY_FRAMES : GOLDEN_ROACH_WALK_FRAMES;
  const rect = roach.rect();
  const cx = rect.x + rect.w * 0.5;
  const cy = rect.y + rect.h * 0.5;
  const angle = roach.renderAngleRad();
  const fi = Math.max(0, Math.min(frameCount - 1, roach.getAnimFrame()));

  const juice: JuiceDrawOpts = {
    shakeX: roach.hitlagShakeX,
    shakeY: roach.hitlagShakeY,
    scaleX: roach.squash.scaleX(),
    scaleY: roach.squash.scaleY(),
    solidRed: roach.hitlagSolidRed,
    hurtTintAlpha: roach.hurtTintAlpha(),
  };

  const dcx = camera.worldToDeviceX(cx);
  const dcy = camera.worldToDeviceY(cy);
  const dw = Math.floor(CAMERA_ZOOM * frameW);
  const dh = Math.floor(CAMERA_ZOOM * frameH);
  const sx = fi * frameW;

  g.save();
  g.translate(dcx, dcy);
  if (Math.abs(angle) > 1e-6) g.rotate(angle);

  if (strip) {
    drawJuicedImage(
      g,
      strip.image,
      sx,
      0,
      frameW,
      frameH,
      { x1: -dw / 2, y1: -dh / 2, x2: dw / 2, y2: dh / 2 },
      1,
      juice,
    );
  } else {
    g.fillStyle = "#dcb428";
    g.fillRect(-dw / 2, -dh / 2, dw, dh);
  }
  g.restore();
}
