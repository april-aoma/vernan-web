import type { AssetLoader } from "../assets/AssetLoader";
import type { CostumeLayersFile } from "../ranking/costumeResolve";
import {
  ALL_COSTUME_STATES,
  COSTUME_STATES,
  groundedCostumeFallback,
  type CostumeState,
} from "./CostumeState";
import {
  COSTUME_ALL,
  COSTUME_LEMON_ALL,
  animKeyForCostumeState,
  fileStem,
  stripPathCandidates,
} from "./CostumeNaming";
import { VERNAN_POSE_PACKS, posePackAnimKey } from "../vernan/VernanPosePack";
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

export type CostumeArtLoadOptions = {
  /** When set, only these folder names are loaded (others skipped). */
  folders?: ReadonlySet<string> | readonly string[];
};

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
  /** folder → packAnimKey (boredA) → token → frames */
  private readonly posePackStrips = new Map<string, Map<string, Map<string, CostumeFrameStrip>>>();
  private readonly routingByFolder = new Map<string, CostumeLayerRouting>();
  private readonly loadedFolders = new Set<string>();
  private anyLoaded = false;
  private anyLemonLoaded = false;

  get empty(): boolean {
    return !this.anyLoaded;
  }

  hasFolder(folderName: string): boolean {
    return this.loadedFolders.has(folderName);
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
    options?: CostumeArtLoadOptions,
  ): Promise<CostumeArtCache> {
    const cache = new CostumeArtCache();
    await cache.ensureFolders(assets, layersFile, drawConfig, manifestPaths, options?.folders);
    return cache;
  }

  /**
   * Load additional costume folders into this cache (skips already-loaded folders).
   * Candidates are intersected with the runtime manifest so missing paths never fetch.
   */
  async ensureFolders(
    assets: AssetLoader,
    layersFile: CostumeLayersFile,
    drawConfig: CostumeDrawConfig,
    manifestPaths: string[],
    folders?: ReadonlySet<string> | readonly string[] | null,
  ): Promise<void> {
    const costumePaths = manifestPaths.filter((p) => p.startsWith("sprites/costume/"));
    const manifestSet = new Set(manifestPaths);
    const folderFilter =
      folders == null
        ? null
        : folders instanceof Set
          ? folders
          : new Set(folders);

    for (const layer of layersFile.layers) {
      const folder = layer.folderName;
      if (folderFilter && !folderFilter.has(folder)) continue;
      if (this.loadedFolders.has(folder)) continue;

      const folderPaths = costumePaths.filter((p) => p.startsWith(`sprites/costume/${folder}/`));
      if (folderPaths.length === 0) {
        this.loadedFolders.add(folder);
        continue;
      }

      const partTokens = discoverPartTokensFromPaths(manifestPaths, folder);
      const routing = costumeLayerRoutingForFolder(
        layer.itemId,
        folder,
        partTokens,
        drawConfig,
      );
      this.routingByFolder.set(folder, routing);

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
          manifestSet,
        );
        await tryLoadStrip(
          assets,
          stripPathCandidates(folder, state, COSTUME_LEMON_ALL),
          frameCount,
          perLegacyLemon,
          state,
          manifestSet,
        );
        await tryLoadStrip(
          assets,
          stripPathCandidates(folder, state, `hold-${COSTUME_ALL}`),
          frameCount,
          perLegacyHold,
          state,
          manifestSet,
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
            manifestSet,
          );
          await tryLoadPartStrip(
            assets,
            stripPathCandidates(folder, state, `hold-${token}`),
            frameCount,
            perPartHold,
            state,
            token,
            manifestSet,
          );
          await tryLoadPartStrip(
            assets,
            stripPathCandidates(folder, state, `l-${token}`),
            frameCount,
            perPartLemon,
            state,
            token,
            manifestSet,
          );
        }
      }

      if (perLegacy.size > 0) {
        this.legacyStrips.set(folder, perLegacy);
        this.anyLoaded = true;
      }
      if (perLegacyLemon.size > 0) {
        this.legacyLemonStrips.set(folder, perLegacyLemon);
        this.anyLemonLoaded = true;
      }
      if (perLegacyHold.size > 0) {
        this.legacyHoldStrips.set(folder, perLegacyHold);
        this.anyLoaded = true;
      }
      if (perPart.size > 0) {
        this.partStrips.set(folder, perPart);
        this.anyLoaded = true;
      }
      if (perPartLemon.size > 0) {
        this.partLemonStrips.set(folder, perPartLemon);
        this.anyLemonLoaded = true;
      }
      if (perPartHold.size > 0) {
        this.partHoldStrips.set(folder, perPartHold);
        this.anyLoaded = true;
      }

      const packs = await loadPosePackStrips(
        assets,
        folder,
        routing,
        manifestSet,
      );
      if (packs && packs.size > 0) {
        this.posePackStrips.set(folder, packs);
        this.anyLoaded = true;
      }
      this.loadedFolders.add(folder);
    }
  }

  frame(
    folderName: string,
    state: CostumeState,
    frameIndex: number,
    lemon: boolean,
    holdOverhead: boolean,
    partToken: string | null,
    posePackAnimKey: string | null = null,
  ): ImageBitmap | null {
    if (posePackAnimKey) {
      const pack = this.posePackFrame(
        folderName,
        posePackAnimKey,
        partToken ?? COSTUME_ALL,
      );
      if (pack) return pack;
    }
    let img = this.frameForState(folderName, state, frameIndex, lemon, holdOverhead, partToken);
    if (img) return img;
    const grounded = groundedCostumeFallback(state);
    if (grounded) {
      img = this.frameForState(folderName, grounded, frameIndex, lemon, holdOverhead, partToken);
    }
    return img;
  }

  private posePackFrame(
    folderName: string,
    posePackAnimKey: string,
    token: string,
  ): ImageBitmap | null {
    const packs = this.posePackStrips.get(folderName);
    const tokens = packs?.get(posePackAnimKey);
    if (!tokens) return null;
    let frames = tokens.get(token);
    if ((!frames || frames.length === 0) && token !== COSTUME_ALL) {
      frames = tokens.get(COSTUME_ALL);
    }
    if (!frames || frames.length === 0) return null;
    return frames[0] ?? null;
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
    if (!frames || frames.length === 0 || frameIndex < 0) return null;
    return frames[Math.min(frameIndex, frames.length - 1)] ?? null;
  }

  private partFromMap(
    perState: PartStrips | undefined,
    state: CostumeState,
    partToken: string,
    frameIndex: number,
  ): ImageBitmap | null {
    const frames = perState?.get(state)?.get(partToken);
    if (!frames || frames.length === 0 || frameIndex < 0) return null;
    return frames[Math.min(frameIndex, frames.length - 1)] ?? null;
  }
}

