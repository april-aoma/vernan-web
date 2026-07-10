import type { SpriteStrip } from "./SpriteDraw";
import { stripFromImage } from "./SpriteDraw";

/**
 * Draw order for Vernan body parts (Java VernanBodyCompositor.DRAW_ORDER).
 * Climb uses base → arm → hair (no legs/face on climb strips).
 */
export const VERNAN_BODY_DRAW_ORDER = ["base", "legs", "arm", "hair", "hat-hair", "face"] as const;
export type VernanBodyPart = (typeof VERNAN_BODY_DRAW_ORDER)[number];

/** Climb body stack without costumes / hat-hair (default hair visible). */
export const CLIMB_BODY_PARTS: readonly VernanBodyPart[] = ["base", "arm", "hair"];

/** Level-transition strip stack (Java VernanBodyAnim.LEVEL_TRANSITION). */
export const LEVEL_TRANSITION_BODY_PARTS: readonly VernanBodyPart[] = [
  "base",
  "legs",
  "arm",
  "hair",
  "face",
];

/**
 * Composite equal-size part strips into one strip (SrcOver, same frame layout).
 * Missing parts are skipped; returns null if the first present layer fails.
 */
export async function compositeBodyStrip(
  layers: Array<SpriteStrip | null | undefined>,
): Promise<SpriteStrip | null> {
  const present = layers.filter((l): l is SpriteStrip => !!l && l.frameCount > 0);
  if (present.length === 0) return null;
  if (present.length === 1) return present[0]!;

  const base = present[0]!;
  const frameW = base.frameW;
  const frameH = base.frameH;
  const frameCount = base.frameCount;
  const canvas = document.createElement("canvas");
  canvas.width = frameW * frameCount;
  canvas.height = frameH;
  const g = canvas.getContext("2d", { alpha: true });
  if (!g) return base;
  g.imageSmoothingEnabled = false;

  for (let fi = 0; fi < frameCount; fi++) {
    const dx = fi * frameW;
    for (const layer of present) {
      const idx = ((fi % layer.frameCount) + layer.frameCount) % layer.frameCount;
      const sx = idx * layer.frameW;
      g.drawImage(layer.image, sx, 0, layer.frameW, layer.frameH, dx, 0, frameW, frameH);
    }
  }

  const image = await createImageBitmap(canvas);
  return stripFromImage(image, frameCount);
}
