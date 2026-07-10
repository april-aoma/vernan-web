import type { ItemCatalog } from "../item/ItemCatalog";
import type { PlayerItemInventory } from "../item/PlayerItemInventory";
import type { PrimaryWeaponId, SwordVisual } from "./SwordVisual";
import { isPrimaryWeaponItem, PRIMARY_WEAPON_IDS } from "./SwordVisual";

const FLINT_TIMING_SCALE = 0.5;
const DEFAULT_DAMAGE_MULT = 1.0;
const DEFAULT_TIMING_SCALE = 1.0;

export type SwordProfile = {
  visual: SwordVisual;
  damageMult: number;
  timingScale: number;
};

function flintDamageMult(catalog: ItemCatalog): number {
  return catalog.def("FLINT").damageMultiplierPerStack;
}

function vanillaSwordProfile(): SwordProfile {
  return { visual: "default", damageMult: DEFAULT_DAMAGE_MULT, timingScale: DEFAULT_TIMING_SCALE };
}

function pureProfileForPrimary(
  inv: PlayerItemInventory,
  id: PrimaryWeaponId,
  catalog: ItemCatalog,
): SwordProfile | null {
  switch (id) {
    case "STICK":
      return inv.stacksOf("STICK") > 0
        ? { visual: "stick", damageMult: DEFAULT_DAMAGE_MULT, timingScale: DEFAULT_TIMING_SCALE }
        : null;
    case "LEMON":
      return inv.stacksOf("LEMON") > 0
        ? { visual: "lemon", damageMult: DEFAULT_DAMAGE_MULT, timingScale: DEFAULT_TIMING_SCALE }
        : null;
    case "HEADBAND":
      return inv.stacksOf("HEADBAND") > 0
        ? { visual: "fists", damageMult: DEFAULT_DAMAGE_MULT, timingScale: DEFAULT_TIMING_SCALE }
        : null;
    case "FLINT":
      return inv.stacksOf("FLINT") > 0
        ? {
            visual: "flint",
            damageMult: flintDamageMult(catalog),
            timingScale: FLINT_TIMING_SCALE,
          }
        : null;
    case "GEM_SWORD":
      return inv.stacksOf("GEM_SWORD") > 0
        ? { visual: "gem", damageMult: DEFAULT_DAMAGE_MULT, timingScale: DEFAULT_TIMING_SCALE }
        : null;
    case "WHIP":
      return inv.stacksOf("WHIP") > 0
        ? { visual: "whip", damageMult: DEFAULT_DAMAGE_MULT, timingScale: DEFAULT_TIMING_SCALE }
        : null;
    default:
      return null;
  }
}

function resolveFlintGemProfile(inv: PlayerItemInventory, catalog: ItemCatalog): SwordProfile | null {
  const flint = inv.stacksOf("FLINT") > 0;
  const gem = inv.stacksOf("GEM_SWORD") > 0;
  if (!flint && !gem) return null;
  if (flint && !gem) {
    return {
      visual: "flint",
      damageMult: flintDamageMult(catalog),
      timingScale: FLINT_TIMING_SCALE,
    };
  }
  if (gem && !flint) {
    return { visual: "gem", damageMult: DEFAULT_DAMAGE_MULT, timingScale: DEFAULT_TIMING_SCALE };
  }
  const preferred = inv.preferredPrimaryWeapon();
  const visual: SwordVisual =
    preferred === "GEM_SWORD" ? "gem" : preferred === "FLINT" ? "flint" : "gem";
  return {
    visual,
    damageMult: (DEFAULT_DAMAGE_MULT + flintDamageMult(catalog)) * 0.5,
    timingScale: (DEFAULT_TIMING_SCALE + FLINT_TIMING_SCALE) * 0.5,
  };
}

function profileForPrimaryItem(
  inv: PlayerItemInventory,
  id: PrimaryWeaponId,
  catalog: ItemCatalog,
): SwordProfile | null {
  switch (id) {
    case "STICK":
    case "LEMON":
    case "HEADBAND":
    case "WHIP":
      return pureProfileForPrimary(inv, id, catalog);
    case "FLINT":
    case "GEM_SWORD":
      return resolveFlintGemProfile(inv, catalog);
    default:
      return null;
  }
}

function profileForBackpackPrimary(
  inv: PlayerItemInventory,
  selected: string | null,
  catalog: ItemCatalog,
): SwordProfile {
  if (!selected) return vanillaSwordProfile();
  if (!isPrimaryWeaponItem(selected)) return vanillaSwordProfile();
  const pure = pureProfileForPrimary(inv, selected, catalog);
  return pure ?? vanillaSwordProfile();
}

/** Resolved melee mode from owned items (Java SwordProfile.resolve). */
export function resolveSwordProfile(inv: PlayerItemInventory, catalog: ItemCatalog): SwordProfile {
  if (inv.hasBackpack()) {
    return profileForBackpackPrimary(inv, inv.backpackSelectedPrimary(), catalog);
  }
  const preferred = inv.preferredPrimaryWeapon();
  if (preferred && isPrimaryWeaponItem(preferred)) {
    const fromPreferred = profileForPrimaryItem(inv, preferred, catalog);
    if (fromPreferred) return fromPreferred;
  }
  for (const id of PRIMARY_WEAPON_IDS) {
    if (id === preferred) continue;
    const fallback = profileForPrimaryItem(inv, id, catalog);
    if (fallback) return fallback;
  }
  return vanillaSwordProfile();
}
