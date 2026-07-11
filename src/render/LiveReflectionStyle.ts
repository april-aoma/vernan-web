import {
  ICE_REFLECTION_ANNULUS_STRENGTH,
  ICE_REFLECTION_BLEND,
  ICE_REFLECTION_FISHEYE_PEAK,
  ICE_REFLECTION_FISHEYE_STRENGTH,
  ICE_REFLECTION_OPACITY,
  ICE_REFLECTION_POOL_HALF_CELL,
  ICE_REFLECTION_POOL_SPRITE_FRAC,
} from "../combat/IceBlockFx";

/** Parameters for {@link LiveReflectionEffect}. */
export type LiveReflectionStyle = {
  opacity: number;
  blendMode: string;
  poolHalfCellTiles: number;
  poolSpriteFrac: number;
  fisheyePeak: number;
  fisheyeStrength: number;
  annulusStrength: number;
};

export const ICE_BLOCK_REFLECTION_STYLE: LiveReflectionStyle = {
  opacity: ICE_REFLECTION_OPACITY,
  blendMode: ICE_REFLECTION_BLEND,
  poolHalfCellTiles: ICE_REFLECTION_POOL_HALF_CELL,
  poolSpriteFrac: ICE_REFLECTION_POOL_SPRITE_FRAC,
  fisheyePeak: ICE_REFLECTION_FISHEYE_PEAK,
  fisheyeStrength: ICE_REFLECTION_FISHEYE_STRENGTH,
  annulusStrength: ICE_REFLECTION_ANNULUS_STRENGTH,
};
