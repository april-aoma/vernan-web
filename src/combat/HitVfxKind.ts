import type { PlayerItemInventory } from "../item/PlayerItemInventory";
import type { SwordVisual } from "./SwordVisual";

export enum HitVfxKind {
  NONE = "none",
  SLASH = "slash",
  FLINT = "flint",
  STICK = "stick",
  BLACK_HEART = "black_heart",
  ICE = "ice",
  MONEY = "money",
  SHIELD_BREAK = "shield_break",
  SHIELD = "shield",
  KURIBO = "kuribo",
  ELECTRIC = "electric",
  FIST = "fist",
  FALLBACK = "fallback",
}

export function hitVfxSpriteFile(kind: HitVfxKind): string {
  switch (kind) {
    case HitVfxKind.SLASH:
      return "hit slash.png";
    case HitVfxKind.FLINT:
      return "hit flint.png";
    case HitVfxKind.STICK:
      return "hit stick.png";
    case HitVfxKind.BLACK_HEART:
      return "hit black heart.png";
    case HitVfxKind.ICE:
      return "hit ice.png";
    case HitVfxKind.MONEY:
      return "hit money.png";
    case HitVfxKind.SHIELD_BREAK:
      return "hit shield break.png";
    case HitVfxKind.SHIELD:
      return "hit shield.png";
    case HitVfxKind.KURIBO:
      return "hit kuribo.png";
    case HitVfxKind.ELECTRIC:
      return "hit electric.png";
    case HitVfxKind.FIST:
      return "hit fist.png";
    case HitVfxKind.NONE:
    case HitVfxKind.FALLBACK:
      return "hit fallback.png";
  }
}

export function resolvePlayerMeleeHitVfx(
  visual: SwordVisual,
  inv: PlayerItemInventory,
  shieldBlock: boolean,
  shieldBreak: boolean,
): HitVfxKind {
  if (shieldBlock) return HitVfxKind.SHIELD;
  if (shieldBreak) return HitVfxKind.SHIELD_BREAK;
  if (visual === "flint") return HitVfxKind.FLINT;
  if (visual === "stick") return HitVfxKind.STICK;
  if (inv.stacksOf("ICE_BLOCK") > 0) return HitVfxKind.ICE;
  if (inv.stacksOf("GEM_SWORD") > 0) return HitVfxKind.MONEY;
  if (inv.stacksOf("FUZZY_HAT") > 0 && visual === "fists") return HitVfxKind.ELECTRIC;
  if (visual === "fists") return HitVfxKind.FIST;
  return HitVfxKind.SLASH;
}

export const HIT_VFX_PRELOAD_KINDS: readonly HitVfxKind[] = [
  HitVfxKind.SLASH,
  HitVfxKind.FLINT,
  HitVfxKind.STICK,
  HitVfxKind.ICE,
  HitVfxKind.MONEY,
  HitVfxKind.ELECTRIC,
  HitVfxKind.FIST,
  HitVfxKind.KURIBO,
  HitVfxKind.SHIELD,
  HitVfxKind.SHIELD_BREAK,
  HitVfxKind.BLACK_HEART,
  HitVfxKind.FALLBACK,
];
