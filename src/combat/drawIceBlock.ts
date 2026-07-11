import { CAMERA_ZOOM } from "../specs";
import type { WorldCamera } from "../camera/WorldCamera";
import type { IceBlock } from "../entity/IceBlock";
import {
  drawIceSpriteWithLiveReflection,
  type BackbufferSample,
} from "../render/IceBlockReflectionEffect";
import { adjustDeviceRectFeetAnchored } from "../render/SquashStretch";

export type { BackbufferSample };

/** Feet-pinned device rect [x1,y1,x2,y2] for a room ice block (Java drawIceBlocksDevice). */
export function iceBlockDeviceRect(
  block: IceBlock,
  camera: WorldCamera,
): [number, number, number, number] {
  const shake = block.shakeDevicePx();
  const ex = camera.worldToDeviceX(block.x);
  const ey = camera.worldToDeviceY(block.y);
  const ex2 = camera.worldToDeviceX(block.x + block.w);
  const ey2 = camera.worldToDeviceY(block.y + block.h);

  if (block.kuriboPancake) {
    return [ex + shake, ey, ex2 + shake, ey2];
  }

  const sw = block.sprite.width;
  const sh = block.sprite.height;
  const dw = Math.round(CAMERA_ZOOM * sw);
  const dh = Math.round(CAMERA_ZOOM * sh);
  const feetY = ey2;
  const dx1 = ex + Math.floor((ex2 - ex) / 2) - Math.floor(dw / 2) + shake;
  const dy1 = feetY - dh;
  const rect: [number, number, number, number] = [dx1, dy1, dx1 + dw, feetY];
  adjustDeviceRectFeetAnchored(rect, block.squashScaleX, block.squashScaleY);
  return rect;
}

function drawKuriboIceBlock(
  g: CanvasRenderingContext2D,
  block: IceBlock,
  rect: [number, number, number, number],
): void {
  const [dx1, dy1, dx2, dy2] = rect;
  const dw = dx2 - dx1;
  const dh = dy2 - dy1;
  const cx = dx1 + dw * 0.5;
  const cy = dy2;
  g.save();
  g.translate(cx, cy);
  if (block.corpseAngleRad !== 0) g.rotate(block.corpseAngleRad);
  g.imageSmoothingEnabled = false;
  if (block.mirrorSourceX) {
    g.drawImage(block.sprite, -dw, -dh, dw, dh);
  } else {
    g.drawImage(block.sprite, 0, -dh, dw, dh);
  }
  g.restore();
}

/** Draw room-persisted ice blocks with live environment reflection (Java drawIceBlocksDevice). */
export function drawIceBlocks(
  g: CanvasRenderingContext2D,
  blocks: readonly IceBlock[],
  camera: WorldCamera,
  backbuffer: BackbufferSample | null = null,
): void {
  for (const block of blocks) {
    const rect = iceBlockDeviceRect(block, camera);
    if (block.kuriboPancake) {
      drawKuriboIceBlock(g, block, rect);
      continue;
    }
    const [dx1, dy1, dx2, dy2] = rect;
    const sw = block.sprite.width;
    const sh = block.sprite.height;
    drawIceSpriteWithLiveReflection(
      g,
      backbuffer,
      block.sprite,
      sw,
      sh,
      dx1,
      dy1,
      dx2,
      dy2,
      block.mirrorSourceX,
    );
  }
}

/** Draw a held/thrown ice snap at a world-space top-left with live reflection. */
export function drawIceSnapWithLiveReflection(
  g: CanvasRenderingContext2D,
  camera: WorldCamera,
  snap: HTMLCanvasElement,
  leftWorld: number,
  topWorld: number,
  mirrorSourceX: boolean,
  backbuffer: BackbufferSample | null,
  squashScaleX = 1,
  squashScaleY = 1,
): void {
  const sw = snap.width;
  const sh = snap.height;
  const dw = Math.floor(CAMERA_ZOOM * sw);
  const dh = Math.floor(CAMERA_ZOOM * sh);
  const dx1 = camera.worldToDeviceX(leftWorld);
  const dy1 = camera.worldToDeviceY(topWorld);
  const rect: [number, number, number, number] = [dx1, dy1, dx1 + dw, dy1 + dh];
  adjustDeviceRectFeetAnchored(rect, squashScaleX, squashScaleY);
  drawIceSpriteWithLiveReflection(
    g,
    backbuffer,
    snap,
    sw,
    sh,
    rect[0],
    rect[1],
    rect[2],
    rect[3],
    mirrorSourceX,
  );
}