async function tryLoadStrip(
  assets: AssetLoader,
  candidates: string[],
  frameCount: number,
  target: LegacyStrips,
  state: CostumeState,
  manifestSet: ReadonlySet<string>,
): Promise<void> {
  for (const path of candidates) {
    if (!manifestSet.has(path)) continue;
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
  manifestSet: ReadonlySet<string>,
): Promise<void> {
  for (const path of candidates) {
    if (!manifestSet.has(path)) continue;
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

async function loadPosePackStrips(
  assets: AssetLoader,
  folder: string,
  routing: CostumeLayerRouting,
  manifestSet: ReadonlySet<string>,
): Promise<Map<string, Map<string, CostumeFrameStrip>> | null> {
  const parent = animKeyForCostumeState("BORED");
  const base = `sprites/costume/${folder}/`;
  let out: Map<string, Map<string, CostumeFrameStrip>> | null = null;
  for (const pack of VERNAN_POSE_PACKS) {
    const packKey = posePackAnimKey(parent, pack);
    let tokens: Map<string, CostumeFrameStrip> | null = null;
    const allPath = `${base}${fileStem(packKey, COSTUME_ALL)}.png`;
    if (manifestSet.has(allPath)) {
      const frames = await loadStripQuiet(assets, allPath, 1);
      if (frames) {
        tokens = new Map();
        tokens.set(COSTUME_ALL, frames);
      }
    }
    for (const route of routing.parts) {
      const partPath = `${base}${fileStem(packKey, route.fileToken)}.png`;
      if (!manifestSet.has(partPath)) continue;
      const frames = await loadStripQuiet(assets, partPath, 1);
      if (!frames) continue;
      if (!tokens) tokens = new Map();
      tokens.set(route.fileToken, frames);
    }
    if (tokens) {
      if (!out) out = new Map();
      out.set(packKey, tokens);
    }
  }
  return out;
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
    if (sw < 1 || sh < 1) return null;
    const expected = Math.max(1, frameCount);
    let actualCount = expected;
    let fw: number;
    if (sw % expected === 0) {
      fw = Math.floor(sw / expected);
    } else if (sw % 32 === 0) {
      actualCount = Math.max(1, Math.floor(sw / 32));
      fw = 32;
    } else {
      fw = Math.max(1, Math.floor(sw / expected));
      actualCount = Math.max(1, Math.floor(sw / fw));
    }
    if (fw < 1 || actualCount * fw > sw) return null;
    const out: ImageBitmap[] = [];
    for (let i = 0; i < actualCount; i++) {
      out.push(await createImageBitmap(sheet, i * fw, 0, fw, sh));
    }
    return out;
  } catch {
    return null;
  }
}
