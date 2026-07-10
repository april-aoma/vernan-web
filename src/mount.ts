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
  stripFromImage,
  type SpriteStrip,
} from "./render/SpriteDraw";
import {
  CLIMB_BODY_PARTS,
  LEVEL_TRANSITION_BODY_PARTS,
  compositeBodyStrip,
} from "./render/VernanBodyComposite";
import { gemKillSource, setGemKillSource } from "./combat/GemKillTracking";
import { resolveSwordProfile } from "./combat/SwordProfile";
import type { SwordVisual } from "./combat/SwordVisual";
import { BackpackWeaponSwitch } from "./entity/BackpackWeaponSwitch";
import { FlintFire } from "./entity/FlintFire";
import { LemonProjectile } from "./entity/LemonProjectile";
import { Player } from "./entity/Player";
import { Possessed } from "./entity/Possessed";
import { Nephilim } from "./entity/Nephilim";
import { Crawler } from "./entity/Crawler";
import { Mouse } from "./entity/Mouse";
import { GoldenRoach } from "./entity/GoldenRoach";
import { drawGoldenRoach } from "./entity/drawGoldenRoach";
import { Penisman } from "./entity/Penisman";
import { drawPenisBulletDieFx, drawPenismanBullets } from "./entity/drawPenisman";
import { tickEnemyPeerPhysics } from "./entity/EnemyPeerTick";
import type { CombatEnemy } from "./entity/CombatEnemy";
import { FrisbeeAimSnapshot } from "./entity/FrisbeeAimSnapshot";
import { FrisbeeProjectile } from "./entity/FrisbeeProjectile";
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
  innerBoxFrom0000feBorder,
  pauseButtonRect,
  revealMiniMapForRoom,
  sliceHudStrip,
  slicePickupCell,
  type BottomHudSprites,
  type MiniMapState,
} from "./ui/BottomHud";
import { drawPauseMenu, drawPauseOverlay, type PauseMenuHitRects } from "./ui/PauseOverlay";
import { drawDeathOverlay, type DeathOverlayHitRects } from "./ui/DeathOverlay";
import { hitTestRect } from "./ui/BottomHudLayout";
import { HudEconomyDisplay } from "./ui/HudEconomy";
import { openSubmitDialog } from "./ranking/SubmitDialog";
import { submitScore } from "./ranking/scoresStore";
import type { RunSummary } from "./ranking/types";
import { BrickChunk, spawnBreakableBrickChunks } from "./fx/BrickChunk";
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
  tryBuyShopPedestal,
  type ShopKeeperFrames,
} from "./world/Shop";
import { RoomKind } from "./world/DungeonTypes";
import type { Aabb } from "./combat/CombatMath";
import { CONTACT_DAMAGE_IFRAMES } from "./config/CombatStats";
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
  GOLDEN_ROACH_WALK_FRAMES,
  GOLDEN_ROACH_FLY_FRAMES,
  HURT_AIR_SHEET_FRAMES,
  POSSESSED_PART_W,
  TURN_POST_FLIP_FRAMES,
  TURN_PRE_FLIP_FRAMES,
  VERNAN_ATTACK_FRAMES,
  VERNAN_CLIMB_FRAMES,
  VERNAN_JUMP_FRAMES,
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
  tryDoorTransition,
  tryLadderTransition,
  tryProcessRoomClear,
  onRoomEnteredWithKeyblockBypass,
  loadRoomBrickChunks,
  persistRoomBrickChunks,
  type RoomSession,
} from "./world/roomTransition";
import type { LevelAscendState } from "./world/roomFade";
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
import {
  applySwordBreakables,
  finishSeamOpenAnimInstant,
  tickSeamOpenAnim,
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
  /** Arms-raised pickup / shop-buy pose (`vernan item.png`). */
  itemPose: ImageBitmap | null;
  /** Boss floor-ascend descent strip (11 frames). */
  levelTransition: SpriteStrip | null;
  /** Ground frisbee throw (5 frames). */
  specialAttack: SpriteStrip | null;
  /** Air frisbee throw (5 frames). */
  airSpecialAttack: SpriteStrip | null;
  /** HEADBAND exclusive attack strips (layered vernan/). */
  headbandCrouchAttack: SpriteStrip | null;
  headbandUpAttack: SpriteStrip | null;
  headbandSideAttack: SpriteStrip | null;
  /** Lemon buster body pose swaps (flat legacy sheets). */
  lemonIdle: ImageBitmap | null;
  lemonCrouch: ImageBitmap | null;
  lemonTurn: ImageBitmap | null;
  lemonWalk: SpriteStrip | null;
  lemonJump: SpriteStrip | null;
  lemonClimb: SpriteStrip | null;
};

