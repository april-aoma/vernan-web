/**
 * Item PNG layout (Java ItemSpriteArt): 16×16 pickup on the left; optional HUD
 * strip on the right (16×16 on 32×16 sheets; legacy 8×8 on 24×16).
 */
export const ITEM_PICKUP_CELL = 16;
export const ITEM_HUD_STRIP_W = 16;
export const ITEM_HUD_ICON = 16;
/** Legacy 24×16 sheets: 8px strip with an 8×8 HUD icon. */
export const ITEM_LEGACY_HUD_STRIP_W = 8;
export const ITEM_LEGACY_HUD_ICON = 8;

export type ItemSpriteRect = { sx: number; sy: number; sw: number; sh: number };

/** Left 16×16 pickup sprite (pedestals, pickup card). */
export function itemPickupRect(sheetW: number, sheetH: number): ItemSpriteRect {
  if (sheetW < ITEM_PICKUP_CELL || sheetH < ITEM_PICKUP_CELL) {
    return { sx: 0, sy: 0, sw: Math.max(1, sheetW), sh: Math.max(1, sheetH) };
  }
  return { sx: 0, sy: 0, sw: ITEM_PICKUP_CELL, sh: ITEM_PICKUP_CELL };
}

/**
 * HUD icon from the right strip (16×16 on 32×16, 8×8 on legacy 24×16),
 * or top-left 8×8 when no strip exists.
 */
export function itemHudRect(sheetW: number, sheetH: number): ItemSpriteRect | null {
  if (sheetW >= ITEM_PICKUP_CELL + ITEM_HUD_STRIP_W && sheetH >= ITEM_HUD_ICON) {
    return {
      sx: ITEM_PICKUP_CELL,
      sy: 0,
      sw: ITEM_HUD_ICON,
      sh: ITEM_HUD_ICON,
    };
  }
  if (
    sheetW >= ITEM_PICKUP_CELL + ITEM_LEGACY_HUD_STRIP_W &&
    sheetH >= ITEM_LEGACY_HUD_ICON
  ) {
    return {
      sx: ITEM_PICKUP_CELL,
      sy: 0,
      sw: ITEM_LEGACY_HUD_ICON,
      sh: ITEM_LEGACY_HUD_ICON,
    };
  }
  if (sheetW >= ITEM_LEGACY_HUD_ICON && sheetH >= ITEM_LEGACY_HUD_ICON) {
    return { sx: 0, sy: 0, sw: ITEM_LEGACY_HUD_ICON, sh: ITEM_LEGACY_HUD_ICON };
  }
  return null;
}

/** Draw the pickup cell into a device-space box (nearest-neighbor). */
export function drawItemPickupCell(
  g: CanvasRenderingContext2D,
  sheet: ImageBitmap,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const r = itemPickupRect(sheet.width, sheet.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, dx, dy, dw, dh);
}

/** Draw the HUD icon into a device-space box; falls back to pickup cell. */
export function drawItemHudIcon(
  g: CanvasRenderingContext2D,
  sheet: ImageBitmap,
  dx: number,
  dy: number,
  boxSize: number,
): void {
  const r = itemHudRect(sheet.width, sheet.height) ?? itemPickupRect(sheet.width, sheet.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, dx, dy, boxSize, boxSize);
}
