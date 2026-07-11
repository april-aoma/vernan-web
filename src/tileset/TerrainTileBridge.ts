import { RoomKind } from "../world/DungeonTypes";
import { TILE_DOOR, TILE_LADDER, type TileMap } from "../world/TileMap";
import type { TerrainBridgeBucket, TilesetProject, WeightedDisplayChoice } from "./TilesetProject";

/** Mutable per-room terrain bridge (global + biome overrides). */
export class TerrainTileBridge {
  private readonly buckets = new Map<number, TerrainBridgeBucket>();
  private exclusiveNormalCodes = new Set<number>();

  static fromProject(project: TilesetProject): TerrainTileBridge {
    const bridge = new TerrainTileBridge();
    for (const [code, bucket] of project.terrainBridge) {
      bridge.buckets.set(code, cloneBucket(bucket));
    }
    return bridge;
  }

  copy(): TerrainTileBridge {
    const out = new TerrainTileBridge();
    for (const [code, bucket] of this.buckets) {
      out.buckets.set(code, cloneBucket(bucket));
    }
    out.exclusiveNormalCodes = new Set(this.exclusiveNormalCodes);
    return out;
  }

  /** Clear NORMAL (and global fallback) display choices for codes, keep other room kinds. */
  withoutNormalDisplayChoicesForTerrainCodes(codes: Iterable<number>): TerrainTileBridge {
    const out = this.copy();
    for (const code of codes) {
      const b = out.buckets.get(code);
      if (!b) continue;
      b.displayChoices = [];
      b.displayChoicesByRoomKind.delete("NORMAL");
    }
    return out;
  }

  withNormalDisplayChoicesOverride(
    overrides: Map<number, WeightedDisplayChoice[]>,
  ): TerrainTileBridge {
    const out = this.copy();
    for (const [code, choices] of overrides) {
      const existing = out.buckets.get(code) ?? emptyBucket();
      existing.displayChoicesByRoomKind.set("NORMAL", choices.slice());
      if (existing.displayChoices.length === 0) {
        existing.displayChoices = choices.slice();
      }
      out.buckets.set(code, existing);
    }
    return out;
  }

  withNormalConnectChoicesOverride(connect: Map<number, string>): TerrainTileBridge {
    const out = this.copy();
    for (const [code, tid] of connect) {
      const existing = out.buckets.get(code) ?? emptyBucket();
      existing.connectAsTileIdByRoomKind.set("NORMAL", tid);
      if (!existing.connectAsTileId) existing.connectAsTileId = tid;
      out.buckets.set(code, existing);
    }
    return out;
  }

  withExclusiveNormalTerrainCodes(codes: Iterable<number>): TerrainTileBridge {
    const out = this.copy();
    out.exclusiveNormalCodes = new Set(codes);
    return out;
  }

  displayTileIdForRoomKind(
    terrainInt: number,
    tx: number,
    ty: number,
    salt: bigint,
    roomKind: RoomKind,
    tileIdAllowed?: ((id: string) => boolean) | null,
  ): string | null {
    const kindName = RoomKind[roomKind] ?? "NORMAL";
    const bucket = this.buckets.get(terrainInt);
    if (bucket) {
      const perKind = bucket.displayChoicesByRoomKind.get(kindName);
      if (perKind && perKind.length) {
        const picked = pickFromChoices(
          terrainInt,
          tx,
          ty,
          salt,
          filterChoices(perKind, tileIdAllowed),
        );
        if (picked) return picked;
      }
      if (this.exclusiveNormalCodes.has(terrainInt) && kindName === "NORMAL") {
        return null;
      }
      const fallback = pickFromChoices(
        terrainInt,
        tx,
        ty,
        salt,
        filterChoices(bucket.displayChoices, tileIdAllowed),
      );
      if (fallback) return fallback;
      // Do not ignore floor/sheet filters — that remapped off-sheet ids into wrong art.
    }
    return null;
  }

