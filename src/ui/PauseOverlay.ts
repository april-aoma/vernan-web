import type { Player } from "../entity/Player";
import type { ItemCatalog } from "../item/ItemCatalog";
import { drawItemPickupCell, ITEM_PICKUP_CELL } from "../item/ItemSpriteArt";
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from "../specs";

/** Java GamePanel pause menu layout. */
export const PAUSE_MENU_X = 12;
export const PAUSE_MENU_Y = 28;
export const PAUSE_MENU_W = 220;
export const PAUSE_MENU_PADDING = 8;

/**
 * Dim full-frame + "PAUSE" title (Java drawPauseOverlay).
 */
export function drawPauseOverlay(g: CanvasRenderingContext2D): void {
  g.fillStyle = "rgba(0,0,0,0.627)";
  g.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  g.fillStyle = "#ffffff";
  g.font = "14px monospace";
  const text = "PAUSE";
  const tw = g.measureText(text).width;
  g.fillText(text, INTERNAL_WIDTH / 2 - tw / 2, INTERNAL_HEIGHT / 2 + 5);
}

/**
 * Pause header box + collected-item grid (Java drawPauseMenu / drawPauseMenuItemGrid).
 */
export function drawPauseMenu(
  g: CanvasRenderingContext2D,
  player: Player,
  catalog: ItemCatalog,
  itemBitmaps: Map<string, ImageBitmap>,
  swordPickup: ImageBitmap | null,
): void {
  const boxH = PAUSE_MENU_PADDING * 2 + 36;
  g.fillStyle = "rgba(10,12,16,0.863)";
  g.fillRect(PAUSE_MENU_X, PAUSE_MENU_Y, PAUSE_MENU_W, boxH);
  g.strokeStyle = "rgba(255,255,255,0.353)";
  g.strokeRect(PAUSE_MENU_X + 0.5, PAUSE_MENU_Y + 0.5, PAUSE_MENU_W - 1, boxH - 1);

  const x = PAUSE_MENU_X + PAUSE_MENU_PADDING;
  const y = PAUSE_MENU_Y + PAUSE_MENU_PADDING + 12;
  g.fillStyle = "#ffffff";
  g.font = "10px monospace";
  g.fillText("Paused — Enter resume", x, y);
  g.fillStyle = "#c8d2e6";
  g.fillText("Debug: ` or F3", x, y + 16);

  drawPauseMenuItemGrid(g, PAUSE_MENU_Y + boxH, player, catalog, itemBitmaps, swordPickup);
}

function drawPauseMenuItemGrid(
  g: CanvasRenderingContext2D,
  belowHeaderY: number,
  player: Player,
  catalog: ItemCatalog,
  itemBitmaps: Map<string, ImageBitmap>,
  swordPickup: ImageBitmap | null,
): void {
  const icons: Array<{ bmp: ImageBitmap; pickup: boolean }> = [];
  if (swordPickup) icons.push({ bmp: swordPickup, pickup: true });

  const listed = new Set<string>();
  // Newest-first passives, then any remaining owned (incl. equipped subweapon).
  const owned = player.inventory.ownedIds().slice().reverse();
  for (const id of owned) {
    if (listed.has(id)) continue;
    if (!pauseMenuShowsItem(player, catalog, id)) continue;
    listed.add(id);
    const def = catalog.def(id);
    const bmp = itemBitmaps.get(def.spriteFileName);
    if (bmp) icons.push({ bmp, pickup: true });
  }
  const eq = player.inventory.equippedSubweapon();
  if (eq && !listed.has(eq) && pauseMenuShowsItem(player, catalog, eq)) {
    const def = catalog.def(eq);
    const bmp = itemBitmaps.get(def.spriteFileName);
    if (bmp) icons.push({ bmp, pickup: true });
  }

  if (icons.length === 0) return;

  const cell = ITEM_PICKUP_CELL * 2;
  const cols = Math.floor(PAUSE_MENU_W / cell);
  if (cols <= 0) return;
  const rows = Math.ceil(icons.length / cols);
  const gridPad = 6;
  const gridH = rows * cell + gridPad * 2;
  const gridY = belowHeaderY + 6;

  g.fillStyle = "rgba(10,12,16,0.863)";
  g.fillRect(PAUSE_MENU_X, gridY, PAUSE_MENU_W, gridH);
  g.strokeStyle = "rgba(255,255,255,0.353)";
  g.strokeRect(PAUSE_MENU_X + 0.5, gridY + 0.5, PAUSE_MENU_W - 1, gridH - 1);

  g.imageSmoothingEnabled = false;
  const x0 = PAUSE_MENU_X;
  const y0 = gridY + gridPad;
  for (let i = 0; i < icons.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dx = x0 + col * cell;
    const dy = y0 + row * cell;
    const { bmp } = icons[i]!;
    if (bmp.width === cell && bmp.height === cell) {
      g.drawImage(bmp, dx, dy, cell, cell);
    } else {
      drawItemPickupCell(g, bmp, dx, dy, cell, cell);
    }
  }
}

function pauseMenuShowsItem(
  player: Player,
  catalog: ItemCatalog,
  id: string,
): boolean {
  const def = catalog.def(id);
  if (def.subweapon) {
    return player.inventory.equippedSubweapon() === id || player.inventory.stacksOf(id) > 0;
  }
  return player.inventory.stacksOf(id) > 0;
}
