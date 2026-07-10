/**
 * Pixel-positioned decoration / prop in room space (Java PlacedRoomObject).
 *
 * Prefer objectRefId — points at a tileset objects[] entry. tileId skips the
 * object layer and draws one library tile directly (legacy / special-case).
 */
export type PlacedRoomObject = {
  objectRefId: string;
  tileId: string;
  xPx: number;
  yPx: number;
  zOrder: number;
};

export function fromObjectRef(
  ref: string | null | undefined,
  xPx: number,
  yPx: number,
  z: number,
): PlacedRoomObject {
  return { objectRefId: ref ?? "", tileId: "", xPx, yPx, zOrder: z };
}

export function fromTileId(
  tid: string | null | undefined,
  xPx: number,
  yPx: number,
  z: number,
): PlacedRoomObject {
  return { objectRefId: "", tileId: tid ?? "", xPx, yPx, zOrder: z };
}
