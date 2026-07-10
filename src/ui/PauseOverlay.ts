import type { Player } from "../entity/Player";
import type { ItemCatalog } from "../item/ItemCatalog";
import { drawItemPickupCell, ITEM_PICKUP_CELL } from "../item/ItemSpriteArt";
import type { RunSummary } from "../ranking/types";
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from "../specs";

/** Java GamePanel pause menu layout. */
export const PAUSE_MENU_X = 12;
export const PAUSE_MENU_Y = 28;
export const PAUSE_MENU_W = 220;
export const PAUSE_MENU_PADDING = 8;

export type PauseMenuHitRects = {
  submit: { x: number; y: number; w: number; h: number };
};

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
 * Also shows run stats and an opt-in submit hit target.
 */
export function drawPauseMenu(
  g: CanvasRenderingContext2D,
  player: Player,
  catalog: ItemCatalog,
  itemBitmaps: Map<string, ImageBitmap>,
  swordPickup: ImageBitmap | null,
  runSummary?: RunSummary,
): PauseMenuHitRects {
  const boxH = PAUSE_MENU_PADDING * 2 + (runSummary ? 72 : 36);
  g.fillStyle = "rgba(10,12,16,0.863)";
  g.fillRect(PAUSE_MENU_X, PAUSE_MENU_Y, PAUSE_MENU_W, boxH);
  g.strokeStyle = "rgba(255,255,255,0.353)";
  g.strokeRect(PAUSE_MENU_X + 0.5, PAUSE_MENU_Y + 0.5, PAUSE_MENU_W - 1, boxH - 1);

  const x = PAUSE_MENU_X + PAUSE_MENU_PADDING;
  let y = PAUSE_MENU_Y + PAUSE_MENU_PADDING + 12;
  g.fillStyle = "#ffffff";
  g.font = "10px monospace";
  g.fillText("Paused — Enter resume", x, y);
  y += 16;
  g.fillStyle = "#c8d2e6";
  g.fillText("Debug: ` or F3", x, y);

  let submit = { x: 0, y: 0, w: 0, h: 0 };
  if (runSummary) {
    y += 16;
    g.fillStyle = "#9aa7b5";
    g.fillText(
      `Fl ${runSummary.floorReached}  $ ${runSummary.coins}  Kills ${runSummary.enemiesKilled}/${runSummary.enemiesKillDifficulty}`,
      x,
      y,
    );
    y += 14;
    g.fillText(`Seed ${runSummary.seed}`, x, y);
    y += 6;
    const btnX = x;
    const btnY = y;
    const btnW = PAUSE_MENU_W - PAUSE_MENU_PADDING * 2;
    const btnH = 16;
    g.fillStyle = "rgba(30, 90, 130, 0.85)";
    g.fillRect(btnX, btnY, btnW, btnH);
    g.strokeStyle = "rgba(110, 200, 255, 0.55)";
    g.strokeRect(btnX + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
    g.fillStyle = "#d7eefc";
    g.fillText("Q — Submit & quit", btnX + 6, btnY + 12);
    submit = { x: btnX, y: btnY, w: btnW, h: btnH };
  }

  drawPauseMenuItemGrid(g, PAUSE_MENU_Y + boxH, player, catalog, itemBitmaps, swordPickup);
  return { submit };
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
