import { TILE_SIZE } from "../specs";
import type { LilMiner } from "./LilMiner";
import type { LilPossessed } from "./LilPossessed";

export const LIL_TRAIL_SPACING = 9;
/** Minimum world gap between consecutive familiar slots (Java LIL_FAMILIAR_SLOT_SPACING). */
export const LIL_FAMILIAR_SLOT_SPACING = TILE_SIZE * 1.5;
/** Lead point sits slightly above Vernan's center (Java LIL_FOLLOW_LEAD_OFFSET_Y). */
export const LIL_FOLLOW_LEAD_OFFSET_Y = -18;

type TrailPoint = { x: number; y: number };

/**
 * Shared familiar follow trail (Java GamePanel familiar breadcrumb).
 * Slot i trails LIL_TRAIL_SPACING*(i+1) steps back; pickup order = list order.
 */
export class FamiliarTrailHost {
  private readonly trail: TrailPoint[] = [];
  /** Pickup order for trail slots (one entry per stack instance). */
  private readonly pickupOrder: Array<"LIL_POSSESSED" | "LIL_MINER"> = [];
  readonly lilPossessed: LilPossessed[] = [];
  readonly lilMiners: LilMiner[] = [];
  private prevAttacking = false;

  clearTrail(): void {
    this.trail.length = 0;
  }

  /** Drop familiars + trail for a full run restart. */
  clearAll(): void {
    this.trail.length = 0;
    this.pickupOrder.length = 0;
    this.lilPossessed.length = 0;
    this.lilMiners.length = 0;
    this.prevAttacking = false;
  }

  pushLead(playerCx: number, playerCy: number, facing: number): void {
    const facingSign = facing >= 0 ? 1 : -1;
    // One tile behind Vernan (opposite facing) and a bit above (Java updateFamiliars).
    const leadX = playerCx - facingSign * TILE_SIZE;
    const leadY = playerCy + LIL_FOLLOW_LEAD_OFFSET_Y;
    this.trail.unshift({ x: leadX, y: leadY });
    const total = this.pickupOrder.length;
    const maxTrail = LIL_TRAIL_SPACING * (total + 1) + 4;
    while (this.trail.length > maxTrail) this.trail.pop();
  }

  /**
   * Trail-lagged follow target for pickup-order slot. When the breadcrumb collapses
   * (standing still), enforces at least LIL_FAMILIAR_SLOT_SPACING behind the previous slot.
   */
  followPoint(slotIndex: number, facing: number, previousSlotPoint: TrailPoint | null): TrailPoint {
    if (this.trail.length === 0) {
      return previousSlotPoint ?? { x: 0, y: 0 };
    }
    const idx = Math.min(this.trail.length - 1, LIL_TRAIL_SPACING * (slotIndex + 1));
    const trailPt = this.trail[Math.max(0, idx)]!;
    if (slotIndex === 0 || previousSlotPoint == null) return trailPt;
    const facingSign = facing >= 0 ? 1 : -1;
    const behindDx = -facingSign;
    const trailBack = (trailPt.x - previousSlotPoint.x) * behindDx;
    if (trailBack >= LIL_FAMILIAR_SLOT_SPACING - 1e-6) return trailPt;
    return pointBehind(previousSlotPoint.x, previousSlotPoint.y, facingSign);
  }

  totalFamiliars(): number {
    return this.pickupOrder.length;
  }

