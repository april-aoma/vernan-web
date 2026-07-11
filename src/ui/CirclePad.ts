/**
 * Web-only virtual circle pad (analog stick chrome → 8-way digital).
 * Fixed bottom-left of the world viewport; styled to match HUD touch chrome.
 */

import { WORLD_VIEWPORT_H } from "../specs";

export const CIRCLE_PAD_OUTER_R = 36;
export const CIRCLE_PAD_KNOB_R = 13;
/** Dead-zone as a fraction of outer radius before a direction registers. */
export const CIRCLE_PAD_DEAD_ZONE = 0.28;
/** Extra hit padding beyond the outer ring (device px). */
export const CIRCLE_PAD_HIT_PAD = 8;

export type CirclePadLayout = {
  cx: number;
  cy: number;
  outerR: number;
  knobR: number;
};

export type CirclePadDirs = {
  up: boolean;
  left: boolean;
  down: boolean;
  right: boolean;
};

export type CirclePadDrawState = {
  /** Knob offset from center, clamped to outer ring (device px). */
  knobDx: number;
  knobDy: number;
  /** True while a pointer is actively dragging the pad. */
  active: boolean;
  dirs: CirclePadDirs;
};

/** Fixed bottom-left placement above the HUD band. */
export function computeCirclePadLayout(): CirclePadLayout {
  const outerR = CIRCLE_PAD_OUTER_R;
  const margin = 14;
  return {
    cx: margin + outerR,
    cy: WORLD_VIEWPORT_H - margin - outerR,
    outerR,
    knobR: CIRCLE_PAD_KNOB_R,
  };
}

export function hitTestCirclePad(ix: number, iy: number, layout: CirclePadLayout): boolean {
  const dx = ix - layout.cx;
  const dy = iy - layout.cy;
  const r = layout.outerR + CIRCLE_PAD_HIT_PAD;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Map a pointer position to clamped knob offset + 8-way digital dirs.
 * Angle 0 = right, increases clockwise (canvas Y-down).
 */
export function sampleCirclePad(
  ix: number,
  iy: number,
  layout: CirclePadLayout,
): { knobDx: number; knobDy: number; dirs: CirclePadDirs } {
  let dx = ix - layout.cx;
  let dy = iy - layout.cy;
  const len = Math.hypot(dx, dy);
  if (len > layout.outerR && len > 1e-6) {
    const s = layout.outerR / len;
    dx *= s;
    dy *= s;
  }
  const mag = Math.hypot(dx, dy) / Math.max(1e-6, layout.outerR);
  if (mag < CIRCLE_PAD_DEAD_ZONE) {
    return {
      knobDx: dx,
      knobDy: dy,
      dirs: { up: false, left: false, down: false, right: false },
    };
  }
  // 8-way: snap to nearest 45° sector (Y-down: up is -Y).
  const angle = Math.atan2(dy, dx);
  const sector = Math.round(angle / (Math.PI / 4));
  const dirs: CirclePadDirs = { up: false, left: false, down: false, right: false };
  switch (((sector % 8) + 8) % 8) {
    case 0: // right
      dirs.right = true;
      break;
    case 1: // down-right
      dirs.right = true;
      dirs.down = true;
      break;
    case 2: // down
      dirs.down = true;
      break;
    case 3: // down-left
      dirs.left = true;
      dirs.down = true;
      break;
    case 4: // left
      dirs.left = true;
      break;
    case 5: // up-left
      dirs.left = true;
      dirs.up = true;
      break;
    case 6: // up
      dirs.up = true;
      break;
    case 7: // up-right
      dirs.right = true;
      dirs.up = true;
      break;
  }
  return { knobDx: dx, knobDy: dy, dirs };
}

export function circlePadDirsToKeyCodes(dirs: CirclePadDirs): string[] {
  const codes: string[] = [];
  if (dirs.up) codes.push("ArrowUp");
  if (dirs.left) codes.push("ArrowLeft");
  if (dirs.down) codes.push("ArrowDown");
  if (dirs.right) codes.push("ArrowRight");
  return codes;
}

/** Draw outer ring + knob (HUD chrome colors). */
export function drawCirclePad(
  g: CanvasRenderingContext2D,
  layout: CirclePadLayout,
  state: CirclePadDrawState,
  alpha = 1,
): void {
  if (alpha <= 0.01) return;
  g.save();
  if (alpha < 0.99) g.globalAlpha = alpha;
  g.imageSmoothingEnabled = false;

  const { cx, cy, outerR, knobR } = layout;
  const active = state.active;
  const anyDir = state.dirs.up || state.dirs.left || state.dirs.down || state.dirs.right;
  const stroke = active || anyDir ? "rgba(240,220,120,0.85)" : "rgba(255,255,255,0.43)";
  const fill = active || anyDir ? "rgba(240,220,120,0.18)" : "rgba(255,255,255,0.06)";

  // Outer disc
  g.beginPath();
  g.arc(cx, cy, outerR, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = stroke;
  g.lineWidth = 1;
  g.stroke();

  // Cardinal ticks (subtle)
  g.strokeStyle = active || anyDir ? "rgba(240,220,120,0.45)" : "rgba(255,255,255,0.22)";
  const tickIn = outerR - 5;
  const tickOut = outerR - 1;
  const ticks: [number, number][] = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  for (const [tx, ty] of ticks) {
    g.beginPath();
    g.moveTo(cx + tx * tickIn, cy + ty * tickIn);
    g.lineTo(cx + tx * tickOut, cy + ty * tickOut);
    g.stroke();
  }

  // Knob
  const kx = cx + state.knobDx;
  const ky = cy + state.knobDy;
  g.beginPath();
  g.arc(kx, ky, knobR, 0, Math.PI * 2);
  g.fillStyle = active || anyDir ? "rgba(240,220,120,0.55)" : "rgba(255,255,255,0.28)";
  g.fill();
  g.strokeStyle = active || anyDir ? "#f0dc78" : "rgba(255,255,255,0.55)";
  g.stroke();

  g.restore();
}
