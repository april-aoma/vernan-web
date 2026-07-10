import type { AssetLoader } from "../assets/AssetLoader";
import { parseItemRow, type ItemDefinition } from "./ItemDefinition";

/**
 * Loads data/items.json (Java ItemCatalog).
 */
export class ItemCatalog {
  private readonly byId = new Map<string, ItemDefinition>();
  private fallbackId = "HEART_LT3";
  private itemRoomPool: string[] = [];
  private bossClearPool: string[] = [];
  private shopPool: string[] = [];
  private secretPool: string[] = [];

  static async load(assets: AssetLoader): Promise<ItemCatalog> {
    const raw = await assets.loadJson<{ items?: unknown[] }>("data/items.json");
    const cat = new ItemCatalog();
    cat.bind(raw);
    return cat;
  }

  private bind(root: { items?: unknown[] }): void {
    this.byId.clear();
    this.itemRoomPool = [];
    this.bossClearPool = [];
    this.shopPool = [];
    this.secretPool = [];
    let fallback: string | null = null;
    const items = root.items;
    if (!Array.isArray(items)) throw new Error("items.json missing items array");
    for (const row of items) {
      if (!row || typeof row !== "object") continue;
      const def = parseItemRow(row as Record<string, unknown>);
      if (!def.id) continue;
      this.byId.set(def.id, def);
      if (def.poolFallback) fallback = def.id;
      if (def.spawnItemRoom && !def.subweapon) this.itemRoomPool.push(def.id);
      if (def.spawnBossClear && !def.subweapon) this.bossClearPool.push(def.id);
      if (def.spawnShop && !def.subweapon) this.shopPool.push(def.id);
      if (def.spawnSecret && !def.subweapon) this.secretPool.push(def.id);
    }
    if (fallback) this.fallbackId = fallback;
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

  /** Eligible ITEM_ROOM pool (non-subweapon). */
  itemRoomEligible(): string[] {
    return this.itemRoomPool.slice();
  }

  /** Eligible BOSS_CLEAR pool. */
  bossClearEligible(): string[] {
    return this.bossClearPool.slice();
  }

  /** Eligible SHOP pool (non-subweapon). */
  shopEligible(): string[] {
    return this.shopPool.slice();
  }

  /** Eligible SECRET pedestal pool (non-subweapon). */
  secretEligible(): string[] {
    return this.secretPool.slice();
  }

  allIds(): string[] {
    return [...this.byId.keys()];
  }
}
