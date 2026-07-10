import { bool, num, numDouble, str, type JsonMap } from "./jsonMaps";
import { VIEWPORT_H, VIEWPORT_W } from "./viewport";

/** Spatial sample remapping for BackgroundRendererV3 layers. */

export const SPATIAL_KINDS = [
  "scanlineWarp",
  "fisheye",
  "swirl",
  "polarScroll",
  "wave2d",
  "ripple",
] as const;

export type Distortion = {
  mapSample(screenUv: Float64Array, ox: number, oy: number, simTick: number): void;
};

export function normalizeSpatialKind(kind: string | null | undefined): string {
  if (kind == null) return "";
  switch (kind.toLowerCase()) {
    case "polar":
    case "polarscroll":
      return "polarScroll";
    case "scanlinewarp":
      return "scanlineWarp";
    case "wave":
    case "wave2d":
      return "wave2d";
    default:
      return kind;
  }
}

export function isSpatialKind(kind: string | null | undefined): boolean {
  const k = normalizeSpatialKind(kind);
  return (SPATIAL_KINDS as readonly string[]).includes(k);
}

export function defaultPhaseOffset(layerListIndex: number): number {
  return layerListIndex * 2.399963229728653;
}

export function parse(tr: JsonMap, layerListIndex: number): Distortion | null {
  if (!bool(tr, "enabled", true)) return null;
  switch (normalizeSpatialKind(str(tr, "kind", ""))) {
    case "scanlineWarp":
      return makeScanline(parseScanline(tr, layerListIndex));
    case "fisheye":
      return makeFisheye(parseFisheye(tr, layerListIndex));
    case "swirl":
      return makeSwirl(parseSwirl(tr, layerListIndex));
    case "polarScroll":
      return makePolarScroll(parsePolarScroll(tr, layerListIndex));
    case "wave2d":
      return makeWave2d(parseWave2d(tr, layerListIndex));
    case "ripple":
      return makeRipple(parseRipple(tr, layerListIndex));
    default:
      return null;
  }
}

type ScanlineWarp = {
  ampPx: number;
  strength: number;
  phasePerRowRad: number;
  timeRadPerSimTick: number;
  pinnedRow: number;
  phaseOffsetRad: number;
};

type FisheyeLens = {
  centerXPx: number;
  centerYPx: number;
  radiusPx: number;
  strength: number;
  rippleAmp: number;
  rippleFreq: number;
  timeRadPerSimTick: number;
  phaseOffsetRad: number;
};

type SwirlCfg = {
  centerXPx: number;
  centerYPx: number;
  radiusPx: number;
  twistRad: number;
  rippleAmp: number;
  rippleFreq: number;
  timeRadPerSimTick: number;
  phaseOffsetRad: number;
};

type PolarScrollCfg = {
  centerXPx: number;
  centerYPx: number;
  radiusPx: number;
  angleRadPerTick: number;
  radialPxPerTick: number;
  strength: number;
  phaseOffsetRad: number;
};

type Wave2dCfg = {
  ampXPx: number;
  ampYPx: number;
  phasePerColRad: number;
  phasePerRowRad: number;
  pinnedCol: number;
  pinnedRow: number;
  timeRadPerSimTick: number;
  phaseOffsetRad: number;
};

type RadialRippleCfg = {
  centerXPx: number;
  centerYPx: number;
  radiusPx: number;
  ampPx: number;
  rings: number;
  timeRadPerSimTick: number;
  phaseOffsetRad: number;
};

function makeScanline(warp: ScanlineWarp): Distortion {
  return {
    mapSample(uv, _ox, oy, simTick) {
      const phase = simTick * warp.timeRadPerSimTick + warp.phaseOffsetRad;
      const ref = Math.sin(phase);
      const amp = warp.ampPx * warp.strength;
      const patternRow = Math.round(uv[1]!) - oy;
      const dr = patternRow - warp.pinnedRow;
      uv[0]! -= amp * (Math.sin(phase + dr * warp.phasePerRowRad) - ref);
    },
  };
}

