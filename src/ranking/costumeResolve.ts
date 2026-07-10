/**
 * Resolve which costume item IDs should draw, given items obtained on a run.
 * Mirrors Java CostumeStackResolver enough for leaderboard icons (exclusive groups + suppresses).
 */

export type CostumeCategoryDef = {
  stackTier: number;
  exclusiveGroup?: string;
  suppresses?: string[];
};

export type CostumeLayerDef = {
  itemId: string;
  folderName: string;
  category: string;
  suppresses?: string[];
};

export type CostumeLayersFile = {
  categories: Record<string, CostumeCategoryDef>;
  layers: CostumeLayerDef[];
};

let cached: CostumeLayersFile | null = null;

export async function loadCostumeLayers(
  baseUrl: string | URL = new URL("assets/data/costume_layers.json", window.location.href),
): Promise<CostumeLayersFile> {
  if (cached) return cached;
  const res = await fetch(new URL(baseUrl, window.location.href).href, { cache: "force-cache" });
  if (!res.ok) throw new Error(`costume_layers.json (${res.status})`);
  cached = (await res.json()) as CostumeLayersFile;
  return cached;
}

export function folderForCostumeId(
  layers: CostumeLayersFile,
  itemId: string,
): string | null {
  const layer = layers.layers.find((l) => l.itemId === itemId);
  return layer?.folderName ?? null;
}

/**
 * From all items obtained on a run, pick visible costume IDs in back→front draw order.
 */
export function resolveVisibleCostumeIds(
  itemIds: readonly string[],
  layersFile: CostumeLayersFile,
): string[] {
  const owned = new Set(itemIds);
  const layerById = new Map(layersFile.layers.map((l) => [l.itemId, l]));
  const costumeOwned = layersFile.layers
    .map((l) => l.itemId)
    .filter((id) => owned.has(id));

  // Exclusive groups: keep newest among owned (last in itemIds acquisition order).
  const newestIndex = new Map<string, number>();
  itemIds.forEach((id, i) => {
    if (layerById.has(id)) newestIndex.set(id, i);
  });

  const byGroup = new Map<string, string[]>();
  for (const id of costumeOwned) {
    const layer = layerById.get(id)!;
    const cat = layersFile.categories[layer.category];
    const group = cat?.exclusiveGroup;
    if (!group) continue;
    const list = byGroup.get(group) ?? [];
    list.push(id);
    byGroup.set(group, list);
  }

  const excluded = new Set<string>();
  for (const [, ids] of byGroup) {
    if (ids.length <= 1) continue;
    ids.sort((a, b) => (newestIndex.get(a) ?? 0) - (newestIndex.get(b) ?? 0));
    const winner = ids[ids.length - 1]!;
    for (const id of ids) {
      if (id !== winner) excluded.add(id);
    }
  }

  let visible = costumeOwned.filter((id) => !excluded.has(id));

  // Suppressions from category + per-layer (category names or item ids).
  const suppressedCategories = new Set<string>();
  const suppressedItems = new Set<string>();
  for (const id of visible) {
    const layer = layerById.get(id)!;
    const cat = layersFile.categories[layer.category];
    for (const s of cat?.suppresses ?? []) {
      if (layersFile.categories[s]) suppressedCategories.add(s);
      else suppressedItems.add(s);
    }
    for (const s of layer.suppresses ?? []) {
      if (layersFile.categories[s]) suppressedCategories.add(s);
      else suppressedItems.add(s);
    }
  }

  visible = visible.filter((id) => {
    if (suppressedItems.has(id)) return false;
    const layer = layerById.get(id)!;
    if (suppressedCategories.has(layer.category)) return false;
    return true;
  });

  // Preserve layers[] declaration order (back → front).
  const order = new Map(layersFile.layers.map((l, i) => [l.itemId, i]));
  visible.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return visible;
}
