import { HeartKind } from "../combat/Health";
import { KCandyForgetHud, KCandyForgetTarget } from "../item/KCandyForgetHud";
import type { Player } from "../entity/Player";
import type { ItemCatalog } from "../item/ItemCatalog";
import { resolveSwordProfile } from "../combat/SwordProfile";
import { primaryItemIdForVisual } from "../combat/SwordVisual";
import { drawItemHudIcon, drawItemPickupCellContainedInRect } from "../item/ItemSpriteArt";
import type { SubweaponCooldowns } from "../item/SubweaponCooldowns";
import { HUD_HEIGHT, INTERNAL_HEIGHT, INTERNAL_WIDTH } from "../specs";
import type { DungeonLayout } from "../world/DungeonLayout";
import { RoomKind } from "../world/DungeonTypes";
import {
  computeBottomHudGeometry,
  ECON_ICON,
  HEART_GAP,
  HEART_SLOT,
  ITEM_GAP,
  ITEM_ICON,
  itemStripCapacity,
  PAD_L,
  PAD_R,
  STAT_CLUSTER_GAP,
  STAT_ICON,
  STAT_PAD_BEFORE_MINIMAP,
  STAT_PAD_BEFORE_WEAPON_SLOTS,
  STAT_VALUE_GAP,
  WEAPON_SLOT,
  weaponSlotsLeftX,
  type BottomHudGeometry,
} from "./BottomHudLayout";
import {
  formatHudDamageDisplay,
  formatHudStatValue,
  formatMoneyHud,
  type HudEconomyDisplay,
  uiHeartFrameIndexForSlot,
  uiSpecialHeartFrameIndex,
} from "./HudEconomy";

export type BottomHudSprites = {
  heartFrames: ImageBitmap[]; // 3×8 from UI health.png
  soulHeartFrames: ImageBitmap[]; // 2×8 from soul heart.png
  blackHeartFrames: ImageBitmap[]; // 2×8 from black heart.png
  coin: ImageBitmap | null;
  key: ImageBitmap | null;
  weaponFrame: ImageBitmap | null;
  subweaponFrame: ImageBitmap | null;
  /** Inner content box in frame image space {x,y,w,h}; zeros = full slot. */
  weaponInner: { x: number; y: number; w: number; h: number };
  subweaponInner: { x: number; y: number; w: number; h: number };
  /** 3×8 from hud stats.png — damage / squat / windup. */
  statFrames: ImageBitmap[];
  /** Left 16×16 of sword.png for weapon slot. */
  swordPickup: ImageBitmap | null;
};

export type MiniMapState = {
  visited: boolean[];
  adjacentSeen: boolean[];
};

/** Item ids that gate minimap reveal (Java ItemId.MAP / COMPASS / EYE_OF_HORUS). */
export const MINIMAP_ITEM_MAP = "MAP";
export const MINIMAP_ITEM_COMPASS = "COMPASS";
export const MINIMAP_ITEM_EYE = "EYE_OF_HORUS";

export type MiniMapRevealFlags = {
  /** MAP: colored ITEM/SHOP/BOSS cells even when unvisited. */
  map: boolean;
  /** COMPASS: dark silhouette of non-secret layout. */
  compass: boolean;
  /** EYE_OF_HORUS: reveal secret / super-secret rooms. */
  eyeOfHorus: boolean;
};

export function miniMapRevealFlags(inv: {
  stacksOf(id: string): number;
}): MiniMapRevealFlags {
  return {
    map: inv.stacksOf(MINIMAP_ITEM_MAP) > 0,
    compass: inv.stacksOf(MINIMAP_ITEM_COMPASS) > 0,
    eyeOfHorus: inv.stacksOf(MINIMAP_ITEM_EYE) > 0,
  };
}

export type KCandyHudDrawState = {
  forget: KCandyForgetHud;
  usesRemaining: number;
  hudRedDisplayed: number;
};

export type BottomHudDrawOpts = {
  paused?: boolean;
  kCandy?: KCandyHudDrawState;
};

