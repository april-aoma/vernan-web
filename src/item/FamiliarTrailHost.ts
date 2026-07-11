import type { LilMiner } from "./LilMiner";
import type { LilPossessed } from "./LilPossessed";

export const LIL_TRAIL_SPACING = 9;
export const LIL_LEAD_OFFSET_X = -10;

type TrailPoint = { x: number; y: number };

/**
 * Shared familiar follow trail (Java GamePanel familiar breadcrumb).
 * Slot i trails LIL_TRAIL_SPACING*(i+1) steps back; pickup order = list order.
 */
export class FamiliarTrailHost {
  private readonly trail: TrailPoint[] = [];
  readonly lilPossessed: LilPossessed[] = [];
  readonly lilMiners: LilMiner[] = [];
  private prevAttacking = false;

  pushLead(playerCx: number, playerCy: number, facing: number): void {
    const leadX = playerCx + (facing >= 0 ? LIL_LEAD_OFFSET_X : -LIL_LEAD_OFFSET_X);
    this.trail.unshift({ x: leadX, y: playerCy });
    const total = this.lilPossessed.length + this.lilMiners.length;
    const maxTrail = LIL_TRAIL_SPACING * (total + 1) + 4;
    while (this.trail.length > maxTrail) this.trail.pop();
  }

  followPoint(slotIndex: number): TrailPoint {
    if (this.trail.length === 0) return { x: 0, y: 0 };
    const idx = Math.min(this.trail.length - 1, LIL_TRAIL_SPACING * (slotIndex + 1));
    return this.trail[idx]!;
  }

  totalFamiliars(): number {
    return this.lilPossessed.length + this.lilMiners.length;
  }

  /** Sync list sizes to inventory stacks; returns newly created slots needing load/snap. */
  syncStacks(
    possessedStacks: number,
    minerStacks: number,
    spawnAt: { x: number; y: number },
    createPossessed: () => LilPossessed,
    createMiner: () => LilMiner,
  ): { newPossessed: LilPossessed[]; newMiners: LilMiner[] } {
    const newPossessed: LilPossessed[] = [];
    const newMiners: LilMiner[] = [];
    while (this.lilPossessed.length < possessedStacks) {
      const f = createPossessed();
      f.snapTo(spawnAt.x, spawnAt.y);
      this.lilPossessed.push(f);
      newPossessed.push(f);
    }
    while (this.lilPossessed.length > possessedStacks) this.lilPossessed.pop();
    while (this.lilMiners.length < minerStacks) {
      const m = createMiner();
      m.snapTo(spawnAt.x, spawnAt.y);
      this.lilMiners.push(m);
      newMiners.push(m);
    }
    while (this.lilMiners.length > minerStacks) this.lilMiners.pop();
    return { newPossessed, newMiners };
  }

  snapAll(px: number, py: number): void {
    for (const f of this.lilPossessed) f.snapTo(px, py);
    for (const m of this.lilMiners) m.snapTo(px, py);
    this.trail.length = 0;
  }

  notifyRoomCleared(): void {
    for (const m of this.lilMiners) m.onRoomCleared();
  }

  /** Rising edge of Vernan attacking (for Lil Possessed fire). */
  consumeAttackFireEdge(isAttacking: boolean): boolean {
    const edge = isAttacking && !this.prevAttacking;
    this.prevAttacking = isAttacking;
    return edge;
  }

  /** Flat slot order: all lil possessed first (pickup order), then miners. */
  slotFollowIndex(kind: "possessed" | "miner", indexInKind: number): number {
    if (kind === "possessed") return indexInKind;
    return this.lilPossessed.length + indexInKind;
  }
}
