import type { WorldCamera } from "../camera/WorldCamera";
import { CAMERA_ZOOM, TILE_SIZE } from "../specs";
import type { DecoStamp } from "../tileset/placeAmbientDeco";
import type { ContextThemeRule } from "../tileset/ContextThemeSubstitution";
import { drawShellTiles } from "../tileset/drawShellTiles";
import type { SheetAtlas } from "../tileset/SheetAtlas";
import type { TerrainTileBridge } from "../tileset/TerrainTileBridge";
import type { TilesetProject } from "../tileset/TilesetProject";
import type { TileWorldRenderer } from "../tileset/TileWorldRenderer";
import type { PlayerItemInventory } from "../item/PlayerItemInventory";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { RoomKind } from "../world/DungeonTypes";
import { PickupKind, decoLootKind, terrainLootKind } from "../world/BreakableLootRoll";
import { packCell } from "../world/BossDoorSealAnim";
import type { SecretSeam } from "../world/SecretEntrancePlacer";
import {
  TILE_DOOR,
  TILE_LADDER,
  type TileMap,
} from "../world/TileMap";
import {
  PluckOutcomeKind,
  fruitVariantIndex,
  rollGrassLoot,
  rollGrassItemForRun,
  type PluckOutcome,
} from "../world/PluckLootRoll";
import type { Player } from "../entity/Player";
import { CarryKind } from "./CarryKind";
import {
  drawIceSnapWithLiveReflection,
  type BackbufferSample,
} from "../combat/drawIceBlock";
import { HELD_ABOVE_FEET, SPRITE_H, SPRITE_W } from "./CarryFruitLayout";
import type { PluckInstantPreview } from "./PlayerCarry";
import type { ThrownCarryProjectile } from "./ThrownCarryProjectile";

export const ALL_SEEING_GHOST_ALPHA = 0.5;

export type AllSeeingDrawContext = {
  inventory: PlayerItemInventory;
  runSeed: bigint;
  roomId: number;
  map: TileMap;
  deco: readonly DecoStamp[] | undefined;
  seams: SecretSeam[] | null | undefined;
  camera: WorldCamera;
  atlas: SheetAtlas | null;
  project: TilesetProject | null;
  tileWorld: TileWorldRenderer | null;
  bridge: TerrainTileBridge | null;
  roomKind: RoomKind;
  displaySalt: bigint;
  floorOrdinal: number;
  simTick: number;
  primarySheetId: string | undefined;
  doorDestByCell: Map<number, RoomKind> | null;
  contextThemeRules: ContextThemeRule[] | null;
  isHiddenShellBreakable: (tx: number, ty: number) => boolean;
  pickupBitmaps: ReadonlyMap<string, ImageBitmap>;
  itemBitmaps: ReadonlyMap<string, ImageBitmap>;
  fruitSprite: ImageBitmap | null;
  catalog: ItemCatalog;
};

export function drawAllSeeingEyeOverlays(
  g: CanvasRenderingContext2D,
  ctx: AllSeeingDrawContext,
): void {
  if (ctx.inventory.stacksOf("ALL_SEEING_EYE") <= 0) return;
  drawAllSeeingGhostDoors(g, ctx);
  drawAllSeeingBuriedLoot(g, ctx);
}

function drawAllSeeingGhostDoors(g: CanvasRenderingContext2D, ctx: AllSeeingDrawContext): void {
  if (!ctx.atlas || !ctx.seams?.length) return;
  const vis = visibleTileRange(ctx.camera, ctx.map);
  const prevAlpha = g.globalAlpha;
  g.globalAlpha = ALL_SEEING_GHOST_ALPHA;
  try {
    for (let ty = vis.ty0; ty <= vis.ty1; ty++) {
      for (let tx = vis.tx0; tx <= vis.tx1; tx++) {
        const restore = hiddenBreakableRestoreTile(ctx.seams, ctx.roomId, tx, ty);
        if (restore !== TILE_DOOR && restore !== TILE_LADDER) continue;
        const saved = ctx.map.tileAt(tx, ty);
        ctx.map.setTile(tx, ty, restore);
        drawShellTiles(g, ctx.map, ctx.camera, ctx.atlas, () => {}, {
          floorOrdinal: ctx.floorOrdinal,
          primarySheetId: ctx.primarySheetId,
          project: ctx.project,
          bridge: ctx.bridge,
          roomKind: ctx.roomKind,
          displaySalt: ctx.displaySalt,
          decoStamps: ctx.deco ? [...ctx.deco] : undefined,
          simTick: ctx.simTick,
          tileWorld: ctx.tileWorld,
          doorDestByCell: ctx.doorDestByCell,
          contextThemeRules: ctx.contextThemeRules,
          isHiddenShellBreakable: ctx.isHiddenShellBreakable,
        });
        ctx.map.setTile(tx, ty, saved);
      }
    }
  } finally {
    g.globalAlpha = prevAlpha;
  }
}

