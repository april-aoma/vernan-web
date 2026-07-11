import type { Player } from "../entity/Player";
import type { WorldCamera } from "../camera/WorldCamera";
import type { JuiceDrawOpts } from "../render/JuiceDraw";
import { drawStripFrameFeetPinned, type SpriteStrip } from "../render/SpriteDraw";
import type { CostumeLayersFile } from "../ranking/costumeResolve";
import { CostumeProfile } from "./CostumeProfile";
import type { CostumeArtCache } from "./CostumeArtCache";
import type { CostumeDrawConfig } from "./CostumeDrawConfig";
import { costumeBodyOverridesFromProfile } from "./CostumeBodyOverrides";
import { buildVernanBodyDrawContext } from "../vernan/VernanBodyCompositor";
import type { VernanBodyLibrary } from "../vernan/VernanBodyLibrary";
import { drawLayeredVernanWithCostumes } from "./drawLayeredPlayer";
import {
  idleBlinkFrameActive,
  resolvePlayerCostumePose,
} from "./resolvePlayerCostumePose";
import type { DoorTransitionPose } from "../world/roomFade";

export type CostumeRenderBundle = {
  bodyLibrary: VernanBodyLibrary;
  artCache: CostumeArtCache;
  drawConfig: CostumeDrawConfig;
  layersFile: CostumeLayersFile;
};

export type AttackOverlayDraw = {
  sword: SpriteStrip | null;
  shield: SpriteStrip | null;
  stickCentered: boolean;
  frameIndex: number;
  bodyFrameW: number;
};

export type RenderLayeredPlayerOpts = {
  g: CanvasRenderingContext2D;
  player: Player;
  camera: WorldCamera;
  bundle: CostumeRenderBundle;
  inventory: Player["inventory"];
  renderFacing: number;
  turnAnimFramesLeft: number;
  doorPose: DoorTransitionPose;
  itemPickupPose: boolean;
  juice: JuiceDrawOpts;
  attackOverlay?: AttackOverlayDraw;
  /** Java overlayBeforeTopmost whip (after body / over-body, before TOPMOST). */
  drawWhipOverlay?: () => void;
};

/** Draw Vernan with layered body + costume interleave. Returns true when drawn. */
export function tryRenderLayeredPlayer(opts: RenderLayeredPlayerOpts): boolean {
  const { bundle, player, inventory } = opts;
  if (!bundle.bodyLibrary.hasIdle) return false;

  const profile = CostumeProfile.resolve(inventory, bundle.layersFile);
  const overrides = costumeBodyOverridesFromProfile(profile);
  const holdCarry = player.carryHoldOverhead();
  const lemon = player.isLemonPoseActive();

  const pose = resolvePlayerCostumePose({
    player,
    bodyLibrary: bundle.bodyLibrary,
    bodyCtx: buildVernanBodyDrawContext(overrides, lemon, false, false, holdCarry),
    renderFacing: opts.renderFacing,
    turnAnimFramesLeft: opts.turnAnimFramesLeft,
    doorPose: opts.doorPose,
    itemPickupPose: opts.itemPickupPose,
  });
  if (!pose) return false;

  const airborne = !player.onGround && !holdCarry && pose.costumeState !== "CLIMB";
  const blink = idleBlinkFrameActive(pose.costumeState, player.walkFrame());
  const bodyCtx = buildVernanBodyDrawContext(
    overrides,
    lemon,
    blink,
    holdCarry ? false : airborne,
    holdCarry,
  );

  const feet = player.spriteFeetWorldY();
  const cx = player.x + player.w * 0.5;

  drawLayeredVernanWithCostumes({
    g: opts.g,
    camera: opts.camera,
    centerX: cx,
    feetWorldY: feet,
    yOff: pose.yOff,
    facing: pose.facing,
    juice: opts.juice,
    profile,
    costumeState: pose.costumeState,
    frameIndex: pose.frameIndex,
    animKey: pose.animKey,
    bodyCtx,
    bodyLibrary: bundle.bodyLibrary,
    artCache: bundle.artCache,
    drawConfig: bundle.drawConfig,
    layersFile: bundle.layersFile,
    lemon,
    holdOverhead: holdCarry,
    feetAnchorBodyH: pose.feetAnchorBodyH,
    overlayBeforeTopmost:
      opts.attackOverlay != null || opts.drawWhipOverlay != null
        ? () => {
            if (opts.attackOverlay != null) {
              drawAttackWeaponOverlays(
                opts.g,
                opts.camera,
                player,
                feet,
                opts.attackOverlay,
                opts.juice,
              );
            }
            opts.drawWhipOverlay?.();
          }
        : undefined,
  });

  return true;
}

function drawAttackWeaponOverlays(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  player: Player,
  feetWorldY: number,
  overlay: AttackOverlayDraw,
  juice: JuiceDrawOpts,
): void {
  const bodyW = overlay.bodyFrameW;
  const bodyLeft = player.x + player.w * 0.5 - bodyW * 0.5;
  const overlayJuice = { ...juice, solidRed: false, hurtTintAlpha: 0 };

  if (overlay.shield) {
    const overlayLeft = player.facing >= 0 ? bodyLeft : bodyLeft - 16;
    drawStripFrameFeetPinned(
      g,
      overlay.shield,
      overlay.frameIndex,
      overlayLeft,
      feetWorldY,
      player.facing,
      camera,
      overlayJuice,
    );
  }
  if (!overlay.sword) return;
  const overlayLeft = overlay.stickCentered
    ? bodyLeft + bodyW * 0.5 - overlay.sword.frameW * 0.5
    : player.facing >= 0
      ? bodyLeft
      : bodyLeft - 16;
  drawStripFrameFeetPinned(
    g,
    overlay.sword,
    overlay.frameIndex,
    overlayLeft,
    feetWorldY,
    player.facing,
    camera,
    overlayJuice,
  );
}
