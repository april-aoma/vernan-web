import { TILE_SIZE } from "../specs";
import {
  glowAlphaAt,
  glowScaleAt,
  resolve,
  type GlowPulse,
  type JsonMap,
  type LayerDrawPass,
  type ResolvedLayer,
  type ScanlineWarp,
} from "./TileRenderResolve";

export type SheetBitmap = {
  id: string;
  image: CanvasImageSource;
  tileWidthPx: number;
  tileHeightPx: number;
};

/**
 * Rasterizes ResolvedLayer stacks to an offscreen canvas
 * (Java TileCompositeRenderer.compose subset: normal + add, warp, glow).
 */
export function previewTile(
  sheetsById: Map<string, SheetBitmap>,
  tile: JsonMap,
  variationId: string,
  simTicks: number,
  paddingPx: number,
  warpPhaseOffsetRad = 0,
  pass: LayerDrawPass | "all" = "all",
): HTMLCanvasElement | null {
  const layers = resolve(tile, variationId, simTicks, pass);
  if (!layers.length) return null;
  let maxTw = TILE_SIZE;
  let maxTh = TILE_SIZE;
  for (const L of layers) {
    const sb = sheetsById.get(L.sheetId);
    if (sb) {
      maxTw = Math.max(maxTw, sb.tileWidthPx);
      maxTh = Math.max(maxTh, sb.tileHeightPx);
    }
  }
  const cw = maxTw + paddingPx * 2;
  const ch = maxTh + paddingPx * 2;
  return compose(sheetsById, layers, cw, ch, paddingPx, paddingPx, simTicks, warpPhaseOffsetRad);
}

export function compose(
  sheetsById: Map<string, SheetBitmap>,
  layers: ResolvedLayer[],
  canvasW: number,
  canvasH: number,
  originXPx: number,
  originYPx: number,
  simTicks: number,
  warpPhaseOffsetRad: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = false;

  for (const L of layers) {
    if (!L.visible) continue;
    const sb = sheetsById.get(L.sheetId);
    if (!sb) continue;
    const tw = sb.tileWidthPx;
    const th = sb.tileHeightPx;
    if (tw <= 0 || th <= 0) continue;
    const sx = L.cellCol * tw;
    const sy = L.cellRow * th;
    const px = originXPx + L.offsetXPx;
    const py = originYPx + L.offsetYPx;
    const glow = L.glowPulse;
    let op: number;
    let glowScale = 1;
    if (glow) {
      glowScale = glowScaleAt(glow, simTicks, warpPhaseOffsetRad);
      op = glowAlphaAt(glow, simTicks, warpPhaseOffsetRad);
    } else {
      op = Math.min(255, Math.max(0, L.opacity));
    }
    if (op <= 0) continue;

    const warp = L.scanlineWarp;
    if (
      !glow &&
      warp &&
      L.rotationMilliDeg === 0 &&
      !L.flipH &&
      !L.flipV
    ) {
      drawScanlineWarpCell(
        g,
        canvas,
        sb.image,
        sx,
        sy,
        tw,
        th,
        px,
        py,
        op,
        L.blend.toLowerCase() === "add",
        warp,
        simTicks,
        warpPhaseOffsetRad,
      );
      continue;
    }

    drawTransformedLayer(
      g,
      canvas,
      sb.image,
      sx,
      sy,
      tw,
      th,
      px,
      py,
      originXPx,
      originYPx,
      L,
      op,
      glowScale,
      glow,
    );
  }
  return canvas;
}

