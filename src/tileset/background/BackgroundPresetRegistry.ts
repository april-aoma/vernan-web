import type { AssetLoader } from "../../assets/AssetLoader";
import { toJavaLong } from "../../util/JavaRandom";
import { mapList, str, type JsonMap } from "./jsonMaps";
import { copyPreset, isolateLayerTransforms } from "./BackgroundPresetNormalize";
import { readAllArgb } from "./BackgroundPixelBuffers";
import { spriteFromBitmap, type BackgroundSprite } from "./BackgroundSprite";

const BOSS_PRESET_PICK_SALT = 0xb055b46c47524f4fn;
const SECRET_PRESET_PICK_SALT = 0x5ec847b427220a95n;

const BOSS_PREFIX = "boss";
const SECRET_PREFIX = "secret";
const BACKGROUND_DIR = "sprites/background";

type ManifestFile = { path: string };

/**
 * Loads sprites/background/*.preset.json and PNG strips for in-game room backgrounds.
 * Mirrors Java BackgroundPresetRegistry, loading via AssetLoader + runtime-manifest.
 */
export class BackgroundPresetRegistry {
  private readonly presets = new Map<string, JsonMap>();
  private readonly spritesMap = new Map<string, BackgroundSprite>();
  private readonly bossIds: string[] = [];
  private readonly secretIds: string[] = [];

  private constructor() {}

  static async load(assets: AssetLoader): Promise<BackgroundPresetRegistry> {
    const reg = new BackgroundPresetRegistry();
    try {
      const files = await listBackgroundFiles(assets);
      await reg.loadSprites(assets, files);
      await reg.loadPresets(assets, files);
      if (reg.bossIds.length === 0 && reg.secretIds.length === 0) {
        console.warn(`[background] No room presets found under ${BACKGROUND_DIR}`);
      } else {
        console.log(
          `[background] Loaded boss=${JSON.stringify(reg.bossIds)} secret=${JSON.stringify(reg.secretIds)} sprites=${reg.spritesMap.size}`,
        );
      }
    } catch (ex) {
      console.error(`[background] Failed to load presets:`, ex);
    }
    return reg;
  }

  bossPresetIds(): readonly string[] {
    return this.bossIds;
  }

  secretPresetIds(): readonly string[] {
    return this.secretIds;
  }

  /** All loaded preset ids, sorted. */
  allPresetIds(): string[] {
    const out = [...this.presets.keys()];
    out.sort(compareFamilyIds);
    return out;
  }

  preset(id: string): JsonMap | undefined {
    return this.presets.get(id);
  }

  get sprites(): ReadonlyMap<string, BackgroundSprite> {
    return this.spritesMap;
  }

  /** Convenience: plain object view of sprites (for APIs expecting Record). */
  spritesRecord(): Record<string, BackgroundSprite> {
    const out: Record<string, BackgroundSprite> = {};
    for (const [k, v] of this.spritesMap) out[k] = v;
    return out;
  }

  hasBossPresets(): boolean {
    return this.bossIds.length > 0;
  }

  hasSecretPresets(): boolean {
    return this.secretIds.length > 0;
  }

  /** Deterministic boss background for a room from its contentSeed. */
  pickBossPresetId(roomContentSeed: bigint): string | null {
    return pickFromFamily(this.bossIds, roomContentSeed, BOSS_PRESET_PICK_SALT);
  }

  /** Deterministic secret-room background from contentSeed. */
  pickSecretPresetId(roomContentSeed: bigint): string | null {
    return pickFromFamily(this.secretIds, roomContentSeed, SECRET_PRESET_PICK_SALT);
  }

  private async loadSprites(assets: AssetLoader, files: string[]): Promise<void> {
    const pngs = files
      .filter((p) => p.toLowerCase().endsWith(".png"))
      .map((p) => p.slice(BACKGROUND_DIR.length + 1))
      .sort();
    for (const name of pngs) {
      const base = stripExt(name);
      try {
        const bmp = await assets.loadImage(`${BACKGROUND_DIR}/${name}`);
        const px = readAllArgb(bmp, bmp.width, bmp.height);
        this.spritesMap.set(base, spriteFromBitmap(base, bmp, px));
      } catch (ex) {
        console.warn(`[background] Failed to read sprite ${name}`, ex);
      }
    }
  }

