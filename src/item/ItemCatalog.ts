import type { AssetLoader } from "../assets/AssetLoader";
import { parseItemRow, type ItemDefinition } from "./ItemDefinition";
import { ItemPools } from "./ItemPools";
import { PedestalSpawnKind } from "./PedestalSpawnKind";

/**
 * Loads data/items.json (Java ItemCatalog).
 */
export class ItemCatalog {
  private readonly byId = new Map<string, ItemDefinition>();
  private fallbackId = "HEART_LT3";

  static async load(assets: AssetLoader): Promise<ItemCatalog> {
    const raw = await assets.loadJson<{ items?: unknown[] }>("data/items.json");
    const cat = new ItemCatalog();
    cat.bind(raw);
    return cat;
  }

  private bind(root: { items?: unknown[] }): void {
    this.byId.clear();
    const defs: ItemDefinition[] = [];
    let fallback: string | null = null;
    const items = root.items;
    if (!Array.isArray(items)) throw new Error("items.json missing items array");
    for (const row of items) {
      if (!row || typeof row !== "object") continue;
      const def = parseItemRow(row as Record<string, unknown>);
      if (!def.id) continue;
      this.byId.set(def.id, def);
      defs.push(def);
      if (def.poolFallback) fallback = def.id;
    }
    if (fallback) this.fallbackId = fallback;
    ItemPools.rebuild(defs);
  }

  def(id: string): ItemDefinition {
    const d = this.byId.get(id);
    if (!d) throw new Error(`Unknown item id: ${id}`);
    return d;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  poolFallback(): string {
    return this.fallbackId;
  }

  /** Eligible ITEM_ROOM pool. */
  itemRoomEligible(): string[] {
    return [...ItemPools.eligibleFor(PedestalSpawnKind.ITEM_ROOM)];
  }

  /** Eligible BOSS_CLEAR pool. */
  bossClearEligible(): string[] {
    return [...ItemPools.eligibleFor(PedestalSpawnKind.BOSS_CLEAR)];
  }

  /** Eligible SHOP pool. */
  shopEligible(): string[] {
    return [...ItemPools.eligibleFor(PedestalSpawnKind.SHOP)];
  }

  /** Eligible SECRET pedestal pool. */
  secretEligible(): string[] {
    return [...ItemPools.eligibleFor(PedestalSpawnKind.SECRET)];
  }

  eligibleFor(kind: PedestalSpawnKind): string[] {
    return [...ItemPools.eligibleFor(kind)];
  }

  allIds(): string[] {
    return [...this.byId.keys()];
  }
}
