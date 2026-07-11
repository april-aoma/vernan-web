import type { Player } from "../entity/Player";
import { WALK_SPEED_THRESHOLD, HURT_AIR_SHEET_FRAMES } from "../config/AnimStats";
import type { CostumeState } from "./CostumeState";
import type { VernanBodyDrawContext } from "../vernan/VernanBodyDrawContext";
import { vernanBodyAnimForCostumeState } from "../vernan/VernanBodyAnim";
import type { VernanBodyLibrary } from "../vernan/VernanBodyLibrary";
import { DoorTransitionPose } from "../world/roomFade";

export type PlayerCostumePose = {
  costumeState: CostumeState;
  frameIndex: number;
  animKey: string;
  bodyCtx: VernanBodyDrawContext;
  facing: number;
  feetAnchorBodyH: number;
  yOff: number;
};

export type ResolvePlayerCostumePoseOpts = {
  player: Player;
  bodyLibrary: VernanBodyLibrary;
  bodyCtx: VernanBodyDrawContext;
  renderFacing: number;
  turnAnimFramesLeft: number;
  doorPose: DoorTransitionPose;
  itemPickupPose: boolean;
};

const VERNAN_BODY_SPRITE_H = 32;

export function layeredBodyAnimReady(library: VernanBodyLibrary, animKey: string): boolean {
  return library.hasAnim(animKey) && library.hasVariant(animKey, "base", "default");
}

