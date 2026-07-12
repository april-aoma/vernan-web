import { AssetLoader } from "./assets/AssetLoader";
import { resolveCameraScrollBounds, highestLadderRow, lowestLadderRow, usesTierOneCamera, type PlayableScrollX } from "./camera/playableScroll";
import { WorldCamera, type CameraFollowInput } from "./camera/WorldCamera";
import { Input } from "./input/Input";
import { GameLoop } from "./loop/GameLoop";
import { Framebuffer } from "./render/Framebuffer";
import { GameColorPalette } from "./render/GameColorPalette";
import {
  drawAttackComposite,
  drawFeetPinnedImage,
  drawFeetPinnedStrip,
  drawFeetRowAnchoredStripDevice,
  drawStripFrameFeetPinned,
  stripFromImage,
  type SpriteStrip,
} from "./render/SpriteDraw";
import type { JuiceDrawOpts } from "./render/JuiceDraw";
import {
  CLIMB_BODY_PARTS,
  LEVEL_TRANSITION_BODY_PARTS,
  compositeBodyStrip,
} from "./render/VernanBodyComposite";
import { CostumeArtCache } from "./costume/CostumeArtCache";
import { CostumeDrawConfig } from "./costume/CostumeDrawConfig";
import {
  tryRenderLayeredPlayer,
  type CostumeRenderBundle,
  type AttackOverlayDraw,
} from "./costume/renderPlayerBody";
import { folderForCostumeId, loadCostumeLayers } from "./ranking/costumeResolve";
import { VernanBodyLibrary } from "./vernan/VernanBodyLibrary";
import {
  eagerlyResolveFloorItems,
  uniqueEnemySpawnKinds,
} from "./world/eagerFloorItems";
import type { EnemySpawnKind } from "./world/EnemySpawnBudget";
import {
  markLevelAscendFloorSpritesReady,
  type LevelAscendState,
} from "./world/roomFade";
import { VernanAnimCueRuntime } from "./vernan/VernanAnimCueRuntime";
import { VernanAnimCueSheet } from "./vernan/VernanAnimCueSheet";
import { mergeOwnedPalette } from "./vernan/OwnedPaletteRuntime";
import { gemKillSource, setGemKillSource } from "./combat/GemKillTracking";
import { enemyKillDifficulty } from "./combat/EnemyKillDifficulty";
import { resolveSwordProfile } from "./combat/SwordProfile";
import { HitboxPose } from "./collision/HitboxPose";
import { ARCING_ENEMY_BULLET_PLAYER_DAMAGE } from "./config/Physics";
import { stickReflectedVelocity } from "./combat/StickReflect";
import type { SwordVisual } from "./combat/SwordVisual";
import { BackpackWeaponSwitch } from "./entity/BackpackWeaponSwitch";
import { FlintFire } from "./entity/FlintFire";
import { SmokeCloud } from "./fx/SmokeCloud";
import {
  applySmokeHeatDistortion,
  buildSmokeDeviceMask,
  makeSmokeHeatAnchor,
  rippleRadiusForSmokeMask,
  type SmokeHeatAnchor,
} from "./render/SmokeHeatDistortionEffect";
import { AfterimageGhost, type AfterimageSpawnSnapshot } from "./combat/AfterimageGhost";
import { applyTamilOmAuraToBullet } from "./item/effect/TamilOmAura";
import { CrawlerHatRiding } from "./item/CrawlerHatRiding";
import { FamiliarTrailHost } from "./item/FamiliarTrailHost";
import { LilPossessed, LIL_POSSESSED_BULLET_DAMAGE } from "./item/LilPossessed";
import { LilMiner } from "./item/LilMiner";
import { WhipSim } from "./combat/whip/WhipSim";

import { LemonProjectile } from "./entity/LemonProjectile";
import { Player } from "./entity/Player";
import { Possessed, possessedBulletDamagePose, type PossessedBullet } from "./entity/Possessed";
import { Nephilim } from "./entity/Nephilim";
import { Crawler } from "./entity/Crawler";
import { Mouse } from "./entity/Mouse";
import { GoldenRoach } from "./entity/GoldenRoach";
import { drawGoldenRoach } from "./entity/drawGoldenRoach";
import { JackBlue } from "./entity/JackBlue";
import { drawJackBlueBones } from "./entity/drawJackBlue";
import {
  processJackBlueDeathChunks,
  tickPendingJackDeathExplosions,
  type PendingJackDeathExplosion,
} from "./entity/jackBlueDeathChunks";
import { spawnJackBlueBoneBreakChunks } from "./entity/jackBlueBoneBreaks";
import { Penisman } from "./entity/Penisman";
import { RollingHead } from "./entity/RollingHead";
import { Multilimber } from "./entity/Multilimber";
import { drawMultilimber } from "./entity/drawMultilimber";
import type { PenismanBullet } from "./entity/PenismanBullet";
import { drawPenisBulletDieFx, drawPenismanBullets } from "./entity/drawPenisman";
import { tickEnemyPeerPhysics } from "./entity/EnemyPeerTick";
import type { CombatEnemy } from "./entity/CombatEnemy";
import { FrisbeeAimSnapshot } from "./entity/FrisbeeAimSnapshot";
import { FrisbeeProjectile } from "./entity/FrisbeeProjectile";
import { WarpOrbProjectile } from "./entity/WarpOrbProjectile";
import { KCandyForgetHud, KCandyForgetTarget } from "./item/KCandyForgetHud";
import { KCandyHealSequence } from "./item/KCandyHealSequence";
import { KCandyVisionEffect } from "./render/KCandyVisionEffect";
import {
  captureBackbuffer,
  drawSpriteWithLiveReflection,
} from "./render/LiveReflectionEffect";
import { WARP_ORB_REFLECTION_STYLE } from "./render/LiveReflectionStyle";
import { PICKUP_COLLECT_DURATION_SEC } from "./fx/PickupCollectFx";
import type { SubweaponHost } from "./entity/SubweaponHost";
import { loadPossessedRig } from "./boss/PossessedRig";
import { loadNephilimRig } from "./boss/NephilimRig";
import { drawPossessedBoss, drawPossessedBullets } from "./boss/drawPossessed";
import { drawNephilimBoss } from "./boss/drawNephilim";
import { processPossessedDeathChunks } from "./boss/possessedDeathChunks";
import { processNephilimDeathChunks } from "./boss/nephilimDeathChunks";
import { bossKindLabel, BossKind } from "./boss/BossRegistry";
import { ItemCatalog } from "./item/ItemCatalog";
import { ItemPickupOverlay } from "./item/ItemPickupOverlay";
import { PedestalItemDecks } from "./item/PedestalItemDecks";
import { RunItemPool } from "./item/RunItemPool";
import {
  drawPossessedHeadBullets,
  PossessedHeadController,
} from "./item/PossessedHead";
import { drawItemPickupCell, ITEM_PICKUP_CELL, itemPickupRect } from "./item/ItemSpriteArt";
import { SubweaponCooldowns } from "./item/SubweaponCooldowns";
import { AutismCombat } from "./item/effect/AutismCombat";
import { AutismDamageFloater } from "./item/effect/autism/AutismDamageFloater";
import { drawAutismEnemyHud } from "./item/effect/autism/drawAutismEnemyHud";
import { ItemEffects } from "./item/effect/ItemEffects";
import type { ItemPickupHost } from "./item/effect/ItemPickupHost";
import { itemOrdinal } from "./item/effect/ItemOrdinal";
import { KaleidoscopeEyeCombat } from "./item/effect/kaleidoscope/KaleidoscopeEyeCombat";
import { KaleidoscopePedestalSprite } from "./item/effect/kaleidoscope/KaleidoscopePedestalSprite";
import { KaleidoscopeScratchPalette } from "./item/effect/kaleidoscope/KaleidoscopeScratchPalette";
import { LeotardCombat } from "./item/effect/LeotardCombat";
import { LeotardEffect } from "./item/effect/LeotardEffect";
import { ShieldBreakerCombat } from "./item/effect/ShieldBreakerCombat";
import { JavaRandom, toJavaLong } from "./util/JavaRandom";
import {
  createMiniMapState,
  drawBottomHud,
  hudWeaponItemIdsToPreload,
  innerBoxFrom0000feBorder,
  revealMiniMapForRoom,
  sliceHudStrip,
  slicePickupCell,
  type BottomHudSprites,
  type MiniMapState,
  type TouchControlsHeld,
} from "./ui/BottomHud";
import { drawPauseMenu, drawPauseOverlay, type PauseMenuHitRects } from "./ui/PauseOverlay";
import { drawDeathOverlay, type DeathOverlayHitRects } from "./ui/DeathOverlay";
import {
  computeTouchControlsGeometry,
  hitTestRect,
  hitTestTouchControl,
  type TouchControlId,
} from "./ui/BottomHudLayout";
import {
  circlePadDirsToKeyCodes,
  computeCirclePadLayout,
  drawCirclePad,
  hitTestCirclePad,
  sampleCirclePad,
  type CirclePadDirs,
  type CirclePadDrawState,
} from "./ui/CirclePad";
import { HUD_MONEY_DRAIN_FRAMES_PER_COIN, HudEconomyDisplay } from "./ui/HudEconomy";
import { openSubmitDialog } from "./ranking/SubmitDialog";
import { openLoginDialog } from "./ranking/LoginDialog";
import { isLoggedIn, logoutAccount } from "./ranking/authStore";
import { submitScore } from "./ranking/scoresStore";
import type { RunSummary } from "./ranking/types";
import { reportUnknownCrash, setCrashContext } from "./diagnostics/crashReporter";
import { BrickChunk, spawnBreakableBrickChunks } from "./fx/BrickChunk";
import {
  drawAllSeeingEyeOverlays,
  drawCarryHeldAndThrown,
  type AllSeeingDrawContext,
} from "./carry/AllSeeingEyeDraw";
import { GardeningGlovesSupport, type GardeningWorldAccess } from "./carry/GardeningGlovesSupport";
import type { ThrownCarryProjectile } from "./carry/ThrownCarryProjectile";
import { IceBlock } from "./entity/IceBlock";
import {
  freezeCombatEnemyToIce,
  snapshotIceHoldSprite,
} from "./combat/freezeCombatEnemy";
import { drawIceBlocks } from "./combat/drawIceBlock";
import { feetOnIce, trySwordStrikeIce } from "./combat/IceBlockSupport";
import { isIceBlockFreezable } from "./combat/IceBlockFreeze";
import { ICE_SHARD_VELOCITY_SCALE } from "./combat/IceBlockFx";
import { CarryKind } from "./carry/CarryKind";
import { iceBlockPayload, type CarryPayload } from "./carry/CarryPayload";
import {
  drawBrickChunksFloatZBehindPlayer,
  drawBrickChunksInFront,
} from "./fx/drawBrickChunk";
import { PsychicSpoonController } from "./fx/PsychicSpoon";
import { drawKillExplosion, KillExplosion } from "./fx/KillExplosion";
import {
  drawPickupCollectFx,
  enqueuePickupCollectFx,
  PickupCollectFx,
  pickupCollectSpriteFile,
} from "./fx/PickupCollectFx";
import {
  contactBetweenAabbs,
  drawHitVfx,
  HitVfx,
  HitVfxKind,
  hitVfxSpriteFile,
} from "./fx/HitVfx";
import { HIT_VFX_PRELOAD_KINDS, resolvePlayerMeleeHitVfx } from "./combat/HitVfxKind";
import { grantRoomClearRewards } from "./world/RoomClearRewards";
import { spawnMultilimberPartIce } from "./combat/freezeCombatEnemy";
import {
  drawElectricShockOverlayWorldRect,
  ELECTRIC_SHOCK_SHEET_FRAMES,
} from "./fx/ElectricShockOverlay";
import { drawRisingDustFx, RisingDustFx } from "./fx/RisingDustFx";
import {
  coinValue,
  heartPickupFrameIndex,
  PickupKind,
  pickupSpriteFile,
  pickupSpriteSize,
  WorldPickup,
} from "./world/WorldPickup";
import { rollRoomClearCoinKind } from "./world/BreakableLootRoll";
import { resolveDisplayTileId } from "./tileset/resolveDisplayTile";
import { decoOverlayFromStamps } from "./tileset/ContextThemeSubstitution";
import { resolveShellTileId } from "./tileset/ShellTileResolve";
import { inwardSolidSampleCell } from "./tileset/hiddenShellBreakable";
import {
  RUN_START_MONEY,
  SHOP_PEDESTAL_PRICE,
  activeShopKeeper,
  activeShopPedestals,
  drawShopKeeper,
  drawShopPriceLabel,
  ensureShopResolved,
  loadShopKeeperFrames,
  mountShopWorldPickups,
  tryBuyShopPedestal,
  tryBuyShopPickups,
  type ShopKeeperFrames,
} from "./world/Shop";
import {
  activeSuperSecretKCandyRefill,
  K_CANDY_REFILL_PRICE,
  resolveSuperSecretKCandyRefill,
  tryBuySuperSecretKCandyRefill,
} from "./world/KCandyRefill";
import { RoomKind } from "./world/DungeonTypes";
import type { Aabb } from "./combat/CombatMath";
import {
  CAMERA_ENEMY_FOCUS_RADIUS_TILES,
  CAMERA_LADDER_ENEMY_BELOW_EXTRA_FRAC,
  CAMERA_LADDER_ENEMY_BELOW_MAX_X_WORLD,
  FLINT_SPARK_BASE_CHANCE,
  FLINT_SPARK_LUCK_MULT,
  GEM_SWORD_HIT_COIN_CHANCE,
  GEM_SWORD_HITSTUN_MULT,
  GEM_SWORD_KILL_COIN_CHANCE,
  STICK_REFLECT_DAMAGE_MULT,
  STICK_REFLECT_SPEED_MULT,
} from "./config/Physics";
import { PROJECTILE_FRISBEE_PIVOT_X, FLINT_FIRE_PIVOT_X, PROJECTILE_LEMON_SHOT_PIVOT_X } from "./config/HitboxValues";
import { seeRadiusForRun } from "./combat/EnemyVision";
import { freezeFrames } from "./combat/CombatMath";
import {
  CRAWLER_FRAMES,
  MOUSE_FRAMES,
  PENISMAN_FRAMES,
  JACK_BLUE_FRAMES,
  ROLLING_HEAD_FRAMES,
  MULTILIMBER_FRAMES,
  GOLDEN_ROACH_WALK_FRAMES,
  GOLDEN_ROACH_FLY_FRAMES,
  HURT_AIR_SHEET_FRAMES,
  POSSESSED_PART_W,
  TURN_POST_FLIP_FRAMES,
  TURN_PRE_FLIP_FRAMES,
  VERNAN_ATTACK_FRAMES,
  VERNAN_CLIMB_FRAMES,
  VERNAN_JUMP_FRAMES,
  VERNAN_SPRITE_H,
  VERNAN_WALK_FRAMES,
  SWORD_ATTACK_FRAMES,
  WALK_SPEED_THRESHOLD,
} from "./config/AnimStats";
import {
  CAMERA_ZOOM,
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  FIXED_DT,
  HUD_HEIGHT,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  TILE_SIZE,
  WORLD_VIEWPORT_H,
} from "./specs";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_KEYBLOCK,
  TILE_KEYBLOCK_CONNECTOR,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "./world/TileMap";
import { buildDungeon } from "./world/buildDungeon";
import { mountDeferredRoomPickups } from "./world/RoomGenerator";
import {
  makeItemPedestal,
  PEDESTAL_DRAW_H,
  PEDESTAL_DRAW_W,
  pedestalItemAabb,
  pedestalPlatformRects,
  tickPedestalBobPhase,
  type ItemPedestal,
} from "./world/pedestal";
import { drawPedestalFloatingItem } from "./world/pedestalDraw";
import {
  activePedestal,
  applyRoomAndSpawn,
  createSession,
  DoorTransitionPose,
  drawRoomFade,
  isBossDoorCellSealed,
  isRoomTransitionActive,
  levelAscendDrawAnchor,
  levelAscendUsesClimbDraw,
  LEVEL_TRANS_FEET_ROW_WORLD_PX,
  LEVEL_TRANS_SHEET_FRAMES,
  levelTransStripHandoffAdjustDevY,
  SpawnKind,
  tickBossDoorSealAnim,
  tickSessionRoomTransition,
  TransitionPhase,
  tryCollectPedestal,
  tryCollectEnemyLootPedestal,
  addEnemyLootPedestal,
  activeEnemyLootPedestals,
  tryDoorTransition,
  tryLadderTransition,
  tryProcessRoomClear,
  onRoomEnteredWithKeyblockBypass,
  loadRoomBrickChunks,
  persistRoomBrickChunks,
  resyncRoomEnemies,
  type RoomSession,
} from "./world/roomTransition";
import { TilesetProject } from "./tileset/TilesetProject";
import { SheetAtlas } from "./tileset/SheetAtlas";
import { drawShellTiles } from "./tileset/drawShellTiles";
import { resolveBossDoorLayout, type BossDoorLayout } from "./world/BossDoorSpec";
import {
  drawKeyblockSealsWorld,
  drawMapKeyblockTiles,
  KEYBLOCK_STRIP_FRAME_COUNT,
} from "./world/drawKeyblock";
import { TileWorldRenderer } from "./tileset/TileWorldRenderer";
import {
  BackgroundPresetRegistry,
  cellKey as bgDecoCellKey,
  createRoomMathBackgroundBuffers,
  drawRoomMathBackground,
  type RoomMathBackgroundBuffers,
} from "./tileset/background";
import {
  assignRoomMathBackgroundPresets,
  roomKindUsesMathBackground,
} from "./world/roomMathBackgrounds";
import { destKindByDoorCell } from "./world/DoorDestinationResolver";
import { enrichDungeonArt } from "./tileset/enrichDungeonArt";
import { snapshotTerrainCell } from "./tileset/snapshotTerrainCell";
import {
  applySwordBreakables,
  destroyBreakableAt,
  finishSeamOpenAnimInstant,
  tickSeamOpenAnim,
  tryStrikeBreakablesInAabb,
  type BreakableStrikeContext,
} from "./world/BreakableStrike";
import { tickKeyblockSeals } from "./world/KeyblockTick";
import type { SecretSeamOpenAnim } from "./world/SecretSeamOpenAnim";

export type MountOptions = {
  assetBase?: string;
  seed?: number;
  /** Called after a successful opt-in score submit (before navigating away). */
  onScoreSubmitted?: (summary: RunSummary) => void;
};

export type VernanHandle = {
  readonly seed: number;
  /** Current run snapshot (floor, coins, kills, seed). */
  getRunSummary: () => RunSummary;
  destroy: () => void;
  focus: () => void;
};

type PlayerSprites = {
  idle: ImageBitmap | null;
  crouch: ImageBitmap | null;
  turn: ImageBitmap | null;
  walk: SpriteStrip | null;
  jump: SpriteStrip | null;
  climb: SpriteStrip | null;
  hurtAir: SpriteStrip | null;
  attack: SpriteStrip | null;
  airAttack: SpriteStrip | null;
  crouchAttack: SpriteStrip | null;
  sword: SpriteStrip | null;
  crouchSword: SpriteStrip | null;
  flintSword: SpriteStrip | null;
  crouchFlintSword: SpriteStrip | null;
  gemSword: SpriteStrip | null;
  crouchGemSword: SpriteStrip | null;
  stickSword: SpriteStrip | null;
  crouchStickSword: SpriteStrip | null;
  doorEnter: SpriteStrip | null;
  doorExit: SpriteStrip | null;
  getup: SpriteStrip | null;
  /** Nephilim grab hold — layered {@code vernan/grabbed *.png} (4 frames). */
  grabbed: SpriteStrip | null;
  /** Arms-raised pickup / shop-buy pose (`vernan item.png`). */
  itemPose: ImageBitmap | null;
  /** Boss floor-ascend descent strip (11 frames). */
  levelTransition: SpriteStrip | null;
  /** Ground frisbee throw (5 frames). */
  specialAttack: SpriteStrip | null;
  /** Air frisbee throw (5 frames). */
  airSpecialAttack: SpriteStrip | null;
  /** Warp orb throw (4 frames, attack0). */
  attack0: SpriteStrip | null;
  airAttack0: SpriteStrip | null;
  /** Gardening gloves pluck (4 frames, base+hair composite). */
  pluck: SpriteStrip | null;
  /** Gardening gloves throw (5 frames). */
  throwCarry: SpriteStrip | null;
  /** Gardening gloves air throw (5 frames). */
  throwCarryAir: SpriteStrip | null;
  /** HEADBAND exclusive attack strips (layered vernan/). */
  headbandCrouchAttack: SpriteStrip | null;
  headbandUpAttack: SpriteStrip | null;
  headbandSideAttack: SpriteStrip | null;
  /** DISC01 slide (layered vernan/). */
  slide: SpriteStrip | null;
  /** DISC02 wall-slide (layered vernan/). */
  wallSlide: SpriteStrip | null;
  /** DISC03 air-dodge (layered vernan/). */
  airDodge: SpriteStrip | null;
  /** DISC04 heavy attack ground (layered vernan/attack1). */
  heavyAttack: SpriteStrip | null;
  /** DISC04 heavy attack air legs overlay. */
  heavyAttackAirLegs: SpriteStrip | null;
  /** Lemon buster body pose swaps (flat legacy sheets). */
  lemonIdle: ImageBitmap | null;
  lemonCrouch: ImageBitmap | null;
  lemonTurn: ImageBitmap | null;
  lemonWalk: SpriteStrip | null;
  lemonJump: SpriteStrip | null;
  lemonClimb: SpriteStrip | null;
  /** Passive shield overlay (`shield player.png`, 4 frames). */
  shieldPlayer: SpriteStrip | null;
  /** Attack windup shield overlays. */
  shieldAttack: SpriteStrip | null;
  crouchShieldAttack: SpriteStrip | null;
};

type EnemySprites = {
  crawler: SpriteStrip | null;
  mouse: SpriteStrip | null;
  mouseHurt: SpriteStrip | null;
  penisman: SpriteStrip | null;
  jackBlue: SpriteStrip | null;
  jackBlueShield: SpriteStrip | null;
  rollingHead: SpriteStrip | null;
  multilimberBody: SpriteStrip | null;
  multilimberHead: SpriteStrip | null;
  multilimberEye: SpriteStrip | null;
  goldenRoachWalk: SpriteStrip | null;
  goldenRoachFly: SpriteStrip | null;
  possessed: SpriteStrip | null;
  shinyPossessed: SpriteStrip | null;
  nephilim: SpriteStrip | null;
  nephilimHealFx: CanvasImageSource | null;
};

function resolveRoot(root: string | HTMLElement): HTMLElement {
  if (typeof root === "string") {
    const el = document.querySelector(root);
    if (!(el instanceof HTMLElement)) {
      throw new Error(`mount: no element for selector ${root}`);
    }
    return el;
  }
  return root;
}

