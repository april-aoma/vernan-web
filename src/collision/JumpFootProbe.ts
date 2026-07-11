import { TILE_SIZE } from "../specs";
import {
  PLAYER_JUMP_LEAD_FOOT_LOCAL_X,
  PLAYER_JUMP_LEAD_FOOT_LOCAL_Y,
  PLAYER_JUMP_LOCAL,
  PLAYER_JUMP_TRAIL_FOOT_LOCAL_X,
  PLAYER_JUMP_TRAIL_FOOT_LOCAL_Y,
} from "../config/HitboxValues";
import { HitboxPose } from "./HitboxPose";
import { DECK_SLACK_PX, footNearDeck } from "./StandSurfaceQuery";

/** Lead/trail touchdown probes for PLAYER_JUMP; stand poses duplicate bbox feet. */
export type JumpFootProbe = {
  leadY: number;
  trailY: number;
};

export type LandingSnapState = {
  bestFloorY: number;
  snapLead: boolean;
  snapTrail: boolean;
};

export function createLandingSnapState(): LandingSnapState {
  return { bestFloorY: Number.POSITIVE_INFINITY, snapLead: false, snapTrail: false };
}

/** Match Java {@code pose.parts() == HitboxValues.PLAYER_JUMP} (content, not only reference). */
export function isJumpHullPose(pose: HitboxPose): boolean {
  if (pose.local === PLAYER_JUMP_LOCAL) return true;
  const local = pose.local;
  if (local.length !== PLAYER_JUMP_LOCAL.length) return false;
  for (let i = 0; i < local.length; i++) {
    if (local[i] !== PLAYER_JUMP_LOCAL[i]) return false;
  }
  return true;
}

export function jumpFootLocalWorldX(pose: HitboxPose, localX: number): number {
  let lx = localX;
  if (pose.facingSign < 0) {
    lx = 2 * pose.pivotLocalX - lx;
  }
  // Jump hull uses scaleLocalX = 1 (Java HitboxPose default).
  return pose.anchorX + lx;
}

export function jumpFootLocalWorldY(pose: HitboxPose, _localX: number, localY: number): number {
  return pose.anchorY + localY * pose.scaleLocalY;
}

export function jumpLeadFootWorldY(pose: HitboxPose): number {
  return jumpFootLocalWorldY(
    pose,
    PLAYER_JUMP_LEAD_FOOT_LOCAL_X,
    PLAYER_JUMP_LEAD_FOOT_LOCAL_Y,
  );
}

export function jumpTrailFootWorldY(pose: HitboxPose): number {
  return jumpFootLocalWorldY(
    pose,
    PLAYER_JUMP_TRAIL_FOOT_LOCAL_X,
    PLAYER_JUMP_TRAIL_FOOT_LOCAL_Y,
  );
}

export function jumpFootProbeFrom(pose: HitboxPose): JumpFootProbe {
  if (isJumpHullPose(pose)) {
    return { leadY: jumpLeadFootWorldY(pose), trailY: jumpTrailFootWorldY(pose) };
  }
  const bottom = pose.bounds().y + pose.bounds().h;
  return { leadY: bottom, trailY: bottom };
}

export function footProbeSupportY(probe: JumpFootProbe): number {
  return Math.max(probe.leadY, probe.trailY);
}

export function footProbeHighestY(probe: JumpFootProbe): number {
  return Math.min(probe.leadY, probe.trailY);
}

export function footProbeTySpanLoWith(a: JumpFootProbe, b: JumpFootProbe): number {
  const leadTy = Math.floor((a.leadY - 1e-4) / TILE_SIZE);
  const trailTy = Math.floor((a.trailY - 1e-4) / TILE_SIZE);
  const otherLeadTy = Math.floor((b.leadY - 1e-4) / TILE_SIZE);
  const otherTrailTy = Math.floor((b.trailY - 1e-4) / TILE_SIZE);
  return Math.min(Math.min(leadTy, trailTy), Math.min(otherLeadTy, otherTrailTy));
}

export function footProbeTySpanHiWith(a: JumpFootProbe, b: JumpFootProbe): number {
  const leadTy = Math.floor((a.leadY - 1e-4) / TILE_SIZE);
  const trailTy = Math.floor((a.trailY - 1e-4) / TILE_SIZE);
  const otherLeadTy = Math.floor((b.leadY - 1e-4) / TILE_SIZE);
  const otherTrailTy = Math.floor((b.trailY - 1e-4) / TILE_SIZE);
  return Math.max(Math.max(leadTy, trailTy), Math.max(otherLeadTy, otherTrailTy));
}

export function footProbeAllPrevBelowFloor(probe: JumpFootProbe, floorY: number): boolean {
  return footProbeHighestY(probe) > floorY + 1e-3;
}

export function footProbeAllNextAboveFloor(probe: JumpFootProbe, floorY: number): boolean {
  return footProbeSupportY(probe) < floorY - 1e-3;
}

