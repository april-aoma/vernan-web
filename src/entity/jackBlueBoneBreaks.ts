import { BrickChunk, type BrickChunkSprite } from "../fx/BrickChunk";

/** Four 8×8 shards from a 16×16 bone sprite (Java spawnJackBlueBoneBreakChunks). */
export function spawnJackBlueBoneBreakChunks(
  cx: number,
  cy: number,
  boneSheet: ImageBitmap | null,
  out: BrickChunk[],
): void {
  const bx = cx - 8;
  const by = cy - 8;
  let state =
    (Math.imul(Math.floor(cx * 1000), 0x9e3779b1) ^
      Math.imul(Math.floor(cy * 1000), 0x85ebca77)) >>>
    0;
  const rnd = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const scale = 0.85;
  for (let i = 0; i < 4; i++) {
    const qx = (i % 2) * 8;
    const qy = Math.floor(i / 2) * 8;
    const sprite: BrickChunkSprite | null = boneSheet
      ? { image: boneSheet, sx: qx, sy: qy, sw: 8, sh: 8 }
      : null;
    out.push(
      new BrickChunk(
        bx + qx,
        by + qy,
        (rnd() - 0.5) * 140 * scale,
        (-rnd() * 95 - 18) * scale,
        (rnd() - 0.5) * 0.4 * scale,
        (rnd() - 0.5) * 2 * 7 * scale,
        "#e8e0d0",
        sprite,
      ),
    );
  }
}
