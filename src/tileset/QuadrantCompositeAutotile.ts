import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import { TILE_BREAKABLE, TILE_SOLID } from "../world/TileMap";
import type { SheetAtlas } from "./SheetAtlas";
import {
  sameAutotilePackage,
  type AutotileMassContext,
} from "./MemberGraphAutotile";
import type { AutotileObject, SheetCell, TilesetProject } from "./TilesetProject";

/**
 * Inner-corner autotile overlay: one 16×16 member holds four 8×8 quadrants.
 * (Java QuadrantCompositeAutotile)
 */
export function sourceTileIdForObject(
  obj: AutotileObject,
  project: TilesetProject,
): string | null {
  if (obj.memberGraphLayout?.cells) {
    for (const c of obj.memberGraphLayout.cells) {
      if ((c as { quadrantComposite?: boolean }).quadrantComposite && c.tileId) {
        return c.tileId;
      }
    }
  }
  for (const mid of obj.tileIds) {
    if (tileDefFlaggedQuadrant(project, mid)) return mid;
  }
  return null;
}

export function tileDefFlaggedQuadrant(project: TilesetProject, tileId: string): boolean {
  const def = project.tileDef(tileId);
  if (!def) return false;
  const at = def.autotile;
  if (!at || typeof at !== "object") return false;
  return (at as { quadrantComposite?: boolean }).quadrantComposite === true;
}

/**
 * Bit mask: bit0=NW, bit1=NE, bit2=SW, bit3=SE.
 * Both ortho neighbors in same mass; diagonal absent.
 */
export function innerCornerMask(
  tx: number,
  ty: number,
  terrainCode: number,
  map: TileMap,
  massCtx: AutotileMassContext,
  project: TilesetProject,
): number {
  if (!stackableTerrain(terrainCode)) return 0;
  const n = terrainInSameMass(map, tx, ty - 1, terrainCode, massCtx, project);
  const e = terrainInSameMass(map, tx + 1, ty, terrainCode, massCtx, project);
  const s = terrainInSameMass(map, tx, ty + 1, terrainCode, massCtx, project);
  const w = terrainInSameMass(map, tx - 1, ty, terrainCode, massCtx, project);
  let mask = 0;
  if (n && w && !terrainInSameMass(map, tx - 1, ty - 1, terrainCode, massCtx, project)) {
    mask |= 1;
  }
  if (n && e && !terrainInSameMass(map, tx + 1, ty - 1, terrainCode, massCtx, project)) {
    mask |= 2;
  }
  if (s && w && !terrainInSameMass(map, tx - 1, ty + 1, terrainCode, massCtx, project)) {
    mask |= 4;
  }
  if (s && e && !terrainInSameMass(map, tx + 1, ty + 1, terrainCode, massCtx, project)) {
    mask |= 8;
  }
  return mask;
}

/** Stamp 0–4 corner quads from the source tile sheet cell. */
export function drawQuadrantOverlay(
  g: CanvasRenderingContext2D,
  atlas: SheetAtlas,
  project: TilesetProject,
  sourceTileId: string,
  dstX: number,
  dstY: number,
  dstTilePx: number,
  cornerMask: number,
  sheetIdOverride?: string,
): number {
  if (cornerMask === 0) return 0;
  const cell = project.cell(sourceTileId);
  if (!cell) return 0;
  const resolved: SheetCell = sheetIdOverride
    ? { sheetId: sheetIdOverride, row: cell.row, col: cell.col }
    : cell;
  const bmp = atlas.getBitmap(resolved.sheetId);
  if (!bmp) return 0;
  const halfDst = Math.max(1, Math.floor(dstTilePx / 2));
  const halfSrc = Math.max(1, Math.floor(TILE_SIZE / 2));
  const cellSx = resolved.col * TILE_SIZE;
  const cellSy = resolved.row * TILE_SIZE;
  g.imageSmoothingEnabled = false;
  let drawn = 0;
  if ((cornerMask & 1) !== 0) {
    blitQuad(g, bmp, cellSx, cellSy, 0, dstX, dstY, halfDst, halfSrc);
    drawn++;
  }
  if ((cornerMask & 2) !== 0) {
    blitQuad(g, bmp, cellSx, cellSy, 1, dstX + halfDst, dstY, halfDst, halfSrc);
    drawn++;
  }
  if ((cornerMask & 4) !== 0) {
    blitQuad(g, bmp, cellSx, cellSy, 2, dstX, dstY + halfDst, halfDst, halfSrc);
    drawn++;
  }
  if ((cornerMask & 8) !== 0) {
    blitQuad(g, bmp, cellSx, cellSy, 3, dstX + halfDst, dstY + halfDst, halfDst, halfSrc);
    drawn++;
  }
  return drawn;
}

function blitQuad(
  g: CanvasRenderingContext2D,
  bmp: ImageBitmap,
  cellSx: number,
  cellSy: number,
  quadIndex: number,
  dx: number,
  dy: number,
  halfDst: number,
  halfSrc: number,
): void {
  const qx = (quadIndex & 1) * halfSrc;
  const qy = (quadIndex >> 1) * halfSrc;
  g.drawImage(
    bmp,
    cellSx + qx,
    cellSy + qy,
    halfSrc,
    halfSrc,
    dx,
    dy,
    halfDst,
    halfDst,
  );
}

function terrainInSameMass(
  map: TileMap,
  tx: number,
  ty: number,
  terrainCode: number,
  massCtx: AutotileMassContext,
  project: TilesetProject,
): boolean {
  if (tx < 0 || ty < 0 || tx >= map.getWidth() || ty >= map.getHeight()) return false;
  if (map.tileAt(tx, ty) !== terrainCode) return false;
  const floor = massCtx.floorOrdinal ?? 1;
  const tileAllowed = (id: string) => project.tileAllowed(id, floor, massCtx.roomKind);
  const neighborPick = massCtx.bridge.displayTileIdForRoomKind(
    terrainCode,
    tx,
    ty,
    massCtx.displaySalt,
    massCtx.roomKind,
    tileAllowed,
  );
  return sameAutotilePackage(massCtx.object, neighborPick, project);
}

function stackableTerrain(code: number): boolean {
  return code === TILE_SOLID || code === TILE_BREAKABLE;
}