/**
 * Draw the full Java-style bottom HUD band.
 * Web: minimap sits at the right end; virtual controls live in the display shell.
 */
export function drawBottomHud(
  g: CanvasRenderingContext2D,
  player: Player,
  catalog: ItemCatalog,
  itemBitmaps: Map<string, ImageBitmap>,
  sprites: BottomHudSprites,
  economy: HudEconomyDisplay,
  layout: DungeonLayout,
  roomId: number,
  miniMap: MiniMapState,
  subCooldowns: SubweaponCooldowns,
  opts: BottomHudDrawOpts = {},
): void {
  const hud = computeBottomHudGeometry(INTERNAL_WIDTH, INTERNAL_HEIGHT, HUD_HEIGHT);
  const slots = player.health.hudSlotCount();
  const kCandy = opts.kCandy;
  const forget = kCandy?.forget;
  const heartOp = forget ? forget.opacity(KCandyForgetTarget.HEARTS) : 1;
  const coinOp = forget ? forget.opacity(KCandyForgetTarget.COINS) : 1;
  const keyOp = forget ? forget.opacity(KCandyForgetTarget.KEYS) : 1;
  const statOp = forget ? forget.opacity(KCandyForgetTarget.COMBAT_STATS) : 1;
  const passiveOp = forget ? forget.opacity(KCandyForgetTarget.PASSIVE_STRIP) : 1;
  const weaponOp = forget ? forget.opacity(KCandyForgetTarget.WEAPON_SLOTS) : 1;
  const mapOp = forget ? forget.opacity(KCandyForgetTarget.MAP) : 1;
  const redCur =
    kCandy && kCandy.hudRedDisplayed >= 0
      ? kCandy.hudRedDisplayed
      : player.health.getRedCurrent();
  const redMax = player.health.getRedMax();

  g.fillStyle = "#000000";
  g.fillRect(0, hud.y0, INTERNAL_WIDTH, HUD_HEIGHT);
  g.imageSmoothingEnabled = false;
  g.font = "10px monospace";

  withHudOpacity(g, heartOp, () => drawHeartsRow(g, player, sprites, hud, slots, redCur, redMax));
  withHudOpacity(g, coinOp, () => drawEconomyRow(g, player, sprites, economy, hud, keyOp));
  withHudOpacity(g, statOp, () => drawCombatStats(g, player, sprites, hud, minimapLeftEdge(layout, hud)));
  withHudOpacity(g, passiveOp, () => drawPassiveStrip(g, player, catalog, itemBitmaps, hud));
  withHudOpacity(g, weaponOp, () =>
    drawWeaponSlots(g, player, catalog, itemBitmaps, sprites, hud, subCooldowns, kCandy),
  );
  withHudOpacity(g, mapOp, () => drawMiniMap(g, layout, roomId, miniMap, hud, miniMapRevealFlags(player.inventory)));
  if (forget?.isBlackout()) {
    g.fillStyle = "#000000";
    g.fillRect(0, hud.y0, INTERNAL_WIDTH, HUD_HEIGHT);
  }
}

function withHudOpacity(g: CanvasRenderingContext2D, alpha: number, draw: () => void): void {
  if (alpha <= 0.01) return;
  if (alpha >= 0.99) {
    draw();
    return;
  }
  g.save();
  g.globalAlpha = alpha;
  draw();
  g.restore();
}

function drawHudUsesBadge(
  g: CanvasRenderingContext2D,
  boxLeft: number,
  boxTop: number,
  boxSize: number,
  uses: number,
): void {
  const text = String(Math.max(0, uses));
  g.font = "bold 8px monospace";
  const tw = g.measureText(text).width;
  const tx = boxLeft + boxSize - tw - 1;
  const ty = boxTop + boxSize - 2;
  g.fillStyle = "rgba(0,0,0,0.86)";
  g.fillText(text, tx + 1, ty + 1);
  g.fillStyle = "rgb(255,240,200)";
  g.fillText(text, tx, ty);
  g.font = "10px monospace";
}

