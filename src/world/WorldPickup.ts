import { GRAVITY } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { Aabb } from "../combat/CombatMath";
import { HitboxPose } from "../collision/HitboxPose";
import {
  pickup,
  pickupPhysics,
  pickupPhysicsPivotX,
  pickupPivotX,
} from "../config/HitboxValues";
import type { TileMap } from "./TileMap";
import { PickupKind } from "./BreakableLootRoll";

export { PickupKind };

/**
 * Thin world collectible (Java WorldPickup subset).
 * Anchors are HitboxPose feet-space (Java WorldPickup.x/y); sprites draw from physics bounds center.
 */
export class WorldPickup {
  readonly kind: PickupKind;
  /** HitboxPose anchor X (Java WorldPickup.x). */
  x: number;
  /** HitboxPose anchor Y (Java WorldPickup.y). */
  y: number;
  vx: number;
  vy: number;
  angle = 0;
  omega = 0;
  /** Animation timer (Java animTime) — heart strip at 12 FPS. */
  animTime = 0;
  ageSec = 0;

  constructor(kind: PickupKind, anchorX: number, anchorY: number, vx: number, vy: number) {
    this.kind = kind;
    this.x = anchorX;
    this.y = anchorY;
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
    const b0 = physicsBoundsAtOrigin(kind);
    return new WorldPickup(
      kind,
      centerX - b0.w * 0.5 - b0.x,
      centerY - b0.h * 0.5 - b0.y,
      (rnd() - 0.5) * 100,
      -38 - rnd() * 28,
    );
  }

  /** Spawn deferred secret-room floor loot (resting on play floor; no pop). */
  static createFromDeferred(kind: PickupKind, feetCenterX: number, feetY: number): WorldPickup {
    const b0 = physicsBoundsAtOrigin(kind);
    return new WorldPickup(
      kind,
      feetCenterX - b0.w * 0.5 - b0.x,
      feetY - b0.h - b0.y,
      0,
      0,
    );
  }

  hitboxPose(): HitboxPose {
    return new HitboxPose(pickup(this.kind), this.x, this.y, 1, pickupPivotX(this.kind));
  }

  physicsHitboxPose(): HitboxPose {
    return new HitboxPose(
      pickupPhysics(this.kind),
      this.x,
      this.y,
      1,
      pickupPhysicsPivotX(this.kind),
    );
  }

  /** Visual / collect center (mid of physics hull — Java renderCenter). */
  renderCenterX(): number {
    const b = this.physicsHitboxPose().bounds();
    return b.x + b.w * 0.5;
  }

  renderCenterY(): number {
    const b = this.physicsHitboxPose().bounds();
    return b.y + b.h * 0.5;
  }

  /** Collection AABB (Java pickup hit slot). */
  hitbox(): Aabb {
    return this.hitboxPose().bounds();
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
    const phys = this.physicsHitboxPose().bounds();
    const feetX = phys.x + phys.w * 0.5;
    const feetY = phys.y + phys.h;
    const feetTx = Math.floor(feetX / TILE_SIZE);
    const feetTy = Math.floor(feetY / TILE_SIZE);
    if (map.isSolidTile(feetTx, feetTy) || map.isPlatformTile(feetTx, feetTy)) {
      const floorY = feetTy * TILE_SIZE;
      if (feetY > floorY && this.vy >= 0) {
        this.y += floorY - feetY;
        this.vy = -this.vy * 0.25;
        if (Math.abs(this.vy) < 20) this.vy = 0;
        this.vx *= Math.exp(-54 * dt);
      }
    }
    const body = this.physicsHitboxPose().bounds();
    const midX = body.x + body.w * 0.5;
    const midY = body.y + body.h * 0.5;
    const bodyTx = Math.floor(midX / TILE_SIZE);
    const bodyTy = Math.floor(midY / TILE_SIZE);
    if (this.vx < 0 && map.isSolidTile(bodyTx, bodyTy)) {
      const wallRight = (bodyTx + 1) * TILE_SIZE + 1;
      this.x += wallRight - body.x;
      this.vx = -this.vx * 0.25;
    } else if (this.vx > 0 && map.isSolidTile(bodyTx, bodyTy)) {
      const wallLeft = bodyTx * TILE_SIZE - 1;
      this.x += wallLeft - (body.x + body.w);
      this.vx = -this.vx * 0.25;
    }
  }
}

function physicsBoundsAtOrigin(kind: PickupKind): Aabb {
  return new HitboxPose(pickupPhysics(kind), 0, 0, 1, pickupPhysicsPivotX(kind)).bounds();
}

/** Native world-px sprite size (Java sheet cells) — draw sizing only. */
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