function drawAllSeeingBuriedLoot(g: CanvasRenderingContext2D, ctx: AllSeeingDrawContext): void {
  const vis = visibleTileRange(ctx.camera, ctx.map);
  const prevAlpha = g.globalAlpha;
  g.globalAlpha = ALL_SEEING_GHOST_ALPHA;
  const cells = new Set<number>();
  try {
    for (let ty = vis.ty0; ty <= vis.ty1; ty++) {
      for (let tx = vis.tx0; tx <= vis.tx1; tx++) {
        if (!ctx.map.isBreakableTile(tx, ty) || ctx.isHiddenShellBreakable(tx, ty)) continue;
        const kind = terrainLootKind(ctx.runSeed, ctx.roomId, tx, ty);
        if (kind == null) continue;
        cells.add(packCell(tx, ty));
        drawPickupGhost(g, ctx, kind, tx, ty);
      }
    }
    for (const d of ctx.deco ?? []) {
      if (!d.breakableDeco) continue;
      if (d.tx < vis.tx0 || d.tx > vis.tx1 || d.ty < vis.ty0 || d.ty > vis.ty1) continue;
      const key = packCell(d.tx, d.ty);
      if (cells.has(key)) continue;
      const kind = ctx.map.isBreakableTile(d.tx, d.ty)
        ? terrainLootKind(ctx.runSeed, ctx.roomId, d.tx, d.ty)
        : decoLootKind(ctx.runSeed, ctx.roomId, d.tx, d.ty, d.tileId);
      if (kind == null) continue;
      cells.add(key);
      drawPickupGhost(g, ctx, kind, d.tx, d.ty);
    }
    if (ctx.inventory.hasSubweaponEverAcquired("GARDENING_GLOVES")) {
      for (const d of ctx.deco ?? []) {
        const tid = d.tileId?.trim();
        if (!tid) continue;
        if (d.tx < vis.tx0 || d.tx > vis.tx1 || d.ty < vis.ty0 || d.ty > vis.ty1) continue;
        const oid = ctx.project?.objectByTileId.get(tid)?.id ?? (tid === "grass" ? "grass" : null);
        if (!oid || !isGardeningPluckable(ctx.project, oid)) continue;
        const previewTy = d.ty + 1;
        if (previewTy >= ctx.map.getHeight()) continue;
        const key = packCell(d.tx, previewTy);
        if (cells.has(key)) continue;
        const outcome = rollGrassLoot(ctx.runSeed, ctx.roomId, d.tx, d.ty, tid);
        const itemId =
          outcome.kind === PluckOutcomeKind.ITEM
            ? rollGrassItemForRun(
                ctx.runSeed,
                ctx.roomId,
                d.tx,
                d.ty,
                tid,
                new Set(ctx.inventory.ownedIds()),
                ctx.catalog,
              )
            : outcome.itemId;
        const resolved =
          outcome.kind === PluckOutcomeKind.ITEM ? { ...outcome, itemId } : outcome;
        cells.add(key);
        drawGrassLootGhost(g, ctx, resolved, d.tx, d.ty, tid, d.tx, previewTy);
      }
    }
  } finally {
    g.globalAlpha = prevAlpha;
  }
}

function isGardeningPluckable(project: TilesetProject | null, objectId: string): boolean {
  const obj = project?.objectById.get(objectId);
  if (obj) return obj.gardeningPluckable;
  return objectId === "grass" || objectId === "blue grass";
}

function drawPickupGhost(
  g: CanvasRenderingContext2D,
  ctx: AllSeeingDrawContext,
  kind: PickupKind,
  tx: number,
  ty: number,
): void {
  const bmp = ctx.pickupBitmaps.get(pickupSpriteFile(kind));
  if (!bmp) return;
  const cx = tx * TILE_SIZE + TILE_SIZE * 0.5;
  const cy = ty * TILE_SIZE + TILE_SIZE * 0.5;
  drawCenteredBitmap(g, ctx.camera, bmp, cx, cy);
}

