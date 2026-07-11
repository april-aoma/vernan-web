import type { AssetLoader } from "../assets/AssetLoader";
import type { SheetCell, TilesetProject } from "./TilesetProject";
import { TILE_SIZE } from "../specs";

/** Loads tileset sheet PNGs and blits 16×16 cells. */
export class SheetAtlas {
  private readonly bitmaps = new Map<string, ImageBitmap>();
  private readonly project: TilesetProject;

  constructor(project: TilesetProject) {
    this.project = project;
  }

  async loadSheets(assets: AssetLoader, sheetIds: string[]): Promise<void> {
    await Promise.all(
      sheetIds.map(async (id) => {
        const path = this.project.sheetPaths.get(id);
        if (!path || this.bitmaps.has(id)) return;
        try {
          this.bitmaps.set(id, await assets.loadImage(path));
        } catch {
          // Missing sheet — color fallback remains.
        }
      }),
    );
  }

  has(sheetId: string): boolean {
    return this.bitmaps.has(sheetId);
  }

  /** Raw sheet bitmap for TileWorldRenderer composite. */
  getBitmap(sheetId: string): ImageBitmap | null {
    return this.bitmaps.get(sheetId) ?? null;
  }

  drawCell(
    g: CanvasRenderingContext2D,
    cell: SheetCell,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): boolean {
    const bmp = this.bitmaps.get(cell.sheetId);
    if (!bmp) return false;
    const sx = cell.col * TILE_SIZE;
    const sy = cell.row * TILE_SIZE;
    g.imageSmoothingEnabled = false;
    g.drawImage(bmp, sx, sy, TILE_SIZE, TILE_SIZE, dx, dy, dw, dh);
    return true;
  }

  drawTileId(
    g: CanvasRenderingContext2D,
    tileId: string,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    /**
     * Floor primary sheet remap for `main`-authored cells (forest→underground→LA).
     * Never remaps tiles already authored on another sheet (e.g. biome_2 `sheet_2_*`
     * members on floor 1) — that sampled the wrong PNG at the same row/col.
     */
    sheetIdOverride?: string,
  ): boolean {
    const cell = this.project.cell(tileId);
    if (!cell) return false;
    const resolved: SheetCell =
      sheetIdOverride && cell.sheetId === "main" && sheetIdOverride !== "main"
        ? { sheetId: sheetIdOverride, row: cell.row, col: cell.col }
        : cell;
    return this.drawCell(g, resolved, dx, dy, dw, dh);
  }

  /**
   * Rasterize a 16×16 tile into an offscreen canvas for brick-chunk subimages
   * (Java snapshotTileSprite thin).
   */
  snapshotTileId(
    tileId: string,
    sheetIdOverride?: string,
  ): HTMLCanvasElement | null {
    const cell = this.project.cell(tileId);
    if (!cell) return null;
    const resolved: SheetCell =
      sheetIdOverride && cell.sheetId === "main" && sheetIdOverride !== "main"
        ? { sheetId: sheetIdOverride, row: cell.row, col: cell.col }
        : cell;
    const bmp = this.bitmaps.get(resolved.sheetId);
    if (!bmp) return null;
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const g = canvas.getContext("2d");
    if (!g) return null;
    g.imageSmoothingEnabled = false;
    g.drawImage(
      bmp,
      resolved.col * TILE_SIZE,
      resolved.row * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
      TILE_SIZE,
      TILE_SIZE,
    );
    return canvas;
  }
}
