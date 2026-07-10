import type { CombatEnemy } from "../entity/CombatEnemy";
import { SquashStretch } from "../render/SquashStretch";
import { CAMERA_ZOOM } from "../specs";
import type { WorldCamera } from "../camera/WorldCamera";
import type { Aabb } from "../combat/CombatMath";

/** Java CombatHitVfx constants. */
export const HIT_VFX_FADE_FRAMES = 20;
export const HIT_VFX_DRAW_SCALE = 1.2;
export const HIT_VFX_FADE_ROTATION_RAD = Math.PI * 0.5;

/** On-hit spark kinds we ship for Phase 3+ sword (Java HitVfxKind subset). */
export enum HitVfxKind {
  SLASH = "slash",
  ELECTRIC = "electric",
  SHIELD = "shield",
  SHIELD_BREAK = "shield_break",
  FALLBACK = "fallback",
}

export function hitVfxSpriteFile(kind: HitVfxKind): string {
  switch (kind) {
    case HitVfxKind.SLASH:
      return "hit slash.png";
    case HitVfxKind.ELECTRIC:
      return "hit electric.png";
    case HitVfxKind.SHIELD:
      return "hit shield.png";
    case HitVfxKind.SHIELD_BREAK:
      return "hit shield break.png";
    case HitVfxKind.FALLBACK:
      return "hit fallback.png";
  }
}

/**
 * Two-phase on-hit spark (Java HitVfx): frame 0 through hitlag with scale ease + opposite shake;
 * then frame 1 rotates away while fading.
 */
export class HitVfx {
  readonly kind: HitVfxKind;
  readonly enemy: CombatEnemy | null;
  readonly baseWorldX: number;
  readonly baseWorldY: number;
  readonly attackerCenterWorldX: number;
  private readonly impactScale = new SquashStretch();
  private hitlagFramesRemaining: number;
  private fadeFramesRemaining = 0;

  constructor(
    kind: HitVfxKind,
    enemy: CombatEnemy | null,
    baseWorldX: number,
    baseWorldY: number,
    hitlagFrames: number,
    attackerCenterWorldX: number,
  ) {
    this.kind = kind;
    this.enemy = enemy;
    this.baseWorldX = baseWorldX;
    this.baseWorldY = baseWorldY;
    this.attackerCenterWorldX = attackerCenterWorldX;
    this.hitlagFramesRemaining = Math.max(0, hitlagFrames);
    if (this.hitlagFramesRemaining > 0) {
      this.impactScale.applyStretchX(HIT_VFX_DRAW_SCALE, this.hitlagFramesRemaining);
    }
  }

  static spawn(
    out: HitVfx[],
    kind: HitVfxKind,
    enemy: CombatEnemy,
    contactWorldX: number,
    contactWorldY: number,
    hitlagFrames: number,
    attackerCenterWorldX: number,
  ): void {
    out.push(
      new HitVfx(
        kind,
        enemy,
        contactWorldX,
        contactWorldY,
        hitlagFrames,
        attackerCenterWorldX,
      ),
    );
  }

  /** @returns true when finished. */
  tick(): boolean {
    if (this.hitlagFramesRemaining > 0) {
      this.impactScale.tick();
      this.hitlagFramesRemaining--;
      if (this.hitlagFramesRemaining <= 0) {
        this.fadeFramesRemaining = HIT_VFX_FADE_FRAMES;
      }
      return false;
    }
    if (this.fadeFramesRemaining > 0) this.fadeFramesRemaining--;
    return this.fadeFramesRemaining <= 0;
  }

  static tickAll(fx: HitVfx[]): void {
    for (let i = fx.length - 1; i >= 0; i--) {
      if (fx[i]!.tick()) fx.splice(i, 1);
    }
  }

  draw(
    g: CanvasRenderingContext2D,
    camera: WorldCamera,
    sheet: ImageBitmap,
  ): void {
    const frameCount = 2;
    const frameW = Math.max(1, Math.floor(sheet.width / frameCount));
    const sh = sheet.height;
    let frameIndex = 0;
    let alpha = 1;
    let angleRad = 0;

    if (this.hitlagFramesRemaining > 0) {
      frameIndex = 0;
    } else {
      const fadeTotal = HIT_VFX_FADE_FRAMES;
      const fadeElapsed = fadeTotal - this.fadeFramesRemaining;
      const u = fadeTotal > 0 ? fadeElapsed / fadeTotal : 1;
      const uu = Math.max(0, Math.min(1, u));
      frameIndex = 1;
      alpha = 1 - uu;
      const clockwise = this.baseWorldX >= this.attackerCenterWorldX;
      angleRad = (clockwise ? 1 : -1) * HIT_VFX_FADE_ROTATION_RAD * uu;
    }

    const shake =
      this.hitlagFramesRemaining > 0 ? enemyShake(this.enemy) : { x: 0, y: 0 };
    const cx = this.baseWorldX + shake.x;
    const cy = this.baseWorldY + shake.y;
    const drawScale =
      this.hitlagFramesRemaining > 0 ? this.impactScale.scaleX() : 1;
    const dw = Math.round(CAMERA_ZOOM * frameW * drawScale);
    const dh = Math.round(CAMERA_ZOOM * sh * drawScale);
    const dx = camera.worldToDeviceX(cx);
    const dy = camera.worldToDeviceY(cy);
    const sx0 = frameIndex * frameW;

    g.save();
    g.globalAlpha = alpha;
    g.imageSmoothingEnabled = false;
    if (Math.abs(angleRad) > 1e-6) {
      g.translate(dx, dy);
      g.rotate(angleRad);
      g.translate(-dx, -dy);
    }
    g.drawImage(
      sheet,
      sx0,
      0,
      frameW,
      sh,
      dx - dw / 2,
      dy - dh / 2,
      dw,
      dh,
    );
    g.restore();
  }
}

/** World center of AABB overlap (Java CombatHitVfx.contactBetweenPoses). */
export function contactBetweenAabbs(a: Aabb, b: Aabb): { x: number; y: number } {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (left < right && top < bottom) {
    return { x: left + (right - left) * 0.5, y: top + (bottom - top) * 0.5 };
  }
  return { x: b.x + b.w * 0.5, y: b.y + b.h * 0.5 };
}

export function drawHitVfx(
  g: CanvasRenderingContext2D,
  fxList: HitVfx[],
  camera: WorldCamera,
  sprites: Map<HitVfxKind, ImageBitmap>,
): void {
  for (const spark of fxList) {
    let sheet = sprites.get(spark.kind);
    if (!sheet) sheet = sprites.get(HitVfxKind.FALLBACK);
    if (!sheet) continue;
    spark.draw(g, camera, sheet);
  }
}

function enemyShake(e: CombatEnemy | null): { x: number; y: number } {
  if (!e) return { x: 0, y: 0 };
  const any = e as CombatEnemy & { hitlagShakeX?: number; hitlagShakeY?: number };
  return {
    x: -(any.hitlagShakeX ?? 0),
    y: -(any.hitlagShakeY ?? 0),
  };
}
