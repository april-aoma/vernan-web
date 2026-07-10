import { asList, bool, num, type JsonMap } from "./jsonMaps";

/** Frame selection for BackgroundRendererV3 layers (single, checkerboard, animate). */

export function parseAnimateFrames(
  layer: JsonMap,
  frameCount: number,
  fallbackFrameIndex: number,
): number[] {
  const raw = asList(layer["animateFrames"]);
  if (raw && raw.length > 0) {
    const max = Math.max(1, frameCount);
    const out = new Array<number>(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const o = raw[i];
      const f = typeof o === "number" ? (o | 0) : fallbackFrameIndex;
      out[i] = Math.max(0, Math.min(max - 1, f));
    }
    return out;
  }
  const fb = Math.max(0, Math.min(Math.max(1, frameCount) - 1, fallbackFrameIndex));
  return [fb];
}

export function ticksPerFrame(layer: JsonMap): number {
  return Math.max(1, num(layer, "ticksPerFrame", 8));
}

export function animateLoop(layer: JsonMap): boolean {
  return bool(layer, "animateLoop", true);
}

export function pickFrame(
  frameMode: string,
  frameIndex: number,
  frameCount: number,
  animateFrames: number[] | null,
  ticksPerFrameVal: number,
  animateLoopVal: boolean,
  tileX: number,
  tileY: number,
  simTick: number,
): number {
  if (frameMode.toLowerCase() === "checkerboard" && frameCount >= 2) {
    return (floorMod(tileX, 2) + floorMod(tileY, 2)) & 1;
  }
  if (
    frameMode.toLowerCase() === "animate" &&
    animateFrames != null &&
    animateFrames.length > 0
  ) {
    const tpf = Math.max(1, ticksPerFrameVal);
    let step = (simTick / tpf) | 0;
    if (!animateLoopVal) {
      step = Math.min(step, animateFrames.length - 1);
    } else {
      step = floorMod(step, animateFrames.length);
    }
    const sheet = animateFrames[step]!;
    return Math.max(0, Math.min(Math.max(1, frameCount) - 1, sheet));
  }
  return Math.max(0, Math.min(Math.max(1, frameCount) - 1, frameIndex));
}

function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}