  private async loadPresets(assets: AssetLoader, files: string[]): Promise<void> {
    const presetNames = files
      .filter((p) => p.toLowerCase().endsWith(".preset.json"))
      .map((p) => p.slice(BACKGROUND_DIR.length + 1));
    presetNames.sort((a, b) =>
      compareFamilyIds(stripPresetExt(a), stripPresetExt(b)),
    );

    for (const name of presetNames) {
      const fileId = stripPresetExt(name);
      const family = familyPrefix(fileId);
      if (family == null) continue;
      try {
        const raw = await assets.loadJson<JsonMap>(`${BACKGROUND_DIR}/${name}`);
        if (!raw || typeof raw !== "object") continue;
        const preset = copyPreset(raw);
        const id = str(preset, "id", fileId);
        if (familyPrefix(id) !== family) continue;
        preset["id"] = id;
        isolateLayerTransforms(preset);
        if (!this.validatePresetLayers(id, preset)) continue;
        this.presets.set(id, preset);
        if (family === BOSS_PREFIX) this.bossIds.push(id);
        else this.secretIds.push(id);
      } catch (ex) {
        console.warn(`[background] Bad preset ${name}:`, ex);
      }
    }
    this.bossIds.sort((a, b) => compareFamilyIdsPrefixed(a, b, BOSS_PREFIX));
    this.secretIds.sort((a, b) => compareFamilyIdsPrefixed(a, b, SECRET_PREFIX));
  }

  private validatePresetLayers(id: string, preset: JsonMap): boolean {
    const layers = mapList(preset, "layers");
    if (layers.length === 0) {
      console.warn(`[background] Preset ${id} has no layers — skipped`);
      return false;
    }
    let resolved = 0;
    for (const layer of layers) {
      const spriteId = str(layer, "sprite", "");
      if (this.spritesMap.has(spriteId)) resolved++;
      else console.warn(`[background] Preset ${id} references missing sprite '${spriteId}'`);
    }
    if (resolved === 0) {
      console.warn(`[background] Preset ${id} has no resolvable layers — skipped`);
      return false;
    }
    return true;
  }
}

/** Java Long.remainderUnsigned(pick, ids.size()). */
function remainderUnsigned(value: bigint, modulus: number): number {
  if (modulus <= 0) return 0;
  const u = BigInt.asUintN(64, value);
  return Number(u % BigInt(modulus));
}

function pickFromFamily(ids: string[], roomContentSeed: bigint, salt: bigint): string | null {
  if (ids.length === 0) return null;
  const pick = toJavaLong(roomContentSeed) ^ salt;
  const idx = remainderUnsigned(pick, ids.length);
  return ids[idx]!;
}

async function listBackgroundFiles(assets: AssetLoader): Promise<string[]> {
  try {
    const manifest = await assets.loadJson<{ files?: ManifestFile[] }>("runtime-manifest.json");
    const files = manifest.files ?? [];
    return files
      .map((f) => f.path)
      .filter(
        (p) =>
          p.startsWith(`${BACKGROUND_DIR}/`) &&
          (p.toLowerCase().endsWith(".png") || p.toLowerCase().endsWith(".preset.json")),
      );
  } catch {
    // Fallback: known boss/secret indices if manifest missing
    const out: string[] = [];
    for (let i = 0; i < 16; i++) {
      for (const prefix of [BOSS_PREFIX, SECRET_PREFIX]) {
        const base = `${prefix}${i}`;
        out.push(`${BACKGROUND_DIR}/${base}.png`);
        out.push(`${BACKGROUND_DIR}/${base}.preset.json`);
      }
    }
    return out;
  }
}

function familyPrefix(id: string): string | null {
  if (isFamilyPresetId(id, BOSS_PREFIX)) return BOSS_PREFIX;
  if (isFamilyPresetId(id, SECRET_PREFIX)) return SECRET_PREFIX;
  return null;
}

function isFamilyPresetId(id: string | null | undefined, prefix: string): boolean {
  if (id == null || id.trim() === "" || !id.startsWith(prefix)) return false;
  if (id.length === prefix.length) return false;
  for (let i = prefix.length; i < id.length; i++) {
    const c = id.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function compareFamilyIds(a: string, b: string): number {
  const fa = familyPrefix(a);
  const fb = familyPrefix(b);
  if (fa == null && fb == null) return a < b ? -1 : a > b ? 1 : 0;
  if (fa == null) return 1;
  if (fb == null) return -1;
  const cmp = fa < fb ? -1 : fa > fb ? 1 : 0;
  if (cmp !== 0) return cmp;
  return compareFamilyIdsPrefixed(a, b, fa);
}

function compareFamilyIdsPrefixed(a: string, b: string, prefix: string): number {
  const na = familyNumericSuffix(a, prefix);
  const nb = familyNumericSuffix(b, prefix);
  if (na !== nb) return na < nb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function familyNumericSuffix(id: string, prefix: string): number {
  if (!isFamilyPresetId(id, prefix)) return Number.MAX_SAFE_INTEGER;
  const n = Number.parseInt(id.slice(prefix.length), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function stripPresetExt(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".preset.json")) {
    return name.slice(0, name.length - ".preset.json".length);
  }
  return stripExt(name);
}
