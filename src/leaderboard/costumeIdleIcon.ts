import {
  folderForCostumeId,
  loadCostumeLayers,
  resolveVisibleCostumeIds,
  type CostumeLayersFile,
} from "../ranking/costumeResolve";

const IDLE_SRC = "assets/sprites/vernan idle.png";
const SIZE = 32;

const bitmapCache = new Map<string, Promise<ImageBitmap | null>>();

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

/**
 * Composite vernan idle + costume `idle all.png` overlays into a pixelated data URL.
 */
export async function renderCostumeIdleIcon(
  itemIds: readonly string[],
  layers?: CostumeLayersFile,
  displaySize = 48,
): Promise<string> {
  const layersFile = layers ?? (await loadCostumeLayers());
  const costumeIds = resolveVisibleCostumeIds(itemIds, layersFile);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext("2d");
  if (!g) return assetUrl(IDLE_SRC);
  g.imageSmoothingEnabled = false;

  const idle = await loadBitmap(IDLE_SRC);
  if (idle) g.drawImage(idle, 0, 0);

  for (const id of costumeIds) {
    const folder = folderForCostumeId(layersFile, id);
    if (!folder) continue;
    const overlay = await loadBitmap(
      `assets/sprites/costume/${folder}/idle all.png`,
    );
    if (overlay) g.drawImage(overlay, 0, 0);
  }

  if (displaySize === SIZE) {
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
