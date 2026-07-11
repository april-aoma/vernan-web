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
import { blitTintedSpriteCell } from "../render/JuiceDraw";
import type { SpriteStrip } from "../render/SpriteDraw";
import { CAMERA_ZOOM } from "../specs";

/**
 * Golden roach draw (Java GamePanel golden roach branch + drawCenterAnchoredRotatedSquashedSpriteDevice).
 * Full sheet frame is drawn center-anchored on the hitbox (fly frames are 16×16 with padded art).
 */
export function drawGoldenRoach(
  g: CanvasRenderingContext2D,
  roach: GoldenRoach,
  camera: WorldCamera,
  walkStrip: SpriteStrip | null,
  flyStrip: SpriteStrip | null,
  simTicks = 0,
): void {
  if (roach.isDead()) return;
  const flying = roach.getMode() === "fly";
  const strip = flying ? flyStrip : walkStrip;
  const fallbackW = flying ? GOLDEN_ROACH_FLY_SPRITE_W : GOLDEN_ROACH_WALK_SPRITE_W;
  const fallbackH = flying ? GOLDEN_ROACH_FLY_SPRITE_H : GOLDEN_ROACH_WALK_SPRITE_H;
  const frameCount = flying ? GOLDEN_ROACH_FLY_FRAMES : GOLDEN_ROACH_WALK_FRAMES;
  const sw = strip?.frameW ?? fallbackW;
  const sh = strip?.frameH ?? fallbackH;
  const rect = roach.rect();
  const cx = rect.x + rect.w * 0.5;
  const cy = rect.y + rect.h * 0.5;
  const angle = roach.renderAngleRad();
  const fi = Math.max(0, Math.min(frameCount - 1, roach.getAnimFrame()));
  const sx = fi * sw;

  const shakeDevX = Math.round(roach.hitlagShakeX * CAMERA_ZOOM);
  const shakeDevY = Math.round(roach.hitlagShakeY * CAMERA_ZOOM);
  const dcx = camera.worldToDeviceX(cx) + shakeDevX;
  const dcy = camera.worldToDeviceY(cy) + shakeDevY;
  const baseDw = Math.round(CAMERA_ZOOM * sw);
  const baseDh = Math.round(CAMERA_ZOOM * sh);
  const squashX = roach.squash.scaleX();
  const squashY = roach.squash.scaleY();

  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(dcx, dcy);
  if (Math.abs(angle) > 1e-4) g.rotate(angle);
  g.scale((squashX * baseDw) / sw, (squashY * baseDh) / sh);
  g.translate(-sw * 0.5, -sh * 0.5);

  if (strip) {
    blitTintedSpriteCell(
      g,
      strip.image,
      sx,
      0,
      sw,
      sh,
      0,
      0,
      sw,
      sh,
      {
        solidRed: roach.hitlagSolidRed,
        electrocuteBw: roach.hitlagElectrocute && roach.hitstun > 0,
        simTicks,
        hurtTintAlpha: roach.hurtTintAlpha(),
      },
    );
  } else {
    g.fillStyle = "#dcb428";
    g.fillRect(0, 0, sw, sh);
  }
  g.restore();
}
