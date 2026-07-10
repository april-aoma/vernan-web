import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM, TILE_SIZE } from "../specs";
import type { RoomKind } from "../world/DungeonTypes";
import type { PlacedRoomObject } from "../world/PlacedRoomObject";
import type { TileMap } from "../world/TileMap";
import { TILE_BREAKABLE, TILE_SOLID } from "../world/TileMap";
import { packCell } from "../world/BossDoorSealAnim";
import type { SheetAtlas } from "./SheetAtlas";
import type { DecoStamp } from "./placeAmbientDeco";
import { decoOverlayFromStamps, type ContextThemeRule } from "./ContextThemeSubstitution";
import {
  drawQuadrantOverlay,
  innerCornerMask,
  sourceTileIdForObject,
} from "./QuadrantCompositeAutotile";
import type { AutotileMassContext } from "./MemberGraphAutotile";
import {
  expandPlacedRoomObjectsForDraw,
  filterPlacedPropsForGroundSupport,
  placedPropOwnedCells,
  resolvePlacedTileId,
  shouldDrawPlacedPropTile,
} from "./placeProceduralPlacedProps";
import { resolveDisplayTileId } from "./resolveDisplayTile";
import { resolveShellTileId } from "./ShellTileResolve";
import type { TerrainTileBridge } from "./TerrainTileBridge";
import type { TilesetProject } from "./TilesetProject";
import type { TileWorldRenderer } from "./TileWorldRenderer";

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
  /** Pixel-placed props (Java placedRoomObjects) — drawn after terrain. */
  placedRoomObjects?: PlacedRoomObject[];
  /** Java decorationAnimTime * 60 — drives visualClips / warp / glow. */
  simTick?: number;
  /** Composite renderer for animated tiles (grass / flame). */
  tileWorld?: TileWorldRenderer | null;
  /** Door destination kind by packCell. */
  doorDestByCell?: Map<number, RoomKind> | null;
  /** Parsed context theme rules. */
  contextThemeRules?: ContextThemeRule[] | null;
};

/**
 * Blit shell terrain (C+ bridge + MemberGraph when available) and ambient deco underlay.
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
  const simTick = extras.simTick ?? 0;
  const tileWorld = extras.tileWorld ?? null;
  const floorOrdinal = extras.floorOrdinal ?? 1;
  const useCPlus = !!(project && bridge && roomKind != null);
  const decoOverlay = decoOverlayFromStamps(extras.decoStamps);
  const themeRules = extras.contextThemeRules ?? [];
  const resolveExtras = {
    doorDestByCell: extras.doorDestByCell,
    decoOverlay,
    contextThemeRules: themeRules,
  };

  const placedExpanded =
    project && extras.placedRoomObjects?.length
      ? filterPlacedPropsForGroundSupport(
          expandPlacedRoomObjectsForDraw(extras.placedRoomObjects, project),
          project,
          map,
        )
      : [];
  const propOwned = placedPropOwnedCells(placedExpanded);

  // Deco underlay on EMPTY cells (behind terrain) — full opacity (Java ambient deco).
  // Skip cells owned by placed props so only one visual layer occupies each cell.
  if (atlas && extras.decoStamps?.length) {
    for (const stamp of extras.decoStamps) {
      if (propOwned.has(packCell(stamp.tx, stamp.ty))) continue;
      const wx = stamp.tx * TILE_SIZE;
      const wy = stamp.ty * TILE_SIZE;
      const dx = camera.worldToDeviceX(wx);
      const dy = camera.worldToDeviceY(wy);
      const dw = Math.floor(CAMERA_ZOOM * TILE_SIZE);
      const dh = Math.floor(CAMERA_ZOOM * TILE_SIZE);
      if (
        project &&
        tileWorld?.drawTileIfAnimated(
          g,
          project,
          stamp.tileId,
          simTick,
          dx,
          dy,
          CAMERA_ZOOM,
          wx,
          wy,
        )
      ) {
        continue;
      }
      atlas.drawTileId(g, stamp.tileId, dx, dy, dw, dh, sheetOverride);
    }
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
          floorOrdinal,
          resolveExtras,
        );
      }
      if (!tileId) {
        tileId = resolveShellTileId(map, tx, ty);
      }
      if (
        tileId &&
        project &&
        tileWorld?.drawTileIfAnimated(
          g,
          project,
          tileId,
          simTick,
          dx,
          dy,
          CAMERA_ZOOM,
          wx,
          wy,
        )
      ) {
        continue;
      }
      if (tileId && atlas?.drawTileId(g, tileId, dx, dy, dw, dh, sheetOverride)) {
        if (
          useCPlus &&
          atlas &&
          project &&
          bridge &&
          roomKind != null &&
          (terrain === TILE_SOLID || terrain === TILE_BREAKABLE)
        ) {
          drawQuadrantIfNeeded(
            g,
            atlas,
            project,
            bridge,
            map,
            tx,
            ty,
            terrain,
            tileId,
            roomKind,
            displaySalt,
            floorOrdinal,
            dx,
            dy,
            dw,
            sheetOverride,
          );
        }
        continue;
      }
      colorFallback(terrain, dx, dy, dw, dh);
    }
  }

  // Placed props after terrain (Java drawPlacedRoomObjects).
  if (atlas && project && placedExpanded.length) {
    const sorted = [...placedExpanded].sort((a, b) => a.zOrder - b.zOrder);
    for (const p of sorted) {
      const tid = resolvePlacedTileId(p, project);
      if (!tid) continue;
      if (!shouldDrawPlacedPropTile(project, map, tid, p.xPx, p.yPx)) continue;
      const wx = p.xPx;
      const wy = p.yPx;
      const dx = camera.worldToDeviceX(wx);
      const dy = camera.worldToDeviceY(wy);
      const dw = Math.floor(CAMERA_ZOOM * TILE_SIZE);
      const dh = Math.floor(CAMERA_ZOOM * TILE_SIZE);
      if (
        tileWorld?.drawTileIfAnimated(
          g,
          project,
          tid,
          simTick,
          dx,
          dy,
          CAMERA_ZOOM,
          wx,
          wy,
        )
      ) {
        continue;
      }
      atlas.drawTileId(g, tid, dx, dy, dw, dh, sheetOverride);
    }
  }
}

function drawQuadrantIfNeeded(
  g: CanvasRenderingContext2D,
  atlas: SheetAtlas,
  project: TilesetProject,
  bridge: TerrainTileBridge,
  map: TileMap,
  tx: number,
  ty: number,
  terrain: number,
  displayTileId: string,
  roomKind: RoomKind,
  displaySalt: bigint,
  floorOrdinal: number,
  dx: number,
  dy: number,
  dw: number,
  sheetOverride?: string,
): void {
  const owner =
    project.objectByTileId.get(displayTileId) ??
    (() => {
      const connectId = bridge.connectTileIdForRoomKind(terrain, roomKind) || displayTileId;
      return project.objectByTileId.get(connectId) ?? project.objectById.get(connectId);
    })();
  if (!owner?.usesMemberGraph) return;
  const sourceId = sourceTileIdForObject(owner, project);
  if (!sourceId) return;
  const massCtx: AutotileMassContext = {
    object: owner,
    bridge,
    displaySalt,
    roomKind,
    floorOrdinal,
    project,
  };
  const mask = innerCornerMask(tx, ty, terrain, map, massCtx, project);
  if (mask === 0) return;
  drawQuadrantOverlay(g, atlas, project, sourceId, dx, dy, dw, mask, sheetOverride);
}
