import type { AssetLoader } from "../assets/AssetLoader";
import { RoomKind } from "../world/DungeonTypes";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
} from "../world/TileMap";
import { rebuildTerrainBridgeFromObjects } from "./rebuildTerrainBridge";

export type SheetCell = { sheetId: string; row: number; col: number };

export type WeightedDisplayChoice = { tileId: string; weight: number };

export type MemberFootprintCell = { tileId: string; dTx: number; dTy: number };

export type MemberGraphIsland = {
  cells: MemberFootprintCell[];
  memberIds: string[];
};

export type AutotileObject = {
  id: string;
  objectType: string;
  mapTerrain: string;
  tileIds: string[];
  anchorTileId: string;
  roomKinds: string[];
  memberGraphLayout: { cells: Array<{ tileId: string; x: number; y: number }> } | null;
  islands: MemberGraphIsland[];
  usesMemberGraph: boolean;
  isFullObject: boolean;
  isHorizontalStripAutotile: boolean;
};

export type BiomePoolEntry = { objectId: string; weight: number };

export type BiomeRow = {
  id: string;
  weight: number;
  decoPool: BiomePoolEntry[];
  terrainBridgePool: BiomePoolEntry[];
  decoClusterCountMin: number;
  decoClusterCountMax: number;
  decoClusterFallback: { red: string; blue: string };
};

export type TerrainBridgeBucket = {
  displayChoices: WeightedDisplayChoice[];
  displayChoicesByRoomKind: Map<string, WeightedDisplayChoice[]>;
  connectAsTileId: string;
  connectAsTileIdByRoomKind: Map<string, string>;
};

type RawTile = {
  id?: string;
  renderLayers?: Array<{
    sprite?: { sheetId?: string; cell?: { row?: number; col?: number } };
  }>;
  roomScope?: { allowRoomKinds?: string[]; allowFloors?: number[] };
  terrainBridgeWeight?: number;
  terrainBridgeConnectAnchor?: boolean;
};

type RawSheet = {
  id?: string;
  imagePath?: string;
  floorRange?: { min?: number; max?: number };
};

/**
 * Full tileset.json index for Phase C+: tiles, sheets, objects, terrain bridge, biomes.
 */
export class TilesetProject {
  readonly tileCells = new Map<string, SheetCell>();
  readonly sheetPaths = new Map<string, string>();
  readonly sheetFloorRanges = new Map<string, { min: number; max: number }>();
  readonly sheetOrder: string[] = [];
  readonly objects: AutotileObject[] = [];
  readonly objectById = new Map<string, AutotileObject>();
  readonly objectByTileId = new Map<string, AutotileObject>();
  readonly terrainBridge = new Map<number, TerrainBridgeBucket>();
  /** sheetId → biome rows */
  readonly biomesBySheet = new Map<string, BiomeRow[]>();
  readonly decoPoolsByRoomKind = new Map<string, BiomePoolEntry[]>();
  readonly terrainBridgePoolByRoomKind = new Map<string, BiomePoolEntry[]>();
  readonly tunablesByRoomKind = new Map<
    string,
    { decoClusterCountMin: number; decoClusterCountMax: number }
  >();
  readonly decoClusterFallbackByRoomKind = new Map<string, { red: string; blue: string }>();
  private readonly tileBridgeWeight = new Map<string, number>();
  private readonly tileConnectAnchor = new Set<string>();

  static async load(assets: AssetLoader, path = "tileset/tileset.json"): Promise<TilesetProject> {
    const raw = await assets.loadJson<Record<string, unknown>>(path);
    const proj = new TilesetProject();
    proj.loadSheets(raw.sheets as RawSheet[] | undefined);
    proj.loadTiles(raw.tiles as RawTile[] | undefined);
    proj.loadObjects(raw.objects as Array<Record<string, unknown>> | undefined);
    proj.loadTerrainBridge(raw.terrainBridge as Record<string, unknown> | undefined);
    proj.loadProcedural(raw.proceduralRoomGen as Record<string, unknown> | undefined);
    // Java TilesetRuntime.load always rebuilds from objects (anchors only).
    rebuildTerrainBridgeFromObjects(proj);
    return proj;
  }

