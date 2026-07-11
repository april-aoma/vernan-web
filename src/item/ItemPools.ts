import type { ItemDefinition } from "./ItemDefinition";
import { PedestalSpawnKind } from "./PedestalSpawnKind";

/** Precomputed pedestal pool membership (Java ItemPools). */
export class ItemPools {
  private static eligible: string[][] = [[], [], [], []];

  static rebuild(definitions: Iterable<ItemDefinition>): void {
    const pools: string[][] = [[], [], [], []];
    for (const def of definitions) {
      if (def.spawnItemRoom) pools[PedestalSpawnKind.ITEM_ROOM]!.push(def.id);
      if (def.spawnShop) pools[PedestalSpawnKind.SHOP]!.push(def.id);
      if (def.spawnBossClear) pools[PedestalSpawnKind.BOSS_CLEAR]!.push(def.id);
      if (def.spawnSecret) pools[PedestalSpawnKind.SECRET]!.push(def.id);
    }
    ItemPools.eligible = pools;
  }

  static eligibleFor(kind: PedestalSpawnKind): readonly string[] {
    return ItemPools.eligible[kind] ?? [];
  }

  static unionPool(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const kind of [0, 1, 2, 3] as const) {
      for (const id of ItemPools.eligibleFor(kind)) {
        if (!seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
    }
    return out;
  }
}