function seedFromUrl(): number | undefined {
  try {
    const raw = new URLSearchParams(window.location.search).get("seed");
    if (raw == null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? (n | 0) : undefined;
  } catch {
    return undefined;
  }
}

async function loadStrip(
  assets: AssetLoader,
  path: string,
  frames: number,
): Promise<SpriteStrip | null> {
  try {
    const img = await assets.loadImage(path);
    return stripFromImage(img, frames);
  } catch {
    return null;
  }
}

async function loadImageSafe(assets: AssetLoader, path: string): Promise<ImageBitmap | null> {
  try {
    return await assets.loadImage(path);
  } catch {
    return null;
  }
}

/**
 * Phase 6a: Vernan/enemy sprites + attack input buffer.
 */
export function mount(root: string | HTMLElement, options: MountOptions = {}): VernanHandle {
  const parent = resolveRoot(root);
  const assetBase = options.assetBase ?? "/assets/";
  let seed =
    options.seed ??
    seedFromUrl() ??
    (Math.floor(Math.random() * 0x7fffffff) | 0);

  const assets = new AssetLoader({ assetBase });
  const fb = new Framebuffer();
  const input = new Input();
  fb.mount(parent);
  input.attach(fb.canvas);

  let dungeon = buildDungeon(BigInt(seed), 1, 0);
  let floorOrdinal = 1;
  /** Mirrors Java GamePanel.enemiesKilledThisRun. */
  let enemiesKilledThisRun = 0;
  /** Last enemy death feet anchor for room-clear loot (Java lastEnemyDeathFeetCenterX/Y). */
  let lastEnemyDeathFeetCenterX = 0;
  let lastEnemyDeathFeetY = 0;
  /** Mirrors Java GamePanel.enemiesKillDifficultyThisRun. */
  let enemiesKillDifficultyThisRun = 0;
  /** True once the player has died this run. */
  let runReachedDeath = false;
  /**
   * When true, score submit is blocked (Z/X room retry after death, or RETRY SAME SEED).
   * Cleared by RESTART (NEW SEED).
   */
  let leaderboardLocked = false;
  let submitDialogOpen = false;
  let loginDialogOpen = false;
  let pauseSubmitPending = false;
  let pauseLoginPending = false;
  let pauseViewBoardPending = false;
  let deathViewBoardPending = false;
  let deathRestartPending: "new" | "same" | null = null;
  let dungeonRestartInProgress = false;
  let pauseMenuHits: PauseMenuHitRects = {
    login: { x: 0, y: 0, w: 0, h: 0 },
    viewBoard: { x: 0, y: 0, w: 0, h: 0 },
    submit: { x: 0, y: 0, w: 0, h: 0 },
  };
  let deathMenuHits: DeathOverlayHitRects = {
    submit: { x: 0, y: 0, w: 0, h: 0 },
    viewBoard: { x: 0, y: 0, w: 0, h: 0 },
    restartNew: { x: 0, y: 0, w: 0, h: 0 },
    retrySame: { x: 0, y: 0, w: 0, h: 0 },
  };
  let itemCatalog: ItemCatalog | null = null;
  let pedestalDecks: PedestalItemDecks | null = null;
  let runItemPool: RunItemPool | null = null;
  const player = new Player();
  player.stats.money = RUN_START_MONEY;
  player.onBlackHeartBurstHit = (enemy, strike) => {
    const er = enemy.rect();
    HitVfx.spawn(
      hitVfxList,
      strike.hitVfxKind ?? HitVfxKind.BLACK_HEART,
      enemy,
      strike.contactWorldX ?? er.x + er.w * 0.5,
      strike.contactWorldY ?? er.y + er.h * 0.5,
      strike.freezeFrames,
      player.x + player.w * 0.5,
    );
  };
  const pickupOverlay = new ItemPickupOverlay();
  const hudEconomy = new HudEconomyDisplay();
  hudEconomy.sync(player.stats.money, player.stats.keys);
  let pickupOverlayBonusLine = "";
  /** Heart/key shop buy: short lift pose, no card/darken (Java miniBuyOverlay*). */
  const MINI_BUY_OVERLAY_FRAMES = 20;
  let miniBuyOverlayActive = false;
  let miniBuyKind: PickupKind = PickupKind.HEART;
  let miniBuyFramesRemaining = 0;
  const startMiniBuyOverlay = (kind: PickupKind, priceCoins: number): void => {
    miniBuyOverlayActive = true;
    miniBuyKind = kind;
    miniBuyFramesRemaining = Math.max(
      MINI_BUY_OVERLAY_FRAMES,
      priceCoins * HUD_MONEY_DRAIN_FRAMES_PER_COIN,
    );
  };
  const tickMiniBuyOverlay = (): void => {
    if (!miniBuyOverlayActive) return;
    miniBuyFramesRemaining--;
    if (miniBuyFramesRemaining <= 0) miniBuyOverlayActive = false;
  };
  const pickupCollectFx: PickupCollectFx[] = [];
  const itemPickupHost: ItemPickupHost = {
    player: () => player,
    stats: () => player.stats,
    inventory: () => player.inventory,
    runSeed: () => session?.dungeon.runSeed ?? BigInt(seed),
    currentRoomId: () => session?.roomId ?? 0,
    startHudResourceGain(coins, keys) {
      if (coins > 0) player.stats.money += coins;
      if (keys > 0) player.stats.keys += keys;
      hudEconomy.startResourceGain(coins, keys, player.stats.money, player.stats.keys);
    },
    playPickupCollectFxAtPlayer(kind, count) {
      if (count <= 0) return;
      const feetCx = player.x + player.w * 0.5;
      const feetY = player.y + player.h;
      for (let i = 0; i < count; i++) {
        enqueuePickupCollectFx(pickupCollectFx, kind, feetCx, feetY);
      }
    },
    showPickupMessage(line) {
      pickupOverlayBonusLine = line;
    },
    rngForItem(itemId) {
      const roomId = session?.roomId ?? 0;
      const runSeed = session?.dungeon.runSeed ?? BigInt(seed);
      return new JavaRandom(
        toJavaLong(
          runSeed ^
            BigInt(roomId) * 0xc0111d1en ^
            BigInt(itemOrdinal(itemId)) * 0x9e3779b97f4a7c15n,
        ),
      );
    },
  };

  let fruitCarrySprite: ImageBitmap | null = null;
  const settledFruitByRoom = new Map<number, ThrownCarryProjectile[]>();
  const iceBlocks: IceBlock[] = [];
  const roomPersistedIceBlocks = new Map<number, IceBlock[]>();
  let lastFrozenIce: IceBlock | null = null;
  let gardeningGlovesSupport: GardeningGlovesSupport | null = null;

  function buildGardeningWorldAccess(): GardeningWorldAccess {
    return {
      player: () => player,
      map: () => session!.dungeon.rooms[session!.roomId]!.map,
      roomDeco: () => session!.dungeon.rooms[session!.roomId]!.art?.decoStamps ?? [],
      setRoomDeco(deco) {
        const room = session!.dungeon.rooms[session!.roomId]!;
        if (!room.art) return;
        room.art.decoStamps = [...deco];
      },
      runSeed: () => session!.dungeon.runSeed,
      currentRoomId: () => session!.roomId,
      equippedSubweapon: () => player.inventory.equippedSubweapon(),
      catalog: () => session!.catalog,
      pickupHost: () => itemPickupHost,
      playerThrowDamage: () =>
        Math.ceil(player.effectiveOutgoingDamage(1 + player.stats.attackDamage / 2)),
      fruitSprite: () => fruitCarrySprite,
      project: () => tilesetProject,
      removeDecoAt(tx, ty) {
        const room = session!.dungeon.rooms[session!.roomId]!;
        const stamps = room.art?.decoStamps;
        if (!stamps?.length) return;
        room.art!.decoStamps = stamps.filter((d) => d.tx !== tx || d.ty !== ty);
      },
      pluckBreakableFloor(tx, ty, hiddenShell) {
        const s = session!;
        const map = s.dungeon.rooms[s.roomId]!.map;
        if (hiddenShell) {
          destroyBreakableAt(tx, ty, {
            player,
            map,
            roomId: s.roomId,
            rooms: s.dungeon.rooms,
            seams: s.dungeon.secretSeams,
            layout: s.dungeon.layout,
            runSeed: s.dungeon.runSeed,
            camera,
            brickChunks,
            worldPickups,
            project: tilesetProject,
            snapshotTile: (x, y) =>
              snapshotBreakableTile(
                map,
                x,
                y,
                s,
                sheetAtlas,
                tilesetProject,
                floorOrdinal,
                tileWorldRenderer,
              ),
            activeSeamOpenAnim,
            seamAnimPlayableScrollOverride,
          });
          return;
        }
        map.setTile(tx, ty, TILE_EMPTY);
      },
      snapshotBreakableTile: (tx, ty) =>
        snapshotBreakableTile(
          session!.dungeon.rooms[session!.roomId]!.map,
          tx,
          ty,
          session!,
          sheetAtlas,
          tilesetProject,
          floorOrdinal,
          tileWorldRenderer,
        ),
      isHiddenShellBreakable(tx, ty) {
        const seams = session!.dungeon.secretSeams;
        if (!seams) return false;
        for (const seam of seams) {
          if (seam.isHiddenBreakable(session!.roomId, tx, ty)) return true;
        }
        return false;
      },
      shatterBreakableBlock(payload, x, y) {
        const snap = payload.breakableTileSnap;
        spawnBreakableBrickChunks(x, y, Math.random, brickChunks, 1, "#8a5a3a", snap);
      },
      storeSettledFruitForRoom(roomId, settled) {
        settledFruitByRoom.set(roomId, [...settled]);
      },
      settledFruitForRoom(roomId) {
        return settledFruitByRoom.get(roomId) ?? [];
      },
      acquiredItemIds: () => new Set(player.inventory.ownedIds()),
      grantPluckedItem(id) {
        player.collectItem(id, session!.catalog, itemPickupHost);
        session!.decks.markAcquired(id);
      },
      iceBlocks: () => iceBlocks,
      removeIceBlockAt(index) {
        if (index >= 0 && index < iceBlocks.length) iceBlocks.splice(index, 1);
      },
      snapshotIceHoldSprite(block) {
        return snapshotIceHoldSprite(block);
      },
      shatterIceBlock(payload, x, y) {
        shatterIceBlockPayload(payload, x, y);
      },
      spawnWorldHeartPickup(worldX, worldY) {
        worldPickups.push(WorldPickup.createFromBreakable(PickupKind.HEART, worldX, worldY, Math.random));
      },
      tryStrikeBreakables(hit) {
        return tryStrikeBreakablesInAabb(hit, breakableStrikeCtx());
      },
    };
  }

  gardeningGlovesSupport = new GardeningGlovesSupport(buildGardeningWorldAccess());

  LeotardCombat.setHost({
    leotardOwned: () => player.inventory.stacksOf("LEOTARD") > 0,
    onPlayerDamageApplied(damageDealt) {
      const stacks = player.inventory.stacksOf("LEOTARD");
      player.stats.leotardDamageBonus +=
        damageDealt * LeotardEffect.DAMAGE_PER_DAMAGE_PER_STACK * stacks;
      if (session) {
        player.stats.applyItemPassives(player.inventory, session.catalog);
      }
    },
  });
  const autismDamageFloaters: AutismDamageFloater[] = [];
  let autismFloaterSpawnCounter = 0;
  const kaleidoscopePalette = new KaleidoscopeScratchPalette();
  const kaleidoscopePedestalSprite = new KaleidoscopePedestalSprite();
  let kaleidoscopePedestalPrimedKey = "";
  let kaleidoscopeDamageProcCounter = 0n;
  let gamePaletteRef: GameColorPalette | null = null;
  const ensureKaleidoscopePalette = () => {
    if (gamePaletteRef?.isLoaded && !kaleidoscopePalette.isReady()) {
      kaleidoscopePalette.resetFromGrid(gamePaletteRef.copyPaletteGrid());
    }
  };
  AutismCombat.setHost({
    autismOwned: () => player.inventory.stacksOf("AUTISM") > 0,
    onPlayerDamageFloater(enemy, damage) {
      const b = enemy.rect();
      const cx = b.x + b.w * 0.5;
      const headTop = b.y;
      const barTop = headTop - 1 - 2;
      const anchorY = barTop - 1;
      let stack = 0;
      for (const f of autismDamageFloaters) {
        if (Math.abs(f.spawnAnchorX - cx) < 10) stack++;
      }
      const phase = (++autismFloaterSpawnCounter) * 1.731;
      autismDamageFloaters.push(new AutismDamageFloater(cx, anchorY, damage, stack, phase));
    },
  });
  KaleidoscopeEyeCombat.setHost({
    kaleidoscopeOwned: () => player.inventory.stacksOf("KALEIDOSCOPE_EYE") > 0,
    onEnemyDamaged(enemy) {
      ensureKaleidoscopePalette();
      const stacks = player.inventory.stacksOf("KALEIDOSCOPE_EYE");
      kaleidoscopeDamageProcCounter += 1n;
      const runSeed = session?.dungeon.runSeed ?? BigInt(seed);
      const rng = new JavaRandom(
        toJavaLong(
          runSeed ^
            kaleidoscopeDamageProcCounter * 0x9e3779b97f4a7c15n ^
            BigInt(Math.floor(enemy.rect().x) ^ Math.floor(enemy.rect().y)),
        ),
      );
      player.stats.kaleidoscopeEye.onDealDamage(
        (bound) => rng.nextInt(bound),
        stacks,
        kaleidoscopePalette,
      );
      if (session) {
        player.stats.applyItemPassives(player.inventory, session.catalog);
      }
    },
    playerIncomingDamageMultiplier: () => 2,
    onPlayerDamageApplied() {
      const stacks = player.inventory.stacksOf("KALEIDOSCOPE_EYE");
      player.stats.kaleidoscopeEye.crystallizeTemp(stacks);
      if (session) {
        player.stats.applyItemPassives(player.inventory, session.catalog);
      }
    },
  });
  const subweaponCooldowns = new SubweaponCooldowns();
  const K_CANDY_MAX_USES = 30;
  let kCandyUsesRemaining = 0;
  const kCandyForgetHud = new KCandyForgetHud();
  const kCandyHealSequence = new KCandyHealSequence();
  const kCandyVision = new KCandyVisionEffect();
  let kCandyHudRedDisplayed = -1;
  const subweaponHost: SubweaponHost = {
    equippedSubweapon: () => player.inventory.equippedSubweapon(),
    subweaponCooldownReady: () => {
      const eq = player.inventory.equippedSubweapon();
      if (!eq) return true;
      return subweaponCooldowns.isReady(eq);
    },
    onSubweaponFired: () => {
      const eq = player.inventory.equippedSubweapon();
      if (!eq || !session) return;
      const def = session.catalog.def(eq);
      if (!def.subweapon) return;
      subweaponCooldowns.begin(eq, def.subweaponCooldownSeconds);
    },
    spawnFrisbee: (worldX, worldY, facingSign, aim: FrisbeeAimSnapshot) => {
      if (!frisbeeStrip) return;
      const launch = aim.resolve(facingSign);
      frisbeeProjectiles.push(
        new FrisbeeProjectile(
          worldX,
          worldY,
          launch.vx,
          launch.vy,
          launch.gravityMul,
          launch.vyCap,
        ),
      );
    },
    activatePsychicSpoon: () => {
      if (!session) return;
      psychicSpoon.activate(brickChunks, player, session.enemies, camera);
    },
    spawnWarpOrb: (worldX, worldY, facingSign, throwFromGround) => {
      warpOrbProjectiles.length = 0;
      const ivx = facingSign * 132;
      const ivy = -118;
      warpOrbProjectiles.push(new WarpOrbProjectile(worldX, worldY, ivx, ivy, throwFromGround));
    },
    activateKCandy: () => {
      if (kCandyUsesRemaining <= 0 || kCandyHealSequence.isActive()) return;
      kCandyUsesRemaining--;
      const roomId = session?.roomId ?? 0;
      const runSeed = session?.dungeon.runSeed ?? BigInt(seed);
      const rng = new JavaRandom(
        toJavaLong(
          runSeed ^
            BigInt(kCandyForgetHud.totalUses()) * 0xc011ee11n ^
            BigInt(roomId) * 0x9e3779b9n,
        ),
      );
      kCandyForgetHud.advanceForget(rng);
      const redCur = player.health.getRedCurrent();
      const redMax = player.health.getRedMax();
      const healAmount = Math.max(0, redMax - redCur);
      const hearts = healAmount > 0 ? Math.max(1, Math.ceil((healAmount + 1) / 2)) : 1;
      const duration = PICKUP_COLLECT_DURATION_SEC * hearts * 0.55;
      kCandyHudRedDisplayed = redCur;
      player.triggerKCandyWhiteFlash(duration);
      kCandyHealSequence.begin(redCur, redMax, duration, hearts);
    },
    kCandyUsesRemaining: () => kCandyUsesRemaining,
    kCandyCanFire: () => kCandyUsesRemaining > 0 && !kCandyHealSequence.isActive(),
    hasLemonShooter: () => player.inventory.stacksOf("LEMON") > 0,
    lemonShotsOnScreen: () => lemonProjectiles.length,
    lemonShotDamage: () => player.effectiveOutgoingDamage(player.stats.outgoingDamage()) * 0.5,
    lemonShotRefireSeconds: () => player.stats.attackWindupFrames / 60,
    spawnLemonShot: (worldX, worldY, facingSign, damage) => {
      lemonProjectiles.push(new LemonProjectile(worldX, worldY, facingSign, damage));
    },
  };
  const psychicSpoon = new PsychicSpoonController();
  let hudSprites: BottomHudSprites = {
    heartFrames: [],
    soulHeartFrames: [],
    blackHeartFrames: [],
    coin: null,
    key: null,
    weaponFrame: null,
    subweaponFrame: null,
    weaponInner: { x: 0, y: 0, w: 0, h: 0 },
    subweaponInner: { x: 0, y: 0, w: 0, h: 0 },
    statFrames: [],
    swordPickup: null,
  };
  let miniMapState: MiniMapState = createMiniMapState(dungeon.layout.roomCount());
  const camera = new WorldCamera();

  let session: RoomSession | null = null;
  let bootError: string | null = null;
  let runtimeCrash: string | null = null;
  let debug = false;
  /** Java GamePanel.paused — freezes sim; Enter/Esc or HUD pause button toggles. */
  let paused = false;
  let pauseButtonTogglePending = false;
  /** pointerId → soft control currently held (multitouch). */
  const softPointerControls = new Map<number, TouchControlId>();
  /** Active circle-pad pointer (one stick at a time). */
  let circlePadPointerId: number | null = null;
  let circlePadCodes = new Set<string>();
  let circlePadDraw: CirclePadDrawState = {
    knobDx: 0,
    knobDy: 0,
    active: false,
    dirs: { up: false, left: false, down: false, right: false },
  };

  const touchControlKeyCode = (id: TouchControlId): string | null => {
    switch (id) {
      case "up":
        return "ArrowUp";
      case "left":
        return "ArrowLeft";
      case "down":
        return "ArrowDown";
      case "right":
        return "ArrowRight";
      case "jump":
        return "KeyZ";
      case "attack":
        return "KeyX";
      case "sub":
        return "KeyC";
      case "dodge":
        return "ShiftLeft";
      case "pause":
        return null;
    }
  };

  const syncCirclePadDirs = (dirs: CirclePadDirs): void => {
    const next = new Set(circlePadDirsToKeyCodes(dirs));
    for (const code of circlePadCodes) {
      if (!next.has(code)) input.softKeyUp(code);
    }
    for (const code of next) {
      if (!circlePadCodes.has(code)) input.softKeyDown(code);
    }
    circlePadCodes = next;
  };

  const clearCirclePad = (): void => {
    circlePadPointerId = null;
    for (const code of circlePadCodes) input.softKeyUp(code);
    circlePadCodes = new Set();
    circlePadDraw = {
      knobDx: 0,
      knobDy: 0,
      active: false,
      dirs: { up: false, left: false, down: false, right: false },
    };
  };

  const releaseSoftPointer = (pointerId: number): void => {
    if (circlePadPointerId === pointerId) {
      clearCirclePad();
      return;
    }
    const id = softPointerControls.get(pointerId);
    if (!id) return;
    softPointerControls.delete(pointerId);
    const code = touchControlKeyCode(id);
    if (code) input.softKeyUp(code);
  };

  const canvasPointToInternal = (e: PointerEvent): { ix: number; iy: number } | null => {
    const rect = fb.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      ix: ((e.clientX - rect.left) / rect.width) * INTERNAL_WIDTH,
      iy: ((e.clientY - rect.top) / rect.height) * INTERNAL_HEIGHT,
    };
  };

  const onTouchControlsPointerDown = (e: PointerEvent): void => {
    if (submitDialogOpen || loginDialogOpen) return;
    const pt = canvasPointToInternal(e);
    if (!pt) return;
    const { ix, iy } = pt;
    const hudY0 = INTERNAL_HEIGHT - HUD_HEIGHT;

    if (paused && pauseMenuHits.login.w > 0 && hitTestRect(ix, iy, pauseMenuHits.login)) {
      e.preventDefault();
      pauseLoginPending = true;
      return;
    }
    if (paused && pauseMenuHits.viewBoard.w > 0 && hitTestRect(ix, iy, pauseMenuHits.viewBoard)) {
      e.preventDefault();
      pauseViewBoardPending = true;
      return;
    }
    if (paused && pauseMenuHits.submit.w > 0 && hitTestRect(ix, iy, pauseMenuHits.submit)) {
      e.preventDefault();
      pauseSubmitPending = true;
      return;
    }
    if (player.health.isDead) {
      if (deathMenuHits.submit.w > 0 && hitTestRect(ix, iy, deathMenuHits.submit)) {
        e.preventDefault();
        pauseSubmitPending = true;
        return;
      }
      if (deathMenuHits.viewBoard.w > 0 && hitTestRect(ix, iy, deathMenuHits.viewBoard)) {
        e.preventDefault();
        deathViewBoardPending = true;
        return;
      }
      if (deathMenuHits.restartNew.w > 0 && hitTestRect(ix, iy, deathMenuHits.restartNew)) {
        e.preventDefault();
        deathRestartPending = "new";
        return;
      }
      if (deathMenuHits.retrySame.w > 0 && hitTestRect(ix, iy, deathMenuHits.retrySame)) {
        e.preventDefault();
        deathRestartPending = "same";
        return;
      }
    }

    const geo = computeTouchControlsGeometry(INTERNAL_WIDTH, hudY0, HUD_HEIGHT);
    const hit = hitTestTouchControl(ix, iy, geo);
    if (hit) {
      e.preventDefault();
      try {
        fb.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (hit === "pause") {
        pauseButtonTogglePending = true;
        return;
      }
      if (paused || player.health.isDead) return;
      softPointerControls.set(e.pointerId, hit);
      const code = touchControlKeyCode(hit);
      if (code) input.softKeyDown(code);
      return;
    }

    if (paused || player.health.isDead) return;
    const padLayout = computeCirclePadLayout();
    if (circlePadPointerId == null && hitTestCirclePad(ix, iy, padLayout)) {
      e.preventDefault();
      try {
        fb.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      circlePadPointerId = e.pointerId;
      const sample = sampleCirclePad(ix, iy, padLayout);
      circlePadDraw = {
        knobDx: sample.knobDx,
        knobDy: sample.knobDy,
        active: true,
        dirs: sample.dirs,
      };
      syncCirclePadDirs(sample.dirs);
    }
  };

  const onTouchControlsPointerMove = (e: PointerEvent): void => {
    if (circlePadPointerId !== e.pointerId) return;
    const pt = canvasPointToInternal(e);
    if (!pt) return;
    const padLayout = computeCirclePadLayout();
    const sample = sampleCirclePad(pt.ix, pt.iy, padLayout);
    circlePadDraw = {
      knobDx: sample.knobDx,
      knobDy: sample.knobDy,
      active: true,
      dirs: sample.dirs,
    };
    syncCirclePadDirs(sample.dirs);
  };

  const onTouchControlsPointerUp = (e: PointerEvent): void => {
    releaseSoftPointer(e.pointerId);
  };

  const onTouchControlsPointerCancel = (e: PointerEvent): void => {
    releaseSoftPointer(e.pointerId);
  };

  fb.canvas.addEventListener("pointerdown", onTouchControlsPointerDown);
  fb.canvas.addEventListener("pointermove", onTouchControlsPointerMove);
  fb.canvas.addEventListener("pointerup", onTouchControlsPointerUp);
  fb.canvas.addEventListener("pointercancel", onTouchControlsPointerCancel);
  fb.canvas.addEventListener("lostpointercapture", onTouchControlsPointerUp);

  let fps = 0;
  let ups = 0;
  const itemBitmaps = new Map<string, ImageBitmap>();

  function currentRunSummary(): RunSummary {
    return {
      seed,
      floorReached: floorOrdinal,
      coins: player.stats.money,
      enemiesKilled: enemiesKilledThisRun,
      enemiesKillDifficulty: enemiesKillDifficultyThisRun,
      durationSec: session?.timeSec ?? 0,
      itemIds: player.inventory.ownedIds(),
    };
  }

  function leaderboardPageUrl(): URL {
    const leaderboardUrl = new URL("leaderboard.html", window.location.href);
    try {
      const params = new URLSearchParams(window.location.search);
      const api = params.get("scoresApi");
      if (api) leaderboardUrl.searchParams.set("scoresApi", api);
      const authApi = params.get("authApi");
      if (authApi) leaderboardUrl.searchParams.set("authApi", authApi);
    } catch {
      /* ignore */
    }
    return leaderboardUrl;
  }

  function openLeaderboardView(): void {
    window.open(leaderboardPageUrl().href, "_blank", "noopener,noreferrer");
  }

  async function beginLoginFromPause(): Promise<void> {
    if (submitDialogOpen || loginDialogOpen) return;
    if (isLoggedIn()) {
      await logoutAccount();
      return;
    }
    loginDialogOpen = true;
    paused = true;
    softPointerControls.clear();
    clearCirclePad();
    input.clearHardwareState();
    try {
      await openLoginDialog();
    } finally {
      loginDialogOpen = false;
      pauseLoginPending = false;
    }
  }

  async function beginSubmitAndQuit(): Promise<void> {
    if (submitDialogOpen || loginDialogOpen) return;
    if (leaderboardLocked) {
      window.alert(
        "Scores cannot be submitted for this run (respawned in-room, or restarted on the same seed).",
      );
      return;
    }
    submitDialogOpen = true;
    paused = true;
    softPointerControls.clear();
    clearCirclePad();
    input.clearHardwareState();
    try {
      const summary = currentRunSummary();
      const result = await openSubmitDialog(summary);
      if (result.action !== "submit") return;
      await submitScore(summary, result.playerName, { asGuest: result.asGuest });
      options.onScoreSubmitted?.(summary);
      // Brief delay so a mirror download (no remote API) is not cancelled by navigation.
      await new Promise((r) => setTimeout(r, 400));
      window.location.assign(leaderboardPageUrl().href);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      window.alert(msg);
    } finally {
      submitDialogOpen = false;
      pauseSubmitPending = false;
      input.clearHardwareState();
    }
  }

  /**
   * Full run restart (Java GamePanel.requestRestart).
   * NEW SEED → leaderboard-viable; SAME SEED → locked.
   */
  function requestRestart(mode: "new" | "same"): void {
    if (dungeonRestartInProgress || !itemCatalog || !pedestalDecks || !runItemPool) return;
    dungeonRestartInProgress = true;
    void (async () => {
    try {
      const newSeed =
        mode === "new" ? (Math.floor(Math.random() * 0x7fffffff) | 0) : seed;
      seed = newSeed;
      leaderboardLocked = mode === "same";
      runReachedDeath = false;
      enemiesKilledThisRun = 0;
      enemiesKillDifficultyThisRun = 0;
      lastEnemyDeathFeetCenterX = 0;
      lastEnemyDeathFeetY = 0;
      floorOrdinal = 1;
      paused = false;
      submitDialogOpen = false;
      pauseSubmitPending = false;
      deathViewBoardPending = false;
      deathRestartPending = null;

      runItemPool.clear();
      pedestalDecks.reset(BigInt(seed));
      dungeon = buildDungeon(
        BigInt(seed),
        1,
        player.inventory.stacksOf("EYE_OF_RA"),
        tilesetProject,
      );
      // Clear inventory after eye-of-ra stack read for dungeon gen.
      player.inventory.clear();
      player.stats.resetForNewRun();
      player.stats.applyItemPassives(player.inventory, itemCatalog);
      player.health.clearSoulHearts();
      player.health.clearBlackHearts();
      player.health.max = player.stats.maxHealth;
      player.health.healFull();
      player.facing = 1;
      player.resetSubweaponAnim();
      player.dropCarryForSubweaponSwitch();

      session = createSession(dungeon, itemCatalog, pedestalDecks);
      floorOrdinal = dungeon.floorOrdinal;
      miniMapState = createMiniMapState(dungeon.layout.roomCount());

      brickChunks.length = 0;
      frisbeeProjectiles.length = 0;
      warpOrbProjectiles.length = 0;
      clearWeaponProjectiles();
      worldPickups.length = 0;
      pickupCollectFx.length = 0;
      hitVfxList.length = 0;
      risingDustFx.length = 0;
      explosions.length = 0;
      pendingJackDeathExplosions.length = 0;
      iceBlocks.length = 0;
      roomPersistedIceBlocks.clear();
      settledFruitByRoom.clear();
      gardeningGlovesSupport?.clearForNewRun();
      possessedHead.clear();
      psychicSpoon.reset();
      familiarTrail.clearAll();
      subweaponCooldowns.clearAll();
      backpackWeaponSwitch.reset();
      kCandyUsesRemaining = 0;
      kCandyForgetHud.reset();
      kCandyHealSequence.cancel();
      kCandyVision.reset();
      kCandyHudRedDisplayed = -1;
      pickupOverlay.dismiss();
      pickupOverlayBonusLine = "";
      miniBuyOverlayActive = false;
      miniBuyFramesRemaining = 0;
      hudEconomy.sync(player.stats.money, player.stats.keys);
      softPointerControls.clear();
      clearCirclePad();
      input.clearHardwareState();

      if (tilesetProject) {
        enrichDungeonArt(session.dungeon, tilesetProject, contentSeedsOf(session.dungeon));
      }
      await loadSpritesForSessionDungeon(session);
      applyRoomAndSpawn(session, 0, SpawnKind.INITIAL, player);
      applySwordProfileIfPresent();
      mountDeferredRoomPickups(session.dungeon.rooms[session.roomId]!, worldPickups);
      mountShopWorldPickups(session, worldPickups, player.stats.luck);
      if (bgRegistry) {
        roomMathBackgroundPresetId = assignRoomMathBackgroundPresets(
          session.dungeon.layout,
          bgRegistry,
        );
      }
      playerWasOnGround = player.onGround;
      snapCameraToPlayer(session);
      revealMiniMapForRoom(session.dungeon.layout, session.roomId, miniMapState);
      renderFacing = player.facing;
      turnAnimFramesLeft = 0;
    } finally {
      dungeonRestartInProgress = false;
    }
    })();
  }
  let pedestalBmp: ImageBitmap | null = null;
  let shopKeeperFrames: ShopKeeperFrames | null = null;
  let killExplosionBmp: ImageBitmap | null = null;
  const playerSprites: PlayerSprites = {
    idle: null,
    crouch: null,
    turn: null,
    walk: null,
    jump: null,
    climb: null,
    hurtAir: null,
    attack: null,
    airAttack: null,
    crouchAttack: null,
    sword: null,
    crouchSword: null,
    flintSword: null,
    crouchFlintSword: null,
    gemSword: null,
    crouchGemSword: null,
    stickSword: null,
    crouchStickSword: null,
    doorEnter: null,
    doorExit: null,
    getup: null,
    grabbed: null,
    itemPose: null,
    levelTransition: null,
    specialAttack: null,
    airSpecialAttack: null,
    attack0: null,
    airAttack0: null,
    pluck: null,
    throwCarry: null,
    throwCarryAir: null,
    headbandCrouchAttack: null,
    headbandUpAttack: null,
    headbandSideAttack: null,
    lemonIdle: null,
    lemonCrouch: null,
    lemonTurn: null,
    lemonWalk: null,
    lemonJump: null,
    lemonClimb: null,
    shieldPlayer: null,
    shieldAttack: null,
    crouchShieldAttack: null,
    slide: null,
    wallSlide: null,
    airDodge: null,
    heavyAttack: null,
    heavyAttackAirLegs: null,
  };
  let renderFacing = 1;
  let turnAnimFramesLeft = 0;
  const enemySprites: EnemySprites = {
    crawler: null,
    mouse: null,
    mouseHurt: null,
    penisman: null,
    jackBlue: null,
    jackBlueShield: null,
    rollingHead: null,
    multilimberBody: null,
    multilimberHead: null,
    multilimberEye: null,
    goldenRoachWalk: null,
    goldenRoachFly: null,
    possessed: null,
    shinyPossessed: null,
    nephilim: null,
    nephilimHealFx: null,
  };

  function breakableStrikeCtx(): BreakableStrikeContext {
    const s = session!;
    const map = s.dungeon.rooms[s.roomId]!.map;
    return {
      player,
      map,
      roomId: s.roomId,
      rooms: s.dungeon.rooms,
      seams: s.dungeon.secretSeams,
      layout: s.dungeon.layout,
      runSeed: s.dungeon.runSeed,
      camera,
      brickChunks,
      worldPickups,
      project: tilesetProject,
      snapshotTile: (tx, ty) =>
        snapshotBreakableTile(map, tx, ty, s, sheetAtlas, tilesetProject, floorOrdinal, tileWorldRenderer),
      activeSeamOpenAnim,
      seamAnimPlayableScrollOverride,
    };
  }

  function shatterIceBlockPayload(payload: CarryPayload, x: number, y: number): void {
    if (payload.kind !== CarryKind.ICE_BLOCK) return;
    const snap = payload.breakableTileSnap;
    spawnBreakableBrickChunks(
      x,
      y,
      Math.random,
      brickChunks,
      ICE_SHARD_VELOCITY_SCALE,
      "#7fe4f9",
      snap,
    );
    for (const loot of payload.iceLoot) {
      worldPickups.push(WorldPickup.createFromBreakable(loot.kind, x + 8, y + 16, Math.random));
    }
  }

  function tryFreezeDeadEnemy(e: CombatEnemy): boolean {
    if (player.inventory.stacksOf("ICE_BLOCK") <= 0) return false;
    if (!isIceBlockFreezable(e)) return false;
    const block = freezeCombatEnemyToIce(e, enemySprites);
    if (!block) return false;
    iceBlocks.push(block);
    lastFrozenIce = block;
    return true;
  }

  function rollGemKillLootIntoIce(e: CombatEnemy): void {
    if (player.inventory.stacksOf("GEM_SWORD") <= 0 || !lastFrozenIce) return;
    const src = gemKillSource(e);
    if (src !== "sword" && src !== "flint_fire") return;
    if (Math.random() >= GEM_SWORD_KILL_COIN_CHANCE) return;
    lastFrozenIce.addLoot(rollRoomClearCoinKind(Math.random));
  }

  let possessedBulletBmp: ImageBitmap | null = null;
  let possessedBulletDieBmp: ImageBitmap | null = null;
  let penisBulletBmp: ImageBitmap | null = null;
  let penisBulletDieBmp: ImageBitmap | null = null;
  let jackBlueBoneBmp: ImageBitmap | null = null;
  let lilPossessedBulletBmp: ImageBitmap | null = null;
  let lilPossessedBulletDieBmp: ImageBitmap | null = null;
  const possessedHead = new PossessedHeadController();
  const explosions: KillExplosion[] = [];
  const brickChunks: BrickChunk[] = [];
  const pendingJackDeathExplosions: PendingJackDeathExplosion[] = [];
  const frisbeeProjectiles: FrisbeeProjectile[] = [];
  const warpOrbProjectiles: WarpOrbProjectile[] = [];
  const flintFires: FlintFire[] = [];
  const smokeClouds: SmokeCloud[] = [];
  const afterimageGhosts: AfterimageGhost[] = [];
  const familiarTrail = new FamiliarTrailHost();
  let smokeBmp: ImageBitmap | null = null;
  let lilPossessedFriendBmp: ImageBitmap | null = null;
  let lilMinerFriendBmp: ImageBitmap | null = null;
  let whipPartBmp: ImageBitmap | null = null;
  const lemonProjectiles: LemonProjectile[] = [];
  const backpackWeaponSwitch = new BackpackWeaponSwitch();
  let frisbeeStrip: SpriteStrip | null = null;
  let fireStrip: SpriteStrip | null = null;
  let lemonShotStrip: SpriteStrip | null = null;
  let electricShockStrip: SpriteStrip | null = null;
  let psychicFireStrip: SpriteStrip | null = null;
  retainWeaponPhysicsForPlayerParity();
  const worldPickups: WorldPickup[] = [];
  const pickupBitmaps = new Map<string, ImageBitmap>();
  const pickupCollectStrips = new Map<PickupKind, ImageBitmap>();
  const hitVfxList: HitVfx[] = [];
  const hitVfxSprites = new Map<HitVfxKind, ImageBitmap>();
  const risingDustFx: RisingDustFx[] = [];
  let dustSprite: ImageBitmap | null = null;
  const activeSeamOpenAnim: { current: SecretSeamOpenAnim | null } = { current: null };
  const seamAnimPlayableScrollOverride: { current: PlayableScrollX | null } = {
    current: null,
  };
  /** Previous tick onGround for camera landing settle (Java playerWasOnGround). */
  let playerWasOnGround = true;
  const dyingFxStarted = new WeakSet<object>();
  let tilesetProject: TilesetProject | null = null;
  let sheetAtlas: SheetAtlas | null = null;
  let tileWorldRenderer: TileWorldRenderer | null = null;
  let bossDoorLayout: BossDoorLayout | null = null;
  let keyblockStrip: SpriteStrip | null = null;
  let keyblockConnectorStrip: SpriteStrip | null = null;
  let bgRegistry: BackgroundPresetRegistry | null = null;
  const bgBuffers: RoomMathBackgroundBuffers = createRoomMathBackgroundBuffers();
  let roomMathBackgroundPresetId: (string | null)[] = [];
  let gamePalette: GameColorPalette | null = null;
  let costumeBundle: CostumeRenderBundle | null = null;

  void assets.hasManifest();

  let bootStatus = "Loading…";

  const compositeClimb = async () => {
    const climbLayers = await Promise.all(
      CLIMB_BODY_PARTS.map((part) =>
        loadStrip(assets, `sprites/vernan/climb ${part}.png`, VERNAN_CLIMB_FRAMES),
      ),
    );
    return (
      (await compositeBodyStrip(climbLayers)) ??
      (await loadStrip(assets, "sprites/vernan climb.png", VERNAN_CLIMB_FRAMES))
    );
  };

  const compositeHurt = async () => {
    const hurtLayers = await Promise.all(
      (["base", "hair"] as const).map((part) =>
        loadStrip(assets, `sprites/vernan/hurt ${part}.png`, HURT_AIR_SHEET_FRAMES),
      ),
    );
    return (
      (await compositeBodyStrip(hurtLayers)) ??
      (await loadStrip(assets, "sprites/vernan hurt air.png", HURT_AIR_SHEET_FRAMES))
    );
  };

  const loadLayeredStrip = async (
    parts: readonly string[],
    pathFor: (part: string) => string,
    frames: number,
  ): Promise<SpriteStrip | null> => {
    const layers = await Promise.all(parts.map((part) => loadStrip(assets, pathFor(part), frames)));
    return (await compositeBodyStrip(layers)) ?? null;
  };

  const ensureFloorSheets = async (floor: number): Promise<void> => {
    if (!sheetAtlas || !tilesetProject) return;
    const primary = tilesetProject.primarySheetIdForFloor(floor);
    const ids = new Set<string>([primary]);
    // Keep any already-stamped room sheet ids for this dungeon floor.
    if (session) {
      for (const room of session.dungeon.rooms) {
        const sid = room.art?.sheetId;
        if (sid) ids.add(sid);
      }
    }
    await sheetAtlas.loadSheets(assets, [...ids]);
    if (tileWorldRenderer) tileWorldRenderer.syncSheets(sheetAtlas, tilesetProject);
  };

  const ensureRoomBackground = async (roomId: number): Promise<void> => {
    if (!bgRegistry || roomId < 0 || roomId >= roomMathBackgroundPresetId.length) return;
    const presetId = roomMathBackgroundPresetId[roomId];
    if (presetId) await bgRegistry.ensurePresetSprites(assets, presetId);
  };

  /** Phase A — start room only: enough to spawn and walk/attack in room 0. */
  const loadFirstRoomSprites = async (): Promise<void> => {
    bootStatus = "Loading first room…";
    const [
      idle,
      crouch,
      turn,
      walk,
      jump,
      climb,
      hurtAir,
      attack,
      airAttack,
      crouchAttack,
      sword,
      crouchSword,
      doorEnter,
      doorExit,
      healthSheet,
      coin,
      key,
      weaponFrame,
      dust,
    ] = await Promise.all([
      loadImageSafe(assets, "sprites/vernan idle.png"),
      loadImageSafe(assets, "sprites/vernan crouch.png"),
      loadImageSafe(assets, "sprites/vernan turn.png"),
      loadStrip(assets, "sprites/vernan walk.png", VERNAN_WALK_FRAMES),
      loadStrip(assets, "sprites/vernan jump.png", VERNAN_JUMP_FRAMES),
      compositeClimb(),
      compositeHurt(),
      loadStrip(assets, "sprites/vernan attack.png", VERNAN_ATTACK_FRAMES),
      loadStrip(assets, "sprites/vernan air attack.png", VERNAN_ATTACK_FRAMES),
      loadStrip(assets, "sprites/vernan crouch attack.png", VERNAN_ATTACK_FRAMES),
      loadStrip(assets, "sprites/sword attack.png", SWORD_ATTACK_FRAMES),
      loadStrip(assets, "sprites/sword crouch attack.png", SWORD_ATTACK_FRAMES),
      loadLayeredStrip(
        ["base", "arm", "hair"],
        (part) => `sprites/vernan/doorenter ${part}.png`,
        1,
      ),
      loadLayeredStrip(
        ["base", "arm", "hair", "face"],
        (part) => `sprites/vernan/doorexit ${part}.png`,
        1,
      ),
      loadImageSafe(assets, "sprites/UI health.png"),
      loadImageSafe(assets, "sprites/UI coin.png"),
      loadImageSafe(assets, "sprites/UI key.png"),
      loadImageSafe(assets, "sprites/UI weapon.png"),
      loadImageSafe(assets, "sprites/dust.png"),
    ]);
    playerSprites.idle = idle;
    playerSprites.crouch = crouch;
    playerSprites.turn = turn;
    playerSprites.walk = walk;
    playerSprites.jump = jump;
    playerSprites.climb = climb;
    playerSprites.hurtAir = hurtAir;
    playerSprites.attack = attack;
    playerSprites.airAttack = airAttack;
    playerSprites.crouchAttack = crouchAttack;
    playerSprites.sword = sword;
    playerSprites.crouchSword = crouchSword;
    playerSprites.doorEnter = doorEnter;
    playerSprites.doorExit = doorExit;
    dustSprite = dust;
    if (healthSheet) hudSprites.heartFrames = await sliceHudStrip(healthSheet, 3);
    hudSprites.coin = coin;
    hudSprites.key = key;
    hudSprites.weaponFrame = weaponFrame;
    if (hudSprites.weaponFrame) {
      hudSprites.weaponInner = innerBoxFrom0000feBorder(hudSprites.weaponFrame, 1);
    }
  };

  /** Phase B — Vernan combat extras, HUD, room props (no enemies — those are seed-driven). */
  const loadFirstFloorSprites = async (): Promise<void> => {
    bootStatus = "Loading floor…";
    const [
      keyblock,
      keyblockConn,
      pedestal,
      shopSheet,
      killExplosion,
      soulSheet,
      blackSheet,
      subweaponFrame,
      statsSheet,
      swordSheet,
      electricShock,
      attack0,
      airAttack0,
      pluck,
      throwCarry,
      throwCarryAir,
      fruit,
      headbandCrouch,
      headbandUp,
      headbandSide,
      slide,
      wallSlide,
      airDodge,
      heavyAttack,
      heavyAttackAirLegs,
      specialAttack,
      airSpecialAttack,
      shieldPlayer,
      shieldAttack,
      crouchShieldAttack,
      flintSword,
      crouchFlintSword,
      getup,
      grabbed,
      itemLayers,
    ] = await Promise.all([
      loadStrip(assets, "sprites/keyblock.png", KEYBLOCK_STRIP_FRAME_COUNT),
      loadStrip(assets, "sprites/keyblock connector.png", KEYBLOCK_STRIP_FRAME_COUNT),
      loadImageSafe(assets, "sprites/items/item pedestal.png"),
      loadImageSafe(assets, "sprites/cat shopkeep sheet.png"),
      loadImageSafe(assets, "sprites/kill explosion.png"),
      loadImageSafe(assets, "sprites/soul heart.png"),
      loadImageSafe(assets, "sprites/black heart.png"),
      loadImageSafe(assets, "sprites/UI subweapon.png"),
      loadImageSafe(assets, "sprites/hud stats.png"),
      loadImageSafe(assets, "sprites/items/sword.png"),
      loadStrip(assets, "sprites/electric shock.png", ELECTRIC_SHOCK_SHEET_FRAMES),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/attack0 ${p}.png`, 4),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/attack0 air-${p}.png`, 4),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/pluck ${p}.png`, 4),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/throw ${p}.png`, 5),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/throw air-${p}.png`, 5),
      loadImageSafe(assets, "sprites/fruits.png"),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/crouchattack1 ${p}.png`, 4),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/upattack0 ${p}.png`, 7),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/sideattack0 ${p}.png`, 6),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/slide ${p}.png`, 1),
      loadLayeredStrip(
        ["base", "hair", "arm", "l-arm"],
        (p) => `sprites/vernan/wallslide ${p}.png`,
        2,
      ),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/airdodge ${p}.png`, 3),
      loadLayeredStrip(["base", "hair", "legs"], (p) => `sprites/vernan/attack1 ${p}.png`, 8),
      loadStrip(assets, "sprites/vernan/attack1 air-legs.png", 8),
      loadStrip(assets, "sprites/vernan special attack.png", 5),
      loadStrip(assets, "sprites/vernan air special attack.png", 5),
      loadStrip(assets, "sprites/shield player.png", 4),
      loadStrip(assets, "sprites/shield attack.png", SWORD_ATTACK_FRAMES),
      loadStrip(assets, "sprites/shield crouch attack.png", SWORD_ATTACK_FRAMES),
      loadStrip(assets, "sprites/flint attack.png", SWORD_ATTACK_FRAMES),
      loadStrip(assets, "sprites/flint crouch attack.png", SWORD_ATTACK_FRAMES),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/getup ${p}.png`, 1),
      loadLayeredStrip(["base", "hair"], (p) => `sprites/vernan/grabbed ${p}.png`, 4),
      Promise.all(
        (["base", "hair"] as const).map((part) =>
          loadStrip(assets, `sprites/vernan/item ${part}.png`, 1),
        ),
      ),
    ]);

    keyblockStrip = keyblock;
    keyblockConnectorStrip = keyblockConn;
    pedestalBmp = pedestal;
    killExplosionBmp = killExplosion;
    electricShockStrip = electricShock;
    if (shopSheet) shopKeeperFrames = await loadShopKeeperFrames(shopSheet);
    if (soulSheet) hudSprites.soulHeartFrames = await sliceHudStrip(soulSheet, 2);
    if (blackSheet) hudSprites.blackHeartFrames = await sliceHudStrip(blackSheet, 2);
    hudSprites.subweaponFrame = subweaponFrame;
    if (hudSprites.subweaponFrame) {
      hudSprites.subweaponInner = innerBoxFrom0000feBorder(hudSprites.subweaponFrame, 1);
    }
    if (statsSheet) hudSprites.statFrames = await sliceHudStrip(statsSheet, 3);
    if (swordSheet) hudSprites.swordPickup = await slicePickupCell(swordSheet);

    for (const kind of [
      PickupKind.HEART,
      PickupKind.KEY,
      PickupKind.COIN_1,
      PickupKind.COIN_5,
      PickupKind.COIN_10,
    ]) {
      const file = pickupSpriteFile(kind);
      const bmp = await loadImageSafe(assets, `sprites/${file}`);
      if (bmp) pickupBitmaps.set(file, bmp);
      const collectFile = pickupCollectSpriteFile(kind);
      const collectBmp = await loadImageSafe(assets, `sprites/${collectFile}`);
      if (collectBmp) pickupCollectStrips.set(kind, collectBmp);
    }
    await Promise.all(
      HIT_VFX_PRELOAD_KINDS.map(async (kind) => {
        const bmp = await loadImageSafe(assets, `sprites/${hitVfxSpriteFile(kind)}`);
        if (bmp) hitVfxSprites.set(kind, bmp);
      }),
    );

    playerSprites.attack0 = attack0;
    playerSprites.airAttack0 = airAttack0;
    playerSprites.pluck = pluck;
    playerSprites.throwCarry = throwCarry;
    playerSprites.throwCarryAir = throwCarryAir;
    fruitCarrySprite = fruit;
    playerSprites.headbandCrouchAttack = headbandCrouch;
    playerSprites.headbandUpAttack = headbandUp;
    playerSprites.headbandSideAttack = headbandSide;
    playerSprites.slide = slide;
    playerSprites.wallSlide = wallSlide;
    playerSprites.airDodge = airDodge;
    playerSprites.heavyAttack = heavyAttack;
    playerSprites.heavyAttackAirLegs = heavyAttackAirLegs;
    playerSprites.specialAttack = specialAttack;
    playerSprites.airSpecialAttack = airSpecialAttack;
    playerSprites.shieldPlayer = shieldPlayer;
    playerSprites.shieldAttack = shieldAttack;
    playerSprites.crouchShieldAttack = crouchShieldAttack;
    playerSprites.flintSword = flintSword;
    playerSprites.crouchFlintSword = crouchFlintSword;
    playerSprites.getup = getup;
    playerSprites.grabbed = grabbed;
    const itemComposite = await compositeBodyStrip(itemLayers);
    playerSprites.itemPose =
      itemComposite?.image ?? (await loadImageSafe(assets, "sprites/vernan item.png"));
  };

  /** Spawn kinds whose strips are already decoded (skip on later floors). */
  const loadedEnemyKinds = new Set<EnemySpawnKind>();
  const ensuredItemGameplayArt = new Set<string>();
  let runtimeManifestPaths: string[] | null = null;
  let costumeLayersFile: Awaited<ReturnType<typeof loadCostumeLayers>> | null = null;
  let costumeDrawConfig: CostumeDrawConfig | null = null;
  let coreCombatSpritesLoaded = false;
  let levelTransitionLoaded = false;

  const ensureRuntimeManifestPaths = async (): Promise<string[]> => {
    if (runtimeManifestPaths && runtimeManifestPaths.length > 0) return runtimeManifestPaths;
    const manifest = await assets.loadJson<{ files?: { path: string }[] }>("runtime-manifest.json");
    runtimeManifestPaths = (manifest.files ?? []).map((f) => f.path);
    if (runtimeManifestPaths.length === 0) {
      throw new Error("runtime-manifest.json has no files[] — run npm run rebuild-manifest");
    }
    return runtimeManifestPaths;
  };

  const loadLevelTransitionStrip = async (): Promise<void> => {
    if (levelTransitionLoaded && playerSprites.levelTransition) return;
    const levelTransLayers = await Promise.all(
      LEVEL_TRANSITION_BODY_PARTS.map((part) =>
        loadStrip(assets, `sprites/vernan/leveltransition ${part}.png`, LEVEL_TRANS_SHEET_FRAMES),
      ),
    );
    playerSprites.levelTransition =
      (await compositeBodyStrip(levelTransLayers)) ??
      (await loadStrip(assets, "sprites/vernan/level transition.png", LEVEL_TRANS_SHEET_FRAMES));
    levelTransitionLoaded = true;
  };

  const loadEnemyKindSprites = async (kinds: ReadonlySet<EnemySpawnKind>): Promise<void> => {
    const needed = [...kinds].filter((k) => !loadedEnemyKinds.has(k));
    if (needed.length === 0) return;

    const tasks: Promise<void>[] = [];

    const need = (k: EnemySpawnKind) => needed.includes(k);

    if (need("crawler")) {
      tasks.push(
        loadStrip(assets, "sprites/crawler.png", CRAWLER_FRAMES).then((s) => {
          enemySprites.crawler = s;
        }),
      );
    }
    if (need("mouse")) {
      tasks.push(
        (async () => {
          const [mouse, mouseHurt] = await Promise.all([
            loadStrip(assets, "sprites/mouse.png", MOUSE_FRAMES),
            loadStrip(assets, "sprites/mouse hurt.png", MOUSE_FRAMES),
          ]);
          enemySprites.mouse = mouse;
          enemySprites.mouseHurt = mouseHurt;
        })(),
      );
    }
    if (need("penisman")) {
      tasks.push(
        (async () => {
          const [penisman, penisBullet, penisBulletDie] = await Promise.all([
            loadStrip(assets, "sprites/penisman.png", PENISMAN_FRAMES),
            loadImageSafe(assets, "sprites/penis bullet.png"),
            loadImageSafe(assets, "sprites/penis bullet die.png"),
          ]);
          enemySprites.penisman = penisman;
          penisBulletBmp = penisBullet;
          penisBulletDieBmp = penisBulletDie;
        })(),
      );
    }
    if (need("golden_roach")) {
      tasks.push(
        (async () => {
          const [walk, fly] = await Promise.all([
            loadStrip(assets, "sprites/golden roach2.png", GOLDEN_ROACH_WALK_FRAMES),
            loadStrip(assets, "sprites/golden roach2 fly.png", GOLDEN_ROACH_FLY_FRAMES),
          ]);
          enemySprites.goldenRoachWalk = walk;
          enemySprites.goldenRoachFly = fly;
        })(),
      );
    }
    if (need("jack_blue")) {
      tasks.push(
        (async () => {
          const [jackBlue, jackBlueShield, jackBlueBone] = await Promise.all([
            loadStrip(assets, "sprites/jack blue.png", JACK_BLUE_FRAMES),
            loadStrip(assets, "sprites/jack blue shield.png", JACK_BLUE_FRAMES),
            loadImageSafe(assets, "sprites/bone.png"),
          ]);
          enemySprites.jackBlue = jackBlue;
          enemySprites.jackBlueShield = jackBlueShield;
          jackBlueBoneBmp = jackBlueBone;
        })(),
      );
    }
    if (need("rolling_head")) {
      tasks.push(
        loadStrip(assets, "sprites/rolling head cc.png", ROLLING_HEAD_FRAMES).then((s) => {
          enemySprites.rollingHead = s;
        }),
      );
    }
    if (need("multilimber")) {
      tasks.push(
        (async () => {
          const [body, head, eye] = await Promise.all([
            loadStrip(assets, "sprites/multilimber body.png", MULTILIMBER_FRAMES),
            loadStrip(assets, "sprites/multilimber head.png", MULTILIMBER_FRAMES),
            loadStrip(assets, "sprites/multilimber eye.png", MULTILIMBER_FRAMES),
          ]);
          enemySprites.multilimberBody = body;
          enemySprites.multilimberHead = head;
          enemySprites.multilimberEye = eye;
        })(),
      );
    }
    if (need("possessed")) {
      tasks.push(
        (async () => {
          await loadPossessedRig(assets);
          const possessedFrames = Math.max(1, Math.floor(64 / POSSESSED_PART_W));
          const [possessed, shinyPossessed, possessedBullet, possessedBulletDie] = await Promise.all([
            loadStrip(assets, "sprites/bosses/possessed.png", possessedFrames),
            loadStrip(assets, "sprites/bosses/shiny possessed.png", possessedFrames),
            loadImageSafe(assets, "sprites/bosses/possessed bullet.png"),
            loadImageSafe(assets, "sprites/bosses/possessed bullet die.png"),
          ]);
          enemySprites.possessed = possessed;
          enemySprites.shinyPossessed = shinyPossessed;
          possessedBulletBmp = possessedBullet;
          possessedBulletDieBmp = possessedBulletDie;
        })(),
      );
    }
    if (need("nephilim")) {
      tasks.push(
        (async () => {
          await loadNephilimRig(assets);
          const [nephilim, nephilimHealFx] = await Promise.all([
            loadStrip(assets, "sprites/bosses/nephilim.png", 7),
            loadImageSafe(assets, "sprites/FX enemy heal.png"),
          ]);
          enemySprites.nephilim = nephilim;
          enemySprites.nephilimHealFx = nephilimHealFx;
        })(),
      );
    }

    await Promise.all(tasks);
    for (const k of needed) loadedEnemyKinds.add(k);
  };

  const loadItemLinkedExtras = async (itemIds: readonly string[]): Promise<void> => {
    const ids = new Set(itemIds);
    const tasks: Promise<void>[] = [];

    if (ids.has("GEM_SWORD") && !playerSprites.gemSword) {
      tasks.push(
        (async () => {
          const [gemSword, crouchGemSword] = await Promise.all([
            loadStrip(assets, "sprites/gem sword attack.png", SWORD_ATTACK_FRAMES),
            loadStrip(assets, "sprites/gem sword crouch attack.png", SWORD_ATTACK_FRAMES),
          ]);
          playerSprites.gemSword = gemSword;
          playerSprites.crouchGemSword = crouchGemSword;
        })(),
      );
    }
    if (ids.has("STICK") && !playerSprites.stickSword) {
      tasks.push(
        (async () => {
          const [stickSword, crouchStickSword] = await Promise.all([
            loadStrip(assets, "sprites/stick attack.png", SWORD_ATTACK_FRAMES),
            loadStrip(assets, "sprites/stick crouch attack.png", SWORD_ATTACK_FRAMES),
          ]);
          playerSprites.stickSword = stickSword;
          playerSprites.crouchStickSword = crouchStickSword;
        })(),
      );
    }
    if (ids.has("LEMON") && !playerSprites.lemonIdle) {
      tasks.push(
        (async () => {
          const [lemonIdle, lemonCrouch, lemonTurn, lemonWalk, lemonJump, lemonClimb, lemonShot] =
            await Promise.all([
              loadImageSafe(assets, "sprites/vernan idle lemon.png"),
              loadImageSafe(assets, "sprites/vernan crouch lemon.png"),
              loadImageSafe(assets, "sprites/vernan turn lemon.png"),
              loadStrip(assets, "sprites/vernan walk lemon.png", VERNAN_WALK_FRAMES),
              loadStrip(assets, "sprites/vernan jump lemon.png", VERNAN_JUMP_FRAMES),
              loadStrip(assets, "sprites/vernan climb lemon.png", VERNAN_CLIMB_FRAMES),
              loadStrip(assets, "sprites/lemon shot.png", 1),
            ]);
          playerSprites.lemonIdle = lemonIdle;
          playerSprites.lemonCrouch = lemonCrouch;
          playerSprites.lemonTurn = lemonTurn;
          playerSprites.lemonWalk = lemonWalk;
          playerSprites.lemonJump = lemonJump;
          playerSprites.lemonClimb = lemonClimb;
          lemonShotStrip = lemonShot;
        })(),
      );
    }
    if (ids.has("FRISBEE") && !frisbeeStrip) {
      tasks.push(
        loadStrip(assets, "sprites/DKC-style/frisbee3d.png", FrisbeeProjectile.ANIM_FRAME_COUNT).then(
          (s) => {
            frisbeeStrip = s;
          },
        ),
      );
    }
    if (ids.has("FLINT") && !fireStrip) {
      tasks.push(
        loadStrip(assets, "sprites/fire.png", 4).then((s) => {
          fireStrip = s;
        }),
      );
    }
    if ((ids.has("PSYCHIC_SPOON") || ids.has("PSYCHIC")) && !psychicFireStrip) {
      tasks.push(
        loadStrip(assets, "sprites/psychic fire.png", 4).then((s) => {
          psychicFireStrip = s;
        }),
      );
    }
    if (ids.has("LIL_POSSESSED") && !lilPossessedFriendBmp) {
      tasks.push(
        (async () => {
          const [friend, bullet, die, smoke] = await Promise.all([
            loadImageSafe(assets, "sprites/lil possessed friend.png"),
            loadImageSafe(assets, "sprites/lil possessed bullet.png"),
            loadImageSafe(assets, "sprites/lil possessed bullet die.png"),
            loadImageSafe(assets, "sprites/smoke.png"),
          ]);
          lilPossessedFriendBmp = friend;
          lilPossessedBulletBmp = bullet;
          lilPossessedBulletDieBmp = die;
          if (!smokeBmp) smokeBmp = smoke;
        })(),
      );
    }
    if (ids.has("LIL_MINER") && !lilMinerFriendBmp) {
      tasks.push(
        loadImageSafe(assets, "sprites/lil miner friend.png").then((bmp) => {
          lilMinerFriendBmp = bmp;
        }),
      );
    }
    if (ids.has("WHIP") && !whipPartBmp) {
      tasks.push(
        loadImageSafe(assets, "sprites/whip part.png").then((bmp) => {
          whipPartBmp = bmp;
        }),
      );
    }

    await Promise.all(tasks);

    // Pickup / HUD item art for every resolved floor item.
    await Promise.all(
      [...ids].map(async (id) => {
        if (!itemCatalog) return;
        try {
          await ensureItemArt(itemCatalog.def(id).spriteFileName);
        } catch {
          /* unknown id */
        }
      }),
    );
  };

  const ensureCostumeBundleForFolders = async (folders: ReadonlySet<string>): Promise<void> => {
    if (folders.size === 0 && costumeBundle) return;
    try {
      const manifestPaths = await ensureRuntimeManifestPaths();
      if (!costumeLayersFile) {
        costumeLayersFile = await loadCostumeLayers(assets.url("data/costume_layers.json"));
      }
      if (!costumeDrawConfig) {
        costumeDrawConfig = await CostumeDrawConfig.load(() =>
          assets.loadJson("data/costume_slots.json"),
        );
      }
      if (costumeBundle) {
        await costumeBundle.artCache.ensureFolders(
          assets,
          costumeLayersFile,
          costumeDrawConfig,
          manifestPaths,
          folders,
        );
        return;
      }
      const bodyLibrary = await VernanBodyLibrary.load(assets, manifestPaths);
      const artCache = await CostumeArtCache.load(
        assets,
        costumeLayersFile,
        costumeDrawConfig,
        manifestPaths,
        { folders },
      );
      if (bodyLibrary.hasIdle) {
        costumeBundle = {
          bodyLibrary,
          artCache,
          drawConfig: costumeDrawConfig,
          layersFile: costumeLayersFile,
        };
      } else {
        console.warn(
          "[vernan] costume bundle skipped: Vernan body idle art missing from runtime-manifest",
        );
      }
    } catch (err) {
      console.warn(
        "[vernan] costume bundle failed to load (layered costumes disabled). " +
          "Ensure public/assets/runtime-manifest.json exists (npm run rebuild-manifest).",
        err,
      );
    }
  };

  const costumeFoldersForItemIds = (itemIds: readonly string[]): Set<string> => {
    const folders = new Set<string>();
    const layers = costumeLayersFile ?? costumeBundle?.layersFile;
    if (!layers) return folders;
    for (const id of itemIds) {
      const folder = folderForCostumeId(layers, id);
      if (folder) folders.add(folder);
    }
    return folders;
  };

  const ownedCostumeItemIds = (): string[] => {
    if (!costumeLayersFile && !costumeBundle?.layersFile) return [];
    const layers = costumeLayersFile ?? costumeBundle!.layersFile;
    const out: string[] = [];
    for (const layer of layers.layers) {
      if (player.inventory.stacksOf(layer.itemId) > 0) out.push(layer.itemId);
    }
    return out;
  };

  /**
   * Load sprites required by the current session dungeon (spawn kinds + resolved items).
   * Incremental: skips kinds / folders already loaded.
   */
  const loadSpritesForSessionDungeon = async (s: RoomSession): Promise<void> => {
    bootStatus = "Loading floor sprites…";
    const kinds = uniqueEnemySpawnKinds(s.dungeon);
    const floorItemIds = eagerlyResolveFloorItems(s, player.stats.luck);
    const itemIds = [...new Set([...floorItemIds, ...ownedCostumeItemIds()])];

    // Need costume_layers before folder resolution on first call.
    if (!costumeLayersFile) {
      try {
        costumeLayersFile = await loadCostumeLayers(assets.url("data/costume_layers.json"));
      } catch {
        costumeLayersFile = null;
      }
    }

    const folders = costumeFoldersForItemIds(itemIds);

    await Promise.all([
      loadEnemyKindSprites(kinds),
      loadItemLinkedExtras(itemIds),
      ensureCostumeBundleForFolders(folders),
      ensureFloorSheets(s.dungeon.floorOrdinal),
      (async () => {
        if (!bgRegistry) return;
        roomMathBackgroundPresetId = assignRoomMathBackgroundPresets(s.dungeon.layout, bgRegistry);
        await Promise.all(
          roomMathBackgroundPresetId.map((_, roomId) => ensureRoomBackground(roomId)),
        );
      })(),
    ]);
  };

  /** Boot-only: Vernan combat + HUD + level-transition (always needed before play). */
  const loadCoreCombatSprites = async (): Promise<void> => {
    if (coreCombatSpritesLoaded) return;
    await loadFirstRoomSprites();
    await loadFirstFloorSprites();
    await loadLevelTransitionStrip();
    coreCombatSpritesLoaded = true;
  };

  void (async () => {
    try {
      bootStatus = "Loading data…";
      const catalog = await ItemCatalog.load(assets);
      try {
        const cuesRaw = await assets.loadJson("data/vernan_anim_cues.json");
        VernanAnimCueRuntime.load(VernanAnimCueSheet.fromJson(cuesRaw));
      } catch {
        VernanAnimCueRuntime.load(VernanAnimCueSheet.empty());
      }
      gamePalette = await GameColorPalette.load(assets);
      gamePaletteRef = gamePalette;
      kCandyVision.bindPalette(gamePalette);

      // Preset metadata only — PNG decode deferred (start room has no math background).
      bgRegistry = await BackgroundPresetRegistry.load(assets, { loadSprites: false });
      roomMathBackgroundPresetId = assignRoomMathBackgroundPresets(dungeon.layout, bgRegistry);

      const runItemPoolLocal = new RunItemPool();
      const decks = new PedestalItemDecks(catalog, runItemPoolLocal, BigInt(seed));
      itemCatalog = catalog;
      pedestalDecks = decks;
      runItemPool = runItemPoolLocal;

      try {
        tilesetProject = await TilesetProject.load(assets);
        sheetAtlas = new SheetAtlas(tilesetProject);
        const floor1Sheet = tilesetProject.primarySheetIdForFloor(1);
        await sheetAtlas.loadSheets(assets, [floor1Sheet]);
        tileWorldRenderer = new TileWorldRenderer(sheetAtlas, tilesetProject);
        bossDoorLayout = resolveBossDoorLayout(tilesetProject);
        dungeon = buildDungeon(BigInt(seed), 1, 0, tilesetProject);
        if (bgRegistry) {
          roomMathBackgroundPresetId = assignRoomMathBackgroundPresets(
            dungeon.layout,
            bgRegistry,
          );
        }
        enrichDungeonArt(dungeon, tilesetProject, contentSeedsOf(dungeon));
      } catch {
        tilesetProject = null;
        sheetAtlas = null;
        tileWorldRenderer = null;
        bossDoorLayout = null;
      }

      await loadCoreCombatSprites();

      session = createSession(dungeon, catalog, decks);
      floorOrdinal = dungeon.floorOrdinal;
      miniMapState = createMiniMapState(dungeon.layout.roomCount());

      await loadSpritesForSessionDungeon(session);

      applyRoomAndSpawn(session, 0, SpawnKind.INITIAL, player);
      mountDeferredRoomPickups(session.dungeon.rooms[session.roomId]!, worldPickups);
      mountShopWorldPickups(session, worldPickups, player.stats.luck);
      revealMiniMapForRoom(session.dungeon.layout, session.roomId, miniMapState);
      playerWasOnGround = player.onGround;
      snapCameraToPlayer(session);
    } catch (err) {
      bootError = err instanceof Error ? err.message : String(err);
      reportUnknownCrash(err, "boot");
    }
  })();

  async function ensureItemArt(rel: string): Promise<ImageBitmap | null> {
    const cached = itemBitmaps.get(rel);
    if (cached) return cached;
    try {
      const bmp = await assets.loadImage(`sprites/items/${rel}`);
      itemBitmaps.set(rel, bmp);
      return bmp;
    } catch {
      return null;
    }
  }

  /** Pickup art + costume folder + weapon/familiar extras for an acquired / shown item. */
  async function ensureItemGameplayArt(itemId: string): Promise<void> {
    if (!itemId || ensuredItemGameplayArt.has(itemId)) return;
    ensuredItemGameplayArt.add(itemId);
    if (!itemCatalog) return;
    try {
      await ensureItemArt(itemCatalog.def(itemId).spriteFileName);
    } catch {
      /* unknown */
    }
    await loadItemLinkedExtras([itemId]);
    if (!costumeLayersFile) {
      try {
        costumeLayersFile = await loadCostumeLayers(assets.url("data/costume_layers.json"));
      } catch {
        return;
      }
    }
    const folder = folderForCostumeId(costumeLayersFile, itemId);
    if (folder) await ensureCostumeBundleForFolders(new Set([folder]));
  }

  function cameraBoundsFor(s: RoomSession) {
    const room = s.dungeon.rooms[s.roomId]!;
    return resolveCameraScrollBounds(
      room.map,
      s.dungeon.layout,
      s.roomId,
      room,
      s.dungeon.secretSeams,
      seamAnimPlayableScrollOverride.current,
    );
  }

  function grantKCandyOnFirstAcquire(): void {
    if (kCandyUsesRemaining <= 0) {
      kCandyUsesRemaining = K_CANDY_MAX_USES;
    }
  }

  function tickKCandySystems(dt: number): void {
    if (kCandyHealSequence.isActive()) {
      player.tickCosmeticTimers(dt);
    }
    kCandyVision.tick(dt);
    if (!kCandyHealSequence.isActive()) return;
    const finished = kCandyHealSequence.tick(dt, () => {
      itemPickupHost.playPickupCollectFxAtPlayer(PickupKind.HEART, 1);
    });
    kCandyHudRedDisplayed = kCandyHealSequence.displayedRed();
    if (finished) {
      player.health.healFull();
      player.health.grantSoulHeartsFilled(1);
      kCandyHudRedDisplayed = -1;
      const roomId = session?.roomId ?? 0;
      const runSeed = session?.dungeon.runSeed ?? BigInt(seed);
      const visionSeed =
        runSeed ^
        BigInt(kCandyForgetHud.totalUses()) * 0xc011ee11n ^
        BigInt(roomId) * 0x9e3779b9n;
      kCandyVision.beginAfterHeal(visionSeed, kCandyForgetHud.warpIntensity());
    }
  }

  /** Hard snap (spawn / room swap / SEAM-ANIM). Java resetCameraForRoomSpawn. */
  function snapCameraToPlayer(s: RoomSession): void {
    const b = cameraBoundsFor(s);
    const room = s.dungeon.rooms[s.roomId]!;
    const ay = player.cameraAnchorY();
    let ax: number;
    if (
      usesTierOneCamera(
        room.map,
        s.dungeon.layout,
        s.roomId,
        room,
        s.dungeon.secretSeams,
      )
    ) {
      ax =
        b.minAnchorX <= b.maxAnchorX
          ? (b.minAnchorX + b.maxAnchorX) * 0.5
          : b.minAnchorX;
    } else {
      ax = player.cameraAnchorX();
    }
    camera.reset(
      Math.max(b.minAnchorX, Math.min(b.maxAnchorX, ax)),
      Math.max(b.minAnchorY, Math.min(b.maxAnchorY, ay)),
    );
  }

  /** Soft chase when sim advances; hard snap when frozen. */
  function followCamera(s: RoomSession, soft: boolean): void {
    if (!soft) {
      camera.follow(player.cameraAnchorX(), player.cameraAnchorY(), currentMap(s), {
        bounds: cameraBoundsFor(s),
      });
      return;
    }

    const map = currentMap(s);
    const room = s.dungeon.rooms[s.roomId]!;
    const viewWorldH = WORLD_VIEWPORT_H / CAMERA_ZOOM;
    const ax = player.cameraAnchorX();
    const ay = player.cameraAnchorY();

    let ladderTxForCam = -1;
    const dungeonLadderTx = room.ladderColumnTx;
    const ascendTx = s.bossAscendLadderTx[s.roomId] ?? -1;
    if (dungeonLadderTx >= 0 && player.overlapsLadderColumn(map, dungeonLadderTx)) {
      ladderTxForCam = dungeonLadderTx;
    } else if (ascendTx >= 0 && player.overlapsLadderColumn(map, ascendTx)) {
      ladderTxForCam = ascendTx;
    }

    let ladderColumnValid =
      ladderTxForCam >= 0 && player.climbing && player.overlapsLadderColumn(map, ladderTxForCam);
    let ladderHighRow = -1;
    let ladderLowRow = -1;
    if (ladderColumnValid) {
      ladderHighRow = highestLadderRow(map, ladderTxForCam);
      ladderLowRow = lowestLadderRow(map, ladderTxForCam);
      if (ladderHighRow < 0 || ladderLowRow < 0) ladderColumnValid = false;
    }

    const focusR = CAMERA_ENEMY_FOCUS_RADIUS_TILES * TILE_SIZE;
    const rsq = focusR * focusR;
    let focusMin = ax;
    let focusMax = ax;
    let enemiesInFocus = 0;
    for (const e of s.enemies) {
      if (e.isDead()) continue;
      const er = e.rect();
      const ecx = er.x + er.w * 0.5;
      const ecy = er.y + er.h * 0.5;
      const dx = ecx - ax;
      const dy = ecy - ay;
      if (dx * dx + dy * dy <= rsq) {
        enemiesInFocus++;
        focusMin = Math.min(focusMin, ecx);
        focusMax = Math.max(focusMax, ecx);
      }
    }

    let ladderEnemyBelowExtraWorld = 0;
    if (ladderColumnValid && ladderTxForCam >= 0) {
      const ladderCx = (ladderTxForCam + 0.5) * TILE_SIZE;
      const feetY = player.y + player.h;
      const belowExtra = CAMERA_LADDER_ENEMY_BELOW_EXTRA_FRAC * viewWorldH;
      const maxDx = CAMERA_LADDER_ENEMY_BELOW_MAX_X_WORLD;
      for (const e of s.enemies) {
        if (e.isDead()) continue;
        if (!enemyIsOnGround(e)) continue;
        const er = e.rect();
        const ecx = er.x + er.w * 0.5;
        if (Math.abs(ecx - ladderCx) > maxDx) continue;
        if (er.y + er.h <= feetY + 4) continue;
        ladderEnemyBelowExtraWorld = Math.max(ladderEnemyBelowExtraWorld, belowExtra);
      }
    }

    const softIn: CameraFollowInput = {
      vx: player.vx,
      vy: player.vy,
      facing: player.facing,
      onGround: player.onGround,
      wasOnGround: playerWasOnGround,
      climbing: player.climbing,
      inputUp: input.up,
      inputDown: input.down,
      ladderColumnValid,
      ladderHighRow,
      ladderLowRow,
      viewWorldH,
      tileSize: TILE_SIZE,
      focusMinX: focusMin,
      focusMaxX: focusMax,
      enemyFocusCount: enemiesInFocus,
      ladderEnemyBelowExtraWorld,
    };
    camera.follow(ax, ay, map, {
      bounds: cameraBoundsFor(s),
      dt: FIXED_DT,
      soft: softIn,
    });
  }

  function clearWeaponProjectiles(): void {
    flintFires.length = 0;
    smokeClouds.length = 0;
    afterimageGhosts.length = 0;
    lemonProjectiles.length = 0;
    backpackWeaponSwitch.reset();
  }

  function onBackpackSubweaponSwitched(): void {
    psychicSpoon.clearTelekinesis(brickChunks);
    player.dropCarryForSubweaponSwitch();
    player.resetSubweaponAnim();
  }

  function applyBackpackPrimarySwitch(steps: number): void {
    player.inventory.cycleBackpackPrimary(steps);
    applySwordProfileIfPresent();
    wireFlintIgniteCallback();
  }

  function applyBackpackSubweaponSwitch(steps: number): void {
    onBackpackSubweaponSwitched();
    player.inventory.cycleBackpackSubweapon(steps);
  }

  function tickBackpackWeaponSwitch(): void {
    if (!session) return;
    const inv = player.inventory;
    if (!inv.hasBackpack()) {
      backpackWeaponSwitch.reset();
      return;
    }
    if (input.backpackPrimarySwitchPressed) {
      input.consumeBackpackPrimarySwitch();
      if (BackpackWeaponSwitch.canApplyNow(player)) {
        applyBackpackPrimarySwitch(1);
      } else {
        backpackWeaponSwitch.addPendingPrimaryCycle();
      }
    }
    if (input.backpackSubweaponSwitchPressed) {
      input.consumeBackpackSubweaponSwitch();
      if (BackpackWeaponSwitch.canApplyNow(player)) {
        applyBackpackSubweaponSwitch(1);
      } else {
        backpackWeaponSwitch.addPendingSubweaponCycle();
      }
    }
    if (BackpackWeaponSwitch.canApplyNow(player)) {
      const primaryPending = backpackWeaponSwitch.pendingPrimaryCyclesCount();
      if (primaryPending > 0) {
        applyBackpackPrimarySwitch(primaryPending);
        backpackWeaponSwitch.clearPendingPrimary();
      }
      const subPending = backpackWeaponSwitch.pendingSubweaponCyclesCount();
      if (subPending > 0) {
        applyBackpackSubweaponSwitch(subPending);
        backpackWeaponSwitch.clearPendingSubweapon();
      }
    }
  }

  function spawnFlintFireAtEnemy(enemy: CombatEnemy): void {
    const r = enemy.rect();
    const fw = 16;
    const fh = 16;
    const fx = r.x + r.w * 0.5 - fw * 0.5;
    const fy = r.y + r.h - fh;
    const startVx = player.facing >= 0 ? 66 : -66;
    const gemStacks = player.inventory.stacksOf("GEM_SWORD") > 0;
    flintFires.push(
      new FlintFire(fx, fy, fw, fh, startVx, -52, gemStacks ? onFlintFireDamagedEnemy : null),
    );
  }

  function onFlintFireDamagedEnemy(e: CombatEnemy): void {
    if (player.inventory.stacksOf("GEM_SWORD") > 0) {
      setGemKillSource(e, "flint_fire");
      trySpawnGemHitCoin(e, true);
    }
  }

  function trySpawnGemHitCoin(enemy: CombatEnemy, flintFireDualProc: boolean): void {
    if (player.inventory.stacksOf("GEM_SWORD") <= 0) return;
    if (flintFireDualProc && player.inventory.stacksOf("FLINT") <= 0) return;
    if (Math.random() >= GEM_SWORD_HIT_COIN_CHANCE) return;
    spawnGemCoinAtEnemy(enemy, PickupKind.COIN_1);
  }

  function trySpawnGemKillCoin(enemy: CombatEnemy): void {
    if (player.inventory.stacksOf("GEM_SWORD") <= 0) return;
    const src = gemKillSource(enemy);
    if (src !== "sword" && src !== "flint_fire") return;
    if (Math.random() >= GEM_SWORD_KILL_COIN_CHANCE) return;
    spawnGemCoinAtEnemy(enemy, rollRoomClearCoinKind(Math.random));
  }

  function spawnGemCoinAtEnemy(enemy: CombatEnemy, kind: PickupKind): void {
    const r = enemy.rect();
    const feetCx = r.x + r.w * 0.5;
    const feetY = r.y + r.h;
    worldPickups.push(WorldPickup.createFromBreakable(kind, feetCx, feetY, Math.random));
  }

  function spawnSmokeAtEnemy(enemy: CombatEnemy): void {
    const fw = smokeBmp?.width ?? 16;
    const fh = smokeBmp?.height ?? 16;
    const r = enemy.rect();
    const sx = r.x + r.w * 0.5 - fw * 0.5;
    const sy = r.y + r.h * 0.5 - fh * 0.5;
    const dmg = player.stats.outgoingDamage() / 3;
    smokeClouds.push(
      new SmokeCloud(sx, sy, fw, fh, dmg, player.facing >= 0 ? 8 : -8),
    );
  }

  function spawnAfterimageGhost(snap: AfterimageSpawnSnapshot): void {
    for (const g of afterimageGhosts) {
      if (g.isActive()) g.beginReplaceFade();
    }
    afterimageGhosts.push(new AfterimageGhost(snap));
    while (afterimageGhosts.length > AfterimageGhost.MAX_ON_SCREEN) {
      afterimageGhosts.shift();
    }
  }


  function snapFamiliarsThroughRoomTransition(): void {
    const px = player.x + player.w * 0.5;
    const py = player.y + player.h * 0.5;
    const { newPossessed, newMiners } = familiarTrail.syncStacks(
      player.inventory.stacksOf("LIL_POSSESSED"),
      player.inventory.stacksOf("LIL_MINER"),
      { x: px, y: py },
      () => new LilPossessed(px, py),
      () => new LilMiner(px, py),
    );
    familiarTrail.snapToPlayer(px, py, player.facing);
    void (async () => {
      for (const f of newPossessed) await f.loadRig(assets);
      for (const m of newMiners) await m.loadRig(assets);
    })();
  }

  function tickFamiliarSystems(map: TileMap): void {
    if (!session) return;
    const px = player.x + player.w * 0.5;
    const py = player.y + player.h * 0.5;
    const { newPossessed, newMiners } = familiarTrail.syncStacks(
      player.inventory.stacksOf("LIL_POSSESSED"),
      player.inventory.stacksOf("LIL_MINER"),
      { x: px, y: py },
      () => new LilPossessed(px, py),
      () => new LilMiner(px, py),
    );
    void (async () => {
      for (const f of newPossessed) await f.loadRig(assets);
      for (const m of newMiners) await m.loadRig(assets);
    })();
    if (familiarTrail.totalFamiliars() === 0) {
      familiarTrail.clearTrail();
      familiarTrail.consumeAttackFireEdge(
        player.attackPhase !== 0 || player.disc.isHeavyActive(),
      );
      return;
    }
    familiarTrail.pushLead(px, py, player.facing);
    const fireEdge = familiarTrail.consumeAttackFireEdge(
      player.attackPhase !== 0 || player.disc.isHeavyActive(),
    );
    let nearest = { x: px + (player.facing >= 0 ? 1 : -1) * 1000, y: py };
    let best = Infinity;
    for (const e of session.enemies) {
      if (e.isDead()) continue;
      const r = e.damageReceivePose();
      const cx = r.x + r.w * 0.5;
      const cy = r.y + r.h * 0.5;
      const d = (cx - px) * (cx - px) + (cy - py) * (cy - py);
      if (d < best) {
        best = d;
        nearest = { x: cx, y: cy };
      }
    }
    familiarTrail.forEachSlot(player.facing, (kind, instanceIndex, follow) => {
      if (kind === "LIL_POSSESSED") {
        const f = familiarTrail.lilPossessed[instanceIndex];
        if (!f) return;
        f.update(FIXED_DT, follow.x, follow.y, fireEdge, nearest.x, nearest.y, map);
        for (const b of f.bulletsCopy()) {
          const stacks = player.inventory.stacksOf("TAMIL_OM");
          const v = applyTamilOmAuraToBullet(stacks, px, py, b.x, b.y, b.vx, b.vy);
          b.vx = v.vx;
          b.vy = v.vy;
          for (const e of session!.enemies) {
            if (e.isDead()) continue;
            const hurt = e.damageReceivePose();
            if (b.x < hurt.x || b.x > hurt.x + hurt.w || b.y < hurt.y || b.y > hurt.y + hurt.h) {
              continue;
            }
            const strike = {
              damage: LIL_POSSESSED_BULLET_DAMAGE,
              freezeFrames: Math.max(1, Math.ceil(5 + LIL_POSSESSED_BULLET_DAMAGE)),
              projectileVelX: b.vx,
              projectileVelY: b.vy,
              knockKind: "lemon_shot" as const,
              debrisCenterWorldX: b.x,
              debrisCenterWorldY: b.y,
            };
            if (e.applyProjectileStrike(strike)) b.dead = true;
          }
        }
      } else {
        const m = familiarTrail.lilMiners[instanceIndex];
        if (!m) return;
        m.update(FIXED_DT, follow.x, follow.y, px);
        if (m.drainCoinThrow()) {
          const [cx, cy] = m.coinThrowOrigin();
          worldPickups.push(WorldPickup.createFromBreakable(PickupKind.COIN_1, cx, cy, Math.random));
        }
      }
    });
  }

  function wireFlintIgniteCallback(): void {
    if (player.inventory.stacksOf("FLINT") > 0) {
      player.setFlintIgniteCallback(spawnFlintFireAtEnemy);
    } else {
      player.setFlintIgniteCallback(null);
    }
    if (player.inventory.stacksOf("PACK_OF_SMOKES") > 0) {
      player.setSmokePuffCallback(spawnSmokeAtEnemy);
    } else {
      player.setSmokePuffCallback(null);
    }
    if (player.inventory.stacksOf("AFTERIMAGE") > 0) {
      player.setAfterimageSpawnHost(spawnAfterimageGhost);
    } else {
      player.setAfterimageSpawnHost(null);
    }
    if (player.inventory.stacksOf("GEM_SWORD") > 0) {
      player.setGemSwordHitCallback((e) => {
        setGemKillSource(e, "sword");
        trySpawnGemHitCoin(e, false);
      });
    } else {
      player.setGemSwordHitCallback(null);
    }
  }

  function applySwordProfileIfPresent(): void {
    if (!session) return;
    player.applySwordProfile(
      resolveSwordProfile(player.inventory, session.catalog),
      player.inventory.stacksOf("GEM_SWORD"),
      player.inventory.stacksOf("SHIELD"),
    );
  }

  function tryLemonStrikeTiles(bounds: Aabb): boolean {
    if (!session) return false;
    const map = currentMap(session);
    const x0 = Math.floor(bounds.x / TILE_SIZE);
    const x1 = Math.floor((bounds.x + bounds.w - 1e-5) / TILE_SIZE);
    const y0 = Math.floor(bounds.y / TILE_SIZE);
    const y1 = Math.floor((bounds.y + bounds.h - 1e-5) / TILE_SIZE);
    let any = false;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!map.isBreakableTile(tx, ty)) continue;
        const bx = tx * TILE_SIZE;
        const by = ty * TILE_SIZE;
        map.setTile(tx, ty, TILE_EMPTY);
        const snap = snapshotBreakableTile(
          map,
          tx,
          ty,
          session,
          sheetAtlas,
          tilesetProject,
          floorOrdinal,
          tileWorldRenderer,
        );
        spawnBreakableBrickChunks(bx, by, Math.random, brickChunks, 1, "#8a5a3a", snap);
        any = true;
      }
    }
    return any;
  }

  function tickFlintFiresAndLemonShots(map: TileMap): void {
    if (!session) return;
    const camView = camera.viewRect();
    for (const ff of flintFires) {
      ff.update(FIXED_DT, map, session.enemies, FlintFire.FRAME_DURATION_SEC);
    }
    for (let i = flintFires.length - 1; i >= 0; i--) {
      if (flintFires[i]!.isDissipated()) flintFires.splice(i, 1);
    }
    for (const sc of smokeClouds) {
      sc.update(FIXED_DT, session.enemies, SmokeCloud.FRAME_DURATION_SEC);
    }
    for (let i = smokeClouds.length - 1; i >= 0; i--) {
      if (smokeClouds[i]!.isDissipated()) smokeClouds.splice(i, 1);
    }
    for (let i = afterimageGhosts.length - 1; i >= 0; i--) {
      const g = afterimageGhosts[i]!;
      if (g.tickReplaceFade()) {
        afterimageGhosts.splice(i, 1);
        continue;
      }
      if (!g.isActive()) continue;
      for (const e of session.enemies) {
        if (e.isDead() || g.alreadyHit(e)) continue;
        if (!e.intersectsMeleePose?.(g.hitboxPose) && !e.intersectsAttack(g.hitboxPose.bounds())) continue;
        const strike = {
          damage: g.damage,
          freezeFrames: Math.max(1, Math.ceil(5 + g.damage)),
          attackerX: g.originX,
          attackerW: g.attackerWidth,
          facing: g.facing,
          knockKind: g.knockbackKind,
        };
        if (e.applyWeaponStrike(strike)) {
          g.markHit(e);
          player.applySwordHitItemProcsPublic(e);
        }
      }
    }
    for (const lp of lemonProjectiles) {
      lp.update(FIXED_DT, map, camView, tryLemonStrikeTiles);
      lp.applyHits(session.enemies);
    }
    for (let i = lemonProjectiles.length - 1; i >= 0; i--) {
      if (!lemonProjectiles[i]!.isAlive()) lemonProjectiles.splice(i, 1);
    }
  }

  const loop = new GameLoop({
    update: () => {
      setCrashContext({ seed, floorReached: floorOrdinal });
      if (input.debugTogglePressed) debug = !debug;
      if (!session) return;
      if (dungeonRestartInProgress) return;

      // Java: Enter toggles pause (Esc web UX); HUD II button same. Clear hardware so Z/X don't stick.
      // Skip while dead or item-pickup overlay (Java !itemPickupOverlayActive).
      const wantPauseToggle =
        !submitDialogOpen &&
        !loginDialogOpen &&
        !player.health.isDead &&
        !pickupOverlay.isActive() &&
        (input.pauseTogglePressed || pauseButtonTogglePending);
      pauseButtonTogglePending = false;
      if (wantPauseToggle) {
        paused = !paused;
        softPointerControls.clear();
        clearCirclePad();
        input.clearHardwareState();
      }

      if (
        !submitDialogOpen &&
        !loginDialogOpen &&
        pauseLoginPending &&
        paused
      ) {
        pauseLoginPending = false;
        void beginLoginFromPause();
        return;
      }

      if (
        !submitDialogOpen &&
        !loginDialogOpen &&
        pauseViewBoardPending &&
        paused
      ) {
        pauseViewBoardPending = false;
        openLeaderboardView();
        return;
      }

      if (
        !submitDialogOpen &&
        !loginDialogOpen &&
        (input.submitRunPressed || pauseSubmitPending) &&
        (paused || player.health.isDead)
      ) {
        pauseSubmitPending = false;
        void beginSubmitAndQuit();
        return;
      }

      if (player.health.isDead) {
        if (deathViewBoardPending) {
          deathViewBoardPending = false;
          openLeaderboardView();
        }
        if (deathRestartPending) {
          const mode = deathRestartPending;
          deathRestartPending = null;
          requestRestart(mode);
          return;
        }
        paused = false;
      } else if (runReachedDeath) {
        leaderboardLocked = true;
      }

      const map = currentMap(session);

      if (player.health.isDead) {
        runReachedDeath = true;
        if (!submitDialogOpen && !loginDialogOpen && (input.jumpPressed || input.attackPressed)) {
          player.health.max = player.stats.maxHealth;
          player.health.refill();
          leaderboardLocked = true;
          applyRoomAndSpawn(session, session.roomId, SpawnKind.INITIAL, player);
          worldPickups.length = 0;
          frisbeeProjectiles.length = 0;
          warpOrbProjectiles.length = 0;
          clearWeaponProjectiles();
          player.resetSubweaponAnim();
          mountDeferredRoomPickups(session.dungeon.rooms[session.roomId]!, worldPickups);
          mountShopWorldPickups(session, worldPickups, player.stats.luck);
          playerWasOnGround = player.onGround;
          snapCameraToPlayer(session);
        } else {
          followCamera(session, false);
        }
        return;
      }

      if (paused) {
        return;
      }

      session.timeSec += FIXED_DT;
      session.pedestalBobPhase = tickPedestalBobPhase(session.pedestalBobPhase, FIXED_DT);

      for (const fx of explosions) fx.update(FIXED_DT);
      tickPendingJackDeathExplosions(pendingJackDeathExplosions, FIXED_DT, (cx, cy) => {
        explosions.push(new KillExplosion(cx, cy));
      });
      for (let i = explosions.length - 1; i >= 0; i--) {
        if (explosions[i]!.done) explosions.splice(i, 1);
      }
      for (const p of worldPickups) p.update(FIXED_DT, map);
      for (const fx of pickupCollectFx) fx.update(FIXED_DT);
      for (let i = pickupCollectFx.length - 1; i >= 0; i--) {
        if (pickupCollectFx[i]!.done) pickupCollectFx.splice(i, 1);
      }
      HitVfx.tickAll(hitVfxList);
      RisingDustFx.tickAll(risingDustFx, FIXED_DT);
      AutismDamageFloater.tickAll(autismDamageFloaters);
      tickKaleidoscopePedestalVisual(
        session,
        itemBitmaps,
        kaleidoscopePedestalSprite,
        () => kaleidoscopePedestalPrimedKey,
        (k) => {
          kaleidoscopePedestalPrimedKey = k;
        },
      );

      const tickBrickChunkSim = () => {
        psychicSpoon.tick(FIXED_DT, brickChunks, player, session!.enemies, camera, map);
      };

      // Item pickup overlay freezes combat sim (Java itemPickupOverlayActive).
      if (pickupOverlay.isActive()) {
        pickupOverlay.tick(FIXED_DT);
        hudEconomy.tick(player.stats.money, player.stats.keys);
        subweaponCooldowns.tick(FIXED_DT);
        tickBrickChunkSim();
        followCamera(session, false);
        return;
      }

      hudEconomy.tick(player.stats.money, player.stats.keys);
      subweaponCooldowns.tick(FIXED_DT);
      tickKCandySystems(FIXED_DT);
      if (kCandyHealSequence.isActive()) {
        for (let i = pickupCollectFx.length - 1; i >= 0; i--) {
          pickupCollectFx[i]!.update(FIXED_DT);
          if (pickupCollectFx[i]!.done) pickupCollectFx.splice(i, 1);
        }
        followCamera(session, false);
        return;
      }

      // Seam open strip freezes Vernan/enemies (Java activeSeamOpenAnim).
      if (
        tickSeamOpenAnim(
          activeSeamOpenAnim,
          seamAnimPlayableScrollOverride,
          session.dungeon.layout,
          session.dungeon.rooms,
          session.roomId,
          session.dungeon.secretSeams,
          camera,
          map,
        )
      ) {
        tickBrickChunkSim();
        return;
      }

      const roomBeforeTransition = session.roomId;
      const refreshRoomArtAndCamera = () => {
        const s = session!;
        floorOrdinal = s.dungeon.floorOrdinal;
        void ensureFloorSheets(floorOrdinal);
        void ensureRoomBackground(s.roomId);
        if (tilesetProject) {
          enrichDungeonArt(s.dungeon, tilesetProject, contentSeedsOf(s.dungeon));
          resyncRoomEnemies(s, player);
        }
        if (sheetAtlas && tilesetProject && tileWorldRenderer) {
          tileWorldRenderer.syncSheets(sheetAtlas, tilesetProject);
        }
        if (bgRegistry) {
          roomMathBackgroundPresetId = assignRoomMathBackgroundPresets(
            s.dungeon.layout,
            bgRegistry,
          );
          void ensureRoomBackground(s.roomId);
        }
        playerWasOnGround = player.onGround;
        snapCameraToPlayer(s);
        renderFacing = player.facing;
        turnAnimFramesLeft = 0;
      };
      const onRoomSwapped = () => {
        const s = session!;
        finishSeamOpenAnimInstant(
          activeSeamOpenAnim,
          seamAnimPlayableScrollOverride,
          s.dungeon.layout,
          s.dungeon.rooms,
        );
        if (isRoomTransitionActive(s.transition) && roomBeforeTransition !== s.roomId) {
          persistRoomBrickChunks(s, roomBeforeTransition, [...brickChunks]);
        }
        brickChunks.length = 0;
        frisbeeProjectiles.length = 0;
        warpOrbProjectiles.length = 0;
        clearWeaponProjectiles();
        worldPickups.length = 0;
        pickupCollectFx.length = 0;
        hitVfxList.length = 0;
        risingDustFx.length = 0;
        possessedHead.clear();
        player.resetSubweaponAnim();
        player.dropCarryForSubweaponSwitch();
        const prevRoom = roomBeforeTransition;
        if (prevRoom !== s.roomId) {
          roomPersistedIceBlocks.set(prevRoom, [...iceBlocks]);
          gardeningGlovesSupport?.onRoomChange(prevRoom, s.roomId);
        }
        iceBlocks.length = 0;
        iceBlocks.push(...(roomPersistedIceBlocks.get(s.roomId) ?? []));
        lastFrozenIce = null;
        psychicSpoon.reset();
        brickChunks.push(...loadRoomBrickChunks(s, s.roomId));
        // Fade-swap only (pending spawn set). Skip boss-ascend rebuild — stale pendingSpawnKind.
        if (isRoomTransitionActive(s.transition) && roomBeforeTransition !== s.roomId) {
          onRoomEnteredWithKeyblockBypass(
            s,
            roomBeforeTransition,
            s.roomId,
            s.transition.pendingSpawnKind,
          );
        }
        mountDeferredRoomPickups(s.dungeon.rooms[s.roomId]!, worldPickups);
        mountShopWorldPickups(s, worldPickups, player.stats.luck);
        resolveSuperSecretKCandyRefill(s, player.inventory.equippedSubweapon());
        refreshRoomArtAndCamera();
        // Teleport familiars with Vernan once her new-room position is final (Java snapFamiliarsToPlayer).
        snapFamiliarsThroughRoomTransition();
        revealMiniMapForRoom(s.dungeon.layout, s.roomId, miniMapState);
      };
      const ascendHooks = {
        onFloorApplied: () => {
          finishSeamOpenAnimInstant(
            activeSeamOpenAnim,
            seamAnimPlayableScrollOverride,
            session!.dungeon.layout,
            session!.dungeon.rooms,
          );
          brickChunks.length = 0;
          frisbeeProjectiles.length = 0;
          warpOrbProjectiles.length = 0;
          clearWeaponProjectiles();
          worldPickups.length = 0;
          pickupCollectFx.length = 0;
          hitVfxList.length = 0;
        risingDustFx.length = 0;
          possessedHead.clear();
          player.resetSubweaponAnim();
          psychicSpoon.reset();
          session!.roomPersistedBrickChunks = new Array(
            session!.dungeon.layout.roomCount(),
          ).fill(null);
          mountDeferredRoomPickups(session!.dungeon.rooms[session!.roomId]!, worldPickups);
          mountShopWorldPickups(session!, worldPickups, player.stats.luck);
          miniMapState = createMiniMapState(session!.dungeon.layout.roomCount());
          refreshRoomArtAndCamera();
          snapFamiliarsThroughRoomTransition();
          revealMiniMapForRoom(session!.dungeon.layout, session!.roomId, miniMapState);

          const ascendSession = session!;
          void loadSpritesForSessionDungeon(ascendSession)
            .then(() => {
              markLevelAscendFloorSpritesReady(ascendSession.transition);
            })
            .catch((err) => {
              console.warn("[vernan] next-floor sprite load failed", err);
              markLevelAscendFloorSpritesReady(ascendSession.transition);
            });
        },
        screenAnchor: (p: Player, cam: WorldCamera) => ({
          feetY: Math.round(CAMERA_ZOOM * p.spriteFeetWorldY() + cam.ty),
          centerX: Math.round(CAMERA_ZOOM * (p.x + p.w * 0.5) + cam.tx),
        }),
        tileset: tilesetProject,
      };

      // Fade / door-pose / ascend blackout freezes gameplay (Java transitionPhase != NONE).
      // Camera holds until swap; resetCameraForRoomSpawn runs in refreshRoomArtAndCamera.
      if (tickSessionRoomTransition(session, player, input, camera, onRoomSwapped, ascendHooks)) {
        tickBrickChunkSim();
        return;
      }

      // Keyblock unlock freeze (Java keyblockGameplayFreezeSeal early return).
      if (session.keyblocks.freezeSeal != null) {
        tickKeyblockSeals(session.keyblocks, session.roomId, map, player, input);
        tickBrickChunkSim();
        followCamera(session, false);
        return;
      }

      // Ladder before door (Java order); may start fade (incl. boss ascend cinematic).
      if (tryLadderTransition(session, player, input, camera)) {
        tickBrickChunkSim();
        return;
      }

      if (tryDoorTransition(session, player, input)) {
        tickBrickChunkSim();
        return;
      }

      playerWasOnGround = player.onGround;
      ItemEffects.tickPlugBonus(player.stats);
      if (session) {
        player.stats.applyItemPassives(player.inventory, session.catalog);
        ShieldBreakerCombat.setStacks(player.inventory.stacksOf("SHIELD_BREAKER"));
      }
      tickBackpackWeaponSwitch();
      applySwordProfileIfPresent();
      wireFlintIgniteCallback();
      const pedestalPlatforms = pedestalBmp
        ? pedestalPlatformRects(collectRoomPedestals(session))
        : null;
      const crawlerHatStacks = player.inventory.stacksOf("CRAWLER_HAT");
      CrawlerHatRiding.primeMountedCrawler(crawlerHatStacks, player, input, session.enemies);
      const crawlerDecks = CrawlerHatRiding.crawlerDeckPlatforms(session.enemies, crawlerHatStacks);
      const mergedPlatforms = CrawlerHatRiding.mergePlatformDecks(pedestalPlatforms, crawlerDecks);
      const crawlerMount = CrawlerHatRiding.findMountedCarrier(player, session.enemies);
      player.crawlerHatBlockJump = CrawlerHatRiding.blocksPlayerJump(player, input, crawlerMount);
      followCamera(session, true);
      const camViewPre = camera.viewRect();
      const seeRPre = seeRadiusForRun(player.inventory.stacksOf("HOODIE") > 0, camViewPre);
      const playerSnapPre = {
        cx: player.x + player.w * 0.5,
        cy: player.y + player.h * 0.5,
        vx: player.vx,
        vy: player.vy,
        hurtbox: player.hurtbox(),
      };
      const grabStruggleMash =
        player.isGrabHeld() &&
        (input.jump ||
          input.attack ||
          input.subweapon ||
          input.up ||
          input.wasPressed("ArrowLeft") ||
          input.wasPressed("KeyA") ||
          input.wasPressed("ArrowRight") ||
          input.wasPressed("KeyD") ||
          input.wasPressed("ArrowDown") ||
          input.wasPressed("KeyS"));
      for (const e of session.enemies) {
        if (e instanceof Possessed) {
          e.setCameraView(camViewPre);
          e.applyVision(playerSnapPre, seeRPre);
        } else if (e instanceof Nephilim) {
          e.setCameraView(camViewPre);
          e.applyVision(playerSnapPre, seeRPre);
          e.setGrabStruggleMashing(grabStruggleMash);
        } else if (e instanceof Penisman) {
          e.setCameraView(camViewPre);
        } else if (e instanceof JackBlue) {
          e.setCameraView(camViewPre);
          e.applyVision(playerSnapPre, seeRPre);
        } else if (e instanceof Multilimber) {
          e.setIceFreezeHost({
            iceBlockEquipped: () => player.inventory.stacksOf("ICE_BLOCK") > 0,
          });
          e.setCameraView(camViewPre);
          e.applyVision(playerSnapPre.cx, playerSnapPre.cy, seeRPre, map);
        } else if (e instanceof GoldenRoach) {
          e.setCameraView(camViewPre);
          e.prepareVisionTick(map);
          e.applyVision(playerSnapPre.cx, playerSnapPre.cy, seeRPre);
        } else if (e instanceof Mouse) {
          e.applyVision(playerSnapPre, seeRPre);
        }
      }
      // Ice solids before enemy motion (Java GamePanel: ice tick → enemies → player).
      for (const block of iceBlocks) block.tick(FIXED_DT);
      tickEnemyPeerPhysics(session.enemies, map, player.x + player.w * 0.5, FIXED_DT);
      for (const e of session.enemies) {
        if (e instanceof Multilimber) {
          for (const req of e.drainPartIceSpawns()) {
            const block = spawnMultilimberPartIce(req, {
              body: enemySprites.multilimberBody,
              head: enemySprites.multilimberHead,
              eye: enemySprites.multilimberEye,
            });
            if (block) iceBlocks.push(block);
          }
        }
      }
      player.setIceBlockCollisionContext(iceBlocks, feetOnIce(player, iceBlocks));
      player.bindFrameCombatHooks({
        onMeleeHit: (e, strike, sword, vfx) => {
          const hurt = e.damageReceivePose();
          const contact = contactBetweenAabbs(sword, hurt);
          const kind =
            vfx === "shield_break"
              ? HitVfxKind.SHIELD_BREAK
              : vfx === "shield_block"
                ? HitVfxKind.SHIELD
                : vfx === "fallback"
                  ? HitVfxKind.FALLBACK
                  : resolvePlayerMeleeHitVfx(
                      player.swordVisualId(),
                      player.inventory,
                      false,
                      false,
                    );
          HitVfx.spawn(
            hitVfxList,
            kind,
            e,
            strike.contactWorldX ?? contact.x,
            strike.contactWorldY ?? contact.y,
            strike.freezeFrames,
            player.x + player.w * 0.5,
          );
        },
        onElectrocution: (e, strike, contact) => {
          HitVfx.spawn(
            hitVfxList,
            HitVfxKind.ELECTRIC,
            e,
            contact.x,
            contact.y,
            strike.freezeFrames,
            player.x + player.w * 0.5,
          );
        },
        tryWorldStrike: () => {
          const blockFreeze = applySwordBreakables({
            player,
            map,
            roomId: session!.roomId,
            rooms: session!.dungeon.rooms,
            seams: session!.dungeon.secretSeams,
            layout: session!.dungeon.layout,
            runSeed: session!.dungeon.runSeed,
            camera,
            brickChunks,
            worldPickups,
            project: tilesetProject,
            snapshotTile: (tx, ty) =>
              snapshotBreakableTile(
                map,
                tx,
                ty,
                session!,
                sheetAtlas,
                tilesetProject,
                floorOrdinal,
                tileWorldRenderer,
              ),
            snapshotDecoTile: (tileId) => {
              // Authored sheet only — deco must not remap to floor primarySheetId.
              return sheetAtlas?.snapshotTileId(tileId) ?? null;
            },
            activeSeamOpenAnim,
            seamAnimPlayableScrollOverride,
          });
          const iceFreeze = trySwordStrikeIce(player, iceBlocks, (block) => {
            const snap = snapshotIceHoldSprite(block);
            const payload = iceBlockPayload(snap, block.lootCopy(), block.mirrorSourceX);
            shatterIceBlockPayload(payload, block.x, block.y);
          });
          return Math.max(blockFreeze, iceFreeze);
        },
      });
      player.update(
        FIXED_DT,
        input,
        map,
        subweaponHost,
        mergedPlatforms,
        session.enemies,
        gardeningGlovesSupport,
      );
      player.bindFrameCombatHooks(null);
      CrawlerHatRiding.correctHullPenetration(player, session.enemies, crawlerHatStacks);
      const wallDust = player.disc.consumeWallSlideDustSpawn();
      if (wallDust) RisingDustFx.spawnStripPuff(risingDustFx, wallDust[0], wallDust[1]);
      const slideDust = player.disc.consumeSlideDustSpawn();
      if (slideDust) RisingDustFx.spawnStripPuff(risingDustFx, slideDust[0], slideDust[1]);
      const landDust = player.consumeLandingDustSpawn();
      if (landDust) {
        const puffCount = landDust[0];
        const behindX = landDust[1];
        const feetY = landDust[2];
        if (puffCount >= 2) {
          RisingDustFx.spawnStripPuff(risingDustFx, behindX - 5, feetY);
          RisingDustFx.spawnStripPuff(risingDustFx, behindX + 5, feetY);
        } else {
          RisingDustFx.spawnStripPuff(risingDustFx, behindX, feetY);
        }
      }
      gardeningGlovesSupport?.tick(FIXED_DT, session.enemies);
      tickFlintFiresAndLemonShots(map);
      if (player.consumeLandedThisTick() && session) {
        ItemEffects.onPlayerLanded(
          { stats: player.stats, landingLockFrames: player.landingLockFrames },
          player.inventory,
        );
        player.stats.applyItemPassives(player.inventory, session.catalog);
      }
      const headSwordEdge = possessedHead.consumeSwordActiveEdge(player.attackPhase);
      possessedHead.tick(FIXED_DT, player, map, session.enemies, headSwordEdge);
      tickBossDoorSealAnim(session);

      // Late keyblock tick — may start freeze mid-step (Java tickKeyblockSeals after combat FX).
      tickKeyblockSeals(session.keyblocks, session.roomId, map, player, input);
      if (session.keyblocks.freezeSeal != null) {
        tickBrickChunkSim();
        followCamera(session, false);
        return;
      }

      const nodeKind = session.dungeon.layout.room(session.roomId).kind;
      const upPressed = input.wasPressed("ArrowUp") || input.wasPressed("KeyW");
      const refillBuy = tryBuySuperSecretKCandyRefill(
        session,
        player,
        upPressed,
        player.inventory.equippedSubweapon(),
        () => {
          kCandyUsesRemaining = K_CANDY_MAX_USES;
        },
      );
      if (refillBuy) {
        hudEconomy.startCoinDrain(refillBuy.price, player.stats.money);
      } else if (nodeKind === RoomKind.SHOP) {
        ensureShopResolved(session, player.stats.luck);
        const pickupBuy = tryBuyShopPickups(session, player, upPressed, worldPickups);
        if (pickupBuy === "blocked") {
          // Up consumed; skip pedestal.
        } else if (pickupBuy) {
          hudEconomy.startCoinDrain(pickupBuy.price, player.stats.money);
          if (pickupBuy.kind === PickupKind.KEY) {
            hudEconomy.startResourceGain(0, 1, player.stats.money, player.stats.keys);
          }
          startMiniBuyOverlay(pickupBuy.kind, pickupBuy.price);
        } else {
          const bought = tryBuyShopPedestal(
            session,
            player,
            upPressed,
            itemPickupHost,
          );
          if (bought) {
            hudEconomy.startCoinDrain(bought.price, player.stats.money);
            if (bought.itemId === "KALEIDOSCOPE_EYE") ensureKaleidoscopePalette();
            if (bought.itemId === "K_CANDY") grantKCandyOnFirstAcquire();
            pickupOverlay.begin(bought.itemId, pickupOverlayBonusLine);
            pickupOverlayBonusLine = "";
            applySwordProfileIfPresent();
            void ensureItemGameplayArt(bought.itemId);
          }
        }
      } else {
        const collected = tryCollectPedestal(session, player, itemPickupHost);
        if (collected) {
          if (collected === "KALEIDOSCOPE_EYE") ensureKaleidoscopePalette();
          if (collected === "K_CANDY") grantKCandyOnFirstAcquire();
          pickupOverlay.begin(collected, pickupOverlayBonusLine);
          pickupOverlayBonusLine = "";
          applySwordProfileIfPresent();
          void ensureItemGameplayArt(collected);
        } else {
          const enemyLoot = tryCollectEnemyLootPedestal(session, player, itemPickupHost);
          if (enemyLoot) {
            pickupOverlay.begin(enemyLoot, pickupOverlayBonusLine);
            pickupOverlayBonusLine = "";
            applySwordProfileIfPresent();
            void ensureItemGameplayArt(enemyLoot);
          }
        }
      }

      tickMiniBuyOverlay();

      for (const id of player.inventory.ownedIds()) {
        void ensureItemArt(session.catalog.def(id).spriteFileName);
      }
      for (const id of hudWeaponItemIdsToPreload(player, session.catalog)) {
        void ensureItemArt(session.catalog.def(id).spriteFileName);
      }

      if (pickupOverlay.isActive()) {
        followCamera(session, false);
        return;
      }

      const ped = activePedestal(session);
      if (ped?.itemId && !ped.collected) {
        void ensureItemGameplayArt(ped.itemId);
      }
      for (const sp of activeShopPedestals(session)) {
        if (sp.itemId && !sp.collected) {
          void ensureItemGameplayArt(sp.itemId);
        }
      }
      for (const ep of activeEnemyLootPedestals(session)) {
        if (ep.itemId && !ep.collected) {
          void ensureItemGameplayArt(ep.itemId);
        }
      }

      // Enemies already simulated before player.update; refresh camera for combat FX.
      followCamera(session, true);
      for (const e of session.enemies) {
        if (e instanceof Possessed) {
          processPossessedDeathChunks(e, enemySprites.possessed, enemySprites.shinyPossessed, brickChunks);
          for (const [ex, ey] of e.drainExplosionRequests()) {
            explosions.push(new KillExplosion(ex, ey));
          }
        } else if (e instanceof Nephilim) {
          const chunkBase = brickChunks.length;
          processNephilimDeathChunks(e, enemySprites.nephilim, brickChunks);
          for (let ci = chunkBase; ci < brickChunks.length; ci++) {
            const chunk = brickChunks[ci]!;
            if (chunk.bossDeathHead) e.registerDeathHeadChunk(chunk);
          }
          if (!e.isDead()) {
            e.tickDeathHeadLanding(FIXED_DT, map);
          }
        } else if (e instanceof JackBlue) {
          processJackBlueDeathChunks(e, enemySprites.jackBlue, brickChunks);
          for (const ex of e.drainDeathExplosionSpawns()) {
            pendingJackDeathExplosions.push({ cx: ex.cx, cy: ex.cy, delaySec: ex.delaySec });
          }
          if (!e.isDead()) {
            for (const req of e.drainBoneBreakRequests()) {
              spawnJackBlueBoneBreakChunks(req.cx, req.cy, jackBlueBoneBmp, brickChunks);
            }
          }
        } else if (e instanceof Multilimber) {
          for (const ex of e.drainExplosionSpawns()) {
            pendingJackDeathExplosions.push({ cx: ex.cx, cy: ex.cy, delaySec: ex.delaySec });
          }
        }
        maybeSpawnDeathFx(e);
      }
      tickBrickChunkSim();
      for (const f of frisbeeProjectiles) {
        f.update(FIXED_DT, map, session.enemies);
        f.applyHits(session.enemies);
      }
      for (let i = frisbeeProjectiles.length - 1; i >= 0; i--) {
        if (!frisbeeProjectiles[i]!.isAlive()) frisbeeProjectiles.splice(i, 1);
      }
      for (const w of warpOrbProjectiles) {
        w.update(FIXED_DT, map, pedestalPlatforms, session.enemies);
        w.applyHits(session.enemies);
      }
      for (let i = warpOrbProjectiles.length - 1; i >= 0; i--) {
        const w = warpOrbProjectiles[i]!;
        if (w.consumeTeleportPending()) {
          player.applyWarpOrbTeleport(
            w.centerWorldX(),
            w.feetWorldY(),
            w.landedOnStandable(),
            map,
            pedestalPlatforms,
          );
          snapCameraToPlayer(session);
          const body = player.collisionPoseAt(player.x, player.y).bounds();
          RisingDustFx.spawnBurst(risingDustFx, body.x + body.w * 0.5, body.y + body.h * 0.55, 8);
          warpOrbProjectiles.splice(i, 1);
        } else if (!w.isAlive()) {
          warpOrbProjectiles.splice(i, 1);
        }
      }
      collectWorldPickups(player, worldPickups, hudEconomy, pickupCollectFx);
      applyPenismanBulletHits(session, player);
      applyJackBlueBoneHits(session, player);
      tickFamiliarSystems(map);
      applyPossessedBulletHits(session, player);
      applyStickReflectedArcingBulletHits(session, player);
      lastFrozenIce = null;
      for (const e of session.enemies) maybeSpawnDeathFx(e);
      session.enemies = session.enemies.filter((e) => {
        if (!e.isDead()) return true;
        const r = e.rect();
        lastEnemyDeathFeetCenterX = r.x + r.w * 0.5;
        lastEnemyDeathFeetY = r.y + r.h;
        enemiesKilledThisRun++;
        enemiesKillDifficultyThisRun += enemyKillDifficulty(e);
        return false;
      });
      const roomId = session.roomId;
      const wasRoomCleared = session.roomCombatCleared[roomId];
      tryProcessRoomClear(session, player);
      if (!wasRoomCleared && session.roomCombatCleared[roomId]) {
        familiarTrail.notifyRoomCleared();
        grantRoomClearRewards({
          layout: session.dungeon.layout,
          roomId,
          floorOrdinal,
          runSeed: session.dungeon.runSeed,
          map,
          player,
          enemiesKilledThisRun,
          lastEnemyDeathFeetCenterX,
          lastEnemyDeathFeetY,
          iceBlocks,
          lastFrozenIce,
          worldPickups,
        });
      }
      tickTurnAnim(player);
    },
    render: () => {
      fb.clear("#0e1218");
      const g = fb.internalCtx;

      if (runtimeCrash) {
        g.fillStyle = "#1a222c";
        g.fillRect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);
        g.fillStyle = "#f0a0a0";
        g.font = "12px monospace";
        g.fillText("crashed — report sent (see Crashes page)", 16, 40);
        g.fillStyle = "#c8d2dc";
        g.fillText(runtimeCrash.slice(0, 72), 16, 58);
        g.fillStyle = "#12161c";
        g.fillRect(0, WORLD_VIEWPORT_H, INTERNAL_WIDTH, HUD_HEIGHT);
        fb.present();
        return;
      }

      if (!session) {
        g.fillStyle = "#1a222c";
        g.fillRect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);
        g.fillStyle = "#c8d2dc";
        g.font = "12px monospace";
        g.fillText(bootError ? `boot error: ${bootError}` : bootStatus, 16, 40);
        g.fillStyle = "#12161c";
        g.fillRect(0, WORLD_VIEWPORT_H, INTERNAL_WIDTH, HUD_HEIGHT);
        fb.present();
        return;
      }

      const map = currentMap(session);
      const node = session.dungeon.layout.room(session.roomId);
      const t = session.transition;
      const levelBlack = t.phase === TransitionPhase.LEVEL_LOAD_BLACK;
      const levelAscendFadeOut =
        t.phase === TransitionPhase.FADE_OUT && t.levelAscend.pending;

      if (levelBlack) {
        // Full framebuffer black + screen-space climb/strip (Java LEVEL_LOAD_BLACK).
        g.fillStyle = "#000000";
        g.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
        drawLevelAscendPlayerOverlay(g, t.levelAscend, playerSprites);
        fb.present();
        return;
      }

      g.save();
      g.beginPath();
      g.rect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);
      g.clip();

      const paintCamTx = camera.tx + player.blackHeartScreenShakeDeviceX() + player.heavyAttackScreenShakeDeviceX();
      const paintCamTy = camera.ty + player.blackHeartScreenShakeDeviceY() + player.heavyAttackScreenShakeDeviceY();
      const savedCamTx = camera.tx;
      const savedCamTy = camera.ty;
      camera.tx = paintCamTx;
      camera.ty = paintCamTy;

      // Black void behind world (Java setBackground BLACK); math bg fills boss/secret.
      g.fillStyle = "#000000";
      g.fillRect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);

      const paintKind = node.kind;
      if (
        bgRegistry &&
        roomKindUsesMathBackground(paintKind) &&
        session.roomId >= 0 &&
        session.roomId < roomMathBackgroundPresetId.length
      ) {
        const presetId = roomMathBackgroundPresetId[session.roomId];
        if (presetId) {
          const deco = session.dungeon.rooms[session.roomId]?.art?.decoStamps;
          const foregroundPropCells =
            deco && deco.length > 0
              ? new Set(deco.map((s) => bgDecoCellKey(s.tx, s.ty)))
              : null;
          drawRoomMathBackground(g, {
            registry: bgRegistry,
            presetId,
            camera: { tx: camera.tx, ty: camera.ty },
            timeSec: session.timeSec,
            map,
            foregroundPropCells,
            buffers: bgBuffers,
          });
        }
      }

      drawTiles(
        g,
        map,
        camera,
        session,
        sheetAtlas,
        tilesetProject,
        floorOrdinal,
        tileWorldRenderer,
        bossDoorLayout,
        keyblockStrip,
        keyblockConnectorStrip,
      );
      const room = session.dungeon.rooms[session.roomId]!;
      const art = room.art;
      const primarySheetId = art?.sheetId ?? tilesetProject?.primarySheetIdForFloor(floorOrdinal);
      drawAllSeeingEyeOverlays(g, {
        inventory: player.inventory,
        runSeed: session.dungeon.runSeed,
        roomId: session.roomId,
        map,
        deco: art?.decoStamps,
        seams: session.dungeon.secretSeams,
        camera,
        atlas: sheetAtlas,
        project: tilesetProject,
        tileWorld: tileWorldRenderer,
        bridge: art?.bridge ?? null,
        roomKind: room.kind,
        displaySalt: node.contentSeed,
        floorOrdinal,
        simTick: Math.floor(session.timeSec * 60),
        primarySheetId,
        doorDestByCell: destKindByDoorCell(session.dungeon.layout, session.roomId, room),
        contextThemeRules: art?.contextThemeRules ?? null,
        isHiddenShellBreakable: (tx, ty) => {
          const seams = session!.dungeon.secretSeams;
          if (!seams) return false;
          for (const seam of seams) {
            if (seam.isHiddenBreakable(session!.roomId, tx, ty)) return true;
          }
          return false;
        },
        pickupBitmaps,
        itemBitmaps,
        fruitSprite: fruitCarrySprite,
        catalog: session.catalog,
      } satisfies AllSeeingDrawContext);
      const preloadPedestalItem = (ped: ItemPedestal | null) => {
        if (ped?.itemId && !ped.collected) {
          void ensureItemGameplayArt(ped.itemId);
        }
      };
      preloadPedestalItem(activePedestal(session));
      if (node.kind === RoomKind.SHOP) {
        ensureShopResolved(session, player.stats.luck);
        for (const sp of activeShopPedestals(session)) preloadPedestalItem(sp);
      }
      for (const ep of activeEnemyLootPedestals(session)) preloadPedestalItem(ep);
      const kCandyRefillPed = activeSuperSecretKCandyRefill(session);
      preloadPedestalItem(kCandyRefillPed);
      drawPedestal(
        g,
        activePedestal(session),
        session,
        camera,
        pedestalBmp,
        itemBitmaps,
        kaleidoscopePedestalSprite,
      );
      if (node.kind === RoomKind.SHOP) {
        ensureShopResolved(session, player.stats.luck);
        for (const sp of activeShopPedestals(session)) {
          drawPedestal(
            g,
            sp,
            session,
            camera,
            pedestalBmp,
            itemBitmaps,
            kaleidoscopePedestalSprite,
          );
          if (!sp.collected && sp.itemId) {
            const box = pedestalItemAabb(sp);
            if (box) {
              const labelX = camera.worldToDeviceX(sp.anchorX);
              const labelY = camera.worldToDeviceY(box.y) - 4;
              drawShopPriceLabel(g, labelX, labelY, sp.priceCoins ?? SHOP_PEDESTAL_PRICE);
            }
          }
        }
        for (const p of worldPickups) {
          if (p.priceCoins <= 0) continue;
          const labelX = camera.worldToDeviceX(p.renderCenterX());
          const labelY = camera.worldToDeviceY(p.hitbox().y) - 4;
          drawShopPriceLabel(g, labelX, labelY, p.priceCoins);
        }
        const keeper = activeShopKeeper(session);
        if (keeper && shopKeeperFrames) {
          drawShopKeeper(
            g,
            keeper,
            shopKeeperFrames,
            camera,
            session.timeSec,
            player.x + player.w * 0.5,
            player.y + player.h * 0.5,
          );
        }
      }
      for (const ep of activeEnemyLootPedestals(session)) {
        drawPedestal(
          g,
          ep,
          session,
          camera,
          pedestalBmp,
          itemBitmaps,
          kaleidoscopePedestalSprite,
        );
      }
      if (kCandyRefillPed) {
        drawPedestal(
          g,
          kCandyRefillPed,
          session,
          camera,
          pedestalBmp,
          itemBitmaps,
          kaleidoscopePedestalSprite,
        );
        if (!kCandyRefillPed.collected && kCandyRefillPed.itemId) {
          const box = pedestalItemAabb(kCandyRefillPed);
          if (box) {
            const labelX = camera.worldToDeviceX(kCandyRefillPed.anchorX);
            const labelY = camera.worldToDeviceY(box.y) - 4;
            drawShopPriceLabel(g, labelX, labelY, kCandyRefillPed.priceCoins ?? K_CANDY_REFILL_PRICE);
          }
        }
      }
      for (const e of session.enemies) {
        const simTick = Math.floor(session.timeSec * 60);
        drawEnemy(g, e, camera, enemySprites, player, playerSprites, simTick, electricShockStrip);
        if (e instanceof Possessed) {
          drawPossessedBullets(g, e, camera, possessedBulletBmp, possessedBulletDieBmp);
        } else if (e instanceof Penisman) {
          drawPenismanBullets(g, e, camera, penisBulletBmp);
          drawPenisBulletDieFx(g, e, camera, penisBulletDieBmp);
        } else if (e instanceof JackBlue) {
          drawJackBlueBones(g, e, camera, jackBlueBoneBmp);
        }
      }
      if (player.inventory.stacksOf("AUTISM") > 0) {
        drawAutismEnemyHud(
          g,
          camera,
          session.enemies,
          autismDamageFloaters,
          INTERNAL_WIDTH,
          WORLD_VIEWPORT_H,
        );
      }
      drawPossessedHeadBullets(
        g,
        possessedHead,
        camera,
        CAMERA_ZOOM,
        lilPossessedBulletBmp ?? possessedBulletBmp,
        lilPossessedBulletDieBmp ?? possessedBulletDieBmp,
      );
      const psychicDash = psychicSpoon.dashTarget(brickChunks);
      drawBrickChunksFloatZBehindPlayer(
        g,
        brickChunks,
        player,
        camera,
        session.timeSec,
        psychicFireStrip,
        psychicDash,
      );
      for (const ff of flintFires) {
        drawFlintFire(g, ff, camera, fireStrip);
      }
      for (const sc of smokeClouds) {
        drawSmokeCloud(g, sc, camera, smokeBmp);
      }
      drawFamiliars(
        g,
        camera,
        familiarTrail,
        lilPossessedFriendBmp,
        lilMinerFriendBmp,
        lilPossessedBulletBmp,
      );
      if (!levelAscendFadeOut && !isPlayerGrabDrawEmbeddedInNephilim(player, session.enemies)) {
        const ownedPalette = mergeOwnedPalette(player.inventory, session.catalog);
        drawPlayer(
          g,
          player,
          camera,
          playerSprites,
          renderFacing,
          turnAnimFramesLeft > 0,
          session.transition.pose,
          pickupOverlay.isActive() ||
            miniBuyOverlayActive ||
            kCandyHealSequence.isActive(),
          costumeBundle,
          ownedPalette,
          whipPartBmp,
        );
        const carryThrown = gardeningGlovesSupport?.thrownProjectiles() ?? [];
        const heldCarry = player.carryPayload();
        const needsIceReflection =
          iceBlocks.length > 0 ||
          heldCarry?.kind === CarryKind.ICE_BLOCK ||
          carryThrown.some((p) => p.isAlive() && p.payload.kind === CarryKind.ICE_BLOCK);
        const iceReflectionBackbuffer = needsIceReflection ? captureBackbuffer(fb.internal) : null;
        drawCarryHeldAndThrown(
          g,
          camera,
          player,
          fruitCarrySprite,
          carryThrown,
          pickupBitmaps,
          itemBitmaps,
          session.catalog,
          iceReflectionBackbuffer,
        );
        drawIceBlocks(g, iceBlocks, camera, iceReflectionBackbuffer);
        if (pickupOverlay.isActive() && pickupOverlay.itemId) {
          const heldBmp = itemBitmaps.get(
            session.catalog.def(pickupOverlay.itemId).spriteFileName,
          );
          if (heldBmp) {
            drawPickupItemAbovePlayer(
              g,
              player,
              camera,
              heldBmp,
              playerSprites.itemPose?.height ?? 32,
            );
          }
        } else if (kCandyHealSequence.isActive()) {
          const kCandyBmp = itemBitmaps.get(session.catalog.def("K_CANDY").spriteFileName);
          if (kCandyBmp) {
            drawPickupItemAbovePlayer(
              g,
              player,
              camera,
              kCandyBmp,
              playerSprites.itemPose?.height ?? 32,
            );
          }
        }
        if (miniBuyOverlayActive) {
          drawMiniBuyPickupAbovePlayer(
            g,
            player,
            camera,
            miniBuyKind,
            pickupBitmaps,
            playerSprites.itemPose?.height ?? 32,
          );
        }
      }
      drawBrickChunksInFront(
        g,
        brickChunks,
        player,
        camera,
        session.timeSec,
        psychicFireStrip,
        psychicDash,
      );
      const warpOrbReflectionBackbuffer =
        warpOrbProjectiles.length > 0 ? captureBackbuffer(fb.internal) : null;
      for (const f of frisbeeProjectiles) {
        drawFrisbeeProjectile(g, f, camera, frisbeeStrip);
      }
      for (const w of warpOrbProjectiles) {
        drawWarpOrbProjectile(
          g,
          w,
          camera,
          itemBitmaps.get(session.catalog.def("WARP_ORB").spriteFileName) ?? null,
          warpOrbReflectionBackbuffer,
        );
      }
      for (const lp of lemonProjectiles) {
        drawLemonProjectile(g, lp, camera, lemonShotStrip);
      }
      drawRisingDustFx(g, risingDustFx, camera, dustSprite);
      drawHitVfx(g, hitVfxList, camera, hitVfxSprites);
      for (const p of worldPickups) drawWorldPickup(g, p, camera, pickupBitmaps);
      drawPickupCollectFx(g, pickupCollectFx, camera, pickupCollectStrips);
      for (const fx of explosions) {
        drawKillExplosion(g, fx, camera, killExplosionBmp);
      }
      drawRoomFade(g, session.transition, INTERNAL_WIDTH, WORLD_VIEWPORT_H);
      if (levelAscendFadeOut) {
        // Live world project during fade-out (Java snapLevelTransDrawPosition liveWorldProject).
        const liveFeet = Math.round(CAMERA_ZOOM * player.spriteFeetWorldY() + camera.ty);
        const liveCx = Math.round(CAMERA_ZOOM * (player.x + player.w * 0.5) + camera.tx);
        drawLevelAscendPlayerOverlay(g, t.levelAscend, playerSprites, liveFeet, liveCx);
      }
      if (debug) {
        drawPlayerHitbox(g, player, camera);
        for (const p of worldPickups) {
          drawHitboxPolygon(g, p.hitboxPose(), "#60e880", camera);
          drawHitboxPolygon(g, p.physicsHitboxPose(), "#60c8e8", camera);
        }
        for (const e of session.enemies) {
          drawAabb(g, e.damageReceivePose(), "#ff6688", camera);
        }
      }

      const boss = findLivingBoss(session.enemies);
      if (boss instanceof Possessed || boss instanceof Nephilim) {
        if (!boss.isDead() && !boss.isDying()) {
          const label =
            boss instanceof Possessed
              ? "POSSESSED"
              : bossKindLabel(BossKind.NEPHILIM);
          drawBossHpBar(g, boss.getHealth(), boss.getMaxHealth(), label);
        }
      }

      g.restore();

      camera.tx = savedCamTx;
      camera.ty = savedCamTy;

      const blackHeartOverlayAlpha = player.blackHeartOverlayAlpha();
      if (blackHeartOverlayAlpha > 0.001) {
        const overlayA = Math.min(
          255,
          Math.max(0, Math.round(255 * blackHeartOverlayAlpha)),
        );
        g.fillStyle = `rgba(0,0,0,${overlayA / 255})`;
        g.fillRect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);
      }

      // Java: pause overlay/menu before bottom HUD so the HUD band paints on top.
      if (paused) {
        drawPauseOverlay(g);
        pauseMenuHits = drawPauseMenu(
          g,
          player,
          session.catalog,
          itemBitmaps,
          hudSprites.swordPickup,
          currentRunSummary(),
          leaderboardLocked,
          isLoggedIn(),
        );
      } else {
        pauseMenuHits = {
          login: { x: 0, y: 0, w: 0, h: 0 },
          viewBoard: { x: 0, y: 0, w: 0, h: 0 },
          submit: { x: 0, y: 0, w: 0, h: 0 },
        };
      }

      for (const id of hudWeaponItemIdsToPreload(player, session.catalog)) {
        void ensureItemArt(session.catalog.def(id).spriteFileName);
      }

      // Geometry-only fisheye under smoke sprites (Java applySmokeHeatDistortion) — after world, before HUD.
      applySmokeHeatDistortionToBackbuffer(g, camera, smokeClouds, smokeBmp);

      drawBottomHud(
        g,
        player,
        session.catalog,
        itemBitmaps,
        hudSprites,
        hudEconomy,
        session.dungeon.layout,
        session.roomId,
        miniMapState,
        subweaponCooldowns,
        {
          paused,
          touchHeld: {
            up: input.up,
            left: input.left,
            down: input.down,
            right: input.right,
            jump: input.jump,
            attack: input.attack,
            sub: input.subweapon,
            dodge: input.shiftHeld,
            pause: paused,
          } satisfies TouchControlsHeld,
          kCandy: {
            forget: kCandyForgetHud,
            usesRemaining: kCandyUsesRemaining,
            hudRedDisplayed: kCandyHudRedDisplayed,
          },
        },
      );

      // Web-only circle pad (above HUD, left). Fades with k-candy touch-control forget.
      {
        const touchOp = kCandyForgetHud.opacity(KCandyForgetTarget.TOUCH_CONTROLS);
        drawCirclePad(g, computeCirclePadLayout(), circlePadDraw, touchOp);
      }

      if (debug && !pickupOverlay.isActive()) {
        g.fillStyle = "#6ec8ff";
        g.font = "10px monospace";
        g.fillText(
          `F3 fps ${fps} ups ${ups}  seed ${seed}  fl ${floorOrdinal}`,
          8,
          12,
        );
      }

      if (player.health.isDead) {
        deathMenuHits = drawDeathOverlay(g, currentRunSummary(), leaderboardLocked);
      } else {
        deathMenuHits = {
          submit: { x: 0, y: 0, w: 0, h: 0 },
          viewBoard: { x: 0, y: 0, w: 0, h: 0 },
          restartNew: { x: 0, y: 0, w: 0, h: 0 },
          retrySame: { x: 0, y: 0, w: 0, h: 0 },
        };
      }

      if (pickupOverlay.isActive()) {
        const overlayId = pickupOverlay.itemId;
        const overlayBmp =
          overlayId != null
            ? itemBitmaps.get(session.catalog.def(overlayId).spriteFileName) ?? null
            : null;
        pickupOverlay.draw(g, session.catalog, overlayBmp);
      }

      // Java GLOBAL_PALETTE_CLAMP — snap full backbuffer after HUD/overlays.
      if (gamePalette?.isLoaded) {
        gamePalette.applyToCanvas(g, INTERNAL_WIDTH, INTERNAL_HEIGHT);
      }
      if (
        player.inventory.stacksOf("KALEIDOSCOPE_EYE") > 0 &&
        kaleidoscopePalette.isReady()
      ) {
        kaleidoscopePalette.applyToCanvas(g, INTERNAL_WIDTH, INTERNAL_HEIGHT);
      }
      if (kCandyVision.isActive()) {
        kCandyVision.apply(g, INTERNAL_WIDTH, INTERNAL_HEIGHT);
      }

      fb.present();
    },
    onFpsUpdate: (f, u) => {
      fps = f;
      ups = u;
    },
    onFatalError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      runtimeCrash = msg;
      reportUnknownCrash(err, "gameloop");
      try {
        fb.clear("#0e1218");
        const g = fb.internalCtx;
        g.fillStyle = "#1a222c";
        g.fillRect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);
        g.fillStyle = "#f0a0a0";
        g.font = "12px monospace";
        g.fillText("crashed — report sent (see Crashes page)", 16, 40);
        g.fillStyle = "#c8d2dc";
        g.fillText(msg.slice(0, 72), 16, 58);
        g.fillStyle = "#12161c";
        g.fillRect(0, WORLD_VIEWPORT_H, INTERNAL_WIDTH, HUD_HEIGHT);
        fb.present();
      } catch {
        /* ignore secondary paint failures */
      }
    },
    endInputFrameAfterSimBatch: (ranAnyFixedSteps, lagSimFrozen) => {
      // Java GamePanel.endInputFrameAfterSimBatch: stash taps when sim skipped,
      // only flush edges after a batch that actually ran.
      if (!ranAnyFixedSteps || lagSimFrozen) {
        input.stashPressEdgesForSkippedSim();
        if (session && !player.health.isDead) {
          player.primeLagInputBuffers(input);
        }
      }
      if (ranAnyFixedSteps && !lagSimFrozen) {
        input.endFrame();
      }
    },
  });

  setCrashContext({ seed, floorReached: floorOrdinal });

  function tickTurnAnim(pl: Player): void {
    const cur = pl.facing >= 0 ? 1 : -1;
    const heelysGlideHold = pl.isHeelysGlidePoseHold();
    if (!pl.onGround || pl.climbing || pl.isAttacking()) {
      renderFacing = cur;
      turnAnimFramesLeft = 0;
      return;
    }
    if (turnAnimFramesLeft > 0) {
      if (!heelysGlideHold) {
        turnAnimFramesLeft--;
        if (turnAnimFramesLeft < TURN_POST_FLIP_FRAMES) {
          renderFacing = cur;
        }
        if (turnAnimFramesLeft === 0) renderFacing = cur;
      }
      return;
    }
    if (cur !== renderFacing) {
      if (!heelysGlideHold) {
        turnAnimFramesLeft = TURN_PRE_FLIP_FRAMES + TURN_POST_FLIP_FRAMES;
      }
    } else {
      renderFacing = cur;
    }
  }

  function maybeSpawnDeathFx(e: CombatEnemy): void {
    // Feet-centered explosions (Java). Crawler/Mouse wait until hitstun ends via takeCorpseExplosion.
    if (e instanceof JackBlue) {
      if (e.isDead() && !dyingFxStarted.has(e)) {
        dyingFxStarted.add(e);
        if (tryFreezeDeadEnemy(e)) {
          rollGemKillLootIntoIce(e);
          return;
        }
        e.prepareDeathFxIfNeeded();
        e.rollShieldDropOnDeath(
          player.hasShieldEquipped(),
          session!.dungeon.runSeed,
          session!.roomId,
        );
        const shieldDrop = e.drainShieldDropRequest();
        if (shieldDrop) {
          const map = currentMap(session!);
          const tx = Math.max(0, Math.min(map.width - 1, Math.floor(shieldDrop.anchorX / TILE_SIZE)));
          const groundTop = map.groundTopWorldYAtColumn(tx);
          addEnemyLootPedestal(
            session!,
            makeItemPedestal(shieldDrop.itemId, shieldDrop.anchorX, groundTop),
          );
        }
        trySpawnGemKillCoin(e);
      }
      return;
    }
    if (
      e instanceof Crawler ||
      e instanceof Mouse ||
      e instanceof Penisman ||
      e instanceof RollingHead ||
      e instanceof GoldenRoach
    ) {
      if (e.takeCorpseExplosion() && !dyingFxStarted.has(e)) {
        dyingFxStarted.add(e);
        if (tryFreezeDeadEnemy(e)) {
          rollGemKillLootIntoIce(e);
          return;
        }
        trySpawnGemKillCoin(e);
        const r = e.rect();
        explosions.push(new KillExplosion(r.x + r.w * 0.5, r.y + r.h));
      }
      return;
    }
    if (e instanceof Possessed) {
      if (e.suppressDeathExplosion()) return;
    }
    if (e instanceof Multilimber) {
      if (e.suppressDeathExplosion()) {
        if (e.isDead() && !dyingFxStarted.has(e)) {
          dyingFxStarted.add(e);
          if (tryFreezeDeadEnemy(e)) {
            rollGemKillLootIntoIce(e);
            return;
          }
          trySpawnGemKillCoin(e);
        }
        return;
      }
    }
    if (e instanceof Nephilim) {
      if (e.suppressDeathExplosion()) return;
    }
    if (e.isDead() && !dyingFxStarted.has(e)) {
      dyingFxStarted.add(e);
      if (tryFreezeDeadEnemy(e)) {
        rollGemKillLootIntoIce(e);
        return;
      }
      trySpawnGemKillCoin(e);
      const r = e.rect();
      explosions.push(new KillExplosion(r.x + r.w * 0.5, r.y + r.h));
    }
  }

  function reflectPenismanBulletForStick(b: PenismanBullet, pl: Player): void {
    const v = stickReflectedVelocity(
      b.centerX(),
      b.centerY(),
      b.vx,
      b.vy,
      pl.x + pl.w * 0.5,
      pl.y + pl.h * 0.5,
      pl.facing,
    );
    b.vx = v.vx;
    b.vy = v.vy;
    b.markStickReflected(ARCING_ENEMY_BULLET_PLAYER_DAMAGE);
  }

  function reflectPossessedBulletForStick(b: PossessedBullet, pl: Player): void {
    const v = stickReflectedVelocity(
      b.x,
      b.y,
      b.vx,
      b.vy,
      pl.x + pl.w * 0.5,
      pl.y + pl.h * 0.5,
      pl.facing,
    );
    b.vx = v.vx;
    b.vy = v.vy;
    b.stickReflected = true;
    b.stickReflectBaseDamage = ARCING_ENEMY_BULLET_PLAYER_DAMAGE;
    b.playerOverlapHandled = true;
  }

  function applyPenismanBulletHits(sess: RoomSession, pl: Player): void {
    for (const e of sess.enemies) {
      if (!(e instanceof Penisman) || e.isDead()) continue;
      for (const b of e.bulletsCopy()) {
        if (!b.alive || b.isStickReflected() || b.playerOverlapHandled()) continue;
        {
          const stacks = pl.inventory.stacksOf("TAMIL_OM");
          const v = applyTamilOmAuraToBullet(
            stacks,
            pl.x + pl.w * 0.5,
            pl.y + pl.h * 0.5,
            b.centerX(),
            b.centerY(),
            b.vx,
            b.vy,
          );
          b.vx = v.vx;
          b.vy = v.vy;
        }
        const res = pl.hitArcingEnemyBullet(b.damagePose(), b.centerX());
        if (res === "miss") continue;
        if (res === "stick_reflect") {
          reflectPenismanBulletForStick(b, pl);
          continue;
        }
        if (res === "shield_destroy") {
          b.kill();
          e.addBulletDieFx(b.centerX(), b.centerY());
          continue;
        }
        b.beginHitlagThenRemove(Math.max(0.12, 4 / 60));
        e.addBulletDieFx(b.centerX(), b.centerY());
      }
    }
  }

  function applyJackBlueBoneHits(sess: RoomSession, pl: Player): void {
    for (const e of sess.enemies) {
      if (!(e instanceof JackBlue) || e.isDead()) continue;
      for (const b of e.bonesCopy()) {
        if (!b.alive || b.playerOverlapHandled()) continue;
        const res = pl.hitArcingEnemyBullet(b.damagePose(), b.centerX());
        if (res === "miss") continue;
        spawnJackBlueBoneBreakChunks(b.centerX(), b.centerY(), jackBlueBoneBmp, brickChunks);
        b.markPlayerHit();
      }
    }
  }

  function applyPossessedBulletHits(sess: RoomSession, pl: Player): void {
    for (const e of sess.enemies) {
      if (!(e instanceof Possessed) || e.isDead()) continue;
      for (const b of e.bulletsCopy()) {
        if (b.dead || b.stickReflected || b.playerOverlapHandled) continue;
        {
          const stacks = pl.inventory.stacksOf("TAMIL_OM");
          const v = applyTamilOmAuraToBullet(
            stacks,
            pl.x + pl.w * 0.5,
            pl.y + pl.h * 0.5,
            b.x,
            b.y,
            b.vx,
            b.vy,
          );
          b.vx = v.vx;
          b.vy = v.vy;
        }
        const res = pl.hitArcingEnemyBullet(possessedBulletDamagePose(b), b.x);
        if (res === "miss") continue;
        if (res === "stick_reflect") {
          reflectPossessedBulletForStick(b, pl);
          continue;
        }
        if (res === "shield_destroy") {
          b.dead = true;
          e.addBulletDieFx(b.x, b.y);
          continue;
        }
        b.playerOverlapHandled = true;
        b.hitlagRemoveRemaining = Math.max(0.12, 4 / 60);
        e.addBulletDieFx(b.x, b.y);
      }
    }
  }

  function applyStickReflectedArcingBulletHits(sess: RoomSession, _pl: Player): void {
    for (const owner of sess.enemies) {
      if (owner instanceof Possessed) {
        for (const b of owner.bulletsCopy()) {
          if (b.dead || !b.stickReflected) continue;
          const damage =
            (b.stickReflectBaseDamage ?? ARCING_ENEMY_BULLET_PLAYER_DAMAGE) *
            STICK_REFLECT_DAMAGE_MULT;
          const pose = possessedBulletDamagePose(b);
          if (
            applyStickReflectedProjectileHit(sess, pose, damage, b.vx, b.vy, () => {
              b.dead = true;
            })
          ) {
            owner.addBulletDieFx(b.x, b.y);
          }
        }
      } else if (owner instanceof Penisman) {
        for (const b of owner.bulletsCopy()) {
          if (!b.alive || !b.isStickReflected()) continue;
          const damage = b.stickReflectEnemyDamage();
          const pose = b.damagePose();
          if (
            applyStickReflectedProjectileHit(sess, pose, damage, b.vx, b.vy, () => b.kill())
          ) {
            owner.addBulletDieFx(b.centerX(), b.centerY());
          }
        }
      }
    }
  }

  function applyStickReflectedProjectileHit(
    sess: RoomSession,
    pose: import("./collision/HitboxPose").HitboxPose,
    damage: number,
    vx: number,
    vy: number,
    killBullet: () => void,
  ): boolean {
    for (const e of sess.enemies) {
      if (e.isDead()) continue;
      if (!e.intersectsProjectile(pose)) continue;
      const strike: import("./combat/CombatMath").ProjectileStrike = {
        damage,
        freezeFrames: freezeFrames(damage, 0.35),
        projectileVelX: vx,
        projectileVelY: vy,
        knockKind: "contact_only",
      };
      e.applyProjectileStrike(strike);
      killBullet();
      return true;
    }
    return false;
  }

  loop.start();
  fb.canvas.focus({ preventScroll: true });

  return {
    get seed() {
      return seed;
    },
    getRunSummary: () => currentRunSummary(),
    destroy: () => {
      loop.stop();
      fb.canvas.removeEventListener("pointerdown", onTouchControlsPointerDown);
      fb.canvas.removeEventListener("pointermove", onTouchControlsPointerMove);
      fb.canvas.removeEventListener("pointerup", onTouchControlsPointerUp);
      fb.canvas.removeEventListener("pointercancel", onTouchControlsPointerCancel);
      fb.canvas.removeEventListener("lostpointercapture", onTouchControlsPointerUp);
      clearCirclePad();
      input.clearSoftKeys();
      input.detach();
      parent.replaceChildren();
    },
    focus: () => fb.canvas.focus({ preventScroll: true }),
  };
}

function currentMap(session: RoomSession): TileMap {
  return session.dungeon.rooms[session.roomId]!.map;
}

/** Grounded enemies for ladder-below camera nudge (Possessed is never grounded). */
function enemyIsOnGround(e: CombatEnemy): boolean {
  if (e instanceof Crawler || e instanceof Mouse || e instanceof Penisman || e instanceof JackBlue || e instanceof Multilimber) {
    return e.onGround;
  }
  if (e instanceof RollingHead) return e.onGround;
  if (e instanceof GoldenRoach) return e.isOnGround();
  if (e instanceof Nephilim) return e.isOnGround();
  return false;
}

function findLivingBoss(enemies: CombatEnemy[]): Possessed | Nephilim | undefined {
  for (const e of enemies) {
    if ((e instanceof Possessed || e instanceof Nephilim) && !e.isDead()) return e;
  }
  return undefined;
}

function contentSeedsOf(dungeon: { layout: { roomCount(): number; room(i: number): { contentSeed: bigint } } }): bigint[] {
  const n = dungeon.layout.roomCount();
  const out: bigint[] = [];
  for (let i = 0; i < n; i++) out.push(dungeon.layout.room(i).contentSeed);
  return out;
}

function drawTiles(
  g: CanvasRenderingContext2D,
  map: TileMap,
  camera: WorldCamera,
  session: RoomSession,
  atlas: SheetAtlas | null,
  project: TilesetProject | null,
  floor: number,
  tileWorld: TileWorldRenderer | null,
  bossDoor: BossDoorLayout | null,
  keyblockPrimary: SpriteStrip | null,
  keyblockConnector: SpriteStrip | null,
): void {
  const room = session.dungeon.rooms[session.roomId]!;
  const node = session.dungeon.layout.room(session.roomId);
  const art = room.art;
  const primarySheetId = art?.sheetId ?? project?.primarySheetIdForFloor(floor);
  const simTick = Math.floor(session.timeSec * 60);
  const doorDestByCell = destKindByDoorCell(
    session.dungeon.layout,
    session.roomId,
    room,
  );
  drawShellTiles(
    g,
    map,
    camera,
    atlas,
    (terrainId, dx, dy, dw, dh) => {
      g.fillStyle = tileColor(terrainId);
      if (terrainId === TILE_PLATFORM) {
        g.fillRect(dx, dy, dw, Math.max(2, Math.floor(dh * 0.25)));
      } else if (terrainId === TILE_LADDER) {
        g.fillRect(dx + Math.floor(dw * 0.3), dy, Math.floor(dw * 0.4), dh);
      } else {
        g.fillRect(dx, dy, dw, dh);
      }
    },
    {
      isSealed: (tx, ty) => isBossDoorCellSealed(session, tx, ty),
      bossDoorSealedTileId: bossDoor?.sealedTileId ?? null,
      isHiddenShellBreakable: (tx, ty) => {
        const seams = session.dungeon.secretSeams;
        if (!seams) return false;
        for (const seam of seams) {
          if (seam.isHiddenBreakable(session.roomId, tx, ty)) return true;
        }
        return false;
      },
      floorOrdinal: floor,
      primarySheetId,
      project,
      bridge: art?.bridge ?? null,
      roomKind: room.kind,
      displaySalt: node.contentSeed,
      decoStamps: art?.decoStamps,
      placedRoomObjects: art?.placedRoomObjects,
      simTick,
      tileWorld,
      doorDestByCell,
      contextThemeRules: art?.contextThemeRules ?? null,
    },
  );
  drawMapKeyblockTiles(g, map, camera, keyblockPrimary, keyblockConnector);
  drawKeyblockSealsWorld(
    g,
    camera,
    session.keyblocks,
    session.roomId,
    keyblockPrimary,
    keyblockConnector,
  );
}

function tickKaleidoscopePedestalVisual(
  session: RoomSession,
  itemBitmaps: Map<string, ImageBitmap>,
  sprite: KaleidoscopePedestalSprite,
  getPrimedKey: () => string,
  setPrimedKey: (k: string) => void,
): void {
  const candidates: ItemPedestal[] = [];
  const primary = activePedestal(session);
  if (primary) candidates.push(primary);
  for (const sp of activeShopPedestals(session)) candidates.push(sp);

  let found: ItemPedestal | null = null;
  for (const p of candidates) {
    if (p.itemId === "KALEIDOSCOPE_EYE" && !p.collected) {
      found = p;
      break;
    }
  }
  if (!found || !found.itemId) {
    if (sprite.isPrimed()) {
      sprite.clear();
      setPrimedKey("");
    }
    return;
  }
  const def = session.catalog.def(found.itemId);
  const bmp = itemBitmaps.get(def.spriteFileName);
  const key = `${session.roomId}:${found.itemId}:${found.anchorX}`;
  if (bmp && getPrimedKey() !== key) {
    const r = itemPickupRect(bmp.width, bmp.height);
    sprite.prime(
      bmp,
      r.sx,
      r.sy,
      r.sw,
      r.sh,
      session.dungeon.runSeed,
      session.roomId,
    );
    setPrimedKey(key);
  }
  if (sprite.isPrimed()) sprite.tick();
}

function collectRoomPedestals(session: RoomSession): ItemPedestal[] {
  const out: ItemPedestal[] = [];
  const primary = activePedestal(session);
  if (primary) out.push(primary);
  out.push(...activeShopPedestals(session));
  out.push(...activeEnemyLootPedestals(session));
  const refill = activeSuperSecretKCandyRefill(session);
  if (refill) out.push(refill);
  return out;
}

function drawPedestal(
  g: CanvasRenderingContext2D,
  p: ItemPedestal | null,
  session: RoomSession,
  camera: WorldCamera,
  pedestalBmp: ImageBitmap | null,
  itemBitmaps: Map<string, ImageBitmap>,
  kaleidoSprite: KaleidoscopePedestalSprite | null = null,
): void {
  if (!p) return;
  const pedTop = p.groundTop - PEDESTAL_DRAW_H;
  const pdx = camera.worldToDeviceX(p.anchorX - PEDESTAL_DRAW_W * 0.5);
  const pdy = camera.worldToDeviceY(pedTop);
  const pdw = Math.floor(CAMERA_ZOOM * PEDESTAL_DRAW_W);
  const pdh = Math.floor(CAMERA_ZOOM * PEDESTAL_DRAW_H);
  if (pedestalBmp) {
    g.imageSmoothingEnabled = false;
    g.drawImage(pedestalBmp, pdx, pdy, pdw, pdh);
  } else {
    g.fillStyle = "#6a5a48";
    g.fillRect(pdx, pdy, pdw, pdh);
  }

  if (p.collected || !p.itemId) return;
  const def = session.catalog.def(p.itemId);
  const bmp = itemBitmaps.get(def.spriteFileName);
  if (
    p.itemId === "KALEIDOSCOPE_EYE" &&
    kaleidoSprite?.isPrimed() &&
    bmp
  ) {
    const frame = kaleidoSprite.frame();
    if (frame) {
      drawPedestalFloatingItem(
        g,
        camera,
        p,
        session.pedestalBobPhase,
        frame,
        0,
        0,
        frame.width,
        frame.height,
      );
      return;
    }
  }
  if (bmp) {
    const r = itemPickupRect(bmp.width, bmp.height);
    drawPedestalFloatingItem(
      g,
      camera,
      p,
      session.pedestalBobPhase,
      bmp,
      r.sx,
      r.sy,
      r.sw,
      r.sh,
    );
  } else {
    const box = pedestalItemAabb(p);
    if (!box) return;
    const idx = camera.worldToDeviceX(box.x);
    const idy = camera.worldToDeviceY(box.y);
    const idw = Math.floor(CAMERA_ZOOM * box.w);
    const idh = Math.floor(CAMERA_ZOOM * box.h);
    g.fillStyle = "#e8c060";
    g.fillRect(idx, idy, idw, idh);
  }
}

/**
 * Pickup cell held above Vernan's head during the item overlay
 * (Java drawPickupItemAbovePlayerDevice).
 */
function drawPickupItemAbovePlayer(
  g: CanvasRenderingContext2D,
  player: Player,
  camera: WorldCamera,
  sheet: ImageBitmap,
  poseH: number,
): void {
  const facing = player.facing >= 0 ? 1 : -1;
  const feetWorld = player.spriteFeetWorldY();
  const headTop = feetWorld - poseH;
  const cxWorld = player.x + 8 * facing;
  const cyWorld = headTop - 8 - ITEM_PICKUP_CELL * 0.5;
  const dx1 = cxWorld - ITEM_PICKUP_CELL * 0.5;
  const dy1 = cyWorld - ITEM_PICKUP_CELL * 0.5;
  const dw = Math.floor(CAMERA_ZOOM * ITEM_PICKUP_CELL);
  const dh = Math.floor(CAMERA_ZOOM * ITEM_PICKUP_CELL);
  drawItemPickupCell(
    g,
    sheet,
    camera.worldToDeviceX(dx1),
    camera.worldToDeviceY(dy1),
    dw,
    dh,
  );
}

/** Heart/key floating above Vernan during shop mini-buy (Java drawMiniBuyPickupAbovePlayerDevice). */
function drawMiniBuyPickupAbovePlayer(
  g: CanvasRenderingContext2D,
  player: Player,
  camera: WorldCamera,
  kind: PickupKind,
  bitmaps: Map<string, ImageBitmap>,
  poseH: number,
): void {
  const bmp = bitmaps.get(pickupSpriteFile(kind));
  const { w: iw, h: ih } = pickupSpriteSize(kind);
  const facing = player.facing >= 0 ? 1 : -1;
  const feetWorld = player.spriteFeetWorldY();
  const headTop = feetWorld - poseH;
  const cxWorld = player.x + 8 * facing;
  const cyWorld = headTop - 8 - ih * 0.5;
  const dx1 = cxWorld - iw * 0.5;
  const dy1 = cyWorld - ih * 0.5;
  const dw = Math.floor(CAMERA_ZOOM * iw);
  const dh = Math.floor(CAMERA_ZOOM * ih);
  const sdx1 = camera.worldToDeviceX(dx1);
  const sdy1 = camera.worldToDeviceY(dy1);
  g.save();
  g.imageSmoothingEnabled = false;
  if (bmp) {
    if (kind === PickupKind.HEART) {
      const fw = Math.max(1, Math.floor(bmp.width / 8));
      const fh = bmp.height;
      g.drawImage(bmp, 0, 0, fw, fh, sdx1, sdy1, dw, dh);
    } else {
      g.drawImage(bmp, 0, 0, bmp.width, bmp.height, sdx1, sdy1, dw, dh);
    }
  } else {
    g.fillStyle = kind === PickupKind.HEART ? "#ff6076" : "#c8b060";
    g.fillRect(sdx1, sdy1, dw, dh);
  }
  g.restore();
}

function tileColor(id: number): string {
  switch (id) {
    case TILE_SOLID:
      return "#3d4a58";
    case TILE_DOOR:
      return "#6b4e2e";
    case TILE_PLATFORM:
      return "#7a8f6a";
    case TILE_LADDER:
      return "#c4a35a";
    case TILE_BREAKABLE:
      return "#8a5a4a";
    case TILE_KEYBLOCK:
    case TILE_KEYBLOCK_CONNECTOR:
      return "#b08a2a";
    default:
      return "#2a3540";
  }
}

/** Screen-space climb / leveltransition strip during boss floor ascend. */
function drawLevelAscendPlayerOverlay(
  g: CanvasRenderingContext2D,
  la: LevelAscendState,
  sprites: PlayerSprites,
  overrideFeetDevY?: number,
  overrideCenterDevX?: number,
): void {
  const anchor = levelAscendDrawAnchor(la);
  const feetY = overrideFeetDevY ?? Math.round(anchor.feetY);
  const centerX = overrideCenterDevX ?? Math.round(anchor.centerX);
  const face = 1; // LEVEL_TRANS_CLIMB_DRAW_FACING
  if (levelAscendUsesClimbDraw(la)) {
    if (!sprites.climb) return;
    drawFeetRowAnchoredStripDevice(
      g,
      sprites.climb,
      la.climbFrame,
      centerX,
      feetY,
      face,
      LEVEL_TRANS_FEET_ROW_WORLD_PX,
    );
    return;
  }
  if (!sprites.levelTransition) return;
  const adjust = levelTransStripHandoffAdjustDevY(la.descendSec, CAMERA_ZOOM);
  drawFeetRowAnchoredStripDevice(
    g,
    sprites.levelTransition,
    la.animFrame,
    centerX,
    feetY - adjust,
    face,
    LEVEL_TRANS_FEET_ROW_WORLD_PX,
  );
}

function drawPlayerGrabHold(
  g: CanvasRenderingContext2D,
  player: Player,
  camera: WorldCamera,
  sprites: PlayerSprites,
  cx: number,
  feet: number,
  juice: {
    shakeX: number;
    shakeY: number;
    scaleX: number;
    scaleY: number;
    solidRed: boolean;
    hurtTintAlpha: number;
    tintRgb?: number;
  },
): void {
  const strip = sprites.grabbed ?? sprites.hurtAir;
  if (!strip) return;
  const frame = sprites.grabbed ? player.grabAnimFrameIndex() : 0;
  drawFeetPinnedStrip(g, strip, frame, cx, feet, player.facing, camera, juice);
}

function isPlayerGrabDrawEmbeddedInNephilim(
  player: Player,
  enemies: readonly CombatEnemy[],
): boolean {
  if (!player.isGrabHeld()) return false;
  for (const e of enemies) {
    if (e instanceof Nephilim && !e.isDead() && e.isGrabHoldingPlayer()) return true;
  }
  return false;
}

function drawPlayer(
  g: CanvasRenderingContext2D,
  player: Player,
  camera: WorldCamera,
  sprites: PlayerSprites,
  renderFacing: number,
  turnWindowOpen: boolean,
  doorPose: DoorTransitionPose = DoorTransitionPose.NONE,
  itemPickupPose = false,
  costumeBundle: CostumeRenderBundle | null = null,
  ownedPalette: ReadonlyMap<number, number> | undefined = undefined,
  whipPartBmp: ImageBitmap | null = null,
): void {
  // Invuln blink only when not in solid-red hitstun (Java: solid red wins).
  if (
    !player.hitlagSolidRed &&
    player.health.isInvulnerable &&
    Math.floor(performance.now() / 80) % 2 === 0
  ) {
    return;
  }

  const feet = player.spriteFeetWorldY();
  const cx = player.x + player.w * 0.5;
  const facing = renderFacing;
  const lemonBody = player.isLemonPoseActive() || player.usesLemonBuster();
  const bodySprites = lemonBody ? pickLemonBodySprites(sprites) : sprites;
  const shyFlash = player.shyMaskFlashAlpha();
  const kCandyWhite = player.kCandyWhiteFlashActive();
  const dodgeFlash = player.airDodgeIntangibleFlashAlpha();
  // Tint priority matches Java tintPlayerSpriteForDraw: k-candy → dodge white → shy → hurt red.
  const juice = {
    shakeX: player.hitlagShakeX,
    shakeY: player.hitlagShakeY,
    scaleX: player.renderSquashScaleX(),
    scaleY: player.renderSquashScaleY(),
    solidRed: player.hitlagSolidRed && !kCandyWhite && dodgeFlash <= 0,
    hurtTintAlpha: kCandyWhite
      ? 255
      : dodgeFlash > 0
        ? dodgeFlash
        : shyFlash > 0
          ? shyFlash
          : player.hurtTintAlpha(),
    tintRgb: kCandyWhite || dodgeFlash > 0
      ? 0xffffff
      : shyFlash > 0
        ? player.shyMaskFlashRgb()
        : undefined,
    ownedPalette,
  };
  const drawWhipOverlay = () =>
    drawWhip(g, player, camera, whipPartBmp, juice.solidRed === true);

  if (costumeBundle) {
    let attackOverlay: AttackOverlayDraw | undefined;
    if (player.isAttacking() && !player.headband.isActive()) {
      const crouchSwing = player.isGroundCrouchAttack();
      const body = crouchSwing
        ? (sprites.crouchAttack ?? sprites.attack)
        : player.attackUsesAirStrip() && sprites.airAttack
          ? sprites.airAttack
          : sprites.attack;
      if (body) {
        const visual = playerSwordVisual(player);
        attackOverlay = {
          sword: pickSwordOverlayStrip(sprites, visual, crouchSwing),
          shield: player.hasShieldEquipped()
            ? crouchSwing
              ? sprites.crouchShieldAttack
              : sprites.shieldAttack
            : null,
          stickCentered: visual === "stick",
          frameIndex: player.attackAnimFrameIndex(),
          bodyFrameW: body.frameW,
        };
      }
    }
    if (
      tryRenderLayeredPlayer({
        g,
        player,
        camera,
        bundle: costumeBundle,
        inventory: player.inventory,
        renderFacing,
        turnAnimFramesLeft: turnWindowOpen ? 1 : 0,
        doorPose,
        itemPickupPose,
        juice,
        attackOverlay,
        drawWhipOverlay: player.usesWhip() ? drawWhipOverlay : undefined,
      })
    ) {
      const shieldFacing =
        turnWindowOpen && player.onGround && !player.climbing ? renderFacing : player.facing;
      drawPassiveShieldOverlay(
        g,
        player,
        sprites,
        cx,
        feet,
        shieldFacing,
        camera,
        juice,
        player.climbing ? player.climbFrame() : 0,
      );
      return;
    }
  }

  if (doorPose === DoorTransitionPose.ENTER && sprites.doorEnter) {
    drawFeetPinnedStrip(g, sprites.doorEnter, 0, cx, feet, player.facing, camera, juice);
    return;
  }
  if (doorPose === DoorTransitionPose.EXIT && sprites.doorExit) {
    drawFeetPinnedStrip(g, sprites.doorExit, 0, cx, feet, player.facing, camera, juice);
    return;
  }

  // Arms-raised pickup pose (Java vernanItemPickupPoseVisible) — before getup/hurt/attack.
  if (itemPickupPose && sprites.itemPose) {
    drawFeetPinnedImage(g, sprites.itemPose, cx, feet, player.facing, camera, juice);
    return;
  }

  if (player.isCarryPlucking() && sprites.pluck) {
    drawFeetPinnedStrip(
      g,
      sprites.pluck,
      player.carryPluckFrameIndex(),
      cx,
      feet,
      player.facing,
      camera,
      juice,
    );
    return;
  }

  if (player.isCarryThrowing()) {
    const strip = player.carryThrowStartedOnGround()
      ? sprites.throwCarry
      : sprites.throwCarryAir;
    if (strip) {
      drawFeetPinnedStrip(
        g,
        strip,
        player.carryThrowFrameIndex(),
        cx,
        feet,
        player.facing,
        camera,
        juice,
      );
      return;
    }
  }

  if (player.isGetupPoseActive() && sprites.getup) {
    // Getup sheet is 48px tall; pin stand row (32) so art extends below feet (Java VERNAN_BODY_SPRITE_H).
    drawFeetPinnedStrip(
      g,
      sprites.getup,
      player.getupAnimFrameIndex(sprites.getup.frameCount),
      cx,
      feet,
      player.facing,
      camera,
      juice,
      VERNAN_SPRITE_H,
    );
    return;
  }

  if (player.isGrabHeld()) {
    drawPlayerGrabHold(g, player, camera, sprites, cx, feet, juice);
    return;
  }

  if (player.isAirDodgeActive() && sprites.airDodge) {
    drawFeetPinnedStrip(
      g,
      sprites.airDodge,
      player.airDodgeCostumeFrameIndex(),
      cx,
      feet,
      player.facing,
      camera,
      juice,
    );
    return;
  }

  if (player.isSlideActive() && sprites.slide) {
    drawFeetPinnedStrip(g, sprites.slide, 0, cx, feet, player.facing, camera, juice);
    return;
  }

  if (player.isWallSlideActive() && sprites.wallSlide) {
    drawFeetPinnedStrip(
      g,
      sprites.wallSlide,
      Math.floor(performance.now() / 120) % 2,
      cx,
      feet,
      player.wallSlideSide(),
      camera,
      juice,
    );
    return;
  }

  if (player.isHeavyAttackActive() && sprites.heavyAttack) {
    const idx = player.heavyAttackFrameIndex();
    drawFeetPinnedStrip(g, sprites.heavyAttack, idx, cx, feet, player.facing, camera, juice);
    if (player.heavyAttackFromAir() && sprites.heavyAttackAirLegs) {
      drawFeetPinnedStrip(g, sprites.heavyAttackAirLegs, idx, cx, feet, player.facing, camera, juice);
    }
    drawWhipOverlay();
    return;
  }

  if (player.isHurtLocked() && sprites.hurtAir) {
    drawFeetPinnedStrip(
      g,
      sprites.hurtAir,
      player.hurtAirFrameIndex(),
      cx,
      feet,
      facing,
      camera,
      juice,
    );
    return;
  }

  if (player.headband.isActive()) {
    const hb = player.headband;
    const idx = hb.frameIndex();
    let strip: SpriteStrip | null = null;
    if (hb.isSideAttack()) strip = sprites.headbandSideAttack;
    else if (hb.isCrouchKick()) strip = sprites.headbandCrouchAttack;
    else if (hb.isUpAttack()) strip = sprites.headbandUpAttack;
    if (strip) {
      const facingHb = player.facing >= 0 ? 1 : -1;
      drawFeetPinnedStrip(g, strip, idx, cx, feet, facingHb, camera, juice);
      return;
    }
  }

  if (player.isAttacking() && sprites.attack) {
    const crouchSwing = player.isGroundCrouchAttack();
    const body = crouchSwing
      ? (sprites.crouchAttack ?? sprites.attack)
      : player.attackUsesAirStrip() && sprites.airAttack
        ? sprites.airAttack
        : sprites.attack;
    const visual = playerSwordVisual(player);
    const sword = pickSwordOverlayStrip(sprites, visual, crouchSwing);
    const shieldOverlay = player.hasShieldEquipped()
      ? crouchSwing
        ? sprites.crouchShieldAttack
        : sprites.shieldAttack
      : null;
    drawAttackComposite(
      g,
      body,
      sword,
      player.attackAnimFrameIndex(),
      player.x,
      player.w,
      feet,
      player.facing,
      camera,
      juice,
      visual === "stick",
      shieldOverlay,
    );
    drawWhipOverlay();
    return;
  }

  if (player.isSubweaponAnimating()) {
    const strip = player.subweaponUsesAttack0Strip()
      ? player.subweaponUsesAirSpecialStrip()
        ? (sprites.airAttack0 ?? sprites.attack0)
        : sprites.attack0
      : player.subweaponUsesAirSpecialStrip()
        ? (sprites.airSpecialAttack ?? sprites.specialAttack)
        : sprites.specialAttack;
    if (strip) {
      drawFeetPinnedStrip(
        g,
        strip,
        player.subweaponAnimFrameIndex(),
        cx,
        feet,
        player.facing,
        camera,
        juice,
      );
      return;
    }
  }

  if (player.climbing && bodySprites.climb) {
    drawFeetPinnedStrip(g, bodySprites.climb, player.climbFrame(), cx, feet, facing, camera, juice);
    drawPassiveShieldOverlay(g, player, sprites, cx, feet, facing, camera, juice, player.climbFrame());
    return;
  }

  const useCrouch =
    bodySprites.crouch &&
    (player.crouching ||
      player.isCrouchJumpMode() ||
      player.isJumpSquatting() ||
      player.isLandingLocked());
  if (useCrouch && bodySprites.crouch) {
    drawFeetPinnedImage(g, bodySprites.crouch, cx, feet, facing, camera, juice);
    drawPassiveShieldOverlay(g, player, sprites, cx, feet, facing, camera, juice);
    return;
  }

  if (!player.onGround && !player.isWalkOffLedgeActive() && bodySprites.jump) {
    drawFeetPinnedStrip(g, bodySprites.jump, player.jumpFrame(), cx, feet, facing, camera, juice);
    drawPassiveShieldOverlay(g, player, sprites, cx, feet, facing, camera, juice);
    return;
  }

  const turning =
    player.onGround &&
    !player.isWalkOffLedgeActive() &&
    (turnWindowOpen || player.isTurningPose());
  if (turning && bodySprites.turn) {
    drawFeetPinnedImage(g, bodySprites.turn, cx, feet, facing, camera, juice);
    drawPassiveShieldOverlay(g, player, sprites, cx, feet, facing, camera, juice);
    return;
  }

  if (
    (player.onGround || player.isWalkOffLedgeActive()) &&
    (Math.abs(player.vx) > WALK_SPEED_THRESHOLD || player.isWalkOffLedgeActive()) &&
    bodySprites.walk
  ) {
    drawFeetPinnedStrip(g, bodySprites.walk, player.walkFrame(), cx, feet, facing, camera, juice);
    drawPassiveShieldOverlay(g, player, sprites, cx, feet, facing, camera, juice);
    return;
  }

  if (bodySprites.idle) {
    drawFeetPinnedImage(g, bodySprites.idle, cx, feet, facing, camera, juice);
    drawPassiveShieldOverlay(g, player, sprites, cx, feet, facing, camera, juice);
    return;
  }

  const dx = camera.worldToDeviceX(player.x + player.hitlagShakeX);
  const dy = camera.worldToDeviceY(player.y + player.hitlagShakeY);
  const dw = Math.max(1, Math.floor(CAMERA_ZOOM * player.w));
  const dh = Math.max(1, Math.floor(CAMERA_ZOOM * player.h));
  g.fillStyle = player.hitlagSolidRed ? "#ff0000" : "#e8eef5";
  g.fillRect(dx, dy, dw, dh);
}

type ElectrocuteEnemyDrawState = {
  hitlagShakeX: number;
  hitlagShakeY: number;
  hitlagSolidRed: boolean;
  hitlagElectrocute?: boolean;
  hitstun: number;
  squash?: { scaleX(): number; scaleY(): number };
  hurtTintAlpha(): number;
};

function enemyStrikeJuice(e: ElectrocuteEnemyDrawState, simTicks: number): JuiceDrawOpts {
  const electrocuteBw = !!(e.hitlagElectrocute && e.hitstun > 0);
  return {
    shakeX: e.hitlagShakeX,
    shakeY: e.hitlagShakeY,
    scaleX: e.squash?.scaleX() ?? 1,
    scaleY: e.squash?.scaleY() ?? 1,
    solidRed: electrocuteBw ? false : e.hitlagSolidRed,
    electrocuteBw,
    simTicks,
    hurtTintAlpha: e.hurtTintAlpha(),
  };
}

function maybeDrawElectricShockOverlay(
  g: CanvasRenderingContext2D,
  e: CombatEnemy,
  camera: WorldCamera,
  strip: SpriteStrip | null,
  simTicks: number,
): void {
  if (!strip) return;
  const host = e as CombatEnemy & {
    hitlagElectrocute?: boolean;
    hitstun?: number;
    hitlagShakeX?: number;
    hitlagShakeY?: number;
  };
  if (!host.hitlagElectrocute || (host.hitstun ?? 0) <= 0) return;
  const shakeDx = Math.round((host.hitlagShakeX ?? 0) * CAMERA_ZOOM);
  const shakeDy = Math.round((host.hitlagShakeY ?? 0) * CAMERA_ZOOM);
  drawElectricShockOverlayWorldRect(
    g,
    (wx) => camera.worldToDeviceX(wx),
    (wy) => camera.worldToDeviceY(wy),
    e.rect(),
    shakeDx,
    shakeDy,
    strip,
    simTicks,
  );
}

function drawEnemy(
  g: CanvasRenderingContext2D,
  e: CombatEnemy,
  camera: WorldCamera,
  sprites: EnemySprites,
  player: Player,
  playerSprites: PlayerSprites,
  simTicks: number,
  electricShock: SpriteStrip | null,
): void {
  if (e instanceof Possessed) {
    drawPossessedBoss(g, e, camera, {
      strip: sprites.possessed,
      shinyStrip: sprites.shinyPossessed,
      bulletSheet: null,
      bulletDieSheet: null,
    });
    return;
  }

  if (e instanceof Nephilim) {
    const embedPlayer =
      player.isGrabHeld() && e.isGrabHoldingPlayer()
        ? {
            beforePart: e.grabPlayerDrawBeforePart(),
            drawPlayer: (g: CanvasRenderingContext2D) => {
              const feet = player.spriteFeetWorldY();
              const cx = player.x + player.w * 0.5;
              const shyFlash = player.shyMaskFlashAlpha();
              drawPlayerGrabHold(g, player, camera, playerSprites, cx, feet, {
                shakeX: player.hitlagShakeX,
                shakeY: player.hitlagShakeY,
                scaleX: player.renderSquashScaleX(),
                scaleY: player.renderSquashScaleY(),
                solidRed: player.hitlagSolidRed,
                hurtTintAlpha: shyFlash > 0 ? shyFlash : player.hurtTintAlpha(),
                tintRgb: shyFlash > 0 ? player.shyMaskFlashRgb() : undefined,
              });
            },
          }
        : undefined;
    drawNephilimBoss(g, e, camera, { strip: sprites.nephilim, healOverlay: sprites.nephilimHealFx }, embedPlayer);
    return;
  }

  if (e instanceof Crawler) {
    // Hide after death hitstun ends (explosion spawns that tick).
    if (e.isDead()) return;
    if (sprites.crawler) {
      const rect = e.rect();
      const cx = rect.x + rect.w * 0.5;
      const feet = rect.y + rect.h;
      drawFeetPinnedStrip(
        g,
        sprites.crawler,
        e.getAnimFrame(),
        cx,
        feet,
        e.facingSign(),
        camera,
        enemyStrikeJuice(e, simTicks),
      );
      maybeDrawElectricShockOverlay(g, e, camera, electricShock, simTicks);
      return;
    }
  }

  if (e instanceof Mouse) {
    if (e.isDead()) return;
    const strip = e.useHurtSprite() && sprites.mouseHurt ? sprites.mouseHurt : sprites.mouse;
    if (strip) {
      const rect = e.rect();
      const cx = rect.x + rect.w * 0.5;
      const feet = rect.y + rect.h;
      drawFeetPinnedStrip(
        g,
        strip,
        e.getAnimFrame(),
        cx,
        feet,
        e.facingSign(),
        camera,
        enemyStrikeJuice(e, simTicks),
      );
      maybeDrawElectricShockOverlay(g, e, camera, electricShock, simTicks);
      return;
    }
  }

  if (e instanceof Penisman) {
    if (e.isDead()) return;
    if (sprites.penisman) {
      const rect = e.rect();
      const cx = rect.x + rect.w * 0.5;
      const feet = rect.y + rect.h;
      drawFeetPinnedStrip(
        g,
        sprites.penisman,
        e.getAnimFrame(),
        cx,
        feet,
        e.facingSign(),
        camera,
        enemyStrikeJuice(e, simTicks),
      );
      maybeDrawElectricShockOverlay(g, e, camera, electricShock, simTicks);
      return;
    }
  }

  if (e instanceof GoldenRoach) {
    drawGoldenRoach(g, e, camera, sprites.goldenRoachWalk, sprites.goldenRoachFly, simTicks);
    maybeDrawElectricShockOverlay(g, e, camera, electricShock, simTicks);
    return;
  }

  if (e instanceof JackBlue) {
    if (e.isDead() || e.isDeathScatterActive()) return;
    if (sprites.jackBlue) {
      const rect = e.rect();
      const cx = rect.x + rect.w * 0.5;
      const feet = rect.y + rect.h;
      const juice = enemyStrikeJuice(e, simTicks);
      drawFeetPinnedStrip(
        g,
        sprites.jackBlue,
        e.getAnimFrame(),
        cx,
        feet,
        e.facingSign(),
        camera,
        juice,
      );
      if (sprites.jackBlueShield) {
        drawFeetPinnedStrip(
          g,
          sprites.jackBlueShield,
          e.getAnimFrame(),
          cx,
          feet,
          e.facingSign(),
          camera,
          juice,
        );
      }
      maybeDrawElectricShockOverlay(g, e, camera, electricShock, simTicks);
      return;
    }
  }

  if (e instanceof Multilimber) {
    if (e.isDead()) return;
    drawMultilimber(
      g,
      e,
      camera,
      {
        body: sprites.multilimberBody,
        head: sprites.multilimberHead,
        eye: sprites.multilimberEye,
      },
      enemyStrikeJuice(e, simTicks),
    );
    maybeDrawElectricShockOverlay(g, e, camera, electricShock, simTicks);
    return;
  }

  if (e instanceof RollingHead) {
    if (e.isDead()) return;
    if (sprites.rollingHead) {
      const rect = e.rect();
      const cx = rect.x + rect.w * 0.5;
      const feet = rect.y + rect.h;
      drawFeetPinnedStrip(
        g,
        sprites.rollingHead,
        e.getAnimFrame(),
        cx,
        feet,
        e.facingSign(),
        camera,
        enemyStrikeJuice(e, simTicks),
      );
      maybeDrawElectricShockOverlay(g, e, camera, electricShock, simTicks);
      return;
    }
  }

  const rect = e.rect();
  const dx = camera.worldToDeviceX(rect.x);
  const dy = camera.worldToDeviceY(rect.y);
  const dw = Math.max(1, Math.floor(CAMERA_ZOOM * rect.w));
  const dh = Math.max(1, Math.floor(CAMERA_ZOOM * rect.h));
  g.fillStyle = e instanceof Possessed ? "#9b5bb8" : "#c07070";
  g.fillRect(dx, dy, dw, dh);
}

/**
 * Top-centered boss HP bar (Java GamePanel.drawBossHealthBarDevice).
 * Red fill + top highlight; label above the bar — no wind-up color change.
 */
function drawBossHpBar(
  g: CanvasRenderingContext2D,
  hp: number,
  maxHp: number,
  label: string,
): void {
  const max = Math.max(1e-9, maxHp);
  const cur = Math.max(0, Math.min(max, hp));
  const frac = cur / max;

  const barW = Math.round(INTERNAL_WIDTH * 0.52);
  const barH = 8;
  const bx = Math.floor((INTERNAL_WIDTH - barW) / 2);
  const by = 14;

  g.fillStyle = "rgba(0,0,0,0.667)"; // Java Color(0,0,0,170)
  g.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
  g.fillStyle = "rgb(40,16,20)";
  g.fillRect(bx, by, barW, barH);
  const fillW = Math.round(barW * frac);
  if (fillW > 0) {
    g.fillStyle = "rgb(196,40,52)";
    g.fillRect(bx, by, fillW, barH);
    g.fillStyle = "rgb(232,96,104)";
    g.fillRect(bx, by, fillW, 2);
  }
  // Java drawRect(bx-1, by-1, barW+1, barH+1) — 1px border outside the fill.
  g.strokeStyle = "rgb(214,198,180)";
  g.lineWidth = 1;
  g.strokeRect(bx - 0.5, by - 0.5, barW + 1, barH + 1);

  g.fillStyle = "rgb(226,214,196)";
  g.font = "12px monospace";
  g.textBaseline = "alphabetic";
  g.fillText(label, bx, by - 4);
}

function retainWeaponPhysicsForPlayerParity(): void {
  // Player.ts should consume these; mount imports keep Physics parity at the wiring hub.
  void GEM_SWORD_HIT_COIN_CHANCE;
  void GEM_SWORD_KILL_COIN_CHANCE;
  void GEM_SWORD_HITSTUN_MULT;
  void STICK_REFLECT_SPEED_MULT;
  void STICK_REFLECT_DAMAGE_MULT;
  void FLINT_SPARK_BASE_CHANCE;
  void FLINT_SPARK_LUCK_MULT;
}

function drawPassiveShieldOverlay(
  g: CanvasRenderingContext2D,
  player: Player,
  sprites: PlayerSprites,
  cx: number,
  feet: number,
  facing: number,
  camera: WorldCamera,
  juice: JuiceDrawOpts,
  climbAnimMod2 = 0,
): void {
  if (!sprites.shieldPlayer || !player.hasShieldEquipped()) return;
  const idx = player.shieldOverlayFrameIndex(climbAnimMod2);
  if (idx < 0) return;
  const fw = sprites.shieldPlayer.frameW;
  const left = cx - fw * 0.5;
  drawStripFrameFeetPinned(g, sprites.shieldPlayer, idx, left, feet, facing, camera, {
    ...juice,
    solidRed: false,
    hurtTintAlpha: 0,
  });
}

function playerSwordVisual(player: Player): SwordVisual | null {
  return player.swordVisualId();
}

type LocomotionSprites = Pick<
  PlayerSprites,
  "idle" | "crouch" | "turn" | "walk" | "jump" | "climb"
>;

function pickLemonBodySprites(sprites: PlayerSprites): LocomotionSprites {
  return {
    idle: sprites.lemonIdle ?? sprites.idle,
    crouch: sprites.lemonCrouch ?? sprites.crouch,
    turn: sprites.lemonTurn ?? sprites.turn,
    walk: sprites.lemonWalk ?? sprites.walk,
    jump: sprites.lemonJump ?? sprites.jump,
    climb: sprites.lemonClimb ?? sprites.climb,
  };
}

function pickSwordOverlayStrip(
  sprites: PlayerSprites,
  visual: SwordVisual | null,
  crouchSwing: boolean,
): SpriteStrip | null {
  const fallback = crouchSwing ? sprites.crouchSword : sprites.sword;
  if (!visual || visual === "default") return fallback;
  switch (visual) {
    case "flint":
      return (crouchSwing ? sprites.crouchFlintSword : sprites.flintSword) ?? fallback;
    case "gem":
      return (crouchSwing ? sprites.crouchGemSword : sprites.gemSword) ?? fallback;
    case "stick":
      return (crouchSwing ? sprites.crouchStickSword : sprites.stickSword) ?? fallback;
    case "lemon":
    case "fists":
    case "whip":
      return null;
    default:
      return fallback;
  }
}

function drawFlintFire(
  g: CanvasRenderingContext2D,
  fire: FlintFire,
  camera: WorldCamera,
  strip: SpriteStrip | null,
): void {
  if (fire.isDissipated() || !strip) return;
  const alpha = fire.renderAlpha();
  if (alpha <= 0) return;
  const fi = ((fire.animFrameIndex() % strip.frameCount) + strip.frameCount) % strip.frameCount;
  const fw = strip.frameW;
  const fh = strip.frameH;
  const pivotY = 11;
  const row = Math.floor(fh * 0.5);
  const worldLeft = fire.x - FLINT_FIRE_PIVOT_X + fire.earthboundScanlineOffsetWorldX(row);
  const worldTop = fire.y - pivotY;
  const dx = camera.worldToDeviceX(worldLeft);
  const dy = camera.worldToDeviceY(worldTop);
  const dw = Math.max(1, Math.round(CAMERA_ZOOM * fw * fire.spriteVisualScale()));
  const dh = Math.max(1, Math.round(CAMERA_ZOOM * fh * fire.spriteVisualScale()));
  const sx = fi * fw;
  g.save();
  g.globalAlpha = alpha;
  g.imageSmoothingEnabled = false;
  g.drawImage(strip.image, sx, 0, fw, fh, dx, dy, dw, dh);
  g.restore();
}

function applySmokeHeatDistortionToBackbuffer(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  clouds: readonly SmokeCloud[],
  bmp: ImageBitmap | null,
): void {
  if (!bmp || clouds.length === 0) return;
  const fw = Math.floor(bmp.width / SmokeCloud.ANIM_FRAME_COUNT) || bmp.width;
  const fh = bmp.height;
  const anchors: SmokeHeatAnchor[] = [];
  for (const s of clouds) {
    if (s.isDissipated()) continue;
    const sc = s.spriteScale();
    const worldVisH = fh * sc;
    const cxWorld = s.x + s.w * 0.5;
    const cyWorld = s.y + s.h - worldVisH * 0.5;
    const cx = camera.worldToDeviceX(cxWorld);
    const cy = camera.worldToDeviceY(cyWorld);
    const mask = buildSmokeDeviceMask({
      cloudX: s.x,
      cloudY: s.y,
      cloudW: s.w,
      cloudH: s.h,
      frameW: fw,
      frameH: fh,
      spriteScale: sc,
      earthboundScanlineOffsetWorldX: (row) => s.earthboundScanlineOffsetWorldX(row),
      worldToDeviceX: (wx) => camera.worldToDeviceX(wx),
      worldToDeviceY: (wy) => camera.worldToDeviceY(wy),
      cameraZoom: CAMERA_ZOOM,
    });
    const rippleRadius = rippleRadiusForSmokeMask(mask, cx, cy);
    anchors.push(
      makeSmokeHeatAnchor(cx, cy, rippleRadius, s.renderAlpha(), s.distortionPhaseSec(), mask),
    );
  }
  if (anchors.length === 0) return;
  applySmokeHeatDistortion(g, INTERNAL_WIDTH, INTERNAL_HEIGHT, anchors);
}

function drawSmokeCloud(
  g: CanvasRenderingContext2D,
  cloud: SmokeCloud,
  camera: WorldCamera,
  bmp: ImageBitmap | null,
): void {
  if (cloud.isDissipated() || !bmp) return;
  const alpha = cloud.renderAlpha();
  if (alpha <= 0.01) return;
  const fw = Math.floor(bmp.width / SmokeCloud.ANIM_FRAME_COUNT) || bmp.width;
  const fh = bmp.height;
  const fi = cloud.animFrameIndex() % SmokeCloud.ANIM_FRAME_COUNT;
  const sc = cloud.spriteScale();
  const worldVisW = fw * sc;
  const worldVisH = fh * sc;
  const leftWorld = cloud.x + cloud.w * 0.5 - worldVisW * 0.5;
  const topWorld = cloud.y + cloud.h - worldVisH;
  let dwDest = Math.round(CAMERA_ZOOM * worldVisW);
  if (dwDest < 1) dwDest = 1;
  const sxTex = fi * fw;
  g.save();
  g.globalAlpha = alpha;
  g.imageSmoothingEnabled = false;
  // Per-row EarthBound scanline quads (Java drawSmokeCloudsDevice).
  for (let row = 0; row < fh; row++) {
    const ox = cloud.earthboundScanlineOffsetWorldX(row);
    const yt = topWorld + (row / fh) * worldVisH;
    const yb = topWorld + ((row + 1) / fh) * worldVisH;
    const sx1 = camera.worldToDeviceX(leftWorld + ox);
    const sy1 = camera.worldToDeviceY(yt);
    const sy2 = camera.worldToDeviceY(yb);
    const dh = Math.max(1, sy2 - sy1);
    g.drawImage(bmp, sxTex, row, fw, 1, sx1, sy1, dwDest, dh);
  }
  g.restore();
}

function drawWhip(
  g: CanvasRenderingContext2D,
  pl: Player,
  camera: WorldCamera,
  bmp: ImageBitmap | null,
  solidRed = false,
): void {
  if (!pl.usesWhip() || !pl.whipSim.isActive()) return;
  const sim = pl.whipSim;
  const zoom = CAMERA_ZOOM;
  g.save();
  g.strokeStyle = solidRed ? "#ff0000" : "#cbdbfc";
  g.lineWidth = Math.max(2, 2 * zoom);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  for (let i = 0; i < sim.pointCount(); i++) {
    const dx = camera.worldToDeviceX(sim.pointX(i));
    const dy = camera.worldToDeviceY(sim.pointY(i));
    if (i === 0) g.moveTo(dx, dy);
    else g.lineTo(dx, dy);
  }
  g.stroke();
  if (bmp) {
    const cell = WhipSim.HANDLE_CELL_W;
    const dw = Math.max(1, Math.round(zoom * cell));
    const dh = dw;
    g.imageSmoothingEnabled = false;
    drawWhipPartSprite(
      g,
      bmp,
      0,
      0,
      cell,
      cell,
      camera.worldToDeviceX(sim.handleX()),
      camera.worldToDeviceY(sim.handleY()),
      pl.whipHandleRotRad(),
      zoom,
      WhipSim.HANDLE_ROPE_LOCAL_X,
      WhipSim.HANDLE_ROPE_LOCAL_Y,
      dw,
      dh,
      solidRed,
    );
    const headAngle = sim.isDeployed()
      ? sim.headSegmentAngleRad()
      : pl.whipCoiledTipRotRad();
    drawWhipPartSprite(
      g,
      bmp,
      cell,
      0,
      cell,
      cell,
      camera.worldToDeviceX(sim.tipX()),
      camera.worldToDeviceY(sim.tipY()),
      headAngle,
      zoom,
      WhipSim.HEAD_ROPE_LOCAL_X,
      WhipSim.HEAD_ROPE_LOCAL_Y,
      dw,
      dh,
      solidRed,
    );
  }
  g.restore();
}

/** Java GamePanel.drawWhipPartSprite — rope-local pivot on handle/head art. */
function drawWhipPartSprite(
  g: CanvasRenderingContext2D,
  bmp: ImageBitmap,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  attachDeviceX: number,
  attachDeviceY: number,
  angleRad: number,
  zoom: number,
  ropeLocalX: number,
  ropeLocalY: number,
  dw: number,
  dh: number,
  solidRed: boolean,
): void {
  g.save();
  g.translate(attachDeviceX, attachDeviceY);
  g.rotate(angleRad);
  const drawX = Math.round(-ropeLocalX * zoom);
  const drawY = Math.round(-ropeLocalY * zoom);
  if (solidRed) {
    // SrcAtop red fill on the part cell (matches player solid-red hitstun tint).
    const off = document.createElement("canvas");
    off.width = srcW;
    off.height = srcH;
    const og = off.getContext("2d")!;
    og.imageSmoothingEnabled = false;
    og.drawImage(bmp, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
    og.globalCompositeOperation = "source-atop";
    og.fillStyle = "#ff0000";
    og.fillRect(0, 0, srcW, srcH);
    g.drawImage(off, 0, 0, srcW, srcH, drawX, drawY, dw, dh);
  } else {
    g.drawImage(bmp, srcX, srcY, srcW, srcH, drawX, drawY, dw, dh);
  }
  g.restore();
}

function drawFamiliars(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  trail: FamiliarTrailHost,
  possessedBmp: ImageBitmap | null,
  minerBmp: ImageBitmap | null,
  bulletBmp: ImageBitmap | null,
): void {
  const drawParts = (
    bmp: ImageBitmap | null,
    parts: { frame: number; cx: number; cy: number; angleRad: number; mirror: boolean; pivotX: number; pivotY: number }[],
    frameW: number,
    frameH: number,
  ) => {
    if (!bmp) return;
    for (const p of parts) {
      const dx = camera.worldToDeviceX(p.cx);
      const dy = camera.worldToDeviceY(p.cy);
      const dw = Math.max(1, Math.round(CAMERA_ZOOM * frameW));
      const dh = Math.max(1, Math.round(CAMERA_ZOOM * frameH));
      g.save();
      g.translate(dx, dy);
      if (p.mirror) g.scale(-1, 1);
      g.rotate(p.angleRad);
      g.imageSmoothingEnabled = false;
      g.drawImage(
        bmp,
        p.frame * frameW,
        0,
        frameW,
        frameH,
        -Math.round(CAMERA_ZOOM * p.pivotX),
        -Math.round(CAMERA_ZOOM * p.pivotY),
        dw,
        dh,
      );
      g.restore();
    }
  };
  for (const f of trail.lilPossessed) {
    drawParts(possessedBmp, f.partRenders(), 16, 16);
    if (bulletBmp) {
      for (const b of f.bulletsCopy()) {
        const dx = camera.worldToDeviceX(b.x - 4);
        const dy = camera.worldToDeviceY(b.y - 4);
        const dw = Math.max(1, Math.round(CAMERA_ZOOM * 8));
        g.drawImage(bulletBmp, 0, 0, 8, 8, dx, dy, dw, dw);
      }
    }
  }
  for (const m of trail.lilMiners) {
    drawParts(minerBmp, m.partRenders(), 16, 16);
  }
}


function drawLemonProjectile(
  g: CanvasRenderingContext2D,
  shot: LemonProjectile,
  camera: WorldCamera,
  strip: SpriteStrip | null,
): void {
  if (!shot.isAlive() || !strip) return;
  const fs = shot.vx >= 0 ? 1 : -1;
  const pivot = PROJECTILE_LEMON_SHOT_PIVOT_X;
  const fw = strip.frameW;
  const fh = strip.frameH;
  const worldLeft = shot.x + (fs >= 0 ? 0 : 2 * pivot - fw);
  const worldTop = shot.y;
  const dx = camera.worldToDeviceX(worldLeft);
  const dy = camera.worldToDeviceY(worldTop);
  const dw = Math.max(1, Math.round(CAMERA_ZOOM * fw));
  const dh = Math.max(1, Math.round(CAMERA_ZOOM * fh));
  g.save();
  g.imageSmoothingEnabled = false;
  if (fs >= 0) {
    g.drawImage(strip.image, 0, 0, fw, fh, dx, dy, dw, dh);
  } else {
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(strip.image, 0, 0, fw, fh, 0, 0, dw, dh);
  }
  g.restore();
}

function drawWarpOrbProjectile(
  g: CanvasRenderingContext2D,
  w: WarpOrbProjectile,
  camera: WorldCamera,
  sprite: ImageBitmap | null,
  backbuffer: ReturnType<typeof captureBackbuffer>,
): void {
  if (!w.isAlive() || !sprite) return;
  const sw = sprite.width;
  const sh = sprite.height;
  const dx1 = camera.worldToDeviceX(w.x);
  const dy1 = camera.worldToDeviceY(w.y);
  const dx2 = dx1 + Math.round(CAMERA_ZOOM * sw);
  const dy2 = dy1 + Math.round(CAMERA_ZOOM * sh);
  drawSpriteWithLiveReflection(
    g,
    backbuffer,
    sprite,
    sw,
    sh,
    dx1,
    dy1,
    dx2,
    dy2,
    CAMERA_ZOOM,
    false,
    WARP_ORB_REFLECTION_STYLE,
  );
}

function drawFrisbeeProjectile(
  g: CanvasRenderingContext2D,
  f: FrisbeeProjectile,
  camera: WorldCamera,
  strip: SpriteStrip | null,
): void {
  if (!f.isAlive() || !f.isDrawVisible() || !strip) return;
  const fw = strip.frameW;
  const fh = strip.frameH;
  const fs = f.vx >= 0 ? 1 : -1;
  const pivot = PROJECTILE_FRISBEE_PIVOT_X;
  // Anchor (f.x, f.y) is texture (0,0); flip around PROJECTILE_FRISBEE_PIVOT_X (Java).
  const worldLeft = f.x + (fs >= 0 ? 0 : 2 * pivot - fw);
  const worldTop = f.y;
  const dx = camera.worldToDeviceX(worldLeft);
  const dy = camera.worldToDeviceY(worldTop);
  const dw = Math.max(1, Math.round(CAMERA_ZOOM * fw));
  const dh = Math.max(1, Math.round(CAMERA_ZOOM * fh));
  const fi = Math.min(strip.frameCount - 1, Math.max(0, f.animFrameIndex()));
  g.save();
  g.imageSmoothingEnabled = false;
  if (fs >= 0) {
    g.drawImage(strip.image, fi * fw, 0, fw, fh, dx, dy, dw, dh);
  } else {
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(strip.image, fi * fw, 0, fw, fh, 0, 0, dw, dh);
  }
  g.restore();
}

function drawWorldPickup(
  g: CanvasRenderingContext2D,
  pickup: WorldPickup,
  camera: WorldCamera,
  bitmaps: Map<string, ImageBitmap>,
): void {
  const file = pickupSpriteFile(pickup.kind);
  const bmp = bitmaps.get(file);
  const { w: sw, h: sh } = pickupSpriteSize(pickup.kind);
  const deform = pickup.drawDeform();
  const rcx = pickup.renderCenterX();
  const rcy = pickup.renderCenterY();
  const dw = Math.max(1, Math.floor(CAMERA_ZOOM * sw * deform.w));
  const dh = Math.max(1, Math.floor(CAMERA_ZOOM * sh * deform.h));
  const cx = camera.worldToDeviceX(rcx);
  const cy = camera.worldToDeviceY(rcy);

  g.save();
  g.translate(cx, cy);
  g.rotate(pickup.angle);
  g.imageSmoothingEnabled = false;
  if (bmp) {
    if (pickup.kind === PickupKind.HEART) {
      // heart.png is 128×16 — eight 16×16 frames.
      const fw = Math.max(1, Math.floor(bmp.width / 8));
      const fh = bmp.height;
      const fi = heartPickupFrameIndex(pickup.animTime);
      g.drawImage(bmp, fi * fw, 0, fw, fh, -dw * 0.5, -dh * 0.5, dw, dh);
    } else {
      g.drawImage(bmp, 0, 0, bmp.width, bmp.height, -dw * 0.5, -dh * 0.5, dw, dh);
    }
  } else {
    g.fillStyle =
      pickup.kind === PickupKind.HEART
        ? "#ff6076"
        : pickup.kind === PickupKind.KEY
          ? "#c8b060"
          : "#ffd678";
    g.fillRect(-dw * 0.5, -dh * 0.5, dw, dh);
  }
  g.restore();
}

function collectWorldPickups(
  player: Player,
  pickups: WorldPickup[],
  economy: HudEconomyDisplay,
  collectFx: PickupCollectFx[],
): void {
  const bodyHit = player.hitboxPose();
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]!;
    if (p.priceCoins > 0) continue; // shop inventory: press-to-buy
    if (!p.intersectsPlayerHit(bodyHit)) continue;
    if (p.kind === PickupKind.HEART) {
      if (player.health.isAtFullHealth) continue;
      player.health.heal(2);
    } else if (p.kind === PickupKind.KEY) {
      player.stats.keys++;
      economy.startResourceGain(0, 1, player.stats.money, player.stats.keys);
    } else {
      const coins = coinValue(p.kind);
      player.stats.money += coins;
      economy.startResourceGain(coins, 0, player.stats.money, player.stats.keys);
    }
    enqueuePickupCollectFx(collectFx, p.kind, p.renderCenterX(), p.renderCenterY());
    pickups.splice(i, 1);
  }
}

function snapshotBreakableTile(
  map: TileMap,
  tx: number,
  ty: number,
  session: RoomSession,
  atlas: SheetAtlas | null,
  project: TilesetProject | null,
  floor: number,
  tileWorld: TileWorldRenderer | null,
): HTMLCanvasElement | null {
  if (!atlas) return null;
  const room = session.dungeon.rooms[session.roomId]!;
  const node = session.dungeon.layout.room(session.roomId);
  const art = room.art;
  const simTick = Math.floor(session.timeSec * 60);
  const wx = tx * TILE_SIZE;
  const wy = ty * TILE_SIZE;

  const isHiddenShell = (x: number, y: number): boolean => {
    const seams = session.dungeon.secretSeams;
    if (!seams) return false;
    for (const seam of seams) {
      if (seam.isHiddenBreakable(session.roomId, x, y)) return true;
    }
    return false;
  };

  let resolveTx = tx;
  let resolveTy = ty;
  if (map.tileAt(tx, ty) === TILE_BREAKABLE && isHiddenShell(tx, ty)) {
    const inward = inwardSolidSampleCell(map, tx, ty, isHiddenShell);
    if (inward) {
      resolveTx = inward.tx;
      resolveTy = inward.ty;
    }
  }

  let tileId: string | null = null;
  if (project && art?.bridge) {
    tileId = resolveDisplayTileId(
      project,
      art.bridge,
      map,
      resolveTx,
      resolveTy,
      room.kind,
      node.contentSeed,
      floor,
      {
        decoOverlay: decoOverlayFromStamps(art.decoStamps),
        contextThemeRules: art.contextThemeRules ?? null,
      },
    );
  }
  if (!tileId) tileId = resolveShellTileId(map, resolveTx, resolveTy);
  if (!tileId) return null;
  return snapshotTerrainCell(atlas, project, tileWorld, tileId, simTick, wx, wy);
}

function drawAabb(
  g: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  color: string,
  camera: WorldCamera,
): void {
  const dx = camera.worldToDeviceX(box.x);
  const dy = camera.worldToDeviceY(box.y);
  const dw = Math.floor(CAMERA_ZOOM * box.w);
  const dh = Math.floor(CAMERA_ZOOM * box.h);
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.strokeRect(dx + 0.5, dy + 0.5, Math.max(1, dw - 1), Math.max(1, dh - 1));
}

function drawHitboxPolygon(
  g: CanvasRenderingContext2D,
  pose: HitboxPose,
  color: string,
  camera: WorldCamera,
): void {
  const verts = pose.worldVertices();
  if (verts.length < 6) {
    drawAabb(g, pose.bounds(), color, camera);
    return;
  }
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < verts.length; i += 2) {
    const dx = camera.worldToDeviceX(verts[i]!);
    const dy = camera.worldToDeviceY(verts[i + 1]!);
    if (i === 0) g.moveTo(dx + 0.5, dy + 0.5);
    else g.lineTo(dx + 0.5, dy + 0.5);
  }
  g.closePath();
  g.stroke();
}

function drawPlayerHitbox(g: CanvasRenderingContext2D, player: Player, camera: WorldCamera): void {
  drawHitboxPolygon(g, player.hitboxPose(), "#6ec8ff", camera);
  drawHitboxPolygon(g, player.hurtboxPose(), "#ff6688", camera);
  const sword = player.attackHitboxPose();
  if (sword) drawHitboxPolygon(g, sword, "#f0d060", camera);
  const shieldWindup = player.attackShieldWindupHitboxPose();
  if (shieldWindup) drawHitboxPolygon(g, shieldWindup, "#a8c8ff", camera);
  const shieldBlock = player.shieldBlockHitboxPose();
  if (shieldBlock) drawHitboxPolygon(g, shieldBlock, "#88a8e8", camera);
}

export {
  AssetLoader,
  Framebuffer,
  GameLoop,
  Input,
  Player,
  WorldCamera,
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
  INTERNAL_WIDTH,
  INTERNAL_HEIGHT,
};