  /** Sync list sizes to inventory stacks; returns newly created slots needing load/snap. */
  syncStacks(
    possessedStacks: number,
    minerStacks: number,
    spawnAt: { x: number; y: number },
    createPossessed: () => LilPossessed,
    createMiner: () => LilMiner,
  ): { newPossessed: LilPossessed[]; newMiners: LilMiner[] } {
    // Append missing pickup-order entries (Java syncFamiliarPickupOrder).
    let possessedInOrder = 0;
    let minerInOrder = 0;
    for (const id of this.pickupOrder) {
      if (id === "LIL_POSSESSED") possessedInOrder++;
      else minerInOrder++;
    }
    while (possessedInOrder < possessedStacks) {
      this.pickupOrder.push("LIL_POSSESSED");
      possessedInOrder++;
    }
    while (minerInOrder < minerStacks) {
      this.pickupOrder.push("LIL_MINER");
      minerInOrder++;
    }
    // Trim excess from the end (last picked removed first when stacks drop).
    while (possessedInOrder > possessedStacks || minerInOrder > minerStacks) {
      for (let i = this.pickupOrder.length - 1; i >= 0; i--) {
        const id = this.pickupOrder[i]!;
        if (id === "LIL_POSSESSED" && possessedInOrder > possessedStacks) {
          this.pickupOrder.splice(i, 1);
          possessedInOrder--;
          break;
        }
        if (id === "LIL_MINER" && minerInOrder > minerStacks) {
          this.pickupOrder.splice(i, 1);
          minerInOrder--;
          break;
        }
      }
    }

    const newPossessed: LilPossessed[] = [];
    const newMiners: LilMiner[] = [];
    const spawnY = spawnAt.y + LIL_FOLLOW_LEAD_OFFSET_Y;
    while (this.lilPossessed.length < possessedStacks) {
      const f = createPossessed();
      f.snapTo(spawnAt.x, spawnY);
      this.lilPossessed.push(f);
      newPossessed.push(f);
    }
    while (this.lilPossessed.length > possessedStacks) this.lilPossessed.pop();
    while (this.lilMiners.length < minerStacks) {
      const m = createMiner();
      m.snapTo(spawnAt.x, spawnY);
      this.lilMiners.push(m);
      newMiners.push(m);
    }
    while (this.lilMiners.length > minerStacks) this.lilMiners.pop();
    return { newPossessed, newMiners };
  }

  /**
   * Re-seat familiars on Vernan after a room change so they don't streak across the level
   * (Java snapFamiliarsToPlayer).
   */
  snapToPlayer(playerCx: number, playerCy: number, facing: number): void {
    const facingSign = facing >= 0 ? 1 : -1;
    let prevFp: TrailPoint | null = null;
    let possessedIdx = 0;
    let minerIdx = 0;
    for (let slot = 0; slot < this.pickupOrder.length; slot++) {
      const fp = this.snapPoint(slot, playerCx, playerCy, facingSign, prevFp);
      prevFp = fp;
      const id = this.pickupOrder[slot]!;
      if (id === "LIL_POSSESSED") {
        this.lilPossessed[possessedIdx++]?.snapTo(fp.x, fp.y);
      } else {
        this.lilMiners[minerIdx++]?.snapTo(fp.x, fp.y);
      }
    }
    this.trail.length = 0;
  }

  /** @deprecated use snapToPlayer — kept for callers that only have a single point */
  snapAll(px: number, py: number, facing = 1): void {
    this.snapToPlayer(px, py, facing);
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

  /** Iterate familiars in pickup-order slots with follow targets. */
  forEachSlot(
    facing: number,
    visit: (
      kind: "LIL_POSSESSED" | "LIL_MINER",
      instanceIndex: number,
      follow: TrailPoint,
    ) => void,
  ): void {
    let possessedIdx = 0;
    let minerIdx = 0;
    let prevFp: TrailPoint | null = null;
    for (let slot = 0; slot < this.pickupOrder.length; slot++) {
      const fp = this.followPoint(slot, facing, prevFp);
      prevFp = fp;
      const id = this.pickupOrder[slot]!;
      if (id === "LIL_POSSESSED") {
        visit(id, possessedIdx++, fp);
      } else {
        visit(id, minerIdx++, fp);
      }
    }
  }

  /** Flat slot order helper (possessed-then-miner) — prefer forEachSlot for Java parity. */
  slotFollowIndex(kind: "possessed" | "miner", indexInKind: number): number {
    if (kind === "possessed") return indexInKind;
    return this.lilPossessed.length + indexInKind;
  }

  private snapPoint(
    slotIndex: number,
    playerCx: number,
    playerCy: number,
    facingSign: number,
    previousSlotPoint: TrailPoint | null,
  ): TrailPoint {
    if (slotIndex === 0) {
      return {
        x: playerCx - facingSign * TILE_SIZE,
        y: playerCy + LIL_FOLLOW_LEAD_OFFSET_Y,
      };
    }
    return pointBehind(previousSlotPoint!.x, previousSlotPoint!.y, facingSign);
  }
}

function pointBehind(prevX: number, prevY: number, facingSign: number): TrailPoint {
  return { x: prevX - facingSign * LIL_FAMILIAR_SLOT_SPACING, y: prevY };
}
