import type { Aabb } from "../combat/CombatMath";
import { polygonBounds, polygonIntersectsAabb, worldPolygon } from "./polygonIntersect";

/**
 * Transformed hitbox query (Java game.collision.HitboxPose) — polygon parts only for web v1.
 */
export class HitboxPose {
  readonly local: ReadonlyArray<number>;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly facingSign: number;
  readonly pivotLocalX: number;
  readonly scaleLocalY: number;
  private cachedWorld: number[] | null = null;
  private cachedBounds: Aabb | null = null;

  constructor(
    local: ReadonlyArray<number>,
    anchorX: number,
    anchorY: number,
    facingSign: number,
    pivotLocalX: number,
    scaleLocalY = 1,
  ) {
    this.local = local;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.facingSign = facingSign >= 0 ? 1 : -1;
    this.pivotLocalX = pivotLocalX;
    this.scaleLocalY = scaleLocalY;
  }

  worldVertices(): number[] {
    if (!this.cachedWorld) {
      this.cachedWorld = worldPolygon(
        this.local,
        this.anchorX,
        this.anchorY,
        this.facingSign,
        this.pivotLocalX,
        this.scaleLocalY,
      );
    }
    return this.cachedWorld;
  }

  bounds(): Aabb {
    if (!this.cachedBounds) this.cachedBounds = polygonBounds(this.worldVertices());
    return this.cachedBounds;
  }

  intersectsRect(r: Aabb): boolean {
    return polygonIntersectsAabb(this.worldVertices(), r);
  }

  /** Max world Y of listed local vertices (feet probes for jump hull). */
  maxLocalYWorld(...localYs: number[]): number {
    let best = -Infinity;
    for (const ly of localYs) {
      best = Math.max(best, this.anchorY + ly * this.scaleLocalY);
    }
    return best;
  }
}
