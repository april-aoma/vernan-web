/** Device-pixel viewport — matches GamePanel world viewport (above HUD). */
export const VIEWPORT_W = 512;
export const VIEWPORT_H = 256;

export function worldViewportW(pixelScale: number): number {
  return Math.max(1, (VIEWPORT_W / Math.max(1, pixelScale)) | 0);
}

export function worldViewportH(pixelScale: number): number {
  return Math.max(1, (VIEWPORT_H / Math.max(1, pixelScale)) | 0);
}
