import { AssetLoader } from "../assets/AssetLoader";
import { ItemCatalog } from "../item/ItemCatalog";
import {
  folderForCostumeId,
  loadCostumeLayers,
  resolveVisibleCostumeIds,
  type CostumeLayersFile,
} from "../ranking/costumeResolve";
import { CAMERA_ZOOM } from "../specs";
import {
  applyOwnedPaletteToImageData,
  mergeOwnedPaletteFromItemIds,
  ownedPaletteEmpty,
} from "../vernan/OwnedPaletteRuntime";

const IDLE_SRC = "assets/sprites/vernan idle.png";

/** In-game Vernan idle cel size (world px). */
export const COSTUME_ICON_NATIVE_SIZE = 32;

/** Nearest-neighbor upscale matching in-game {@link CAMERA_ZOOM} (2 device px per world px). */
export const COSTUME_ICON_DISPLAY_SIZE = COSTUME_ICON_NATIVE_SIZE * CAMERA_ZOOM;

const bitmapCache = new Map<string, Promise<ImageBitmap | null>>();
let catalogCache: Promise<ItemCatalog> | null = null;

function assetBaseUrl(): string {
  return new URL("assets/", window.location.href).href;
}

function assetUrl(rel: string): string {
  return new URL(rel, window.location.href).href;
}

function loadBitmap(rel: string): Promise<ImageBitmap | null> {
  const url = assetUrl(rel);
  let pending = bitmapCache.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await createImageBitmap(await res.blob());
      } catch {
        return null;
      }
    })();
    bitmapCache.set(url, pending);
  }
  return pending;
}

async function loadCatalog(): Promise<ItemCatalog> {
  if (!catalogCache) {
    const base = assetBaseUrl();
    catalogCache = ItemCatalog.load(new AssetLoader({ assetBase: base }));
  }
  return catalogCache;
}

function applyOwnedPaletteToCanvas(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: ReadonlyMap<number, number>,
): void {
  if (ownedPaletteEmpty(palette)) return;
  const data = g.getImageData(0, 0, w, h);
  if (applyOwnedPaletteToImageData(data, palette)) {
    g.putImageData(data, 0, 0);
  }
}

/**
 * Composite Vernan idle + costume `idle all.png` overlays, apply owned-item palette
 * remaps (e.g. red dye), then nearest-neighbor upscale to game zoom (64px default).
 */
export async function renderCostumeIdleIcon(
  itemIds: readonly string[],
  layers?: CostumeLayersFile,
  displaySize = COSTUME_ICON_DISPLAY_SIZE,
): Promise<string> {
  const layersFile = layers ?? (await loadCostumeLayers());
  const catalog = await loadCatalog();
  const costumeIds = resolveVisibleCostumeIds(itemIds, layersFile);
  const ownedPalette = mergeOwnedPaletteFromItemIds(itemIds, catalog);

  const canvas = document.createElement("canvas");
  canvas.width = COSTUME_ICON_NATIVE_SIZE;
  canvas.height = COSTUME_ICON_NATIVE_SIZE;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return assetUrl(IDLE_SRC);
  g.imageSmoothingEnabled = false;

  const idle = await loadBitmap(IDLE_SRC);
  if (idle) g.drawImage(idle, 0, 0);

  for (const id of costumeIds) {
    const folder = folderForCostumeId(layersFile, id);
    if (!folder) continue;
    const overlay = await loadBitmap(`assets/sprites/costume/${folder}/idle all.png`);
    if (overlay) g.drawImage(overlay, 0, 0);
  }

  applyOwnedPaletteToCanvas(g, COSTUME_ICON_NATIVE_SIZE, COSTUME_ICON_NATIVE_SIZE, ownedPalette);

  if (displaySize === COSTUME_ICON_NATIVE_SIZE) {
    return canvas.toDataURL("image/png");
  }

  const out = document.createElement("canvas");
  out.width = displaySize;
  out.height = displaySize;
  const og = out.getContext("2d");
  if (!og) return canvas.toDataURL("image/png");
  og.imageSmoothingEnabled = false;
  og.drawImage(canvas, 0, 0, displaySize, displaySize);
  return out.toDataURL("image/png");
}
