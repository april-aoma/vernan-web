/** Per-slot gameplay / squash cue authored in {@code data/vernan_anim_cues.json}. */
export type VernanAnimCue = {
  readonly vx: number | null;
  readonly vy: number | null;
  readonly scaleX: number | null;
  readonly scaleY: number | null;
  readonly recoverFrames: number | null;
  /** Only fire when the current attack began on the ground. */
  readonly requireGroundStart: boolean;
  /** Only fire when the current attack began in the air. */
  readonly requireAirStart: boolean;
  /** When true, {@link #vx} replaces horizontal speed; otherwise it is added. */
  readonly vxSet: boolean;
  /** When true, {@link #vy} replaces vertical speed; otherwise it is added. */
  readonly vySet: boolean;
};

export const VERNAN_ANIM_CUE_EMPTY: VernanAnimCue = {
  vx: null,
  vy: null,
  scaleX: null,
  scaleY: null,
  recoverFrames: null,
  requireGroundStart: false,
  requireAirStart: false,
  vxSet: false,
  vySet: false,
};

export function vernanAnimCueIsEmpty(cue: VernanAnimCue): boolean {
  return (
    cue.vx == null &&
    cue.vy == null &&
    cue.scaleX == null &&
    cue.scaleY == null &&
    cue.recoverFrames == null &&
    !cue.requireGroundStart &&
    !cue.requireAirStart &&
    !cue.vxSet &&
    !cue.vySet
  );
}

export function vernanAnimCueHasSquash(cue: VernanAnimCue): boolean {
  return cue.scaleX != null || cue.scaleY != null;
}

/** Authored {@code vx} is facing-relative magnitude; {@code facing} is {@code +1} or {@code -1}. */
export function vernanAnimCueApplyVx(
  cue: VernanAnimCue,
  currentVx: number,
  facing: number,
): number {
  if (cue.vx == null) return currentVx;
  const impulse = facing * cue.vx;
  return cue.vxSet ? impulse : currentVx + impulse;
}

/** Authored {@code vy} is world-space (negative = up). */
export function vernanAnimCueApplyVy(cue: VernanAnimCue, currentVy: number): number {
  if (cue.vy == null) return currentVy;
  return cue.vySet ? cue.vy : currentVy + cue.vy;
}

export function vernanAnimCueFromMap(m: Record<string, unknown> | null | undefined): VernanAnimCue {
  if (!m || typeof m !== "object") return VERNAN_ANIM_CUE_EMPTY;
  return {
    vx: readNumber(m.vx),
    vy: readNumber(m.vy),
    scaleX: readNumber(m.scaleX),
    scaleY: readNumber(m.scaleY),
    recoverFrames: readInt(m.recoverFrames),
    requireGroundStart: m.requireGroundStart === true,
    requireAirStart: m.requireAirStart === true,
    vxSet: m.vxSet === true,
    vySet: m.vySet === true,
  };
}

function readNumber(o: unknown): number | null {
  return typeof o === "number" && Number.isFinite(o) ? o : null;
}

function readInt(o: unknown): number | null {
  return typeof o === "number" && Number.isFinite(o) ? Math.trunc(o) : null;
}
