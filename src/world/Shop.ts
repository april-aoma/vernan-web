import type { Player } from "../entity/Player";
import {
  ShopKeeper,
  SHOPKEEP_EYE_LEFT,
  SHOPKEEP_EYE_RIGHT,
  SHOPKEEP_PUPIL_COLOR,
  SHOPKEEP_PUPIL_H,
  SHOPKEEP_PUPIL_W,
} from "../entity/ShopKeeper";
import type { WorldCamera } from "../camera/WorldCamera";
import { aabbOverlap } from "../combat/CombatMath";
import type { ItemPickupHost } from "../item/effect/ItemPickupHost";
import { JavaRandom } from "../util/JavaRandom";
import { javaShuffle } from "../util/javaCollections";
import { CAMERA_ZOOM, TILE_SIZE } from "../specs";
import { RoomKind } from "./DungeonTypes";
import {
  makeItemPedestal,
  pedestalItemAabb,
  pedestalWorldFromColumn,
  PEDESTAL_DRAW_W,
  type ItemPedestal,
} from "./pedestal";
import type { RoomSession } from "./roomTransition";
import type { TileMap } from "./TileMap";

/** Head / body / tail frames sliced from the shopkeep sheet. */
export type ShopKeeperFrames = {
  head: ImageBitmap;
  body: ImageBitmap;
  tail: ImageBitmap;
};

/** Java GamePanel.SHOP_PEDESTAL_PRICE. */
export const SHOP_PEDESTAL_PRICE = 15;

/** Run-start coins (Java PlayerStats.money defaults to 0). */
export const RUN_START_MONEY = 0;

/** World-px size of the shopkeep composite frame (Java shopKeeperFramePx @ scale 1). */
export const SHOPKEEP_FRAME_PX = 32;

const SHOP_LAYOUT_SALT = 0x5104_0ac7_beef_5babn;

/**
 * Lazy SHOP pedestal resolve + Up-to-buy (Shop A + shopkeep).
 * Pedestals live on session.shopPedestals — not itemPedestal / activePedestal.
 */
export function ensureShopResolved(session: RoomSession): void {
  const roomId = session.roomId;
  const node = session.dungeon.layout.room(roomId);
  if (node.kind !== RoomKind.SHOP) return;
  if (session.shopPedestals[roomId] != null) return;

  const g = session.dungeon.rooms[roomId]!;
  const map = g.map;
  const w = map.getWidth();
  const ladderTxs = g.ladderColumnTx >= 0 ? [g.ladderColumnTx] : [];
  const doorTxs: number[] = [];
  if (g.leftDoorTileX >= 0) doorTxs.push(g.leftDoorTileX);
  if (g.rightDoorTileX >= 0) doorTxs.push(g.rightDoorTileX);

  const rng = new JavaRandom(node.contentSeed ^ SHOP_LAYOUT_SALT);
  const pedCount = 1 + rng.nextInt(2); // 1..2

  const candidates: number[] = [];
  for (let tx = 2; tx <= w - 3; tx++) {
    if (!isAllowedShopSlotTileX(tx, ladderTxs, doorTxs)) continue;
    candidates.push(tx);
  }
  javaShuffle(candidates, rng);

  const chosenTx: number[] = [];
  for (const tx of candidates) {
    if (chosenTx.length >= pedCount) break;
    let ok = true;
    for (const prev of chosenTx) {
      if (Math.abs(prev - tx) < 2) {
        ok = false;
        break;
      }
    }
    if (ok) chosenTx.push(tx);
  }

  const peds: ItemPedestal[] = [];
  for (const tx of chosenTx) {
    const groundTop = map.groundTopWorldYAtColumn(tx);
    const pos = pedestalWorldFromColumn(w, tx, groundTop);
    const itemId = session.decks.drawShop();
    peds.push(makeItemPedestal(itemId, pos.anchorX, pos.groundTop, SHOP_PEDESTAL_PRICE));
  }
  session.shopPedestals[roomId] = peds;
  session.shopKeepers[roomId] = placeShopKeeper(map, peds);
}

export function activeShopPedestals(session: RoomSession): ItemPedestal[] {
  const list = session.shopPedestals[session.roomId];
  return list ?? [];
}

export function activeShopKeeper(session: RoomSession): ShopKeeper | null {
  return session.shopKeepers[session.roomId] ?? null;
}

export type ShopBuyResult = { itemId: string; price: number };

/**
 * Press Up/W while overlapping a shop pedestal to buy for {@link SHOP_PEDESTAL_PRICE}.
 * @returns buy result, or null if no buy.
 */
