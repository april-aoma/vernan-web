/**
 * Radial fisheye on composited pixels covered by each smoke puff sprite
 * (~2× at center, ripple outward). Geometry-only — no palette / hue shift.
 * (Java SmokeHeatDistortionEffect.)
 */

const PEAK_CENTER_ZOOM = 2.0;
const RIPPLE_RING_CYCLES = 3.6;
const RIPPLE_PHASE_SPEED = 3.2;
const RIPPLE_AMP = 0.22;
const FISHEYE_COLOR_SAMPLE_BLEND = 0.18;

export type SmokeDeviceMask = {
  minX: number;
  minY: number;
  spanW: number;
  spanH: number;
  covered: boolean[];
};

export const EMPTY_SMOKE_DEVICE_MASK: SmokeDeviceMask = {
  minX: 0,
  minY: 0,
  spanW: 0,
  spanH: 0,
  covered: [],
};

export function smokeDeviceMaskIsEmpty(mask: SmokeDeviceMask): boolean {
  return mask.spanW <= 0 || mask.spanH <= 0 || mask.covered.length === 0;
}

export function smokeDeviceMaskCovers(
  mask: SmokeDeviceMask,
  col: number,
  row: number,
): boolean {
  const lx = col - mask.minX;
  const ly = row - mask.minY;
  if (lx < 0 || ly < 0 || lx >= mask.spanW || ly >= mask.spanH) return false;
  return mask.covered[ly * mask.spanW + lx]!;
}

export function expandSmokeDeviceMaskBounds(
  mask: SmokeDeviceMask,
  bounds: [number, number, number, number],
): void {
  if (smokeDeviceMaskIsEmpty(mask)) return;
  bounds[0] = Math.min(bounds[0], mask.minX);
  bounds[1] = Math.min(bounds[1], mask.minY);
  bounds[2] = Math.max(bounds[2], mask.minX + mask.spanW);
  bounds[3] = Math.max(bounds[3], mask.minY + mask.spanH);
}

export type SmokeHeatAnchor = {
  centerX: number;
  centerY: number;
  /** Normalizes radial ripple phase within the sprite mask. */
  rippleRadiusPx: number;
  strength: number;
  phaseSec: number;
  mask: SmokeDeviceMask;
};

export function makeSmokeHeatAnchor(
  centerX: number,
  centerY: number,
  rippleRadiusPx: number,
  strength: number,
  phaseSec: number,
  mask: SmokeDeviceMask | null,
): SmokeHeatAnchor {
  return {
    centerX,
    centerY,
    rippleRadiusPx: Math.max(4, rippleRadiusPx),
    strength: Math.max(0, Math.min(1, strength)),
    phaseSec,
    mask: mask ?? EMPTY_SMOKE_DEVICE_MASK,
  };
}

export function rippleRadiusForSmokeMask(
  mask: SmokeDeviceMask,
  cx: number,
  cy: number,
): number {
  if (smokeDeviceMaskIsEmpty(mask)) return 4;
  let maxDistSq = 16;
  for (let ly = 0; ly < mask.spanH; ly++) {
    for (let lx = 0; lx < mask.spanW; lx++) {
      if (!mask.covered[ly * mask.spanW + lx]) continue;
      const px = mask.minX + lx;
      const py = mask.minY + ly;
      const dx = px - cx;
      const dy = py - cy;
      maxDistSq = Math.max(maxDistSq, dx * dx + dy * dy);
    }
  }
  return Math.ceil(Math.sqrt(maxDistSq));
}

