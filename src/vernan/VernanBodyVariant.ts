import { vernanBodyPartFromToken, type VernanBodyPart } from "./VernanBodyPart";

/** Variant prefix on a body part filename (Java VernanBodyVariant). */
export type VernanBodyVariant = "default" | "hold" | "lemon" | "blink" | "air";

export const VERNAN_BODY_VARIANT_PREFIX: Record<Exclude<VernanBodyVariant, "default">, string> = {
  hold: "hold-",
  lemon: "l-",
  blink: "b-",
  air: "air-",
};

const VARIANT_ORDER: Exclude<VernanBodyVariant, "default">[] = ["hold", "lemon", "blink", "air"];

export function parseVernanPartSpec(partSpec: string): {
  part: VernanBodyPart;
  variant: VernanBodyVariant;
} | null {
  let rest = partSpec;
  let variant: VernanBodyVariant = "default";
  for (const v of VARIANT_ORDER) {
    const prefix = VERNAN_BODY_VARIANT_PREFIX[v];
    if (rest.startsWith(prefix)) {
      variant = v;
      rest = rest.slice(prefix.length);
      break;
    }
  }
  const part = vernanBodyPartFromToken(rest);
  return part ? { part, variant } : null;
}
