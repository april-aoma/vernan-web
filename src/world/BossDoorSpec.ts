import type { AutotileObject, TilesetProject } from "../tileset/TilesetProject";
import { packCell } from "./BossDoorSealAnim";

export type BossDoorLayout = {
  openTopTileId: string;
  openBottomTileId: string;
  sealedTileId: string | null;
};

/** Java BossDoorSpec.resolve — boss door open halves + sealed tile. */
export function resolveBossDoorLayout(project: TilesetProject | null): BossDoorLayout | null {
  if (!project) return null;
  const preferred = project.objectById.get("boss door");
  if (preferred) {
    const layout = layoutFromObject(preferred);
    if (layout) return layout;
  }
  for (const obj of project.objects) {
    if (!obj.isFullObject || obj.mapTerrain !== "DOOR") continue;
    if (!obj.roomKinds.some((k) => k.trim().toUpperCase() === "BOSS")) continue;
    const layout = layoutFromObject(obj);
    if (layout) return layout;
  }
  return null;
}

/** Java GamePanel.bossDoorSealedDisplayTileId. */
export function bossDoorSealedDisplayTileId(
  sealed: Set<number> | null | undefined,
  tx: number,
  ty: number,
  layout: BossDoorLayout | null,
): string | null {
  if (!layout?.sealedTileId || !sealed?.has(packCell(tx, ty))) return null;
  return layout.sealedTileId;
}

function layoutFromObject(obj: AutotileObject): BossDoorLayout | null {
  const mems = obj.tileIds;
  if (mems.length < 2) return null;
  const layout = obj.memberGraphLayout?.cells;
  if (!layout?.length) return null;

  let minX = Infinity;
  for (const c of layout) minX = Math.min(minX, c.x);
  const stack = layout
    .filter((c) => c.x === minX)
    .sort((a, b) => a.y - b.y || a.tileId.localeCompare(b.tileId));
  if (stack.length < 2) return null;

  const openTop = stack[0]!.tileId;
  const openBottom = stack[1]!.tileId;
  const sealed = resolveSealedTileId(obj, openTop, openBottom);
  return { openTopTileId: openTop, openBottomTileId: openBottom, sealedTileId: sealed };
}

function resolveSealedTileId(
  obj: AutotileObject,
  openTop: string,
  openBottom: string,
): string | null {
  const open = new Set([openTop, openBottom]);
  for (const tid of obj.tileIds) {
    if (!open.has(tid)) return tid;
  }
  return null;
}
