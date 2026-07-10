import type { WorldCamera } from "../camera/WorldCamera";
import { TILE_SIZE } from "../specs";
import { drawStripFrame, type SpriteStrip } from "../render/SpriteDraw";
import {
  KEYBLOCK_STAGGER_FRAMES,
  type KeyblockTickState,
} from "./KeyblockTick";
import type { KeyblockSealRuntime } from "./KeyblockSealRuntime";
import { TILE_KEYBLOCK, TILE_KEYBLOCK_CONNECTOR, type TileMap } from "./TileMap";

export const KEYBLOCK_STRIP_FRAME_COUNT = 7;

/** Java GamePanel.keyblockStripFrameIndex. */
export function keyblockStripFrameIndex(
  seal: KeyblockSealRuntime,
  slotIndex: number,
  stagger = KEYBLOCK_STAGGER_FRAMES,
): number {
  const t = seal.timeline;
  if (t < 0) return 0;
  const rel = t - slotIndex * stagger;
  if (rel < 0) return 0;
  if (rel > 6) return -1;
  return rel;
}

/** Java drawKeyblockStripCell — primary/connector strip at map cell. */
export function drawKeyblockStripCell(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  tx: number,
  ty: number,
  strip: SpriteStrip | null,
  frameIndex: number,
): void {
  if (!strip || frameIndex < 0 || frameIndex >= strip.frameCount) return;
  drawStripFrame(
    g,
    strip,
    frameIndex,
    tx * TILE_SIZE,
    ty * TILE_SIZE,
    1,
    camera,
  );
}

/** Java drawMapKeyblockTiles — static frame 0 for every K/k on the map. */
export function drawMapKeyblockTiles(
  g: CanvasRenderingContext2D,
  map: TileMap,
  camera: WorldCamera,
  primaryStrip: SpriteStrip | null,
  connectorStrip: SpriteStrip | null,
): void {
  for (let ty = 0; ty < map.getHeight(); ty++) {
    for (let tx = 0; tx < map.getWidth(); tx++) {
      const t = map.tileAt(tx, ty);
      if (t === TILE_KEYBLOCK) {
        drawKeyblockStripCell(g, camera, tx, ty, primaryStrip, 0);
      } else if (t === TILE_KEYBLOCK_CONNECTOR) {
        drawKeyblockStripCell(g, camera, tx, ty, connectorStrip, 0);
      }
    }
  }
}

/** Java drawKeyblockSealsWorld — animated unlock strips over seal slots. */
export function drawKeyblockSealsWorld(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  state: KeyblockTickState,
  roomId: number,
  primaryStrip: SpriteStrip | null,
  connectorStrip: SpriteStrip | null,
): void {
  if (roomId < 0) return;
  const seals = roomId < state.runtimesByRoom.length ? state.runtimesByRoom[roomId] : null;
  if (!seals) return;
  const stagger = Math.max(1, KEYBLOCK_STAGGER_FRAMES);
  for (const seal of seals) {
    const slots = seal.spec.slots;
    for (let i = 0; i < slots.length; i++) {
      const fi = keyblockStripFrameIndex(seal, i, stagger);
      if (fi < 0) continue;
      const s = slots[i]!;
      drawKeyblockStripCell(
        g,
        camera,
        s.tx,
        s.ty,
        s.primary ? primaryStrip : connectorStrip,
        fi,
      );
    }
  }
}