type EnemySprites = {
  crawler: SpriteStrip | null;
  mouse: SpriteStrip | null;
  mouseHurt: SpriteStrip | null;
  penisman: SpriteStrip | null;
  goldenRoachWalk: SpriteStrip | null;
  goldenRoachFly: SpriteStrip | null;
  possessed: SpriteStrip | null;
  shinyPossessed: SpriteStrip | null;
  nephilim: SpriteStrip | null;
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
  const seed =
    options.seed ??
    seedFromUrl() ??
    (Math.floor(Math.random() * 0x7fffffff) | 0);

  const assets = new AssetLoader({ assetBase });
  const fb = new Framebuffer();
  const input = new Input();
  fb.mount(parent);
  input.attach(fb.canvas);

  const dungeon = buildDungeon(BigInt(seed), 1);
  let floorOrdinal = 1;
  /** Mirrors Java GamePanel.enemiesKilledThisRun. */
  let enemiesKilledThisRun = 0;
  let submitDialogOpen = false;
  let pauseSubmitPending = false;
  let pauseMenuHits: PauseMenuHitRects = { submit: { x: 0, y: 0, w: 0, h: 0 } };
  let deathMenuHits: DeathOverlayHitRects = { submit: { x: 0, y: 0, w: 0, h: 0 } };
  const player = new Player();
  player.stats.money = RUN_START_MONEY;
  const pickupOverlay = new ItemPickupOverlay();
  const hudEconomy = new HudEconomyDisplay();
  hudEconomy.sync(player.stats.money, player.stats.keys);
  let pickupOverlayBonusLine = "";
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
  let debug = false;
  /** Java GamePanel.paused — freezes sim; Enter/Esc or HUD pause button toggles. */
  let paused = false;
  let pauseButtonTogglePending = false;
  let fps = 0;
  let ups = 0;
  const itemBitmaps = new Map<string, ImageBitmap>();

  const onPausePointerDown = (e: PointerEvent): void => {
    if (submitDialogOpen) return;
    const rect = fb.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ix = ((e.clientX - rect.left) / rect.width) * INTERNAL_WIDTH;
    const iy = ((e.clientY - rect.top) / rect.height) * INTERNAL_HEIGHT;
    const hudY0 = INTERNAL_HEIGHT - HUD_HEIGHT;
    if (hitTestRect(ix, iy, pauseButtonRect(hudY0))) {
      e.preventDefault();
      pauseButtonTogglePending = true;
      return;
    }
    if (paused && pauseMenuHits.submit.w > 0 && hitTestRect(ix, iy, pauseMenuHits.submit)) {
      e.preventDefault();
      pauseSubmitPending = true;
      return;
    }
    if (
      player.health.isDead &&
      deathMenuHits.submit.w > 0 &&
      hitTestRect(ix, iy, deathMenuHits.submit)
    ) {
      e.preventDefault();
      pauseSubmitPending = true;
    }
  };
  fb.canvas.addEventListener("pointerdown", onPausePointerDown);

  function currentRunSummary(): RunSummary {
    return {
      seed,
      floorReached: floorOrdinal,
      coins: player.stats.money,
      enemiesKilled: enemiesKilledThisRun,
      durationSec: session?.timeSec ?? 0,
      itemIds: player.inventory.ownedIds(),
    };
  }

  async function beginSubmitAndQuit(): Promise<void> {
    if (submitDialogOpen) return;
    submitDialogOpen = true;
    paused = true;
    input.clearHardwareState();
    try {
      const summary = currentRunSummary();
      const result = await openSubmitDialog(summary);
      if (result.action !== "submit") return;
      await submitScore(summary, result.playerName);
      options.onScoreSubmitted?.(summary);
      const leaderboardUrl = new URL("leaderboard.html", window.location.href);
      // Preserve optional scoresApi query for remote boards.
      try {
        const api = new URLSearchParams(window.location.search).get("scoresApi");
        if (api) leaderboardUrl.searchParams.set("scoresApi", api);
      } catch {
        /* ignore */
      }
      // Brief delay so the scores.json download is not cancelled by navigation.
      await new Promise((r) => setTimeout(r, 400));
      window.location.assign(leaderboardUrl.href);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      window.alert(msg);
    } finally {
      submitDialogOpen = false;
      pauseSubmitPending = false;
      input.clearHardwareState();
    }
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
    itemPose: null,
    levelTransition: null,
    specialAttack: null,
    airSpecialAttack: null,
    headbandCrouchAttack: null,
    headbandUpAttack: null,
    headbandSideAttack: null,
    lemonIdle: null,
    lemonCrouch: null,
    lemonTurn: null,
    lemonWalk: null,
    lemonJump: null,
    lemonClimb: null,
  };
  let renderFacing = 1;
  let turnAnimFramesLeft = 0;
  const enemySprites: EnemySprites = {
    crawler: null,
    mouse: null,
    mouseHurt: null,
    penisman: null,
    goldenRoachWalk: null,
    goldenRoachFly: null,
    possessed: null,
    shinyPossessed: null,
    nephilim: null,
  };
  let possessedBulletBmp: ImageBitmap | null = null;
  let possessedBulletDieBmp: ImageBitmap | null = null;
  let penisBulletBmp: ImageBitmap | null = null;
  let penisBulletDieBmp: ImageBitmap | null = null;
  let lilPossessedBulletBmp: ImageBitmap | null = null;
  let lilPossessedBulletDieBmp: ImageBitmap | null = null;
  const possessedHead = new PossessedHeadController();
  const explosions: KillExplosion[] = [];
  const brickChunks: BrickChunk[] = [];
  const frisbeeProjectiles: FrisbeeProjectile[] = [];
  const flintFires: FlintFire[] = [];
  const lemonProjectiles: LemonProjectile[] = [];
  const backpackWeaponSwitch = new BackpackWeaponSwitch();
  let frisbeeStrip: SpriteStrip | null = null;
  let fireStrip: SpriteStrip | null = null;
  let lemonShotStrip: SpriteStrip | null = null;
  let psychicFireStrip: SpriteStrip | null = null;
  retainWeaponPhysicsForPlayerParity();
  const worldPickups: WorldPickup[] = [];
  const pickupBitmaps = new Map<string, ImageBitmap>();
  const pickupCollectStrips = new Map<PickupKind, ImageBitmap>();
  const hitVfxList: HitVfx[] = [];
  const hitVfxSprites = new Map<HitVfxKind, ImageBitmap>();
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

  void assets.hasManifest();

  void (async () => {
    try {
      const catalog = await ItemCatalog.load(assets);
      gamePalette = await GameColorPalette.load(assets);
      gamePaletteRef = gamePalette;
      bgRegistry = await BackgroundPresetRegistry.load(assets);
      roomMathBackgroundPresetId = assignRoomMathBackgroundPresets(
        dungeon.layout,
        bgRegistry,
      );
      const decks = new PedestalItemDecks(catalog, BigInt(seed));
      session = createSession(dungeon, catalog, decks);
      floorOrdinal = dungeon.floorOrdinal;
      miniMapState = createMiniMapState(dungeon.layout.roomCount());
      applyRoomAndSpawn(session, 0, SpawnKind.INITIAL, player);
      mountDeferredRoomPickups(session.dungeon.rooms[session.roomId]!, worldPickups);
      revealMiniMapForRoom(session.dungeon.layout, session.roomId, miniMapState);
      playerWasOnGround = player.onGround;
      snapCameraToPlayer(session);

      try {
        tilesetProject = await TilesetProject.load(assets);
        sheetAtlas = new SheetAtlas(tilesetProject);
        await sheetAtlas.loadSheets(assets, [...tilesetProject.sheetPaths.keys()]);
        tileWorldRenderer = new TileWorldRenderer(sheetAtlas, tilesetProject);
        bossDoorLayout = resolveBossDoorLayout(tilesetProject);
        if (session) {
          enrichDungeonArt(session.dungeon, tilesetProject, contentSeedsOf(session.dungeon));
        }
      } catch {
        tilesetProject = null;
        sheetAtlas = null;
        tileWorldRenderer = null;
        bossDoorLayout = null;
      }

      keyblockStrip = await loadStrip(assets, "sprites/keyblock.png", KEYBLOCK_STRIP_FRAME_COUNT);
      keyblockConnectorStrip = await loadStrip(
        assets,
        "sprites/keyblock connector.png",
        KEYBLOCK_STRIP_FRAME_COUNT,
      );

      pedestalBmp = await loadImageSafe(assets, "sprites/items/item pedestal.png");
      const shopSheet = await loadImageSafe(assets, "sprites/cat shopkeep sheet.png");
      if (shopSheet) shopKeeperFrames = await loadShopKeeperFrames(shopSheet);
      killExplosionBmp = await loadImageSafe(assets, "sprites/kill explosion.png");

      const healthSheet = await loadImageSafe(assets, "sprites/UI health.png");
      if (healthSheet) hudSprites.heartFrames = await sliceHudStrip(healthSheet, 3);
      const soulSheet = await loadImageSafe(assets, "sprites/soul heart.png");
      if (soulSheet) hudSprites.soulHeartFrames = await sliceHudStrip(soulSheet, 2);
      const blackSheet = await loadImageSafe(assets, "sprites/black heart.png");
      if (blackSheet) hudSprites.blackHeartFrames = await sliceHudStrip(blackSheet, 2);
      hudSprites.coin = await loadImageSafe(assets, "sprites/UI coin.png");
      hudSprites.key = await loadImageSafe(assets, "sprites/UI key.png");
      hudSprites.weaponFrame = await loadImageSafe(assets, "sprites/UI weapon.png");
      hudSprites.subweaponFrame = await loadImageSafe(assets, "sprites/UI subweapon.png");
      if (hudSprites.weaponFrame) {
        hudSprites.weaponInner = innerBoxFrom0000feBorder(hudSprites.weaponFrame, 1);
      }
      if (hudSprites.subweaponFrame) {
        hudSprites.subweaponInner = innerBoxFrom0000feBorder(hudSprites.subweaponFrame, 1);
      }
      const statsSheet = await loadImageSafe(assets, "sprites/hud stats.png");
      if (statsSheet) hudSprites.statFrames = await sliceHudStrip(statsSheet, 3);
      const swordSheet = await loadImageSafe(assets, "sprites/items/sword.png");
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
      for (const kind of [
        HitVfxKind.SLASH,
        HitVfxKind.ELECTRIC,
        HitVfxKind.SHIELD_BREAK,
        HitVfxKind.FALLBACK,
      ]) {
        const bmp = await loadImageSafe(assets, `sprites/${hitVfxSpriteFile(kind)}`);
        if (bmp) hitVfxSprites.set(kind, bmp);
      }

      playerSprites.idle = await loadImageSafe(assets, "sprites/vernan idle.png");
      playerSprites.crouch = await loadImageSafe(assets, "sprites/vernan crouch.png");
      playerSprites.turn = await loadImageSafe(assets, "sprites/vernan turn.png");
      playerSprites.walk = await loadStrip(assets, "sprites/vernan walk.png", VERNAN_WALK_FRAMES);
      playerSprites.jump = await loadStrip(assets, "sprites/vernan jump.png", VERNAN_JUMP_FRAMES);
      // Layered climb (base + arm + hair); fall back to legacy flat strip if composite fails.
      const climbLayers = await Promise.all(
        CLIMB_BODY_PARTS.map((part) =>
          loadStrip(assets, `sprites/vernan/climb ${part}.png`, VERNAN_CLIMB_FRAMES),
        ),
      );
      playerSprites.climb =
        (await compositeBodyStrip(climbLayers)) ??
        (await loadStrip(assets, "sprites/vernan climb.png", VERNAN_CLIMB_FRAMES));
      const hurtLayers = await Promise.all(
        (["base", "hair"] as const).map((part) =>
          loadStrip(assets, `sprites/vernan/hurt ${part}.png`, HURT_AIR_SHEET_FRAMES),
        ),
      );
      playerSprites.hurtAir =
        (await compositeBodyStrip(hurtLayers)) ??
        (await loadStrip(assets, "sprites/vernan hurt air.png", HURT_AIR_SHEET_FRAMES));
      playerSprites.attack = await loadStrip(assets, "sprites/vernan attack.png", VERNAN_ATTACK_FRAMES);
      playerSprites.airAttack = await loadStrip(
        assets,
        "sprites/vernan air attack.png",
        VERNAN_ATTACK_FRAMES,
      );
      playerSprites.crouchAttack = await loadStrip(
        assets,
        "sprites/vernan crouch attack.png",
        VERNAN_ATTACK_FRAMES,
      );
      playerSprites.sword = await loadStrip(assets, "sprites/sword attack.png", SWORD_ATTACK_FRAMES);
      playerSprites.crouchSword = await loadStrip(
        assets,
        "sprites/sword crouch attack.png",
        SWORD_ATTACK_FRAMES,
      );
      playerSprites.flintSword = await loadStrip(
        assets,
        "sprites/flint attack.png",
        SWORD_ATTACK_FRAMES,
      );
      playerSprites.crouchFlintSword = await loadStrip(
        assets,
        "sprites/flint crouch attack.png",
        SWORD_ATTACK_FRAMES,
      );
      playerSprites.gemSword = await loadStrip(
        assets,
        "sprites/gem sword attack.png",
        SWORD_ATTACK_FRAMES,
      );
      playerSprites.crouchGemSword = await loadStrip(
        assets,
        "sprites/gem sword crouch attack.png",
        SWORD_ATTACK_FRAMES,
      );
      playerSprites.stickSword = await loadStrip(
        assets,
        "sprites/stick attack.png",
        SWORD_ATTACK_FRAMES,
      );
      playerSprites.crouchStickSword = await loadStrip(
        assets,
        "sprites/stick crouch attack.png",
        SWORD_ATTACK_FRAMES,
      );
      playerSprites.specialAttack = await loadStrip(
        assets,
        "sprites/vernan special attack.png",
        5,
      );
      playerSprites.airSpecialAttack = await loadStrip(
        assets,
        "sprites/vernan air special attack.png",
        5,
      );
      const headbandCrouchLayers = await Promise.all(
        (["base", "hair"] as const).map((part) =>
          loadStrip(assets, `sprites/vernan/crouchattack1 ${part}.png`, 4),
        ),
      );
      playerSprites.headbandCrouchAttack = await compositeBodyStrip(headbandCrouchLayers);
      const headbandUpLayers = await Promise.all(
        (["base", "hair"] as const).map((part) =>
          loadStrip(assets, `sprites/vernan/upattack0 ${part}.png`, 7),
        ),
      );
      playerSprites.headbandUpAttack = await compositeBodyStrip(headbandUpLayers);
      const headbandSideLayers = await Promise.all(
        (["base", "hair"] as const).map((part) =>
          loadStrip(assets, `sprites/vernan/sideattack0 ${part}.png`, 6),
        ),
      );
      playerSprites.headbandSideAttack = await compositeBodyStrip(headbandSideLayers);
      playerSprites.lemonIdle = await loadImageSafe(assets, "sprites/vernan idle lemon.png");
      playerSprites.lemonCrouch = await loadImageSafe(assets, "sprites/vernan crouch lemon.png");
      playerSprites.lemonTurn = await loadImageSafe(assets, "sprites/vernan turn lemon.png");
      playerSprites.lemonWalk = await loadStrip(assets, "sprites/vernan walk lemon.png", VERNAN_WALK_FRAMES);
      playerSprites.lemonJump = await loadStrip(assets, "sprites/vernan jump lemon.png", VERNAN_JUMP_FRAMES);
      playerSprites.lemonClimb = await loadStrip(assets, "sprites/vernan climb lemon.png", VERNAN_CLIMB_FRAMES);
      frisbeeStrip = await loadStrip(
        assets,
        "sprites/DKC-style/frisbee3d.png",
        FrisbeeProjectile.ANIM_FRAME_COUNT,
      );
      fireStrip = await loadStrip(assets, "sprites/fire.png", 4);
      lemonShotStrip = await loadStrip(assets, "sprites/lemon shot.png", 1);
      psychicFireStrip = await loadStrip(assets, "sprites/psychic fire.png", 4);
      const doorEnterLayers = await Promise.all(
        (["base", "arm", "hair"] as const).map((part) =>
          loadStrip(assets, `sprites/vernan/doorenter ${part}.png`, 1),
        ),
      );
      playerSprites.doorEnter = await compositeBodyStrip(doorEnterLayers);
      const doorExitLayers = await Promise.all(
        (["base", "arm", "hair", "face"] as const).map((part) =>
          loadStrip(assets, `sprites/vernan/doorexit ${part}.png`, 1),
        ),
      );
      playerSprites.doorExit = await compositeBodyStrip(doorExitLayers);
      const getupLayers = await Promise.all(
        (["base", "hair"] as const).map((part) =>
          loadStrip(assets, `sprites/vernan/getup ${part}.png`, 1),
        ),
      );
      playerSprites.getup = await compositeBodyStrip(getupLayers);
      // Layered item pose (base + hair); fall back to flat vernan item.png.
      const itemLayers = await Promise.all(
        (["base", "hair"] as const).map((part) =>
          loadStrip(assets, `sprites/vernan/item ${part}.png`, 1),
        ),
      );
      const itemComposite = await compositeBodyStrip(itemLayers);
      playerSprites.itemPose =
        itemComposite?.image ?? (await loadImageSafe(assets, "sprites/vernan item.png"));
      const levelTransLayers = await Promise.all(
        LEVEL_TRANSITION_BODY_PARTS.map((part) =>
          loadStrip(assets, `sprites/vernan/leveltransition ${part}.png`, LEVEL_TRANS_SHEET_FRAMES),
        ),
      );
      playerSprites.levelTransition =
        (await compositeBodyStrip(levelTransLayers)) ??
        (await loadStrip(
          assets,
          "sprites/vernan/level transition.png",
          LEVEL_TRANS_SHEET_FRAMES,
        ));

      enemySprites.crawler = await loadStrip(assets, "sprites/crawler.png", CRAWLER_FRAMES);
      enemySprites.mouse = await loadStrip(assets, "sprites/mouse.png", MOUSE_FRAMES);
      enemySprites.mouseHurt = await loadStrip(assets, "sprites/mouse hurt.png", MOUSE_FRAMES);
      enemySprites.penisman = await loadStrip(assets, "sprites/penisman.png", PENISMAN_FRAMES);
      enemySprites.goldenRoachWalk = await loadStrip(
        assets,
        "sprites/golden roach2.png",
        GOLDEN_ROACH_WALK_FRAMES,
      );
      enemySprites.goldenRoachFly = await loadStrip(
        assets,
        "sprites/golden roach2 fly.png",
        GOLDEN_ROACH_FLY_FRAMES,
      );
      await loadPossessedRig(assets);
      await loadNephilimRig(assets);
      const possessedFrames = Math.max(1, Math.floor(64 / POSSESSED_PART_W));
      enemySprites.possessed = await loadStrip(
        assets,
        "sprites/bosses/possessed.png",
        possessedFrames,
      );
      enemySprites.shinyPossessed = await loadStrip(
        assets,
        "sprites/bosses/shiny possessed.png",
        possessedFrames,
      );
      enemySprites.nephilim = await loadStrip(assets, "sprites/bosses/nephilim.png", 7);
      possessedBulletBmp = await loadImageSafe(assets, "sprites/bosses/possessed bullet.png");
      possessedBulletDieBmp = await loadImageSafe(
        assets,
        "sprites/bosses/possessed bullet die.png",
      );
      penisBulletBmp = await loadImageSafe(assets, "sprites/penis bullet.png");
      penisBulletDieBmp = await loadImageSafe(assets, "sprites/penis bullet die.png");
      lilPossessedBulletBmp = await loadImageSafe(assets, "sprites/lil possessed bullet.png");
      lilPossessedBulletDieBmp = await loadImageSafe(
        assets,
        "sprites/lil possessed bullet die.png",
      );
    } catch (err) {
      bootError = err instanceof Error ? err.message : String(err);
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
    lemonProjectiles.length = 0;
    backpackWeaponSwitch.reset();
  }

  function onBackpackSubweaponSwitched(): void {
    psychicSpoon.clearTelekinesis(brickChunks);
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

  function wireFlintIgniteCallback(): void {
    if (player.inventory.stacksOf("FLINT") > 0) {
      player.setFlintIgniteCallback(spawnFlintFireAtEnemy);
    } else {
      player.setFlintIgniteCallback(null);
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
        spawnBreakableBrickChunks(bx, by, Math.random, brickChunks, 1, "#8a5a3a", null);
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
      if (input.debugTogglePressed) debug = !debug;
      if (!session) return;

      // Java: Enter toggles pause (Esc web UX); HUD II button same. Clear hardware so Z/X don't stick.
      // Skip while dead or item-pickup overlay (Java !itemPickupOverlayActive).
      const wantPauseToggle =
        !submitDialogOpen &&
        !player.health.isDead &&
        !pickupOverlay.isActive() &&
        (input.pauseTogglePressed || pauseButtonTogglePending);
      pauseButtonTogglePending = false;
      if (wantPauseToggle) {
        paused = !paused;
        input.clearHardwareState();
      }

      if (
        !submitDialogOpen &&
        (input.submitRunPressed || pauseSubmitPending) &&
        (paused || player.health.isDead)
      ) {
        pauseSubmitPending = false;
        void beginSubmitAndQuit();
        return;
      }

      if (player.health.isDead) {
        paused = false;
      }

      const map = currentMap(session);

      if (player.health.isDead) {
        if (!submitDialogOpen && (input.jumpPressed || input.attackPressed)) {
          player.health.max = player.stats.maxHealth;
          player.health.refill();
          applyRoomAndSpawn(session, session.roomId, SpawnKind.INITIAL, player);
          worldPickups.length = 0;
          frisbeeProjectiles.length = 0;
          clearWeaponProjectiles();
          player.resetSubweaponAnim();
          mountDeferredRoomPickups(session.dungeon.rooms[session.roomId]!, worldPickups);
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
      for (let i = explosions.length - 1; i >= 0; i--) {
        if (explosions[i]!.done) explosions.splice(i, 1);
      }
      for (const p of worldPickups) p.update(FIXED_DT, map);
      for (const fx of pickupCollectFx) fx.update(FIXED_DT);
      for (let i = pickupCollectFx.length - 1; i >= 0; i--) {
        if (pickupCollectFx[i]!.done) pickupCollectFx.splice(i, 1);
      }
      HitVfx.tickAll(hitVfxList);
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
        if (tilesetProject) {
          enrichDungeonArt(s.dungeon, tilesetProject, contentSeedsOf(s.dungeon));
        }
        if (sheetAtlas && tilesetProject && tileWorldRenderer) {
          tileWorldRenderer.syncSheets(sheetAtlas, tilesetProject);
        }
        if (bgRegistry) {
          roomMathBackgroundPresetId = assignRoomMathBackgroundPresets(
            s.dungeon.layout,
            bgRegistry,
          );
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
        clearWeaponProjectiles();
        worldPickups.length = 0;
        pickupCollectFx.length = 0;
        hitVfxList.length = 0;
        possessedHead.clear();
        player.resetSubweaponAnim();
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
        refreshRoomArtAndCamera();
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
          clearWeaponProjectiles();
          worldPickups.length = 0;
          pickupCollectFx.length = 0;
          hitVfxList.length = 0;
          possessedHead.clear();
          player.resetSubweaponAnim();
          psychicSpoon.reset();
          session!.roomPersistedBrickChunks = new Array(
            session!.dungeon.layout.roomCount(),
          ).fill(null);
          mountDeferredRoomPickups(session!.dungeon.rooms[session!.roomId]!, worldPickups);
          miniMapState = createMiniMapState(session!.dungeon.layout.roomCount());
          refreshRoomArtAndCamera();
          revealMiniMapForRoom(session!.dungeon.layout, session!.roomId, miniMapState);
        },
        screenAnchor: (p: Player, cam: WorldCamera) => ({
          feetY: Math.round(CAMERA_ZOOM * p.spriteFeetWorldY() + cam.ty),
          centerX: Math.round(CAMERA_ZOOM * (p.x + p.w * 0.5) + cam.tx),
        }),
      };

      // Fade / door-pose / ascend blackout freezes gameplay (Java transitionPhase != NONE).
      if (tickSessionRoomTransition(session, player, input, camera, onRoomSwapped, ascendHooks)) {
        tickBrickChunkSim();
        followCamera(session, false);
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
        followCamera(session, false);
        return;
      }

      if (tryDoorTransition(session, player, input)) {
        tickBrickChunkSim();
        followCamera(session, false);
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
      player.update(FIXED_DT, input, map, subweaponHost, pedestalPlatforms);
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
      if (nodeKind === RoomKind.SHOP) {
        ensureShopResolved(session);
        const bought = tryBuyShopPedestal(
          session,
          player,
          input.wasPressed("ArrowUp") || input.wasPressed("KeyW"),
          itemPickupHost,
        );
        if (bought) {
          hudEconomy.startCoinDrain(bought.price, player.stats.money);
          if (bought.itemId === "KALEIDOSCOPE_EYE") ensureKaleidoscopePalette();
          pickupOverlay.begin(bought.itemId, pickupOverlayBonusLine);
          pickupOverlayBonusLine = "";
          void ensureItemArt(session.catalog.def(bought.itemId).spriteFileName);
        }
      } else {
        const collected = tryCollectPedestal(session, player, itemPickupHost);
        if (collected) {
          if (collected === "KALEIDOSCOPE_EYE") ensureKaleidoscopePalette();
          pickupOverlay.begin(collected, pickupOverlayBonusLine);
          pickupOverlayBonusLine = "";
          void ensureItemArt(session.catalog.def(collected).spriteFileName);
        }
      }

      if (pickupOverlay.isActive()) {
        followCamera(session, false);
        return;
      }

      const ped = activePedestal(session);
      if (ped?.itemId && !ped.collected) {
        const def = session.catalog.def(ped.itemId);
        void ensureItemArt(def.spriteFileName);
      }
      for (const sp of activeShopPedestals(session)) {
        if (sp.itemId && !sp.collected) {
          const def = session.catalog.def(sp.itemId);
          void ensureItemArt(def.spriteFileName);
        }
      }
      for (const id of player.inventory.ownedIds()) {
        void ensureItemArt(session.catalog.def(id).spriteFileName);
      }

      // Camera first so Possessed clamps to the same view Vernan sees.
      followCamera(session, true);
      const camView = camera.viewRect();
      const seeR = seeRadiusForRun(false, camView);
      const playerSnap = {
        cx: player.x + player.w * 0.5,
        cy: player.y + player.h * 0.5,
        vx: player.vx,
        vy: player.vy,
        hurtbox: player.hurtbox(),
      };

      for (const e of session.enemies) {
        if (e instanceof Possessed) {
          e.setCameraView(camView);
          e.applyVision(playerSnap, seeR);
        } else if (e instanceof Nephilim) {
          e.setCameraView(camView);
          e.applyVision(playerSnap, seeR);
        } else if (e instanceof Penisman) {
          e.setCameraView(camView);
        } else if (e instanceof GoldenRoach) {
          e.setCameraView(camView);
          e.prepareVisionTick(map);
          e.applyVision(playerSnap.cx, playerSnap.cy, seeR);
        } else if (e instanceof Mouse) {
          e.applyVision(playerSnap, seeR);
        }
      }
      tickEnemyPeerPhysics(
        session.enemies,
        map,
        player.x + player.w * 0.5,
        FIXED_DT,
      );
      for (const e of session.enemies) {
        if (e instanceof Possessed) {
          processPossessedDeathChunks(e, enemySprites.possessed, enemySprites.shinyPossessed, brickChunks);
          for (const [ex, ey] of e.drainExplosionRequests()) {
            explosions.push(new KillExplosion(ex, ey));
          }
        } else if (e instanceof Nephilim) {
          processNephilimDeathChunks(e, enemySprites.nephilim, brickChunks);
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
      const enemyFreeze = player.applyAttackHits(session.enemies, (e, strike, sword, vfx) => {
        const hurt = e.damageReceivePose();
        const contact = contactBetweenAabbs(sword, hurt);
        const kind =
          vfx === "shield_break"
            ? HitVfxKind.SHIELD_BREAK
            : HitVfxKind.SLASH;
        HitVfx.spawn(
          hitVfxList,
          kind,
          e,
          strike.contactWorldX ?? contact.x,
          strike.contactWorldY ?? contact.y,
          strike.freezeFrames,
          player.x + player.w * 0.5,
        );
      });
      const blockFreeze = applySwordBreakables({
        player,
        map,
        roomId: session.roomId,
        rooms: session.dungeon.rooms,
        seams: session.dungeon.secretSeams,
        layout: session.dungeon.layout,
        runSeed: session.dungeon.runSeed,
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
          ),
        snapshotDecoTile: (tileId) => {
          // Authored sheet only — deco must not remap to floor primarySheetId.
          return sheetAtlas?.snapshotTileId(tileId) ?? null;
        },
        activeSeamOpenAnim,
        seamAnimPlayableScrollOverride,
      });
      if (enemyFreeze > 0 || blockFreeze > 0) {
        player.latchAttackHit(Math.max(enemyFreeze, blockFreeze));
      }
      collectWorldPickups(player, worldPickups, hudEconomy, pickupCollectFx);
      player.applyEnemyContacts(session.enemies, (e, strike, contact) => {
        HitVfx.spawn(
          hitVfxList,
          HitVfxKind.ELECTRIC,
          e,
          contact.x,
          contact.y,
          strike.freezeFrames,
          player.x + player.w * 0.5,
        );
      });
      applyPossessedBulletHits(session, player);
      applyPenismanBulletHits(session, player);
      for (const e of session.enemies) maybeSpawnDeathFx(e);
      session.enemies = session.enemies.filter((e) => {
        if (!e.isDead()) return true;
        enemiesKilledThisRun++;
        return false;
      });
      tryProcessRoomClear(session, player);
      tickTurnAnim(player);
    },
    render: () => {
      fb.clear("#0e1218");
      const g = fb.internalCtx;

      if (!session) {
        g.fillStyle = "#1a222c";
        g.fillRect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);
        g.fillStyle = "#c8d2dc";
        g.font = "12px monospace";
        g.fillText(bootError ? `boot error: ${bootError}` : "Loading sprites…", 16, 40);
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
        ensureShopResolved(session);
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
      for (const e of session.enemies) {
        drawEnemy(g, e, camera, enemySprites);
        if (e instanceof Possessed) {
          drawPossessedBullets(g, e, camera, possessedBulletBmp, possessedBulletDieBmp);
        } else if (e instanceof Penisman) {
          drawPenismanBullets(g, e, camera, penisBulletBmp);
          drawPenisBulletDieFx(g, e, camera, penisBulletDieBmp);
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
      if (!levelAscendFadeOut) {
        drawPlayer(
          g,
          player,
          camera,
          playerSprites,
          renderFacing,
          turnAnimFramesLeft > 0,
          session.transition.pose,
          pickupOverlay.isActive(),
        );
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
      for (const f of frisbeeProjectiles) {
        drawFrisbeeProjectile(g, f, camera, frisbeeStrip);
      }
      for (const lp of lemonProjectiles) {
        drawLemonProjectile(g, lp, camera, lemonShotStrip);
      }
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
      const sword = player.attackHitbox();
      if (sword && debug) drawAabb(g, sword, "#f0d060", camera);
      if (debug) {
        drawPlayerHitbox(g, player, camera);
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
        );
      } else {
        pauseMenuHits = { submit: { x: 0, y: 0, w: 0, h: 0 } };
      }

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
        { paused },
      );

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
        deathMenuHits = drawDeathOverlay(g, currentRunSummary());
      } else {
        deathMenuHits = { submit: { x: 0, y: 0, w: 0, h: 0 } };
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

      fb.present();
    },
    onFpsUpdate: (f, u) => {
      fps = f;
      ups = u;
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

  function tickTurnAnim(pl: Player): void {
    const cur = pl.facing >= 0 ? 1 : -1;
    if (!pl.onGround || pl.climbing || pl.isAttacking()) {
      renderFacing = cur;
      turnAnimFramesLeft = 0;
      return;
    }
    if (turnAnimFramesLeft > 0) {
      turnAnimFramesLeft--;
      // Pre-flip half keeps old renderFacing; post-flip snaps to gameplay facing.
      if (turnAnimFramesLeft < TURN_POST_FLIP_FRAMES) {
        renderFacing = cur;
      }
      if (turnAnimFramesLeft === 0) renderFacing = cur;
      return;
    }
    if (cur !== renderFacing) {
      turnAnimFramesLeft = TURN_PRE_FLIP_FRAMES + TURN_POST_FLIP_FRAMES;
    } else {
      renderFacing = cur;
    }
  }

  function maybeSpawnDeathFx(e: CombatEnemy): void {
    // Feet-centered explosions (Java). Crawler/Mouse wait until hitstun ends via takeCorpseExplosion.
    if (e instanceof Crawler || e instanceof Mouse || e instanceof Penisman || e instanceof GoldenRoach) {
      if (e.takeCorpseExplosion() && !dyingFxStarted.has(e)) {
        dyingFxStarted.add(e);
        trySpawnGemKillCoin(e);
        const r = e.rect();
        explosions.push(new KillExplosion(r.x + r.w * 0.5, r.y + r.h));
      }
      return;
    }
    if (e instanceof Possessed) {
      if (e.suppressDeathExplosion()) return;
    }
    if (e instanceof Nephilim) {
      if (e.suppressDeathExplosion()) return;
    }
    if (e.isDead() && !dyingFxStarted.has(e)) {
      dyingFxStarted.add(e);
      trySpawnGemKillCoin(e);
      const r = e.rect();
      explosions.push(new KillExplosion(r.x + r.w * 0.5, r.y + r.h));
    }
  }

  function applyPossessedBulletHits(sess: RoomSession, pl: Player): void {
    if (pl.health.isDead || pl.health.isInvulnerable || pl.isHurtLocked() || pl.isInDefensiveHitstun())
      return;
    const hurt = pl.hurtbox();
    for (const e of sess.enemies) {
      if (!(e instanceof Possessed)) continue;
      e.applyBulletHits(hurt, (dmg, bulletCx) => {
        const scaled = dmg * KaleidoscopeEyeCombat.playerDamageMultiplier();
        if (!pl.health.tryDamage(scaled, CONTACT_DAMAGE_IFRAMES)) return;
        KaleidoscopeEyeCombat.notifyPlayerDamageApplied();
        LeotardCombat.notifyPlayerDamageApplied(scaled);
        const away = pl.x + pl.w * 0.5 >= bulletCx ? 1 : -1;
        // Soften freeze slightly for bullets; knock fires after stun ends.
        pl.beginDefensiveHitstun(Math.max(1, Math.ceil(freezeFrames(scaled) * 0.85)), away);
      });
    }
  }

  function applyPenismanBulletHits(sess: RoomSession, pl: Player): void {
    if (pl.health.isDead || pl.health.isInvulnerable || pl.isHurtLocked() || pl.isInDefensiveHitstun())
      return;
    const hurt = pl.hurtbox();
    for (const e of sess.enemies) {
      if (!(e instanceof Penisman) || e.isDead()) continue;
      e.applyBulletHits(hurt, (dmg, bulletCx) => {
        const scaled = dmg * KaleidoscopeEyeCombat.playerDamageMultiplier();
        if (!pl.health.tryDamage(scaled, CONTACT_DAMAGE_IFRAMES)) return;
        KaleidoscopeEyeCombat.notifyPlayerDamageApplied();
        LeotardCombat.notifyPlayerDamageApplied(scaled);
        const away = pl.x + pl.w * 0.5 >= bulletCx ? 1 : -1;
        pl.beginDefensiveHitstun(Math.max(1, Math.ceil(freezeFrames(scaled) * 0.85)), away);
      });
    }
  }

  loop.start();
  fb.canvas.focus({ preventScroll: true });

  return {
    seed,
    getRunSummary: () => currentRunSummary(),
    destroy: () => {
      loop.stop();
      fb.canvas.removeEventListener("pointerdown", onPausePointerDown);
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
  if (e instanceof Crawler || e instanceof Mouse || e instanceof Penisman) return e.onGround;
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

function drawPlayer(
  g: CanvasRenderingContext2D,
  player: Player,
  camera: WorldCamera,
  sprites: PlayerSprites,
  renderFacing: number,
  turnWindowOpen: boolean,
  doorPose: DoorTransitionPose = DoorTransitionPose.NONE,
  itemPickupPose = false,
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
  const juice = {
    shakeX: player.hitlagShakeX,
    shakeY: player.hitlagShakeY,
    scaleX: player.renderSquashScaleX(),
    scaleY: player.renderSquashScaleY(),
    solidRed: player.hitlagSolidRed,
    hurtTintAlpha: shyFlash > 0 ? shyFlash : player.hurtTintAlpha(),
    tintRgb: shyFlash > 0 ? player.shyMaskFlashRgb() : undefined,
  };

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

  if (player.isGetupLocked() && sprites.getup) {
    // Getup sheet is 48px tall; pin one tile lower so the pose sits on the deck (Java feetAnchorBodyH feel).
    drawFeetPinnedStrip(
      g,
      sprites.getup,
      player.getupAnimFrameIndex(sprites.getup.frameCount),
      cx,
      feet + TILE_SIZE,
      player.facing,
      camera,
      juice,
    );
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
    );
    return;
  }

  if (player.isSubweaponAnimating()) {
    const strip = player.subweaponUsesAirSpecialStrip()
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
    return;
  }

  if (!player.onGround && !player.isWalkOffLedgeActive() && bodySprites.jump) {
    drawFeetPinnedStrip(g, bodySprites.jump, player.jumpFrame(), cx, feet, facing, camera, juice);
    return;
  }

  const turning =
    player.onGround &&
    !player.isWalkOffLedgeActive() &&
    (turnWindowOpen || player.isTurningPose());
  if (turning && bodySprites.turn) {
    drawFeetPinnedImage(g, bodySprites.turn, cx, feet, facing, camera, juice);
    return;
  }

  if (
    (player.onGround || player.isWalkOffLedgeActive()) &&
    (Math.abs(player.vx) > WALK_SPEED_THRESHOLD || player.isWalkOffLedgeActive()) &&
    bodySprites.walk
  ) {
    drawFeetPinnedStrip(g, bodySprites.walk, player.walkFrame(), cx, feet, facing, camera, juice);
    return;
  }

  if (bodySprites.idle) {
    drawFeetPinnedImage(g, bodySprites.idle, cx, feet, facing, camera, juice);
    return;
  }

  const dx = camera.worldToDeviceX(player.x + player.hitlagShakeX);
  const dy = camera.worldToDeviceY(player.y + player.hitlagShakeY);
  const dw = Math.max(1, Math.floor(CAMERA_ZOOM * player.w));
  const dh = Math.max(1, Math.floor(CAMERA_ZOOM * player.h));
  g.fillStyle = player.hitlagSolidRed ? "#ff0000" : "#e8eef5";
  g.fillRect(dx, dy, dw, dh);
}

function drawEnemy(
  g: CanvasRenderingContext2D,
  e: CombatEnemy,
  camera: WorldCamera,
  sprites: EnemySprites,
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
    drawNephilimBoss(g, e, camera, { strip: sprites.nephilim });
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
        {
          shakeX: e.hitlagShakeX,
          shakeY: e.hitlagShakeY,
          scaleX: e.squash.scaleX(),
          scaleY: e.squash.scaleY(),
          solidRed: e.hitlagSolidRed,
          hurtTintAlpha: e.hurtTintAlpha(),
        },
      );
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
        {
          shakeX: e.hitlagShakeX,
          shakeY: e.hitlagShakeY,
          scaleX: e.squash.scaleX(),
          scaleY: e.squash.scaleY(),
          solidRed: e.hitlagSolidRed,
          hurtTintAlpha: e.hurtTintAlpha(),
        },
      );
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
        {
          shakeX: e.hitlagShakeX,
          shakeY: e.hitlagShakeY,
          scaleX: e.squash.scaleX(),
          scaleY: e.squash.scaleY(),
          solidRed: e.hitlagSolidRed,
          hurtTintAlpha: e.hurtTintAlpha(),
        },
      );
      return;
    }
  }

  if (e instanceof GoldenRoach) {
    drawGoldenRoach(g, e, camera, sprites.goldenRoachWalk, sprites.goldenRoachFly);
    return;
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
  const rcx = pickup.renderCenterX();
  const rcy = pickup.renderCenterY();
  const dw = Math.max(1, Math.floor(CAMERA_ZOOM * sw));
  const dh = Math.max(1, Math.floor(CAMERA_ZOOM * sh));
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
  const hurt = player.hurtbox();
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]!;
    const hb = p.hitbox();
    if (
      hurt.x + hurt.w <= hb.x ||
      hb.x + hb.w <= hurt.x ||
      hurt.y + hurt.h <= hb.y ||
      hb.y + hb.h <= hurt.y
    ) {
      continue;
    }
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
): HTMLCanvasElement | null {
  if (!atlas) return null;
  const room = session.dungeon.rooms[session.roomId]!;
  const node = session.dungeon.layout.room(session.roomId);
  const art = room.art;
  const primarySheetId = art?.sheetId ?? project?.primarySheetIdForFloor(floor);

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
  return atlas.snapshotTileId(tileId, primarySheetId);
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

function drawPlayerHitbox(g: CanvasRenderingContext2D, player: Player, camera: WorldCamera): void {
  const pose = player.hitboxPose();
  const verts = pose.worldVertices();
  if (verts.length < 6) {
    drawAabb(g, pose.bounds(), "#6ec8ff", camera);
  } else {
    g.strokeStyle = "#6ec8ff";
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
  const hurt = player.hurtboxPose();
  const hv = hurt.worldVertices();
  if (hv.length >= 6) {
    g.strokeStyle = "#ff6688";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < hv.length; i += 2) {
      const dx = camera.worldToDeviceX(hv[i]!);
      const dy = camera.worldToDeviceY(hv[i + 1]!);
      if (i === 0) g.moveTo(dx + 0.5, dy + 0.5);
      else g.lineTo(dx + 0.5, dy + 0.5);
    }
    g.closePath();
    g.stroke();
  } else {
    drawAabb(g, hurt.bounds(), "#ff6688", camera);
  }
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
