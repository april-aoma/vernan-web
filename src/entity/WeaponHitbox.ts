import type { Aabb } from "../combat/CombatMath";
import { placePolygonAabb } from "../combat/CombatMath";
import { HitboxPose } from "../collision/HitboxPose";
import type { SwordVisual } from "../combat/SwordVisual";
import { SWORD_BODY_H, SWORD_BODY_W } from "../config/CombatStats";
import {
  HEAVY_ATTACK1_FLINT_ACTIVE_LOCAL,
  HEAVY_ATTACK1_FLINT_ACTIVE_PIVOT_X,
  HEAVY_ATTACK1_GEM_ACTIVE_LOCAL,
  HEAVY_ATTACK1_GEM_ACTIVE_PIVOT_X,
  HEAVY_ATTACK1_STICK_ACTIVE_LOCAL,
  HEAVY_ATTACK1_STICK_ACTIVE_PIVOT_X,
  HEAVY_ATTACK1_SWORD_ACTIVE_LOCAL,
  HEAVY_ATTACK1_SWORD_ACTIVE_PIVOT_X,
  SHIELD_ATTACK_WINDUP_LOCAL,
  SHIELD_ATTACK_WINDUP_PIVOT_X,
  SHIELD_CROUCH_ATTACK_WINDUP_LOCAL,
  SHIELD_CROUCH_ATTACK_WINDUP_PIVOT_X,
  SHIELD_CROUCH_LOCAL,
  SHIELD_CROUCH_PIVOT_X,
  SHIELD_STAND_LOCAL,
  SHIELD_STAND_PIVOT_X,
  SLIDE_KICK_ACTIVE_LOCAL,
  SLIDE_KICK_ACTIVE_PIVOT_X,
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
  SWORD_STICK_CROUCH_ATTACK_ACTIVE_LOCAL,
} from "../config/HitboxValues";
import { VernanFeetAnchor } from "../vernan/VernanFeetAnchor";

/** shield player.png frame size (Java measures at load; 32×32 per strip cell). */
export const SHIELD_OVERLAY_FRAME_W = 32;
export const SHIELD_OVERLAY_FRAME_H = 32;
/** disc04 heavy attack1 canvas height (Java HEAVY_ATTACK1_FRAME_H). */
export const HEAVY_ATTACK1_FRAME_H = 48;
/** disc04 heavy attack1 canvas width (512px sheet / 8 frames). */
export const HEAVY_ATTACK1_FRAME_W = 64;
/** disc01 slide body strip height (Java SLIDE_BODY_SPRITE_H). */
export const SLIDE_BODY_SPRITE_H = 32;

export type MeleeWeaponHitboxArgs = {
  visual: SwordVisual;
  x: number;
  y: number;
  w: number;
  h: number;
  facing: number;
  groundCrouchAttack: boolean;
  stickFrameW: number;
};

type PolySelection = { local: number[]; pivot: number; centeredFrameW: number };

function feetWorldY(y: number, h: number): number {
  return y + h;
}

function asymmetricBodyTop(feetY: number): number {
  return feetY - SWORD_BODY_H;
}

/** Sword / flint / gem: bodyW + 16 extension strip; stick: centered full weapon canvas. */
function swordActiveSelection(args: MeleeWeaponHitboxArgs): PolySelection {
  switch (args.visual) {
    case "flint":
      return args.groundCrouchAttack
        ? {
            local: SWORD_FLINT_CROUCH_ATTACK_ACTIVE_LOCAL,
            pivot: SWORD_FLINT_CROUCH_ATTACK_ACTIVE_PIVOT_X,
            centeredFrameW: 0,
          }
        : {
            local: SWORD_FLINT_ATTACK_ACTIVE_LOCAL,
            pivot: SWORD_FLINT_ATTACK_ACTIVE_PIVOT_X,
            centeredFrameW: 0,
          };
    case "gem":
      return args.groundCrouchAttack
        ? {
            local: SWORD_GEM_CROUCH_ATTACK_ACTIVE_LOCAL,
            pivot: SWORD_GEM_CROUCH_ATTACK_ACTIVE_PIVOT_X,
            centeredFrameW: 0,
          }
        : {
            local: SWORD_GEM_ATTACK_ACTIVE_LOCAL,
            pivot: SWORD_GEM_ATTACK_ACTIVE_PIVOT_X,
            centeredFrameW: 0,
          };
    case "stick": {
      const frameW = args.stickFrameW > 0 ? args.stickFrameW : 64;
      return args.groundCrouchAttack
        ? {
            local: SWORD_STICK_CROUCH_ATTACK_ACTIVE_LOCAL,
            pivot: frameW * 0.5,
            centeredFrameW: frameW,
          }
        : {
            local: SWORD_STICK_ATTACK_ACTIVE_LOCAL,
            pivot: frameW * 0.5,
            centeredFrameW: frameW,
          };
    }
    default:
      return args.groundCrouchAttack
        ? {
            local: SWORD_CROUCH_ATTACK_ACTIVE_LOCAL,
            pivot: SWORD_CROUCH_ATTACK_ACTIVE_PIVOT_X,
            centeredFrameW: 0,
          }
        : {
            local: SWORD_ATTACK_ACTIVE_LOCAL,
            pivot: SWORD_ATTACK_ACTIVE_PIVOT_X,
            centeredFrameW: 0,
          };
  }
}

