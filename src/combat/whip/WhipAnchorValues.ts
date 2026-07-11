import { VernanFeetAnchor } from "../../vernan/VernanFeetAnchor";

/** Authorable whip handle anchors (Java WhipAnchorValues). */
export type WhipAnchorStrip = "ATTACK0" | "CROUCH_ATTACK0" | "ATTACK1";

export type WhipLocalAnchor = {
  handleX: number;
  handleY: number;
  tipRestX: number;
  tipRestY: number;
  handleRotDeg: number;
  tipRestRotDeg: number;
};

const ATTACK0_HANDLE_X = [5.5, 31.5, 30.5, 24.5];
const ATTACK0_HANDLE_Y = [16.5, 28.5, 26.5, 21.5];
const ATTACK0_HANDLE_ROT_DEG = [4.2, -73.6, -96.9, -124.2];
const ATTACK0_TIP_REST_X = [4.5];
const ATTACK0_TIP_REST_Y = [28.5];
const ATTACK0_TIP_REST_ROT_DEG = [0.0];
const CROUCH_ATTACK0_HANDLE_X = [6.5, 31.5, 28.5, 25.5];
const CROUCH_ATTACK0_HANDLE_Y = [22.5, 28.5, 28.5, 26.5];
const CROUCH_ATTACK0_HANDLE_ROT_DEG = [5.4, -94.3, -96.0, -130.6];
const CROUCH_ATTACK0_TIP_REST_X = [6.5];
const CROUCH_ATTACK0_TIP_REST_Y = [31.5];
const CROUCH_ATTACK0_TIP_REST_ROT_DEG = [0.0];
const ATTACK1_HANDLE_X = [7.5, 7.5, 38.5, 31.5, 28.5, 29.5, 29.5, 21.5];
const ATTACK1_HANDLE_Y = [22.5, 24.5, 45.5, 44.5, 44.5, 43.5, 42.5, 42.5];
const ATTACK1_HANDLE_ROT_DEG = [31.0, 23.5, -84.6, -83.7, -78.6, -78.1, -77.4, -77.4];
const ATTACK1_TIP_REST_X = [6.5, 6.5];
const ATTACK1_TIP_REST_Y = [29.5, 39.5];
const ATTACK1_TIP_REST_ROT_DEG = [0.0, 0.0];

function frameCount(strip: WhipAnchorStrip): number {
  switch (strip) {
    case "ATTACK0": return WhipAnchorValues.ATTACK0_FRAMES;
    case "CROUCH_ATTACK0": return WhipAnchorValues.CROUCH_ATTACK0_FRAMES;
    case "ATTACK1": return WhipAnchorValues.ATTACK1_FRAMES;
  }
}
function windupFrameCount(strip: WhipAnchorStrip): number {
  switch (strip) {
    case "ATTACK0": return WhipAnchorValues.ATTACK0_WINDUP_FRAMES;
    case "CROUCH_ATTACK0": return WhipAnchorValues.CROUCH_ATTACK0_WINDUP_FRAMES;
    case "ATTACK1": return WhipAnchorValues.ATTACK1_WINDUP_FRAMES;
  }
}
function isWindupFrame(strip: WhipAnchorStrip, frameIndex: number): boolean {
  return frameIndex >= 0 && frameIndex < windupFrameCount(strip);
}
function crackFrameIndex(strip: WhipAnchorStrip): number {
  return strip === "ATTACK1" ? 2 : 1;
}
function animKey(strip: WhipAnchorStrip): string {
  switch (strip) {
    case "ATTACK0": return "attack0";
    case "CROUCH_ATTACK0": return "crouchattack0";
    case "ATTACK1": return "attack1";
  }
}
function proceduralCoiledTip(handleX: number, handleY: number): [number, number] {
  return [handleX + WhipAnchorValues.PROCEDURAL_TIP_DX, handleY + WhipAnchorValues.PROCEDURAL_TIP_DY];
}
function proceduralTipRotDeg(handleX: number, handleY: number, tipX: number, tipY: number): number {
  const dx = tipX - handleX;
  const dy = tipY - handleY;
  if (Math.hypot(dx, dy) < 0.5) return 0;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}
