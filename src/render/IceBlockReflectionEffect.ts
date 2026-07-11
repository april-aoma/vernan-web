import { CAMERA_ZOOM } from "../specs";
import {
  captureBackbuffer,
  drawSpriteWithLiveReflection,
  reflectionPadDevicePx,
  type BackbufferSample,
} from "./LiveReflectionEffect";
import { ICE_BLOCK_REFLECTION_STYLE } from "./LiveReflectionStyle";

export type { BackbufferSample };
export { captureBackbuffer };

const ICE = ICE_BLOCK_REFLECTION_STYLE;

export function iceReflectionPadDevicePx(dw: number, dh: number): number {
  return reflectionPadDevicePx(CAMERA_ZOOM, dw, dh, ICE);
}

/** Draw frozen sprite with live environment reflection (Java IceBlockReflectionEffect). */
export function drawIceSpriteWithLiveReflection(
  g: CanvasRenderingContext2D,
  backbuffer: BackbufferSample | null,
  sprite: CanvasImageSource,
  sw: number,
  sh: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
  mirrorSourceX: boolean,
): void {
  drawSpriteWithLiveReflection(
    g,
    backbuffer,
    sprite,
    sw,
    sh,
    dx1,
    dy1,
    dx2,
    dy2,
    CAMERA_ZOOM,
    mirrorSourceX,
    ICE,
  );
}
