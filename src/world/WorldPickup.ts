import {
  GRAVITY,
  integratePickupAngular,
  pickupOnStandableFloor,
  randomPickupSpinRadPerSec,
  spawnSquashMul,
  PICKUP_COLLISION_SPIN_GATE_REF_PX_PER_SEC,
  PICKUP_OMEGA_MAX_RAD_PER_SEC,
  PICKUP_OMEGA_SNAP_REST_RAD_PER_SEC,
  PICKUP_REST_ANGULAR_SLEEP_PER_SEC,
  PICKUP_REST_MAX_TRANSLATION_FOR_SPIN_SLEEP,
  type PickupSquishProfile,
} from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { Aabb } from "../combat/CombatMath";
import { HitboxPose } from "../collision/HitboxPose";
import {
  pickup,
  pickupPhysics,
  pickupPhysicsPivotX,
  pickupPivotX,
} from "../config/HitboxValues";
import { SquashStretch } from "../render/SquashStretch";
import {
  axisSnapContactNormalIfDiagonal,
  backstepPositionUntilClear,
  contactNormalSolidTowardPose,
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
/** Couples tangential impact into spin (Java WorldPickup.BOUNCE_OMEGA_COUPLE). */
const BOUNCE_OMEGA_COUPLE = 0.02;
const LAND_SQUASH_MIN_VY = 70;
const LAND_SQUASH_X = 1.2;
const LAND_SQUASH_RECOVER_FRAMES = 20;

/** Java WorldPickup.SpawnStyle. */
export type PickupSpawnStyle = "BREAKABLE" | "ROOM_CLEAR";

/**
 * World collectible: hearts, keys, coins — gravity, tile collision, spin, squash.
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
  /** Seconds since spawn (Java spawnAge) — drives spawn squash. */
  spawnAge = 0;
  /** Shop inventory price; >0 skips auto-collect (Java WorldPickup.priceCoins). */
  priceCoins = 0;
  /** Shop hearts/keys: drawn/collectible but do not simulate physics. */
  private staticNoPhysics = false;
  /**
   * Foot Y at end of previous update — floor snap only when foot crosses surface
   * (prevents yanking onto wall tops).
   */
  private prevFootY = Number.POSITIVE_INFINITY;
  private readonly renderSquashStretch = new SquashStretch();

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
    return finishCreate(
      kind,
      centerX - b0.w * 0.5 - b0.x,
      centerY - b0.h * 0.5 - b0.y,
      "BREAKABLE",
      rnd,
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
    p.staticNoPhysics = true;
    p.vx = 0;
    p.vy = 0;
    p.omega = 0;
    p.angle = 0;
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
    return finishCreate(
      kind,
      feetCenterX - b0.w * 0.5 - b0.x,
      feetY - b0.h - b0.y,
      "ROOM_CLEAR",
      rnd,
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

  renderSquashScaleX(): number {
    return this.renderSquashStretch.scaleX();
  }

  renderSquashScaleY(): number {
    return this.renderSquashStretch.scaleY();
  }

  /** Spawn × landing draw deform (Java drawOneWorldPickup). */
  drawDeform(): { w: number; h: number } {
    const spawn = spawnSquashMul(this.spawnAge, squishProfileFor(this.kind));
    return {
      w: spawn.w * this.renderSquashScaleX(),
      h: spawn.h * this.renderSquashScaleY(),
    };
  }

  /** Collection AABB (Java pickup hit slot). */
  hitbox(): Aabb {
    return this.hitboxPose().bounds();
  }

  update(dt: number, map: TileMap): void {
    this.spawnAge += dt;
    this.animTime += dt;

    if (this.staticNoPhysics) {
      // Still tick animTime/spawnAge (spawn squash on shop hearts) but do not move.
      return;
    }

    this.renderSquashStretch.tick(dt);

    this.omega = integratePickupAngular(this.omega, dt);
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
        let n = contactNormalSolidTowardPose(
          map,
          poseAt(this.x + dirx * CONTACT_PROBE_PX, this.y + diry * CONTACT_PROBE_PX),
        );
        if (!n) {
          n = contactNormalSolidTowardPose(
            map,
            poseAt(this.x + dirx * CONTACT_PROBE_PX * 3, this.y + diry * CONTACT_PROBE_PX * 3),
          );
        }
        n = axisSnapContactNormalIfDiagonal(n);
        if (n) {
          const vx0 = this.vx;
          const vy0 = this.vy;
          const vDotN = vx0 * n.x + vy0 * n.y;
          if (vDotN < 0) {
            const impulse = (1 + BOUNCE_RESTITUTION) * vDotN;
            this.vx -= impulse * n.x;
            this.vy -= impulse * n.y;
          }
          const tx = -n.y;
          const ty = n.x;
          const tangential = vx0 * tx + vy0 * ty;
          const preSpeed = Math.hypot(vx0, vy0);
          let spinInject = BOUNCE_OMEGA_COUPLE * tangential;
          const ref = PICKUP_COLLISION_SPIN_GATE_REF_PX_PER_SEC;
          if (preSpeed < ref) {
            const g = preSpeed / ref;
            spinInject *= g * g;
          }
          this.omega = Math.max(
            -PICKUP_OMEGA_MAX_RAD_PER_SEC,
            Math.min(PICKUP_OMEGA_MAX_RAD_PER_SEC, this.omega + spinInject),
          );
          if (vy0 > LAND_SQUASH_MIN_VY && n.y < -0.45) {
            this.applyLandingSquash();
          }
        }
      }
    } else {
      this.x = tryX;
      this.y = tryY;
    }

    this.resolveVerticalAndFloor(map);

    const onFloor = this.isOnStandableFloor(map);
    if (onFloor) {
      this.vx *= Math.exp(-FLOOR_FRICTION_PER_SEC * dt);
      if (Math.abs(this.vx) < 2.5) this.vx = 0;
    }

    if (onFloor && Math.hypot(this.vx, this.vy) < PICKUP_REST_MAX_TRANSLATION_FOR_SPIN_SLEEP) {
      this.omega *= Math.exp(-PICKUP_REST_ANGULAR_SLEEP_PER_SEC * dt);
      if (Math.abs(this.omega) < PICKUP_OMEGA_SNAP_REST_RAD_PER_SEC) this.omega = 0;
    }

    this.prevFootY = this.currentFootY();
  }

  private applyLandingSquash(): void {
    this.renderSquashStretch.applyStretchX(LAND_SQUASH_X, LAND_SQUASH_RECOVER_FRAMES);
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

  private isOnStandableFloor(map: TileMap): boolean {
    if (this.vy > 0.75) return false;
    const foot = this.currentFootY();
    return pickupOnStandableFloor(map, this.renderCenterX(), foot, this.vy, TILE_SIZE);
  }

  private resolveVerticalAndFloor(map: TileMap): void {
    const foot = this.currentFootY();
    const footX = this.renderCenterX();
    const tyFoot = Math.floor(foot / TILE_SIZE);
    const txFoot = Math.floor(footX / TILE_SIZE);

    if (this.vy >= 0 && map.isStandableFloorTile(txFoot, tyFoot)) {
      const surfaceY = tyFoot * TILE_SIZE;
      // Only snap when the foot crossed the surface this frame.
      if (this.prevFootY <= surfaceY + 1e-3 && foot >= surfaceY - 1e-2) {
        if (this.vy > LAND_SQUASH_MIN_VY) {
          this.applyLandingSquash();
        }
        this.y += surfaceY - 1e-3 - foot;
        this.vy = 0;
      }
    }
  }

  /** True when collection polygon overlaps player body hitbox (Java hitboxPose ∩ player.hitboxPose). */
  intersectsPlayerHit(playerHit: HitboxPose): boolean {
    return this.hitboxPose().intersects(playerHit);
  }
}

function finishCreate(
  kind: PickupKind,
  anchorX: number,
  anchorY: number,
  style: PickupSpawnStyle,
  rnd: () => number,
): WorldPickup {
  const p = new WorldPickup(kind, anchorX, anchorY, 0, 0);
  p.spawnAge = 0;
  p.angle = 0;
  p.omega = randomPickupSpinRadPerSec(style, rnd);
  if (style === "ROOM_CLEAR") {
    p.vy = -100 - rnd() * 55;
    p.vx = (rnd() - 0.5) * 140;
  } else {
    p.vy = -38 - rnd() * 28;
    p.vx = (rnd() - 0.5) * 100;
  }
  return p;
}

function physicsBoundsAtOrigin(kind: PickupKind): Aabb {
  return new HitboxPose(pickupPhysics(kind), 0, 0, 1, pickupPhysicsPivotX(kind)).bounds();
}

function squishProfileFor(kind: PickupKind): PickupSquishProfile {
  return kind === PickupKind.HEART ? "HEART" : "KEY_OR_COIN";
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