  cell(tileId: string): SheetCell | null {
    return this.tileCells.get(tileId) ?? null;
  }

  tileTerrainBridgeWeight(tileId: string): number {
    return this.tileBridgeWeight.get(tileId) ?? 1;
  }

  tileIsConnectAnchor(tileId: string): boolean {
    return this.tileConnectAnchor.has(tileId);
  }

  replaceTerrainBridge(bridge: Map<number, TerrainBridgeBucket>): void {
    this.terrainBridge.clear();
    for (const [k, v] of bridge) this.terrainBridge.set(k, v);
  }

  /** Java FloorScope / TilesetRuntime.tileAllowedOnFloor — sheet floorRange gate. */
  tileAllowedOnFloor(tileId: string, floorOrdinal: number): boolean {
    const cell = this.tileCells.get(tileId);
    if (!cell) return false;
    const range = this.sheetFloorRanges.get(cell.sheetId);
    if (!range) return true;
    return floorOrdinal >= range.min && floorOrdinal <= range.max;
  }

  /** Java FloorScope.primarySheetIdForFloor — narrowest bounded match wins. */
  primarySheetIdForFloor(floorOrdinal: number): string {
    let boundedId: string | null = null;
    let boundedSpan = Number.POSITIVE_INFINITY;
    let openEndedId: string | null = null;
    let openEndedMin = Number.NEGATIVE_INFINITY;
    let deepestBoundedId: string | null = null;
    let deepestBoundedMax = Number.NEGATIVE_INFINITY;
    let everyFloorId: string | null = null;

    for (const id of this.sheetOrder) {
      const range = this.sheetFloorRanges.get(id);
      if (!range) {
        if (everyFloorId == null) everyFloorId = id;
        continue;
      }
      const { min, max } = range;
      if (max < 99_999) {
        if (floorOrdinal >= min && floorOrdinal <= max) {
          const span = Math.max(0, max - min);
          if (boundedId == null || span < boundedSpan) {
            boundedId = id;
            boundedSpan = span;
          }
        }
        if (max > deepestBoundedMax) {
          deepestBoundedMax = max;
          deepestBoundedId = id;
        }
      } else if (floorOrdinal >= min && min > openEndedMin) {
        openEndedId = id;
        openEndedMin = min;
      }
    }
    return boundedId ?? openEndedId ?? deepestBoundedId ?? everyFloorId ?? "main";
  }

  roomKindName(kind: RoomKind): string {
    return RoomKind[kind] ?? "NORMAL";
  }

  private loadSheets(sheets: RawSheet[] | undefined): void {
    for (const sheet of sheets ?? []) {
      if (!sheet.id || !sheet.imagePath) continue;
      this.sheetOrder.push(sheet.id);
      this.sheetPaths.set(sheet.id, normalizeSheetPath(sheet.imagePath));
      const min = sheet.floorRange?.min ?? 1;
      const max = sheet.floorRange?.max ?? 99_999;
      this.sheetFloorRanges.set(sheet.id, { min, max });
    }
  }

  private loadTiles(tiles: RawTile[] | undefined): void {
    for (const tile of tiles ?? []) {
      if (!tile.id) continue;
      const sprite = tile.renderLayers?.[0]?.sprite;
      const sheetId = sprite?.sheetId;
      const row = sprite?.cell?.row;
      const col = sprite?.cell?.col;
      if (sheetId == null || row == null || col == null) continue;
      this.tileCells.set(tile.id, { sheetId, row, col });
      const w = typeof tile.terrainBridgeWeight === "number" ? tile.terrainBridgeWeight : 1;
      this.tileBridgeWeight.set(tile.id, Math.max(1, Math.floor(w)));
      if (tile.terrainBridgeConnectAnchor === true) this.tileConnectAnchor.add(tile.id);
    }
  }