/** Apply radial heat fisheye to the canvas under each smoke mask (Java apply). */
export function applySmokeHeatDistortion(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  anchors: readonly SmokeHeatAnchor[],
): void {
  if (anchors.length === 0 || canvasW <= 0 || canvasH <= 0) return;

  const bounds: [number, number, number, number] = [canvasW, canvasH, 0, 0];
  let any = false;
  for (const a of anchors) {
    if (a.strength <= 1e-4 || smokeDeviceMaskIsEmpty(a.mask)) continue;
    any = true;
    expandSmokeDeviceMaskBounds(a.mask, bounds);
  }
  if (!any) return;

  const minCol = Math.max(0, bounds[0]);
  const minRow = Math.max(0, bounds[1]);
  const maxCol = Math.min(canvasW, bounds[2]);
  const maxRow = Math.min(canvasH, bounds[3]);
  if (minCol >= maxCol || minRow >= maxRow) return;

  const spanW = maxCol - minCol;
  const spanH = maxRow - minRow;
  const image = ctx.getImageData(minCol, minRow, spanW, spanH);
  const src = new Uint8ClampedArray(image.data);
  const dst = image.data;

  const readSrc = (col: number, row: number, fallbackR: number, fallbackG: number, fallbackB: number, fallbackA: number) => {
    const lx = col - minCol;
    const ly = row - minRow;
    if (lx < 0 || ly < 0 || lx >= spanW || ly >= spanH) {
      return [fallbackR, fallbackG, fallbackB, fallbackA] as const;
    }
    const i = (ly * spanW + lx) * 4;
    return [src[i]!, src[i + 1]!, src[i + 2]!, src[i + 3]!] as const;
  };

  const lerpChan = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

  const sampleFisheye = (
    sampleX: number,
    sampleY: number,
    fr: number,
    fg: number,
    fb: number,
    fa: number,
  ): [number, number, number, number] => {
    let sc = Math.round(sampleX);
    let sr = Math.round(sampleY);
    sc = Math.max(minCol, Math.min(maxCol - 1, sc));
    sr = Math.max(minRow, Math.min(maxRow - 1, sr));
    const nearest = readSrc(sc, sr, fr, fg, fb, fa);
    if (FISHEYE_COLOR_SAMPLE_BLEND <= 1e-4) {
      return [nearest[0], nearest[1], nearest[2], nearest[3]];
    }

    let x0 = Math.floor(sampleX);
    let y0 = Math.floor(sampleY);
    const x1 = Math.min(maxCol - 1, x0 + 1);
    const y1 = Math.min(maxRow - 1, y0 + 1);
    x0 = Math.max(minCol, x0);
    y0 = Math.max(minRow, y0);
    const tx = sampleX - x0;
    const ty = sampleY - y0;
    const c00 = readSrc(x0, y0, fr, fg, fb, fa);
    const c10 = readSrc(x1, y0, fr, fg, fb, fa);
    const c01 = readSrc(x0, y1, fr, fg, fb, fa);
    const c11 = readSrc(x1, y1, fr, fg, fb, fa);
    const c0: [number, number, number, number] = [
      lerpChan(c00[0], c10[0], tx),
      lerpChan(c00[1], c10[1], tx),
      lerpChan(c00[2], c10[2], tx),
      lerpChan(c00[3], c10[3], tx),
    ];
    const c1: [number, number, number, number] = [
      lerpChan(c01[0], c11[0], tx),
      lerpChan(c01[1], c11[1], tx),
      lerpChan(c01[2], c11[2], tx),
      lerpChan(c01[3], c11[3], tx),
    ];
    const bilinear: [number, number, number, number] = [
      lerpChan(c0[0], c1[0], ty),
      lerpChan(c0[1], c1[1], ty),
      lerpChan(c0[2], c1[2], ty),
      lerpChan(c0[3], c1[3], ty),
    ];
    const t = FISHEYE_COLOR_SAMPLE_BLEND;
    return [
      lerpChan(nearest[0], bilinear[0], t),
      lerpChan(nearest[1], bilinear[1], t),
      lerpChan(nearest[2], bilinear[2], t),
      lerpChan(nearest[3], bilinear[3], t),
    ];
  };

  for (let row = minRow; row < maxRow; row++) {
    for (let col = minCol; col < maxCol; col++) {
      let best: SmokeHeatAnchor | null = null;
      let bestRingU = -1;
      for (const a of anchors) {
        if (a.strength <= 1e-4 || !smokeDeviceMaskCovers(a.mask, col, row)) continue;
        const dx = col - a.centerX;
        const dy = row - a.centerY;
        const ringU = Math.sqrt(dx * dx + dy * dy) / a.rippleRadiusPx;
        if (best == null || ringU < bestRingU) {
          best = a;
          bestRingU = ringU;
        }
      }
      if (!best) continue;

      const lx = col - minCol;
      const ly = row - minRow;
      const idx = (ly * spanW + lx) * 4;
      const fr = src[idx]!;
      const fg = src[idx + 1]!;
      const fb = src[idx + 2]!;
      const fa = src[idx + 3]!;

      const ring = Math.min(1, bestRingU);
      let centerWeight = 1 - ring;
      centerWeight = centerWeight * centerWeight * (3 - 2 * centerWeight);
      if (centerWeight * best.strength <= 1e-4) continue;

      const ripple = Math.sin(
        Math.PI * 2 * (bestRingU * RIPPLE_RING_CYCLES - best.phaseSec * RIPPLE_PHASE_SPEED),
      );
      const rippleMod = 1 + RIPPLE_AMP * ripple * centerWeight;
      const zoomSpan = (PEAK_CENTER_ZOOM - 1) * centerWeight * best.strength * rippleMod;
      const effScale = 1 + zoomSpan;
      if (Math.abs(effScale - 1) < 1e-4) continue;

      const relX = col - best.centerX;
      const relY = row - best.centerY;
      const sampleX = best.centerX + relX / effScale;
      const sampleY = best.centerY + relY / effScale;
      const [r, g, b, a] = sampleFisheye(sampleX, sampleY, fr, fg, fb, fa);
      dst[idx] = r;
      dst[idx + 1] = g;
      dst[idx + 2] = b;
      dst[idx + 3] = a;
    }
  }

  ctx.putImageData(image, minCol, minRow);
}

