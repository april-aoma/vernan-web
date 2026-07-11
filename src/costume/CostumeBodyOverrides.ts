import type { VernanBodyPart } from "../vernan/VernanBodyPart";
import type { CostumeProfile } from "./CostumeProfile";
import { costumeLayerRoutingForItem } from "./CostumeLayerRouting";

export type CostumeBodyOverrides = {
  suppress: Set<VernanBodyPart>;
  enable: Set<VernanBodyPart>;
};

export function costumeBodyOverridesEmpty(): CostumeBodyOverrides {
  return { suppress: new Set(), enable: new Set() };
}

export function costumeBodyOverridesFromProfile(
  profile: CostumeProfile,
): CostumeBodyOverrides {
  if (profile.isEmpty()) return costumeBodyOverridesEmpty();
  const suppress = new Set<VernanBodyPart>();
  const enable = new Set<VernanBodyPart>();
  for (const itemId of profile.activeItemIds()) {
    const routing = costumeLayerRoutingForItem(itemId);
    for (const p of routing.suppressBody) suppress.add(p as VernanBodyPart);
    for (const p of routing.enableBody) enable.add(p as VernanBodyPart);
  }
  return { suppress, enable };
}
