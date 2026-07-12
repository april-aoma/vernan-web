/**
 * Web-only virtual controller chrome for the display shell.
 *
 * Layout (default handedness):
 *   Stick side — circle pad; pause (II) above and to the left of the stick.
 *   Face side  — Z/X/C triangle; dodge (R) above and to the right of that cluster.
 */

import type { ShellRect } from "../display/DisplayShell";
import {
  CIRCLE_PAD_HIT_PAD,
  CIRCLE_PAD_KNOB_R,
  CIRCLE_PAD_OUTER_R,
  drawCirclePad,
  hitTestCirclePad,
  sampleCirclePad,
  type CirclePadDrawState,
  type CirclePadLayout,
} from "./CirclePad";

export type FaceButtonId = "jump" | "attack" | "sub" | "pause" | "dodge";

export type CircleButtonLayout = {
  id: FaceButtonId;
  cx: number;
  cy: number;
  r: number;
  label: string;
};

export type VirtualControllerLayout = {
  stick: CirclePadLayout;
  buttons: CircleButtonLayout[];
};

export type VirtualControllerHeld = {
  jump: boolean;
  attack: boolean;
  sub: boolean;
  dodge: boolean;
  pause: boolean;
};

/** Preferred radii — clamped to fit each control region. */
const FACE_R = 44;
const SHOULDER_R = 30;
const FACE_GAP = 8;
const HIT_PAD = 10;

function clampRadius(region: ShellRect, preferred: number, frac = 0.28): number {
  const lim = Math.floor(Math.min(region.w, region.h) * frac);
  return Math.max(18, Math.min(preferred, lim));
}

function clampIntoRegion(
  cx: number,
  cy: number,
  r: number,
  region: ShellRect,
  pad = 2,
): { cx: number; cy: number } {
  return {
    cx: Math.max(region.x + r + pad, Math.min(cx, region.x + region.w - r - pad)),
    cy: Math.max(region.y + r + pad, Math.min(cy, region.y + region.h - r - pad)),
  };
}

/**
 * Stick anchored to the bottom-left of its region (mirrors face cluster on the right),
 * with room above-left for the pause button.
 */
export function computeStickInRegion(region: ShellRect): CirclePadLayout {
  const pad = 4;
  const shoulderR = Math.max(14, Math.min(SHOULDER_R, Math.floor(Math.min(region.w, region.h) * 0.18)));
  const preferred = Math.max(CIRCLE_PAD_OUTER_R * 2, 56);

  // Leave a pause-sized pocket above-left; size the stick to fit what's left.
  const maxByW = Math.floor((region.w - pad * 2 - shoulderR * 0.5) * 0.45);
  const maxByH = Math.floor((region.h - pad * 2 - shoulderR - 8) * 0.5);
  const r = Math.max(18, Math.min(preferred, maxByW, maxByH, clampRadius(region, preferred, 0.4)));

  // Bottom-left of the stick region (screen bottom-left in portrait).
  const cx = region.x + pad + Math.floor(r * 1.15);
  const cy = region.y + region.h - pad - r;
  const clamped = clampIntoRegion(cx, cy, r, region, pad);

  return {
    cx: clamped.cx,
    cy: clamped.cy,
    outerR: r,
    knobR: Math.max(10, Math.round((r / CIRCLE_PAD_OUTER_R) * CIRCLE_PAD_KNOB_R * 1.4)),
  };
}

/** Pause (II): above the stick and to its left. */
function computePauseForStick(
  stick: CirclePadLayout,
  region: ShellRect,
): CircleButtonLayout {
  const r = Math.max(14, Math.min(SHOULDER_R, Math.floor(stick.outerR * 0.55)));
  const gap = 6;
  let cx = stick.cx - stick.outerR * 0.65;
  let cy = stick.cy - stick.outerR - r - gap;
  const c = clampIntoRegion(cx, cy, r, region);
  return { id: "pause", cx: c.cx, cy: c.cy, r, label: "II" };
}

/**
 * Face cluster: Z above, X left, C right — kept fully inside the face region.
 * R sits above and to the right of that trio.
 */
