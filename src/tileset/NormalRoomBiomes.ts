import { JavaRandom } from "../util/JavaRandom";
import { RoomKind } from "../world/DungeonTypes";
import { TerrainTileBridge } from "./TerrainTileBridge";
import {
  terrainNameToCode,
  type AutotileObject,
  type BiomeRow,
  type DecoClusterFallback,
  type TilesetProject,
  type WeightedDisplayChoice,
} from "./TilesetProject";

const PICK_SALT = 0xb10eb10en;
const BIOME_EXCLUSIVE = new Set([1, 5, 3, 4]); // SOLID, BREAKABLE, PLATFORM, LADDER

export type BiomeResolution = {
  biomeId: string;
  sheetId: string;
  bridge: TerrainTileBridge;
  exclusive: boolean;
  decoPool: Array<{ objectId: string; weight: number }>;
  decoClusterCountMin: number;
  decoClusterCountMax: number;
  decoClusterFallback: DecoClusterFallback;
  /** Biome or project contextThemeRules (raw). */
  contextThemeRules: BiomeRow["contextThemeRules"];
};

/** Java NormalRoomBiomes.resolve — weighted biome + terrain bridge overlay. */
export function resolveBiome(
  project: TilesetProject,
  kind: RoomKind,
  contentSeed: bigint,
  floorOrdinal: number,
  forcedBiomeId?: string | null,
): BiomeResolution {
  const sheetId = project.primarySheetIdForFloor(floorOrdinal);
  const baseBridge = TerrainTileBridge.fromProject(project);
  const kindName = RoomKind[kind] ?? "NORMAL";

  if (kind !== RoomKind.NORMAL) {
    const tun = project.tunablesByRoomKind.get(kindName);
    const fb = project.decoClusterFallbackByRoomKind.get(kindName);
    return {
      biomeId: "default",
      sheetId,
      bridge: baseBridge,
      exclusive: false,
      decoPool: project.decoPoolsByRoomKind.get(kindName) ?? [],
      decoClusterCountMin: tun?.decoClusterCountMin ?? 3,
      decoClusterCountMax: tun?.decoClusterCountMax ?? 6,
      decoClusterFallback: fb ?? defaultDecoClusterFallback(),
      contextThemeRules: project.contextThemeRulesRaw,
    };
  }

  const biomes = project.biomesBySheet.get(sheetId) ?? project.biomesBySheet.get("main") ?? [];
  if (!biomes.length) {
    return passthrough(project, sheetId, baseBridge, kindName);
  }

  const biomeId = forcedBiomeId?.trim() || pickBiomeId(biomes, contentSeed);
  const row = biomes.find((b) => b.id === biomeId) ?? biomes[0]!;
  const isDefault = row.id === "default";
  const hasOverride =
    row.terrainBridgePool.length > 0 ||
    row.decoPool.length > 0 ||
    row.decoClusterCountMin !== 3 ||
    row.decoClusterCountMax !== 6;

  if (isDefault && !hasOverride) {
    return passthrough(project, sheetId, baseBridge, kindName, row);
  }

  const bridge = buildBiomeTerrainBridge(project, baseBridge, row, isDefault);
  return {
    biomeId: row.id,
    sheetId,
    bridge,
    exclusive: !isDefault || hasOverride,
    decoPool: row.decoPool.length ? row.decoPool : (project.decoPoolsByRoomKind.get("NORMAL") ?? []),
    decoClusterCountMin: row.decoClusterCountMin,
    decoClusterCountMax: row.decoClusterCountMax,
    decoClusterFallback: row.decoClusterFallback,
    contextThemeRules: row.contextThemeRules.length
      ? row.contextThemeRules
      : project.contextThemeRulesRaw,
  };
}

function defaultDecoClusterFallback(): DecoClusterFallback {
  return { red: "main_10_0", blue: "main_9_0" };
}