function makeFisheye(lens: FisheyeLens): Distortion {
  return {
    mapSample(uv, _ox, _oy, simTick) {
      const dx = uv[0]! - lens.centerXPx;
      const dy = uv[1]! - lens.centerYPx;
      const dist = Math.hypot(dx, dy);
      const radius = Math.max(8.0, lens.radiusPx);
      const norm = dist / radius;
      if (norm > 1.25) return;
      const phase = simTick * lens.timeRadPerSimTick + lens.phaseOffsetRad;
      const ripple = 1.0 + lens.rippleAmp * Math.sin(phase + norm * lens.rippleFreq);
      let centerWeight = 1.0 - Math.min(1.0, norm);
      centerWeight = centerWeight * centerWeight * (3.0 - 2.0 * centerWeight);
      const zoom = 1.0 + lens.strength * centerWeight * ripple;
      if (Math.abs(zoom) < 1e-6) return;
      uv[0] = lens.centerXPx + dx / zoom;
      uv[1] = lens.centerYPx + dy / zoom;
    },
  };
}

function makeSwirl(swirlCfg: SwirlCfg): Distortion {
  return {
    mapSample(uv, _ox, _oy, simTick) {
      const dx = uv[0]! - swirlCfg.centerXPx;
      const dy = uv[1]! - swirlCfg.centerYPx;
      const r = Math.hypot(dx, dy);
      if (r < 1e-4) return;
      const radius = Math.max(8.0, swirlCfg.radiusPx);
      const norm = Math.min(1.25, r / radius);
      const theta = Math.atan2(dy, dx);
      const phase = simTick * swirlCfg.timeRadPerSimTick + swirlCfg.phaseOffsetRad;
      const ripple = 1.0 + swirlCfg.rippleAmp * Math.sin(phase + norm * swirlCfg.rippleFreq);
      const twist = swirlCfg.twistRad * norm * ripple + phase * 0.35;
      const sampleTheta = theta - twist;
      uv[0] = swirlCfg.centerXPx + r * Math.cos(sampleTheta);
      uv[1] = swirlCfg.centerYPx + r * Math.sin(sampleTheta);
    },
  };
}

function makePolarScroll(polar: PolarScrollCfg): Distortion {
  return {
    mapSample(uv, _ox, _oy, simTick) {
      const dx = uv[0]! - polar.centerXPx;
      const dy = uv[1]! - polar.centerYPx;
      const r = Math.hypot(dx, dy);
      const theta = Math.atan2(dy, dx);
      const str = polar.strength;
      const phase = simTick * polar.angleRadPerTick * str + polar.phaseOffsetRad;
      const radial = simTick * polar.radialPxPerTick * str;
      const sampleTheta = theta - phase;
      const sampleR = r - radial;
      uv[0] = polar.centerXPx + sampleR * Math.cos(sampleTheta);
      uv[1] = polar.centerYPx + sampleR * Math.sin(sampleTheta);
    },
  };
}

function makeWave2d(wave: Wave2dCfg): Distortion {
  return {
    mapSample(uv, ox, oy, simTick) {
      const phase = simTick * wave.timeRadPerSimTick + wave.phaseOffsetRad;
      const ref = Math.sin(phase);
      const patternCol = Math.round(uv[0]!) - ox;
      const patternRow = Math.round(uv[1]!) - oy;
      const dc = patternCol - wave.pinnedCol;
      const dr = patternRow - wave.pinnedRow;
      uv[0]! -= wave.ampXPx * (Math.sin(phase + dc * wave.phasePerColRad) - ref);
      uv[1]! -= wave.ampYPx * (Math.sin(phase + dr * wave.phasePerRowRad) - ref);
    },
  };
}

function makeRipple(rippleCfg: RadialRippleCfg): Distortion {
  return {
    mapSample(uv, _ox, _oy, simTick) {
      const dx = uv[0]! - rippleCfg.centerXPx;
      const dy = uv[1]! - rippleCfg.centerYPx;
      const r = Math.hypot(dx, dy);
      if (r < 1e-4) return;
      const radius = Math.max(8.0, rippleCfg.radiusPx);
      const norm = r / radius;
      const theta = Math.atan2(dy, dx);
      const phase = simTick * rippleCfg.timeRadPerSimTick + rippleCfg.phaseOffsetRad;
      const wave = rippleCfg.ampPx * Math.sin(phase + norm * rippleCfg.rings * Math.PI * 2.0);
      const sampleR = r - wave;
      uv[0] = rippleCfg.centerXPx + sampleR * Math.cos(theta);
      uv[1] = rippleCfg.centerYPx + sampleR * Math.sin(theta);
    },
  };
}

