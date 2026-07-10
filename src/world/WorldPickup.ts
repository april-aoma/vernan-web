import { GRAVITY } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { Aabb } from "../combat/CombatMath";
import type { TileMap } from "./TileMap";
import { PickupKind } from "./BreakableLootRoll";

export { PickupKind };

/**
 * Thin world collectible (Java WorldPickup subset).
 * Anchors are feet-center X / feet Y; sprites draw at native size around render center.
 */
export class WorldPickup {
  readonly kind: PickupKind;
  /** Feet-center X (Java WorldPickup.x after createFromCenter). */
  x: number;
  /** Feet Y. */
  y: number;
  vx: number;
  vy: number;
  angle = 0;
  omega = 0;
  /** Animation timer (Java animTime) — heart strip at 12 FPS. */
  animTime = 0;
  ageSec = 0;

  constructor(kind: PickupKind, feetCenterX: number, feetY: number, vx: number, vy: number) {
    this.kind = kind;
    this.x = feetCenterX;
    this.y = feetY;
    this.vx = vx;
    this.vy = vy;
  }

  /** Spawn from breakable cell center (Java createFromCenter BREAKABLE). */
  static createFromBreakable(
    kind: PickupKind,
    centerX: number,
    centerY: number,
    rnd: () => number,
  ): WorldPickup {
    const { h } = pickupSpriteSize(kind);
    // Feet under the sprite; center of cell ≈ visual center.
    return new WorldPickup(
      kind,
      centerX,
      centerY + h * 0.5,
      (rnd() - 0.5) * 100,
      -38 - rnd() * 28,
    );
  }

  /** Visual / collect center (mid of sprite). */
  renderCenterX(): number {
    return this.x;
  }

  renderCenterY(): number {
    const { h } = pickupSpriteSize(this.kind);
    return this.y - h * 0.5;
  }

  /** Collection AABB matching sprite footprint (Java pickup hit slot ≈ sprite). */
  hitbox(): Aabb {
    const { w, h } = pickupSpriteSize(this.kind);
    return {
      x: this.renderCenterX() - w * 0.5,
      y: this.renderCenterY() - h * 0.5,
      w,
      h,
    };
  }

  update(dt: number, map: TileMap): void {
    this.ageSec += dt;
    this.animTime += dt;
    this.vy = Math.min(320, this.vy + GRAVITY * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.omega * dt;
    this.resolveFloor(map, dt);
  }

  private resolveFloor(map: TileMap, dt: number): void {
    const feetTx = Math.floor(this.x / TILE_SIZE);
    const feetTy = Math.floor(this.y / TILE_SIZE);
    if (map.isSolidTile(feetTx, feetTy) || map.isPlatformTile(feetTx, feetTy)) {
      const floorY = feetTy * TILE_SIZE;
      if (this.y > floorY && this.vy >= 0) {
        this.y = floorY;
        this.vy = -this.vy * 0.25;
        if (Math.abs(this.vy) < 20) this.vy = 0;
        this.vx *= Math.exp(-54 * dt);
      }
    }
    const { h } = pickupSpriteSize(this.kind);
    const bodyTx = Math.floor(this.x / TILE_SIZE);
    const bodyTy = Math.floor((this.y - h * 0.5) / TILE_SIZE);
    if (this.vx < 0 && map.isSolidTile(bodyTx, bodyTy)) {
      this.x = (bodyTx + 1) * TILE_SIZE + 1;
      this.vx = -this.vx * 0.25;
    } else if (this.vx > 0 && map.isSolidTile(bodyTx, bodyTy)) {
      this.x = bodyTx * TILE_SIZE - 1;
      this.vx = -this.vx * 0.25;
    }
  }
}

/** Native world-px sprite size (Java sheet cells). */
export function pickupSpriteSize(kind: PickupKind): { w: number; h: number } {
  switch (kind) {
    case PickupKind.HEART:
      return { w: 16, h: 16 };
    case PickupKind.KEY:
      return { w: 16, h: 16 };
    case PickupKind.COIN_1:
    case PickupKind.COIN_5:
    case PickupKind.COIN_10:
      return { w: 8, h: 8 };
  }
}

/** Heart strip: 8 frames @ 12 FPS (Java drawOneWorldPickup). */
export function heartPickupFrameIndex(animTime: number): number {
  return Math.floor(animTime * 12) & 7;
}

export function coinValue(kind: PickupKind): number {
  switch (kind) {
    case PickupKind.COIN_1:
      return 1;
    case PickupKind.COIN_5:
      return 5;
    case PickupKind.COIN_10:
      return 10;
    default:
      return 0;
  }
}

export function pickupSpriteFile(kind: PickupKind): string {
  switch (kind) {
    case PickupKind.HEART:
      return "heart.png";
    case PickupKind.KEY:
      return "key.png";
    case PickupKind.COIN_1:
      return "coin 1.png";
    case PickupKind.COIN_5:
      return "coin 5.png";
    case PickupKind.COIN_10:
      return "coin 10.png";
  }
}