const MINIMAP_ALPHA_VISITED = 230;
const MINIMAP_ALPHA_UNVISITED = 130;
const MINIMAP_ALPHA_CURRENT = 250;
const MINIMAP_CELL_W = 7;
const MINIMAP_CELL_H = 5;
const MINIMAP_CELL_GAP = 2;

/** Minimap right-edge anchor (web: freed by moving controls to the display shell). */
function minimapRightEdgeX(): number {
  return INTERNAL_WIDTH - PAD_R;
}

function minimapOriginX(totalW: number): number {
  return Math.max(PAD_L, minimapRightEdgeX() - totalW);
}

function drawHeartsRow(
  g: CanvasRenderingContext2D,
  player: Player,
  sprites: BottomHudSprites,
  hud: BottomHudGeometry,
  slots: number,
  redCur: number,
  redMax: number,
): void {
  let hx = PAD_L;
  const redFrames = sprites.heartFrames;
  let redSlotIndex = 0;
  if (redFrames.length >= 3) {
    for (let slot = 0; slot < slots; slot++) {
      const kind = player.health.hudKind(slot);
      const fill = player.health.hudFill(slot);
      let icon: ImageBitmap | null = null;
      if (kind === HeartKind.RED) {
        const fi = uiHeartFrameIndexForSlot(redSlotIndex, redCur, redMax);
        icon = redFrames[fi] ?? null;
        redSlotIndex++;
      } else if (kind === HeartKind.SOUL && fill > 0.01 && sprites.soulHeartFrames.length >= 2) {
        icon = sprites.soulHeartFrames[uiSpecialHeartFrameIndex(fill)] ?? null;
      } else if (kind === HeartKind.BLACK && fill > 0.01 && sprites.blackHeartFrames.length >= 2) {
        icon = sprites.blackHeartFrames[uiSpecialHeartFrameIndex(fill)] ?? null;
      }
      if (icon) drawHudIconContained(g, icon, hx, hud.heartsY, HEART_SLOT);
      hx += HEART_SLOT + HEART_GAP;
    }
  } else {
    g.fillStyle = "#ffffff";
    g.fillText(
      `HP ${player.health.current}/${player.health.max}`,
      PAD_L,
      hud.heartsY + 12,
    );
  }
}

function drawEconomyRow(
  g: CanvasRenderingContext2D,
  player: Player,
  sprites: BottomHudSprites,
  economy: HudEconomyDisplay,
  hud: BottomHudGeometry,
  keyOp: number,
): void {
  const econY = hud.economyY;
  let textX = PAD_L;
  if (sprites.coin) {
    drawHudIconContained(g, sprites.coin, PAD_L, econY, ECON_ICON);
    textX = PAD_L + ECON_ICON + 4;
  }
  g.fillStyle = "#ffffff";
  g.fillText(
    formatMoneyHud(economy.displayMoney(player.stats.money)),
    textX,
    econY + 11,
  );

  const keyX = textX + 44;
  if (keyOp > 0.01 && sprites.key) {
    drawHudIconContained(g, sprites.key, keyX, econY, ECON_ICON);
    textX = keyX + ECON_ICON + 4;
  } else {
    textX = keyX;
  }
  if (keyOp > 0.01) {
    g.fillStyle = "#ffffff";
    g.fillText(String(economy.displayKeys(player.stats.keys)), textX, econY + 11);
  }
}

