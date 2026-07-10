import { AssetLoader } from "./assets/AssetLoader";
import { resolveCameraScrollBounds, highestLadderRow, lowestLadderRow, usesTierOneCamera, type PlayableScrollX } from "./camera/playableScroll";
import { WorldCamera, type CameraFollowInput } from "./camera/WorldCamera";
import { Input } from "./input/Input";
import { GameLoop } from "./loop/GameLoop";
import { Framebuffer } from "./render/Framebuffer";
import {
  drawAttackComposite,
  drawFeetPinnedImage,
  drawFeetPinnedStrip,
  drawFeetRowAnchoredStripDevice,
  drawStripFrame,
  stripFromImage,
  type SpriteStrip,
} from "./render/SpriteDraw";
import {
  CLIMB_BODY_PARTS,
  LEVEL_TRANSITION_BODY_PARTS,
  compositeBodyStrip,
} from "./render/VernanBodyComposite";
import { Player } from "./entity/Player";
import { Possessed } from "./entity/Possessed";
import { Crawler } from "./entity/Crawler";
import type { CombatEnemy } from "./entity/CombatEnemy";
import { ItemCatalog } from "./item/ItemCatalog";
import { ItemPickupOverlay } from "./item/ItemPickupOverlay";
import { PedestalItemDecks } from "./item/PedestalItemDecks";
import { drawItemPickupCell, ITEM_PICKUP_CELL } from "./item/ItemSpriteArt";
import { SubweaponCooldowns } from "./item/SubweaponCooldowns";
import {
  createMiniMapState,
  drawBottomHud,
  innerBoxFrom0000feBorder,
  revealMiniMapForRoom,
  sliceHudStrip,
  slicePickupCell,
  type BottomHudSprites,
  type MiniMapState,
} from "./ui/BottomHud";
import { HudEconomyDisplay } from "./ui/HudEconomy";
import { BrickChunk } from "./fx/BrickChunk";
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
import { resolveDisplayTileId } from "./tileset/resolveDisplayTile";
import { resolveShellTileId } from "./tileset/ShellTileResolve";
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
import { CONTACT_DAMAGE_IFRAMES } from "./config/CombatStats";
import {
  CAMERA_ENEMY_FOCUS_RADIUS_TILES,
  CAMERA_LADDER_ENEMY_BELOW_EXTRA_FRAC,
  CAMERA_LADDER_ENEMY_BELOW_MAX_X_WORLD,
} from "./config/Physics";
import { seeRadiusForRun } from "./combat/EnemyVision";
import { freezeFrames } from "./combat/CombatMath";
import {
  CRAWLER_FRAMES,
  HURT_AIR_SHEET_FRAMES,
  POSSESSED_BODY_FRAME,
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
  TILE_KEYBLOCK,
  TILE_KEYBLOCK_CONNECTOR,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "./world/TileMap";
import { buildDungeon } from "./world/buildDungeon";
import {
  PEDESTAL_DRAW_H,
  PEDESTAL_DRAW_W,
  pedestalItemAabb,
  type ItemPedestal,
} from "./world/pedestal";
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
  type RoomSession,
} from "./world/roomTransition";
import type { LevelAscendState } from "./world/roomFade";
import { TilesetProject } from "./tileset/TilesetProject";
import { SheetAtlas } from "./tileset/SheetAtlas";
import { drawShellTiles } from "./tileset/drawShellTiles";
import { enrichDungeonArt } from "./tileset/enrichDungeonArt";
import {
  applySwordBreakables,
  finishSeamOpenAnimInstant,
  tickSeamOpenAnim,
} from "./world/BreakableStrike";
import { onRoomEntered } from "./world/SecretEntrancePlacer";
import type { SecretSeamOpenAnim } from "./world/SecretSeamOpenAnim";

export type MountOptions = {
  assetBase?: string;
  seed?: number;
};

export type VernanHandle = {
  readonly seed: number;
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
  doorEnter: SpriteStrip | null;
  doorExit: SpriteStrip | null;
  getup: SpriteStrip | null;
  /** Arms-raised pickup / shop-buy pose (`vernan item.png`). */
  itemPose: ImageBitmap | null;
  /** Boss floor-ascend descent strip (11 frames). */
  levelTransition: SpriteStrip | null;
};