function passthrough(
  project: TilesetProject,
  sheetId: string,
  bridge: TerrainTileBridge,
  kindName: string,
  row?: BiomeRow,
): BiomeResolution {
  const tun = project.tunablesByRoomKind.get(kindName);
  const fb = project.decoClusterFallbackByRoomKind.get(kindName);
  return {
    biomeId: row?.id ?? "default",
    sheetId,
    bridge,
    exclusive: false,
    decoPool: row?.decoPool.length
      ? row.decoPool
      : (project.decoPoolsByRoomKind.get(kindName) ?? []),
    decoClusterCountMin: row?.decoClusterCountMin ?? tun?.decoClusterCountMin ?? 3,
    decoClusterCountMax: row?.decoClusterCountMax ?? tun?.decoClusterCountMax ?? 6,
    decoClusterFallback: row?.decoClusterFallback ?? fb ?? defaultDecoClusterFallback(),
    contextThemeRules: row?.contextThemeRules.length
      ? row.contextThemeRules
      : project.contextThemeRulesRaw,
  };
}

export function pickBiomeId(biomes: BiomeRow[], contentSeed: bigint): string {
  if (!biomes.length) return "default";
  let total = 0;
  for (const b of biomes) total += Math.max(0, b.weight);
  if (total <= 0) return biomes[0]!.id;
  const rng = new JavaRandom(contentSeed ^ BigInt(PICK_SALT));
  let roll = rng.nextDouble() * total;
  for (const b of biomes) {
    roll -= Math.max(0, b.weight);
    if (roll < 0) return b.id;
  }
  return biomes[biomes.length - 1]!.id;
}

function buildBiomeTerrainBridge(
  project: TilesetProject,
  base: TerrainTileBridge,
  row: BiomeRow,
  defaultBiome: boolean,
): TerrainTileBridge {
  if (!row.terrainBridgePool.length) return base.copy();

  const overrides = new Map<number, WeightedDisplayChoice[]>();
  for (const entry of row.terrainBridgePool) {
    const obj = project.objectById.get(entry.objectId);
    if (!obj) continue;
    if (obj.isFullObject || obj.isHorizontalStripAutotile) continue;
    if (!objectAllowsNormal(obj)) continue;
    const code = terrainNameToCode(obj.mapTerrain);
    if (code == null || code === 0) continue;
    // Java DecoEligibility.decoWeightToPickCount: round(weight * 10)
    const w = Math.max(0, Math.round(entry.weight * 10));
    if (w <= 0) continue;
    const members = membersForTerrainBridge(obj);
    const bucket = overrides.get(code) ?? [];
    for (const mid of members) bucket.push({ tileId: mid, weight: w });
    overrides.set(code, bucket);
  }
  if (!overrides.size) return base.copy();

  const connectOverrides = new Map<number, string>();
  for (const [code, choices] of overrides) {
    // Prefer first member-graph autotile anchor (Java pickConnectAnchorFromBiomeBucket).
    let connect: string | undefined;
    for (const c of choices) {
      const obj = project.objectByTileId.get(c.tileId);
      if (obj?.usesMemberGraph) {
        connect = c.tileId;
        break;
      }
    }
    connect ??= choices[0]?.tileId;
    if (connect) connectOverrides.set(code, connect);
  }

  const codesToClear = new Set(overrides.keys());
  if (!defaultBiome) {
    for (const c of BIOME_EXCLUSIVE) codesToClear.add(c);
  }

  return base
    .withoutNormalDisplayChoicesForTerrainCodes(codesToClear)
    .withNormalDisplayChoicesOverride(overrides)
    .withNormalConnectChoicesOverride(connectOverrides)
    .withExclusiveNormalTerrainCodes(codesToClear);
}

function membersForTerrainBridge(obj: AutotileObject): string[] {
  // Autotile objects contribute anchor only to pools; members chosen at draw.
  if (obj.usesMemberGraph) {
    return [obj.anchorTileId || obj.tileIds[0]!].filter(Boolean);
  }
  return obj.tileIds.length ? [obj.tileIds[0]!] : [];
}

function objectAllowsNormal(obj: AutotileObject): boolean {
  if (!obj.roomKinds.length) return true;
  return obj.roomKinds.some(
    (k) => k.toUpperCase() === "NORMAL" || k.toUpperCase() === "SECRET_ROOM",
  );
}