function parseScanline(tr: JsonMap, layerListIndex: number): ScanlineWarp {
  return {
    ampPx: numDouble(tr, "ampPx", 2.5),
    strength: numDouble(tr, "strength", 1.0),
    phasePerRowRad: numDouble(tr, "phasePerRowRad", 0.4),
    timeRadPerSimTick: numDouble(tr, "timeRadPerTick", 0.05),
    pinnedRow: num(tr, "pinnedRow", 8),
    phaseOffsetRad: numDouble(tr, "phaseOffsetRad", defaultPhaseOffset(layerListIndex)),
  };
}

function parseFisheye(tr: JsonMap, layerListIndex: number): FisheyeLens {
  return {
    centerXPx: numDouble(tr, "centerXPx", VIEWPORT_W * 0.5),
    centerYPx: numDouble(tr, "centerYPx", VIEWPORT_H * 0.5),
    radiusPx: numDouble(tr, "radiusPx", Math.hypot(VIEWPORT_W, VIEWPORT_H) * 0.55),
    strength: numDouble(tr, "strength", 0.35),
    rippleAmp: numDouble(tr, "rippleAmp", 0.12),
    rippleFreq: numDouble(tr, "rippleFreq", 5.0),
    timeRadPerSimTick: numDouble(tr, "timeRadPerTick", 0.03),
    phaseOffsetRad: numDouble(tr, "phaseOffsetRad", defaultPhaseOffset(layerListIndex)),
  };
}

function parseSwirl(tr: JsonMap, layerListIndex: number): SwirlCfg {
  return {
    centerXPx: numDouble(tr, "centerXPx", VIEWPORT_W * 0.5),
    centerYPx: numDouble(tr, "centerYPx", VIEWPORT_H * 0.5),
    radiusPx: numDouble(tr, "radiusPx", Math.hypot(VIEWPORT_W, VIEWPORT_H) * 0.55),
    twistRad: numDouble(tr, "twistRad", 1.2),
    rippleAmp: numDouble(tr, "rippleAmp", 0.15),
    rippleFreq: numDouble(tr, "rippleFreq", 4.0),
    timeRadPerSimTick: numDouble(tr, "timeRadPerTick", 0.025),
    phaseOffsetRad: numDouble(tr, "phaseOffsetRad", defaultPhaseOffset(layerListIndex)),
  };
}

function parsePolarScroll(tr: JsonMap, layerListIndex: number): PolarScrollCfg {
  return {
    centerXPx: numDouble(tr, "centerXPx", VIEWPORT_W * 0.5),
    centerYPx: numDouble(tr, "centerYPx", VIEWPORT_H * 0.5),
    radiusPx: numDouble(tr, "radiusPx", Math.hypot(VIEWPORT_W, VIEWPORT_H) * 0.55),
    angleRadPerTick: numDouble(tr, "angleRadPerTick", 0.04),
    radialPxPerTick: numDouble(tr, "radialPxPerTick", 0.6),
    strength: numDouble(tr, "strength", 1.0),
    phaseOffsetRad: numDouble(tr, "phaseOffsetRad", defaultPhaseOffset(layerListIndex)),
  };
}

function parseWave2d(tr: JsonMap, layerListIndex: number): Wave2dCfg {
  return {
    ampXPx: numDouble(tr, "ampXPx", 2.0),
    ampYPx: numDouble(tr, "ampYPx", 1.5),
    phasePerColRad: numDouble(tr, "phasePerColRad", 0.35),
    phasePerRowRad: numDouble(tr, "phasePerRowRad", 0.45),
    pinnedCol: num(tr, "pinnedCol", 0),
    pinnedRow: num(tr, "pinnedRow", 8),
    timeRadPerSimTick: numDouble(tr, "timeRadPerTick", 0.05),
    phaseOffsetRad: numDouble(tr, "phaseOffsetRad", defaultPhaseOffset(layerListIndex)),
  };
}

function parseRipple(tr: JsonMap, layerListIndex: number): RadialRippleCfg {
  return {
    centerXPx: numDouble(tr, "centerXPx", VIEWPORT_W * 0.5),
    centerYPx: numDouble(tr, "centerYPx", VIEWPORT_H * 0.5),
    radiusPx: numDouble(tr, "radiusPx", Math.hypot(VIEWPORT_W, VIEWPORT_H) * 0.55),
    ampPx: numDouble(tr, "ampPx", 3.0),
    rings: numDouble(tr, "rings", 3.0),
    timeRadPerSimTick: numDouble(tr, "timeRadPerTick", 0.06),
    phaseOffsetRad: numDouble(tr, "phaseOffsetRad", defaultPhaseOffset(layerListIndex)),
  };
}
