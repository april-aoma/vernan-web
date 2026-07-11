import type { PlayerItemInventory } from "../item/PlayerItemInventory";
import {
  loadCostumeLayers,
  type CostumeLayersFile,
} from "../ranking/costumeResolve";
import type { CostumeState } from "./CostumeState";
import type { CostumeSlot } from "./CostumeSlot";
import type { CostumePartRoute } from "./CostumePartRoute";
import { CostumeDrawConfig } from "./CostumeDrawConfig";
import { costumeLayerRoutingForItem } from "./CostumeLayerRouting";

export class CostumeProfile {
  constructor(private readonly active: ReadonlySet<string>) {}

  static empty(): CostumeProfile {
    return EMPTY_PROFILE;
  }

  static resolve(inv: PlayerItemInventory, layersFile: CostumeLayersFile): CostumeProfile {
    const active = resolveActiveCostumeItemIds(inv, layersFile);
    return active.size === 0 ? EMPTY_PROFILE : new CostumeProfile(active);
  }

  static async resolveLoaded(inv: PlayerItemInventory): Promise<CostumeProfile> {
    const layersFile = await loadCostumeLayers();
    return CostumeProfile.resolve(inv, layersFile);
  }

  isEmpty(): boolean {
    return this.active.size === 0;
  }

  owns(itemId: string): boolean {
    return this.active.has(itemId);
  }

  activeItemIds(): readonly string[] {
    return [...this.active];
  }

  /** Per-state z-order insert point (Java CostumeProfile.slotFor). */
  static slotFor(
    itemId: string,
    folderName: string,
    state: CostumeState,
    drawConfig: CostumeDrawConfig,
  ): CostumeSlot {
    if (itemId === "CAT_TAIL") {
      return state === "CLIMB" ? "TOPMOST" : "BEHIND_BODY";
    }
    const codeDefault = costumeLayerRoutingForItem(itemId).legacySlot;
    return drawConfig.defaultSlotForFolder(folderName, codeDefault);
  }

  static slotForPart(
    _itemId: string,
    folderName: string,
    route: CostumePartRoute,
    drawConfig: CostumeDrawConfig,
  ): CostumeSlot {
    return drawConfig.partSlotForFolder(folderName, route.fileToken, route.slot);
  }
}

function resolveActiveCostumeItemIds(
  inv: PlayerItemInventory,
  layersFile: CostumeLayersFile,
): Set<string> {
  const layerById = new Map(layersFile.layers.map((l) => [l.itemId, l]));
  const owned: string[] = [];
  for (const layer of layersFile.layers) {
    if (inv.stacksOf(layer.itemId) > 0) owned.push(layer.itemId);
  }
  if (owned.length === 0) return new Set();

  const winnerByGroup = new Map<string, string>();
  const accessories: string[] = [];

  for (const id of owned) {
    const layer = layerById.get(id)!;
    const cat = layersFile.categories[layer.category];
    if (cat && !cat.exclusiveGroup) {
      accessories.push(id);
      continue;
    }
    const group = cat?.exclusiveGroup?.trim() || layer.category;
    const incumbent = winnerByGroup.get(group);
    if (!incumbent || inv.acquireSeqOf(id) > inv.acquireSeqOf(incumbent)) {
      winnerByGroup.set(group, id);
    }
  }

  const active = new Set<string>([...winnerByGroup.values(), ...accessories]);
  applySuppresses(active, layersFile);
  return active;
}

function applySuppresses(active: Set<string>, layersFile: CostumeLayersFile): void {
  const layerById = new Map(layersFile.layers.map((l) => [l.itemId, l]));
  const suppressedCategories = new Set<string>();
  for (const id of active) {
    const layer = layerById.get(id)!;
    const cat = layersFile.categories[layer.category];
    for (const s of cat?.suppresses ?? []) {
      if (layersFile.categories[s]) suppressedCategories.add(s);
    }
    for (const s of layer.suppresses ?? []) {
      if (layersFile.categories[s]) suppressedCategories.add(s);
    }
  }
  for (const id of [...active]) {
    const layer = layerById.get(id)!;
    if (suppressedCategories.has(layer.category)) active.delete(id);
  }
}

const EMPTY_PROFILE = new CostumeProfile(new Set());