export function computeFaceInRegion(region: ShellRect): CircleButtonLayout[] {
  const pad = 4;
  const shoulderRPreferred = SHOULDER_R;

  // Size face buttons so the triangle + R footprint fits in the region.
  // Footprint approx: width ≈ pitch + faceR + shoulder clearance; height ≈ pitch + faceR + shoulder row.
  const maxFaceByW = Math.floor((region.w - pad * 2 - shoulderRPreferred) / 3.2);
  const maxFaceByH = Math.floor((region.h - pad * 2 - shoulderRPreferred) / 2.8);
  const faceR = Math.max(18, Math.min(FACE_R, maxFaceByW, maxFaceByH));
  const shoulderR = Math.max(14, Math.min(shoulderRPreferred, Math.floor(faceR * 0.7)));
  const pitch = faceR * 2 + FACE_GAP;

  const clusterW = pitch + faceR; // X..C span roughly
  const clusterH = pitch + faceR;
  // Extra room on the top-right for R.
  const footprintW = clusterW + shoulderR + faceR * 0.35;
  const footprintH = clusterH + shoulderR + 10;

  // Anchor the ZXC cluster in the lower-left of the face region so R fits top-right.
  const clusterOriginX =
    region.x + pad + Math.max(0, Math.floor((region.w - pad * 2 - footprintW) * 0.15));
  const clusterOriginY =
    region.y + pad + Math.max(0, Math.floor(region.h - pad * 2 - footprintH));

  const midX = clusterOriginX + Math.floor(footprintW * 0.42);
  const midY = clusterOriginY + shoulderR + 8 + Math.floor(clusterH * 0.55);

  const jumpRaw = {
    cx: midX,
    cy: midY - Math.floor(pitch * 0.55),
    r: faceR,
  };
  const attackRaw = {
    cx: midX - Math.floor(pitch * 0.55),
    cy: midY + Math.floor(pitch * 0.35),
    r: faceR,
  };
  const subRaw = {
    cx: midX + Math.floor(pitch * 0.55),
    cy: midY + Math.floor(pitch * 0.35),
    r: faceR,
  };

  const jumpC = clampIntoRegion(jumpRaw.cx, jumpRaw.cy, faceR, region, pad);
  const attackC = clampIntoRegion(attackRaw.cx, attackRaw.cy, faceR, region, pad);
  const subC = clampIntoRegion(subRaw.cx, subRaw.cy, faceR, region, pad);

  const jump: CircleButtonLayout = { ...jumpC, r: faceR, id: "jump", label: "Z" };
  const attack: CircleButtonLayout = { ...attackC, r: faceR, id: "attack", label: "X" };
  const sub: CircleButtonLayout = { ...subC, r: faceR, id: "sub", label: "C" };

  // R: above and to the right of the ZXC trio.
  const dodgeRaw = {
    cx: Math.max(jump.cx, sub.cx) + Math.floor(faceR * 0.35),
    cy: jump.cy - faceR - shoulderR - 4,
    r: shoulderR,
  };
  const dodgeC = clampIntoRegion(dodgeRaw.cx, dodgeRaw.cy, shoulderR, region, pad);
  const dodge: CircleButtonLayout = {
    ...dodgeC,
    r: shoulderR,
    id: "dodge",
    label: "R",
  };

  return [jump, attack, sub, dodge];
}

export function computeVirtualControllerLayout(
  stickRegion: ShellRect,
  faceRegion: ShellRect,
): VirtualControllerLayout {
  const stick = computeStickInRegion(stickRegion);
  const pause = computePauseForStick(stick, stickRegion);
  const face = computeFaceInRegion(faceRegion);
  return {
    stick,
    buttons: [...face, pause],
  };
}

export function hitTestFaceButton(
  ix: number,
  iy: number,
  buttons: CircleButtonLayout[],
): FaceButtonId | null {
  let best: FaceButtonId | null = null;
  let bestDist = Infinity;
  for (const b of buttons) {
    const dx = ix - b.cx;
    const dy = iy - b.cy;
    const rr = b.r + HIT_PAD;
    const d2 = dx * dx + dy * dy;
    if (d2 <= rr * rr && d2 < bestDist) {
      bestDist = d2;
      best = b.id;
    }
  }
  return best;
}

/** Face buttons that participate in slide-to-remap (not pause tap). */
export function isSlideRemapFaceButton(id: FaceButtonId): boolean {
  return id === "jump" || id === "attack" || id === "sub" || id === "dodge";
}

export function faceButtonKeyCode(id: FaceButtonId): string | null {
  switch (id) {
    case "jump":
      return "KeyZ";
    case "attack":
      return "KeyX";
    case "sub":
      return "KeyC";
    case "dodge":
      return "ShiftLeft";
    case "pause":
      return null;
  }
}

function drawCircleButton(
  g: CanvasRenderingContext2D,
  b: CircleButtonLayout,
  pressed: boolean,
): void {
  const stroke = pressed ? "rgba(240,220,120,0.85)" : "rgba(255,255,255,0.43)";
  const fill = pressed ? "rgba(240,220,120,0.28)" : "rgba(255,255,255,0.06)";
  g.beginPath();
  g.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = stroke;
  g.lineWidth = Math.max(1, Math.round(b.r / 22));
  g.stroke();
  g.fillStyle = pressed ? "#f0dc78" : "#ffffff";
  g.font = b.r >= 36 ? "16px monospace" : b.r >= 24 ? "13px monospace" : "10px monospace";
  const tw = g.measureText(b.label).width;
  g.fillText(b.label, b.cx - tw / 2, b.cy + Math.floor(b.r * 0.18));
}

export function drawVirtualController(
  g: CanvasRenderingContext2D,
  layout: VirtualControllerLayout,
  stickState: CirclePadDrawState,
  held: VirtualControllerHeld,
  alpha = 1,
): void {
  if (alpha <= 0.01) return;
  g.save();
  if (alpha < 0.99) g.globalAlpha = alpha;
  g.imageSmoothingEnabled = false;
  drawCirclePad(g, layout.stick, stickState, 1);
  for (const b of layout.buttons) {
    const pressed =
      (b.id === "jump" && held.jump) ||
      (b.id === "attack" && held.attack) ||
      (b.id === "sub" && held.sub) ||
      (b.id === "dodge" && held.dodge) ||
      (b.id === "pause" && held.pause);
    drawCircleButton(g, b, pressed);
  }
  g.restore();
}

export { hitTestCirclePad, sampleCirclePad, CIRCLE_PAD_HIT_PAD };
