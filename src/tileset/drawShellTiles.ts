import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM, TILE_SIZE } from "../specs";
import type { RoomKind } from "../world/DungeonTypes";
import type { TileMap } from "../world/TileMap";
import type { SheetAtlas } from "./SheetAtlas";
import type { DecoStamp } from "./placeAmbientDeco";
import { resolveDisplayTileId } from "./resolveDisplayTile";
import { resolveShellTileId } from "./ShellTileResolve";
import type { TerrainTileBridge } from "./TerrainTileBridge";
import type { TilesetProject } from "./TilesetProject";

export type ShellDrawExtras = {
  /** When true for (tx,ty), draw sealed boss door placeholder instead of door art. */
  isSealed?: (tx: number, ty: number) => boolean;
  /** Floor ordinal for sheet remap (1–2 forest, 3–4 underground, 5+ la). */
  floorOrdinal?: number;
  primarySheetId?: string;
  project?: TilesetProject | null;
  bridge?: TerrainTileBridge | null;
  roomKind?: RoomKind;
  displaySalt?: bigint;
  decoStamps?: DecoStamp[];
};

/**
 * Blit shell terrain (C+ bridge + MemberGraph when available) and thin deco underlay.
 */
export function drawShellTiles(
  g: CanvasRenderingContext2D,
  map: TileMap,
  camera: WorldCamera,
  atlas: SheetAtlas | null,
  colorFallback: (terrainId: number, dx: number, dy: number, dw: number, dh: number) => void,
  extras: ShellDrawExtras = {},
): void {
  const sheetOverride = extras.primarySheetId;
  const project = extras.project ?? null;
  const bridge = extras.bridge ?? null;
  const roomKind = extras.roomKind;
  const displaySalt = extras.displaySalt ?? 0n;
  const useCPlus = !!(project && bridge && roomKind != null);

  // Deco underlay on EMPTY cells (behind terrain).
  if (atlas && extras.decoStamps?.length) {
    g.save();
    g.globalAlpha = 0.4;
    for (const stamp of extras.decoStamps) {
      const wx = stamp.tx * TILE_SIZE;
      const wy = stamp.ty * TILE_SIZE;
      const dx = camera.worldToDeviceX(wx);
      const dy = camera.worldToDeviceY(wy);
      const dw = Math.floor(CAMERA_ZOOM * TILE_SIZE);
      const dh = Math.floor(CAMERA_ZOOM * TILE_SIZE);
      atlas.drawTileId(g, stamp.tileId, dx, dy, dw, dh, sheetOverride);
    }
    g.restore();
  }

  for (let ty = 0; ty < map.getHeight(); ty++) {
    for (let tx = 0; tx < map.getWidth(); tx++) {
      const sealed = extras.isSealed?.(tx, ty) ?? false;
      const terrain = map.tileAt(tx, ty);
      if (terrain === 0 && !sealed) continue;

      const wx = tx * TILE_SIZE;
      const wy = ty * TILE_SIZE;
      const dx = camera.worldToDeviceX(wx);
      const dy = camera.worldToDeviceY(wy);
      const dw = Math.floor(CAMERA_ZOOM * TILE_SIZE);
      const dh = Math.floor(CAMERA_ZOOM * TILE_SIZE);

      if (sealed) {
        g.fillStyle = "#5a4060";
        g.fillRect(dx, dy, dw, dh);
        g.fillStyle = "#2a1830";
        g.fillRect(dx + 2, dy + 2, dw - 4, dh - 4);
        continue;
      }

      let tileId: string | null = null;
      if (useCPlus) {
        tileId = resolveDisplayTileId(
          project!,
          bridge!,
          map,
          tx,
          ty,
          roomKind!,
          displaySalt,
          extras.floorOrdinal ?? 1,
        );
      }
      if (!tileId) {
        tileId = resolveShellTileId(map, tx, ty);
      }
      if (tileId && atlas?.drawTileId(g, tileId, dx, dy, dw, dh, sheetOverride)) {
        continue;
      }
      colorFallback(terrain, dx, dy, dw, dh);
    }
  }
}
