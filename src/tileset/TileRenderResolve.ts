/**
 * Resolves composed renderLayers for a tile: base stack + visualClips / visualPlayback
 * (Java TileRenderResolve subset).
 */

export type JsonMap = Record<string, unknown>;

export type ScanlineWarp = {
  ampPx: number;
  strength: number;
  phasePerRowRad: number;
  timeRadPerSimTick: number;
  clipFramePhaseRad: number;
  pinnedRow: number;
  clipFrameIndex: number;
};

export type GlowPulse = {
  scaleMin: number;
  scaleMax: number;
  scaleSpeedRadPerTick: number;
  alphaBase: number;
  alphaFlickerAmp: number;
  alphaFlickerSpeedRadPerTick: number;
  phaseRad: number;
};

export type ResolvedLayer = {
  layerId: string;
  z: number;
  sheetId: string;
  cellRow: number;
  cellCol: number;
  offsetXPx: number;
  offsetYPx: number;
  flipH: boolean;
  flipV: boolean;
  rotationMilliDeg: number;
  opacity: number;
  visible: boolean;
  blend: string;
  rotPivotKind: string;
  rotPivotCustomX: number;
  rotPivotCustomY: number;
  scanlineWarp: ScanlineWarp | null;
  glowPulse: GlowPulse | null;
};

export function glowScaleAt(glow: GlowPulse, simTicks: number, phaseOffsetRad: number): number {
  const mid = (glow.scaleMin + glow.scaleMax) * 0.5;
  const half = (glow.scaleMax - glow.scaleMin) * 0.5;
  return mid + half * Math.sin(simTicks * glow.scaleSpeedRadPerTick + glow.phaseRad + phaseOffsetRad);
}

export function glowAlphaAt(glow: GlowPulse, simTicks: number, phaseOffsetRad: number): number {
  const p = simTicks * glow.alphaFlickerSpeedRadPerTick + glow.phaseRad * 1.7 + phaseOffsetRad;
  const flicker = 0.6 * Math.sin(p) + 0.4 * Math.sin(p * 2.7 + 1.3);
  return Math.max(0, Math.min(255, Math.round(glow.alphaBase + glow.alphaFlickerAmp * flicker)));
}

export function resolve(
  tile: JsonMap,
  variationId: string,
  simTicks: number,
): ResolvedLayer[] {
  const stack = deepCopyLayers(baseRenderLayers(tile, variationId));
  applyVisualPlayback(tile, stack, simTicks);
  const out: ResolvedLayer[] = [];
  for (const layer of stack) {
    const sprObj = layer.sprite;
    if (!sprObj || typeof sprObj !== "object") continue;
    const sprite = sprObj as JsonMap;
    const cellObj = sprite.cell;
    if (!cellObj || typeof cellObj !== "object") continue;
    const cell = cellObj as JsonMap;
    const pivot = parseRotationPivot(layer.rotationPivot);
    let clipFrame = 0;
    if (typeof layer._clipFrameIdx === "number") clipFrame = layer._clipFrameIdx;
    delete layer._clipFrameIdx;
    out.push({
      layerId: str(layer.layerId, "base"),
      z: num(layer.z, 0),
      sheetId: str(sprite.sheetId, "main"),
      cellRow: num(cell.row, 0),
      cellCol: num(cell.col, 0),
      offsetXPx: num(layer.offsetXPx, 0),
      offsetYPx: num(layer.offsetYPx, 0),
      flipH: bool(layer.flipH, false),
      flipV: bool(layer.flipV, false),
      rotationMilliDeg: num(layer.rotationMilliDeg, 0),
      opacity: num(layer.opacity, 255),
      visible: bool(layer.visible, true),
      blend: str(layer.blend, "normal"),
      rotPivotKind: pivot.kind,
      rotPivotCustomX: pivot.customX,
      rotPivotCustomY: pivot.customY,
      scanlineWarp: parseScanlineWarp(layer.scanlineWarp, clipFrame),
      glowPulse: parseGlowPulse(layer.glowPulse),
    });
  }
  out.sort((a, b) => a.z - b.z);
  return out;
}

export function resolvedStackUsesScanlineWarp(
  tile: JsonMap,
  variationId: string,
  simTicks: number,
): boolean {
  return resolve(tile, variationId, simTicks).some((L) => L.scanlineWarp != null);
}

export function resolvedStackUsesGlowPulse(
  tile: JsonMap,
  variationId: string,
  simTicks: number,
): boolean {
  return resolve(tile, variationId, simTicks).some((L) => L.glowPulse != null);
}

