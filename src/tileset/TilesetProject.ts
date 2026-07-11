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
import { allowsRoomKind, type TileRoomScope } from "./RoomScope";

/** Java FloorScope.ALL_FLOORS — disables sheet floorRange gating. */
export const FLOOR_SCOPE_ALL = -2147483648;

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
  /** `all` | `red` | `blue` — ambient blob channel filter. */
  decoBlobClusterChannel: "all" | "red" | "blue";
  /** Java LogicalObjectLayout.canSpawnOnGround — default true. */
  canSpawnOnGround: boolean;
  /** Java LogicalObjectLayout.canSpawnInAir — default false. */
  canSpawnInAir: boolean;
  /** Java LogicalObjectLayout.canHangFromCeiling — default false. */
  canHangFromCeiling: boolean;
  /** Java LogicalObjectLayout.canClingToWall — default false. */
  canClingToWall: boolean;
  /** Java LogicalObjectLayout.isGardeningPluckable */
  gardeningPluckable: boolean;
  memberGraphLayout: {
    cells: Array<{ tileId: string; x: number; y: number; quadrantComposite?: boolean }>;
  } | null;
  islands: MemberGraphIsland[];
  usesMemberGraph: boolean;
  isFullObject: boolean;
  isHorizontalStripAutotile: boolean;
};

/** Per-tile deco placement rule (Java DecoPlacementRules.Rule). */
export type DecoPlacementRule = {
  spawnWeight: number;
  preferAboveWeight: number;
  /** Object ids from preferAboveObjects. */
  preferredAboveObjectIds: string[];
  /** Resolved member tile ids of those objects (Java preferredAboveTileIds). */
  preferredAboveTileIds: string[];
  /** Resolved tile ids from preferAdjacentToObjects. */
  adjacentToTileIds: string[];
  preferAdjacentOrthogonalWeight: number;
  preferAdjacentDiagonalWeight: number;
  scatterOnEligibleGround: boolean;
  despawnWhenUnsupported: boolean;
  crumbleWhenUnsupported: boolean;
};

export type BiomePoolEntry = {
  objectId: string;
  weight: number;
  /** Draw / sort z (placedPropsByRoomKind). */
  z?: number;
  /** Legacy: require at least one SOLID mapTerrain member. */
  solidsOnly?: boolean;
  /** Optional member filter (Java decoPoolsByRoomKind.tileIds). */
  tileIds?: string[];
  /** Optional member index filter (Java decoPoolsByRoomKind.memberIndices). */
  memberIndices?: number[];
};

export type DecoClusterFallback = {
  red: string;
  blue: string;
  itemBlob?: string;
  shopBlob?: string;
};

export type BiomeRow = {
  id: string;
  weight: number;
  decoPool: BiomePoolEntry[];
  terrainBridgePool: BiomePoolEntry[];
  decoClusterCountMin: number;
  decoClusterCountMax: number;
  decoClusterFallback: DecoClusterFallback;
  /** Biome-local contextThemeRules (empty → use project root). */
  contextThemeRules: Array<{
    baseObjectId?: string;
    themedObjectId?: string;
    triggerBackgroundObjectId?: string;
    flankDecoObjectId?: string;
  }>;
};

export type TerrainBridgeBucket = {
  displayChoices: WeightedDisplayChoice[];
  displayChoicesByRoomKind: Map<string, WeightedDisplayChoice[]>;
  connectAsTileId: string;
  connectAsTileIdByRoomKind: Map<string, string>;
};

/** Full tile JSON subset for composite animation (Java TileRenderResolve input). */
export type TileDefJson = {
  id: string;
  renderLayers?: unknown[];
  visualClips?: unknown[];
  visualPlayback?: Record<string, unknown>;
  variations?: unknown[];
  sprite?: Record<string, unknown>;
  [key: string]: unknown;
};

