/**
 * Thin loader for nephilim.rig.json — puppet part layout, poses, hulls, draw order.
 * Pose offsets are world px relative to the body-anchor in art-faces-left space.
 */

import {
  effectiveConnectorEndpoints,
  isConnector,
  lookupPin,
  normalizeAttachMap,
  normalizePinRole,
  PARENT,
} from "../entity/ChainPinModel";
import {
  flatPolygon,
  hullPolygonAabb,
  type FlatPolygon,
  type HullAabb,
  type PoseEntry,
} from "./PossessedRig";

export type { FlatPolygon, HullAabb, PoseEntry };

export type NephilimPartDef = {
  name: string;
  frame: number;
  pivotX: number;
  pivotY: number;
  bobScale: number;
  scanlineScale: number;
  hurtAabb: HullAabb | null;
  hurt: FlatPolygon;
  hit: FlatPolygon;
  grab: FlatPolygon;
  collision: FlatPolygon;
  chainAttach: Record<string, [number, number]>;
};

/** Compatible with PossessedRigData minus bullet fields. */
export type EnemyRigData = {
  parts: NephilimPartDef[];
  drawOrder: string[];
  frameW: number;
  frameH: number;
  bobAmpPx: number;
  bobSpeedRadPerSec: number;
  scanlineAmpPx: number;
  poses: Record<string, Record<string, PoseEntry>>;
  sequences: Record<string, string[]>;
  sheet: string;
  /** Anchor-relative collision polygon flat x0,y0,... (art faces left). */
  anchorCollision: FlatPolygon;
};

export type NephilimRigData = EnemyRigData;

const RIG_PATH = "sprites/bosses/nephilim.rig.json";
const PART_FRAME_SIZE = 16;

function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

function parsePartHulls(pm: Record<string, unknown>): {
  hurt: FlatPolygon;
  hit: FlatPolygon;
  grab: FlatPolygon;
  collision: FlatPolygon;
  hurtAabb: HullAabb | null;
} {
  let hurt: FlatPolygon = [];
  let hit: FlatPolygon = [];
  let grab: FlatPolygon = [];
  let collision: FlatPolygon = [];
  if (pm.hulls && typeof pm.hulls === "object") {
    const hulls = pm.hulls as Record<string, unknown>;
    hurt = flatPolygon(hulls.hurt);
    hit = flatPolygon(hulls.hit);
    grab = flatPolygon(hulls.grab);
    collision = flatPolygon(hulls.collision);
  }
  const hurtAabb = hullPolygonAabb(hurt) ?? hullPolygonAabb(collision);
  return { hurt, hit, grab, collision, hurtAabb };
}

function parseChainAttach(partName: string, raw: unknown): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v) || v.length < 2) continue;
    out[k] = [num(v[0], 0), num(v[1], 0)];
  }
  return normalizeAttachMap(partName, out);
}

function fallbackRig(): NephilimRigData {
  const idle: Record<string, PoseEntry> = {
    head: { dx: -1, dy: -18, angleDeg: 0 },
    body: { dx: 2, dy: -5, angleDeg: 0 },
    handL: { dx: -14, dy: 2, angleDeg: 0 },
    handR: { dx: 14, dy: 2, angleDeg: 0 },
  };
  const box16: FlatPolygon = [3, 2, 13, 2, 13, 13, 3, 13];
  const full = hullPolygonAabb(box16)!;
  return {
    parts: [
      {
        name: "head",
        frame: 0,
        pivotX: 8,
        pivotY: 8,
        bobScale: 0.35,
        scanlineScale: 0,
        hurtAabb: full,
        hurt: box16.slice(),
        hit: box16.slice(),
        grab: [],
        collision: box16.slice(),
        chainAttach: {},
      },
      {
        name: "body",
        frame: 1,
        pivotX: 8,
        pivotY: 8,
        bobScale: 1,
        scanlineScale: 0,
        hurtAabb: full,
        hurt: box16.slice(),
        hit: box16.slice(),
        grab: [],
        collision: box16.slice(),
        chainAttach: {},
      },
    ],
    drawOrder: ["body", "head"],
    frameW: 16,
    frameH: 16,
    bobAmpPx: 0.8,
    bobSpeedRadPerSec: 2.2,
    scanlineAmpPx: 0,
    poses: { idle, rest_0: idle, hurt: idle },
    sequences: {
      idle: ["idle"],
      rest: ["rest_0"],
      awaken: ["awaken_0", "awaken_1", "idle_1", "idle"],
      walk: ["walk", "walk_0", "walk_1", "walk_2", "walk_3"],
      death: ["death", "death_0"],
    },
    sheet: "nephilim.png",
    anchorCollision: [-10, -5, 15, -5, 15, 22, -10, 22],
  };
}

