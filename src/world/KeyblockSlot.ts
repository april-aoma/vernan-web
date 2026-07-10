/** One cell of a keyblock seal; exactly one slot per seal has primary. */
export type KeyblockSlot = {
  tx: number;
  ty: number;
  primary: boolean;
  /** Written when this slot opens (door / ladder / platform / empty). */
  restoreTileId: number;
};
