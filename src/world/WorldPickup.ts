import { GRAVITY } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { Aabb } from "../combat/CombatMath";
import { HitboxPose } from "../collision/HitboxPose";
import { polygonIntersectsPolygon } from "../collision/polygonIntersect";
import {
  pickup,
  pickupPhysics,
  pickupPhysicsPivotX,
  pickupPivotX,
} from "../config/HitboxValues";
import {
  backstepPositionUntilClear,
  overlapsAnySolidTile,
  PICKUP_BACKSTEP_MAX_ITER,
} from "../physics/SolidOverlap";
import type { TileMap } from "./TileMap";
import { PickupKind } from "./BreakableLootRoll";
import { pickupPhysicsPoseAt, pickupPhysicsRenderCenter } from "./PickupPhysics";

export { PickupKind };

const MAX_DOWN = 320;
const FLOOR_FRICTION_PER_SEC = 54;
const BOUNCE_RESTITUTION = 0.25;
const CONTACT_PROBE_PX = 2;

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
  /** Shop inventory price; >0 skips auto-collect (Java WorldPickup.priceCoins). */
  priceCoins = 0;

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

  /** Shop heart/key: stationary, priced (Java WorldPickup.createShopPickup). */
  static createShopPickup(
    kind: PickupKind,
    feetCenterX: number,
    feetY: number,
    priceCoins: number,
  ): WorldPickup {
    const p = WorldPickup.createFromDeferred(kind, feetCenterX, feetY);
    p.priceCoins = Math.max(0, priceCoins);
    return p;
  }

  /** Room-clear reward pop (Java WorldPickup.create ROOM_CLEAR arc). */
  static createFromRoomClear(
    kind: PickupKind,
    feetCenterX: number,
    feetY: number,
    rnd: () => number,
  ): WorldPickup {
    const b0 = physicsBoundsAtOrigin(kind);
    return new WorldPickup(
      kind,
      feetCenterX - b0.w * 0.5 - b0.x,
      feetY - b0.h - b0.y,
      (rnd() - 0.5) * 140,
      -100 - rnd() * 55,
    );
  }

  /** Collection hit (Java hitboxPose — unrotated). */
  hitboxPose(): HitboxPose {
    return new HitboxPose(pickup(this.kind), this.x, this.y, 1, pickupPivotX(this.kind));
  }

  /** Tile collision hull (Java physicsHitboxPose / pickupPhysics). */
  physicsHitboxPose(): HitboxPose {
    return pickupPhysicsPoseAt(this.kind, this.x, this.y, this.angle);
  }

  private physicsPoseAt(ax: number, ay: number): HitboxPose {
    return pickupPhysicsPoseAt(this.kind, ax, ay, this.angle);
  }

  /** Visual / collect center (mid of physics hull — Java renderCenter). */
  renderCenterX(): number {
    return pickupPhysicsRenderCenter(this.kind, this.x, this.y).x;
  }

  renderCenterY(): number {
    return pickupPhysicsRenderCenter(this.kind, this.x, this.y).y;
  }

  /** Collection AABB (Java pickup hit slot). */
  hitbox(): Aabb {
    return this.hitboxPose().bounds();
  }

  update(dt: number, map: TileMap): void {
    this.ageSec += dt;
    this.animTime += dt;
    // Priced shop inventory sits still (Java staticNoPhysics).
    if (this.priceCoins > 0) return;
    this.angle += this.omega * dt;
    this.vy = Math.min(MAX_DOWN, this.vy + GRAVITY * dt);

    const prevX = this.x;
    const prevY = this.y;
    const tryX = prevX + this.vx * dt;
    const tryY = prevY + this.vy * dt;
    const poseAt = (ax: number, ay: number) => this.physicsPoseAt(ax, ay);

    if (overlapsAnySolidTile(map, poseAt(tryX, tryY))) {
      const cleared = backstepPositionUntilClear(
        map,
        prevX,
        prevY,
        tryX,
        tryY,
        poseAt,
        PICKUP_BACKSTEP_MAX_ITER,
      );
      this.x = cleared.x;
      this.y = cleared.y;

      const ddx = tryX - prevX;
      const ddy = tryY - prevY;
      const moveLen = Math.hypot(ddx, ddy);
      if (moveLen > 1e-6) {
        const dirx = ddx / moveLen;
        const diry = ddy / moveLen;
        const probe = poseAt(this.x + dirx * CONTACT_PROBE_PX, this.y + diry * CONTACT_PROBE_PX);
        const n = contactNormalSolidTowardPose(map, probe);
        if (n) {
          const vDotN = this.vx * n.x + this.vy * n.y;
          if (vDotN < 0) {
            const impulse = (1 + BOUNCE_RESTITUTION) * vDotN;
            this.vx -= impulse * n.x;
            this.vy -= impulse * n.y;
          }
        }
      }
    } else {
      this.x = tryX;
      this.y = tryY;
    }

    this.resolveFloor(map, dt);
  }

  private resolveFloor(map: TileMap, dt: number): void {
    const footY = this.currentFootY();
    const feetTx = Math.floor((this.renderCenterX()) / TILE_SIZE);
    const feetTy = Math.floor(footY / TILE_SIZE);
    if (map.isSolidTile(feetTx, feetTy) || map.isPlatformTile(feetTx, feetTy)) {
      const floorY = feetTy * TILE_SIZE;
      if (footY > floorY && this.vy >= 0) {
        this.y += floorY - footY;
        this.vy = -this.vy * BOUNCE_RESTITUTION;
        if (Math.abs(this.vy) < 20) this.vy = 0;
        this.vx *= Math.exp(-FLOOR_FRICTION_PER_SEC * dt);
      }
    }
  }

  private currentFootY(): number {
    const pose = this.physicsHitboxPose();
    const verts = pose.worldVertices();
    let maxY = -Infinity;
    for (let i = 1; i < verts.length; i += 2) {
      maxY = Math.max(maxY, verts[i]!);
    }
    return maxY;
  }

  /** True when collection polygon overlaps player hurt polygon. */
  intersectsPlayerHurt(hurtPose: HitboxPose): boolean {
    return polygonIntersectsPolygon(
      this.hitboxPose().worldVertices(),
      hurtPose.worldVertices(),
    );
  }
}

