import type { AssetLoader } from "../assets/AssetLoader";
import type { CostumeLayersFile } from "../ranking/costumeResolve";
import {
  ALL_COSTUME_STATES,
  COSTUME_STATES,
  groundedCostumeFallback,
  type CostumeState,
} from "./CostumeState";
import { COSTUME_ALL, COSTUME_LEMON_ALL, stripPathCandidates } from "./CostumeNaming";
import {
  costumeLayerRoutingForFolder,
  costumeLayerRoutingForItem,
  discoverPartTokensFromPaths,
  type CostumeLayerRouting,
} from "./CostumeLayerRouting";
import type { CostumeDrawConfig } from "./CostumeDrawConfig";

export type CostumeFrameStrip = ImageBitmap[];

type LegacyStrips = Map<CostumeState, CostumeFrameStrip>;
type PartStrips = Map<CostumeState, Map<string, CostumeFrameStrip>>;

/**
 * Per-folder per-state sprite strip cache (Java CostumeArtCache).
 */
export class CostumeArtCache {
  private readonly legacyStrips = new Map<string, LegacyStrips>();
  private readonly legacyLemonStrips = new Map<string, LegacyStrips>();
  private readonly legacyHoldStrips = new Map<string, LegacyStrips>();
  private readonly partStrips = new Map<string, PartStrips>();
  private readonly partLemonStrips = new Map<string, PartStrips>();
  private readonly partHoldStrips = new Map<string, PartStrips>();
  private readonly routingByFolder = new Map<string, CostumeLayerRouting>();
  private anyLoaded = false;
  private anyLemonLoaded = false;

  get empty(): boolean {
    return !this.anyLoaded;
  }

  routingFor(itemId: string, folderName: string): CostumeLayerRouting {
    return (
      this.routingByFolder.get(folderName) ??
      costumeLayerRoutingForItem(itemId)
    );
  }

  static async load(
    assets: AssetLoader,
    layersFile: CostumeLayersFile,
    drawConfig: CostumeDrawConfig,
    manifestPaths: string[],
  ): Promise<CostumeArtCache> {
    const cache = new CostumeArtCache();
    const costumePaths = manifestPaths.filter((p) => p.startsWith("sprites/costume/"));

    for (const layer of layersFile.layers) {
      const folder = layer.folderName;
      const folderPaths = costumePaths.filter((p) => p.startsWith(`sprites/costume/${folder}/`));
      if (folderPaths.length === 0) continue;

      const partTokens = discoverPartTokensFromPaths(manifestPaths, folder);
      const routing = costumeLayerRoutingForFolder(
        layer.itemId,
        folder,
        partTokens,
        drawConfig,
      );
      cache.routingByFolder.set(folder, routing);

      const perLegacy: LegacyStrips = new Map();
      const perLegacyLemon: LegacyStrips = new Map();
      const perLegacyHold: LegacyStrips = new Map();
      const perPart: PartStrips = new Map();
      const perPartLemon: PartStrips = new Map();
      const perPartHold: PartStrips = new Map();

      for (const state of ALL_COSTUME_STATES) {
        const frameCount = COSTUME_STATES[state].frameCount;

        await tryLoadStrip(
          assets,
          stripPathCandidates(folder, state, COSTUME_ALL),
          frameCount,
          perLegacy,
          state,
        );
        await tryLoadStrip(
          assets,
          stripPathCandidates(folder, state, COSTUME_LEMON_ALL),
          frameCount,
          perLegacyLemon,
          state,
        );
        await tryLoadStrip(
          assets,
          stripPathCandidates(folder, state, `hold-${COSTUME_ALL}`),
          frameCount,
          perLegacyHold,
          state,
        );

        for (const route of routing.parts) {
          const token = route.fileToken;
          await tryLoadPartStrip(
            assets,
            stripPathCandidates(folder, state, token),
            frameCount,
            perPart,
            state,
            token,
          );
          await tryLoadPartStrip(
            assets,
            stripPathCandidates(folder, state, `hold-${token}`),
            frameCount,
            perPartHold,
            state,
            token,
          );
          await tryLoadPartStrip(
            assets,
            stripPathCandidates(folder, state, `l-${token}`),
            frameCount,
            perPartLemon,
            state,
            token,
          );
        }
      }

      if (perLegacy.size > 0) {
        cache.legacyStrips.set(folder, perLegacy);
        cache.anyLoaded = true;
      }
      if (perLegacyLemon.size > 0) {
        cache.legacyLemonStrips.set(folder, perLegacyLemon);
        cache.anyLemonLoaded = true;
      }
      if (perLegacyHold.size > 0) {
        cache.legacyHoldStrips.set(folder, perLegacyHold);
        cache.anyLoaded = true;
      }
      if (perPart.size > 0) {
        cache.partStrips.set(folder, perPart);
        cache.anyLoaded = true;
      }
      if (perPartLemon.size > 0) {
        cache.partLemonStrips.set(folder, perPartLemon);
        cache.anyLemonLoaded = true;
      }
      if (perPartHold.size > 0) {
        cache.partHoldStrips.set(folder, perPartHold);
        cache.anyLoaded = true;
      }
    }

    return cache;
  }

