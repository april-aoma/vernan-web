/**
 * Background sprite strip with packed ARGB cache.
 * Built once from ImageBitmap at registry load time.
 */
export type BackgroundSprite = {
  id: string;
  width: number;
  height: number;
  /** Packed ARGB (TYPE_INT_ARGB bit pattern). */
  px: Int32Array;
  /** Original bitmap (optional; for flat drawImage path). */
  bitmap: ImageBitmap;
};

export function spriteFromBitmap(id: string, bitmap: ImageBitmap, px: Int32Array): BackgroundSprite {
  return {
    id,
    width: bitmap.width,
    height: bitmap.height,
    px,
    bitmap,
  };
}