export function feetSpanOverlapsTileColumn(
  feetLeft: number,
  feetRight: number,
  tx: number,
): boolean {
  const tileLeft = tx * TILE_SIZE;
  const tileRight = tileLeft + TILE_SIZE;
  return feetRight > tileLeft + 1e-6 && feetLeft < tileRight - 1e-6;
}

export function footXOverTile(footX: number, tx: number): boolean {
  const tileLeft = tx * TILE_SIZE;
  const tileRight = tileLeft + TILE_SIZE;
  return footX >= tileLeft - 1e-6 && footX <= tileRight + 1e-6;
}

export function footDescendsOntoFloor(
  prevFootY: number,
  nextFootY: number,
  ty: number,
  floorY: number,
  crossSlack: number,
): boolean {
  const prevFootTile = Math.floor((prevFootY - 1e-4) / TILE_SIZE);
  const crossedFromAbove = prevFootY <= floorY + crossSlack + 1e-3 || prevFootTile < ty;
  return crossedFromAbove && nextFootY >= floorY - 1e-3;
}

export function footLandsOrRestsOnDeck(
  prevFootY: number,
  nextFootY: number,
  ty: number,
  floorY: number,
  crossSlack: number,
): boolean {
  const restingOnDeck =
    nextFootY >= floorY - 1e-3 &&
    nextFootY <= floorY + DECK_SLACK_PX &&
    prevFootY >= floorY - 1e-3;
  return footDescendsOntoFloor(prevFootY, nextFootY, ty, floorY, crossSlack) || restingOnDeck;
}

export function eitherJumpFootNearDeck(pose: HitboxPose, deckTop: number): boolean {
  if (!isJumpHullPose(pose)) {
    return footNearDeck(pose.bounds().y + pose.bounds().h, deckTop);
  }
  return (
    footNearDeck(jumpLeadFootWorldY(pose), deckTop) ||
    footNearDeck(jumpTrailFootWorldY(pose), deckTop)
  );
}

export function jumpHullEitherFootOnPlatformTile(
  pose: HitboxPose,
  tx: number,
  deckTop: number,
): boolean {
  if (!isJumpHullPose(pose)) return false;
  const leadY = jumpLeadFootWorldY(pose);
  const trailY = jumpTrailFootWorldY(pose);
  const leadX = jumpFootLocalWorldX(pose, PLAYER_JUMP_LEAD_FOOT_LOCAL_X);
  const trailX = jumpFootLocalWorldX(pose, PLAYER_JUMP_TRAIL_FOOT_LOCAL_X);
  return (
    (footNearDeck(leadY, deckTop) && footXOverTile(leadX, tx)) ||
    (footNearDeck(trailY, deckTop) && footXOverTile(trailX, tx))
  );
}

export function leadFootLandedOnExtra(
  prevFeet: JumpFootProbe,
  nextFeet: JumpFootProbe,
  floorY: number,
  deckSlack: number,
): boolean {
  const landed = prevFeet.leadY <= floorY + 1e-3 && nextFeet.leadY >= floorY - 1e-3;
  const resting =
    nextFeet.leadY >= floorY - 1e-3 &&
    nextFeet.leadY <= floorY + deckSlack &&
    prevFeet.leadY >= floorY - 1e-3;
  return landed || resting;
}

export function trailFootLandedOnExtra(
  prevFeet: JumpFootProbe,
  nextFeet: JumpFootProbe,
  floorY: number,
  deckSlack: number,
): boolean {
  const landed = prevFeet.trailY <= floorY + 1e-3 && nextFeet.trailY >= floorY - 1e-3;
  const resting =
    nextFeet.trailY >= floorY - 1e-3 &&
    nextFeet.trailY <= floorY + deckSlack &&
    prevFeet.trailY >= floorY - 1e-3;
  return landed || resting;
}

export function footOnDeckY(footY: number, deckTop: number): boolean {
  return footNearDeck(footY, deckTop);
}

/** Either jump foot resting on a solid tile's floor lip (not mere hull overlap). */
export function jumpFeetOnSolidFloor(
  footProbe: JumpFootProbe,
  floorY: number,
): boolean {
  return footOnDeckY(footProbe.leadY, floorY) || footOnDeckY(footProbe.trailY, floorY);
}

export function noteLandingFloor(
  floorY: number,
  leadHit: boolean,
  trailHit: boolean,
  snap: LandingSnapState,
): void {
  if (!leadHit && !trailHit) return;
  if (floorY < snap.bestFloorY) {
    snap.bestFloorY = floorY;
    snap.snapLead = leadHit;
    snap.snapTrail = trailHit;
  } else if (Math.abs(floorY - snap.bestFloorY) <= 1e-3) {
    snap.snapLead = snap.snapLead || leadHit;
    snap.snapTrail = snap.snapTrail || trailHit;
  }
}