  frame(
    folderName: string,
    state: CostumeState,
    frameIndex: number,
    lemon: boolean,
    holdOverhead: boolean,
    partToken: string | null,
  ): ImageBitmap | null {
    let img = this.frameForState(folderName, state, frameIndex, lemon, holdOverhead, partToken);
    if (img) return img;
    const grounded = groundedCostumeFallback(state);
    if (grounded) {
      img = this.frameForState(folderName, grounded, frameIndex, lemon, holdOverhead, partToken);
    }
    return img;
  }

  private frameForState(
    folderName: string,
    state: CostumeState,
    frameIndex: number,
    lemon: boolean,
    holdOverhead: boolean,
    partToken: string | null,
  ): ImageBitmap | null {
    if (partToken != null) {
      return this.partFrame(folderName, state, frameIndex, lemon, holdOverhead, partToken);
    }
    if (holdOverhead) {
      const hold = this.legacyFrame(this.legacyHoldStrips.get(folderName), state, frameIndex);
      if (hold) return hold;
    }
    if (lemon && this.anyLemonLoaded) {
      const lemonFrame = this.legacyFrame(this.legacyLemonStrips.get(folderName), state, frameIndex);
      if (lemonFrame) return lemonFrame;
    }
    if (!this.anyLoaded) return null;
    return this.legacyFrame(this.legacyStrips.get(folderName), state, frameIndex);
  }

  private partFrame(
    folderName: string,
    state: CostumeState,
    frameIndex: number,
    lemon: boolean,
    holdOverhead: boolean,
    partToken: string,
  ): ImageBitmap | null {
    if (holdOverhead) {
      const hold = this.partFromMap(this.partHoldStrips.get(folderName), state, partToken, frameIndex);
      if (hold) return hold;
    }
    if (lemon) {
      const lemonPart = this.partFromMap(
        this.partLemonStrips.get(folderName),
        state,
        partToken,
        frameIndex,
      );
      if (lemonPart) return lemonPart;
    }
    return this.partFromMap(this.partStrips.get(folderName), state, partToken, frameIndex);
  }

  private legacyFrame(
    perState: LegacyStrips | undefined,
    state: CostumeState,
    frameIndex: number,
  ): ImageBitmap | null {
    const frames = perState?.get(state);
    if (!frames || frameIndex < 0 || frameIndex >= frames.length) return null;
    return frames[frameIndex] ?? null;
  }

  private partFromMap(
    perState: PartStrips | undefined,
    state: CostumeState,
    partToken: string,
    frameIndex: number,
  ): ImageBitmap | null {
    const frames = perState?.get(state)?.get(partToken);
    if (!frames || frameIndex < 0 || frameIndex >= frames.length) return null;
    return frames[frameIndex] ?? null;
  }
}

async function tryLoadStrip(
  assets: AssetLoader,
  candidates: string[],
  frameCount: number,
  target: LegacyStrips,
  state: CostumeState,
): Promise<void> {
  for (const path of candidates) {
    const strip = await loadStripQuiet(assets, path, frameCount);
    if (strip) {
      target.set(state, strip);
      return;
    }
  }
}

async function tryLoadPartStrip(
  assets: AssetLoader,
  candidates: string[],
  frameCount: number,
  target: PartStrips,
  state: CostumeState,
  token: string,
): Promise<void> {
  for (const path of candidates) {
    const strip = await loadStripQuiet(assets, path, frameCount);
    if (strip) {
      let map = target.get(state);
      if (!map) {
        map = new Map();
        target.set(state, map);
      }
      map.set(token, strip);
      return;
    }
  }
}

async function loadStripQuiet(
  assets: AssetLoader,
  relPath: string,
  frameCount: number,
): Promise<CostumeFrameStrip | null> {
  try {
    const sheet = await assets.loadImage(relPath);
    const sw = sheet.width;
    const sh = sheet.height;
    if (sw < frameCount || sh < 1) return null;
    const fw = Math.floor(sw / frameCount);
    const out: ImageBitmap[] = [];
    for (let i = 0; i < frameCount; i++) {
      out.push(await createImageBitmap(sheet, i * fw, 0, fw, sh));
    }
    return out;
  } catch {
    return null;
  }
}