function drawCombatStats(
  g: CanvasRenderingContext2D,
  player: Player,
  sprites: BottomHudSprites,
  hud: BottomHudGeometry,
  minimapLeftPadded: number,
): void {
  if (sprites.statFrames.length < 3) return;
  const s = player.stats;
  const texts = [
    formatHudDamageDisplay(s.outgoingDamage()),
    formatHudStatValue(s.jumpSquatFrames),
    formatHudStatValue(s.attackWindupFrames),
  ];
  // Approximate monospace 10px widths.
  const charW = 6;
  let blockW = 0;
  for (let i = 0; i < 3; i++) {
    blockW += STAT_ICON + STAT_VALUE_GAP + texts[i]!.length * charW;
    if (i < 2) blockW += STAT_CLUSTER_GAP;
  }
  let right = weaponSlotsLeftX(hud.jaX) - STAT_PAD_BEFORE_WEAPON_SLOTS;
  if (minimapLeftPadded > 0) {
    right = Math.min(right, minimapLeftPadded - STAT_PAD_BEFORE_MINIMAP);
  }
  let x = right - blockW;
  if (x < PAD_L) return;

  const econY = hud.economyY;
  const iconY = econY + Math.floor((14 - STAT_ICON) / 2);
  const textY = econY + 11;
  g.fillStyle = "#c8d0dc";
  for (let i = 0; i < 3; i++) {
    const icon = sprites.statFrames[i]!;
    g.drawImage(icon, x, iconY, STAT_ICON, STAT_ICON);
    const tx = x + STAT_ICON + STAT_VALUE_GAP;
    g.fillText(texts[i]!, tx, textY);
    x = tx + texts[i]!.length * charW;
    if (i < 2) x += STAT_CLUSTER_GAP;
  }
}

function drawPassiveStrip(
  g: CanvasRenderingContext2D,
  player: Player,
  catalog: ItemCatalog,
  itemBitmaps: Map<string, ImageBitmap>,
  hud: BottomHudGeometry,
): void {
  const owned = player.inventory.ownedIds();
  // Newest first (reverse acquire order ≈ reverse owned list for Phase 4a).
  const list = owned.slice().reverse();
  const cap = itemStripCapacity(hud.itemStripX0, hud.itemStripX1);
  let x = hud.itemStripX0;
  let drawn = 0;
  for (let i = 0; i < list.length && drawn < cap; i++) {
    const id = list[i]!;
    const def = catalog.def(id);
    if (def.subweapon) continue;
    const bmp = itemBitmaps.get(def.spriteFileName);
    const alpha = Math.max(0, 1 - Math.max(0, drawn - 1) * 0.15);
    if (alpha <= 0) break;
    if (x + ITEM_ICON > hud.itemStripX1) break;
    g.save();
    g.globalAlpha = alpha;
    if (bmp) {
      drawItemHudIcon(g, bmp, x, hud.itemsY, ITEM_ICON);
    } else {
      g.fillStyle = "#6a5a48";
      g.fillRect(x, hud.itemsY, ITEM_ICON, ITEM_ICON);
    }
    const stacks = player.inventory.stacksOf(id);
    if (stacks > 1) {
      g.fillStyle = "#ffffff";
      g.font = "9px monospace";
      g.fillText(String(stacks), x + ITEM_ICON - 6, hud.itemsY + ITEM_ICON - 1);
      g.font = "10px monospace";
    }
    g.restore();
    x += ITEM_ICON + ITEM_GAP;
    drawn++;
  }
}

