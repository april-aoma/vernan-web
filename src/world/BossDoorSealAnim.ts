/** Pack tile coords like Java AutotileDraw.packCell. */
export function packCell(tx: number, ty: number): number {
  return ((ty & 0xffff) << 16) | (tx & 0xffff);
}

export type SealStep = { tx: number; ty: number };

/**
 * Staggered boss-exit door seal (Java BossDoorSealAnim).
 * Thin cut: seals logical cells; draw uses keyblock color (no sealed tile sheet yet).
 */
export class BossDoorSealAnim {
  static readonly STAGGER_FRAMES = 10;

  readonly roomId: number;
  private readonly steps: SealStep[];
  private nextStepIndex = 0;
  private framesUntilNext = 0;
  private finished = false;

  private constructor(roomId: number, steps: SealStep[]) {
    this.roomId = roomId;
    this.steps = steps;
  }

  isFinished(): boolean {
    return this.finished;
  }

  static begin(
    roomId: number,
    leftDoorTx: number,
    leftDoorTopY: number,
    rightDoorTx: number,
    rightDoorTopY: number,
  ): BossDoorSealAnim | null {
    const steps: SealStep[] = [];
    appendColumnSteps(steps, leftDoorTx, leftDoorTopY);
    appendColumnSteps(steps, rightDoorTx, rightDoorTopY);
    if (steps.length === 0) return null;
    return new BossDoorSealAnim(roomId, steps);
  }

  /**
   * Advances timeline; newly sealed cells are added to {@code sealedOut}.
   * @returns true when finished
   */
  tick(sealedOut: Set<number>): boolean {
    if (this.finished) return true;
    if (this.framesUntilNext > 0) {
      this.framesUntilNext--;
      if (this.framesUntilNext > 0) return false;
    }
    if (this.nextStepIndex >= this.steps.length) {
      this.finished = true;
      return true;
    }
    const s = this.steps[this.nextStepIndex]!;
    sealedOut.add(packCell(s.tx, s.ty));
    this.nextStepIndex++;
    if (this.nextStepIndex >= this.steps.length) {
      this.finished = true;
      return true;
    }
    this.framesUntilNext = BossDoorSealAnim.STAGGER_FRAMES;
    return false;
  }

  static isDoorColumnSealed(
    sealed: Set<number>,
    doorTx: number,
    leftDoorTx: number,
    leftDoorTopY: number,
    _rightDoorTx: number,
    rightDoorTopY: number,
  ): boolean {
    if (sealed.size === 0 || doorTx < 0) return false;
    const topY = doorTx === leftDoorTx ? leftDoorTopY : rightDoorTopY;
    if (topY < 0) return false;
    return sealed.has(packCell(doorTx, topY)) || sealed.has(packCell(doorTx, topY + 1));
  }
}

function appendColumnSteps(steps: SealStep[], doorX: number, doorTopY: number): void {
  if (doorX < 0 || doorTopY < 0) return;
  steps.push({ tx: doorX, ty: doorTopY });
  steps.push({ tx: doorX, ty: doorTopY + 1 });
}
