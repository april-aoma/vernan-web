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
import { VernanFeetAnchor } from "../vernan/VernanFeetAnchor";
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
  /** When set (e.g. disc04 {@code attack1}), pin overlay with VernanFeetAnchor stand-bottom-left. */
  layoutAnimKey?: string;
  /** Player origin X for VernanFeetAnchor (required when layoutAnimKey is stand-bottom-left). */
  playerOriginX?: number;
  playerWidth?: number;
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

  const airborne =
    pose.costumeState === "AIR_HEAVY_ATTACK"
      ? true
      : pose.costumeState === "HEAVY_ATTACK"
        ? false
        : !player.onGround && !holdCarry && pose.costumeState !== "CLIMB";
  const blink = idleBlinkFrameActive(player, pose.costumeState, bundle.bodyLibrary);
  const posePackAnimKey =
    pose.bodyCtx.posePackAnimKey ??
    (pose.costumeState === "BORED"
      ? `bored${player.boredPosePack()}`
      : null);
  const bodyCtx = buildVernanBodyDrawContext(
    overrides,
    lemon,
    blink,
    holdCarry ? false : airborne,
    holdCarry,
    posePackAnimKey,
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
    posePackAnimKey,
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
    // Body-sized (32×32) — unlike sword, no left-facing −16 extension shift.
    drawStripFrameFeetPinned(
      g,
      overlay.shield,
      overlay.frameIndex,
      bodyLeft,
      feetWorldY,
      player.facing,
      camera,
      overlayJuice,
    );
  }
  if (!overlay.sword) return;

  const layoutKey = overlay.layoutAnimKey ?? "";
  if (VernanFeetAnchor.usesStandBottomLeftLayout(layoutKey)) {
    const originX = overlay.playerOriginX ?? player.x;
    const width = overlay.playerWidth ?? player.w;
    const worldLeft = VernanFeetAnchor.canvasWorldOriginX(
      originX,
      width,
      overlay.sword.frameW,
      player.facing,
      layoutKey,
    );
    drawStripFrameFeetPinned(
      g,
      overlay.sword,
      overlay.frameIndex,
      worldLeft,
      feetWorldY,
      player.facing,
      camera,
      overlayJuice,
      VernanFeetAnchor.feetRowPx(layoutKey, overlay.sword.frameH),
    );
    return;
  }

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
