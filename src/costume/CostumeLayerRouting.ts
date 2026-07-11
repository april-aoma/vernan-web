import type { CostumeSlot } from "./CostumeSlot";
import type { CostumePartRoute } from "./CostumePartRoute";
import type { CostumeDrawConfig } from "./CostumeDrawConfig";
import { COSTUME_ALL, stripVariantPrefix } from "./CostumeNaming";

export type CostumeLayerRouting = {
  parts: CostumePartRoute[];
  suppressBody: readonly string[];
  enableBody: readonly string[];
  legacyMonolithic: boolean;
  legacySlot: CostumeSlot;
};

function legacy(slot: CostumeSlot): CostumeLayerRouting {
  return {
    parts: [],
    suppressBody: [],
    enableBody: [],
    legacyMonolithic: true,
    legacySlot: slot,
  };
}

const DEFAULT_LEGACY = legacy("AFTER_HAIR");

/** Hardcoded per-item routing (Java CostumeLayerRouting.forLayer). */
export function costumeLayerRoutingForItem(itemId: string): CostumeLayerRouting {
  switch (itemId) {
    case "FUZZY_HAT":
      return {
        parts: [],
        suppressBody: ["hair"],
        enableBody: ["hat-hair"],
        legacyMonolithic: true,
        legacySlot: "AFTER_HAIR",
      };
    case "CAT_EARS":
      return {
        parts: [
          { fileToken: "under", slot: "AFTER_ARM" },
          { fileToken: "over", slot: "AFTER_HAIR" },
        ],
        suppressBody: [],
        enableBody: [],
        legacyMonolithic: false,
        legacySlot: "AFTER_HAIR",
      };
    case "CAT_TAIL":
      return legacy("BEHIND_BODY");
    case "ACRYLICS":
      return {
        parts: [{ fileToken: "arm", slot: "AFTER_ARM", lemonVariant: true }],
        suppressBody: [],
        enableBody: [],
        legacyMonolithic: false,
        legacySlot: "AFTER_HAIR",
      };
    case "HOODIE":
    case "PONCHO":
      return {
        parts: [
          { fileToken: "base", slot: "AFTER_HAIR" },
          { fileToken: "arm", slot: "AFTER_HAIR", lemonVariant: true },
        ],
        suppressBody: [],
        enableBody: [],
        legacyMonolithic: false,
        legacySlot: "AFTER_HAIR",
      };
    case "PANTIES":
    case "SHORTS":
      return legacy("AFTER_BASE");
    case "KURIBO_SHOE":
    case "HEELIES":
      return legacy("AFTER_LEGS");
    case "CHOKER":
    case "PINK_SCARF":
      return legacy("AFTER_BASE");
    case "HEADBAND":
    case "CRAWLER_HAT":
      return legacy("AFTER_HAIR");
    case "OOPART_BRACELET":
      return legacy("AFTER_ARM");
    default:
      return DEFAULT_LEGACY;
  }
}

function hasMultipartTokens(tokens: Set<string>): boolean {
  return tokens.has("base") || tokens.has("arm") || tokens.has("under") || tokens.has("over");
}

/** Discover multipart routing from on-disk part tokens (Java disk discovery). */
export function costumeLayerRoutingForFolder(
  itemId: string,
  folderName: string,
  partTokens: Set<string>,
  drawConfig: CostumeDrawConfig,
): CostumeLayerRouting {
  const coded = costumeLayerRoutingForItem(itemId);
  if (!coded.legacyMonolithic || coded.parts.length > 0) return coded;
  if (!hasMultipartTokens(partTokens)) return coded;

  const routes: CostumePartRoute[] = [];
  const defaultSlot = drawConfig.defaultSlotForFolder(folderName, coded.legacySlot);
  if (partTokens.has("under")) routes.push({ fileToken: "under", slot: "AFTER_ARM" });
  if (partTokens.has("base")) routes.push({ fileToken: "base", slot: defaultSlot });
  if (partTokens.has("arm")) {
    const armSlot = partTokens.has("base") ? "AFTER_ARM" : defaultSlot;
    routes.push({ fileToken: "arm", slot: armSlot, lemonVariant: true });
  }
  if (partTokens.has("over")) routes.push({ fileToken: "over", slot: "AFTER_HAIR" });
  if (routes.length === 0) return coded;

  return {
    parts: routes,
    suppressBody: [],
    enableBody: [],
    legacyMonolithic: false,
    legacySlot: coded.legacySlot,
  };
}

export function discoverPartTokensFromPaths(paths: string[], folderName: string): Set<string> {
  const prefix = `sprites/costume/${folderName}/`;
  const tokens = new Set<string>();
  for (const path of paths) {
    if (!path.startsWith(prefix) || !path.endsWith(".png")) continue;
    const fileName = path.slice(prefix.length);
    const stem = fileName.slice(0, -4);
    const lastSpace = stem.lastIndexOf(" ");
    if (lastSpace <= 0) continue;
    const base = stripVariantPrefix(stem.slice(lastSpace + 1));
    if (base) tokens.add(base);
  }
  if (hasMultipartTokens(tokens)) tokens.delete(COSTUME_ALL);
  return tokens;
}
