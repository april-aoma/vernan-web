import { JavaRandom, toJavaLong } from "../util/JavaRandom";

export const VARIANT_NORMAL = "NORMAL";
export const VARIANT_SHINY = "SHINY";

const POSSESSED_SHINY_SPAWN_CHANCE = 0.33;
export const POSSESSED_SHINY_HP = 24;

/** Java `seed ^ 0x51E0E5055L`. */
const POSSESSED_SHINY_SEED_SALT = 0x51e0e5055n;

function normalize(variantId: string | null | undefined): string {
  if (!variantId) return VARIANT_NORMAL;
  return variantId.toUpperCase() === VARIANT_SHINY ? VARIANT_SHINY : VARIANT_NORMAL;
}

/** Seeded 33% shiny when the boss roll is Possessed. */
export function rollPossessedVariant(contentSeed: bigint): string {
  const rng = new JavaRandom(toJavaLong(contentSeed) ^ POSSESSED_SHINY_SEED_SALT);
  return rng.nextDouble() < POSSESSED_SHINY_SPAWN_CHANCE ? VARIANT_SHINY : VARIANT_NORMAL;
}

export function possessedHpForVariant(variantId: string | null | undefined, normalHp: number): number {
  return normalize(variantId) === VARIANT_SHINY ? POSSESSED_SHINY_HP : normalHp;
}

export function isPossessedShiny(variantId: string | null | undefined): boolean {
  return normalize(variantId) === VARIANT_SHINY;
}