type EnemySprites = {
  crawler: SpriteStrip | null;
  possessed: SpriteStrip | null;
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
  const player = new Player();
  player.stats.money = RUN_START_MONEY;
  const pickupOverlay = new ItemPickupOverlay();
  const hudEconomy = new HudEconomyDisplay();
  hudEconomy.sync(player.stats.money, player.stats.keys);
  const subweaponCooldowns = new SubweaponCooldowns();
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
  let debug = true;
  let fps = 0;
  let ups = 0;
  const itemBitmaps = new Map<string, ImageBitmap>();
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
    doorEnter: null,
    doorExit: null,
    getup: null,
    itemPose: null,
    levelTransition: null,
  };
  let renderFacing = 1;
  let turnAnimFramesLeft = 0;
  const enemySprites: EnemySprites = {
    crawler: null,
    possessed: null,
  };
  let possessedBulletBmp: ImageBitmap | null = null;
  const explosions: KillExplosion[] = [];
  const brickChunks: BrickChunk[] = [];
  const worldPickups: WorldPickup[] = [];
  const pickupBitmaps = new Map<string, ImageBitmap>();
  const pickupCollectFx: PickupCollectFx[] = [];
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

  void assets.hasManifest();

  void (async () => {
    try {
      const catalog = await ItemCatalog.load(assets);
      const decks = new PedestalItemDecks(catalog, BigInt(seed));
      session = createSession(dungeon, catalog, decks);
      floorOrdinal = dungeon.floorOrdinal;
      miniMapState = createMiniMapState(dungeon.layout.roomCount());
      applyRoomAndSpawn(session, 0, SpawnKind.INITIAL, player);
      revealMiniMapForRoom(session.dungeon.layout, session.roomId, miniMapState);
      playerWasOnGround = player.onGround;
      snapCameraToPlayer(session);

      try {
        tilesetProject = await TilesetProject.load(assets);
        sheetAtlas = new SheetAtlas(tilesetProject);
        await sheetAtlas.loadSheets(assets, [...tilesetProject.sheetPaths.keys()]);
        if (session) {
          enrichDungeonArt(session.dungeon, tilesetProject, contentSeedsOf(session.dungeon));
        }
      } catch {
        tilesetProject = null;
        sheetAtlas = null;
      }

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
      for (const kind of [HitVfxKind.SLASH, HitVfxKind.FALLBACK]) {
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
      enemySprites.possessed = await loadStrip(
        assets,
        "sprites/bosses/possessed.png",
        Math.max(1, Math.floor(64 / POSSESSED_PART_W)),
      );
      possessedBulletBmp = await loadImageSafe(assets, "sprites/bosses/possessed bullet.png");
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

  const loop = new GameLoop({
    update: () => {
      if (input.debugTogglePressed) debug = !debug;
      if (!session) return;
      const map = currentMap(session);
      session.timeSec += FIXED_DT;

      for (const fx of explosions) fx.update(FIXED_DT);
      for (let i = explosions.length - 1; i >= 0; i--) {
        if (explosions[i]!.done) explosions.splice(i, 1);
      }
      for (const c of brickChunks) c.update(FIXED_DT, map);
      for (let i = brickChunks.length - 1; i >= 0; i--) {
        if (brickChunks[i]!.done) brickChunks.splice(i, 1);
      }
      for (const p of worldPickups) p.update(FIXED_DT, map);
      for (const fx of pickupCollectFx) fx.update(FIXED_DT);
      for (let i = pickupCollectFx.length - 1; i >= 0; i--) {
        if (pickupCollectFx[i]!.done) pickupCollectFx.splice(i, 1);
      }
      HitVfx.tickAll(hitVfxList);

      if (player.health.isDead) {
        if (input.jumpPressed || input.attackPressed) {
          player.health.max = player.stats.maxHealth;
          player.health.refill();
          applyRoomAndSpawn(session, session.roomId, SpawnKind.INITIAL, player);
          playerWasOnGround = player.onGround;
          snapCameraToPlayer(session);
        } else {
          followCamera(session, false);
        }
        return;
      }

      // Item pickup overlay freezes combat sim (Java itemPickupOverlayActive).
      if (pickupOverlay.isActive()) {
        pickupOverlay.tick(FIXED_DT);
        hudEconomy.tick(player.stats.money, player.stats.keys);
        subweaponCooldowns.tick(FIXED_DT);
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
        return;
      }

      const roomBeforeTransition = session.roomId;
      const refreshRoomArtAndCamera = () => {
        const s = session!;
        floorOrdinal = s.dungeon.floorOrdinal;
        if (tilesetProject) {
          enrichDungeonArt(s.dungeon, tilesetProject, contentSeedsOf(s.dungeon));
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
        brickChunks.length = 0;
        worldPickups.length = 0;
        pickupCollectFx.length = 0;
        hitVfxList.length = 0;
        // Fade-swap only (pending spawn set). Skip boss-ascend rebuild — stale pendingSpawnKind.
        if (isRoomTransitionActive(s.transition) && roomBeforeTransition !== s.roomId) {
          onRoomEntered(
            s.dungeon.layout,
            s.dungeon.rooms,
            s.dungeon.secretSeams,
            roomBeforeTransition,
            s.roomId,
            s.transition.pendingSpawnKind,
          );
        }
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
          worldPickups.length = 0;
          pickupCollectFx.length = 0;
          hitVfxList.length = 0;
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
        followCamera(session, false);
        return;
      }

      // Ladder before door (Java order); may start fade (incl. boss ascend cinematic).
      if (tryLadderTransition(session, player, input, camera)) {
        followCamera(session, false);
        return;
      }

      if (tryDoorTransition(session, player, input)) {
        followCamera(session, false);
        return;
      }

      playerWasOnGround = player.onGround;
      player.update(FIXED_DT, input, map);
      tickBossDoorSealAnim(session);

      const nodeKind = session.dungeon.layout.room(session.roomId).kind;
      if (nodeKind === RoomKind.SHOP) {
        ensureShopResolved(session);
        const bought = tryBuyShopPedestal(
          session,
          player,
          input.wasPressed("ArrowUp") || input.wasPressed("KeyW"),
        );
        if (bought) {
          hudEconomy.startCoinDrain(bought.price, player.stats.money);
          pickupOverlay.begin(bought.itemId);
          void ensureItemArt(session.catalog.def(bought.itemId).spriteFileName);
        }
      } else {
        const collected = tryCollectPedestal(session, player);
        if (collected) {
          pickupOverlay.begin(collected);
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
        }
        if (!e.isDead()) e.update(FIXED_DT, map, player.x);
        maybeSpawnDeathFx(e);
      }
      const enemyFreeze = player.applyAttackHits(session.enemies, (e, strike, sword) => {
        const hurt = e.damageReceivePose();
        const contact = contactBetweenAabbs(sword, hurt);
        HitVfx.spawn(
          hitVfxList,
          HitVfxKind.SLASH,
          e,
          contact.x,
          contact.y,
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
        activeSeamOpenAnim,
        seamAnimPlayableScrollOverride,
      });
      if (enemyFreeze > 0 || blockFreeze > 0) {
        player.latchAttackHit(Math.max(enemyFreeze, blockFreeze));
      }
      collectWorldPickups(player, worldPickups, hudEconomy, pickupCollectFx);
      player.applyEnemyContacts(session.enemies);
      applyPossessedBulletHits(session, player);
      for (const e of session.enemies) maybeSpawnDeathFx(e);
      session.enemies = session.enemies.filter((e) => !e.isDead());
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

      g.fillStyle = "#1a222c";
      g.fillRect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);

      drawTiles(g, map, camera, session, sheetAtlas, tilesetProject, floorOrdinal);
      drawPedestal(g, activePedestal(session), session, camera, pedestalBmp, itemBitmaps);
      if (node.kind === RoomKind.SHOP) {
        ensureShopResolved(session);
        for (const sp of activeShopPedestals(session)) {
          drawPedestal(g, sp, session, camera, pedestalBmp, itemBitmaps);
          if (!sp.collected && sp.itemId) {
            const box = pedestalItemAabb(sp, session.timeSec);
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
          drawPossessedBullets(g, e, camera, possessedBulletBmp);
        }
      }
      for (const c of brickChunks) drawBrickChunk(g, c, camera);
      drawHitVfx(g, hitVfxList, camera, hitVfxSprites);
      for (const p of worldPickups) drawWorldPickup(g, p, camera, pickupBitmaps);
      drawPickupCollectFx(g, pickupCollectFx, camera, pickupCollectStrips);
      for (const fx of explosions) {
        drawKillExplosion(g, fx, camera, killExplosionBmp);
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

      const boss = session.enemies.find((e) => e instanceof Possessed) as Possessed | undefined;
      if (boss && !boss.isDead()) {
        drawBossHpBar(g, boss.getHealth(), boss.maxHp, boss.isWindingUp());
      }

      g.restore();

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
        g.fillStyle = "rgba(0,0,0,0.45)";
        g.fillRect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);
        g.fillStyle = "#e8eef5";
        g.font = "14px monospace";
        g.fillText("YOU DIED — press Z/X to retry room", 100, WORLD_VIEWPORT_H * 0.5);
      }

      if (pickupOverlay.isActive()) {
        const overlayId = pickupOverlay.itemId;
        const overlayBmp =
          overlayId != null
            ? itemBitmaps.get(session.catalog.def(overlayId).spriteFileName) ?? null
            : null;
        pickupOverlay.draw(g, session.catalog, overlayBmp);
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
    // Feet-centered explosions (Java). Crawler waits until hitstun ends via takeCorpseExplosion.
    if (e instanceof Crawler) {
      if (e.takeCorpseExplosion() && !dyingFxStarted.has(e)) {
        dyingFxStarted.add(e);
        const r = e.rect();
        explosions.push(new KillExplosion(r.x + r.w * 0.5, r.y + r.h));
      }
      return;
    }
    if (e instanceof Possessed) {
      if (e.isDying() && !dyingFxStarted.has(e)) {
        dyingFxStarted.add(e);
        const r = e.rect();
        explosions.push(new KillExplosion(r.x + r.w * 0.5, r.y + r.h));
      }
      return;
    }
    if (e.isDead() && !dyingFxStarted.has(e)) {
      dyingFxStarted.add(e);
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
        if (!pl.health.tryDamage(dmg, CONTACT_DAMAGE_IFRAMES)) return;
        const away = pl.x + pl.w * 0.5 >= bulletCx ? 1 : -1;
        // Soften freeze slightly for bullets; knock fires after stun ends.
        pl.beginDefensiveHitstun(Math.max(1, Math.ceil(freezeFrames(dmg) * 0.85)), away);
      });
    }
  }

  loop.start();
  fb.canvas.focus({ preventScroll: true });

  return {
    seed,
    destroy: () => {
      loop.stop();
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
  if (e instanceof Crawler) return e.onGround;
  return false;
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
): void {
  const room = session.dungeon.rooms[session.roomId]!;
  const node = session.dungeon.layout.room(session.roomId);
  const art = room.art;
  const primarySheetId = art?.sheetId ?? project?.primarySheetIdForFloor(floor);
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
      floorOrdinal: floor,
      primarySheetId,
      project,
      bridge: art?.bridge ?? null,
      roomKind: room.kind,
      displaySalt: node.contentSeed,
      decoStamps: art?.decoStamps,
    },
  );
}

function drawPedestal(
  g: CanvasRenderingContext2D,
  p: ItemPedestal | null,
  session: RoomSession,
  camera: WorldCamera,
  pedestalBmp: ImageBitmap | null,
  itemBitmaps: Map<string, ImageBitmap>,
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
  const box = pedestalItemAabb(p, session.timeSec);
  if (!box) return;
  const def = session.catalog.def(p.itemId);
  const bmp = itemBitmaps.get(def.spriteFileName);
  const idx = camera.worldToDeviceX(box.x);
  const idy = camera.worldToDeviceY(box.y);
  const idw = Math.floor(CAMERA_ZOOM * box.w);
  const idh = Math.floor(CAMERA_ZOOM * box.h);
  if (bmp) {
    drawItemPickupCell(g, bmp, idx, idy, idw, idh);
  } else {
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
  const juice = {
    shakeX: player.hitlagShakeX,
    shakeY: player.hitlagShakeY,
    scaleX: player.squash.scaleX(),
    scaleY: player.squash.scaleY(),
    solidRed: player.hitlagSolidRed,
    hurtTintAlpha: player.hurtTintAlpha(),
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

  if (player.isAttacking() && sprites.attack) {
    const crouchSwing = player.isGroundCrouchAttack();
    const body = crouchSwing
      ? (sprites.crouchAttack ?? sprites.attack)
      : !player.onGround && sprites.airAttack
        ? sprites.airAttack
        : sprites.attack;
    const sword = crouchSwing ? (sprites.crouchSword ?? sprites.sword) : sprites.sword;
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
    );
    return;
  }

  if (player.climbing && sprites.climb) {
    drawFeetPinnedStrip(g, sprites.climb, player.climbFrame(), cx, feet, facing, camera, juice);
    return;
  }

  const useCrouch =
    sprites.crouch &&
    (player.crouching ||
      player.isCrouchJumpMode() ||
      player.isJumpSquatting() ||
      player.isLandingLocked());
  if (useCrouch && sprites.crouch) {
    drawFeetPinnedImage(g, sprites.crouch, cx, feet, facing, camera, juice);
    return;
  }

  if (!player.onGround && !player.isWalkOffLedgeActive() && sprites.jump) {
    drawFeetPinnedStrip(g, sprites.jump, player.jumpFrame(), cx, feet, facing, camera, juice);
    return;
  }

  const turning =
    player.onGround &&
    !player.isWalkOffLedgeActive() &&
    (turnWindowOpen || player.isTurningPose());
  if (turning && sprites.turn) {
    drawFeetPinnedImage(g, sprites.turn, cx, feet, facing, camera, juice);
    return;
  }

  if (
    (player.onGround || player.isWalkOffLedgeActive()) &&
    (Math.abs(player.vx) > WALK_SPEED_THRESHOLD || player.isWalkOffLedgeActive()) &&
    sprites.walk
  ) {
    drawFeetPinnedStrip(g, sprites.walk, player.walkFrame(), cx, feet, facing, camera, juice);
    return;
  }

  if (sprites.idle) {
    drawFeetPinnedImage(g, sprites.idle, cx, feet, facing, camera, juice);
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
    if (e.isDying()) {
      const t = Math.min(1, e.deathProgress() / 4);
      if (t > 0.85) return;
    }
    const rect = e.rect();
    const cx = rect.x + rect.w * 0.5;
    const cy = rect.y + rect.h * 0.5;
    if (sprites.possessed) {
      const left = cx - POSSESSED_PART_W * 0.5;
      const top = cy - POSSESSED_PART_W * 0.5;
      if (e.flashVisible()) {
        g.fillStyle = "#ffffff";
        const dx = camera.worldToDeviceX(left);
        const dy = camera.worldToDeviceY(top);
        g.fillRect(
          dx,
          dy,
          Math.floor(CAMERA_ZOOM * POSSESSED_PART_W),
          Math.floor(CAMERA_ZOOM * POSSESSED_PART_W),
        );
      } else {
        drawStripFrame(
          g,
          sprites.possessed,
          POSSESSED_BODY_FRAME,
          left,
          top,
          e.facingSign(),
          camera,
          e.hitlagSolidRed() ? { solidRed: true } : undefined,
        );
      }
      // Wind-up telegraph: pulsing ring
      if (e.isWindingUp()) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 80);
        g.strokeStyle = `rgba(255,220,120,${0.4 + pulse * 0.5})`;
        g.lineWidth = 2;
        const rdx = camera.worldToDeviceX(cx);
        const rdy = camera.worldToDeviceY(cy);
        g.beginPath();
        g.arc(rdx, rdy, Math.floor(CAMERA_ZOOM * (10 + pulse * 4)), 0, Math.PI * 2);
        g.stroke();
      }
      return;
    }
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

  const rect = e.rect();
  const dx = camera.worldToDeviceX(rect.x);
  const dy = camera.worldToDeviceY(rect.y);
  const dw = Math.max(1, Math.floor(CAMERA_ZOOM * rect.w));
  const dh = Math.max(1, Math.floor(CAMERA_ZOOM * rect.h));
  g.fillStyle = e instanceof Possessed ? "#9b5bb8" : "#c07070";
  g.fillRect(dx, dy, dw, dh);
}

function drawBossHpBar(
  g: CanvasRenderingContext2D,
  hp: number,
  maxHp: number,
  windingUp: boolean,
): void {
  const barW = 160;
  const barH = 6;
  const x = (INTERNAL_WIDTH - barW) * 0.5;
  const y = 8;
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(x - 1, y - 1, barW + 2, barH + 2);
  g.fillStyle = "#3a2030";
  g.fillRect(x, y, barW, barH);
  const frac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  g.fillStyle = windingUp ? "#ffe8a0" : "#c060e0";
  g.fillRect(x, y, Math.floor(barW * frac), barH);
  g.fillStyle = "#e8d0f0";
  g.font = "9px monospace";
  g.fillText(windingUp ? "POSSESSED !" : "POSSESSED", x, y + barH + 10);
}

function drawBrickChunk(
  g: CanvasRenderingContext2D,
  chunk: BrickChunk,
  camera: WorldCamera,
): void {
  const s = BrickChunk.SIZE;
  const cx = camera.worldToDeviceX(chunk.x + s * 0.5);
  const cy = camera.worldToDeviceY(chunk.y + s * 0.5);
  const dw = Math.max(1, Math.floor(CAMERA_ZOOM * s));
  g.save();
  g.translate(cx, cy);
  g.rotate(chunk.angle);
  if (chunk.sprite) {
    g.imageSmoothingEnabled = false;
    g.drawImage(
      chunk.sprite.image,
      chunk.sprite.sx,
      chunk.sprite.sy,
      chunk.sprite.sw,
      chunk.sprite.sh,
      -dw * 0.5,
      -dw * 0.5,
      dw,
      dw,
    );
  } else {
    g.fillStyle = chunk.color;
    g.fillRect(-dw * 0.5, -dw * 0.5, dw, dw);
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
  let tileId: string | null = null;
  if (project && art?.bridge) {
    tileId = resolveDisplayTileId(
      project,
      art.bridge,
      map,
      tx,
      ty,
      room.kind,
      node.contentSeed,
      floor,
    );
  }
  if (!tileId) tileId = resolveShellTileId(map, tx, ty);
  if (!tileId) return null;
  return atlas.snapshotTileId(tileId, primarySheetId);
}

function drawPossessedBullets(
  g: CanvasRenderingContext2D,
  boss: Possessed,
  camera: WorldCamera,
  sheet: ImageBitmap | null,
): void {
  const frameW = 8;
  for (const b of boss.bulletsCopy()) {
    if (b.dead) continue;
    const left = b.x - frameW * 0.5;
    const top = b.y - frameW * 0.5;
    const dx = camera.worldToDeviceX(left);
    const dy = camera.worldToDeviceY(top);
    const dw = Math.floor(CAMERA_ZOOM * frameW);
    const dh = Math.floor(CAMERA_ZOOM * frameW);
    const fi = Math.floor(b.age / 0.09) % 2;
    if (sheet && sheet.width >= frameW * 2) {
      g.imageSmoothingEnabled = false;
      g.drawImage(sheet, fi * frameW, 0, frameW, sheet.height, dx, dy, dw, dh);
    } else {
      g.fillStyle = "#e8c0ff";
      g.beginPath();
      g.arc(dx + dw * 0.5, dy + dh * 0.5, dw * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
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
    return;
  }
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
