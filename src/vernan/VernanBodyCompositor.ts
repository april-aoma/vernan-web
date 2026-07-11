import { VERNAN_BODY_PARTS, type VernanBodyPart } from "./VernanBodyPart";
import type { VernanBodyLibrary } from "./VernanBodyLibrary";
import {
  buildVernanBodyContext,
  resolveBodyVariant,
  type VernanBodyDrawContext,
} from "./VernanBodyDrawContext";

export { VERNAN_BODY_PARTS as VERNAN_BODY_DRAW_ORDER };

export function vernanBodyLayerImage(
  library: VernanBodyLibrary,
  animKey: string,
  frameIndex: number,
  part: VernanBodyPart,
  ctx: VernanBodyDrawContext,
): ImageBitmap | null {
  if (part === "hat-hair") {
    if (!ctx.enableParts.has("hat-hair")) return null;
  } else if (ctx.suppressParts.has(part)) {
    return null;
  } else if (part === "hair" && ctx.enableParts.has("hat-hair")) {
    return null;
  }

  if (ctx.holdOverhead && library.hasVariant(animKey, part, "hold")) {
    const hold = library.frame(animKey, part, "hold", frameIndex);
    if (hold) return hold;
    if (part === "face") return null;
  }

  const variant = resolveBodyVariant(ctx, part, library, animKey);
  return library.frame(animKey, part, variant, frameIndex);
}

export function vernanBodyLayerImages(
  library: VernanBodyLibrary,
  animKey: string,
  frameIndex: number,
  ctx: VernanBodyDrawContext,
  visibleParts?: ReadonlySet<VernanBodyPart>,
): Map<VernanBodyPart, ImageBitmap> {
  const out = new Map<VernanBodyPart, ImageBitmap>();
  for (const part of VERNAN_BODY_PARTS) {
    if (visibleParts && !visibleParts.has(part)) continue;
    const img = vernanBodyLayerImage(library, animKey, frameIndex, part, ctx);
    if (img) out.set(part, img);
  }
  return out;
}

export function buildVernanBodyDrawContext(
  overrides: { suppress: ReadonlySet<VernanBodyPart>; enable: ReadonlySet<VernanBodyPart> },
  lemonPose: boolean,
  blinkFrame: boolean,
  airborne: boolean,
  holdOverhead: boolean,
): VernanBodyDrawContext {
  return buildVernanBodyContext(overrides, lemonPose, blinkFrame, airborne, holdOverhead);
}
