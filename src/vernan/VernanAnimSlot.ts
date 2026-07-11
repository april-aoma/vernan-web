import { vernanAnimCueFromMap, VERNAN_ANIM_CUE_EMPTY, type VernanAnimCue } from "./VernanAnimCue";

/** One editor slot: a strip index (strip mode) or a labeled attack phase spanning strip frames. */
export type VernanAnimSlot = {
  readonly label: string;
  readonly stripFrames: readonly number[];
  readonly cue: VernanAnimCue;
};

export const VERNAN_ANIM_PHASE_LABELS = [
  "windup",
  "active",
  "early recover",
  "late recover",
] as const;

export function vernanAnimSlotFromMap(
  m: Record<string, unknown>,
  defaultLabel: string,
): VernanAnimSlot {
  const label = typeof m.label === "string" ? m.label : defaultLabel;
  const frames: number[] = [];
  const rawFrames = m.stripFrames;
  if (Array.isArray(rawFrames)) {
    for (const o of rawFrames) {
      if (typeof o === "number" && Number.isFinite(o)) frames.push(Math.trunc(o));
    }
  }
  if (frames.length === 0) frames.push(0);
  const cueMap =
    m.cue && typeof m.cue === "object" && !Array.isArray(m.cue)
      ? (m.cue as Record<string, unknown>)
      : null;
  return {
    label,
    stripFrames: frames,
    cue: cueMap ? vernanAnimCueFromMap(cueMap) : VERNAN_ANIM_CUE_EMPTY,
  };
}