function drawWeaponSlots(
  g: CanvasRenderingContext2D,
  player: Player,
  catalog: ItemCatalog,
  itemBitmaps: Map<string, ImageBitmap>,
  sprites: BottomHudSprites,
  hud: BottomHudGeometry,
  subCooldowns: SubweaponCooldowns,
  kCandy?: KCandyHudDrawState,
): void {
  const slot = WEAPON_SLOT;
  const slotY = hud.y0 + Math.floor((HUD_HEIGHT - slot) / 2);
  const slotsX = weaponSlotsLeftX(hud.jaX);

  if (sprites.weaponFrame) {
    g.drawImage(sprites.weaponFrame, slotsX, slotY, slot, slot);
  }
  if (sprites.subweaponFrame) {
    g.drawImage(sprites.subweaponFrame, slotsX + slot, slotY, slot, slot);
  }

  const weaponPickupIcon = resolveWeaponSlotPickupIcon(
    player,
    catalog,
    itemBitmaps,
    sprites.swordPickup,
  );

  const frameScale =
    sprites.weaponFrame && sprites.weaponFrame.width > 0
      ? slot / sprites.weaponFrame.width
      : 2;
  const subFrameScale =
    sprites.subweaponFrame && sprites.subweaponFrame.width > 0
      ? slot / sprites.subweaponFrame.width
      : 2;

  if (weaponPickupIcon) {
    const inner = sprites.weaponInner;
    const ix =
      inner.w > 0
        ? slotsX + Math.round(inner.x * frameScale)
        : slotsX;
    const iy =
      inner.h > 0
        ? slotY + Math.round(inner.y * frameScale)
        : slotY;
    const iw = inner.w > 0 ? Math.round(inner.w * frameScale) : slot;
    const ih = inner.h > 0 ? Math.round(inner.h * frameScale) : slot;
    drawItemPickupCellContainedInRect(g, weaponPickupIcon, ix, iy, iw, ih);
  }

  drawBackpackHudWeaponPreviews(
    g,
    player,
    catalog,
    itemBitmaps,
    sprites,
    slotsX,
    slotY,
    slot,
    frameScale,
    subFrameScale,
  );

  const eqSub = player.inventory.equippedSubweapon();
  if (eqSub) {
    const def = catalog.def(eqSub);
    const bmp = itemBitmaps.get(def.spriteFileName);
    if (bmp) {
      const sx = slotsX + slot;
      const inner = sprites.subweaponInner;
      const ix =
        inner.w > 0 ? sx + Math.round(inner.x * subFrameScale) : sx;
      const iy =
        inner.h > 0 ? slotY + Math.round(inner.y * subFrameScale) : slotY;
      const iw = inner.w > 0 ? Math.round(inner.w * subFrameScale) : slot;
      const ih = inner.h > 0 ? Math.round(inner.h * subFrameScale) : slot;
      drawItemPickupCellContainedInRect(g, bmp, ix, iy, iw, ih);
      drawSubweaponCooldownOverlay(
        g,
        ix,
        iy,
        iw,
        ih,
        subCooldowns.remainingOf(eqSub),
        subCooldowns.totalOf(eqSub, def.subweaponCooldownSeconds),
      );
      if (eqSub === "K_CANDY" && kCandy) {
        drawHudUsesBadge(g, ix, iy, Math.min(iw, ih), kCandy.usesRemaining);
        if (kCandy.usesRemaining <= 0) {
          g.fillStyle = "rgba(40,42,48,0.784)";
          g.fillRect(ix, iy, iw, ih);
        }
      }
    }
  }
}

/** Gray tint + top band that shrinks as cooldown completes (Java drawSubweaponCooldownOverlay). */
function drawSubweaponCooldownOverlay(
  g: CanvasRenderingContext2D,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
  remainingSec: number,
  totalSec: number,
): void {
  if (remainingSec <= 1e-6 || totalSec <= 1e-6 || innerW <= 0 || innerH <= 0) return;
  g.fillStyle = "rgba(90,92,100,0.373)";
  g.fillRect(innerX, innerY, innerW, innerH);
  const frac = Math.min(1, Math.max(0, remainingSec / totalSec));
  const bandH = Math.min(innerH, Math.ceil(innerH * frac));
  if (bandH > 0) {
    g.fillStyle = "rgba(52,54,62,0.855)";
    g.fillRect(innerX, innerY, innerW, bandH);
  }
}

function minimapLeftEdge(layout: DungeonLayout, _hud: BottomHudGeometry): number {
  const metrics = miniMapGridMetrics(layout);
  if (!metrics) return 0;
  return minimapOriginX(metrics.totalW) - 2;
}

function miniMapGridMetrics(layout: DungeonLayout): {
  minGx: number;
  minGy: number;
  totalW: number;
  totalH: number;
} | null {
  const rooms = layout.allRooms();
  if (rooms.length === 0) return null;
  let minGx = Infinity;
  let minGy = Infinity;
  let maxGx = -Infinity;
  let maxGy = -Infinity;
  for (const n of rooms) {
    minGx = Math.min(minGx, n.gridX);
    minGy = Math.min(minGy, n.gridY);
    maxGx = Math.max(maxGx, n.gridX);
    maxGy = Math.max(maxGy, n.gridY);
  }
  const cols = maxGx - minGx + 1;
  const rows = maxGy - minGy + 1;
  return {
    minGx,
    minGy,
    totalW: cols * MINIMAP_CELL_W + (cols - 1) * MINIMAP_CELL_GAP,
    totalH: rows * MINIMAP_CELL_H + (rows - 1) * MINIMAP_CELL_GAP,
  };
}

