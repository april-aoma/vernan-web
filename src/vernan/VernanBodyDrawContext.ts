import type { VernanBodyPart } from "./VernanBodyPart";
import type { VernanBodyVariant } from "./VernanBodyVariant";
import type { VernanBodyLibrary } from "./VernanBodyLibrary";

export type VernanBodyDrawContext = {
  lemonPose: boolean;
  blinkFrame: boolean;
  airborne: boolean;
  holdOverhead: boolean;
  /** When set (e.g. boredA), hair/face load from this pack anim with frame hold. */
  posePackAnimKey: string | null;
  suppressParts: ReadonlySet<VernanBodyPart>;
  enableParts: ReadonlySet<VernanBodyPart>;
};

export function buildVernanBodyContext(
  overrides: { suppress: ReadonlySet<VernanBodyPart>; enable: ReadonlySet<VernanBodyPart> },
  lemonPose: boolean,
  blinkFrame: boolean,
  airborne: boolean,
  holdOverhead: boolean,
  posePackAnimKey: string | null = null,
): VernanBodyDrawContext {
  return {
    lemonPose,
    blinkFrame,
    airborne,
    holdOverhead,
    posePackAnimKey: posePackAnimKey && posePackAnimKey.length > 0 ? posePackAnimKey : null,
    suppressParts: overrides.suppress,
    enableParts: overrides.enable,
  };
}

export function resolveBodyVariant(
  ctx: VernanBodyDrawContext,
  part: VernanBodyPart,
  library: VernanBodyLibrary,
  animKey: string,
): VernanBodyVariant {
  if (ctx.holdOverhead && library.hasVariant(animKey, part, "hold")) return "hold";
  if (ctx.lemonPose && library.hasVariant(animKey, part, "lemon")) return "lemon";
  if (ctx.blinkFrame && library.hasVariant(animKey, part, "blink")) return "blink";
  if (ctx.airborne && library.hasVariant(animKey, part, "air")) return "air";
  return "default";
}