/**
 * Device mask matching scanline smoke draw (Java buildSmokeDeviceMask).
 * `frameW`/`frameH` are the current anim cell size in texture pixels.
 */
export function buildSmokeDeviceMask(args: {
  cloudX: number;
  cloudY: number;
  cloudW: number;
  cloudH: number;
  frameW: number;
  frameH: number;
  spriteScale: number;
  earthboundScanlineOffsetWorldX: (localRowY: number) => number;
  worldToDeviceX: (wx: number) => number;
  worldToDeviceY: (wy: number) => number;
  cameraZoom: number;
}): SmokeDeviceMask {
  const {
    cloudX,
    cloudY,
    cloudW,
    cloudH,
    frameW,
    frameH,
    spriteScale,
    earthboundScanlineOffsetWorldX,
    worldToDeviceX,
    worldToDeviceY,
    cameraZoom,
  } = args;
  const sh = frameH;
  const worldVisW = frameW * spriteScale;
  const worldVisH = sh * spriteScale;
  const leftWorld = cloudX + cloudW * 0.5 - worldVisW * 0.5;
  const topWorld = cloudY + cloudH - worldVisH;
  let dwDest = Math.round(cameraZoom * worldVisW);
  if (dwDest < 1) dwDest = 1;

  let boundMinX = Infinity;
  let boundMinY = Infinity;
  let boundMaxX = -Infinity;
  let boundMaxY = -Infinity;
  const rowSx1 = new Array<number>(sh);
  const rowSy1 = new Array<number>(sh);
  const rowSy2 = new Array<number>(sh);
  for (let row = 0; row < sh; row++) {
    const ox = earthboundScanlineOffsetWorldX(row);
    const yt = topWorld + (row / sh) * worldVisH;
    const yb = topWorld + ((row + 1) / sh) * worldVisH;
    const sx1 = worldToDeviceX(leftWorld + ox);
    const sy1 = worldToDeviceY(yt);
    const sy2 = worldToDeviceY(yb);
    rowSx1[row] = sx1;
    rowSy1[row] = sy1;
    rowSy2[row] = sy2;
    boundMinX = Math.min(boundMinX, sx1);
    boundMaxX = Math.max(boundMaxX, sx1 + dwDest);
    boundMinY = Math.min(boundMinY, sy1);
    boundMaxY = Math.max(boundMaxY, sy2);
  }

  const spanW = boundMaxX - boundMinX;
  const spanH = boundMaxY - boundMinY;
  if (spanW <= 0 || spanH <= 0 || !Number.isFinite(spanW)) {
    return EMPTY_SMOKE_DEVICE_MASK;
  }

  const covered = new Array<boolean>(spanW * spanH).fill(false);
  for (let row = 0; row < sh; row++) {
    const sx1 = rowSx1[row]!;
    const sx2 = sx1 + dwDest;
    const sy1 = rowSy1[row]!;
    const sy2 = rowSy2[row]!;
    if (sy2 <= sy1) continue;
    for (let dy = sy1; dy < sy2; dy++) {
      for (let dx = sx1; dx < sx2; dx++) {
        const lx = dx - boundMinX;
        const ly = dy - boundMinY;
        covered[ly * spanW + lx] = true;
      }
    }
  }
  return {
    minX: boundMinX,
    minY: boundMinY,
    spanW,
    spanH,
    covered,
  };
}
