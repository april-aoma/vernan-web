import { RoomKind } from "../world/DungeonTypes";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
} from "../world/TileMap";
import type {
  AutotileObject,
  MemberFootprintCell,
  TerrainBridgeBucket,
  TilesetProject,
  WeightedDisplayChoice,
} from "./TilesetProject";

const PER_KIND_FROM_OBJECTS = new Set(["SOLID", "BREAKABLE", "PLATFORM"]);

const FALLBACK_TILE: Record<string, string> = {
  SOLID: "block",
  BREAKABLE: "block",
  DOOR: "block",
  PLATFORM: "block",
  LADDER: "block",
};

/**
 * Java TerrainBridgeFromObjects.rebuildAndPut — rebuild displayChoices from objects[]
 * (autotile → anchor only) + proceduralRoomGen.terrainBridgePoolByRoomKind weights.
 * Replaces the stale embedded bridge that mixes every floor's sheet members into NORMAL.
 */
export function rebuildTerrainBridgeFromObjects(project: TilesetProject): void {
  const perKind = new Map<string, Map<string, Map<string, number>>>();
  // terrain → roomKind → tileId → weight
  for (const key of ["SOLID", "BREAKABLE", "DOOR", "PLATFORM", "LADDER"]) {
    perKind.set(key, new Map());
  }
  /** Unscoped DOOR full-objects (Java globalBuckets.DOOR) — insertion order = pair order. */
  const globalDoor = new Map<string, number>();

  // 1) Objects with roomKinds whitelist → per-kind buckets (anchor-only for autotile).
  for (const obj of project.objects) {
    if (obj.isFullObject || obj.isHorizontalStripAutotile) continue;
    const terrain = obj.mapTerrain;
    if (!PER_KIND_FROM_OBJECTS.has(terrain)) continue;
    if (!obj.roomKinds.length) continue;
    const members = memberIdsForTerrainBridge(obj);
    if (!members.length) continue;
    for (const kind of obj.roomKinds) {
      const kindUpper = kind.trim().toUpperCase();
      if (!kindUpper) continue;
      const bucket = ensureBucket(perKind, terrain, kindUpper);
      for (const mid of members) {
        if (!project.cell(mid)) continue;
        const w = Math.max(1, project.tileTerrainBridgeWeight(mid));
        bucket.set(mid, Math.max(bucket.get(mid) ?? 0, w));
      }
    }
  }

  // 2) proceduralRoomGen.terrainBridgePoolByRoomKind overrides weights.
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
      const w = Math.max(0, Math.round(entry.weight * 10));
      if (w <= 0) continue;
      const members = memberIdsForTerrainBridge(obj);
      if (!members.length) continue;
      const bucket = ensureBucket(perKind, terrain, kindUpper);
      for (const mid of members) {
        if (!project.cell(mid)) continue;
        bucket.set(mid, w);
      }
    }
  }

  // 3) DOOR full-objects (top+bottom pair) + LADDER anchors.
  for (const obj of project.objects) {
    if (obj.isHorizontalStripAutotile) continue;
    if (obj.mapTerrain === "DOOR" && obj.isFullObject) {
      if (!obj.roomKinds.length) {
        addDoorFullObjectToBucket(globalDoor, obj, project);
      } else {
        for (const kind of obj.roomKinds) {
          const kindUpper = kind.trim().toUpperCase();
          if (!kindUpper) continue;
          addDoorFullObjectToBucket(ensureBucket(perKind, "DOOR", kindUpper), obj, project);
        }
      }
      continue;
    }
    if (obj.mapTerrain !== "LADDER" || obj.isFullObject) continue;
    const members = memberIdsForTerrainBridge(obj);
    if (!members.length) continue;
    const kinds = obj.roomKinds.length
      ? obj.roomKinds
      : ["NORMAL", "START", "ITEM", "SHOP", "BOSS", "SECRET", "SUPER_SECRET"];
    for (const kind of kinds) {
      const kindUpper = kind.trim().toUpperCase();
      const bucket = ensureBucket(perKind, "LADDER", kindUpper);
      for (const mid of members) {
        if (!project.cell(mid)) continue;
        bucket.set(mid, Math.max(bucket.get(mid) ?? 0, 1));
      }
    }
  }

  const out = new Map<number, TerrainBridgeBucket>();
  for (const [terrainKey, kindMap] of perKind) {
    const code = terrainKeyToCode(terrainKey);
    if (code == null) continue;

    let global: Map<string, number>;
    if (terrainKey === "DOOR") {
      global = new Map(globalDoor);
      if (!global.size) {
        // Prefer NORMAL/START themed doors if no unscoped pair exists.
        for (const prefer of ["NORMAL", "START"]) {
          const b = kindMap.get(prefer);
          if (b) for (const [id, w] of b) global.set(id, Math.max(global.get(id) ?? 0, w));
        }
      }
      if (!global.size) {
        const fb = FALLBACK_TILE.DOOR;
        if (project.cell(fb)) global.set(fb, 1);
        if (project.cell("main_9_3")) global.set("main_9_3", Math.max(global.get("main_9_3") ?? 0, 1));
        if (project.cell("main_10_3")) global.set("main_10_3", Math.max(global.get("main_10_3") ?? 0, 1));
      }
    } else {
      global = new Map();
      for (const prefer of ["NORMAL", "START"]) {
        const b = kindMap.get(prefer);
        if (b) for (const [id, w] of b) global.set(id, Math.max(global.get(id) ?? 0, w));
      }
      if (!global.size) {
        const fb = FALLBACK_TILE[terrainKey] ?? "block";
        if (project.cell(fb)) global.set(fb, 1);
      }
    }

    const displayChoices = toChoices(global, terrainKey === "DOOR");
    const connectAsTileId = pickConnectId(global, project, FALLBACK_TILE[terrainKey] ?? "block");

    const displayChoicesByRoomKind = new Map<string, WeightedDisplayChoice[]>();
    const connectAsTileIdByRoomKind = new Map<string, string>();
    const kindNames = [...kindMap.keys()].sort();
    for (const kind of kindNames) {
      const bucket = kindMap.get(kind)!;
      if (!bucket.size) continue;
      displayChoicesByRoomKind.set(kind, toChoices(bucket, terrainKey === "DOOR"));
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

export function memberIdsForTerrainBridge(obj: AutotileObject): string[] {
  if (!obj.tileIds.length) return [];
  // Autotile / candle / ladder → anchor only; tile+variations → all members.
  if (obj.usesMemberGraph || obj.mapTerrain === "LADDER" || obj.objectType === "candle") {
    return [obj.anchorTileId || obj.tileIds[0]!].filter(Boolean);
  }
  return obj.tileIds.slice();
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
  // Prefer member-graph autotile anchors.
  for (const id of ids) {
    const obj = project.objectByTileId.get(id);
    if (obj?.usesMemberGraph) return id;
  }
  return ids[0] ?? fallback;
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