export function tryBuyShopPedestal(
  session: RoomSession,
  player: Player,
  upPressed: boolean,
  host: ItemPickupHost,
): ShopBuyResult | null {
  if (!upPressed) return null;
  const node = session.dungeon.layout.room(session.roomId);
  if (node.kind !== RoomKind.SHOP) return null;

  ensureShopResolved(session);
  const peds = session.shopPedestals[session.roomId];
  if (!peds) return null;

  for (const p of peds) {
    if (p.collected || !p.itemId) continue;
    const itemBox = pedestalItemAabb(p, session.timeSec);
    if (!itemBox) continue;
    if (!aabbOverlap(player.hurtbox(), itemBox)) continue;

    const price = p.priceCoins ?? SHOP_PEDESTAL_PRICE;
    if (player.stats.money < price) return null;

    player.stats.money -= price;
    const id = p.itemId;
    player.collectItem(id, session.catalog, host);
    session.decks.markAcquired(id);
    p.collected = true;
    return { itemId: id, price };
  }
  return null;
}

/** Place cat left of leftmost pedestal, clearing ware footprints (Java spawnShopKeeperForRoom). */
function placeShopKeeper(map: TileMap, peds: ItemPedestal[]): ShopKeeper {
  const frame = SHOPKEEP_FRAME_PX;
  const catHalf = frame * 0.5;
  const clearMargin = 2;
  const pedHalf = Math.max(PEDESTAL_DRAW_W, TILE_SIZE) * 0.5;
  const wares = peds.map((p) => ({ cx: p.anchorX, half: pedHalf }));

  let preferredX: number;
  if (peds.length > 0) {
    let minPedX = Infinity;
    for (const p of peds) minPedX = Math.min(minPedX, p.anchorX);
    preferredX = minPedX - 2 * TILE_SIZE;
  } else {
    preferredX = 3.5 * TILE_SIZE;
  }

  const loTx = 2;
  const hiTx = map.getWidth() - 3;
  const preferredTx = clampInt(Math.floor(preferredX / TILE_SIZE), loTx, hiTx);

  let bestTx = -1;
  let bestDist = Number.MAX_SAFE_INTEGER;
  for (let tx = loTx; tx <= hiTx; tx++) {
    if (map.isLadderMouthSpawnColumn(tx)) continue;
    const cx = (tx + 0.5) * TILE_SIZE;
    if (!shopKeeperColumnClearOfWares(cx, catHalf, clearMargin, wares)) continue;
    const d = Math.abs(tx - preferredTx);
    if (d < bestDist) {
      bestDist = d;
      bestTx = tx;
    }
  }

  let tx: number;
  if (bestTx >= 0) {
    tx = bestTx;
  } else if (map.isLadderMouthSpawnColumn(preferredTx)) {
    let altTx = -1;
    let altDist = Number.MAX_SAFE_INTEGER;
    for (let t = loTx; t <= hiTx; t++) {
      if (map.isLadderMouthSpawnColumn(t)) continue;
      const d = Math.abs(t - preferredTx);
      if (d < altDist) {
        altDist = d;
        altTx = t;
      }
    }
    tx = altTx >= 0 ? altTx : preferredTx;
  } else {
    tx = preferredTx;
  }

  const centerX = (tx + 0.5) * TILE_SIZE;
  const groundTop = map.groundTopWorldYAtColumn(tx);
  const frameLeftX = centerX - frame / 2;
  const frameTopY = groundTop - frame;
  return new ShopKeeper(frameLeftX, frameTopY, frame);
}

function shopKeeperColumnClearOfWares(
  centerX: number,
  catHalf: number,
  margin: number,
  wares: { cx: number; half: number }[],
): boolean {
  for (const w of wares) {
    if (Math.abs(centerX - w.cx) < catHalf + w.half + margin) return false;
  }
  return true;
}

function isAllowedShopSlotTileX(tx: number, ladderTxs: number[], doorTxs: number[]): boolean {
  for (const L of ladderTxs) {
    if (Math.abs(tx - L) <= 1) return false;
  }
  for (const D of doorTxs) {
    if (Math.abs(tx - D) <= 1) return false;
  }
  return true;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Device-space price tag above a shop pedestal item (Java drawShopPriceLabelsDevice). */
export function drawShopPriceLabel(
  g: CanvasRenderingContext2D,
  deviceX: number,
  deviceY: number,
  price: number,
): void {
  const label = `$${price}`;
  g.font = "10px monospace";
  g.textAlign = "center";
  g.fillStyle = "rgba(0,0,0,0.784)";
  g.fillText(label, deviceX + 1, deviceY + 1);
  g.fillStyle = "#ffeb78";
  g.fillText(label, deviceX, deviceY);
  g.textAlign = "left";
}

/** Slice {@code cat shopkeep sheet.png} into head/body/tail (3×32). */
export async function loadShopKeeperFrames(
  sheet: ImageBitmap,
): Promise<ShopKeeperFrames | null> {
  const fw = Math.max(1, Math.floor(sheet.width / 3));
  const fh = sheet.height;
  if (fw < 1 || fh < 1) return null;
  const slice = async (i: number): Promise<ImageBitmap> => {
    const c = document.createElement("canvas");
    c.width = fw;
    c.height = fh;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, i * fw, 0, fw, fh, 0, 0, fw, fh);
    return createImageBitmap(c);
  };
  return {
    head: await slice(0),
    body: await slice(1),
    tail: await slice(2),
  };
}