  /**
   * Java TerrainTileBridge.displayTileIdForDoorIfPaired — even-length choices are
   * [top0,bottom0, top1,bottom1, …]; pick a pair by column+salt, then top vs bottom by neighbor.
   */
  displayTileIdForDoorIfPaired(
    map: TileMap,
    tx: number,
    ty: number,
    salt: bigint,
    roomKind: RoomKind,
    tileIdAllowed?: ((id: string) => boolean) | null,
  ): string | null {
    const kindName = RoomKind[roomKind] ?? "NORMAL";
    const bucket = this.buckets.get(TILE_DOOR);
    const raw =
      (bucket?.displayChoicesByRoomKind.get(kindName)?.length
        ? bucket.displayChoicesByRoomKind.get(kindName)!
        : bucket?.displayChoices) ?? [];
    // Prefer floor-filtered choices, but keep pair parity (don't orphan a half).
    let choices = filterChoices(raw, tileIdAllowed);
    if (choices.length < 2 || choices.length % 2 !== 0) {
      choices = raw;
    }
    if (!choices.length) return null;

    if (choices.length >= 2 && choices.length % 2 === 0) {
      const pairCount = choices.length / 2;
      const pairIndex = pickWeightedIndex(pairCount, tx, 0, salt);
      const topIdx = pairIndex * 2;
      const bottomIdx = topIdx + 1;
      if (ty + 1 < map.getHeight() && map.tileAt(tx, ty + 1) === TILE_DOOR) {
        return choices[topIdx]!.tileId;
      }
      if (ty - 1 >= 0 && map.tileAt(tx, ty - 1) === TILE_DOOR) {
        return choices[bottomIdx]!.tileId;
      }
    }
    return this.displayTileIdForRoomKind(TILE_DOOR, tx, ty, salt, roomKind, tileIdAllowed);
  }

  connectTileIdForRoomKind(terrainInt: number, roomKind: RoomKind): string {
    const kindName = RoomKind[roomKind] ?? "NORMAL";
    const bucket = this.buckets.get(terrainInt);
    if (!bucket) return "";
    const per = bucket.connectAsTileIdByRoomKind.get(kindName);
    if (per) return per;
    if (bucket.connectAsTileId) return bucket.connectAsTileId;
    return bucket.displayChoices[0]?.tileId ?? "";
  }
}

function pickFromChoices(
  terrainInt: number,
  tx: number,
  ty: number,
  salt: bigint,
  choices: WeightedDisplayChoice[],
): string | null {
  if (!choices.length) return null;
  if (terrainInt === TILE_LADDER) return pickWeighted(choices, tx, 0, salt);
  return pickWeighted(choices, tx, ty, salt);
}

function filterChoices(
  choices: WeightedDisplayChoice[],
  tileIdAllowed?: ((id: string) => boolean) | null,
): WeightedDisplayChoice[] {
  if (!tileIdAllowed || !choices.length) return choices;
  const out = choices.filter((c) => tileIdAllowed(c.tileId));
  return out;
}

/** Java TerrainTileBridge.pickWeighted — Murmur-ish mix. */
export function pickWeighted(
  choices: WeightedDisplayChoice[],
  tx: number,
  ty: number,
  salt: bigint,
): string | null {
  if (!choices.length) return null;
  if (choices.length === 1) return choices[0]!.tileId;
  let total = 0;
  for (const w of choices) total += w.weight;
  if (total <= 0) return choices[0]!.tileId;
  const r = Number(mixHash(salt, tx, ty) % BigInt(total));
  let acc = 0;
  for (const w of choices) {
    acc += w.weight;
    if (r < acc) return w.tileId;
  }
  return choices[choices.length - 1]!.tileId;
}

/** Java TerrainTileBridge.pickWeightedIndex — uniform index from column+salt. */
export function pickWeightedIndex(choiceCount: number, tx: number, ty: number, salt: bigint): number {
  if (choiceCount <= 1) return 0;
  return Number(mixHash(salt, tx, ty) % BigInt(choiceCount));
}

export function mixHash(salt: bigint, tx: number, ty: number): bigint {
  const C2 = 0xc2b2ae3dn;
  const C3 = 0x165667b1n;
  let mix = salt ^ (BigInt(tx | 0) * C2) ^ (BigInt(ty | 0) * C3);
  mix = BigInt.asUintN(64, mix);
  let x = mix ^ (mix >> 33n);
  x = BigInt.asUintN(64, x * 0xff51afd7ed558ccdn);
  x ^= x >> 33n;
  x = BigInt.asUintN(64, x * 0xc4ceb9fe1a85ec53n);
  x ^= x >> 33n;
  return BigInt.asUintN(64, x);
}

function cloneBucket(b: TerrainBridgeBucket): TerrainBridgeBucket {
  return {
    displayChoices: b.displayChoices.map((c) => ({ ...c })),
    displayChoicesByRoomKind: new Map(
      [...b.displayChoicesByRoomKind.entries()].map(([k, v]) => [k, v.map((c) => ({ ...c }))]),
    ),
    connectAsTileId: b.connectAsTileId,
    connectAsTileIdByRoomKind: new Map(b.connectAsTileIdByRoomKind),
  };
}

function emptyBucket(): TerrainBridgeBucket {
  return {
    displayChoices: [],
    displayChoicesByRoomKind: new Map(),
    connectAsTileId: "",
    connectAsTileIdByRoomKind: new Map(),
  };
}
