import { RoomKind } from "../world/DungeonTypes";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
} from "../world/TileMap";
import { parseRoomKindToken } from "./RoomScope";
import type {
  AutotileObject,
  MemberFootprintCell,
  TerrainBridgeBucket,
  TilesetProject,
  WeightedDisplayChoice,
} from "./TilesetProject";

const TERRAIN_ORDER = ["SOLID", "BREAKABLE", "DOOR", "PLATFORM", "LADDER"] as const;

const PER_KIND_FROM_OBJECTS = new Set(["SOLID", "BREAKABLE", "PLATFORM"]);

const FALLBACK_TILE: Record<string, string> = {
  SOLID: "block",
  BREAKABLE: "block",
  DOOR: "block",
  PLATFORM: "block",
  LADDER: "block",
};

/**
 * Java TerrainBridgeFromObjects.rebuildAndPut — global tile scan + objects[] +
 * terrainBridgePoolByRoomKind (with legacy placedProps merge).
 */
export function rebuildTerrainBridgeFromObjects(project: TilesetProject): void {
  const globalBuckets = new Map<string, Map<string, number>>();
  const perKind = new Map<string, Map<string, Map<string, number>>>();
  for (const key of TERRAIN_ORDER) {
    globalBuckets.set(key, new Map());
    perKind.set(key, new Map());
  }

  // 1) Global tile pass (Java rebuildAndPut tile loop).
  for (const [tid, mt] of project.tileMapTerrain) {
    if (!isProceduralTerrainKey(mt) || mt === "EMPTY") continue;
    if (!project.cell(tid)) continue;
    if (!eligibleForGlobalTerrainBridge(project, tid)) continue;
    const owner = project.objectByTileId.get(tid);
    if (owner && (mt === "DOOR" || mt === "LADDER")) continue;
    if (skipNonAnchorMemberForTerrainBridge(project, tid)) continue;
    if (skipObjectScopedTileFromGlobalTerrainBridge(project, tid)) continue;
    const w = Math.max(1, project.tileTerrainBridgeWeight(tid));
    const bucket = globalBuckets.get(mt)!;
    bucket.set(tid, Math.max(bucket.get(tid) ?? 0, w));
  }

  // 2) Objects pass — DOOR full-objects, LADDER, then SOLID/BREAKABLE/PLATFORM.
  for (const obj of project.objects) {
    const terrain = obj.mapTerrain;
    if (!isProceduralTerrainKey(terrain)) continue;

    if (terrain === "DOOR" && obj.isFullObject) {
      if (!obj.roomKinds.length) {
        addDoorFullObjectToBucket(globalBuckets.get("DOOR")!, obj, project);
      } else {
        for (const kind of obj.roomKinds) {
          const kindUpper = kind.trim().toUpperCase();
          if (!kindUpper) continue;
          addDoorFullObjectToBucket(ensureBucket(perKind, "DOOR", kindUpper), obj, project);
        }
      }
      continue;
    }

    if (terrain === "LADDER") {
      const members = memberIdsForTerrainBridge(obj);
      if (!members.length) continue;
      const anchor = members[0]!;
      if (!project.cell(anchor)) continue;
      const w = Math.max(1, project.tileTerrainBridgeWeight(anchor));
      if (!obj.roomKinds.length) {
        const g = globalBuckets.get("LADDER")!;
        g.set(anchor, Math.max(g.get(anchor) ?? 0, w));
      } else {
        for (const kind of obj.roomKinds) {
          const kindUpper = kind.trim().toUpperCase();
          if (!kindUpper) continue;
          const bucket = ensureBucket(perKind, "LADDER", kindUpper);
          bucket.set(anchor, Math.max(bucket.get(anchor) ?? 0, w));
        }
      }
      continue;
    }

    if (obj.isFullObject || obj.isHorizontalStripAutotile) continue;
    if (!PER_KIND_FROM_OBJECTS.has(terrain)) continue;
    if (!obj.roomKinds.length) continue;
    const members = memberIdsForTerrainBridge(obj);
    if (!members.length) continue;
    for (const kind of obj.roomKinds) {
      const kindUpper = kind.trim().toUpperCase();
      if (!kindUpper) continue;
      const rk = parseRoomKindToken(kindUpper);
      const bucket = ensureBucket(perKind, terrain, kindUpper);
      for (const mid of members) {
        if (!project.cell(mid)) continue;
        if (rk != null && !project.tileAllowedInRoomKind(mid, rk)) continue;
        const w = Math.max(1, project.tileTerrainBridgeWeight(mid));
        bucket.set(mid, Math.max(bucket.get(mid) ?? 0, w));
      }
    }
  }

  // 3) Legacy placedProps → terrainBridgePool when missing.
  ensureTerrainBridgePoolFromLegacyPlacedProps(project);

  // 4) proceduralRoomGen.terrainBridgePoolByRoomKind weight overrides.
  applyTerrainBridgePoolFromProceduralGen(project, perKind);

  // 5) Build final bridge entries from global + per-kind.
  const out = new Map<number, TerrainBridgeBucket>();
  for (const terrainKey of TERRAIN_ORDER) {
    const code = terrainKeyToCode(terrainKey);
    if (code == null) continue;
    const global = new Map(globalBuckets.get(terrainKey)!);
    const kindMap = perKind.get(terrainKey)!;
    if (!global.size) {
      const fb = FALLBACK_TILE[terrainKey] ?? "block";
      if (project.cell(fb)) global.set(fb, 1);
    }
    const preserveOrder = terrainKey === "DOOR";
    const displayChoices = toChoices(global, preserveOrder);
    const connectAsTileId = pickConnectId(global, project, FALLBACK_TILE[terrainKey] ?? "block");

    const displayChoicesByRoomKind = new Map<string, WeightedDisplayChoice[]>();
    const connectAsTileIdByRoomKind = new Map<string, string>();
    const kindNames = [...kindMap.keys()].sort();
    for (const kind of kindNames) {
      const bucket = kindMap.get(kind)!;
      if (!bucket.size) continue;
      displayChoicesByRoomKind.set(kind, toChoices(bucket, preserveOrder));
      connectAsTileIdByRoomKind.set(kind, pickConnectId(bucket, project, connectAsTileId));
    }

    out.set(code, {
      displayChoices,
      displayChoicesByRoomKind,
      connectAsTileId,
      connectAsTileIdByRoomKind,
    });
  }

  project.replaceTerrainBridge(out);
}

