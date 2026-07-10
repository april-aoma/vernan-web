import type { RoomKind } from "../world/DungeonTypes";
import type { TileMap } from "../world/TileMap";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
} from "../world/TileMap";
import { packCell } from "../world/BossDoorSealAnim";
import {
  themedDisplayTileId,
  type ContextThemeRule,
} from "./ContextThemeSubstitution";
import {
  resolveTerrainDisplayTileId,
  sameAutotilePackage,
  type AutotileMassContext,
} from "./MemberGraphAutotile";
import type { TerrainTileBridge } from "./TerrainTileBridge";
import type { AutotileObject, TilesetProject } from "./TilesetProject";

/** Thin fallbacks when bridge/member-graph miss (Phase C ids). */
const FALLBACK: Record<number, string> = {
  [TILE_SOLID]: "block",
  [TILE_LADDER]: "main_5_2",
  [TILE_PLATFORM]: "main_3_2",
  [TILE_DOOR]: "main_9_3",
  [TILE_BREAKABLE]: "main_r4c3",
};

export type ResolveDisplayExtras = {
  /** Door art kind by packCell (Java doorDisplayKindForCell). */
  doorDestByCell?: Map<number, RoomKind> | null;
  /** Deco overlay for context theme swap. */
  decoOverlay?: Map<number, string> | null;
  /** Parsed context theme rules. */
  contextThemeRules?: ContextThemeRule[] | null;
};

/**
 * Resolve display tile id for a map cell: terrain bridge → MemberGraph for SOLID/BREAKABLE.
 * Matches Java AutotileDraw.resolveTerrainMassCell: bridge pick is a package tag; connect-package
 * cells remapped through connectAs member graph.
 */
export function resolveDisplayTileId(
  project: TilesetProject,
  bridge: TerrainTileBridge,
  map: TileMap,
  tx: number,
  ty: number,
  roomKind: RoomKind,
  displaySalt: bigint,
  floorOrdinal = 1,
  extras: ResolveDisplayExtras = {},
): string | null {
  const terrain = map.tileAt(tx, ty);
  if (terrain === TILE_EMPTY) return null;

  const tileAllowed = (id: string) => project.tileAllowed(id, floorOrdinal, roomKind);

  if (terrain === TILE_DOOR) {
    const doorKind =
      extras.doorDestByCell?.get(packCell(tx, ty)) ?? roomKind;
    return resolveDoorTile(bridge, map, tx, ty, doorKind, displaySalt, (id) =>
      project.tileAllowed(id, floorOrdinal, doorKind),
    );
  }

  const pooled =
    bridge.displayTileIdForRoomKind(terrain, tx, ty, displaySalt, roomKind, tileAllowed) ??
    FALLBACK[terrain] ??
    null;
  if (!pooled) return null;

  if (terrain !== TILE_SOLID && terrain !== TILE_BREAKABLE) {
    if (terrain === TILE_PLATFORM) {
      const left = map.tileAt(tx - 1, ty) === TILE_PLATFORM;
      const right = map.tileAt(tx + 1, ty) === TILE_PLATFORM;
      if (left !== right && project.cell("main_3_3") && tileAllowed("main_3_3")) {
        return "main_3_3";
      }
    }
    const themed = themedDisplayTileId(
      extras.contextThemeRules ?? [],
      pooled,
      terrain,
      extras.decoOverlay ?? new Map(),
      tx,
      ty,
    );
    return themed ?? pooled;
  }

  // Java resolveTerrainMassCell: if pick belongs to connect object → force connect graph.
  const connectId = bridge.connectTileIdForRoomKind(terrain, roomKind) || pooled;
  const connectObj = project.objectByTileId.get(connectId) ?? project.objectById.get(connectId);
  let resolved = pooled;
  if (
    connectObj?.usesMemberGraph &&
    pickBelongsToConnectObject(connectObj, pooled, project)
  ) {
    const massCtx: AutotileMassContext = {
      object: connectObj,
      bridge,
      displaySalt,
      roomKind,
      floorOrdinal,
      project,
    };
    resolved = resolveTerrainDisplayTileId(project, connectId, map, tx, ty, terrain, massCtx);
  } else {
    // Else: pick's own autotile package (e.g. log among block mass).
    const owner = project.objectByTileId.get(pooled);
    if (owner?.usesMemberGraph) {
      const massCtx: AutotileMassContext = {
        object: owner,
        bridge,
        displaySalt,
        roomKind,
        floorOrdinal,
        project,
      };
      resolved = resolveTerrainDisplayTileId(project, pooled, map, tx, ty, terrain, massCtx);
    }
  }

  const themed = themedDisplayTileId(
    extras.contextThemeRules ?? [],
    resolved,
    terrain,
    extras.decoOverlay ?? new Map(),
    tx,
    ty,
  );
  return themed ?? resolved;
}

function resolveDoorTile(
  bridge: TerrainTileBridge,
  map: TileMap,
  tx: number,
  ty: number,
  doorKind: RoomKind,
  displaySalt: bigint,
  tileAllowed: (id: string) => boolean,
): string {
  return (
    bridge.displayTileIdForDoorIfPaired(map, tx, ty, displaySalt, doorKind, tileAllowed) ??
    FALLBACK[TILE_DOOR] ??
    "main_9_3"
  );
}

function pickBelongsToConnectObject(
  connectObj: AutotileObject,
  displayId: string,
  project: TilesetProject,
): boolean {
  if (sameAutotilePackage(connectObj, displayId, project)) return true;
  if (connectObj.tileIds.includes(displayId)) return true;
  if (connectObj.id === displayId) return true;
  return connectObj.memberGraphLayout?.cells.some((c) => c.tileId === displayId) ?? false;
}