/** True when the tile needs composite draw (clips / warp / glow / multi-layer). */
export function tileNeedsComposite(tile: JsonMap | null | undefined): boolean {
  if (!tile) return false;
  const layers = asList(tile.renderLayers);
  if (layers.length > 1) return true;
  if (asList(tile.visualClips).length > 0) return true;
  for (const raw of layers) {
    if (!raw || typeof raw !== "object") continue;
    const L = raw as JsonMap;
    if (isEnabledFx(L.scanlineWarp) || isEnabledFx(L.glowPulse)) return true;
    if (str(L.blend, "normal").toLowerCase() !== "normal") return true;
  }
  return false;
}

function isEnabledFx(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return bool((raw as JsonMap).enabled, true);
}

function baseRenderLayers(tile: JsonMap, variationId: string): JsonMap[] {
  if (variationId) {
    for (const vo of asList(tile.variations)) {
      if (!vo || typeof vo !== "object") continue;
      const vmap = vo as JsonMap;
      if (str(vmap.id) !== variationId) continue;
      const rl = mapList(vmap.renderLayers);
      if (rl.length) return rl;
      if (vmap.sprite && typeof vmap.sprite === "object") {
        return [singleLayerFromSprite(vmap.sprite as JsonMap, str(vmap.id, "var"), 0)];
      }
      break;
    }
  }
  const base = mapList(tile.renderLayers);
  if (base.length) return base;
  if (tile.sprite && typeof tile.sprite === "object") {
    return [singleLayerFromSprite(tile.sprite as JsonMap, "base", 0)];
  }
  return [];
}

function singleLayerFromSprite(sprite: JsonMap, layerId: string, z: number): JsonMap {
  return {
    layerId,
    z,
    sprite: { ...sprite },
    offsetXPx: 0,
    offsetYPx: 0,
    flipH: false,
    flipV: false,
    rotationMilliDeg: 0,
    opacity: 255,
    visible: true,
    blend: "normal",
  };
}

function applyVisualPlayback(tile: JsonMap, stack: JsonMap[], simTicks: number): void {
  const clipsList = asList(tile.visualClips);
  if (!clipsList.length) return;
  const clipsById = new Map<string, JsonMap>();
  for (const c of clipsList) {
    if (!c || typeof c !== "object") continue;
    const cm = c as JsonMap;
    const id = str(cm.id);
    if (id) clipsById.set(id, cm);
  }
  if (!clipsById.size) return;
  const vp =
    tile.visualPlayback && typeof tile.visualPlayback === "object"
      ? (tile.visualPlayback as JsonMap)
      : {};
  const overrides = stringToStringMap(vp.layerClipOverrides);
  const defaultClipId = str(vp.defaultClipId);

  for (const layer of stack) {
    const lid = str(layer.layerId);
    const clipId = overrides.get(lid) ?? defaultClipId;
    if (!clipId) continue;
    const clip = clipsById.get(clipId);
    if (!clip || !clipAppliesToLayer(clip, lid)) continue;
    const frameIdx = computeFrameIndex(clip, simTicks);
    const frames = asList(clip.frames);
    if (frameIdx < 0 || frameIdx >= frames.length) continue;
    const fk = frames[frameIdx];
    if (!fk || typeof fk !== "object") continue;
    applyKeyframeToLayer(layer, fk as JsonMap, lid);
    layer._clipFrameIdx = frameIdx;
  }
}

function clipAppliesToLayer(clip: JsonMap, layerId: string): boolean {
  const applyTo = str(clip.applyTo);
  if (applyTo === "allLayers") return true;
  const layerIds = asList(clip.layerIds);
  if (layerIds.length) {
    for (const o of layerIds) {
      if (layerId === String(o)) return true;
    }
  }
  const single = str(clip.layerId);
  if (single) return single === layerId;
  return !applyTo && layerIds.length === 0;
}

function computeFrameIndex(clip: JsonMap, simTicks: number): number {
  const tpf = Math.max(1, num(clip.ticksPerFrame, 4));
  const frames = asList(clip.frames);
  const n = frames.length;
  if (n <= 0) return 0;
  const step = Math.floor(simTicks / tpf);
  const pingpong = bool(clip.pingpong, false);
  const loop = bool(clip.loop, true);
  if (pingpong && n > 1) {
    const period = Math.max(1, (n - 1) * 2);
    const u = floorMod(step, period);
    if (u >= n) return period - u;
    return u;
  }
  if (loop) return floorMod(step, n);
  return Math.min(Math.max(0, step), n - 1);
}