/**
 * Java TerrainBridgeFromObjects.addDoorFullObjectToBucket — first two footprint cells
 * sorted by (dTy, dTx, tileId) so choices stay [top, bottom, top, bottom, …].
 */
export function addDoorFullObjectToBucket(
  bucket: Map<string, number>,
  obj: AutotileObject,
  project: TilesetProject,
): void {
  const foot = doorFootprintCells(obj);
  if (!foot.length) return;
  const sorted = [...foot].sort(
    (a, b) => a.dTy - b.dTy || a.dTx - b.dTx || a.tileId.localeCompare(b.tileId),
  );
  let pairCells = 0;
  for (const cell of sorted) {
    if (pairCells >= 2) break;
    if (!project.cell(cell.tileId)) continue;
    const w = Math.max(1, project.tileTerrainBridgeWeight(cell.tileId));
    bucket.set(cell.tileId, Math.max(bucket.get(cell.tileId) ?? 0, w));
    pairCells++;
  }
}

export function memberIdsForTerrainBridge(obj: AutotileObject): string[] {
  if (!obj.tileIds.length) return [];
  // Autotile / candle / ladder → anchor only; tile+variations → all members.
  if (obj.usesMemberGraph || obj.mapTerrain === "LADDER" || obj.objectType === "candle") {
    return [obj.anchorTileId || obj.tileIds[0]!].filter(Boolean);
  }
  return obj.tileIds.slice();
}

/** Java eligibleForGlobalTerrainBridge — NORMAL-allowed and not owned by non-NORMAL whitelist. */
export function eligibleForGlobalTerrainBridge(project: TilesetProject, tileId: string): boolean {
  if (!project.tileAllowedInRoomKind(tileId, RoomKind.NORMAL)) return false;
  const obj = project.objectByTileId.get(tileId);
  if (!obj) return true;
  if (!obj.roomKinds.length) return true;
  return obj.roomKinds.some((k) => k.trim().toUpperCase() === "NORMAL");
}

function skipObjectScopedTileFromGlobalTerrainBridge(
  project: TilesetProject,
  tileId: string,
): boolean {
  const obj = project.objectByTileId.get(tileId);
  if (!obj) return false;
  if (obj.isHorizontalStripAutotile) return true;
  return obj.roomKinds.length > 0;
}

function skipNonAnchorMemberForTerrainBridge(project: TilesetProject, tileId: string): boolean {
  const obj = project.objectByTileId.get(tileId);
  if (!obj) return false;
  const mems = obj.tileIds;
  const anchor = obj.anchorTileId || mems[0];
  if (!mems.length || tileId === anchor || tileId === mems[0]) return false;
  return obj.usesMemberGraph || obj.isFullObject;
}

/**
 * Copies legacy placedPropsByRoomKind into terrainBridgePoolByRoomKind when missing
 * (Java ensureTerrainBridgePoolFromLegacyPlacedProps).
 */
