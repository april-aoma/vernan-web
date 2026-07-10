import type { Aabb } from "../combat/CombatMath";
import { placePolygonAabb } from "../combat/CombatMath";
import type { SwordVisual } from "../combat/SwordVisual";
import { SWORD_BODY_H, SWORD_BODY_W } from "../config/CombatStats";
import {
  SWORD_ATTACK_ACTIVE_LOCAL,
  SWORD_ATTACK_ACTIVE_PIVOT_X,
  SWORD_CROUCH_ATTACK_ACTIVE_LOCAL,
  SWORD_CROUCH_ATTACK_ACTIVE_PIVOT_X,
  SWORD_FLINT_ATTACK_ACTIVE_LOCAL,
  SWORD_FLINT_ATTACK_ACTIVE_PIVOT_X,
  SWORD_FLINT_CROUCH_ATTACK_ACTIVE_LOCAL,
  SWORD_FLINT_CROUCH_ATTACK_ACTIVE_PIVOT_X,
  SWORD_GEM_ATTACK_ACTIVE_LOCAL,
  SWORD_GEM_ATTACK_ACTIVE_PIVOT_X,
  SWORD_GEM_CROUCH_ATTACK_ACTIVE_LOCAL,
  SWORD_GEM_CROUCH_ATTACK_ACTIVE_PIVOT_X,
  SWORD_STICK_ATTACK_ACTIVE_LOCAL,
  SWORD_STICK_ATTACK_ACTIVE_PIVOT_X,
  SWORD_STICK_CROUCH_ATTACK_ACTIVE_LOCAL,
  SWORD_STICK_CROUCH_ATTACK_ACTIVE_PIVOT_X,
} from "../config/HitboxValues";

export type SwordHitboxArgs = {
  visual: SwordVisual;
  x: number;
  y: number;
  w: number;
  h: number;
  facing: number;
  groundCrouchAttack: boolean;
  stickFrameW: number;
};

function bodyAnchor(x: number, y: number, w: number, h: number): { left: number; top: number } {
  return {
    left: x + w * 0.5 - SWORD_BODY_W * 0.5,
    top: y + h - SWORD_BODY_H,
  };
}

function mirrorPivot(pivot: number, frameW: number, visual: SwordVisual): number {
  if (visual === "stick" && frameW > 0) return frameW * 0.5;
  return pivot;
}

/** Active sword AABB for standard melee weapons (not lemon / headband). */
export function swordMeleeHitbox(args: SwordHitboxArgs): Aabb | null {
  if (args.visual === "lemon" || args.visual === "fists" || args.visual === "whip") return null;
  const { left, top } = bodyAnchor(args.x, args.y, args.w, args.h);
  let local: number[];
  let pivot: number;
  let frameW = 48;
  switch (args.visual) {
    case "flint":
      local = args.groundCrouchAttack
        ? SWORD_FLINT_CROUCH_ATTACK_ACTIVE_LOCAL
        : SWORD_FLINT_ATTACK_ACTIVE_LOCAL;
      pivot = args.groundCrouchAttack
        ? SWORD_FLINT_CROUCH_ATTACK_ACTIVE_PIVOT_X
        : SWORD_FLINT_ATTACK_ACTIVE_PIVOT_X;
      break;
    case "gem":
      local = args.groundCrouchAttack
        ? SWORD_GEM_CROUCH_ATTACK_ACTIVE_LOCAL
        : SWORD_GEM_ATTACK_ACTIVE_LOCAL;
      pivot = args.groundCrouchAttack
        ? SWORD_GEM_CROUCH_ATTACK_ACTIVE_PIVOT_X
        : SWORD_GEM_ATTACK_ACTIVE_PIVOT_X;
      break;
    case "stick":
      frameW = args.stickFrameW > 0 ? args.stickFrameW : 64;
      local = args.groundCrouchAttack
        ? SWORD_STICK_CROUCH_ATTACK_ACTIVE_LOCAL
        : SWORD_STICK_ATTACK_ACTIVE_LOCAL;
      pivot = args.groundCrouchAttack
        ? SWORD_STICK_CROUCH_ATTACK_ACTIVE_PIVOT_X
        : SWORD_STICK_ATTACK_ACTIVE_PIVOT_X;
      break;
    default:
      local = args.groundCrouchAttack
        ? SWORD_CROUCH_ATTACK_ACTIVE_LOCAL
        : SWORD_ATTACK_ACTIVE_LOCAL;
      pivot = args.groundCrouchAttack
        ? SWORD_CROUCH_ATTACK_ACTIVE_PIVOT_X
        : SWORD_ATTACK_ACTIVE_PIVOT_X;
      break;
  }
  pivot = mirrorPivot(pivot, frameW, args.visual);
  return placePolygonAabb(local, pivot, left, top, args.facing);
}

export function swordKnockbackKind(
  visual: SwordVisual,
  groundCrouchAttack: boolean,
): import("../combat/CombatMath").KnockbackKind {
  switch (visual) {
    case "flint":
      return "flint_sword";
    case "gem":
      return "sword_gem";
    case "stick":
      return groundCrouchAttack ? "sword_stick_crouch" : "sword_stick";
    case "fists":
      return "sword_fists";
    default:
      return groundCrouchAttack ? "sword_crouch" : "sword_stand";
  }
}
