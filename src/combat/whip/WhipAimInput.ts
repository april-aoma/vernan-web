import type { Input } from "../../input/Input";

type Cand = { seq: number; dx: number; dy: number };

/**
 * Resolves whip travel direction from UP/DOWN/LEFT/RIGHT (Java WhipAimInput).
 * Among keys currently held, the two most recently pressed win.
 */
export class WhipAimInput {
  private seqCounter = 0;
  private upSeq = 0;
  private downSeq = 0;
  private leftSeq = 0;
  private rightSeq = 0;

  reset(): void {
    this.seqCounter = 0;
    this.upSeq = 0;
    this.downSeq = 0;
    this.leftSeq = 0;
    this.rightSeq = 0;
  }

  /** Latch keys already held when a swing begins so diagonals work without a fresh press. */
  latchInitial(input: Input | null): void {
    if (!input) return;
    if (input.up) this.upSeq = ++this.seqCounter;
    if (input.down) this.downSeq = ++this.seqCounter;
    if (input.left) this.leftSeq = ++this.seqCounter;
    if (input.right) this.rightSeq = ++this.seqCounter;
  }

  sample(input: Input | null): void {
    if (!input) return;
    if (input.upPressed) this.upSeq = ++this.seqCounter;
    if (input.downPressed) this.downSeq = ++this.seqCounter;
    if (input.leftPressed) this.leftSeq = ++this.seqCounter;
    if (input.rightPressed) this.rightSeq = ++this.seqCounter;
  }

  /** Unit aim vector in world space. When nothing is held, defaults to facing-forward. */
  resolve(
    facing: number,
    upHeld: boolean,
    downHeld: boolean,
    leftHeld: boolean,
    rightHeld: boolean,
  ): [number, number] {
    const held: Cand[] = [];
    if (upHeld && this.upSeq > 0) held.push({ seq: this.upSeq, dx: 0, dy: -1 });
    if (downHeld && this.downSeq > 0) held.push({ seq: this.downSeq, dx: 0, dy: 1 });
    if (leftHeld && this.leftSeq > 0) held.push({ seq: this.leftSeq, dx: -1, dy: 0 });
    if (rightHeld && this.rightSeq > 0) held.push({ seq: this.rightSeq, dx: 1, dy: 0 });
    held.sort((a, b) => b.seq - a.seq);

    let dx = 0;
    let dy = 0;
    let picked = 0;
    for (const c of held) {
      if (picked >= 2) break;
      if (c.dx !== 0 && dx !== 0) continue;
      if (c.dy !== 0 && dy !== 0) continue;
      dx += c.dx;
      dy += c.dy;
      picked++;
    }

    if (dx === 0 && dy === 0) {
      return [facing >= 0 ? 1 : -1, 0];
    }
    const len = Math.hypot(dx, dy);
    return [dx / len, dy / len];
  }

  /** Simultaneous held directions for wiggle. Returns [0,0] when nothing held. */
  resolveHeldAxes(
    upHeld: boolean,
    downHeld: boolean,
    leftHeld: boolean,
    rightHeld: boolean,
  ): [number, number] {
    let dx = 0;
    let dy = 0;
    if (leftHeld) dx -= 1;
    if (rightHeld) dx += 1;
    if (upHeld) dy -= 1;
    if (downHeld) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [0, 0];
    return [dx / len, dy / len];
  }
}