export function resolvePlayerCostumePose(
  opts: ResolvePlayerCostumePoseOpts,
): PlayerCostumePose | null {
  const {
    player,
    bodyLibrary,
    bodyCtx,
    renderFacing,
    turnAnimFramesLeft,
    doorPose,
    itemPickupPose,
  } = opts;

  if (itemPickupPose) return null;

  if (doorPose === DoorTransitionPose.ENTER && layeredBodyAnimReady(bodyLibrary, "doorenter")) {
    return pose("DOOR_ENTER", 0, "doorenter", bodyCtx, player.facing, 0, 0);
  }
  if (doorPose === DoorTransitionPose.EXIT && layeredBodyAnimReady(bodyLibrary, "doorexit")) {
    return pose("DOOR_EXIT", 0, "doorexit", bodyCtx, player.facing, 0, 0);
  }

  const hurtAirPose = player.isHurtLocked() && !player.onGround;

  if (player.isGetupLocked() && !hurtAirPose && layeredBodyAnimReady(bodyLibrary, "getup")) {
    const frameCount = bodyLibrary.frameCount("getup");
    const frame = player.getupAnimFrameIndex(frameCount);
    return pose("GETUP", frame, "getup", bodyCtx, player.facing, VERNAN_BODY_SPRITE_H, 0);
  }

  if (player.isGrabHeld()) {
    const grabAnim = layeredBodyAnimReady(bodyLibrary, "grabbed")
      ? "grabbed"
      : layeredBodyAnimReady(bodyLibrary, "hurt")
        ? "hurt"
        : null;
    if (grabAnim) {
      const state: CostumeState = grabAnim === "grabbed" ? "GRABBED" : "HURT_AIR";
      const frame = grabAnim === "grabbed" ? player.grabAnimFrameIndex() : 0;
      return pose(state, frame, grabAnim, bodyCtx, player.facing, 0, 0);
    }
  }

  if (!hurtAirPose && (player.isCarryPlucking() || player.isCarryThrowing())) {
    const plucking = player.isCarryPlucking();
    const useAirThrow = player.isCarryThrowing() && !player.carryThrowStartedOnGround();
    const animKey = plucking ? "pluck" : "throw";
    const state: CostumeState = plucking ? "PLUCK" : useAirThrow ? "AIR_THROW" : "THROW";
    const idx = plucking ? player.carryPluckFrameIndex() : player.carryThrowFrameIndex();
    if (layeredBodyAnimReady(bodyLibrary, animKey)) {
      return pose(state, idx, animKey, bodyCtx, player.facing, 0, 0);
    }
  }

  if (player.headband.isActive() && !player.isHurtLocked()) {
    const hb = player.headband;
    const idx = hb.frameIndex();
    if (hb.isSideAttack() && layeredBodyAnimReady(bodyLibrary, "sideattack0")) {
      return pose(
        "HEADBAND_SIDE_ATTACK",
        idx,
        "sideattack0",
        bodyCtx,
        player.facing >= 0 ? 1 : -1,
        0,
        0,
      );
    }
    const crouchKick = hb.isCrouchKick();
    const animKey = crouchKick ? "crouchattack1" : "upattack0";
    const state: CostumeState = crouchKick
      ? "HEADBAND_CROUCH_ATTACK"
      : "HEADBAND_UP_ATTACK";
    if (layeredBodyAnimReady(bodyLibrary, animKey)) {
      return pose(state, idx, animKey, bodyCtx, player.facing >= 0 ? 1 : -1, 0, 0);
    }
  }

  if (player.isSubweaponAnimating()) {
    const idx = player.subweaponAnimFrameIndex();
    if (player.subweaponUsesAttack0Strip() && layeredBodyAnimReady(bodyLibrary, "attack0")) {
      const useAir = player.subweaponUsesAirSpecialStrip();
      return pose(
        useAir ? "AIR_ATTACK" : "ATTACK",
        idx,
        "attack0",
        bodyCtx,
        player.facing,
        0,
        0,
      );
    }
    if (layeredBodyAnimReady(bodyLibrary, "specialattack0")) {
      const useAir = player.subweaponUsesAirSpecialStrip();
      return pose(
        useAir ? "AIR_SPECIAL_ATTACK" : "SPECIAL_ATTACK",
        idx,
        "specialattack0",
        bodyCtx,
        player.facing,
        0,
        0,
      );
    }
  }

  if (player.isAttacking()) {
    const crouchSwing = player.isGroundCrouchAttack();
    const animKey = crouchSwing ? "crouchattack0" : "attack0";
    const state: CostumeState = crouchSwing
      ? "CROUCH_ATTACK"
      : player.attackUsesAirStrip()
        ? "AIR_ATTACK"
        : "ATTACK";
    if (layeredBodyAnimReady(bodyLibrary, animKey)) {
      return pose(
        state,
        player.attackAnimFrameIndex(),
        animKey,
        bodyCtx,
        player.facing,
        0,
        0,
      );
    }
  }

  let costumeState: CostumeState;
  let costumeFrameIndex: number;
  let useCrouchArt = false;

  if (hurtAirPose && layeredBodyAnimReady(bodyLibrary, "hurt")) {
    costumeState = "HURT_AIR";
    costumeFrameIndex = Math.max(
      0,
      Math.min(HURT_AIR_SHEET_FRAMES - 1, player.hurtAirFrameIndex()),
    );
  } else if (player.climbing && layeredBodyAnimReady(bodyLibrary, "climb")) {
    costumeState = "CLIMB";
    costumeFrameIndex = player.climbFrame();
    } else {
      useCrouchArt =
        player.crouching ||
        player.isCrouchJumpMode() ||
        player.isJumpSquatting() ||
        player.isLandingLocked();
      if (
        player.isHeelysSkatePose() &&
        layeredBodyAnimReady(bodyLibrary, "skate")
      ) {
        costumeState = "SKATE";
        costumeFrameIndex = player.walkFrame();
      } else if (useCrouchArt && layeredBodyAnimReady(bodyLibrary, "crouch")) {
      costumeState = "CROUCH";
      costumeFrameIndex = 0;
    } else if (
      !player.onGround &&
      !player.isWalkOffLedgeActive() &&
      player.usesJumpCollisionHull() &&
      layeredBodyAnimReady(bodyLibrary, "jump")
    ) {
      costumeState = "JUMP";
      costumeFrameIndex = player.jumpFrame();
    } else {
      const speed = Math.abs(player.vx);
      const moving = speed > WALK_SPEED_THRESHOLD || player.isWalkOffLedgeActive();
      const displayWalkFrame = player.walkFrame();
      const playerFacingSign = player.facing >= 0 ? 1 : -1;
      const turning =
        !player.isWalkOffLedgeActive() &&
        layeredBodyAnimReady(bodyLibrary, "turn") &&
        ((turnAnimFramesLeft > 0 && player.onGround) ||
          (player.onGround && !moving && speed > 1 && player.vx * playerFacingSign < 0));
      if (turning) {
        costumeState = "TURN";
        costumeFrameIndex = 0;
      } else if (moving && layeredBodyAnimReady(bodyLibrary, "walk")) {
        costumeState = "WALK";
        costumeFrameIndex = displayWalkFrame;
      } else if (layeredBodyAnimReady(bodyLibrary, "idle")) {
        costumeState = "IDLE";
        costumeFrameIndex = 0;
      } else {
        return null;
      }
    }
  }

  const anim = vernanBodyAnimForCostumeState(costumeState);
  if (!anim || !layeredBodyAnimReady(bodyLibrary, anim.folderPrefix)) return null;

  const facing =
    turnAnimFramesLeft > 0 && player.onGround && costumeState !== "CLIMB"
      ? renderFacing
      : player.facing >= 0
        ? 1
        : -1;
  const yOff = useCrouchArt ? 0 : player.renderSpriteTopWorldY() - player.y;

  return pose(
    costumeState,
    costumeFrameIndex,
    anim.folderPrefix,
    bodyCtx,
    facing,
    0,
    yOff,
  );
}

function pose(
  costumeState: CostumeState,
  frameIndex: number,
  animKey: string,
  bodyCtx: VernanBodyDrawContext,
  facing: number,
  feetAnchorBodyH: number,
  yOff: number,
): PlayerCostumePose {
  return { costumeState, frameIndex, animKey, bodyCtx, facing, feetAnchorBodyH, yOff };
}

export function idleBlinkFrameActive(state: CostumeState, walkFrame: number): boolean {
  return state === "IDLE" && (walkFrame === 2 || walkFrame === 3);
}
