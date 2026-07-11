import type { VernanBodyPart } from "./VernanBodyPart";
import type { VernanBodyVariant } from "./VernanBodyVariant";
import type { VernanBodyLibrary } from "./VernanBodyLibrary";

export type VernanBodyDrawContext = {
  lemonPose: boolean;
  blinkFrame: boolean;
  airborne: boolean;
  holdOverhead: boolean;
  suppressParts: ReadonlySet<VernanBodyPart>;
  enableParts: ReadonlySet<VernanBodyPart>;
};

export function buildVernanBodyContext(
  overrides: { suppress: ReadonlySet<VernanBodyPart>; enable: ReadonlySet<VernanBodyPart> },
  lemonPose: boolean,
  blinkFrame: boolean,
  airborne: boolean,
  holdOverhead: boolean,
): VernanBodyDrawContext {
  return {
    lemonPose,
    blinkFrame,
    airborne,
    holdOverhead,
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