function applyKeyframeToLayer(layer: JsonMap, frame: JsonMap, layerId: string): void {
  const lsObj = frame.layerSprites;
  if (lsObj && typeof lsObj === "object") {
    const spr = (lsObj as JsonMap)[layerId];
    if (spr && typeof spr === "object") {
      layer.sprite = deepCopyMap(spr as JsonMap);
    }
  }
  let ox = num(layer.offsetXPx, 0);
  let oy = num(layer.offsetYPx, 0);
  ox += intFromLayerMap(frame, "layerOffsetXPx", layerId);
  oy += intFromLayerMap(frame, "layerOffsetYPx", layerId);
  layer.offsetXPx = ox;
  layer.offsetYPx = oy;
  const rotMap = frame.layerRotationMilliDeg;
  if (rotMap && typeof rotMap === "object") {
    const v = (rotMap as JsonMap)[layerId];
    if (typeof v === "number") layer.rotationMilliDeg = v;
  }
  const pivMap = frame.layerRotationPivot;
  if (pivMap && typeof pivMap === "object" && layerId in (pivMap as JsonMap)) {
    layer.rotationPivot = (pivMap as JsonMap)[layerId];
  }
}

function intFromLayerMap(frame: JsonMap, key: string, layerId: string): number {
  const m = frame[key];
  if (!m || typeof m !== "object") return 0;
  const v = (m as JsonMap)[layerId];
  return typeof v === "number" ? v : 0;
}

function parseScanlineWarp(raw: unknown, clipFrameIndex: number): ScanlineWarp | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as JsonMap;
  if (!bool(m.enabled, true)) return null;
  return {
    ampPx: num(m.ampPx, 1.2),
    strength: num(m.strength, 1.0),
    phasePerRowRad: num(m.phasePerRowRad, 0.52),
    timeRadPerSimTick: num(m.timeRadPerSimTick, 2.8 / 60.0),
    clipFramePhaseRad: num(m.clipFramePhaseRad, 0.33),
    pinnedRow: num(m.pinnedRow, 0),
    clipFrameIndex,
  };
}

function parseGlowPulse(raw: unknown): GlowPulse | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as JsonMap;
  if (!bool(m.enabled, true)) return null;
  return {
    scaleMin: num(m.scaleMin, 0.85),
    scaleMax: num(m.scaleMax, 1.2),
    scaleSpeedRadPerTick: num(m.scaleSpeedRadPerTick, 0.06),
    alphaBase: num(m.alphaBase, 180),
    alphaFlickerAmp: num(m.alphaFlickerAmp, 55),
    alphaFlickerSpeedRadPerTick: num(m.alphaFlickerSpeedRadPerTick, 0.22),
    phaseRad: num(m.phaseRad, 0),
  };
}

function parseRotationPivot(raw: unknown): { kind: string; customX: number; customY: number } {
  if (raw == null) return { kind: "layerBoundsCenter", customX: 0, customY: 0 };
  if (typeof raw === "string") {
    if (raw === "tileOrigin") return { kind: "tileOrigin", customX: 0, customY: 0 };
    return { kind: "layerBoundsCenter", customX: 0, customY: 0 };
  }
  if (typeof raw === "object") {
    const m = raw as JsonMap;
    const k = str(m.kind);
    if (k === "custom" || "xPx" in m) {
      return { kind: "custom", customX: num(m.xPx, 0), customY: num(m.yPx, 0) };
    }
    if (k === "tileOrigin") return { kind: "tileOrigin", customX: 0, customY: 0 };
  }
  return { kind: "layerBoundsCenter", customX: 0, customY: 0 };
}

function deepCopyLayers(layers: JsonMap[]): JsonMap[] {
  return layers.map((L) => deepCopyMap(L));
}

function deepCopyMap(m: JsonMap): JsonMap {
  return JSON.parse(JSON.stringify(m)) as JsonMap;
}

function mapList(raw: unknown): JsonMap[] {
  const out: JsonMap[] = [];
  for (const o of asList(raw)) {
    if (o && typeof o === "object") out.push(o as JsonMap);
  }
  return out;
}

function asList(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function stringToStringMap(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as JsonMap)) {
    if (v != null) out.set(k, String(v));
  }
  return out;
}

function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

function str(v: unknown, def = ""): string {
  return typeof v === "string" ? v : def;
}

function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === "boolean" ? v : def;
}
