import type { DecoStamp } from "./placeAmbientDeco";
import type { TerrainTileBridge } from "./TerrainTileBridge";
import { terrainNameToCode, type TilesetProject } from "./TilesetProject";
import type { RoomKind } from "../world/DungeonTypes";
import type { TileMap } from "../world/TileMap";
import { packCell } from "../world/BossDoorSealAnim";

/** Parsed context theme rule (Java ContextThemeSubstitution.Rule). */
export type ContextThemeRule = {
  baseTerrainCode: number;
  baseDisplayIds: Set<string>;
  themedDisplayTileId: string;
  triggerBackgroundIds: Set<string>;
  triggerContextIds: Set<string>;
  flankLeftId: string | null;
  flankRightId: string | null;
};

export type ContextThemeRuleRaw = {
  baseObjectId?: string;
  themedObjectId?: string;
  triggerBackgroundObjectId?: string;
  flankDecoObjectId?: string;
};

const ORTHO: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Draw-time display override when base terrain + trigger neighbor match a rule.
 * (Java ContextThemeSubstitution.themedDisplayTileId)
 */
export function themedDisplayTileId(
  rules: ContextThemeRule[],
  baseDisplayId: string | null | undefined,
  terrainCode: number,
  cellOverlay: Map<number, string>,
  tx: number,
  ty: number,
): string | null {
  if (!rules.length || !baseDisplayId || cellOverlay.size === 0) return null;
  const base = baseDisplayId.trim();
  for (const r of rules) {
    if (r.baseTerrainCode !== terrainCode || !r.baseDisplayIds.has(base)) continue;
    for (const [dx, dy] of ORTHO) {
      const v = cellOverlay.get(packCell(tx + dx, ty + dy));
      if (v && r.triggerContextIds.has(v.trim())) return r.themedDisplayTileId;
    }
  }
  return null;
}

/**
 * Bake flank deco beside themed base cells (Java ContextThemeSubstitution.apply).
 */
export function applyContextThemeFlankBake(
  stamps: DecoStamp[],
  map: TileMap,
  bridge: TerrainTileBridge,
  displaySalt: bigint,
  roomKind: RoomKind,
  rules: ContextThemeRule[],
  tileAllowed: (id: string) => boolean,
): DecoStamp[] {
  if (!stamps.length || !rules.length) return stamps;
  const decoByCell = new Map<number, string>();
  for (const d of stamps) {
    if (d.tileId) decoByCell.set(packCell(d.tx, d.ty), d.tileId.trim());
  }
  const replace = new Map<number, string>();
  const w = map.getWidth();
  const h = map.getHeight();
  for (const r of rules) {
    if (!r.flankLeftId && !r.flankRightId) continue;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        if (map.tileAt(tx, ty) !== r.baseTerrainCode) continue;
        const disp = bridge.displayTileIdForRoomKind(
          r.baseTerrainCode,
          tx,
          ty,
          displaySalt,
          roomKind,
          tileAllowed,
        );
        if (!disp || !r.baseDisplayIds.has(disp.trim())) continue;
        if (!hasOrthoNeighborIn(decoByCell, r.triggerBackgroundIds, tx, ty)) continue;
        const leftKey = packCell(tx - 1, ty);
        const rightKey = packCell(tx + 1, ty);
        const leftDeco = decoByCell.get(leftKey);
        const rightDeco = decoByCell.get(rightKey);
        if (r.flankLeftId && leftDeco && r.triggerBackgroundIds.has(leftDeco)) {
          replace.set(leftKey, r.flankLeftId);
        }
        if (r.flankRightId && rightDeco && r.triggerBackgroundIds.has(rightDeco)) {
          replace.set(rightKey, r.flankRightId);
        }
      }
    }
  }
  if (replace.size === 0) return stamps;
  return stamps.map((d) => {
    const nid = replace.get(packCell(d.tx, d.ty));
    return nid ? { ...d, tileId: nid } : d;
  });
}

export function decoOverlayFromStamps(stamps: DecoStamp[] | null | undefined): Map<number, string> {
  const out = new Map<number, string>();
  if (!stamps) return out;
  for (const d of stamps) {
    if (d.tileId) out.set(packCell(d.tx, d.ty), d.tileId.trim());
  }
  return out;
}

export function parseContextThemeRules(
  project: TilesetProject,
  rulesSource: ContextThemeRuleRaw[] | null | undefined,
): ContextThemeRule[] {
  if (!rulesSource?.length) return [];
  const out: ContextThemeRule[] = [];
  for (const raw of rulesSource) {
    const baseObj = (raw.baseObjectId ?? "").trim();
    const themedObj = (raw.themedObjectId ?? "").trim();
    const trigBg = (raw.triggerBackgroundObjectId ?? "").trim();
    const flankObj = (raw.flankDecoObjectId ?? "").trim();
    if (!baseObj || !trigBg) continue;
    const baseRow = project.objectById.get(baseObj);
    if (!baseRow) continue;
    const terrain = terrainNameToCode(baseRow.mapTerrain) ?? 0;
    const baseDisplays = new Set(memberTileIds(project, baseObj));
    const themedMembers = themedObj
      ? memberTileIds(project, themedObj)
      : memberTileIds(project, baseObj);
    for (const m of themedMembers) baseDisplays.add(m);
    const themedDisplay = themedMembers[0] ?? null;
    const bg = new Set(memberTileIds(project, trigBg));
    const flankMembers = flankObj ? memberTileIds(project, flankObj) : [];
    const left = flankMembers[0] ?? null;
    const right = flankMembers[1] ?? left;
    const context = new Set(bg);
    for (const m of flankMembers) context.add(m);
    if (!themedDisplay || bg.size === 0 || baseDisplays.size === 0) continue;
    out.push({
      baseTerrainCode: terrain,
      baseDisplayIds: baseDisplays,
      themedDisplayTileId: themedDisplay,
      triggerBackgroundIds: bg,
      triggerContextIds: context,
      flankLeftId: left,
      flankRightId: right,
    });
  }
  return out;
}

function memberTileIds(project: TilesetProject, objectId: string): string[] {
  const obj = project.objectById.get(objectId);
  if (!obj) return [];
  const out: string[] = [];
  if (obj.memberGraphLayout?.cells.length) {
    for (const c of obj.memberGraphLayout.cells) {
      if (c.tileId) out.push(c.tileId.trim());
    }
  }
  for (const tid of obj.tileIds) {
    if (tid && !out.includes(tid)) out.push(tid);
  }
  return out;
}

function hasOrthoNeighborIn(
  decoByCell: Map<number, string>,
  ids: Set<string>,
  tx: number,
  ty: number,
): boolean {
  for (const [dx, dy] of ORTHO) {
    const v = decoByCell.get(packCell(tx + dx, ty + dy));
    if (v && ids.has(v)) return true;
  }
  return false;
}

/** Prefer biome rules when non-empty, else project root. */
export function resolveContextThemeRulesForBiome(
  project: TilesetProject,
  biomeRules: ContextThemeRuleRaw[] | null | undefined,
): ContextThemeRule[] {
  if (biomeRules?.length) return parseContextThemeRules(project, biomeRules);
  return parseContextThemeRules(project, project.contextThemeRulesRaw);
}