type RawTile = {
  id?: string;
  renderLayers?: Array<{
    sprite?: { sheetId?: string; cell?: { row?: number; col?: number } };
  }>;
  visualClips?: unknown[];
  visualPlayback?: Record<string, unknown>;
  variations?: unknown[];
  sprite?: Record<string, unknown>;
  roomScope?: {
    allowRoomKinds?: string[];
    denyRoomKinds?: string[];
    allowFloors?: number[];
  };
  terrainBridgeWeight?: number;
  terrainBridgeConnectAnchor?: boolean;
  sceneRoles?: unknown;
  mapTerrain?: string;
  canBreakAsDeco?: boolean;
  breakableDeco?: boolean;
  breakableDecoChance?: number;
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
  /** Legacy placedPropsByRoomKind (merged into terrainBridgePool when missing). */
  readonly placedPropsByRoomKind = new Map<string, BiomePoolEntry[]>();
  readonly tunablesByRoomKind = new Map<
    string,
    { decoClusterCountMin: number; decoClusterCountMax: number }
  >();
  readonly decoClusterFallbackByRoomKind = new Map<string, DecoClusterFallback>();
  /** Root tileset.json decoTilePool (merged into ambient pick lists). */
  readonly decoTilePool: string[] = [];
  /** Tile id → breakable-deco roll probability (only tiles with canBreakAsDeco). */
  readonly decoBreakableChanceByTileId = new Map<string, number>();
  /** Tile ids with sceneRoles containing `background` — excluded from ambient blobs. */
  readonly backgroundSceneTileIds = new Set<string>();
  /** Tile ids with sceneRoles containing `foreground`. */
  readonly foregroundSceneTileIds = new Set<string>();
  /** Tile id → EMPTY mapTerrain (procedural deco-capable). */
  readonly emptyMapTerrainTileIds = new Set<string>();
  /** Tile id → uppercase mapTerrain (EMPTY if missing). */
  readonly tileMapTerrain = new Map<string, string>();
  /** Tile id → roomScope (missing = unrestricted). */
  readonly tileRoomScope = new Map<string, TileRoomScope>();
  /** Full tile defs for composite draw (clips / warp / glow). */
  readonly tileDefs = new Map<string, TileDefJson>();
  /** decoTilePlacementRules keyed by tile id. */
  readonly decoPlacementRules = new Map<string, DecoPlacementRule>();
  /** Top-level contextThemeRules from tileset.json. */
  contextThemeRulesRaw: Array<{
    baseObjectId?: string;
    themedObjectId?: string;
    triggerBackgroundObjectId?: string;
    flankDecoObjectId?: string;
  }> = [];
  private readonly tileBridgeWeight = new Map<string, number>();
  private readonly tileConnectAnchor = new Set<string>();

  static fromJson(raw: Record<string, unknown>): TilesetProject {
    const proj = new TilesetProject();
    proj.loadSheets(raw.sheets as RawSheet[] | undefined);
    proj.loadTiles(raw.tiles as RawTile[] | undefined);
    proj.loadObjects(raw.objects as Array<Record<string, unknown>> | undefined);
    proj.loadTerrainBridge(raw.terrainBridge as Record<string, unknown> | undefined);
    proj.loadProcedural(raw.proceduralRoomGen as Record<string, unknown> | undefined);
    proj.loadDecoTilePool(raw.decoTilePool);
    proj.loadDecoPlacementRules(raw.decoTilePlacementRules as Record<string, unknown> | undefined);
    proj.contextThemeRulesRaw = parseContextThemeRulesRaw(raw.contextThemeRules);
    rebuildTerrainBridgeFromObjects(proj);
    return proj;
  }

  static async load(assets: AssetLoader, path = "tileset/tileset.json"): Promise<TilesetProject> {
    const raw = await assets.loadJson<Record<string, unknown>>(path);
    return TilesetProject.fromJson(raw);
  }

  /** Tile ids owned by scatterOnEligibleGround rules — excluded from ambient blob pools. */
  groundScatterTileIds(): Set<string> {
    const out = new Set<string>();
    for (const [tid, rule] of this.decoPlacementRules) {
      if (rule.scatterOnEligibleGround) out.add(tid);
    }
    return out;
  }

  /** Channel for a tile via owning object (`all` if orphan). */
  decoBlobChannelForTile(tileId: string): "all" | "red" | "blue" {
    const obj = this.objectByTileId.get(tileId);
    return obj?.decoBlobClusterChannel ?? "all";
  }

  cell(tileId: string): SheetCell | null {
    return this.tileCells.get(tileId) ?? null;
  }

  /** Full authored tile def for composite animation, or null. */
  tileDef(tileId: string): TileDefJson | null {
    return this.tileDefs.get(tileId) ?? null;
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
    if (floorOrdinal === FLOOR_SCOPE_ALL) return true;
    const cell = this.tileCells.get(tileId);
    if (!cell) return false;
    const range = this.sheetFloorRanges.get(cell.sheetId);
    if (!range) return true;
    return floorOrdinal >= range.min && floorOrdinal <= range.max;
  }

  /** Java RoomScope.allowsRoomKind on the tile def. */
  tileAllowedInRoomKind(tileId: string, roomKind: RoomKind): boolean {
    return allowsRoomKind(this.tileRoomScope.get(tileId), roomKind);
  }

  /** Combined floor + room-kind gate (Java TilesetRuntime draw predicate). */
  tileAllowed(tileId: string, floorOrdinal: number, roomKind: RoomKind): boolean {
    return this.tileAllowedOnFloor(tileId, floorOrdinal) && this.tileAllowedInRoomKind(tileId, roomKind);
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
      const sprite = tile.renderLayers?.[0]?.sprite ?? tile.sprite;
      const sheetId =
        sprite && typeof sprite === "object"
          ? str((sprite as { sheetId?: unknown }).sheetId)
          : "";
      const cell =
        sprite && typeof sprite === "object"
          ? ((sprite as { cell?: { row?: number; col?: number } }).cell ?? null)
          : null;
      const row = cell?.row;
      const col = cell?.col;
      if (!sheetId || row == null || col == null) continue;
      this.tileCells.set(tile.id, { sheetId, row, col });
      // Keep full def for TileWorldRenderer (visualClips / scanlineWarp / glowPulse).
      this.tileDefs.set(tile.id, {
        id: tile.id,
        renderLayers: tile.renderLayers as unknown[] | undefined,
        visualClips: tile.visualClips,
        visualPlayback: tile.visualPlayback,
        variations: tile.variations,
        sprite: tile.sprite,
        autotile: (tile as { autotile?: unknown }).autotile,
        hitbox: (tile as { hitbox?: unknown }).hitbox,
        mapTerrain: tile.mapTerrain,
      });
      const w = typeof tile.terrainBridgeWeight === "number" ? tile.terrainBridgeWeight : 1;
      this.tileBridgeWeight.set(tile.id, Math.max(1, Math.floor(w)));
      if (tile.terrainBridgeConnectAnchor === true) this.tileConnectAnchor.add(tile.id);

      const mt = (tile.mapTerrain ?? "EMPTY").toString().trim().toUpperCase() || "EMPTY";
      this.tileMapTerrain.set(tile.id, mt);
      if (mt === "EMPTY") this.emptyMapTerrainTileIds.add(tile.id);

      if (tile.roomScope) {
        const allow = Array.isArray(tile.roomScope.allowRoomKinds)
          ? tile.roomScope.allowRoomKinds.filter((s): s is string => typeof s === "string")
          : undefined;
        const deny = Array.isArray(tile.roomScope.denyRoomKinds)
          ? tile.roomScope.denyRoomKinds.filter((s): s is string => typeof s === "string")
          : undefined;
        if ((allow && allow.length) || (deny && deny.length)) {
          this.tileRoomScope.set(tile.id, {
            allowRoomKinds: allow?.length ? allow : undefined,
            denyRoomKinds: deny?.length ? deny : undefined,
          });
        }
      }

      if (Array.isArray(tile.sceneRoles)) {
        for (const role of tile.sceneRoles) {
          if (typeof role !== "string") continue;
          const r = role.trim().toLowerCase();
          if (r === "background") this.backgroundSceneTileIds.add(tile.id);
          if (r === "foreground") this.foregroundSceneTileIds.add(tile.id);
        }
      }

      let canBreak = tile.canBreakAsDeco === true;
      if (!canBreak && tile.breakableDeco === true) canBreak = true;
      if (canBreak) {
        let p = 1;
        if (typeof tile.breakableDecoChance === "number" && Number.isFinite(tile.breakableDecoChance)) {
          p = Math.max(0, Math.min(1, tile.breakableDecoChance));
        }
        this.decoBreakableChanceByTileId.set(tile.id, p);
      }
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
      const channelRaw = str(raw.decoBlobClusterChannel).toLowerCase();
      const decoBlobClusterChannel: "all" | "red" | "blue" =
        channelRaw === "red" ? "red" : channelRaw === "blue" ? "blue" : "all";
      const spawnAirOnly = bool(raw.spawnAirOnly, false);
      const canSpawnOnGround = raw.canSpawnOnGround !== undefined
        ? bool(raw.canSpawnOnGround, true)
        : !spawnAirOnly;
      const canSpawnInAir = raw.canSpawnInAir !== undefined
        ? bool(raw.canSpawnInAir, false)
        : spawnAirOnly;
      const obj: AutotileObject = {
        id,
        objectType,
        mapTerrain: str(raw.mapTerrain).toUpperCase(),
        tileIds,
        anchorTileId,
        roomKinds: asStringList(raw.roomKinds),
        decoBlobClusterChannel,
        canSpawnOnGround,
        canSpawnInAir,
        canHangFromCeiling: bool(raw.canHangFromCeiling, false),
        canClingToWall: bool(raw.canClingToWall, false),
        gardeningPluckable: bool(raw.gardeningPluckable, false),
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
    const placed = (prg.placedPropsByRoomKind ?? {}) as Record<string, unknown>;
    for (const [kind, list] of Object.entries(placed)) {
      this.placedPropsByRoomKind.set(kind.toUpperCase(), parsePoolEntries(list));
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
      this.decoClusterFallbackByRoomKind.set(kind.toUpperCase(), parseDecoClusterFallback(row));
    }
  }

  private loadDecoTilePool(raw: unknown): void {
    if (!Array.isArray(raw)) return;
    for (const x of raw) {
      const s = str(x);
      if (s) this.decoTilePool.push(s);
    }
  }

  /**
   * Java ProceduralRoomGen.mergedDecoTilePoolForRoomKind — weighted decoPoolsByRoomKind
   * multiset plus optional root decoTilePool (SeedParityDump / default biome path).
   */
  mergedDecoTilePoolForRoomKind(
    roomKind: RoomKind,
    floorOrdinal = 1,
    mergeRootDecoTilePool = true,
  ): string[] {
    const kindName = (RoomKind[roomKind] ?? "NORMAL").toUpperCase();
    const poolEntries = this.decoPoolsByRoomKind.get(kindName) ?? [];
    const poolMembers = this.decoPoolMemberTileIds(poolEntries);
    const groundScatter = this.groundScatterTileIds();
    const procedural = this.expandDecoPoolFiltered(roomKind, floorOrdinal, poolMembers);
    const proceduralSet = new Set(procedural);
    const out = [...procedural];
    if (!mergeRootDecoTilePool) {
      return out.filter((tid) => !groundScatter.has(tid));
    }
    for (const tid of this.decoTilePool) {
      if (proceduralSet.has(tid)) continue;
      if (groundScatter.has(tid)) continue;
      if (
        !this.proceduralDecoTileEligibleForRoomKindPublic(
          tid,
          roomKind,
          floorOrdinal,
          poolMembers,
          groundScatter,
        )
      ) {
        continue;
      }
      out.push(tid);
    }
    return out.filter((tid) => !groundScatter.has(tid));
  }

  /** Java ProceduralRoomGen.expandDecoPoolFiltered. */
  private expandDecoPoolFiltered(
    roomKind: RoomKind,
    floorOrdinal: number,
    poolMembers: Set<string>,
  ): string[] {
    const raw = this.expandDecoPoolRaw(roomKind, floorOrdinal);
    const groundScatter = this.groundScatterTileIds();
    const out: string[] = [];
    for (const tid of raw) {
      if (
        this.proceduralDecoTileEligibleForRoomKindPublic(
          tid,
          roomKind,
          floorOrdinal,
          poolMembers,
          groundScatter,
        )
      ) {
        out.push(tid);
      }
    }
    return out;
  }

  /** Java ProceduralRoomGen.expandDecoPoolRaw — weighted multiset of member tile ids. */
  private expandDecoPoolRaw(roomKind: RoomKind, floorOrdinal: number): string[] {
    const kindName = (RoomKind[roomKind] ?? "NORMAL").toUpperCase();
    const entries = this.decoPoolsByRoomKind.get(kindName) ?? [];
    const totalPicksByObjectId = new Map<string, number>();
    const firstEntryByObjectId = new Map<string, BiomePoolEntry>();
    for (const entry of entries) {
      if (!this.objectAllowedOnFloor(entry.objectId, floorOrdinal)) continue;
      const picks = Math.max(0, Math.round(entry.weight * 10));
      if (picks <= 0) continue;
      totalPicksByObjectId.set(
        entry.objectId,
        (totalPicksByObjectId.get(entry.objectId) ?? 0) + picks,
      );
      // Java entryByObjectId.putIfAbsent — first entry's tileIds/memberIndices win.
      if (!firstEntryByObjectId.has(entry.objectId)) {
        firstEntryByObjectId.set(entry.objectId, entry);
      }
    }
    const out: string[] = [];
    for (const [objectId, picks] of totalPicksByObjectId) {
      const members = this.decoPoolExpansionMembers(objectId);
      if (!members.length) continue;
      const selected = this.selectDecoPoolMembers(firstEntryByObjectId.get(objectId), members);
      if (!selected.length) continue;
      for (const tid of selected) {
        for (let w = 0; w < picks; w++) out.push(tid);
      }
    }
    return out;
  }

  /** Java ProceduralRoomGen.selectMembers. */
  private selectDecoPoolMembers(
    entry: BiomePoolEntry | undefined,
    members: string[],
  ): string[] {
    if (!entry) return [...members];
    if (entry.tileIds?.length) {
      const allow = new Set(entry.tileIds);
      return members.filter((m) => allow.has(m));
    }
    if (entry.memberIndices?.length) {
      const out: string[] = [];
      for (const idx of entry.memberIndices) {
        if (idx >= 0 && idx < members.length) out.push(members[idx]!);
      }
      return out;
    }
    return [...members];
  }

  /**
   * Members that enter the deco pick multiset (Java buildObjectMembers):
   * full object / autotile / candle → tileIds[0] only; else all tileIds.
   */
  private decoPoolExpansionMembers(objectId: string): string[] {
    const obj = this.objectById.get(objectId);
    if (!obj?.tileIds.length) {
      return this.cell(objectId) ? [objectId] : [];
    }
    const t = obj.objectType.toLowerCase();
    if (t === "full object" || t === "fullobject" || t === "autotile" || t === "candle") {
      return [obj.tileIds[0]!];
    }
    return [...obj.tileIds];
  }

  private objectAllowedOnFloor(objectId: string, floorOrdinal: number): boolean {
    const obj = this.objectById.get(objectId);
    if (!obj) return !!this.cell(objectId);
    // Floor gating via first member tile when present.
    const tid = obj.tileIds[0] ?? objectId;
    return this.tileAllowedOnFloor(tid, floorOrdinal);
  }

  /** Exposed for merged pool eligibility (mirrors placeAmbientDeco helpers). */
  proceduralDecoTileEligibleForRoomKindPublic(
    tileId: string,
    roomKind: RoomKind,
    floorOrdinal: number,
    poolMembers: Set<string>,
    groundScatter: Set<string>,
  ): boolean {
    if (!this.cell(tileId)) return false;
    if (groundScatter.has(tileId)) return false;
    if (!this.tileAllowedInRoomKind(tileId, roomKind)) return false;
    if (!this.tileAllowedOnFloor(tileId, floorOrdinal)) return false;
    if (!this.emptyMapTerrainTileIds.has(tileId)) return false;
    if (this.backgroundSceneTileIds.has(tileId)) {
      return poolMembers.has(tileId);
    }
    if (!this.tileIdAllowedInMergedDecoRootPool(tileId)) return false;
    const owner = this.objectByTileId.get(tileId);
    if (owner) {
      if (owner.roomKinds.length) {
        const rk = (RoomKind[roomKind] ?? "NORMAL").toUpperCase();
        let ok = false;
        for (const raw of owner.roomKinds) {
          const t = raw.trim().toUpperCase();
          if (t === rk) ok = true;
          if (
            t === "SECRET_ROOM" &&
            (roomKind === RoomKind.SECRET || roomKind === RoomKind.SUPER_SECRET)
          ) {
            ok = true;
          }
        }
        if (!ok) return false;
      }
      if (poolMembers.has(tileId)) return true;
      for (const mid of owner.tileIds) {
        if (poolMembers.has(mid)) return true;
      }
      return false;
    }
    return true;
  }

  private tileIdAllowedInMergedDecoRootPool(tileId: string): boolean {
    const owner = this.objectByTileId.get(tileId);
    if (!owner) return true;
    if (owner.isHorizontalStripAutotile) return false;
    const anchor = owner.tileIds[0];
    if (!anchor || tileId === anchor) return true;
    if (owner.isFullObject || owner.objectType === "autotile") return false;
    return true;
  }

  /** Member tile ids referenced by a room-kind deco pool (Java decoPoolMemberTileIds). */
  decoPoolMemberTileIds(pool: Array<{ objectId: string; weight: number }>): Set<string> {
    const out = new Set<string>();
    for (const entry of pool) {
      const obj = this.objectById.get(entry.objectId);
      if (obj?.tileIds.length) {
        for (const tid of obj.tileIds) out.add(tid);
      } else if (this.cell(entry.objectId)) {
        out.add(entry.objectId);
      }
    }
    return out;
  }

  private loadDecoPlacementRules(raw: Record<string, unknown> | undefined): void {
    if (!raw) return;
    for (const [tileId, entry] of Object.entries(raw)) {
      if (!tileId || !entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const preferAbove = asStringList(row.preferAboveObjects);
      const preferredAboveTileIds: string[] = [];
      for (const oid of preferAbove) {
        const obj = this.objectById.get(oid);
        if (obj?.tileIds.length) preferredAboveTileIds.push(...obj.tileIds);
        else if (this.tileCells.has(oid)) preferredAboveTileIds.push(oid);
      }
      const adjacentObjectIds = asStringList(row.preferAdjacentToObjects);
      const adjacentToTileIds: string[] = [];
      for (const oid of adjacentObjectIds) {
        const obj = this.objectById.get(oid);
        if (obj?.tileIds.length) adjacentToTileIds.push(...obj.tileIds);
        else if (this.tileCells.has(oid)) adjacentToTileIds.push(oid);
      }
      let wOrth = Math.max(0, num(row.preferAdjacentOrthogonalWeight, 1));
      let wDiag = Math.max(0, num(row.preferAdjacentDiagonalWeight, 0));
      if (wOrth <= 0 && wDiag <= 0) wOrth = 1;
      const scatterOnEligibleGround = row.scatterOnEligibleGround === true;
      const crumbleWhenUnsupported = row.crumbleWhenUnsupported === true;
      const despawnWhenUnsupported =
        typeof row.despawnWhenUnsupported === "boolean"
          ? row.despawnWhenUnsupported
          : scatterOnEligibleGround && !crumbleWhenUnsupported;
      this.decoPlacementRules.set(tileId, {
        spawnWeight: Math.max(0, num(row.spawnWeight, 1)),
        preferAboveWeight: Math.max(0, Math.min(1, num(row.preferAboveWeight, 1))),
        preferredAboveObjectIds: preferAbove,
        preferredAboveTileIds: [...new Set(preferredAboveTileIds)],
        adjacentToTileIds: [...new Set(adjacentToTileIds)],
        preferAdjacentOrthogonalWeight: wOrth,
        preferAdjacentDiagonalWeight: wDiag,
        scatterOnEligibleGround,
        despawnWhenUnsupported,
        crumbleWhenUnsupported,
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
): {
  cells: Array<{ tileId: string; x: number; y: number; quadrantComposite?: boolean }>;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const cellsRaw = (raw as { cells?: unknown }).cells;
  if (!Array.isArray(cellsRaw)) return null;
  const cells: Array<{ tileId: string; x: number; y: number; quadrantComposite?: boolean }> = [];
  for (const c of cellsRaw) {
    if (!c || typeof c !== "object") continue;
    const row = c as Record<string, unknown>;
    const tileId = str(row.tileId);
    const x = num(row.x, -1);
    const y = num(row.y, -1);
    if (!tileId || x < 0 || y < 0) continue;
    const cell: { tileId: string; x: number; y: number; quadrantComposite?: boolean } = {
      tileId,
      x,
      y,
    };
    if (row.quadrantComposite === true) cell.quadrantComposite = true;
    cells.push(cell);
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
    // Java DecoEligibility.placedPropWeightFromEntry: weight, else legacy count, else 1.
    let weight = 1;
    if (row.weight != null) weight = num(row.weight, 0);
    else if (row.count != null) weight = num(row.count, 0);
    weight = Math.max(0, weight);
    if (!objectId || weight <= 0) continue;
    const entry: BiomePoolEntry = { objectId, weight };
    if (row.z != null) entry.z = Math.floor(num(row.z, 0));
    if (row.solidsOnly === true) entry.solidsOnly = true;
    if (Array.isArray(row.tileIds)) {
      const tids = row.tileIds.map((x) => str(x)).filter(Boolean);
      if (tids.length) entry.tileIds = tids;
    }
    if (Array.isArray(row.memberIndices)) {
      const idxs = row.memberIndices
        .map((x) => (typeof x === "number" ? Math.floor(x) : -1))
        .filter((i) => i >= 0);
      if (idxs.length) entry.memberIndices = idxs;
    }
    out.push(entry);
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
        decoClusterFallback: parseDecoClusterFallback(fb),
        contextThemeRules: parseContextThemeRulesRaw(row.contextThemeRules),
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

function parseContextThemeRulesRaw(
  raw: unknown,
): Array<{
  baseObjectId?: string;
  themedObjectId?: string;
  triggerBackgroundObjectId?: string;
  flankDecoObjectId?: string;
}> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{
    baseObjectId?: string;
    themedObjectId?: string;
    triggerBackgroundObjectId?: string;
    flankDecoObjectId?: string;
  }> = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const row = e as Record<string, unknown>;
    out.push({
      baseObjectId: str(row.baseObjectId) || undefined,
      themedObjectId: str(row.themedObjectId) || undefined,
      triggerBackgroundObjectId: str(row.triggerBackgroundObjectId) || undefined,
      flankDecoObjectId: str(row.flankDecoObjectId) || undefined,
    });
  }
  return out;
}

function parseDecoClusterFallback(row: Record<string, unknown>): DecoClusterFallback {
  return {
    red: str(row.red) || "main_10_0",
    blue: str(row.blue) || "main_9_0",
    itemBlob: str(row.itemBlob) || str(row.itemRoomBlob) || undefined,
    shopBlob: str(row.shopBlob) || str(row.shopRoomBlob) || undefined,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v !== 0;
  return fallback;
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