function heavyActiveSelection(visual: SwordVisual): PolySelection {
  switch (visual) {
    case "flint":
      return {
        local: HEAVY_ATTACK1_FLINT_ACTIVE_LOCAL,
        pivot: HEAVY_ATTACK1_FLINT_ACTIVE_PIVOT_X,
        centeredFrameW: 0,
      };
    case "gem":
      return {
        local: HEAVY_ATTACK1_GEM_ACTIVE_LOCAL,
        pivot: HEAVY_ATTACK1_GEM_ACTIVE_PIVOT_X,
        centeredFrameW: 0,
      };
    case "stick":
      // Same 64×48 attack1 canvas as sword/flint/gem — use authored pivot (not frameW/2).
      return {
        local: HEAVY_ATTACK1_STICK_ACTIVE_LOCAL,
        pivot: HEAVY_ATTACK1_STICK_ACTIVE_PIVOT_X,
        centeredFrameW: 0,
      };
    default:
      return {
        local: HEAVY_ATTACK1_SWORD_ACTIVE_LOCAL,
        pivot: HEAVY_ATTACK1_SWORD_ACTIVE_PIVOT_X,
        centeredFrameW: 0,
      };
  }
}

/** Frame origin X + anchor Y for a weapon polygon (Java attackWeaponFrameOriginX + body top). */
function weaponAnchor(
  args: Pick<MeleeWeaponHitboxArgs, "x" | "y" | "w" | "h">,
  sel: PolySelection,
): { frameOriginX: number; anchorY: number; pivot: number } {
  const feet = feetWorldY(args.y, args.h);
  if (sel.centeredFrameW > 0) {
    return {
      frameOriginX: args.x + args.w * 0.5 - sel.centeredFrameW * 0.5,
      anchorY: asymmetricBodyTop(feet),
      pivot: sel.pivot,
    };
  }
  const bodyLeft = args.x + args.w * 0.5 - SWORD_BODY_W * 0.5;
  return { frameOriginX: bodyLeft, anchorY: asymmetricBodyTop(feet), pivot: sel.pivot };
}

function placeWeaponPoly(
  local: number[],
  pivot: number,
  frameOriginX: number,
  anchorY: number,
  facing: number,
): Aabb {
  return placePolygonAabb(local, pivot, frameOriginX, anchorY, facing);
}

function weaponHitboxPose(
  local: number[],
  pivot: number,
  frameOriginX: number,
  anchorY: number,
  facing: number,
): HitboxPose {
  return new HitboxPose(local, frameOriginX, anchorY, facing, pivot);
}

/** Active sword HitboxPose for standard melee weapons (not lemon / headband / whip). */
export function swordMeleeHitboxPose(args: MeleeWeaponHitboxArgs): HitboxPose | null {
  if (args.visual === "lemon" || args.visual === "fists" || args.visual === "whip") return null;
  const sel = swordActiveSelection(args);
  const { frameOriginX, anchorY, pivot } = weaponAnchor(args, sel);
  return weaponHitboxPose(sel.local, pivot, frameOriginX, anchorY, args.facing);
}

/** Active sword AABB for standard melee weapons (not lemon / headband / whip). */
export function swordMeleeHitbox(args: MeleeWeaponHitboxArgs): Aabb | null {
  const pose = swordMeleeHitboxPose(args);
  return pose ? pose.bounds() : null;
}

/**
 * Shield arm windup during attackPhase == 1 (Java attackShieldWindupPose).
 * Pivot aligned to player center; overlay is body-sized.
 */
