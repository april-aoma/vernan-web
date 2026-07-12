/**
 * Web-only virtual controller chrome for the display shell.
 * Circle pad + clustered Z/X/C face buttons + L pause / R Shift shoulders.
 * Side assignment is parameterized for a future handedness flip.
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

const FACE_R = 22;
const SHOULDER_R = 16;
const FACE_GAP = 6;
const HIT_PAD = 6;

function clampRadius(region: ShellRect, preferred: number): number {
  const lim = Math.floor(Math.min(region.w, region.h) * 0.22);
  return Math.max(14, Math.min(preferred, lim));
}

/** Place the circle pad centered in its region. */
export function computeStickInRegion(region: ShellRect): CirclePadLayout {
  const outerR = clampRadius(region, CIRCLE_PAD_OUTER_R);
  const margin = Math.max(8, Math.floor(Math.min(region.w, region.h) * 0.06));
  const cx = region.x + Math.floor(region.w / 2);
  // Bias slightly toward the play edge / vertical center.
  const cy = region.y + Math.floor(region.h * 0.55);
  const maxR = Math.min(cx - region.x, region.x + region.w - cx, cy - region.y, region.y + region.h - cy) - margin;
  const r = Math.max(14, Math.min(outerR, maxR));
  return {
    cx,
    cy,
    outerR: r,
    knobR: Math.max(8, Math.round((r / CIRCLE_PAD_OUTER_R) * CIRCLE_PAD_KNOB_R)),
  };
}

/**
 * Face cluster: Z above, X left, C right — tight for chords.
 * Shoulders sit above the cluster (II left, R right).
 */
export function computeFaceInRegion(region: ShellRect): CircleButtonLayout[] {
  const faceR = clampRadius(region, FACE_R);
  const shoulderR = Math.max(12, Math.min(SHOULDER_R, faceR - 4));
  const pitch = faceR * 2 + FACE_GAP;
  const clusterW = pitch + faceR; // X center to C center ≈ pitch
  const clusterH = pitch + faceR;
  const shoulderRowH = shoulderR * 2 + 10;
  const totalH = clusterH + shoulderRowH;
  const cx = region.x + Math.floor(region.w / 2);
  let cy = region.y + Math.floor(region.h * 0.52);
  // Keep cluster inside region.
  const halfH = Math.ceil(totalH / 2);
  cy = Math.max(region.y + halfH + 4, Math.min(cy, region.y + region.h - halfH - 4));

  const jump = { cx, cy: cy - Math.floor(pitch * 0.55), r: faceR, id: "jump" as const, label: "Z" };
  const attack = {
    cx: cx - Math.floor(pitch * 0.55),
    cy: cy + Math.floor(pitch * 0.35),
    r: faceR,
    id: "attack" as const,
    label: "X",
  };
  const sub = {
    cx: cx + Math.floor(pitch * 0.55),
    cy: cy + Math.floor(pitch * 0.35),
    r: faceR,
    id: "sub" as const,
    label: "C",
  };
  const shoulderY = Math.min(jump.cy, attack.cy, sub.cy) - faceR - shoulderR - 8;
  const pause = {
    cx: cx - Math.floor(clusterW * 0.35),
    cy: Math.max(region.y + shoulderR + 4, shoulderY),
    r: shoulderR,
    id: "pause" as const,
    label: "II",
  };
  const dodge = {
    cx: cx + Math.floor(clusterW * 0.35),
    cy: pause.cy,
    r: shoulderR,
    id: "dodge" as const,
    label: "R",
  };
  return [jump, attack, sub, pause, dodge];
}

export function computeVirtualControllerLayout(
  stickRegion: ShellRect,
  faceRegion: ShellRect,
): VirtualControllerLayout {
  return {
    stick: computeStickInRegion(stickRegion),
    buttons: computeFaceInRegion(faceRegion),
  };
}

export function hitTestFaceButton(
  ix: number,
  iy: number,
  buttons: CircleButtonLayout[],
): FaceButtonId | null {
  // Prefer smaller shoulders / closer centers — test nearest hit.
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
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = pressed ? "#f0dc78" : "#ffffff";
  g.font = b.r >= 20 ? "11px monospace" : "9px monospace";
  const tw = g.measureText(b.label).width;
  g.fillText(b.label, b.cx - tw / 2, b.cy + 4);
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