function drawGrassLootGhost(
  g: CanvasRenderingContext2D,
  ctx: AllSeeingDrawContext,
  outcome: PluckOutcome,
  grassTx: number,
  grassTy: number,
  decoTileId: string,
  tx: number,
  ty: number,
): void {
  const kind = ghostPickupKind(outcome);
  if (kind != null) {
    drawPickupGhost(g, ctx, kind, tx, ty);
    return;
  }
  if (outcome.kind === PluckOutcomeKind.FRUIT && ctx.fruitSprite) {
    const variant = fruitVariantIndex(ctx.runSeed, ctx.roomId, grassTx, grassTy, decoTileId);
    const frameW = SPRITE_W;
    const frameH = SPRITE_H;
    const frameCount = Math.max(1, Math.floor(ctx.fruitSprite.width / frameW));
    const variantIdx = ((variant % frameCount) + frameCount) % frameCount;
    const cx = tx * TILE_SIZE + TILE_SIZE * 0.5;
    const cy = ty * TILE_SIZE + TILE_SIZE * 0.5;
    const dx = ctx.camera.worldToDeviceX(cx - frameW * 0.5);
    const dy = ctx.camera.worldToDeviceY(cy - frameH * 0.5);
    const dw = Math.floor(CAMERA_ZOOM * frameW);
    const dh = Math.floor(CAMERA_ZOOM * frameH);
    g.drawImage(ctx.fruitSprite, variantIdx * frameW, 0, frameW, frameH, dx, dy, dw, dh);
    return;
  }
  if (outcome.kind === PluckOutcomeKind.ITEM && outcome.itemId) {
    let bmp: ImageBitmap | undefined;
    try {
      bmp = ctx.itemBitmaps.get(ctx.catalog.def(outcome.itemId).spriteFileName);
    } catch {
      bmp = undefined;
    }
    if (!bmp) return;
    const cx = tx * TILE_SIZE + TILE_SIZE * 0.5;
    const cy = ty * TILE_SIZE + TILE_SIZE * 0.5;
    drawCenteredBitmap(g, ctx.camera, bmp, cx, cy);
  }
}

function ghostPickupKind(outcome: PluckOutcome): PickupKind | null {
  switch (outcome.kind) {
    case PluckOutcomeKind.HEART:
      return PickupKind.HEART;
    case PluckOutcomeKind.COIN_10:
      return PickupKind.COIN_10;
    case PluckOutcomeKind.COIN_ANY:
      return outcome.coinKind;
    default:
      return null;
  }
}

function pickupSpriteFile(kind: PickupKind): string {
  switch (kind) {
    case PickupKind.HEART:
      return "heart.png";
    case PickupKind.KEY:
      return "key.png";
    case PickupKind.COIN_1:
      return "coin.png";
    case PickupKind.COIN_5:
      return "coin 5.png";
    case PickupKind.COIN_10:
      return "coin 10.png";
  }
}

function drawCenteredBitmap(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  bmp: ImageBitmap,
  cx: number,
  cy: number,
): void {
  const sw = bmp.width;
  const sh = bmp.height;
  const dx = camera.worldToDeviceX(cx - sw * 0.5);
  const dy = camera.worldToDeviceY(cy - sh * 0.5);
  const dw = Math.floor(CAMERA_ZOOM * sw);
  const dh = Math.floor(CAMERA_ZOOM * sh);
  g.drawImage(bmp, dx, dy, dw, dh);
}

function hiddenBreakableRestoreTile(
  seams: SecretSeam[] | null | undefined,
  roomId: number,
  tx: number,
  ty: number,
): number {
  if (!seams) return -1;
  for (const seam of seams) {
    const restore = seam.hiddenBreakableRestoreTile(roomId, tx, ty);
    if (restore >= 0) return restore;
  }
  return -1;
}

function visibleTileRange(
  camera: WorldCamera,
  map: TileMap,
): { tx0: number; ty0: number; tx1: number; ty1: number } {
  const rect = camera.viewRect();
  const tx0 = Math.max(0, Math.floor(rect.x / TILE_SIZE));
  const ty0 = Math.max(0, Math.floor(rect.y / TILE_SIZE));
  const tx1 = Math.min(map.getWidth() - 1, Math.floor((rect.x + rect.w) / TILE_SIZE));
  const ty1 = Math.min(map.getHeight() - 1, Math.floor((rect.y + rect.h) / TILE_SIZE));
  return { tx0, ty0, tx1, ty1 };
}