function handleX(strip: WhipAnchorStrip, frameIndex: number): number {
  switch (strip) {
    case "ATTACK0": return ATTACK0_HANDLE_X[frameIndex]!;
    case "CROUCH_ATTACK0": return CROUCH_ATTACK0_HANDLE_X[frameIndex]!;
    case "ATTACK1": return ATTACK1_HANDLE_X[frameIndex]!;
  }
}
function handleY(strip: WhipAnchorStrip, frameIndex: number): number {
  switch (strip) {
    case "ATTACK0": return ATTACK0_HANDLE_Y[frameIndex]!;
    case "CROUCH_ATTACK0": return CROUCH_ATTACK0_HANDLE_Y[frameIndex]!;
    case "ATTACK1": return ATTACK1_HANDLE_Y[frameIndex]!;
  }
}
function handleRotDeg(strip: WhipAnchorStrip, frameIndex: number): number {
  switch (strip) {
    case "ATTACK0": return ATTACK0_HANDLE_ROT_DEG[frameIndex]!;
    case "CROUCH_ATTACK0": return CROUCH_ATTACK0_HANDLE_ROT_DEG[frameIndex]!;
    case "ATTACK1": return ATTACK1_HANDLE_ROT_DEG[frameIndex]!;
  }
}
function tipRestX(strip: WhipAnchorStrip, windupIndex: number): number {
  switch (strip) {
    case "ATTACK0": return ATTACK0_TIP_REST_X[windupIndex]!;
    case "CROUCH_ATTACK0": return CROUCH_ATTACK0_TIP_REST_X[windupIndex]!;
    case "ATTACK1": return ATTACK1_TIP_REST_X[windupIndex]!;
  }
}
function tipRestY(strip: WhipAnchorStrip, windupIndex: number): number {
  switch (strip) {
    case "ATTACK0": return ATTACK0_TIP_REST_Y[windupIndex]!;
    case "CROUCH_ATTACK0": return CROUCH_ATTACK0_TIP_REST_Y[windupIndex]!;
    case "ATTACK1": return ATTACK1_TIP_REST_Y[windupIndex]!;
  }
}
function tipRestRotDeg(strip: WhipAnchorStrip, frameIndex: number): number {
  const i = Math.max(0, Math.min(frameCount(strip) - 1, frameIndex));
  if (isWindupFrame(strip, i)) {
    switch (strip) {
      case "ATTACK0": return ATTACK0_TIP_REST_ROT_DEG[i]!;
      case "CROUCH_ATTACK0": return CROUCH_ATTACK0_TIP_REST_ROT_DEG[i]!;
      case "ATTACK1": return ATTACK1_TIP_REST_ROT_DEG[i]!;
    }
  }
  const hx = handleX(strip, i);
  const hy = handleY(strip, i);
  const [tx, ty] = proceduralCoiledTip(hx, hy);
  return proceduralTipRotDeg(hx, hy, tx, ty);
}
function localAnchor(strip: WhipAnchorStrip, frameIndex: number): WhipLocalAnchor {
  const i = Math.max(0, Math.min(frameCount(strip) - 1, frameIndex));
  const hx = handleX(strip, i);
  const hy = handleY(strip, i);
  let tx: number, ty: number;
  if (isWindupFrame(strip, i)) {
    tx = tipRestX(strip, i);
    ty = tipRestY(strip, i);
  } else {
    [tx, ty] = proceduralCoiledTip(hx, hy);
  }
  return { handleX: hx, handleY: hy, tipRestX: tx, tipRestY: ty, handleRotDeg: handleRotDeg(strip, i), tipRestRotDeg: tipRestRotDeg(strip, i) };
}
function textureLocalToWorld(
  localX: number, localY: number, frameW: number, frameH: number,
  playerX: number, playerW: number, feetWorld: number, facing: number, strip: WhipAnchorStrip,
): [number, number] {
  const texX = facing >= 0 ? localX : frameW - localX;
  const originX = VernanFeetAnchor.canvasWorldOriginX(playerX, playerW, frameW, facing, animKey(strip));
  const originY = VernanFeetAnchor.canvasWorldOriginY(feetWorld, frameH, animKey(strip));
  return [originX + texX, originY + localY];
}
function handleWorld(
  strip: WhipAnchorStrip, frameIndex: number, frameW: number, frameH: number,
  playerX: number, playerW: number, feetWorld: number, facing: number,
): [number, number] {
  const a = localAnchor(strip, frameIndex);
  return textureLocalToWorld(a.handleX, a.handleY, frameW, frameH, playerX, playerW, feetWorld, facing, strip);
}
function tipRestWorld(
  strip: WhipAnchorStrip, frameIndex: number, frameW: number, frameH: number,
  playerX: number, playerW: number, feetWorld: number, facing: number,
): [number, number] {
  const a = localAnchor(strip, frameIndex);
  return textureLocalToWorld(a.tipRestX, a.tipRestY, frameW, frameH, playerX, playerW, feetWorld, facing, strip);
}

export const WhipAnchorValues = {
  ATTACK0_FRAMES: 4,
  ATTACK0_WINDUP_FRAMES: 1,
  CROUCH_ATTACK0_FRAMES: 4,
  CROUCH_ATTACK0_WINDUP_FRAMES: 1,
  ATTACK1_FRAMES: 8,
  ATTACK1_WINDUP_FRAMES: 2,
  PROCEDURAL_TIP_DX: 6.0,
  PROCEDURAL_TIP_DY: 2.0,
  frameCount, windupFrameCount, isWindupFrame, crackFrameIndex, animKey,
  localAnchor, proceduralCoiledTip, proceduralTipRotDeg,
  handleX, handleY, handleRotDeg, tipRestX, tipRestY, tipRestRotDeg,
  handleWorld, tipRestWorld,
};