function parseAnchorCollision(raw: unknown): FlatPolygon {
  if (!Array.isArray(raw)) return [];
  const pts: number[] = [];
  for (const pt of raw) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    pts.push(num(pt[0], 0), num(pt[1], 0));
  }
  return pts.length >= 6 ? pts : [];
}

function parseRig(raw: Record<string, unknown>): NephilimRigData {
  let frameW = 16;
  let frameH = 16;
  if (Array.isArray(raw.frameSize) && raw.frameSize.length === 2) {
    frameW = Math.max(1, Math.floor(num(raw.frameSize[0], 16)));
    frameH = Math.max(1, Math.floor(num(raw.frameSize[1], 16)));
  }

  const parts: NephilimPartDef[] = [];
  if (Array.isArray(raw.parts)) {
    for (const p of raw.parts) {
      if (!p || typeof p !== "object") continue;
      const pm = p as Record<string, unknown>;
      const name = String(pm.name ?? "");
      if (!name) continue;
      let pivotX = frameW / 2;
      let pivotY = frameH / 2;
      if (Array.isArray(pm.pivot) && pm.pivot.length === 2) {
        pivotX = num(pm.pivot[0], pivotX);
        pivotY = num(pm.pivot[1], pivotY);
      }
      const { hurt, hit, grab, collision, hurtAabb } = parsePartHulls(pm);
      parts.push({
        name,
        frame: Math.floor(num(pm.frame, 0)),
        pivotX,
        pivotY,
        bobScale: num(pm.bobScale, 1),
        scanlineScale: num(pm.scanlineScale, 0),
        hurtAabb,
        hurt,
        hit,
        grab,
        collision,
        chainAttach: parseChainAttach(name, pm.chainAttach),
      });
    }
  }

  const drawOrder: string[] = [];
  if (Array.isArray(raw.drawOrder)) {
    for (const s of raw.drawOrder) drawOrder.push(String(s));
  } else {
    for (const p of parts) drawOrder.push(p.name);
  }

  let bobAmpPx = 0.8;
  let bobSpeedRadPerSec = 2.2;
  let scanlineAmpPx = 0;
  if (raw.bob && typeof raw.bob === "object") {
    const bob = raw.bob as Record<string, unknown>;
    bobAmpPx = num(bob.ampPx, 0.8);
    bobSpeedRadPerSec = num(bob.speedRadPerSec, 2.2);
    scanlineAmpPx = num(bob.scanlineAmpPx, 0);
  }

  const poses: Record<string, Record<string, PoseEntry>> = {};
  if (raw.poses && typeof raw.poses === "object") {
    for (const [poseName, poseVal] of Object.entries(raw.poses as Record<string, unknown>)) {
      if (!poseVal || typeof poseVal !== "object") continue;
      const pm: Record<string, PoseEntry> = {};
      for (const [partName, partVal] of Object.entries(poseVal as Record<string, unknown>)) {
        if (!partVal || typeof partVal !== "object") continue;
        const v = partVal as Record<string, unknown>;
        pm[partName] = {
          dx: num(v.dx, 0),
          dy: num(v.dy, 0),
          angleDeg: num(v.angle, 0),
        };
      }
      poses[poseName] = pm;
    }
  }

  const sequences: Record<string, string[]> = {};
  if (raw.sequences && typeof raw.sequences === "object") {
    for (const [seqName, seqVal] of Object.entries(raw.sequences as Record<string, unknown>)) {
      if (!Array.isArray(seqVal)) continue;
      const names = seqVal.map((s) => String(s)).filter(Boolean);
      if (names.length) sequences[seqName] = names;
    }
  }
  if (!sequences.idle) sequences.idle = ["idle"];

  const anchorCollision = parseAnchorCollision(raw.anchorCollision);
  if (parts.length === 0) return fallbackRig();

  return {
    parts,
    drawOrder,
    frameW,
    frameH,
    bobAmpPx,
    bobSpeedRadPerSec,
    scanlineAmpPx,
    poses,
    sequences,
    sheet: String(raw.sheet ?? "nephilim.png"),
    anchorCollision:
      anchorCollision.length >= 6 ? anchorCollision : [-10, -5, 15, -5, 15, 22, -10, 22],
  };
}