function drawMiniMap(
  g: CanvasRenderingContext2D,
  layout: DungeonLayout,
  roomId: number,
  miniMap: MiniMapState,
  hud: BottomHudGeometry,
  reveal: MiniMapRevealFlags,
): void {
  const metrics = miniMapGridMetrics(layout);
  if (!metrics) return;
  const x0 = minimapOriginX(metrics.totalW);
  const y0 = hud.y0 + Math.floor((HUD_HEIGHT - metrics.totalH) / 2);

  g.fillStyle = "rgba(0,0,0,0.47)";
  g.fillRect(x0 - 2, y0 - 2, metrics.totalW + 4, metrics.totalH + 4);

  for (const n of layout.allRooms()) {
    const cx = n.gridX - metrics.minGx;
    const cy = n.gridY - metrics.minGy;
    const x = x0 + cx * (MINIMAP_CELL_W + MINIMAP_CELL_GAP);
    const y = y0 + cy * (MINIMAP_CELL_H + MINIMAP_CELL_GAP);
    const current = n.id === roomId;
    const visited = n.id < miniMap.visited.length && miniMap.visited[n.id]!;
    const adjacentNow = !current && isAdjacentTo(layout, roomId, n.id);
    const secretKind =
      n.kind === RoomKind.SECRET || n.kind === RoomKind.SUPER_SECRET;
    const specialKind =
      n.kind === RoomKind.ITEM ||
      n.kind === RoomKind.SHOP ||
      n.kind === RoomKind.BOSS;
    const adjacentRemembered =
      !current &&
      !secretKind &&
      n.id < miniMap.adjacentSeen.length &&
      miniMap.adjacentSeen[n.id]!;
    // MAP → special rooms in color; COMPASS → dark silhouette; EYE → secrets.
    const showRoom = secretKind
      ? current || visited || reveal.eyeOfHorus
      : visited ||
        current ||
        adjacentNow ||
        adjacentRemembered ||
        (reveal.map && specialKind);
    if (!showRoom) {
      if (reveal.compass && !secretKind) {
        g.fillStyle = "rgba(22,24,30,0.784)";
        g.fillRect(x, y, MINIMAP_CELL_W, MINIMAP_CELL_H);
      }
      continue;
    }

    const rgb = minimapKindRgb(n.kind);
    if (current) {
      g.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${MINIMAP_ALPHA_CURRENT / 255})`;
      g.fillRect(x, y, MINIMAP_CELL_W, MINIMAP_CELL_H);
      g.strokeStyle = "#ffffff";
      g.strokeRect(x + 0.5, y + 0.5, MINIMAP_CELL_W - 1, MINIMAP_CELL_H - 1);
    } else {
      const alpha = visited ? MINIMAP_ALPHA_VISITED : MINIMAP_ALPHA_UNVISITED;
      g.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha / 255})`;
      g.fillRect(x, y, MINIMAP_CELL_W, MINIMAP_CELL_H);
    }
  }
}

function isAdjacentTo(layout: DungeonLayout, currentId: number, roomId: number): boolean {
  return (
    roomId === layout.neighborWest(currentId) ||
    roomId === layout.neighborEast(currentId) ||
    roomId === layout.neighborNorth(currentId) ||
    roomId === layout.neighborSouth(currentId)
  );
}

function minimapKindRgb(k: RoomKind): [number, number, number] {
  switch (k) {
    case RoomKind.START:
      return [120, 200, 255];
    case RoomKind.ITEM:
      return [255, 210, 80];
    case RoomKind.SHOP:
      return [180, 140, 255];
    case RoomKind.BOSS:
      return [255, 90, 90];
    case RoomKind.NORMAL:
      return [200, 200, 210];
    case RoomKind.SECRET:
      return [90, 200, 160];
    case RoomKind.SUPER_SECRET:
      return [160, 120, 220];
  }
}

