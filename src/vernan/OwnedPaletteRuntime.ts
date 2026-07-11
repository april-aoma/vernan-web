import type { ItemCatalog } from "../item/ItemCatalog";
import type { PlayerItemInventory } from "../item/PlayerItemInventory";
import { ITEM_IDS_BY_ORDINAL } from "../item/effect/ItemOrdinal";

/** Merges ownedPaletteOverrides from owned passives in ItemId ordinal order (Java OwnedPaletteRuntime). */
export function mergeOwnedPalette(
  inv: PlayerItemInventory,
  catalog: ItemCatalog,
): ReadonlyMap<number, number> {
  const merged = new Map<number, number>();
  for (const id of ITEM_IDS_BY_ORDINAL) {
    if (inv.stacksOf(id) <= 0) continue;
    mergeItemPaletteOverrides(merged, id, catalog);
  }
  return merged;
}

/** Score-entry item id list (leaderboard costume icons). */
export function mergeOwnedPaletteFromItemIds(
  itemIds: readonly string[],
  catalog: ItemCatalog,
): ReadonlyMap<number, number> {
  if (itemIds.length === 0) return new Map();
  const owned = new Set(itemIds);
  const merged = new Map<number, number>();
  for (const id of ITEM_IDS_BY_ORDINAL) {
    if (!owned.has(id)) continue;
    mergeItemPaletteOverrides(merged, id, catalog);
  }
  return merged;
}

function mergeItemPaletteOverrides(
  merged: Map<number, number>,
  id: string,
  catalog: ItemCatalog,
): void {
  let def;
  try {
    def = catalog.def(id);
  } catch {
    return;
  }
  if (def.subweapon) return;
  for (const o of def.ownedPaletteOverrides) {
    merged.set(keyRgb(o.fromArgb), o.toArgb & 0xffffff);
  }
}

export function ownedPaletteEmpty(map: ReadonlyMap<number, number> | undefined): boolean {
  return !map || map.size === 0;
}

function keyRgb(argb: number): number {
  return argb | 0xff000000;
}

/**
 * Replace exact RGB matches on non-transparent pixels in ImageData (Java OwnedPaletteRuntime.apply).
 */
export function applyOwnedPaletteToImageData(
  data: ImageData,
  paletteMap: ReadonlyMap<number, number>,
): boolean {
  if (ownedPaletteEmpty(paletteMap)) return false;
  const px = data.data;
  let changed = false;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]!;
    if (a === 0) continue;
    const key =
      0xff000000 |
      ((px[i]! & 0xff) << 16) |
      ((px[i + 1]! & 0xff) << 8) |
      (px[i + 2]! & 0xff);
    const repl = paletteMap.get(key);
    if (repl == null) continue;
    px[i] = (repl >> 16) & 0xff;
    px[i + 1] = (repl >> 8) & 0xff;
    px[i + 2] = repl & 0xff;
    changed = true;
  }
  return changed;
}
