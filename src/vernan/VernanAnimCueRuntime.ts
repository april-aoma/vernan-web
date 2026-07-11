import { SquashStretch } from "../render/SquashStretch";
import {
  vernanAnimCueHasSquash,
  vernanAnimCueIsEmpty,
  type VernanAnimCue,
} from "./VernanAnimCue";
import type { VernanAnimCueSheet } from "./VernanAnimCueSheet";
import type { VernanAnimEntry } from "./VernanAnimEntry";

/**
 * Runtime bridge from {@code data/vernan_anim_cues.json} to {@link SquashStretch} and movement impulses.
 *
 * Squash fires on each strip-index / phase trigger. {@code vx}/{@code vy} are one-shot impulses applied
 * once when a cue slot is entered (phase transition, or first strip index mapped to that slot).
 */
export class VernanAnimCueRuntime {
  private static readonly FALLBACK_JUMP_STRETCH_Y = 1.2;
  private static readonly FALLBACK_JUMP_STRETCH_RECOVER = 20;
  private static readonly FALLBACK_LAND_SQUASH_X = 1.2;
  private static readonly FALLBACK_CROUCH_SQUASH_Y = 0.9;
  private static readonly FALLBACK_CROUCH_SQUASH_RECOVER = 4;

  private static sheet: VernanAnimCueSheet | null = null;

  static load(sheet: VernanAnimCueSheet): void {
    VernanAnimCueRuntime.sheet = sheet;
  }

  /** Virtual / single-frame on-enter cues (e.g. {@code crouch}, {@code land}). */
  static applyOnEnter(
    squash: SquashStretch,
    sink: ((cue: VernanAnimCue) => void) | null,
    logicalKey: string,
    onGround: boolean,
    recoverOverride: number | null = null,
  ): void {
    if (VernanAnimCueRuntime.tryApplyOnEnter(squash, sink, logicalKey, onGround, recoverOverride)) {
      return;
    }
    VernanAnimCueRuntime.applyBuiltinOnEnter(squash, logicalKey, recoverOverride);
  }

  /** Strip-index cues (e.g. {@code jump} frame 0, headband strip advance). */
  static applyOnStripIndex(
    squash: SquashStretch,
    sink: ((cue: VernanAnimCue) => void) | null,
    logicalKey: string,
    stripIndex: number,
    priorStripIndex: number,
    startedOnGround: boolean,
    startedInAir: boolean = !startedOnGround,
  ): void {
    if (
      VernanAnimCueRuntime.tryApplyOnStripIndex(
        squash,
        sink,
        logicalKey,
        stripIndex,
        priorStripIndex,
        startedOnGround,
        startedInAir,
        null,
      )
    ) {
      return;
    }
    VernanAnimCueRuntime.applyBuiltinStripIndex(squash, logicalKey, stripIndex);
  }

  /** Phase-slot cues for attacks ({@code windup}=0 … {@code late recover}=3). */
  static applyOnPhase(
    squash: SquashStretch,
    sink: ((cue: VernanAnimCue) => void) | null,
    logicalKey: string,
    phaseSlotIndex: number,
    startedOnGround: boolean,
    startedInAir: boolean = !startedOnGround,
  ): void {
    VernanAnimCueRuntime.tryApplyOnPhase(
      squash,
      sink,
      logicalKey,
      phaseSlotIndex,
      startedOnGround,
      startedInAir,
      null,
    );
  }

  private static tryApplyOnEnter(
    squash: SquashStretch,
    sink: ((cue: VernanAnimCue) => void) | null,
    logicalKey: string,
    onGround: boolean,
    recoverOverride: number | null,
  ): boolean {
    const entry = VernanAnimCueRuntime.sheet?.get(logicalKey);
    if (!entry || entry.slots.length === 0) return false;
    const cue = entry.slots[0]!.cue;
    const squashApplied = VernanAnimCueRuntime.applyCueSquash(
      squash,
      cue,
      onGround,
      !onGround,
      recoverOverride,
    );
    const impulseApplied = VernanAnimCueRuntime.applyCueImpulse(sink, cue, onGround, !onGround);
    return squashApplied || impulseApplied;
  }

  private static tryApplyOnStripIndex(
    squash: SquashStretch,
    sink: ((cue: VernanAnimCue) => void) | null,
    logicalKey: string,
    stripIndex: number,
    priorStripIndex: number,
    startedOnGround: boolean,
    startedInAir: boolean,
    recoverOverride: number | null,
  ): boolean {
    const entry = VernanAnimCueRuntime.sheet?.get(logicalKey);
    if (!entry || entry.slots.length === 0) return false;
    const slot = VernanAnimCueRuntime.slotIndexForStrip(entry, stripIndex);
    const cue = entry.slots[slot]!.cue;
    const squashApplied = VernanAnimCueRuntime.applyCueSquash(
      squash,
      cue,
      startedOnGround,
      startedInAir,
      recoverOverride,
    );
    let impulseApplied = false;
    if (VernanAnimCueRuntime.slotEntered(entry, stripIndex, priorStripIndex)) {
      impulseApplied = VernanAnimCueRuntime.applyCueImpulse(
        sink,
        cue,
        startedOnGround,
        startedInAir,
      );
    }
    return squashApplied || impulseApplied;
  }

