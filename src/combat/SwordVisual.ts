/** Which sword overlay / active-frame hitbox set the player uses (Java SwordVisual). */
export type SwordVisual = "default" | "flint" | "gem" | "stick" | "lemon" | "fists" | "whip";

export const PRIMARY_WEAPON_IDS = [
  "STICK",
  "LEMON",
  "HEADBAND",
  "FLINT",
  "GEM_SWORD",
  "WHIP",
] as const;

export type PrimaryWeaponId = (typeof PRIMARY_WEAPON_IDS)[number];

export function isPrimaryWeaponItem(id: string): id is PrimaryWeaponId {
  return (PRIMARY_WEAPON_IDS as readonly string[]).includes(id);
}

/** Item catalog id for HUD weapon-slot icon (Java resolveHudWeaponIcon). */
export function primaryItemIdForVisual(visual: SwordVisual): PrimaryWeaponId | null {
  switch (visual) {
    case "stick":
      return "STICK";
    case "flint":
      return "FLINT";
    case "gem":
      return "GEM_SWORD";
    case "lemon":
      return "LEMON";
    case "fists":
      return "HEADBAND";
    case "whip":
      return "WHIP";
    default:
      return null;
  }
}
