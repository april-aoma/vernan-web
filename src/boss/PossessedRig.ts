/**
 * Thin loader for possessed.rig.json — part layout, poses, bob, hulls, draw order.
 * Pose offsets are world px relative to the assembly anchor in art-faces-left space.
 * Hull polygons are texture-local flat x0,y0,x1,y1,... (Java PossessedRig).
 */

export type PoseEntry = { dx: number; dy: number; angleDeg: number };

/** Axis-aligned bounds of a hurt/collision hull in texture-local frame coords. */
export type HullAabb = { minX: number; minY: number; maxX: number; maxY: number };

/** Flat polygon x0,y0,x1,y1,... (texture-local). */
export type FlatPolygon = number[];

export type PossessedPartDef = {
  name: string;
  frame: number;
  pivotX: number;
  pivotY: number;
  bobScale: number;
  /** Per-part multiplier on scanline-warp amplitude (1.0 = full). */
  scanlineScale: number;
  /** Hurt hull AABB from polygon bounds (texture-local) — convenience. */
  hurtAabb: HullAabb | null;
  /** Raw hurt polygon flat coords (texture-local); empty if missing. */
  hurt: FlatPolygon;
  /** Raw hit (contact damage) polygon; empty if missing. */
  hit: FlatPolygon;
  /** Raw collision polygon flat coords (texture-local); empty if missing. */
  collision: FlatPolygon;
};

export type PossessedRigData = {
  parts: PossessedPartDef[];
  drawOrder: string[];
  frameW: number;
  frameH: number;
  bobAmpPx: number;
  bobSpeedRadPerSec: number;
  /** Global scanline warp amplitude (px); multiplied by part.scanlineScale. */
  scanlineAmpPx: number;
  poses: Record<string, Record<string, PoseEntry>>;
  sequences: Record<string, string[]>;
  sheet: string;
  bulletSheet: string;
  bulletDieSheet: string;
  bulletW: number;
  bulletH: number;
  bulletFrames: number;
};

const RIG_PATH = "sprites/bosses/possessed.rig.json";

function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

/** Flatten [[x,y],...] → [x0,y0,x1,y1,...]; requires ≥3 points. */
export function flatPolygon(points: unknown): FlatPolygon {
  if (!Array.isArray(points) || points.length === 0) return [];
  const out: number[] = [];
  for (const pt of points) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const x = num(pt[0], NaN);
    const y = num(pt[1], NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push(x, y);
  }
  return out.length >= 6 ? out : [];
}

/** AABB from a flat polygon or [[x,y],...] points (texture-local). */
export function hullPolygonAabb(points: unknown): HullAabb | null {
  let flat: FlatPolygon;
  if (Array.isArray(points) && points.length > 0 && typeof points[0] === "number") {
    flat = points as number[];
  } else {
    flat = flatPolygon(points);
  }
  if (flat.length < 6) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i]!;
    const y = flat[i + 1]!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** AABB of a flat polygon. */
export function flatPolygonAabb(flat: ReadonlyArray<number>): HullAabb | null {
  return hullPolygonAabb(flat);
}

function parsePartHulls(pm: Record<string, unknown>): {
  hurt: FlatPolygon;
  hit: FlatPolygon;
  collision: FlatPolygon;
  hurtAabb: HullAabb | null;
} {
  let hurt: FlatPolygon = [];
  let hit: FlatPolygon = [];
  let collision: FlatPolygon = [];
  if (pm.hulls && typeof pm.hulls === "object") {
    const hulls = pm.hulls as Record<string, unknown>;
    hurt = flatPolygon(hulls.hurt);
    hit = flatPolygon(hulls.hit);
    collision = flatPolygon(hulls.collision);
  }
  const hurtAabb = hullPolygonAabb(hurt) ?? hullPolygonAabb(collision);
  return { hurt, hit, collision, hurtAabb };
}

function fallbackRig(): PossessedRigData {
  const idle: Record<string, PoseEntry> = {
    head: { dx: 0, dy: -10, angleDeg: 0 },
    body: { dx: 0, dy: 0, angleDeg: 0 },
    handL: { dx: -12, dy: 0, angleDeg: 0 },
    handR: { dx: 12, dy: 0, angleDeg: 0 },
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
        bobScale: 0.5,
        scanlineScale: 1,
        hurtAabb: full,
        hurt: box16.slice(),
        hit: box16.slice(),
        collision: box16.slice(),
      },
      {
        name: "body",
        frame: 1,
        pivotX: 8,
        pivotY: 8,
        bobScale: 1,
        scanlineScale: 1,
        hurtAabb: full,
        hurt: box16.slice(),
        hit: box16.slice(),
        collision: box16.slice(),
      },
      {
        name: "handL",
        frame: 2,
        pivotX: 8,
        pivotY: 8,
        bobScale: 1,
        scanlineScale: 1,
        hurtAabb: full,
        hurt: box16.slice(),
        hit: box16.slice(),
        collision: box16.slice(),
      },
      {
        name: "handR",
        frame: 3,
        pivotX: 8,
        pivotY: 8,
        bobScale: 1,
        scanlineScale: 1,
        hurtAabb: full,
        hurt: box16.slice(),
        hit: box16.slice(),
        collision: box16.slice(),
      },
    ],
    drawOrder: ["handL", "handR", "body", "head"],
    frameW: 16,
    frameH: 16,
    bobAmpPx: 1.5,
    bobSpeedRadPerSec: 2.4,
    scanlineAmpPx: 1.0,
    poses: { idle, telegraph: idle, hurt: idle, windup: idle, nova: idle, dash: idle, dash_windup: idle },
    sequences: { idle: ["idle"], dash_windup: ["dash_windup"], dash: ["dash"] },
    sheet: "possessed.png",
    bulletSheet: "possessed bullet.png",
    bulletDieSheet: "possessed bullet die.png",
    bulletW: 8,
    bulletH: 8,
    bulletFrames: 2,
  };
}