export function shieldAttackWindupHitbox(args: {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: number;
  groundCrouchAttack: boolean;
}): Aabb | null {
  const pose = shieldAttackWindupHitboxPose(args);
  return pose ? pose.bounds() : null;
}

export function shieldAttackWindupHitboxPose(args: {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: number;
  groundCrouchAttack: boolean;
}): HitboxPose | null {
  const pivot = args.groundCrouchAttack
    ? SHIELD_CROUCH_ATTACK_WINDUP_PIVOT_X
    : SHIELD_ATTACK_WINDUP_PIVOT_X;
  const local = args.groundCrouchAttack
    ? SHIELD_CROUCH_ATTACK_WINDUP_LOCAL
    : SHIELD_ATTACK_WINDUP_LOCAL;
  const feet = feetWorldY(args.y, args.h);
  const frameOriginX = args.x + args.w * 0.5 - pivot;
  const anchorY = asymmetricBodyTop(feet);
  return weaponHitboxPose(local, pivot, frameOriginX, anchorY, args.facing);
}

/**
 * Passive shield block hull when not attacking (Java shieldBlockHitboxPose).
 * frameIndex 0 = stand, 1 = crouch.
 */
export function shieldBlockHitbox(args: {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: number;
  frameIndex: 0 | 1;
  overlayW?: number;
  overlayH?: number;
}): Aabb | null {
  const pose = shieldBlockHitboxPose(args);
  return pose ? pose.bounds() : null;
}

export function shieldBlockHitboxPose(args: {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: number;
  frameIndex: 0 | 1;
  overlayW?: number;
  overlayH?: number;
}): HitboxPose | null {
  const fw = args.overlayW ?? SHIELD_OVERLAY_FRAME_W;
  const fh = args.overlayH ?? SHIELD_OVERLAY_FRAME_H;
  const local = args.frameIndex === 0 ? SHIELD_STAND_LOCAL : SHIELD_CROUCH_LOCAL;
  const pivot = args.frameIndex === 0 ? SHIELD_STAND_PIVOT_X : SHIELD_CROUCH_PIVOT_X;
  const feet = feetWorldY(args.y, args.h);
  const frameOriginX = args.x + args.w * 0.5 - fw * 0.5;
  const anchorY = feet - fh;
  return weaponHitboxPose(local, pivot, frameOriginX, anchorY, args.facing);
}

/**
 * disc04 heavy swing active-frame pose (Java heavyAttackHitboxPoseAt).
 * Mirror axis at player center ({@code centerX - pivot}), anchor Y via VernanFeetAnchor.
 * All attack1 weapon strips are 64×48 — stick uses the same path as sword/flint/gem.
 */
export function heavyAttackHitboxPose(args: MeleeWeaponHitboxArgs): HitboxPose | null {
  if (args.visual === "lemon" || args.visual === "fists" || args.visual === "whip") return null;
  const sel = heavyActiveSelection(args.visual);
  const feet = feetWorldY(args.y, args.h);
  const centerX = args.x + args.w * 0.5;
  const pivot = sel.pivot;
  // Java: frameOriginX = centerX - pivot (not flipped-canvas origin).
  const frameOriginX = centerX - pivot;
  const anchorY = VernanFeetAnchor.canvasWorldOriginY(feet, HEAVY_ATTACK1_FRAME_H, "attack1");
  return weaponHitboxPose(sel.local, pivot, frameOriginX, anchorY, args.facing);
}

/** disc04 heavy swing active frame AABB (bounds of {@link heavyAttackHitboxPose}). */
export function heavyAttackHitbox(args: MeleeWeaponHitboxArgs): Aabb | null {
  const pose = heavyAttackHitboxPose(args);
  return pose ? pose.bounds() : null;
}

/** disc01 slide kick leg strip (Java slideKickHitboxPose). */
export function slideKickHitbox(args: {
  x: number;
  y: number;
  w: number;
  h: number;
  slideFacing: number;
}): Aabb {
  const pivot = SLIDE_KICK_ACTIVE_PIVOT_X;
  const feet = feetWorldY(args.y, args.h);
  const frameOriginX = args.x + args.w * 0.5 - pivot;
  const anchorY = feet - SLIDE_BODY_SPRITE_H;
  return placeWeaponPoly(SLIDE_KICK_ACTIVE_LOCAL, pivot, frameOriginX, anchorY, args.slideFacing);
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

// Re-export for SwordHitbox.ts consumers during migration.
export type SwordHitboxArgs = MeleeWeaponHitboxArgs;
