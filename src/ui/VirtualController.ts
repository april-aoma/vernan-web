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

/** ~2× the first-pass radii — still fits side gutters / bottom band. */
const FACE_R = 44;
const SHOULDER_R = 32;
const FACE_GAP = 8;
const HIT_PAD = 10;

function clampRadius(region: ShellRect, preferred: number, frac = 0.28): number {
  const lim = Math.floor(Math.min(region.w, region.h) * frac);
  return Math.max(18, Math.min(preferred, lim));
}

/** Place the circle pad centered in its region. */
export function computeStickInRegion(region: ShellRect): CirclePadLayout {
  const preferred = Math.max(CIRCLE_PAD_OUTER_R * 2, 56);
  const outerR = clampRadius(region, preferred, 0.36);
  const margin = Math.max(6, Math.floor(Math.min(region.w, region.h) * 0.04));
  const cx = region.x + Math.floor(region.w / 2);
  const cy = region.y + Math.floor(region.h * 0.55);
  const maxR =
    Math.min(
      cx - region.x,
      region.x + region.w - cx,
      cy - region.y,
      region.y + region.h - cy,
    ) - margin;
  const r = Math.max(18, Math.min(outerR, maxR));
  return {
    cx,
    cy,
    outerR: r,
    knobR: Math.max(10, Math.round((r / CIRCLE_PAD_OUTER_R) * CIRCLE_PAD_KNOB_R * 1.4)),
  };
}

/**
 * Face cluster: Z above, X left, C right — tight for chords.
 * Shoulders flank the cluster (II left, R right) at mid height.
 */
export function computeFaceInRegion(region: ShellRect): CircleButtonLayout[] {
  const faceR = clampRadius(region, FACE_R, 0.26);
  const shoulderR = Math.max(16, Math.min(SHOULDER_R, Math.floor(faceR * 0.75)));
  const pitch = faceR * 2 + FACE_GAP;

  // Rough footprint: shoulders + face triangle.
  const clusterCoreW = pitch + faceR;
  const totalW = clusterCoreW + (shoulderR * 2 + faceR) * 2;
  const totalH = pitch + faceR;

  const cx = region.x + Math.floor(region.w / 2);
  let cy = region.y + Math.floor(region.h * 0.55);
  const halfH = Math.ceil(totalH / 2);
  const halfW = Math.ceil(totalW / 2);
  cy = Math.max(region.y + halfH + 4, Math.min(cy, region.y + region.h - halfH - 4));
  // If region is narrow, nudge horizontally to stay inside.
  const minCx = region.x + halfW + 4;
  const maxCx = region.x + region.w - halfW - 4;
  const mid = Math.max(minCx, Math.min(cx, maxCx));

  const jump = {
    cx: mid,
    cy: cy - Math.floor(pitch * 0.55),
    r: faceR,
    id: "jump" as const,
    label: "Z",
  };
  const attack = {
    cx: mid - Math.floor(pitch * 0.55),
    cy: cy + Math.floor(pitch * 0.35),
    r: faceR,
    id: "attack" as const,
    label: "X",
  };
  const sub = {
    cx: mid + Math.floor(pitch * 0.55),
    cy: cy + Math.floor(pitch * 0.35),
    r: faceR,
    id: "sub" as const,
    label: "C",
  };

  // Shoulders: one on each side of the cluster, mid-height of the face buttons.
  const shoulderY = Math.floor((jump.cy + attack.cy) / 2);
  const pause = {
    cx: attack.cx - faceR - shoulderR - Math.max(6, FACE_GAP),
    cy: shoulderY,
    r: shoulderR,
    id: "pause" as const,
    label: "II",
  };
  const dodge = {
    cx: sub.cx + faceR + shoulderR + Math.max(6, FACE_GAP),
    cy: shoulderY,
    r: shoulderR,
    id: "dodge" as const,
    label: "R",
  };

  // Clamp shoulders into the region if needed.
  pause.cx = Math.max(region.x + pause.r + 2, pause.cx);
  dodge.cx = Math.min(region.x + region.w - dodge.r - 2, dodge.cx);

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
