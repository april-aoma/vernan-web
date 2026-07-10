import type { KeyblockSealSpec } from "./KeyblockSealSpec";

/** Per-seal animated state; timeline -1 = locked. */
export class KeyblockSealRuntime {
  readonly spec: KeyblockSealSpec;
  readonly slotTileCleared: boolean[];
  /** -1 until unlocked; then advances each tick until animation completes. */
  timeline = -1;

  constructor(spec: KeyblockSealSpec) {
    this.spec = spec;
    this.slotTileCleared = new Array(spec.slots.length).fill(false);
  }
}