function ensureTerrainBridgePoolFromLegacyPlacedProps(project: TilesetProject): void {
  for (const [roomKind, list] of project.placedPropsByRoomKind) {
    let bridgeList = project.terrainBridgePoolByRoomKind.get(roomKind);
    if (!bridgeList) {
      bridgeList = [];
      project.terrainBridgePoolByRoomKind.set(roomKind, bridgeList);
    }
    for (const entry of list) {
      const oid = entry.objectId.trim();
      if (!oid) continue;
      const obj = project.objectById.get(oid);
      if (!obj) continue;
      if (obj.isHorizontalStripAutotile) continue;
      const terrain = obj.mapTerrain;
      if (terrain === "EMPTY" || terrain === "DOOR" || terrain === "LADDER") continue;
      if (bridgeList.some((b) => b.objectId === oid)) continue;
      const w = entry.weight;
      if (w <= 0) continue;
      bridgeList.push({ objectId: oid, weight: w });
    }
  }
}

function applyTerrainBridgePoolFromProceduralGen(
  project: TilesetProject,
  perKind: Map<string, Map<string, Map<string, number>>>,
): void {
  for (const [kindUpper, entries] of project.terrainBridgePoolByRoomKind) {
    for (const entry of entries) {
      const obj = project.objectById.get(entry.objectId);
      if (!obj) continue;
      if (obj.isFullObject || obj.isHorizontalStripAutotile) continue;
      if (obj.roomKinds.length && !obj.roomKinds.some((k) => k.toUpperCase() === kindUpper)) {
        continue;
      }
      const terrain = obj.mapTerrain;
      if (!PER_KIND_FROM_OBJECTS.has(terrain)) continue;
      // Java DecoEligibility.decoWeightToPickCount: round(weight * 10)
      const w = Math.max(0, Math.round(entry.weight * 10));
      if (w <= 0) continue;
      const members = memberIdsForTerrainBridge(obj);
      if (!members.length) continue;
      const bucket = ensureBucket(perKind, terrain, kindUpper);
      const rk = parseRoomKindToken(kindUpper);
      for (const mid of members) {
        if (!project.cell(mid)) continue;
        if (rk != null && !project.tileAllowedInRoomKind(mid, rk)) continue;
        bucket.set(mid, w);
      }
    }
  }
}

function doorFootprintCells(obj: AutotileObject): MemberFootprintCell[] {
  if (obj.islands[0]?.cells.length) return obj.islands[0]!.cells;
  const layout = obj.memberGraphLayout;
  if (layout?.cells.length) {
    const ax = layout.cells[0]!.x;
    const ay = layout.cells[0]!.y;
    return layout.cells.map((c) => ({
      tileId: c.tileId,
      dTx: c.x - ax,
      dTy: c.y - ay,
    }));
  }
  return obj.tileIds.slice(0, 2).map((tileId, i) => ({ tileId, dTx: 0, dTy: i }));
}

function ensureBucket(
  perKind: Map<string, Map<string, Map<string, number>>>,
  terrain: string,
  kind: string,
): Map<string, number> {
  let kindMap = perKind.get(terrain);
  if (!kindMap) {
    kindMap = new Map();
    perKind.set(terrain, kindMap);
  }
  let bucket = kindMap.get(kind);
  if (!bucket) {
    bucket = new Map();
    kindMap.set(kind, bucket);
  }
  return bucket;
}

function toChoices(weights: Map<string, number>, preserveOrder: boolean): WeightedDisplayChoice[] {
  const ids = [...weights.keys()];
  if (!preserveOrder) ids.sort();
  return ids.map((tileId) => ({ tileId, weight: weights.get(tileId)! }));
}

function pickConnectId(
  bucket: Map<string, number>,
  project: TilesetProject,
  fallback: string,
): string {
  if (!bucket.size) return fallback;
  const ids = [...bucket.keys()].sort();
  for (const id of ids) {
    if (project.tileIsConnectAnchor(id)) return id;
  }
  for (const id of ids) {
    const obj = project.objectByTileId.get(id);
    if (obj?.usesMemberGraph) return id;
  }
  return ids[0] ?? fallback;
}

function isProceduralTerrainKey(mtUpper: string): boolean {
  switch (mtUpper) {
    case "EMPTY":
    case "SOLID":
    case "BREAKABLE":
    case "DOOR":
    case "PLATFORM":
    case "LADDER":
      return true;
    default:
      return false;
  }
}

function terrainKeyToCode(key: string): number | null {
  switch (key) {
    case "SOLID":
      return TILE_SOLID;
    case "BREAKABLE":
      return TILE_BREAKABLE;
    case "DOOR":
      return TILE_DOOR;
    case "PLATFORM":
      return TILE_PLATFORM;
    case "LADDER":
      return TILE_LADDER;
    default:
      return null;
  }
}

/** RoomKind name helper for callers. */
export function roomKindName(kind: RoomKind): string {
  return RoomKind[kind] ?? "NORMAL";
}
