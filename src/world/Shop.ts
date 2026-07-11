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
  PEDESTAL_DRAW_W,
  type ItemPedestal,
} from "./pedestal";
import type { RoomSession } from "./roomTransition";
import type { TileMap } from "./TileMap";
import { PedestalSpawnKind } from "../item/PedestalSpawnKind";
import { PickupKind, WorldPickup } from "./WorldPickup";

/** Head / body / tail frames sliced from the shopkeep sheet. */
export type ShopKeeperFrames = {
  head: ImageBitmap;
  body: ImageBitmap;
  tail: ImageBitmap;
};

/** Java GamePanel.SHOP_PEDESTAL_PRICE. */
export const SHOP_PEDESTAL_PRICE = 15;

/** Java shop heart/key world pickup price. */
export const SHOP_PICKUP_PRICE = 5;

/** Run-start coins (Java PlayerStats.money defaults to 0). */
export const RUN_START_MONEY = 0;

/** World-px size of the shopkeep composite frame (Java shopKeeperFramePx @ scale 1). */
export const SHOPKEEP_FRAME_PX = 32;

/** Salt used by GamePanel pre-xor and again inside {@link rollShopLayout}. */
export const SHOP_LAYOUT_SALT = 0x5104_0ac7_beef_5babn;

/** Heart/key slot from {@link rollShopLayout} (Java RoomGenerator.ShopWorldPickup). */
export type ShopWorldPickupSpec = {
  kind: PickupKind.HEART | PickupKind.KEY;
  feetCenterX: number;
  feetWorldY: number;
  priceCoins: number;
  collected: boolean;
};

export type ShopLayout = {
  pedestals: { anchorX: number; groundTop: number }[];
  pickups: Omit<ShopWorldPickupSpec, "collected">[];
};

/**
 * Java {@code RoomGenerator.rollShopLayout}: 1–6 slots, weighted KEY/HEART/PEDESTAL draws
 * with caps {KEY=1, HEART=3, PEDESTAL=2}. {@code seed} is already pre-xored once by the caller;
 * this xors {@link SHOP_LAYOUT_SALT} again (GamePanel + rollShopLayout double-xor).
 */
export function rollShopLayout(
  seed: bigint,
  w: number,
  groundY: number[],
  ladderTxs: number[],
  doorTxs: number[],
  luck: number,
): ShopLayout {
  const rng = new JavaRandom(seed ^ SHOP_LAYOUT_SALT);
  const totalSlots = 1 + rng.nextInt(6); // 1..6
  const keyCap = 1;
  const heartCap = 3;
  const pedCap = 2;

  const candidates: number[] = [];
  for (let tx = 2; tx <= w - 3; tx++) {
    if (!isAllowedShopSlotTileX(tx, ladderTxs, doorTxs)) continue;
    candidates.push(tx);
  }
  javaShuffle(candidates, rng);

  const chosenTx: number[] = [];
  for (const tx of candidates) {
    if (chosenTx.length >= totalSlots) break;
    let ok = true;
    for (const prev of chosenTx) {
      if (Math.abs(prev - tx) < 2) {
        ok = false;
        break;
      }
    }
    if (ok) chosenTx.push(tx);
  }

  const pedWeight = Math.max(0, 1 + luck);
  const heartWeight = Math.max(0, 3 + 0.25 * luck);
  const keyWeight = 5;

  let keys = 0;
  let hearts = 0;
  let peds = 0;
  const pedList: ShopLayout["pedestals"] = [];
  const pickList: ShopLayout["pickups"] = [];
  for (const tx of chosenTx) {
    const effKey = keys < keyCap ? keyWeight : 0;
    const effHeart = hearts < heartCap ? heartWeight : 0;
    const effPed = peds < pedCap ? pedWeight : 0;
    const total = effKey + effHeart + effPed;
    if (total <= 1e-9) break;
    const r = rng.nextDouble() * total;
    const gyc = groundY[clampInt(tx, 1, w - 2)]!;
    const anchorX = tx * TILE_SIZE + TILE_SIZE * 0.5;
    const groundTop = gyc * TILE_SIZE;
    if (r < effKey) {
      pickList.push({
        kind: PickupKind.KEY,
        feetCenterX: anchorX,
        feetWorldY: groundTop,
        priceCoins: SHOP_PICKUP_PRICE,
      });
      keys++;
    } else if (r < effKey + effHeart) {
      pickList.push({
        kind: PickupKind.HEART,
        feetCenterX: anchorX,
        feetWorldY: groundTop,
        priceCoins: SHOP_PICKUP_PRICE,
      });
      hearts++;
    } else {
      pedList.push({ anchorX, groundTop });
      peds++;
    }
  }
  return { pedestals: pedList, pickups: pickList };
}

/**
 * Lazy SHOP layout resolve (Java resolveDeferredShopLayoutForRoom) + shopkeep.
 * Pedestals on session.shopPedestals; heart/key specs on session.shopWorldPickups.
 */