/** Pivot-local chain socket for part/pin (legacy alias support via ChainPinModel). */
export function chainAttach(
  rig: NephilimRigData,
  partName: string,
  pin: string,
  frameW: number,
  frameH: number,
): [number, number] {
  const def = rig.parts.find((p) => p.name === partName);
  if (def) {
    if (isConnector(def.name)) {
      const ends = effectiveConnectorEndpoints(
        def.name,
        def.chainAttach,
        def.hurt,
        def.pivotX,
        def.pivotY,
      );
      const norm = normalizePinRole(def.name, pin);
      return norm === PARENT ? ends[0] : ends[1];
    }
    return lookupPin(def.chainAttach, partName, pin);
  }
  const d = lookupPin(null, partName, pin);
  if (d[0] !== 0 || d[1] !== 0) return d;
  return [frameW / 2, frameH / 2];
}

export function poseOffset(rig: NephilimRigData, poseName: string, partName: string): PoseEntry {
  const pose = rig.poses[poseName] ?? rig.poses.idle;
  if (!pose) return { dx: 0, dy: 0, angleDeg: 0 };
  return pose[partName] ?? { dx: 0, dy: 0, angleDeg: 0 };
}

export function sequence(rig: NephilimRigData, seqName: string): string[] {
  const seq = rig.sequences[seqName];
  if (seq && seq.length > 0) return seq;
  return [seqName];
}

export function poseFromSequence(rig: NephilimRigData, seqName: string, progress01: number): string {
  const seq = sequence(rig, seqName);
  if (seq.length === 1) return seq[0]!;
  const p = Math.max(0, Math.min(1, progress01));
  let idx = Math.floor(p * seq.length);
  if (idx >= seq.length) idx = seq.length - 1;
  return seq[idx]!;
}

/** Lowest anchor-relative Y from idle poses + anchor collision (Java feetBelowAnchorFromRig). */
export function feetBelowAnchorFromRig(rig: NephilimRigData): number {
  let maxBottom = 20;
  if (rig.anchorCollision.length >= 2) {
    for (let i = 1; i < rig.anchorCollision.length; i += 2) {
      maxBottom = Math.max(maxBottom, rig.anchorCollision[i]!);
    }
  }
  const poses = sequence(rig, "idle");
  const poseNames = poses.length > 0 ? poses : ["idle"];
  for (const poseName of poseNames) {
    for (const def of rig.parts) {
      const pe = poseOffset(rig, poseName, def.name);
      maxBottom = Math.max(maxBottom, partLowestRelativeY(def, pe, rig.frameW, rig.frameH));
    }
  }
  return maxBottom;
}

function partLowestRelativeY(
  def: NephilimPartDef,
  pe: PoseEntry,
  frameW: number,
  frameH: number,
): number {
  const cy = pe.dy;
  const a = (pe.angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let maxY = cy;
  const corners: Array<[number, number]> = [
    [0, 0],
    [frameW, 0],
    [0, frameH],
    [frameW, frameH],
  ];
  for (const c of corners) {
    const lx = c[0] - def.pivotX;
    const ly = c[1] - def.pivotY;
    const ry = lx * sin + ly * cos;
    maxY = Math.max(maxY, cy + ry);
  }
  return maxY;
}

let cached: NephilimRigData | null = null;

export function getNephilimRig(): NephilimRigData | null {
  return cached;
}

export async function loadNephilimRig(assets: {
  loadJson: <T = unknown>(relPath: string) => Promise<T>;
}): Promise<NephilimRigData> {
  if (cached) return cached;
  try {
    const raw = await assets.loadJson<Record<string, unknown>>(RIG_PATH);
    cached = parseRig(raw);
  } catch {
    cached = fallbackRig();
  }
  return cached;
}

export { PART_FRAME_SIZE };