/**
 * Draw cat shopkeep before Vernan (Java drawShopKeeperDevice).
 * Tail row-warp + head bob + pupils tracking player center.
 */
export function drawShopKeeper(
  g: CanvasRenderingContext2D,
  keeper: ShopKeeper,
  frames: ShopKeeperFrames,
  camera: WorldCamera,
  timeSec: number,
  playerCx: number,
  playerCy: number,
): void {
  const frame = keeper.frameSize;
  const frameLeftDevX = camera.worldToDeviceX(keeper.frameLeftWorldX);
  const frameTopDevY = camera.worldToDeviceY(keeper.frameTopWorldY);
  const dim = Math.round(CAMERA_ZOOM * frame);
  const headDyWorld = keeper.headBobWorldDy(timeSec);
  const headTopDevY = frameTopDevY + Math.round(CAMERA_ZOOM * headDyWorld);

  g.imageSmoothingEnabled = false;

  // Tail (behind): per-row horizontal sine warp.
  const tail = frames.tail;
  const rows = Math.min(frame, tail.height);
  const sw = tail.width;
  for (let row = 0; row < rows; row++) {
    const oxWorld = keeper.tailRowOffsetWorldX(row, timeSec);
    const sx1 = camera.worldToDeviceX(keeper.frameLeftWorldX + oxWorld);
    const sy1 = camera.worldToDeviceY(keeper.frameTopWorldY + row);
    const sy2 = camera.worldToDeviceY(keeper.frameTopWorldY + row + 1);
    g.drawImage(tail, 0, row, sw, 1, sx1, sy1, dim, Math.max(1, sy2 - sy1));
  }

  // Body (static).
  g.drawImage(frames.body, frameLeftDevX, frameTopDevY, dim, dim);

  // Head (bobbing).
  g.drawImage(frames.head, frameLeftDevX, headTopDevY, dim, dim);

  drawShopKeeperPupil(
    g,
    keeper,
    SHOPKEEP_EYE_LEFT,
    frameLeftDevX,
    headTopDevY,
    headDyWorld,
    playerCx,
    playerCy,
  );
  drawShopKeeperPupil(
    g,
    keeper,
    SHOPKEEP_EYE_RIGHT,
    frameLeftDevX,
    headTopDevY,
    headDyWorld,
    playerCx,
    playerCy,
  );
}

function drawShopKeeperPupil(
  g: CanvasRenderingContext2D,
  keeper: ShopKeeper,
  eye: readonly [number, number, number, number] | readonly number[],
  frameLeftDevX: number,
  headTopDevY: number,
  headDyWorld: number,
  pcx: number,
  pcy: number,
): void {
  const minX = eye[0]!;
  const minY = eye[1]!;
  const maxX = eye[2]!;
  const maxY = eye[3]!;

  const eyeCenterFrameX = (minX + maxX + 1) * 0.5;
  const eyeCenterFrameY = (minY + maxY + 1) * 0.5;
  const eyeWorldX = keeper.frameLeftWorldX + eyeCenterFrameX;
  const eyeWorldY = keeper.frameTopWorldY + headDyWorld + eyeCenterFrameY;
  let ax = pcx - eyeWorldX;
  let ay = pcy - eyeWorldY;
  const len = Math.hypot(ax, ay);
  if (len > 1e-6) {
    ax /= len;
    ay /= len;
  }

  const roamMaxX = maxX - (SHOPKEEP_PUPIL_W - 1);
  const roamMaxY = maxY - (SHOPKEEP_PUPIL_H - 1);
  const slackX = (roamMaxX - minX) * 0.5;
  const slackY = (roamMaxY - minY) * 0.5;
  const cx = (minX + roamMaxX) * 0.5;
  const cy = (minY + roamMaxY) * 0.5;
  let px = Math.round(cx + ax * slackX);
  let py = Math.round(cy + ay * slackY);
  px = Math.max(minX, Math.min(roamMaxX, px));
  py = Math.max(minY, Math.min(roamMaxY, py));

  const dx = frameLeftDevX + Math.round(CAMERA_ZOOM * px);
  const dy = headTopDevY + Math.round(CAMERA_ZOOM * py);
  const w = Math.max(1, Math.round(CAMERA_ZOOM * SHOPKEEP_PUPIL_W));
  const h = Math.max(1, Math.round(CAMERA_ZOOM * SHOPKEEP_PUPIL_H));
  g.fillStyle = SHOPKEEP_PUPIL_COLOR;
  g.fillRect(dx, dy, w, h);
}

