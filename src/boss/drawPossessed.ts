import type { Possessed } from "../entity/Possessed";
import {
  getPossessedRig,
  poseFromSequence,
  poseOffset,
  type PossessedRigData,
} from "./PossessedRig";
import { drawStripFrame, type SpriteStrip } from "../render/SpriteDraw";
import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM } from "../specs";

const BULLET_DIE_FRAME_SEC = 0.18;

export type PossessedDrawAssets = {
  strip: SpriteStrip | null;
  shinyStrip: SpriteStrip | null;
  bulletSheet: ImageBitmap | null;
  bulletDieSheet: ImageBitmap | null;
};

/** Resolve draw pose (sequences for dash / dash_windup). */
function resolvePoseName(boss: Possessed, rig: PossessedRigData): string {
  const base = boss.currentPoseName();
  if (base === "dash_windup" || base === "dash") {
    return poseFromSequence(rig, base, boss.poseAnimProgress());
  }
  return base;
}

function stripForBoss(boss: Possessed, assets: PossessedDrawAssets): SpriteStrip | null {
  if (boss.isShiny() && assets.shinyStrip) return assets.shinyStrip;
  return assets.strip;
}

/**
 * Draw Possessed as four rig parts with pose offsets + bob + knock-loose offsets.
 * Art faces left; facingSign() is already mirrored for facing-right.
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
  }

  const rig = getPossessedRig();
  const strip = stripForBoss(boss, assets);
  const cx = boss.x + boss.w * 0.5;
  const cy = boss.y + boss.h * 0.5;
  const facing = boss.facingSign();
  // facingSign: -1 when facing right (mirror). Pose dx uses art-left space; flip dx when mirrored.
  const mirrorX = facing < 0 ? -1 : 1;

  if (!strip || !rig) {
    // Fallback: single body frame
    if (strip) {
      const left = cx - strip.frameW * 0.5;
      const top = cy - strip.frameH * 0.5;
      drawStripFrame(
        g,
        strip,
        1,
        left,
        top,
        facing,
        camera,
        boss.hitlagSolidRed() ? { solidRed: true } : undefined,
      );
    }
    drawTelegraph(g, boss, camera, cx, cy);
    return;
  }

  const poseName = resolvePoseName(boss, rig);
  const bobAmp = rig.bobAmpPx;
  const bobSpeed = rig.bobSpeedRadPerSec;
  const bobT = boss.bobTimeSec();
  const juice = boss.hitlagSolidRed() ? { solidRed: true as const } : undefined;
  const sims = boss.partSimsCopy();

  if (boss.flashVisible()) {
    // Brief white flash: fill union AABB
    const r = boss.damageReceivePose();
    g.fillStyle = "#ffffff";
    g.fillRect(
      camera.worldToDeviceX(r.x),
      camera.worldToDeviceY(r.y),
      Math.floor(CAMERA_ZOOM * r.w),
      Math.floor(CAMERA_ZOOM * r.h),
    );
  } else {
    for (const name of rig.drawOrder) {
      const part = rig.parts.find((p) => p.name === name);
      if (!part) continue;
      const pe = poseOffset(rig, poseName, name);
      const sim = sims.find((s) => s.name === name);
      const phase = part.frame * 1.7;
      const amp = bobAmp * part.bobScale;
      const bx = amp * Math.sin(bobT * bobSpeed + phase);
      const by = amp * Math.sin(bobT * bobSpeed * 1.3 + phase * 1.7);
      const partCx = cx + mirrorX * pe.dx + bx + (sim?.ox ?? 0);
      const partCy = cy + pe.dy + by + (sim?.oy ?? 0);
      const left = partCx - part.pivotX;
      const top = partCy - part.pivotY;
      // Light spin via canvas rotate when knocked loose.
      const spin = sim?.angleDeg ?? 0;
      if (Math.abs(spin) > 0.5) {
        const dx = camera.worldToDeviceX(partCx);
        const dy = camera.worldToDeviceY(partCy);
        g.save();
        g.translate(dx, dy);
        g.rotate((spin * Math.PI) / 180);
        g.translate(-dx, -dy);
        drawStripFrame(g, strip, part.frame, left, top, facing, camera, juice);
        g.restore();
      } else {
        drawStripFrame(g, strip, part.frame, left, top, facing, camera, juice);
      }
    }
  }

  drawTelegraph(g, boss, camera, cx, cy);
}

function drawTelegraph(
  g: CanvasRenderingContext2D,
  boss: Possessed,
  camera: WorldCamera,
  cx: number,
  cy: number,
): void {
  if (!boss.isWindingUp()) return;
  if (boss.pendingAttackType() === "DASH") return;

  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 80);
  const rdx = camera.worldToDeviceX(cx);
  const rdy = camera.worldToDeviceY(cy);

  if (boss.isNovaWindup()) {
    const p = boss.windupProgress();
    const r = Math.floor(CAMERA_ZOOM * (18 + (1 - p) * 10 + pulse * 3));
    g.strokeStyle = `rgba(200,160,255,${0.35 + pulse * 0.45})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(rdx, rdy, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.2 + p * 0.4})`;
    g.beginPath();
    g.arc(rdx, rdy, Math.floor(CAMERA_ZOOM * (8 + p * 4)), 0, Math.PI * 2);
    g.stroke();
    return;
  }

  // Aimed / volley / fan / counter: charge ring toward aim
  const aimDx = boss.getAimDx();
  const aimDy = boss.getAimDy();
  const p = boss.windupProgress();
  const orbCx = cx + aimDx * (4 + 3 * p);
  const orbCy = cy + aimDy * (4 + 3 * p);
  g.strokeStyle = `rgba(255,220,120,${0.4 + pulse * 0.5})`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(
    camera.worldToDeviceX(orbCx),
    camera.worldToDeviceY(orbCy),
    Math.floor(CAMERA_ZOOM * (6 + p * 4 + pulse * 2)),
    0,
    Math.PI * 2,
  );
  g.stroke();
}

/** Live bullets + brief die strip when culled. */
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