export function ensureShopResolved(session: RoomSession, luck = 0): void {
  const roomId = session.roomId;
  const node = session.dungeon.layout.room(roomId);
  if (node.kind !== RoomKind.SHOP) return;
  if (session.shopPedestals[roomId] != null) return;

  const g = session.dungeon.rooms[roomId]!;
  const map = g.map;
  const w = map.getWidth();
  const groundY: number[] = [];
  for (let x = 0; x < w; x++) {
    groundY.push(Math.round(map.groundTopWorldYAtColumn(x) / TILE_SIZE));
  }
  const ladderTxs = g.ladderColumnTx >= 0 ? [g.ladderColumnTx] : [];
  const doorTxs: number[] = [];
  if (g.leftDoorTileX >= 0) doorTxs.push(g.leftDoorTileX);
  if (g.rightDoorTileX >= 0) doorTxs.push(g.rightDoorTileX);

  // GamePanel pre-xor; rollShopLayout xors the salt again.
  const shopSeed = node.contentSeed ^ SHOP_LAYOUT_SALT;
  const layout = rollShopLayout(shopSeed, w, groundY, ladderTxs, doorTxs, luck);

  const shopItems = session.decks.drawDistinct(PedestalSpawnKind.SHOP, layout.pedestals.length);
  const peds: ItemPedestal[] = [];
  for (let i = 0; i < shopItems.length; i++) {
    const slot = layout.pedestals[i]!;
    const itemId = shopItems[i]!;
    peds.push(makeItemPedestal(itemId, slot.anchorX, slot.groundTop, SHOP_PEDESTAL_PRICE));
  }
  const picks: ShopWorldPickupSpec[] = layout.pickups.map((p) => ({ ...p, collected: false }));
  session.shopPedestals[roomId] = peds;
  session.shopWorldPickups[roomId] = picks;
  session.shopKeepers[roomId] = placeShopKeeper(map, peds, picks);
}

/** Mount uncollected shop heart/key pickups into the live world list (per room enter). */
export function mountShopWorldPickups(
  session: RoomSession,
  worldPickups: WorldPickup[],
  luck = 0,
): void {
  const roomId = session.roomId;
  if (session.dungeon.layout.room(roomId).kind !== RoomKind.SHOP) return;
  ensureShopResolved(session, luck);
  const specs = session.shopWorldPickups[roomId];
  if (!specs) return;
  for (const sp of specs) {
    if (sp.collected) continue;
    worldPickups.push(
      WorldPickup.createShopPickup(sp.kind, sp.feetCenterX, sp.feetWorldY, sp.priceCoins),
    );
  }
}

export function activeShopWorldPickups(session: RoomSession): ShopWorldPickupSpec[] {
  return session.shopWorldPickups[session.roomId] ?? [];
}

export function activeShopPedestals(session: RoomSession): ItemPedestal[] {
  const list = session.shopPedestals[session.roomId];
  return list ?? [];
}

export function activeShopKeeper(session: RoomSession): ShopKeeper | null {
  return session.shopKeepers[session.roomId] ?? null;
}

export type ShopBuyResult = { itemId: string; price: number };
export type ShopPickupBuyResult = { kind: PickupKind; price: number };

/**
 * Press Up/W while overlapping a priced shop heart/key (Java tryBuyShopPickups).
 * Returns `"blocked"` when overlapping but full HP / can't afford (skip pedestal buy).
 */
export function tryBuyShopPickups(
  session: RoomSession,
  player: Player,
  upPressed: boolean,
  worldPickups: WorldPickup[],
): ShopPickupBuyResult | "blocked" | null {
  if (!upPressed) return null;
  const node = session.dungeon.layout.room(session.roomId);
  if (node.kind !== RoomKind.SHOP) return null;

  ensureShopResolved(session, player.stats.luck);
  const specs = session.shopWorldPickups[session.roomId];
  if (!specs) return null;

  const bodyHit = player.hitboxPose();
  for (let i = 0; i < worldPickups.length; i++) {
    const p = worldPickups[i]!;
    if (p.priceCoins <= 0) continue;
    if (!p.intersectsPlayerHit(bodyHit)) continue;

    if (p.kind === PickupKind.HEART && player.health.isAtFullHealth) return "blocked";
    if (player.stats.money < p.priceCoins) return "blocked";

    const price = p.priceCoins;
    if (p.kind === PickupKind.HEART) player.health.heal(2);
    else if (p.kind === PickupKind.KEY) player.stats.keys++;

    player.stats.money -= price;
    markShopPickupCollected(specs, p);
    worldPickups.splice(i, 1);
    return { kind: p.kind, price };
  }
  return null;
}

function markShopPickupCollected(specs: ShopWorldPickupSpec[], p: WorldPickup): void {
  for (const sp of specs) {
    if (sp.collected || sp.kind !== p.kind) continue;
    if (Math.abs(sp.feetCenterX - p.renderCenterX()) < TILE_SIZE) {
      sp.collected = true;
      return;
    }
  }
  for (const sp of specs) {
    if (!sp.collected && sp.kind === p.kind) {
      sp.collected = true;
      return;
    }
  }
}

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

  ensureShopResolved(session, player.stats.luck);
  const peds = session.shopPedestals[session.roomId];
  if (!peds) return null;

  for (const p of peds) {
    if (p.collected || !p.itemId) continue;
    const itemBox = pedestalItemAabb(p);
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

/** Place cat left of leftmost pedestal (or west wall), clearing ware footprints. */
function placeShopKeeper(
  map: TileMap,
  peds: ItemPedestal[],
  picks: ShopWorldPickupSpec[],
): ShopKeeper {
  const frame = SHOPKEEP_FRAME_PX;
  const catHalf = frame * 0.5;
  const clearMargin = 2;
  const pedHalf = Math.max(PEDESTAL_DRAW_W, TILE_SIZE) * 0.5;
  const wares = peds.map((p) => ({ cx: p.anchorX, half: pedHalf }));
  for (const sp of picks) {
    if (sp.priceCoins > 0) wares.push({ cx: sp.feetCenterX, half: TILE_SIZE * 0.5 });
  }

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