function parseRig(raw: Record<string, unknown>): PossessedRigData {
  let frameW = 16;
  let frameH = 16;
  if (Array.isArray(raw.frameSize) && raw.frameSize.length === 2) {
    frameW = Math.max(1, Math.floor(num(raw.frameSize[0], 16)));
    frameH = Math.max(1, Math.floor(num(raw.frameSize[1], 16)));
  }

  const parts: PossessedPartDef[] = [];
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
      const { hurt, hit, collision, hurtAabb } = parsePartHulls(pm);
      parts.push({
        name,
        frame: Math.floor(num(pm.frame, 0)),
        pivotX,
        pivotY,
        bobScale: num(pm.bobScale, 1),
        scanlineScale: num(pm.scanlineScale, 1),
        hurtAabb,
        hurt,
        hit,
        collision,
      });
    }
  }

  const drawOrder: string[] = [];
  if (Array.isArray(raw.drawOrder)) {
    for (const s of raw.drawOrder) drawOrder.push(String(s));
  } else {
    for (const p of parts) drawOrder.push(p.name);
  }

  let bobAmpPx = 1.5;
  let bobSpeedRadPerSec = 2.4;
  let scanlineAmpPx = 1.0;
  if (raw.bob && typeof raw.bob === "object") {
    const bob = raw.bob as Record<string, unknown>;
    bobAmpPx = num(bob.ampPx, 1.5);
    bobSpeedRadPerSec = num(bob.speedRadPerSec, 2.4);
    scanlineAmpPx = num(bob.scanlineAmpPx, 1.0);
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

  let bulletSheet = "possessed bullet.png";
  let bulletDieSheet = "possessed bullet die.png";
  let bulletW = 8;
  let bulletH = 8;
  let bulletFrames = 2;
  if (raw.bullet && typeof raw.bullet === "object") {
    const bm = raw.bullet as Record<string, unknown>;
    bulletSheet = String(bm.sheet ?? bulletSheet);
    bulletDieSheet = String(bm.dieSheet ?? bulletDieSheet);
    bulletFrames = Math.max(1, Math.floor(num(bm.frames, 2)));
    if (Array.isArray(bm.frameSize) && bm.frameSize.length === 2) {
      bulletW = Math.max(1, Math.floor(num(bm.frameSize[0], 8)));
      bulletH = Math.max(1, Math.floor(num(bm.frameSize[1], 8)));
    }
  }

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
    sheet: String(raw.sheet ?? "possessed.png"),
    bulletSheet,
    bulletDieSheet,
    bulletW,
    bulletH,
    bulletFrames,
  };
}

/** Pose offset for pose+part; falls back to idle, then zeros. */
export function poseOffset(rig: PossessedRigData, poseName: string, partName: string): PoseEntry {
  const pose = rig.poses[poseName] ?? rig.poses.idle;
  if (!pose) return { dx: 0, dy: 0, angleDeg: 0 };
  return pose[partName] ?? { dx: 0, dy: 0, angleDeg: 0 };
}

/** Sequence pose names; falls back to a single pose matching the sequence name. */
export function sequencePoses(rig: PossessedRigData, seqName: string): string[] {
  const seq = rig.sequences[seqName];
  if (seq && seq.length > 0) return seq;
  return [seqName];
}

/** Map progress 0..1 across a named sequence. */
export function poseFromSequence(rig: PossessedRigData, seqName: string, progress01: number): string {
  const seq = sequencePoses(rig, seqName);
  if (seq.length === 1) return seq[0]!;
  const p = Math.max(0, Math.min(1, progress01));
  let idx = Math.floor(p * seq.length);
  if (idx >= seq.length) idx = seq.length - 1;
  return seq[idx]!;
}

let cached: PossessedRigData | null = null;

export function getPossessedRig(): PossessedRigData | null {
  return cached;
}

/** Load via AssetLoader (fetch). Safe to call multiple times; caches result. */
export async function loadPossessedRig(assets: {
  loadJson: <T = unknown>(relPath: string) => Promise<T>;
}): Promise<PossessedRigData> {
  if (cached) return cached;
  try {
    const raw = await assets.loadJson<Record<string, unknown>>(RIG_PATH);
    cached = parseRig(raw);
  } catch {
    cached = fallbackRig();
  }
  return cached;
}
