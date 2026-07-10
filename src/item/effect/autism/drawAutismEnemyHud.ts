import type { CombatEnemy } from "../../../entity/CombatEnemy";
import type { WorldCamera } from "../../../camera/WorldCamera";
import { CAMERA_ZOOM } from "../../../specs";
import { AutismCombat } from "../AutismCombat";
import type { AutismDamageFloater } from "./AutismDamageFloater";
import { Crawler } from "../../../entity/Crawler";
import { Mouse } from "../../../entity/Mouse";
import { Possessed } from "../../../entity/Possessed";

/** Java GamePanel autism HUD constants (world px). */
export const AUTISM_BAR_W_WORLD = 16;
export const AUTISM_BAR_H_WORLD = 2;
export const AUTISM_BAR_GAP_ABOVE_HEAD_WORLD = 1;
export const AUTISM_TEXT_GAP_ABOVE_BAR_WORLD = 1;
export const AUTISM_HUD_FONT_SIZE = 12;
export const AUTISM_FLOATER_FONT_SIZE = 16;
export const AUTISM_LABEL_YELLOW = "#ffeb3c";
export const AUTISM_BAR_RED = "#e60000";

/** Per-enemy HP bar and damage floaters while AUTISM is owned. */
export function drawAutismEnemyHud(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  enemies: CombatEnemy[],
  floaters: AutismDamageFloater[],
  viewWorldW: number,
  viewWorldH: number,
): void {
  const view = visibleWorldRect(camera, viewWorldW, viewWorldH);
  g.imageSmoothingEnabled = false;

  for (const e of enemies) {
    if (!autismBarEligible(e)) continue;
    const b = e.rect();
    const headTop = enemyHeadTopWorldY(e);
    if (!autismHudVisibleInViewport(b, headTop, view)) continue;
    const cx = b.x + b.w * 0.5;
    const hp = e.getHealth();
    const maxHp = e.getMaxHealth();
    drawAutismEnemyHpBar(g, camera, cx, headTop, hp, maxHp);
    const label = `${AutismCombat.formatNumber(hp)}/${AutismCombat.formatNumber(maxHp)}`;
    drawAutismOutlinedLabel(g, camera, label, cx, headTop, 1);
  }

  for (const floater of floaters) {
    const fx = floater.worldX();
    const fy = floater.worldY();
    if (!worldPointInRect(view, fx, fy)) continue;
    const text = AutismCombat.formatNumber(floater.damageRaw);
    drawAutismFloaterText(g, camera, text, fx, fy, floater.alpha());
  }
}

function autismBarEligible(e: CombatEnemy): boolean {
  if (e.isDead()) return false;
  if (e instanceof Possessed && e.isDying()) return false;
  if (e instanceof Crawler && e.isDyingVisually()) return false;
  if (e instanceof Mouse && e.isDyingVisually()) return false;
  return e.getHealth() > 0;
}

function enemyHeadTopWorldY(e: CombatEnemy): number {
  const wr = e.rect();
  if (e instanceof Possessed) return wr.y;
  // Feet-pinned crawlers: sprite is typically ~16–24px; use hitbox top as approximation.
  return wr.y;
}

function autismHudVisibleInViewport(
  hitbox: { x: number; y: number; w: number; h: number },
  headTop: number,
  view: { x: number; y: number; w: number; h: number },
): boolean {
  const hudTop = headTop - AUTISM_BAR_GAP_ABOVE_HEAD_WORLD - AUTISM_BAR_H_WORLD - 8;
  const hudH = Math.max(1, hitbox.y + hitbox.h - hudTop);
  return rectsIntersect(view, { x: hitbox.x, y: hudTop, w: hitbox.w, h: hudH });
}

function drawAutismEnemyHpBar(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  centerWorldX: number,
  headTopWorldY: number,
  hp: number,
  maxHp: number,
): void {
  const max = Math.max(1e-9, maxHp);
  const cur = Math.max(0, Math.min(max, hp));
  const frac = cur / max;

  const barBottomWorldY = headTopWorldY - AUTISM_BAR_GAP_ABOVE_HEAD_WORLD;
  const barTopWorldY = barBottomWorldY - AUTISM_BAR_H_WORLD;
  const barLeftWorldX = centerWorldX - AUTISM_BAR_W_WORLD * 0.5;

  const dx0 = camera.worldToDeviceX(barLeftWorldX);
  const dy0 = camera.worldToDeviceY(barTopWorldY);
  const dx1 = camera.worldToDeviceX(barLeftWorldX + AUTISM_BAR_W_WORLD);
  const dy1 = camera.worldToDeviceY(barBottomWorldY);
  const bw = Math.max(1, dx1 - dx0);
  const bh = Math.max(1, dy1 - dy0);
  const fillW = Math.max(0, Math.round(bw * frac));

  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fillRect(dx0, dy0, bw, bh);
  if (fillW > 0) {
    g.fillStyle = AUTISM_BAR_RED;
    g.fillRect(dx0, dy0, fillW, bh);
  }
}

function drawAutismOutlinedLabel(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  text: string,
  centerWorldX: number,
  anchorHeadTopWorldY: number,
  alpha: number,
): void {
  g.font = `${AUTISM_HUD_FONT_SIZE}px monospace`;
  const tw = g.measureText(text).width;
  const barTopWorldY =
    anchorHeadTopWorldY - AUTISM_BAR_GAP_ABOVE_HEAD_WORLD - AUTISM_BAR_H_WORLD;
  const textBaselineWorldY = barTopWorldY - AUTISM_TEXT_GAP_ABOVE_BAR_WORLD;
  const tx = camera.worldToDeviceX(centerWorldX) - tw / 2;
  const ty = camera.worldToDeviceY(textBaselineWorldY);
  drawAutismOutlinedText(g, text, tx, ty, alpha);
}

function drawAutismFloaterText(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  text: string,
  worldX: number,
  worldY: number,
  alpha: number,
): void {
  g.font = `${AUTISM_FLOATER_FONT_SIZE}px monospace`;
  const tw = g.measureText(text).width;
  const tx = camera.worldToDeviceX(worldX) - tw / 2;
  const ty = camera.worldToDeviceY(worldY);
  drawAutismOutlinedText(g, text, tx, ty, alpha);
}

function drawAutismOutlinedText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  alpha: number,
): void {
  const a = Math.min(1, Math.max(0, alpha));
  if (a <= 0) return;
  g.textBaseline = "alphabetic";
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      if (ox === 0 && oy === 0) continue;
      g.fillStyle = `rgba(0,0,0,${a})`;
      g.fillText(text, x + ox, y + oy);
    }
  }
  g.fillStyle = `rgba(255,235,60,${a})`;
  g.fillText(text, x, y);
}

function visibleWorldRect(
  camera: WorldCamera,
  viewW: number,
  viewH: number,
): { x: number; y: number; w: number; h: number } {
  const halfW = viewW / (2 * CAMERA_ZOOM);
  const halfH = viewH / (2 * CAMERA_ZOOM);
  const ax = (viewW * 0.5 - camera.tx) / CAMERA_ZOOM;
  const ay = (viewH * 0.5 - camera.ty) / CAMERA_ZOOM;
  return { x: ax - halfW, y: ay - halfH, w: 2 * halfW, h: 2 * halfH };
}

function worldPointInRect(
  r: { x: number; y: number; w: number; h: number },
  wx: number,
  wy: number,
): boolean {
  return wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h;
}

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
