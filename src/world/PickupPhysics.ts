import { HitboxPose } from "../collision/HitboxPose";
import { rotateWorldPolygon } from "../collision/polygonIntersect";
import {
  pickupPhysics,
  pickupPhysicsPivotX,
} from "../config/HitboxValues";
import type { PickupKind } from "./BreakableLootRoll";

/** Unrotated physics bounds center (Java Physics.pickupPhysicsRenderCenter). */
export function pickupPhysicsRenderCenter(
  kind: PickupKind,
  anchorX: number,
  anchorY: number,
): { x: number; y: number } {
  const b = new HitboxPose(
    pickupPhysics(kind),
    anchorX,
    anchorY,
    1,
    pickupPhysicsPivotX(kind),
  ).bounds();
  return { x: b.x + b.w * 0.5, y: b.y + b.h * 0.5 };
}

function pickupPhysicsBasePose(
  kind: PickupKind,
  anchorX: number,
  anchorY: number,
): HitboxPose {
  return new HitboxPose(
    pickupPhysics(kind),
    anchorX,
    anchorY,
    1,
    pickupPhysicsPivotX(kind),
  );
}

/** Rotated pickup physics polygon in world space (Java Physics.pickupRotatedPhysicsArea). */
export function pickupPhysicsWorldPolygon(
  kind: PickupKind,
  anchorX: number,
  anchorY: number,
  angleRad: number,
): number[] {
  const flat = pickupPhysicsBasePose(kind, anchorX, anchorY).worldVertices();
  if (Math.abs(angleRad) < 1e-8) return flat;
  const rc = pickupPhysicsRenderCenter(kind, anchorX, anchorY);
  return rotateWorldPolygon(flat, rc.x, rc.y, angleRad);
}

/** HitboxPose with world-space vertices (used for tile backstep collision). */
export function pickupPhysicsPoseAt(
  kind: PickupKind,
  anchorX: number,
  anchorY: number,
  angleRad: number,
): HitboxPose {
  if (Math.abs(angleRad) < 1e-8) {
    return pickupPhysicsBasePose(kind, anchorX, anchorY);
  }
  return HitboxPose.fromWorldPolygon(
    pickupPhysicsWorldPolygon(kind, anchorX, anchorY, angleRad),
  );
}
