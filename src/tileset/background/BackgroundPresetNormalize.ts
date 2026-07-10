import { asList, ensureList, str, type JsonMap } from "./jsonMaps";
import { isSpatialKind } from "./BackgroundSpatialDistortion";

/** Prepares preset JSON for BackgroundRendererV3 — mirrors Java `BackgroundPresetNormalize`. */

export function copyPreset(src: JsonMap): JsonMap {
  return deepCopyMap(src);
}

/** Deep-copy layer transforms so layers do not share map instances from JSON parse. */
export function isolateLayerTransforms(preset: JsonMap): void {
  const rawLayers = ensureList(preset, "layers");
  for (let i = 0; i < rawLayers.length; i++) {
    const lo = rawLayers[i];
    if (!lo || typeof lo !== "object" || Array.isArray(lo)) continue;
    const layer = lo as JsonMap;
    const tr = asList(layer["transforms"]);
    const isolated: unknown[] = [];
    if (tr) {
      for (const to of tr) {
        if (!to || typeof to !== "object" || Array.isArray(to)) continue;
        const copy = deepCopyMap(to as JsonMap);
        if (isSpatialKind(str(copy, "kind", "")) && !("phaseOffsetRad" in copy)) {
          copy["phaseOffsetRad"] = i * 2.399963229728653;
        }
        isolated.push(copy);
      }
    }
    layer["transforms"] = isolated;
  }
}

function deepCopyMap(src: JsonMap): JsonMap {
  const out: JsonMap = {};
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepCopyMap(v as JsonMap);
    } else if (Array.isArray(v)) {
      out[k] = deepCopyList(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function deepCopyList(src: unknown[]): unknown[] {
  const out: unknown[] = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const o = src[i];
    if (o && typeof o === "object" && !Array.isArray(o)) {
      out[i] = deepCopyMap(o as JsonMap);
    } else if (Array.isArray(o)) {
      out[i] = deepCopyList(o);
    } else {
      out[i] = o;
    }
  }
  return out;
}
