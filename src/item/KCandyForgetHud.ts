/** Progressive HUD amnesia from k-candy (Java KCandyForgetHud). */
export enum KCandyForgetTarget {
  COINS,
  MAP,
  KEYS,
  HEARTS,
  COMBAT_STATS,
  PASSIVE_STRIP,
  WEAPON_SLOTS,
  TOUCH_CONTROLS,
  FULL_BLACKOUT,
}

const MAX_FADE = 3;
const FADE_ALPHA = [1.0, 0.62, 0.32, 0.0];

export class KCandyForgetHud {
  private readonly fadeLevel = new Array<number>(KCandyForgetTarget.FULL_BLACKOUT + 1).fill(0);
  private totalUsesCount = 0;

  reset(): void {
    this.fadeLevel.fill(0);
    this.totalUsesCount = 0;
  }

  totalUses(): number {
    return this.totalUsesCount;
  }

  fadeLevelOf(target: KCandyForgetTarget): number {
    return this.fadeLevel[target] ?? 0;
  }

  opacity(target: KCandyForgetTarget): number {
    if (target !== KCandyForgetTarget.FULL_BLACKOUT && this.isBlackout()) {
      return 0;
    }
    const lv = this.fadeLevel[target] ?? 0;
    return FADE_ALPHA[Math.min(MAX_FADE, Math.max(0, lv))]!;
  }

  isHidden(target: KCandyForgetTarget): boolean {
    return this.opacity(target) <= 0.01;
  }

  isBlackout(): boolean {
    return (this.fadeLevel[KCandyForgetTarget.FULL_BLACKOUT] ?? 0) >= 1;
  }

  warpIntensity(): number {
    let sum = 0;
    for (const lv of this.fadeLevel) sum += lv;
    const max = MAX_FADE * KCandyForgetTarget.FULL_BLACKOUT + 1;
    return Math.min(1, sum / max);
  }

  advanceForget(rng: { nextInt(bound: number): number }): void {
    this.totalUsesCount++;
    const candidates: KCandyForgetTarget[] = [];
    for (let t = 0; t <= KCandyForgetTarget.TOUCH_CONTROLS; t++) {
      const target = t as KCandyForgetTarget;
      if ((this.fadeLevel[target] ?? 0) < MAX_FADE) {
        candidates.push(target);
      }
    }
    if (candidates.length > 0) {
      const pick = candidates[rng.nextInt(candidates.length)]!;
      this.fadeLevel[pick] = (this.fadeLevel[pick] ?? 0) + 1;
    }
    this.maybeTriggerBlackout(rng);
  }

  private maybeTriggerBlackout(rng: { nextInt(bound: number): number }): void {
    if (this.isBlackout()) return;
    let fullyForgotten = 0;
    for (let t = 0; t <= KCandyForgetTarget.TOUCH_CONTROLS; t++) {
      if ((this.fadeLevel[t as KCandyForgetTarget] ?? 0) >= MAX_FADE) fullyForgotten++;
    }
    if (fullyForgotten >= 6 || (fullyForgotten >= 4 && rng.nextInt(3) === 0)) {
      this.fadeLevel[KCandyForgetTarget.FULL_BLACKOUT] = 1;
    }
  }
}
