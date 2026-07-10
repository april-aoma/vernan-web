/** Floating damage number spawned on successful player-sourced enemy hits while AUTISM is owned. */
export class AutismDamageFloater {
  static readonly LIFE_FRAMES = 50;
  private static readonly RISE_WORLD_PX = 10;
  private static readonly SIN_AMP_WORLD_PX = 3;
  private static readonly STACK_OFFSET_WORLD_PX = 3;

  readonly spawnAnchorX: number;
  private readonly anchorWorldX: number;
  private readonly anchorWorldY: number;
  readonly damageRaw: number;
  private readonly stackIndex: number;
  private readonly sinPhase: number;
  private framesAlive = 0;

  constructor(
    anchorWorldX: number,
    anchorWorldY: number,
    damageRaw: number,
    stackIndex: number,
    sinPhase: number,
  ) {
    this.spawnAnchorX = anchorWorldX;
    this.anchorWorldX = anchorWorldX;
    this.anchorWorldY = anchorWorldY;
    this.damageRaw = damageRaw;
    this.stackIndex = stackIndex;
    this.sinPhase = sinPhase;
  }

  worldX(): number {
    const t = this.motionT();
    const sinOff = Math.sin(t * Math.PI * 1.15 + this.sinPhase) * AutismDamageFloater.SIN_AMP_WORLD_PX;
    return this.anchorWorldX + sinOff + this.stackIndex * AutismDamageFloater.STACK_OFFSET_WORLD_PX;
  }

  worldY(): number {
    return this.anchorWorldY - this.motionT() * AutismDamageFloater.RISE_WORLD_PX;
  }

  alpha(): number {
    const t = this.framesAlive / AutismDamageFloater.LIFE_FRAMES;
    return Math.max(0, 1 - smoothstep(t));
  }

  private motionT(): number {
    return smoothstep(this.framesAlive / AutismDamageFloater.LIFE_FRAMES);
  }

  /** @returns true when finished and should be removed */
  tick(): boolean {
    this.framesAlive++;
    return this.framesAlive >= AutismDamageFloater.LIFE_FRAMES;
  }

  static tickAll(out: AutismDamageFloater[]): void {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i]!.tick()) out.splice(i, 1);
    }
  }
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