export function previewFromOutcome(
  outcome: PluckOutcome,
  itemId: string | null,
): PluckInstantPreview | null {
  switch (outcome.kind) {
    case PluckOutcomeKind.HEART:
      return { outcomeKind: PluckOutcomeKind.HEART, coinKind: null, itemId: null };
    case PluckOutcomeKind.COIN_10:
      return { outcomeKind: PluckOutcomeKind.COIN_10, coinKind: PickupKind.COIN_10, itemId: null };
    case PluckOutcomeKind.COIN_ANY:
      return { outcomeKind: PluckOutcomeKind.COIN_ANY, coinKind: outcome.coinKind, itemId: null };
    case PluckOutcomeKind.ITEM:
      return { outcomeKind: PluckOutcomeKind.ITEM, coinKind: null, itemId: itemId };
    default:
      return null;
  }
}

export function drawCarryHeldAndThrown(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  player: Player,
  fruitSprite: ImageBitmap | null,
  thrown: readonly ThrownCarryProjectile[],
  pickupBitmaps?: ReadonlyMap<string, ImageBitmap>,
  itemBitmaps?: ReadonlyMap<string, ImageBitmap>,
  catalog?: ItemCatalog,
  reflectionBackbuffer: BackbufferSample | null = null,
): void {
  const held = player.carryPayload();
  const preview = player.carryPluckPreview();
  if (held?.breakableTileSnap) {
    if (held.kind === CarryKind.ICE_BLOCK) {
      drawIceSnapHeld(g, camera, held.breakableTileSnap, player, held.iceMirrorSourceX, reflectionBackbuffer);
    } else {
      drawSnap(g, camera, held.breakableTileSnap, player);
    }
  } else if (held?.kind === CarryKind.FRUIT && fruitSprite) {
    drawFruit(g, camera, fruitSprite, player, held.fruitVariantIndex);
  } else if (preview) {
    drawPluckPreviewOverhead(g, camera, player, preview, fruitSprite, pickupBitmaps, itemBitmaps, catalog);
  }
  for (const proj of thrown) {
    if (!proj.isAlive() || proj.isSettledFruit()) continue;
    if (proj.payload.kind === CarryKind.FRUIT && fruitSprite) {
      drawFruitAt(
        g,
        camera,
        fruitSprite,
        proj.x,
        proj.y,
        proj.payload.fruitVariantIndex,
        proj.vx >= 0 ? 1 : -1,
      );
    } else if (proj.payload.breakableTileSnap) {
      if (proj.payload.kind === CarryKind.ICE_BLOCK) {
        drawIceSnapAt(
          g,
          camera,
          proj.payload.breakableTileSnap,
          proj.x,
          proj.y,
          proj.payload.iceMirrorSourceX,
          reflectionBackbuffer,
        );
      } else {
        drawSnapAt(g, camera, proj.payload.breakableTileSnap, proj.x, proj.y);
      }
    }
  }
  for (const proj of thrown) {
    if (!proj.isSettledFruit() || !fruitSprite) continue;
    drawFruitAt(
      g,
      camera,
      fruitSprite,
      proj.x,
      proj.y,
      proj.payload.fruitVariantIndex,
      proj.vx >= 0 ? 1 : -1,
    );
  }
}

function drawPluckPreviewOverhead(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  player: Player,
  preview: PluckInstantPreview,
  fruitSprite: ImageBitmap | null,
  pickupBitmaps?: ReadonlyMap<string, ImageBitmap>,
  itemBitmaps?: ReadonlyMap<string, ImageBitmap>,
  catalog?: ItemCatalog,
): void {
  if (preview.outcomeKind === PluckOutcomeKind.FRUIT && fruitSprite) {
    drawFruit(g, camera, fruitSprite, player, 0);
    return;
  }
  const feet = player.y + player.h;
  const cx = player.x + player.w * 0.5;
  const top = feet - HELD_ABOVE_FEET - TILE_SIZE;
  const left = cx - TILE_SIZE * 0.5;
  if (preview.outcomeKind === PluckOutcomeKind.HEART) {
    const bmp = pickupBitmaps?.get(pickupSpriteFile(PickupKind.HEART));
    if (bmp) drawPickupBmpAt(g, camera, bmp, left, top);
    return;
  }
  if (preview.outcomeKind === PluckOutcomeKind.COIN_10 || preview.outcomeKind === PluckOutcomeKind.COIN_ANY) {
    const kind = preview.coinKind ?? PickupKind.COIN_1;
    const bmp = pickupBitmaps?.get(pickupSpriteFile(kind));
    if (bmp) drawPickupBmpAt(g, camera, bmp, left, top);
    return;
  }
  if (preview.outcomeKind === PluckOutcomeKind.ITEM && preview.itemId && catalog && itemBitmaps) {
    const bmp = itemBitmaps.get(catalog.def(preview.itemId).spriteFileName);
    if (bmp) drawPickupBmpAt(g, camera, bmp, left, top);
  }
}