/** Mark current room visited + sticky adjacent reveal (non-secret). */
export function revealMiniMapForRoom(
  layout: DungeonLayout,
  roomId: number,
  state: MiniMapState,
): void {
  if (roomId < 0) return;
  if (roomId < state.visited.length) state.visited[roomId] = true;
  for (const nid of [
    layout.neighborWest(roomId),
    layout.neighborEast(roomId),
    layout.neighborNorth(roomId),
    layout.neighborSouth(roomId),
  ]) {
    if (nid < 0 || nid >= state.adjacentSeen.length) continue;
    const kind = layout.room(nid).kind;
    if (kind === RoomKind.SECRET || kind === RoomKind.SUPER_SECRET) continue;
    state.adjacentSeen[nid] = true;
  }
}

export function createMiniMapState(roomCount: number): MiniMapState {
  return {
    visited: new Array(roomCount).fill(false),
    adjacentSeen: new Array(roomCount).fill(false),
  };
}

export function drawHudIconContained(
  g: CanvasRenderingContext2D,
  img: ImageBitmap,
  boxLeft: number,
  boxTop: number,
  boxSize: number,
): void {
  const iw = img.width;
  const ih = img.height;
  if (iw <= 0 || ih <= 0) return;
  let scale = Math.min(boxSize / iw, boxSize / ih);
  if (scale >= 1) scale = Math.max(1, Math.floor(scale + 1e-9));
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const dx = boxLeft + Math.floor((boxSize - dw) / 2);
  const dy = boxTop + Math.floor((boxSize - dh) / 2);
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
}

/** Slice UI health / hud stats horizontal strips into frames. */
export async function sliceHudStrip(
  sheet: ImageBitmap,
  frameCount: number,
): Promise<ImageBitmap[]> {
  const fw = Math.max(1, Math.floor(sheet.width / frameCount));
  const fh = sheet.height;
  const out: ImageBitmap[] = [];
  for (let i = 0; i < frameCount; i++) {
    const c = document.createElement("canvas");
    c.width = fw;
    c.height = fh;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, i * fw, 0, fw, fh, 0, 0, fw, fh);
    out.push(await createImageBitmap(c));
  }
  return out;
}

/** Derive content box inside a UI frame via 0x0000FE border (Java innerBoxFrom0000feBorder). */
export function innerBoxFrom0000feBorder(
  img: ImageBitmap,
  extraInsetPx: number,
): { x: number; y: number; w: number; h: number } {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data, width: w, height: h } = ctx.getImageData(0, 0, img.width, img.height);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3]!;
      if (a === 0) continue;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (r === 0 && g === 0 && b === 0xfe) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, w: 0, h: 0 };
  let ix = minX + 1 + extraInsetPx;
  let iy = minY + 1 + extraInsetPx;
  let iw = maxX - minX - 1 - extraInsetPx * 2;
  let ih = maxY - minY - 1 - extraInsetPx * 2;
  iw = Math.max(0, Math.min(w - ix, iw));
  ih = Math.max(0, Math.min(h - iy, ih));
  if (iw <= 0 || ih <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: ix, y: iy, w: iw, h: ih };
}

/** Active primary weapon pickup sheet for HUD weapon slot (Java resolveHudWeaponIcon). */
export function resolveWeaponSlotPickupIcon(
  player: Player,
  catalog: ItemCatalog,
  itemBitmaps: Map<string, ImageBitmap>,
  swordFallback: ImageBitmap | null,
): ImageBitmap | null {
  const inv = player.inventory;
  let itemId: string | null;
  if (inv.hasBackpack()) {
    itemId = inv.backpackSelectedPrimary();
  } else {
    itemId = primaryItemIdForVisual(resolveSwordProfile(inv, catalog).visual);
  }
  if (!itemId) return swordFallback;
  const def = catalog.def(itemId);
  return itemBitmaps.get(def.spriteFileName) ?? swordFallback;
}