  private loadObjects(objects: Array<Record<string, unknown>> | undefined): void {
    for (const raw of objects ?? []) {
      const id = str(raw.id);
      if (!id) continue;
      const tileIds = asStringList(raw.tileIds);
      const objectType = str(raw.objectType).toLowerCase() || "tile+variations";
      const layout = parseMemberGraphLayout(raw.memberGraphLayout);
      const anchorTileId = str(raw.anchorTileId) || tileIds[0] || id;
      const isFullObject = objectType === "full object" || objectType === "fullobject";
      const isAutotile = objectType === "autotile";
      const usesMemberGraph =
        isAutotile && layout != null && layout.cells.length >= 2 && !isFullObject;
      // Footprints for autotile resolve + full-object deco stamps.
      const islands =
        layout != null && layout.cells.length >= 1
          ? buildMemberGraphIslands(tileIds, layout, anchorTileId)
          : [];
      const obj: AutotileObject = {
        id,
        objectType,
        mapTerrain: str(raw.mapTerrain).toUpperCase(),
        tileIds,
        anchorTileId,
        roomKinds: asStringList(raw.roomKinds),
        memberGraphLayout: layout,
        islands,
        usesMemberGraph,
        isFullObject,
        isHorizontalStripAutotile:
          usesMemberGraph &&
          islands.length === 1 &&
          isHorizontalStripFootprint(islands[0]!.cells),
      };
      this.objects.push(obj);
      this.objectById.set(id, obj);
      for (const tid of tileIds) {
        if (!this.objectByTileId.has(tid)) this.objectByTileId.set(tid, obj);
      }
      if (layout) {
        for (const c of layout.cells) {
          if (!this.objectByTileId.has(c.tileId)) this.objectByTileId.set(c.tileId, obj);
        }
      }
    }
  }

  private loadTerrainBridge(root: Record<string, unknown> | undefined): void {
    const byTerrain = (root?.byTerrain ?? {}) as Record<string, Record<string, unknown>>;
    for (const [name, entry] of Object.entries(byTerrain)) {
      const code = terrainNameToCode(name);
      if (code == null) continue;
      const displayChoices = parseWeightedChoices(entry.displayChoices);
      const byKind = new Map<string, WeightedDisplayChoice[]>();
      const rawByKind = (entry.displayChoicesByRoomKind ?? {}) as Record<string, unknown>;
      for (const [kind, list] of Object.entries(rawByKind)) {
        byKind.set(kind.toUpperCase(), parseWeightedChoices(list));
      }
      const connectByKind = new Map<string, string>();
      const rawConnect = (entry.connectAsTileIdByRoomKind ?? {}) as Record<string, unknown>;
      for (const [kind, tid] of Object.entries(rawConnect)) {
        const s = str(tid);
        if (s) connectByKind.set(kind.toUpperCase(), s);
      }
      this.terrainBridge.set(code, {
        displayChoices,
        displayChoicesByRoomKind: byKind,
        connectAsTileId: str(entry.connectAsTileId) || displayChoices[0]?.tileId || "",
        connectAsTileIdByRoomKind: connectByKind,
      });
    }
  }