function drawPickupBmpAt(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  bmp: ImageBitmap,
  left: number,
  top: number,
): void {
  const dx = camera.worldToDeviceX(left);
  const dy = camera.worldToDeviceY(top);
  const dw = Math.floor(CAMERA_ZOOM * TILE_SIZE);
  const dh = dw;
  g.imageSmoothingEnabled = false;
  g.drawImage(bmp, 0, 0, bmp.width, bmp.height, dx, dy, dw, dh);
}

function drawFruit(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  fruit: ImageBitmap,
  player: Player,
  variant: number,
): void {
  const feet = player.y + player.h;
  const cx = player.x + player.w * 0.5;
  const fruitFeet = feet - HELD_ABOVE_FEET;
  const left = cx - SPRITE_W * 0.5;
  drawFruitAt(g, camera, fruit, left, fruitFeet - SPRITE_H, variant, player.facing);
}

function drawFruitAt(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  fruit: ImageBitmap,
  left: number,
  top: number,
  variant: number,
  facing: number,
): void {
  const frameW = SPRITE_W;
  const frameH = SPRITE_H;
  const frameCount = Math.max(1, Math.floor(fruit.width / frameW));
  const variantIdx = ((variant % frameCount) + frameCount) % frameCount;
  const dx = camera.worldToDeviceX(left);
  // Java GardeningGlovesSupport.worldSpriteTopDeviceY(fruitFeet, frameH)
  const dy = camera.worldSpriteTopDeviceY(top + frameH, frameH);
  const dw = Math.floor(CAMERA_ZOOM * frameW);
  const dh = Math.floor(CAMERA_ZOOM * frameH);
  const sx = variantIdx * frameW;
  if (facing >= 0) {
    g.drawImage(fruit, sx, 0, frameW, frameH, dx, dy, dw, dh);
  } else {
    g.drawImage(fruit, sx + frameW, 0, -frameW, frameH, dx, dy, dw, dh);
  }
}

function drawSnap(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  snap: HTMLCanvasElement,
  player: Player,
): void {
  const feet = player.y + player.h;
  const cx = player.x + player.w * 0.5;
  const top = feet - HELD_ABOVE_FEET - TILE_SIZE;
  const left = cx - TILE_SIZE * 0.5;
  drawSnapAt(g, camera, snap, left, top);
}

function drawSnapAt(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  snap: HTMLCanvasElement,
  left: number,
  top: number,
): void {
  const dx = camera.worldToDeviceX(left);
  const dy = camera.worldToDeviceY(top);
  const dw = Math.floor(CAMERA_ZOOM * snap.width);
  const dh = Math.floor(CAMERA_ZOOM * snap.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(snap, dx, dy, dw, dh);
}

function drawIceSnapHeld(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  snap: HTMLCanvasElement,
  player: Player,
  mirrorSourceX: boolean,
  backbuffer: BackbufferSample | null,
): void {
  const feet = player.y + player.h;
  const cx = player.x + player.w * 0.5;
  const top = feet - HELD_ABOVE_FEET - TILE_SIZE;
  const left = cx - TILE_SIZE * 0.5;
  drawIceSnapAt(g, camera, snap, left, top, mirrorSourceX, backbuffer);
}

function drawIceSnapAt(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  snap: HTMLCanvasElement,
  left: number,
  top: number,
  mirrorSourceX: boolean,
  backbuffer: BackbufferSample | null,
): void {
  drawIceSnapWithLiveReflection(g, camera, snap, left, top, mirrorSourceX, backbuffer);
}
