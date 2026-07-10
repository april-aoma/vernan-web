import type { SheetAtlas } from "./SheetAtlas";
import { previewTile, type SheetBitmap } from "./TileCompositeRenderer";
import {
  resolvedStackUsesGlowPulse,
  resolvedStackUsesScanlineWarp,
  tileNeedsComposite,
  type JsonMap,
} from "./TileRenderResolve";
import type { TileDefJson, TilesetProject } from "./TilesetProject";

const MAX_CACHE = 4096;
const GLOW_BLEED_PX = 8;

/**
 * Cached rasterization of v3 tiles for world drawing
 * (Java TileWorldRenderer).
 */
export class TileWorldRenderer {
  private readonly sheetsById = new Map<string, SheetBitmap>();
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly cacheOrder: string[] = [];

  constructor(atlas: SheetAtlas, project: TilesetProject) {
    this.syncSheets(atlas, project);
  }

  /** Refresh sheet bitmaps after atlas load / floor sheet change. */
  syncSheets(atlas: SheetAtlas, project: TilesetProject): void {
    this.sheetsById.clear();
    for (const [id] of project.sheetPaths) {
      const bmp = atlas.getBitmap(id);
      if (!bmp) continue;
      this.sheetsById.set(id, {
        id,
        image: bmp,
        tileWidthPx: 16,
        tileHeightPx: 16,
      });
    }
    this.clearCache();
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheOrder.length = 0;
  }

  /**
   * Draw one tile at device px. Returns true if drawn.
   * Uses composite path when needed; caller may fall back to SheetAtlas otherwise.
   * @param scale device scale (CAMERA_ZOOM) — composed tile is TILE_SIZE logical px.
   * @param phaseX/phaseY world-space px for warp/glow desync (Java draws in world space;
   *   device dst must not be used or camera motion retargets the phase bucket).
   */
  drawTile(
    g: CanvasRenderingContext2D,
    tileDef: TileDefJson | JsonMap | null | undefined,
    variationId: string,
    simTicks: number,
    dstX: number,
    dstY: number,
    scale = 1,
    phaseX = dstX,
    phaseY = dstY,
  ): boolean {
    if (!tileDef) return false;
    const tid = typeof tileDef.id === "string" ? tileDef.id : "";
    const varId = variationId || "";
    const tile = tileDef as JsonMap;
    const warped = resolvedStackUsesScanlineWarp(tile, varId, simTicks);
    const glowing = resolvedStackUsesGlowPulse(tile, varId, simTicks);
    const phaseAnimated = warped || glowing;
    const bucket = phaseAnimated ? warpPhaseBucket(phaseX, phaseY, tid) : 0;
    const pad = glowing ? GLOW_BLEED_PX : 0;
    const key = phaseAnimated
      ? `${tid}\0${varId}\0${simTicks}\0w${bucket}`
      : `${tid}\0${varId}\0${simTicks}`;
    const phaseRad = phaseAnimated ? warpPhaseOffsetFromBucket(bucket) : 0;

    let img = this.cache.get(key);
    if (!img) {
      const composed = previewTile(this.sheetsById, tile, varId, simTicks, pad, phaseRad);
      if (!composed) return false;
      img = composed;
      this.putCache(key, img);
    }
    g.imageSmoothingEnabled = false;
    const s = Math.max(0.001, scale);
    const dw = Math.floor(img.width * s);
    const dh = Math.floor(img.height * s);
    const ox = Math.floor(pad * s);
    g.drawImage(img, dstX - ox, dstY - ox, dw, dh);
    return true;
  }

  /** Draw if tile needs composite; otherwise return false so caller uses SheetAtlas. */
  drawTileIfAnimated(
    g: CanvasRenderingContext2D,
    project: TilesetProject,
    tileId: string,
    simTicks: number,
    dstX: number,
    dstY: number,
    scale = 1,
    phaseX = dstX,
    phaseY = dstY,
  ): boolean {
    const def = project.tileDef(tileId);
    if (!def || !tileNeedsComposite(def as JsonMap)) return false;
    return this.drawTile(g, def, "", simTicks, dstX, dstY, scale, phaseX, phaseY);
  }

  private putCache(key: string, img: HTMLCanvasElement): void {
    if (this.cache.has(key)) {
      this.cache.set(key, img);
      return;
    }
    this.cache.set(key, img);
    this.cacheOrder.push(key);
    while (this.cacheOrder.length > MAX_CACHE) {
      const old = this.cacheOrder.shift();
      if (old) this.cache.delete(old);
    }
  }
}

/** Stable 0..63 from world draw position + tile id (Java long arithmetic). */
function warpPhaseBucket(worldX: number, worldY: number, tileId: string): number {
  let h =
    asI64(BigInt(worldX | 0) * 0x9e3779b97f4a7c15n) ^
    asI64(BigInt(worldY | 0) * 0x85ebca6bn);
  for (let i = 0; i < tileId.length; i++) {
    h = asI64(h * 31n + BigInt(tileId.charCodeAt(i)));
  }
  return Number(h & 63n);
}

function asI64(n: bigint): bigint {
  return BigInt.asIntN(64, n);
}

function warpPhaseOffsetFromBucket(bucket: number): number {
  return (bucket / 64.0) * (Math.PI * 2.0);
}
