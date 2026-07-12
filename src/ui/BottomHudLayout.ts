/**
 * Device-pixel layout for the 64px bottom HUD band (Java BottomHudLayout).
 */
export const PAD_L = 6;
export const PAD_R = 6;
export const CONTROL_BOX = 18;
export const CONTROL_GAP = 4;
export const CONTROL_SHOULDER = 14;

export const HEART_SLOT = 16;
export const HEART_GAP = 2;

export const ECON_ICON = 16;
export const ECON_ROW_H = 14;

export const ITEM_ICON = 16;
export const ITEM_GAP = 2;

export const WEAPON_SLOT = 64;
export const WEAPON_SLOT_COUNT = 2;
export const STAT_PAD_BEFORE_WEAPON_SLOTS = 8;
export const STAT_PAD_BEFORE_MINIMAP = 4;

export const STAT_ICON = 8;
export const STAT_VALUE_GAP = 3;
export const STAT_CLUSTER_GAP = 14;

const HEARTS_Y_INSET = 4;
const ECON_Y_INSET = 22;
const ITEMS_Y_INSET = 40;
const ITEM_STRIP_PAD_BEFORE_CONTROLS = 8;

/** Left edge used as the HUD content right anchor (legacy: JUMP/ATK column). */
export function controlsLeftX(internalWidth: number): number {
  const right = internalWidth - PAD_R;
  const rightX = right - CONTROL_BOX;
  const downX = rightX - (CONTROL_BOX + CONTROL_GAP);
  const leftX = downX - (CONTROL_BOX + CONTROL_GAP);
  const jaX = leftX - CONTROL_GAP - CONTROL_BOX * 2 - CONTROL_GAP;
  return jaX - CONTROL_GAP - CONTROL_SHOULDER;
}

export type BottomHudGeometry = {
  y0: number;
  heartsY: number;
  economyY: number;
  itemsY: number;
  jaX: number;
  itemStripX0: number;
  itemStripX1: number;
};

export function computeBottomHudGeometry(
  internalWidth: number,
  internalHeight: number,
  hudH: number,
): BottomHudGeometry {
  const y0 = internalHeight - hudH;
  const jaX = controlsLeftX(internalWidth);
  return {
    y0,
    heartsY: y0 + HEARTS_Y_INSET,
    economyY: y0 + ECON_Y_INSET,
    itemsY: y0 + ITEMS_Y_INSET,
    jaX,
    itemStripX0: PAD_L,
    itemStripX1: jaX - ITEM_STRIP_PAD_BEFORE_CONTROLS,
  };
}

export function itemStripCapacity(x0: number, x1: number): number {
  if (x1 <= x0) return 0;
  return Math.floor((x1 - x0) / (ITEM_ICON + ITEM_GAP));
}

export function weaponSlotsLeftX(jaX: number): number {
  return jaX - WEAPON_SLOT * WEAPON_SLOT_COUNT;
}

export type TouchControlRect = { x: number; y: number; w: number; h: number };

/** Touch-control chrome geometry (Java BottomHud drawButtonBox cluster). */
export type TouchControlsGeometry = {
  up: TouchControlRect;
  left: TouchControlRect;
  down: TouchControlRect;
  right: TouchControlRect;
  jump: TouchControlRect;
  attack: TouchControlRect;
  sub: TouchControlRect;
  /**
   * Left shoulder — web uses this as pause (label II); Java draws dodge L here.
   */
  pause: TouchControlRect;
  /** Right shoulder dodge (Java R). */
  dodge: TouchControlRect;
};

export type TouchControlId =
  | "up"
  | "left"
  | "down"
  | "right"
  | "jump"
  | "attack"
  | "sub"
  | "pause"
  | "dodge";

export function computeTouchControlsGeometry(
  internalWidth: number,
  hudY0: number,
  hudH: number,
): TouchControlsGeometry {
  const pad = PAD_R;
  const box = CONTROL_BOX;
  const gap = CONTROL_GAP;
  const shoulder = CONTROL_SHOULDER;
  const right = internalWidth - pad;
  const top = hudY0 + Math.floor((hudH - (box * 2 + gap)) / 2);
  const rightX = right - box;
  const downX = rightX - (box + gap);
  const leftX = downX - (box + gap);
  const upX = downX;
  const upY = top;
  const rowY = top + box + gap;
  const jaX = controlsLeftX(internalWidth);
  const jumpW = box * 2;
  const shoulderY = top + Math.floor((box - shoulder) / 2);
  const lShoulderX = jaX - gap - shoulder;
  const rShoulderX = jaX + jumpW + gap;
  const atkW = Math.floor((jumpW - gap) / 2);
  return {
    up: { x: upX, y: upY, w: box, h: box },
    left: { x: leftX, y: rowY, w: box, h: box },
    down: { x: downX, y: rowY, w: box, h: box },
    right: { x: rightX, y: rowY, w: box, h: box },
    jump: { x: jaX, y: top, w: jumpW, h: box },
    attack: { x: jaX, y: top + box + gap, w: atkW, h: box },
    sub: { x: jaX + atkW + gap, y: top + box + gap, w: atkW, h: box },
    pause: { x: lShoulderX, y: shoulderY, w: shoulder, h: shoulder },
    dodge: { x: rShoulderX, y: shoulderY, w: shoulder, h: shoulder },
  };
}

/** Hit-test which on-screen control contains (ix, iy), or null. */
export function hitTestTouchControl(
  ix: number,
  iy: number,
  geo: TouchControlsGeometry,
): TouchControlId | null {
  const order: TouchControlId[] = [
    "up",
    "left",
    "down",
    "right",
    "jump",
    "attack",
    "sub",
    "pause",
    "dodge",
  ];
  for (const id of order) {
    if (hitTestRect(ix, iy, geo[id])) return id;
  }
  return null;
}

export function hitTestRect(
  x: number,
  y: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
