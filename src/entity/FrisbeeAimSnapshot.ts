import type { Input } from "../input/Input";

/**
 * Wind-up aim for FRISBEE: samples UP/DOWN/LEFT/RIGHT during subweapon frames 0–1.
 * Tap = press edge then release before spawn; hold = key down on spawn tick.
 * (Java FrisbeeAimSnapshot.)
 */
export type FrisbeeLaunchParams = {
  vx: number;
  vy: number;
  gravityMul: number;
  vyCap: number;
};

type Axis = {
  tap: boolean;
  hold: boolean;
  tapUsed: boolean;
  tapPending: boolean;
};

function freshAxis(): Axis {
  return { tap: false, hold: false, tapUsed: false, tapPending: false };
}

function resetAxis(a: Axis): void {
  a.tap = false;
  a.hold = false;
  a.tapUsed = false;
  a.tapPending = false;
}

function copyAxis(from: Axis, to: Axis): void {
  to.tap = from.tap;
  to.hold = from.hold;
  to.tapUsed = from.tapUsed;
  to.tapPending = from.tapPending;
}

function trackTap(pressed: boolean, down: boolean, axis: Axis): void {
  if (pressed && !axis.tapUsed && !axis.tapPending) {
    axis.tapPending = true;
  }
  if (axis.tapPending && !down && !axis.tapUsed) {
    axis.tap = true;
    axis.tapUsed = true;
    axis.tapPending = false;
  }
}

function finalizeHold(down: boolean, axis: Axis): void {
  if (axis.tapPending) {
    axis.tapPending = false;
  }
  if (down) {
    axis.hold = true;
  }
}

const BASE_VX = 108;
const BASE_VY = -55;
const DEFAULT_GRAVITY_MUL = 0.35;
const DEFAULT_VY_CAP = 2400;
const VX_SPEED_MULT_FLOOR = 0.1;

export class FrisbeeAimSnapshot {
  private readonly up = freshAxis();
  private readonly down = freshAxis();
  private readonly left = freshAxis();
  private readonly right = freshAxis();

  reset(): void {
    resetAxis(this.up);
    resetAxis(this.down);
    resetAxis(this.left);
    resetAxis(this.right);
  }

  /** Call every sim tick while frisbee wind-up frames 0–1 are active. */
  sampleTapWindup(input: Input): void {
    trackTap(input.upPressed, input.up, this.up);
    trackTap(input.downPressed, input.down, this.down);
    trackTap(input.leftPressed, input.left, this.left);
    trackTap(input.rightPressed, input.right, this.right);
  }

  /** Call once on the spawn tick before resolving launch velocity. */
  finalizeHoldAtSpawn(input: Input): void {
    finalizeHold(input.up, this.up);
    finalizeHold(input.down, this.down);
    finalizeHold(input.left, this.left);
    finalizeHold(input.right, this.right);
  }

  frozenCopy(): FrisbeeAimSnapshot {
    const copy = new FrisbeeAimSnapshot();
    copyAxis(this.up, copy.up);
    copyAxis(this.down, copy.down);
    copyAxis(this.left, copy.left);
    copyAxis(this.right, copy.right);
    return copy;
  }

  resolve(facingSign: number): FrisbeeLaunchParams {
    const fs = facingSign >= 0 ? 1 : -1;
    let vx = fs * BASE_VX;
    let vy = BASE_VY;

    if (this.up.tap) vy -= 30;
    if (this.down.hold) vy += 30;
    if (this.down.tap) vy *= -1;

    const fwdTap = fs > 0 ? this.right.tap : this.left.tap;
    const fwdHold = fs > 0 ? this.right.hold : this.left.hold;
    const bwdTap = fs > 0 ? this.left.tap : this.right.tap;
    const bwdHold = fs > 0 ? this.left.hold : this.right.hold;

    let mult = 1;
    if (fwdTap) mult += 0.4;
    if (fwdHold) mult += 0.2;
    if (bwdHold) mult -= 0.5;
    mult = Math.max(VX_SPEED_MULT_FLOOR, mult);
    vx *= mult;

    if (bwdTap) {
      const tmp = vx;
      vx = vy;
      vy = tmp;
    }

    let gravityMul = DEFAULT_GRAVITY_MUL;
    let vyCap = DEFAULT_VY_CAP;
    if (this.up.hold) {
      gravityMul *= 0.5;
      vyCap *= 2;
    }
    if (bwdHold) {
      vyCap *= 2;
    }

    return { vx, vy, gravityMul, vyCap };
  }
}
