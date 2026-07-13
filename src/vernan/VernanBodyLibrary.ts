import type { AssetLoader } from "../assets/AssetLoader";
import type { VernanBodyPart } from "./VernanBodyPart";
import type { VernanBodyVariant } from "./VernanBodyVariant";
import { parseVernanPartSpec } from "./VernanBodyVariant";
import { expectedFrameCountForAnimKey } from "./VernanBodyAnim";

export type BodyFrameStrip = ImageBitmap[];

type AnimStore = Map<VernanBodyPart, Map<VernanBodyVariant, BodyFrameStrip>>;

/**
 * Loads horizontal strips from sprites/vernan/<anim> <part>.png (Java VernanBodyLibrary).
 */
export class VernanBodyLibrary {
  private readonly byAnim = new Map<string, AnimStore>();
  private idleReady = false;

  get hasIdle(): boolean {
    return this.idleReady;
  }

  hasAnim(animKey: string): boolean {
    return this.byAnim.has(animKey);
  }

  hasVariant(animKey: string, part: VernanBodyPart, variant: VernanBodyVariant): boolean {
    const frames = this.byAnim.get(animKey)?.get(part)?.get(variant);
    return !!frames && frames.length > 0 && !!frames[0];
  }

  frameCount(animKey: string): number {
    const def = this.byAnim.get(animKey)?.get("base")?.get("default");
    return def?.length ?? 1;
  }

  frame(
    animKey: string,
    part: VernanBodyPart,
    variant: VernanBodyVariant,
    frameIndex: number,
  ): ImageBitmap | null {
    const frames = this.byAnim.get(animKey)?.get(part)?.get(variant);
    if (!frames || frames.length === 0 || frameIndex < 0) return null;
    // Short strips (pose-pack faces) hold the last cel across a longer parent loop.
    return frames[Math.min(frameIndex, frames.length - 1)] ?? null;
  }

  static async load(assets: AssetLoader, manifestPaths: string[]): Promise<VernanBodyLibrary> {
    const lib = new VernanBodyLibrary();
    const prefix = "sprites/vernan/";
    const vernanPaths = manifestPaths.filter(
      (p) => p.startsWith(prefix) && p.endsWith(".png") && p.includes(" "),
    );
    await Promise.all(
      vernanPaths.map(async (relPath) => {
        const fileName = relPath.slice(prefix.length);
        const stem = fileName.slice(0, -4);
        const space = stem.indexOf(" ");
        if (space <= 0) return;
        const animKey = stem.slice(0, space);
        const parsed = parseVernanPartSpec(stem.slice(space + 1));
        if (!parsed) return;
        const expected = expectedFrameCountForAnimKey(animKey);
        const strip = await loadStripQuiet(assets, relPath, expected);
        if (!strip) return;
        let perPart = lib.byAnim.get(animKey);
        if (!perPart) {
          perPart = new Map();
          lib.byAnim.set(animKey, perPart);
        }
        let perVar = perPart.get(parsed.part);
        if (!perVar) {
          perVar = new Map();
          perPart.set(parsed.part, perVar);
        }
        perVar.set(parsed.variant, strip);
      }),
    );
    lib.idleReady = lib.hasVariant("idle", "base", "default");
    return lib;
  }
}

async function loadStripQuiet(
  assets: AssetLoader,
  relPath: string,
  frameCount: number,
): Promise<BodyFrameStrip | null> {
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
      // Short / native strips (pose packs): hold one cel across a longer parent loop.
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
