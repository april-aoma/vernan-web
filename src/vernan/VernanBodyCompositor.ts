import { VERNAN_BODY_PARTS, type VernanBodyPart } from "./VernanBodyPart";
import type { VernanBodyLibrary } from "./VernanBodyLibrary";
import {
  buildVernanBodyContext,
  resolveBodyVariant,
  type VernanBodyDrawContext,
} from "./VernanBodyDrawContext";
import { isPosePackPart } from "./VernanPosePack";

export { VERNAN_BODY_PARTS as VERNAN_BODY_DRAW_ORDER };

/**
 * When face includes the head mass (bored packs), hair/hat-hair draw on top.
 * Java VernanBodyCompositor.DRAW_ORDER_FACE_UNDER_HAIR.
 */
export const VERNAN_BODY_DRAW_ORDER_FACE_UNDER_HAIR: readonly VernanBodyPart[] = [
  "base",
  "legs",
  "arm",
  "face",
  "hair",
  "hat-hair",
] as const;

export function faceUnderHair(animKey: string, ctx: VernanBodyDrawContext | null): boolean {
  if (ctx?.posePackAnimKey) return true;
  return animKey === "bored";
}

export function vernanBodyDrawOrder(
  animKey: string,
  ctx: VernanBodyDrawContext | null,
): readonly VernanBodyPart[] {
  return faceUnderHair(animKey, ctx)
    ? VERNAN_BODY_DRAW_ORDER_FACE_UNDER_HAIR
    : VERNAN_BODY_PARTS;
}

function packHasPart(library: VernanBodyLibrary, packKey: string, part: VernanBodyPart): boolean {
  return (
    library.hasVariant(packKey, part, "default") ||
    library.hasVariant(packKey, part, "blink") ||
    library.hasVariant(packKey, part, "hold") ||
    library.hasVariant(packKey, part, "lemon") ||
    library.hasVariant(packKey, part, "air")
  );
}

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

  let layerAnim = animKey;
  let layerFrame = frameIndex;
  if (
    ctx.posePackAnimKey &&
    isPosePackPart(part) &&
    library.hasAnim(ctx.posePackAnimKey) &&
    packHasPart(library, ctx.posePackAnimKey, part)
  ) {
    layerAnim = ctx.posePackAnimKey;
    layerFrame = 0;
  }

  if (ctx.holdOverhead && library.hasVariant(layerAnim, part, "hold")) {
    const hold = library.frame(layerAnim, part, "hold", layerFrame);
    if (hold) return hold;
    if (part === "face") return null;
  }

  const variant = resolveBodyVariant(ctx, part, library, layerAnim);
  return library.frame(layerAnim, part, variant, layerFrame);
}

export function vernanBodyLayerImages(
  library: VernanBodyLibrary,
  animKey: string,
  frameIndex: number,
  ctx: VernanBodyDrawContext,
  visibleParts?: ReadonlySet<VernanBodyPart>,
): Map<VernanBodyPart, ImageBitmap> {
  const out = new Map<VernanBodyPart, ImageBitmap>();
  for (const part of vernanBodyDrawOrder(animKey, ctx)) {
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
  posePackAnimKey: string | null = null,
): VernanBodyDrawContext {
  return buildVernanBodyContext(
    overrides,
    lemonPose,
    blinkFrame,
    airborne,
    holdOverhead,
    posePackAnimKey,
  );
}