function physicsBoundsAtOrigin(kind: PickupKind): Aabb {
  return new HitboxPose(pickupPhysics(kind), 0, 0, 1, pickupPhysicsPivotX(kind)).bounds();
}

function contactNormalSolidTowardPose(
  map: TileMap,
  pose: HitboxPose,
): { x: number; y: number } | null {
  const b = pose.bounds();
  const cx = b.x + b.w * 0.5;
  const cy = b.y + b.h * 0.5;
  const x0 = Math.floor(b.x / TILE_SIZE);
  const y0 = Math.floor(b.y / TILE_SIZE);
  const x1 = Math.floor((b.x + b.w - 1e-6) / TILE_SIZE);
  const y1 = Math.floor((b.y + b.h - 1e-6) / TILE_SIZE);
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!map.isSolidTile(tx, ty)) continue;
      const tile = { x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
      if (!pose.intersectsRect(tile)) continue;
      const tcx = tile.x + TILE_SIZE * 0.5;
      const tcy = tile.y + TILE_SIZE * 0.5;
      const dx = cx - tcx;
      const dy = cy - tcy;
      const len = Math.hypot(dx, dy);
      if (len > 1e-8) {
        sx += dx / len;
        sy += dy / len;
        count++;
      }
    }
  }
  if (count === 0) return null;
  const len = Math.hypot(sx, sy);
  if (len < 1e-8) return { x: 0, y: -1 };
  return { x: sx / len, y: sy / len };
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