/** Item ids whose pickup art should be resident for HUD weapon slots. */
export function hudWeaponItemIdsToPreload(player: Player, catalog: ItemCatalog): string[] {
  const inv = player.inventory;
  const ids = new Set<string>();
  let activeId: string | null;
  if (inv.hasBackpack()) {
    activeId = inv.backpackSelectedPrimary();
  } else {
    activeId = primaryItemIdForVisual(resolveSwordProfile(inv, catalog).visual);
  }
  if (activeId) ids.add(activeId);
  const nextPrimary = inv.peekNextBackpackPrimary();
  if (nextPrimary) ids.add(nextPrimary);
  const nextSub = inv.peekNextBackpackSubweapon();
  if (nextSub) ids.add(nextSub);
  const eqSub = inv.equippedSubweapon();
  if (eqSub) ids.add(eqSub);
  return [...ids];
}

function drawBackpackHudWeaponPreviews(
  g: CanvasRenderingContext2D,
  player: Player,
  catalog: ItemCatalog,
  itemBitmaps: Map<string, ImageBitmap>,
  sprites: BottomHudSprites,
  slotsX: number,
  slotY: number,
  slot: number,
  frameScale: number,
  subFrameScale: number,
): void {
  const inv = player.inventory;
  if (!inv.hasBackpack()) return;

  if (inv.backpackPrimaryOptionCount() > 1) {
    const nextPrimary = inv.peekNextBackpackPrimary();
    if (nextPrimary !== undefined) {
      const sheet =
        nextPrimary == null
          ? sprites.swordPickup
          : itemBitmaps.get(catalog.def(nextPrimary).spriteFileName) ?? null;
      if (sheet) {
        const inner = sprites.weaponInner;
        const ix =
          inner.w > 0 ? slotsX + Math.round(inner.x * frameScale) : slotsX;
        const iy =
          inner.h > 0 ? slotY + Math.round(inner.y * frameScale) : slotY;
        const iw = inner.w > 0 ? Math.round(inner.w * frameScale) : slot;
        const ih = inner.h > 0 ? Math.round(inner.h * frameScale) : slot;
        drawHudNextWeaponPreview(g, sheet, ix, iy, iw, ih);
      }
    }
  }

  if (inv.backpackSubweaponOptionCount() > 1) {
    const nextSub = inv.peekNextBackpackSubweapon();
    if (nextSub) {
      const sheet = itemBitmaps.get(catalog.def(nextSub).spriteFileName);
      if (sheet) {
        const sx = slotsX + slot;
        const inner = sprites.subweaponInner;
        const ix = inner.w > 0 ? sx + Math.round(inner.x * subFrameScale) : sx;
        const iy =
          inner.h > 0 ? slotY + Math.round(inner.y * subFrameScale) : slotY;
        const iw = inner.w > 0 ? Math.round(inner.w * subFrameScale) : slot;
        const ih = inner.h > 0 ? Math.round(inner.h * subFrameScale) : slot;
        drawHudNextWeaponPreview(g, sheet, ix, iy, iw, ih);
      }
    }
  }
}

/** Half-size preview of the next backpack cycle entry (Java drawHudNextWeaponPreview). */
function drawHudNextWeaponPreview(
  g: CanvasRenderingContext2D,
  sheet: ImageBitmap,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
): void {
  const previewW = Math.max(1, Math.floor(innerW / 2));
  const previewH = Math.max(1, Math.floor(innerH / 2));
  const previewX = innerX + innerW - previewW;
  const previewY = innerY + innerH - previewH;
  drawItemPickupCellContainedInRect(g, sheet, previewX, previewY, previewW, previewH);
}

/** Left 16×16 pickup cell as a standalone bitmap. */
export async function slicePickupCell(sheet: ImageBitmap): Promise<ImageBitmap> {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const sw = Math.min(16, sheet.width);
  const sh = Math.min(16, sheet.height);
  ctx.drawImage(sheet, 0, 0, sw, sh, 0, 0, 16, 16);
  return createImageBitmap(c);
}