  private static tryApplyOnPhase(
    squash: SquashStretch,
    sink: ((cue: VernanAnimCue) => void) | null,
    logicalKey: string,
    phaseSlotIndex: number,
    startedOnGround: boolean,
    startedInAir: boolean,
    recoverOverride: number | null,
  ): boolean {
    const entry = VernanAnimCueRuntime.sheet?.get(logicalKey);
    if (!entry || entry.slots.length === 0) return false;
    const slot = Math.min(Math.max(0, phaseSlotIndex), entry.slots.length - 1);
    const cue = entry.slots[slot]!.cue;
    const squashApplied = VernanAnimCueRuntime.applyCueSquash(
      squash,
      cue,
      startedOnGround,
      startedInAir,
      recoverOverride,
    );
    const impulseApplied = VernanAnimCueRuntime.applyCueImpulse(
      sink,
      cue,
      startedOnGround,
      startedInAir,
    );
    return squashApplied || impulseApplied;
  }

  private static slotEntered(
    entry: VernanAnimEntry,
    stripIndex: number,
    priorStripIndex: number,
  ): boolean {
    if (priorStripIndex < 0) return true;
    return (
      VernanAnimCueRuntime.slotIndexForStrip(entry, stripIndex) !==
      VernanAnimCueRuntime.slotIndexForStrip(entry, priorStripIndex)
    );
  }

  private static applyCueImpulse(
    sink: ((cue: VernanAnimCue) => void) | null,
    cue: VernanAnimCue,
    groundStart: boolean,
    airStart: boolean,
  ): boolean {
    if (!sink || vernanAnimCueIsEmpty(cue) || (cue.vx == null && cue.vy == null)) {
      return false;
    }
    if (cue.requireGroundStart && !groundStart) return false;
    if (cue.requireAirStart && !airStart) return false;
    sink(cue);
    return true;
  }

  private static applyCueSquash(
    squash: SquashStretch,
    cue: VernanAnimCue,
    groundStart: boolean,
    airStart: boolean,
    recoverOverride: number | null,
  ): boolean {
    if (vernanAnimCueIsEmpty(cue) || !vernanAnimCueHasSquash(cue)) return false;
    if (cue.requireGroundStart && !groundStart) return false;
    if (cue.requireAirStart && !airStart) return false;
    const recover =
      recoverOverride != null
        ? Math.max(1, recoverOverride)
        : cue.recoverFrames != null
          ? cue.recoverFrames
          : SquashStretch.DEFAULT_RECOVER_FRAMES;
    if (cue.scaleY != null) {
      squash.applyStretchY(cue.scaleY, recover);
    } else if (cue.scaleX != null) {
      squash.applyStretchX(cue.scaleX, recover);
    } else {
      return false;
    }
    return true;
  }

  private static slotIndexForStrip(entry: VernanAnimEntry, stripIndex: number): number {
    for (let i = 0; i < entry.slots.length; i++) {
      if (entry.slots[i]!.stripFrames.includes(stripIndex)) return i;
    }
    return Math.min(Math.max(0, stripIndex), entry.slots.length - 1);
  }

  private static applyBuiltinOnEnter(
    squash: SquashStretch,
    logicalKey: string,
    recoverOverride: number | null,
  ): void {
    switch (logicalKey) {
      case "crouch":
        squash.applyStretchY(
          VernanAnimCueRuntime.FALLBACK_CROUCH_SQUASH_Y,
          recoverOverride ?? VernanAnimCueRuntime.FALLBACK_CROUCH_SQUASH_RECOVER,
        );
        break;
      case "land":
        if (recoverOverride != null) {
          squash.applyStretchX(VernanAnimCueRuntime.FALLBACK_LAND_SQUASH_X, recoverOverride);
        } else {
          squash.applyStretchX(VernanAnimCueRuntime.FALLBACK_LAND_SQUASH_X);
        }
        break;
      default:
        break;
    }
  }

  private static applyBuiltinStripIndex(
    squash: SquashStretch,
    logicalKey: string,
    stripIndex: number,
  ): void {
    if (logicalKey === "jump" && stripIndex === 0) {
      squash.applyStretchY(
        VernanAnimCueRuntime.FALLBACK_JUMP_STRETCH_Y,
        VernanAnimCueRuntime.FALLBACK_JUMP_STRETCH_RECOVER,
      );
    }
  }
}
