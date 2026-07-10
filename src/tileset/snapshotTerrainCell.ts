import { TILE_SIZE } from "../specs";
import type { SheetAtlas } from "./SheetAtlas";
import type { TilesetProject } from "./TilesetProject";
import type { TileWorldRenderer } from "./TileWorldRenderer";

/**
 * Rasterize one resolved terrain tile into a 16×16 canvas for brick-chunk shards
 * (Java GamePanel.snapshotTileSprite / drawV3TerrainCell thin).
 */
export function snapshotTerrainCell(
  atlas: SheetAtlas,
  project: TilesetProject | null,
  tileWorld: TileWorldRenderer | null,
  tileId: string,
  simTick: number,
  worldX: number,
  worldY: number,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const g = canvas.getContext("2d");
  if (!g) return null;

  if (project && tileWorld) {
    const def = project.tileDef(tileId);
    if (def) {
      if (tileWorld.drawTileIfAnimated(g, project, tileId, simTick, 0, 0, 1, worldX, worldY)) {
        return canvas;
      }
      if (tileWorld.drawTile(g, def, "", simTick, 0, 0, 1, worldX, worldY)) {
        return canvas;
      }
    }
  }

  const snap = atlas.snapshotTileId(tileId);
  if (!snap) return null;
  g.imageSmoothingEnabled = false;
  g.drawImage(snap, 0, 0);
  return canvas;
}