  private loadProcedural(prg: Record<string, unknown> | undefined): void {
    if (!prg) return;
    const bySheet = (prg.normalBiomesBySheet ?? {}) as Record<string, unknown>;
    for (const [sheetId, list] of Object.entries(bySheet)) {
      this.biomesBySheet.set(sheetId, parseBiomeRows(list));
    }
    if (this.biomesBySheet.size === 0 && Array.isArray(prg.normalBiomes)) {
      this.biomesBySheet.set("main", parseBiomeRows(prg.normalBiomes));
    }
    const decoPools = (prg.decoPoolsByRoomKind ?? {}) as Record<string, unknown>;
    for (const [kind, list] of Object.entries(decoPools)) {
      this.decoPoolsByRoomKind.set(kind.toUpperCase(), parsePoolEntries(list));
    }
    const tbPools = (prg.terrainBridgePoolByRoomKind ?? {}) as Record<string, unknown>;
    for (const [kind, list] of Object.entries(tbPools)) {
      this.terrainBridgePoolByRoomKind.set(kind.toUpperCase(), parsePoolEntries(list));
    }
    const tunables = (prg.tunablesByRoomKind ?? {}) as Record<string, Record<string, unknown>>;
    for (const [kind, row] of Object.entries(tunables)) {
      this.tunablesByRoomKind.set(kind.toUpperCase(), {
        decoClusterCountMin: num(row.decoClusterCountMin, 3),
        decoClusterCountMax: num(row.decoClusterCountMax, 6),
      });
    }
    const fb = (prg.decoClusterFallbackTileIdsByRoomKind ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    for (const [kind, row] of Object.entries(fb)) {
      this.decoClusterFallbackByRoomKind.set(kind.toUpperCase(), {
        red: str(row.red) || "main_10_0",
        blue: str(row.blue) || "main_9_0",
      });
    }
  }
}

export function terrainNameToCode(name: string): number | null {
  switch (name.toUpperCase()) {
    case "EMPTY":
      return TILE_EMPTY;
    case "SOLID":
      return TILE_SOLID;
    case "DOOR":
      return TILE_DOOR;
    case "PLATFORM":
      return TILE_PLATFORM;
    case "LADDER":
      return TILE_LADDER;
    case "BREAKABLE":
      return TILE_BREAKABLE;
    default:
      return null;
  }
}

export function isHorizontalStripFootprint(foot: MemberFootprintCell[]): boolean {
  if (foot.length < 2) return false;
  const dys = new Set(foot.map((c) => c.dTy));
  return dys.size === 1 && foot.some((c) => c.dTx !== 0);
}

export function isVerticalStripFootprint(foot: MemberFootprintCell[]): boolean {
  if (foot.length < 2) return false;
  const dTx = foot[0]!.dTx;
  const dys = new Set<number>();
  for (const c of foot) {
    if (c.dTx !== dTx) return false;
    dys.add(c.dTy);
  }
  return dys.size === foot.length;
}

function buildMemberGraphIslands(
  memberIds: string[],
  layout: { cells: Array<{ tileId: string; x: number; y: number }> },
  anchorTileId: string,
): MemberGraphIsland[] {
  const allow = new Set(memberIds);
  const gridPos = new Map<string, { x: number; y: number }>();
  for (const c of layout.cells) {
    if (!c.tileId || !allow.has(c.tileId) || c.x < 0 || c.y < 0) continue;
    if (!gridPos.has(c.tileId)) gridPos.set(c.tileId, { x: c.x, y: c.y });
  }
  const foot = footprintFromLayout(memberIds, layout, anchorTileId);
  if (foot.length <= 1 || gridPos.size < 2) {
    return foot.length ? [{ cells: foot, memberIds: foot.map((c) => c.tileId) }] : [];
  }

  const atCell = new Map<string, string>();
  for (const [tid, p] of gridPos) atCell.set(`${p.x},${p.y}`, tid);

  const visited = new Set<string>();
  const islands: MemberGraphIsland[] = [];
  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;

  for (const seed of gridPos.keys()) {
    if (visited.has(seed)) continue;
    const component = new Set<string>();
    const queue = [seed];
    visited.add(seed);
    while (queue.length) {
      const cur = queue.shift()!;
      component.add(cur);
      const p = gridPos.get(cur);
      if (!p) continue;
      for (const [dx, dy] of dirs) {
        const nb = atCell.get(`${p.x + dx},${p.y + dy}`);
        if (!nb || visited.has(nb)) continue;
        visited.add(nb);
        queue.push(nb);
      }
    }
    const islandCells = foot.filter((c) => component.has(c.tileId));
    if (islandCells.length) {
      islands.push({
        cells: islandCells,
        memberIds: islandCells.map((c) => c.tileId),
      });
    }
  }
  return islands.length
    ? islands
    : [{ cells: foot, memberIds: foot.map((c) => c.tileId) }];
}

function footprintFromLayout(
  memberIds: string[],
  layout: { cells: Array<{ tileId: string; x: number; y: number }> },
  anchorTileId: string,
): MemberFootprintCell[] {
  const allow = new Set(memberIds);
  const pos = new Map<string, { x: number; y: number }>();
  for (const c of layout.cells) {
    if (!c.tileId || !allow.has(c.tileId) || c.x < 0 || c.y < 0) continue;
    if (!pos.has(c.tileId)) pos.set(c.tileId, { x: c.x, y: c.y });
  }
  const ap = pos.get(anchorTileId);
  if (!ap) return [{ tileId: anchorTileId, dTx: 0, dTy: 0 }];
  const out: MemberFootprintCell[] = [];
  for (const [tid, p] of pos) {
    out.push({ tileId: tid, dTx: p.x - ap.x, dTy: p.y - ap.y });
  }
  return out.length ? out : [{ tileId: anchorTileId, dTx: 0, dTy: 0 }];
}

function parseMemberGraphLayout(
  raw: unknown,
): { cells: Array<{ tileId: string; x: number; y: number }> } | null {
  if (!raw || typeof raw !== "object") return null;
  const cellsRaw = (raw as { cells?: unknown }).cells;
  if (!Array.isArray(cellsRaw)) return null;
  const cells: Array<{ tileId: string; x: number; y: number }> = [];
  for (const c of cellsRaw) {
    if (!c || typeof c !== "object") continue;
    const row = c as Record<string, unknown>;
    const tileId = str(row.tileId);
    const x = num(row.x, -1);
    const y = num(row.y, -1);
    if (!tileId || x < 0 || y < 0) continue;
    cells.push({ tileId, x, y });
  }
  return cells.length ? { cells } : null;
}

function parseWeightedChoices(raw: unknown): WeightedDisplayChoice[] {
  if (!Array.isArray(raw)) return [];
  const out: WeightedDisplayChoice[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const row = e as Record<string, unknown>;
    const tileId = str(row.tileId);
    const weight = Math.max(0, Math.floor(num(row.weight, 1)));
    if (tileId && weight > 0) out.push({ tileId, weight });
  }
  return out;
}

function parsePoolEntries(raw: unknown): BiomePoolEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: BiomePoolEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const row = e as Record<string, unknown>;
    const objectId = str(row.objectId);
    const weight = Math.max(0, num(row.weight, 1));
    if (objectId && weight > 0) out.push({ objectId, weight });
  }
  return out;
}

function parseBiomeRows(raw: unknown): BiomeRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const row = e as Record<string, unknown>;
      const id = str(row.id) || "default";
      const tun = (row.tunables ?? {}) as Record<string, unknown>;
      const fb = (row.decoClusterFallback ?? {}) as Record<string, unknown>;
      return {
        id,
        weight: Math.max(0, num(row.weight, 1)),
        decoPool: parsePoolEntries(row.decoPool),
        terrainBridgePool: parsePoolEntries(row.terrainBridgePool),
        decoClusterCountMin: num(tun.decoClusterCountMin, 3),
        decoClusterCountMax: num(tun.decoClusterCountMax, 6),
        decoClusterFallback: {
          red: str(fb.red) || "main_10_0",
          blue: str(fb.blue) || "main_9_0",
        },
      } satisfies BiomeRow;
    })
    .filter((b): b is BiomeRow => b != null);
}

function normalizeSheetPath(imagePath: string): string {
  const norm = imagePath.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/tiles/");
  if (idx >= 0) return norm.slice(idx + 1);
  if (norm.startsWith("tiles/")) return norm;
  const base = norm.split("/").pop();
  return base ? `tiles/${base}` : norm;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((s) => s.trim());
}