function drawTransformedLayer(
  g: CanvasRenderingContext2D,
  dest: HTMLCanvasElement,
  sheet: CanvasImageSource,
  sx: number,
  sy: number,
  tw: number,
  th: number,
  px: number,
  py: number,
  originXPx: number,
  originYPx: number,
  L: ResolvedLayer,
  opacity: number,
  glowScale: number,
  glow: GlowPulse | null,
): void {
  const cx = tw * 0.5;
  const cy = th * 0.5;
  const forceCenter = glow != null;
  let pivCx: number;
  let pivCy: number;
  if (forceCenter) {
    pivCx = px + cx;
    pivCy = py + cy;
  } else if (L.rotPivotKind === "tileOrigin") {
    pivCx = originXPx;
    pivCy = originYPx;
  } else if (L.rotPivotKind === "custom") {
    pivCx = originXPx + L.rotPivotCustomX;
    pivCy = originYPx + L.rotPivotCustomY;
  } else {
    pivCx = px + cx;
    pivCy = py + cy;
  }
  const pivImgX = pivCx - px;
  const pivImgY = pivCy - py;
  const scaleX = (L.flipH ? -1 : 1) * glowScale;
  const scaleY = (L.flipV ? -1 : 1) * glowScale;
  const rot = (L.rotationMilliDeg / 1000.0) * (Math.PI / 180);

  const blend = L.blend.toLowerCase();
  if (blend === "add") {
    const scratch = document.createElement("canvas");
    scratch.width = dest.width;
    scratch.height = dest.height;
    const gs = scratch.getContext("2d")!;
    gs.imageSmoothingEnabled = false;
    gs.globalAlpha = opacity / 255;
    gs.translate(pivCx, pivCy);
    gs.rotate(rot);
    gs.scale(scaleX, scaleY);
    gs.translate(-pivImgX, -pivImgY);
    gs.drawImage(sheet, sx, sy, tw, th, 0, 0, tw, th);
    addBlendOnto(dest, scratch);
    return;
  }

  g.save();
  g.globalAlpha = opacity / 255;
  g.translate(pivCx, pivCy);
  g.rotate(rot);
  g.scale(scaleX, scaleY);
  g.translate(-pivImgX, -pivImgY);
  g.drawImage(sheet, sx, sy, tw, th, 0, 0, tw, th);
  g.restore();
}

function drawScanlineWarpCell(
  destG: CanvasRenderingContext2D,
  dest: HTMLCanvasElement,
  sheet: CanvasImageSource,
  sx: number,
  sy: number,
  tw: number,
  th: number,
  px: number,
  py: number,
  opacity: number,
  addBlend: boolean,
  warp: ScanlineWarp,
  simTicks: number,
  warpPhaseOffsetRad: number,
): void {
  const phase =
    simTicks * warp.timeRadPerSimTick +
    warp.clipFrameIndex * warp.clipFramePhaseRad +
    warpPhaseOffsetRad;

  if (addBlend) {
    const scratch = document.createElement("canvas");
    scratch.width = dest.width;
    scratch.height = dest.height;
    const gs = scratch.getContext("2d")!;
    gs.imageSmoothingEnabled = false;
    gs.globalAlpha = opacity / 255;
    blitScanlineWarp(gs, sheet, sx, sy, tw, th, px, py, warp, phase);
    addBlendOnto(dest, scratch);
    return;
  }

  destG.save();
  destG.globalAlpha = opacity / 255;
  blitScanlineWarp(destG, sheet, sx, sy, tw, th, px, py, warp, phase);
  destG.restore();
}

function blitScanlineWarp(
  g: CanvasRenderingContext2D,
  sheet: CanvasImageSource,
  sx: number,
  sy: number,
  tw: number,
  th: number,
  px: number,
  py: number,
  warp: ScanlineWarp,
  phaseBase: number,
): void {
  const ref = Math.sin(phaseBase);
  const amp = warp.ampPx * warp.strength;
  const pr = warp.phasePerRowRad;
  for (let row = 0; row < th; row++) {
    const dr = row - warp.pinnedRow;
    const ox = amp * (Math.sin(phaseBase + dr * pr) - ref);
    const x1 = Math.round(px + ox);
    const y1 = Math.round(py + row);
    g.drawImage(sheet, sx, sy + row, tw, 1, x1, y1, tw, 1);
  }
}

/** Porter-Duff style additive RGB (clamped); Java addBlendOnto. */
function addBlendOnto(dest: HTMLCanvasElement, src: HTMLCanvasElement): void {
  const w = Math.min(dest.width, src.width);
  const h = Math.min(dest.height, src.height);
  const dg = dest.getContext("2d")!;
  const sg = src.getContext("2d")!;
  const dImg = dg.getImageData(0, 0, w, h);
  const sImg = sg.getImageData(0, 0, w, h);
  const d = dImg.data;
  const s = sImg.data;
  for (let i = 0; i < d.length; i += 4) {
    const sa = s[i + 3]!;
    if (sa === 0) continue;
    const da = d[i + 3]!;
    const sr = s[i]!;
    const sgC = s[i + 1]!;
    const sb = s[i + 2]!;
    const dr = d[i]!;
    const dgC = d[i + 1]!;
    const db = d[i + 2]!;
    d[i] = Math.min(255, dr + (sr * sa) / 255);
    d[i + 1] = Math.min(255, dgC + (sgC * sa) / 255);
    d[i + 2] = Math.min(255, db + (sb * sa) / 255);
    d[i + 3] = Math.min(255, da + sa - (da * sa) / 255);
  }
  dg.putImageData(dImg, 0, 0);
}
